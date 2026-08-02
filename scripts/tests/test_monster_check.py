"""
Tests for scripts/monster_check.py.

Everything here is mocked: no real subprocess call beyond what's explicitly
under test, no real network/API call, no DEEPSEEK_API_KEY required. Sockets
are disabled repo-wide via pytest-socket (pyproject.toml's --disable-socket)
as a hard backstop — an incompletely-mocked test fails loudly here instead of
silently making a real, billed DeepSeek call.
"""

from __future__ import annotations

import re
import subprocess
import sys
from collections.abc import Callable, Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any, NoReturn

import monster_check as mc
import pytest

# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #


def _raise_oserror_for(monkeypatch: pytest.MonkeyPatch, target_name: str) -> None:
    """Patch Path.read_text so only the file named `target_name` raises OSError —
    exercises the `except OSError: pass/continue` guard in each scan without
    relying on real filesystem permission quirks (which don't reproduce
    reliably as root or across OSes)."""
    real_read_text = Path.read_text

    def fake_read_text(self: Path, *a: Any, **kw: Any) -> str:
        if self.name == target_name:
            raise OSError("simulated unreadable file")
        return real_read_text(self, *a, **kw)

    monkeypatch.setattr(Path, "read_text", fake_read_text)


def _mkrepo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    return tmp_path


# --------------------------------------------------------------------------- #
# supports_color
# --------------------------------------------------------------------------- #


def test_supports_color_no_color_env_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NO_COLOR", "1")
    assert mc.supports_color() is False


def test_supports_color_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setattr(sys.stdout, "isatty", lambda: True)
    assert mc.supports_color() is True


def test_supports_color_non_tty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setattr(sys.stdout, "isatty", lambda: False)
    assert mc.supports_color() is False


# --------------------------------------------------------------------------- #
# die
# --------------------------------------------------------------------------- #


def test_die_raises_systemexit_with_given_code(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc_info:
        mc.die("boom", code=3)
    assert exc_info.value.code == 3
    assert "boom" in capsys.readouterr().err


def test_die_default_code_is_1(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc_info:
        mc.die("oops")
    assert exc_info.value.code == 1


# --------------------------------------------------------------------------- #
# run_git
# --------------------------------------------------------------------------- #


def test_run_git_returns_stdout_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: Any, **kwargs: Any) -> SimpleNamespace:
        assert cmd[0] == "git"
        return SimpleNamespace(returncode=0, stdout="hello\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert mc.run_git(["status"]) == "hello\n"


def test_run_git_dies_on_nonzero_returncode(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: Any, **kwargs: Any) -> SimpleNamespace:
        return SimpleNamespace(returncode=1, stdout="", stderr="fatal: bad")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(SystemExit):
        mc.run_git(["status"])


def test_run_git_dies_when_git_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: Any, **kwargs: Any) -> SimpleNamespace:
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(SystemExit):
        mc.run_git(["status"])


# --------------------------------------------------------------------------- #
# ensure_git_repo / repo_root
# --------------------------------------------------------------------------- #


def test_ensure_git_repo_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: "true\n")
    mc.ensure_git_repo()  # must not raise


def test_ensure_git_repo_dies_when_not_a_repo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: "false\n")
    with pytest.raises(SystemExit):
        mc.ensure_git_repo()


def test_repo_root(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: f"{tmp_path}\n")
    assert mc.repo_root() == tmp_path


# --------------------------------------------------------------------------- #
# capture_diff
# --------------------------------------------------------------------------- #


def _fake_run_git_for_mode(diff_args_marker: str) -> Callable[[list[str]], str]:
    def fake_run_git(args: list[str]) -> str:
        if "--name-status" in args:
            return "M\tfoo.ts"
        return "diff content"

    return fake_run_git


def test_capture_diff_staged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", _fake_run_git_for_mode("staged"))
    diff, summary = mc.capture_diff("staged")
    assert diff == "diff content"
    assert "STAGED CHANGES" in summary
    assert "foo.ts" in summary


def test_capture_diff_unstaged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", _fake_run_git_for_mode("unstaged"))
    diff, summary = mc.capture_diff("unstaged")
    assert diff == "diff content"
    assert "UNSTAGED CHANGES" in summary


def test_capture_diff_all(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", _fake_run_git_for_mode("all"))
    diff, summary = mc.capture_diff("all")
    assert diff == "diff content"
    assert "ALL UNCOMMITTED CHANGES" in summary


def test_capture_diff_no_files_label(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: "")
    _, summary = mc.capture_diff("staged")
    assert "(no files)" in summary


def test_capture_diff_invalid_mode_dies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: "")
    with pytest.raises(SystemExit):
        mc.capture_diff("bogus")


# --------------------------------------------------------------------------- #
# _changed_files
# --------------------------------------------------------------------------- #


def test_changed_files_filters_deleted_and_by_extension(monkeypatch: pytest.MonkeyPatch) -> None:
    name_status = "M\tfoo.ts\nD\tbar.ts\nA\tbaz.py\nM\tqux.tsx"
    monkeypatch.setattr(mc, "run_git", lambda args: name_status)
    files = mc._changed_files("staged", exts=(".ts", ".tsx"))
    assert files == ["foo.ts", "qux.tsx"]


def test_changed_files_no_ext_filter_keeps_everything_but_deletes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    name_status = "M\tfoo.ts\nD\tbar.ts\nA\tbaz.py"
    monkeypatch.setattr(mc, "run_git", lambda args: name_status)
    files = mc._changed_files("unstaged")
    assert files == ["foo.ts", "baz.py"]


def test_changed_files_all_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "run_git", lambda args: "M\tfoo.ts")
    assert mc._changed_files("all") == ["foo.ts"]


# --------------------------------------------------------------------------- #
# compile_check
# --------------------------------------------------------------------------- #


def test_compile_check_skips_when_no_ts_files(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: [])
    result = mc.compile_check("staged")
    assert "tsc skipped" in result


def test_compile_check_passes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: ["foo.ts"])
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="", stderr=""),
    )
    result = mc.compile_check("staged")
    assert "OK" in result


def test_compile_check_blocks_on_error_in_changed_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: ["foo.ts"])
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(
            returncode=1, stdout="foo.ts(3,5): error TS1234: bad\n", stderr=""
        ),
    )
    result = mc.compile_check("staged")
    assert "real blockers" in result


def test_compile_check_notes_debt_outside_changed_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: ["foo.ts"])
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(
            returncode=1, stdout="other.ts(1,1): error TS999: bad\n", stderr=""
        ),
    )
    result = mc.compile_check("staged")
    assert "pre-existing debt" in result


def test_compile_check_timeout(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: ["foo.ts"])
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)

    def fake_run(cmd: Any, **kw: Any) -> SimpleNamespace:
        raise subprocess.TimeoutExpired(cmd, 180)

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = mc.compile_check("staged")
    assert "UNVERIFIED" in result


def test_compile_check_npx_not_found(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode, exts=None: ["foo.ts"])
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)

    def fake_run(cmd: Any, **kw: Any) -> SimpleNamespace:
        raise FileNotFoundError

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = mc.compile_check("staged")
    assert "npx not found" in result


# --------------------------------------------------------------------------- #
# _secret_re
# --------------------------------------------------------------------------- #


@pytest.fixture
def secret_pattern() -> re.Pattern[str]:
    return mc._secret_re()


@pytest.mark.parametrize(
    "text",
    [
        'api_key: "abcdefghijklmnop"',
        'secret = "abcdefghijklmnop"',
        'SERVICE_ROLE: "abcdefghijklmnop"',
        "sk-abcdefghij1234567890",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
        "AIzaSyD-abcdefghijklmnopqrstuvwx1234",
        "ghp_" + "a" * 36,
    ],
)
def test_secret_re_matches_known_shapes(secret_pattern: re.Pattern[str], text: str) -> None:
    assert secret_pattern.search(text)


@pytest.mark.parametrize(
    "text",
    [
        "just an ordinary sentence with no secrets",
        'const label = "hello world";',
        "token short",  # under the 12-char minimum
    ],
)
def test_secret_re_no_match_on_safe_text(secret_pattern: re.Pattern[str], text: str) -> None:
    assert not secret_pattern.search(text)


def test_secret_re_env_placeholder_exempted(secret_pattern: re.Pattern[str]) -> None:
    # The negative lookahead (?!env\() exists so a documented "value comes
    # from env(...)" placeholder isn't flagged as a literal leaked secret.
    assert not secret_pattern.search('api_key: "env(GEMINI_API_KEY_PLACEHOLDER)"')


# --------------------------------------------------------------------------- #
# full_file_context
# --------------------------------------------------------------------------- #


def test_full_file_context_empty_when_no_changed_files(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "_changed_files", lambda mode: [])
    assert mc.full_file_context("staged") == ""


def test_full_file_context_includes_file_content(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "foo.ts").write_text("const x = 1;\n")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["foo.ts"])
    result = mc.full_file_context("staged")
    assert "const x = 1;" in result
    assert "foo.ts" in result


def test_full_file_context_truncates_large_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "big.ts").write_text("x" * 100)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["big.ts"])
    result = mc.full_file_context("staged", max_bytes_per_file=10)
    assert "[truncated at 40KB]" in result


def test_full_file_context_skips_binary_extensions(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "img.png").write_bytes(b"\x89PNG\r\n")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["img.png"])
    result = mc.full_file_context("staged")
    assert "img.png" not in result


def test_full_file_context_dies_on_secret(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    (tmp_path / "leaky.ts").write_text('const key = "sk-abcdefghij1234567890";\n')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["leaky.ts"])
    with pytest.raises(SystemExit):
        mc.full_file_context("staged")


def test_full_file_context_skips_missing_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["gone.ts"])
    result = mc.full_file_context("staged")
    assert "FULL FILE CONTENT" in result
    assert "gone.ts" not in result


def test_full_file_context_notes_unreadable_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "broken.ts").write_text("irrelevant")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(mc, "_changed_files", lambda mode: ["broken.ts"])
    _raise_oserror_for(monkeypatch, "broken.ts")
    result = mc.full_file_context("staged")
    assert "[unreadable:" in result


# --------------------------------------------------------------------------- #
# build_auto_context — one focused fixture-repo per check
# --------------------------------------------------------------------------- #


def test_auto_context_forbidden_word_hit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "page.tsx").write_text("return <p>Akun ini aman</p>;\n")
    result = mc.build_auto_context()
    assert "FORBIDDEN-WORD SCAN — occurrences" in result
    assert "page.tsx" in result


def test_auto_context_forbidden_word_clean(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "page.tsx").write_text("return <p>Halo dunia</p>;\n")
    result = mc.build_auto_context()
    assert "FORBIDDEN-WORD SCAN: clean" in result


def test_auto_context_forbidden_word_allowlisted_file_skipped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "copy.ts").write_text('export const X = "aman";\n')
    result = mc.build_auto_context()
    assert "FORBIDDEN-WORD SCAN: clean" in result


def test_auto_context_forbidden_word_locked_exception_not_flagged(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "components").mkdir()
    (root / "components" / "Foo.tsx").write_text('const s = "bukan jaminan aman";\n')
    result = mc.build_auto_context()
    assert "FORBIDDEN-WORD SCAN: clean" in result


def test_auto_context_secret_leak_in_client_component(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "bad.tsx").write_text(
        '"use client";\nconst x = process.env.SUPABASE_SERVICE_ROLE_KEY;\n'
    )
    result = mc.build_auto_context()
    assert "SECRET-EXPOSURE SCAN — VIOLATIONS" in result
    assert "bad.tsx" in result


def test_auto_context_secret_leak_next_public_prefix(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "bad.ts").write_text("const x = process.env.NEXT_PUBLIC_GEMINI_KEY;\n")
    result = mc.build_auto_context()
    assert "SECRET-EXPOSURE SCAN — VIOLATIONS" in result


def test_auto_context_secret_leak_clean(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "ok.ts").write_text("const x = 1;\n")
    result = mc.build_auto_context()
    assert "SECRET-EXPOSURE SCAN: clean" in result


def test_auto_context_migration_guard_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    mig = root / "supabase" / "migrations"
    mig.mkdir(parents=True)
    (mig / "0001_init.sql").write_text(
        "create table deal_events (id int);\nrevoke update, delete on deal_events from anon;\n"
    )
    result = mc.build_auto_context()
    assert "append-only guard (trigger/REVOKE) FOUND" in result


def test_auto_context_migration_guard_missing_warns(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    mig = root / "supabase" / "migrations"
    mig.mkdir(parents=True)
    (mig / "0001_init.sql").write_text("create table deal_events (id int);\n")
    result = mc.build_auto_context()
    assert "WARNING: no DB-level append-only guard" in result


def test_auto_context_migration_violation_detected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    mig = root / "supabase" / "migrations"
    mig.mkdir(parents=True)
    (mig / "0001_init.sql").write_text(
        "create table deal_events (id int);\n"
        "revoke update, delete on deal_events from anon;\n"
        "update deal_events set foo = 1;\n"
    )
    result = mc.build_auto_context()
    assert "[VIOLATION] a migration contains UPDATE/DELETE on deal_events." in result


def test_auto_context_migrations_absent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _mkrepo(tmp_path, monkeypatch)
    result = mc.build_auto_context()
    assert "supabase/migrations/ absent or empty" in result


def test_auto_context_score_scan_hit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "profile.tsx").write_text("const trustScore = compute();\n")
    result = mc.build_auto_context()
    assert "SCORE SCAN — possible composite-score" in result


def test_auto_context_score_scan_clean(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "profile.tsx").write_text("const count = 3;\n")
    result = mc.build_auto_context()
    assert "SCORE SCAN: clean" in result


def test_auto_context_ocr_vocab_detected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "ocr-gemini.ts").write_text('const v = "KONSISTEN";\n')
    result = mc.build_auto_context()
    assert "OCR VOCAB" in result
    assert "KONSISTEN" in result


def test_auto_context_ocr_violation_detected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "ocr-gemini.ts").write_text('const v = "ASLI";\n')
    result = mc.build_auto_context()
    assert "[VIOLATION]" in result
    assert "outside the closed vocabulary" in result


def test_auto_context_locked_copy_sentinels_present(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "copy.ts").write_text(
        "export const A = 'Belum ada riwayat di SAKSI. Ini bukan jaminan aman.';\n"
        "export const B = 'Pengembalian dana tidak pernah memerlukan transfer "
        "tambahan dari Anda.';\n"
        "export const C = 'Cek keaslian catatan hanya di saksi.app';\n"
    )
    result = mc.build_auto_context()
    assert "all sentinel strings present verbatim" in result


def test_auto_context_locked_copy_sentinels_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "copy.ts").write_text("export const A = 'something else';\n")
    result = mc.build_auto_context()
    assert "sentinel strings MISSING" in result


def test_auto_context_locked_copy_module_absent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mkrepo(tmp_path, monkeypatch)
    result = mc.build_auto_context()
    assert "no lib/copy-id.ts found" in result


def test_auto_context_test_script_detected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "package.json").write_text('{"scripts": {"test": "jest"}}')
    result = mc.build_auto_context()
    assert "TESTS: a test script exists" in result


def test_auto_context_no_test_script(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "package.json").write_text('{"scripts": {"build": "next build"}}')
    result = mc.build_auto_context()
    assert "TESTS:" not in result


def test_auto_context_forbidden_word_scan_skips_unreadable_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "broken.tsx").write_text("irrelevant")
    _raise_oserror_for(monkeypatch, "broken.tsx")
    result = mc.build_auto_context()
    assert "FORBIDDEN-WORD SCAN: clean" in result


def test_auto_context_secret_leak_scan_skips_unreadable_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "broken.tsx").write_text("irrelevant")
    _raise_oserror_for(monkeypatch, "broken.tsx")
    result = mc.build_auto_context()
    assert "SECRET-EXPOSURE SCAN: clean" in result


def test_auto_context_score_scan_skips_unreadable_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "app").mkdir()
    (root / "app" / "broken.tsx").write_text("irrelevant")
    _raise_oserror_for(monkeypatch, "broken.tsx")
    result = mc.build_auto_context()
    assert "SCORE SCAN: clean" in result


def test_auto_context_ocr_scan_skips_unreadable_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _mkrepo(tmp_path, monkeypatch)
    (root / "lib").mkdir()
    (root / "lib" / "ocr-broken.ts").write_text("irrelevant")
    _raise_oserror_for(monkeypatch, "ocr-broken.ts")
    result = mc.build_auto_context()  # must not raise
    assert "OCR VOCAB" not in result


# --------------------------------------------------------------------------- #
# colorize_stream_chunk / _color_line — state-machine behavior, not ANSI
# codes (colors are blanked to "" under pytest since stdout isn't a tty).
# --------------------------------------------------------------------------- #


def test_color_line_blocker_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    out = mc._color_line("## [BLOCKER]", state)
    assert state["section"] == "blocker"
    assert "[BLOCKER]" in out


def test_color_line_warning_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## [WARNING]", state)
    assert state["section"] == "warning"


def test_color_line_simplify_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## [SIMPLIFY]", state)
    assert state["section"] == "simplify"


def test_color_line_lgtm_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## [LGTM]", state)
    assert state["section"] == "lgtm"


def test_color_line_summary_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## SUMMARY", state)
    assert state["section"] == "summary"


def test_color_line_verdict_header_sets_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## VERDICT", state)
    assert state["section"] == "verdict"


def test_color_line_generic_header_sets_other_section() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc._color_line("## Something else", state)
    assert state["section"] == "other"


def test_color_line_continuation_inherits_current_section_text() -> None:
    state: mc.StreamState = {"buf": "", "section": "blocker"}
    out = mc._color_line("some detail line", state)
    assert "some detail line" in out
    assert state["section"] == "blocker"  # unchanged by a non-header line


@pytest.mark.parametrize("section", ["warning", "simplify", "lgtm"])
def test_color_line_continuation_text_for_every_section(section: str) -> None:
    state: mc.StreamState = {"buf": "", "section": section}
    out = mc._color_line("detail", state)
    assert "detail" in out
    assert state["section"] == section


def test_color_line_checkmark_and_verdict_phrases_pass_through() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    assert "DO NOT COMMIT" in mc._color_line("❌ DO NOT COMMIT", state)
    assert "LGTM" in mc._color_line("✅ LGTM — safe to commit", state)
    assert "COMMIT WITH CAUTION" in mc._color_line("⚠️  COMMIT WITH CAUTION", state)


def test_colorize_stream_chunk_buffers_incomplete_line() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    out = mc.colorize_stream_chunk("partial", state)
    assert out == ""
    assert state["buf"] == "partial"


def test_colorize_stream_chunk_completes_buffered_line_on_newline() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    mc.colorize_stream_chunk("hello", state)
    out = mc.colorize_stream_chunk(" world\n", state)
    assert "hello world" in out
    assert state["buf"] == ""


def test_colorize_stream_chunk_multiple_lines_in_one_chunk() -> None:
    state: mc.StreamState = {"buf": "", "section": None}
    out = mc.colorize_stream_chunk("line1\nline2\n", state)
    assert "line1" in out
    assert "line2" in out


# --------------------------------------------------------------------------- #
# review_diff — openai is ALWAYS a fake module injected into sys.modules.
# No test in this file makes, or can make, a real network call.
# --------------------------------------------------------------------------- #


class _FakeDelta:
    def __init__(self, content: str | None) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str | None) -> None:
        self.delta = _FakeDelta(content)


class _FakeChunk:
    def __init__(self, content: str | None) -> None:
        self.choices = [_FakeChoice(content)] if content is not None else []


def _install_fake_openai(
    monkeypatch: pytest.MonkeyPatch,
    chunks: list[_FakeChunk] | None = None,
    client_factory: Callable[..., Any] | None = None,
) -> None:
    def default_client_factory(**kwargs: Any) -> SimpleNamespace:
        def create(**kw: Any) -> Iterator[Any]:
            return iter(chunks or [])

        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    # Not types.ModuleType: the import system only needs attribute access
    # (`from openai import OpenAI` is a getattr under the hood), and a real
    # ModuleType instance gives mypy a closed attribute set it would then
    # reject assigning OpenAI onto — SimpleNamespace sidesteps that cleanly.
    fake_module = SimpleNamespace(OpenAI=client_factory or default_client_factory)
    monkeypatch.setitem(sys.modules, "openai", fake_module)


def test_review_diff_missing_api_key_dies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    _install_fake_openai(monkeypatch, chunks=[])
    with pytest.raises(SystemExit):
        mc.review_diff("diff", "summary", "model")


def test_review_diff_missing_package_dies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    monkeypatch.setitem(sys.modules, "openai", None)  # forces ImportError
    with pytest.raises(SystemExit):
        mc.review_diff("diff", "summary", "model")


def test_review_diff_happy_path_streams_colorized_output(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    chunks = [_FakeChunk("## SUMMARY\n"), _FakeChunk("safe to commit\n")]
    _install_fake_openai(monkeypatch, chunks=chunks)
    mc.review_diff("some diff", "summary text", "model-x")
    out = capsys.readouterr().out
    assert "SUMMARY" in out
    assert "safe to commit" in out


def test_review_diff_empty_stream_dies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    _install_fake_openai(monkeypatch, chunks=[])
    with pytest.raises(SystemExit):
        mc.review_diff("diff", "summary", "model")


def test_review_diff_keyboard_interrupt_exits_130(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")

    class _RaisingIter:
        def __iter__(self) -> _RaisingIter:
            return self

        def __next__(self) -> NoReturn:
            raise KeyboardInterrupt

    def client_factory(**kw: Any) -> SimpleNamespace:
        return SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **k: _RaisingIter()))
        )

    _install_fake_openai(monkeypatch, client_factory=client_factory)
    with pytest.raises(SystemExit) as exc_info:
        mc.review_diff("diff", "summary", "model")
    assert exc_info.value.code == 130


def test_review_diff_skips_chunks_with_no_choices_or_empty_content(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    chunks = [
        _FakeChunk(None),  # choices == [] entirely
        _FakeChunk(""),  # a choice exists but content is falsy
        _FakeChunk("real text\n"),
    ]
    _install_fake_openai(monkeypatch, chunks=chunks)
    mc.review_diff("diff", "summary", "model")
    assert "real text" in capsys.readouterr().out


def test_review_diff_mid_stream_error_exits_2(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")

    class _RaisingIter:
        def __iter__(self) -> _RaisingIter:
            return self

        def __next__(self) -> NoReturn:
            raise RuntimeError("connection dropped")

    def client_factory(**kw: Any) -> SimpleNamespace:
        return SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **k: _RaisingIter()))
        )

    _install_fake_openai(monkeypatch, client_factory=client_factory)
    with pytest.raises(SystemExit) as exc_info:
        mc.review_diff("diff", "summary", "model")
    assert exc_info.value.code == 2


def test_review_diff_flushes_trailing_buffer_without_newline(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    # No trailing "\n" on the last chunk — content stays in state["buf"] until
    # the post-loop flush, exercising that final `if tail:` branch.
    chunks = [_FakeChunk("## SUMMARY\n"), _FakeChunk("no trailing newline")]
    _install_fake_openai(monkeypatch, chunks=chunks)
    mc.review_diff("diff", "summary", "model")
    assert "no trailing newline" in capsys.readouterr().out


def test_review_diff_typeerror_fallback_retries_without_top_level_kwarg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")
    calls: list[dict[str, Any]] = []

    def create(**kwargs: Any) -> Iterator[Any]:
        calls.append(kwargs)
        if "reasoning_effort" in kwargs:
            raise TypeError("unexpected keyword argument 'reasoning_effort'")
        return iter([_FakeChunk("ok\n")])

    def client_factory(**kw: Any) -> SimpleNamespace:
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    _install_fake_openai(monkeypatch, client_factory=client_factory)
    mc.review_diff("diff", "summary", "model")
    assert len(calls) == 2


def test_review_diff_typeerror_fallback_also_fails_dies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")

    def create(**kwargs: Any) -> Iterator[Any]:
        raise TypeError("boom")

    def client_factory(**kw: Any) -> SimpleNamespace:
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    _install_fake_openai(monkeypatch, client_factory=client_factory)
    with pytest.raises(SystemExit):
        mc.review_diff("diff", "summary", "model")


def test_review_diff_generic_exception_on_first_call_dies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-fake")

    def create(**kwargs: Any) -> Iterator[Any]:
        raise RuntimeError("network down")

    def client_factory(**kw: Any) -> SimpleNamespace:
        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    _install_fake_openai(monkeypatch, client_factory=client_factory)
    with pytest.raises(SystemExit):
        mc.review_diff("diff", "summary", "model")


# --------------------------------------------------------------------------- #
# deep_scan
# --------------------------------------------------------------------------- #

_ReviewCall = tuple[tuple[Any, ...], dict[str, Any]]


def test_deep_scan_pairs_files_and_reviews_each_pair(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    (tmp_path / "a.ts").write_text("content a")
    (tmp_path / "b.ts").write_text("content b")
    (tmp_path / "c.ts").write_text("content c")

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="a.ts\nb.ts\nc.ts\n", stderr=""),
    )
    monkeypatch.setattr(mc, "build_auto_context", lambda: "AUTO")

    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert len(calls) == 2  # 3 files -> [a,b] and [c]


def test_deep_scan_oversized_pair_is_skipped(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    (tmp_path / "a.ts").write_text("x" * 400_000)

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="a.ts\n", stderr=""),
    )
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert calls == []
    assert "too large" in capsys.readouterr().out


def test_deep_scan_skips_file_containing_secret(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    (tmp_path / "leaky.ts").write_text('const key = "sk-abcdefghij1234567890";')

    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="leaky.ts\n", stderr=""),
    )
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert "leaky.ts" not in calls[0][0][0]
    assert "contains possible secret" in capsys.readouterr().out


def test_deep_scan_notes_file_not_found_on_disk(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    # git lists a file that no longer exists on disk (e.g. deleted after the
    # ls-files snapshot) — deep_scan must note it, not crash.
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="ghost.ts\n", stderr=""),
    )
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert "[NOT FOUND]" in calls[0][0][0]


def test_deep_scan_notes_unreadable_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    (tmp_path / "broken.ts").write_text("irrelevant")
    _raise_oserror_for(monkeypatch, "broken.ts")
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="broken.ts\n", stderr=""),
    )
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert "[unreadable:" in calls[0][0][0]


def test_deep_scan_no_files_found(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    monkeypatch.setattr(
        subprocess, "run", lambda cmd, **kw: SimpleNamespace(returncode=0, stdout="", stderr="")
    )
    mc.deep_scan("model-x")
    assert "No .ts/.tsx/.sql files found." in capsys.readouterr().out


def test_deep_scan_git_failure_falls_back_to_rglob(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(mc, "repo_root", lambda: tmp_path)
    monkeypatch.chdir(tmp_path)
    (tmp_path / "z.ts").write_text("hello")

    def fake_run(cmd: Any, **kw: Any) -> SimpleNamespace:
        raise subprocess.CalledProcessError(1, cmd)

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))

    mc.deep_scan("model-x")
    assert len(calls) == 1


# --------------------------------------------------------------------------- #
# main — dispatch/orchestration only; every collaborator is mocked
# --------------------------------------------------------------------------- #


def test_main_deep_flag_routes_to_deep_scan(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    calls: list[str] = []
    monkeypatch.setattr(mc, "deep_scan", lambda model: calls.append(model))
    with pytest.raises(SystemExit) as exc_info:
        mc.main(["--deep", "--model", "custom-model"])
    assert exc_info.value.code == 0
    assert calls == ["custom-model"]


def test_main_empty_staged_diff_exits_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    monkeypatch.setattr(mc, "capture_diff", lambda mode: ("", "summary"))
    with pytest.raises(SystemExit) as exc_info:
        mc.main([])
    assert exc_info.value.code == 0


def test_main_compile_blocker_exits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    monkeypatch.setattr(mc, "capture_diff", lambda mode: ("some diff", "summary"))
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    monkeypatch.setattr(
        mc,
        "compile_check",
        lambda mode: "TYPE CHECK (tsc errors in modified files — real blockers):\n  err",
    )
    with pytest.raises(SystemExit):
        mc.main([])


def test_main_oversized_payload_exits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    monkeypatch.setattr(mc, "capture_diff", lambda mode: ("x" * 100, "summary"))
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    monkeypatch.setattr(
        mc, "compile_check", lambda mode: "TYPE CHECK: no .ts/.tsx files modified — tsc skipped."
    )
    monkeypatch.setattr(mc, "full_file_context", lambda mode: "")
    with pytest.raises(SystemExit):
        mc.main(["--max-diff-bytes", "10"])


def test_main_happy_path_calls_review_diff(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    monkeypatch.setattr(mc, "capture_diff", lambda mode: ("some diff", "summary"))
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    monkeypatch.setattr(
        mc, "compile_check", lambda mode: "TYPE CHECK: no .ts/.tsx files modified — tsc skipped."
    )
    monkeypatch.setattr(mc, "full_file_context", lambda mode: "")
    calls: list[_ReviewCall] = []
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: calls.append((a, kw)))
    mc.main([])
    assert len(calls) == 1


def test_main_unstaged_flag_selects_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    seen_modes: list[str] = []

    def fake_capture_diff(mode: str) -> tuple[str, str]:
        seen_modes.append(mode)
        return ("", "summary")

    monkeypatch.setattr(mc, "capture_diff", fake_capture_diff)
    with pytest.raises(SystemExit):
        mc.main(["--unstaged"])
    assert seen_modes == ["unstaged"]


def test_main_all_flag_selects_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    seen_modes: list[str] = []

    def fake_capture_diff(mode: str) -> tuple[str, str]:
        seen_modes.append(mode)
        return ("", "summary")

    monkeypatch.setattr(mc, "capture_diff", fake_capture_diff)
    with pytest.raises(SystemExit):
        mc.main(["--all"])
    assert seen_modes == ["all"]


def test_main_diff_only_skips_full_file_context(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(mc, "ensure_git_repo", lambda: None)
    monkeypatch.setattr(mc, "capture_diff", lambda mode: ("some diff", "summary"))
    monkeypatch.setattr(mc, "build_auto_context", lambda: "")
    monkeypatch.setattr(
        mc, "compile_check", lambda mode: "TYPE CHECK: no .ts/.tsx files modified — tsc skipped."
    )
    full_file_calls: list[str] = []

    def fake_full_file_context(mode: str) -> str:
        full_file_calls.append(mode)
        return "should not be called"

    monkeypatch.setattr(mc, "full_file_context", fake_full_file_context)
    monkeypatch.setattr(mc, "review_diff", lambda *a, **kw: None)
    mc.main(["--diff-only"])
    assert full_file_calls == []
