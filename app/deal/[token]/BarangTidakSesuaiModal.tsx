'use client';

import { useState } from 'react';
import {
  BARANG_TIDAK_SESUAI_PROMPT,
  BARANG_TIDAK_SESUAI_CONSEQUENCES,
  BARANG_TIDAK_SESUAI_GATE_BANNER,
  BARANG_TIDAK_SESUAI_SUBMIT_LABEL,
} from '@/lib/copy';

// C6 — stub only. Submit is permanently disabled; there is no RPC call on
// submit attempt, by design (reporting requires OTP, which isn't built yet
// — see the gate banner). Copy locked in copy-id.md §16 (2026-07-20).
export function BarangTidakSesuaiModal({ itemDesc, onClose }: { itemDesc: string; onClose: () => void }) {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-900">Barang Tidak Sesuai Kesepakatan</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-zinc-500 hover:text-zinc-800"
          >
            Tutup
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          {itemDesc}
        </div>

        <p className="mb-2 text-sm font-medium text-zinc-700">{BARANG_TIDAK_SESUAI_PROMPT}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mb-4 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />

        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-700">Foto (opsional)</label>
          <div className="mt-1 rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
            Belum aktif. Tidak disimpan.
          </div>
        </div>

        <ul className="mb-4 flex flex-col gap-1.5 text-xs text-zinc-500">
          {BARANG_TIDAK_SESUAI_CONSEQUENCES.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>

        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {BARANG_TIDAK_SESUAI_GATE_BANNER}
        </p>

        <button
          type="button"
          disabled
          className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white opacity-40"
        >
          {BARANG_TIDAK_SESUAI_SUBMIT_LABEL}
        </button>
      </div>
    </div>
  );
}
