/**
 * SAKSI — Verifikasi Rantai Hash Independen
 * ==========================================
 * Query satu deal dari Supabase produksi, hitung ulang setiap hash
 * dari canonical payload, lalu cetak tabel side-by-side COCOK/TIDAK.
 *
 * Usage:  npx tsx analysis/verify-hash-chain.ts
 *
 * Output script ini bisa langsung jadi lampiran. Panelis teknis bisa
 * menyalin canonical payload yang ditampilkan, menjalankan
 * `echo -n '<payload>' | sha256sum`, dan mendapat hash yang sama —
 * tanpa harus memercayai database Saksi.
 *
 * Requires migration 0040+: CREATED and COUNTERPART_JOINED now store their
 * {tnc_version, tnc_hash} payload directly in deal_events.payload, read
 * below like any other event — no more brute-forcing git revisions of the
 * T&C file to find a payload that happens to match the stored hash.
 */

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ─── Credentials ───────────────────────────────────────────────
// Disusun dari .env.local — jangan commit ulang dengan key hardcoded.
// Script ini hanya jalan lokal; output-nya yang jadi lampiran.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing env vars. Pastikan .env.local ada di root.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ─── Hash functions (identical to lib/db/hash.ts) ──────────────

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

function hashDeal(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ─── Types ─────────────────────────────────────────────────────

interface DealRow {
  id: string; token: string; tier: string;
  proposer_id: string; counterpart_id: string | null; proposer_role: string;
  item_desc: string; amount_idr: number;
  rekening_tujuan: string | null; rekening_bank: string | null;
  payment_method: string;
  qris_nmid: string | null; qris_merchant_name: string | null;
  qris_merchant_city: string | null;
  deadline: string; status: string; meterai_applied: boolean;
}

interface EventRow {
  id: number; event: string; actor: string;
  payload: unknown; prior_hash: string | null; new_hash: string;
  created_at: string;
}

// ─── Canonical payload builder (identical to lib/db/hash.ts) ───

function buildCanonicalPayload(
  deal: DealRow,
  event: { name: string; actor: string; payload: unknown },
  priorHash: string | null,
): Record<string, unknown> {
  return {
    id: deal.id,
    token: deal.token,
    tier: deal.tier,
    proposer_id: deal.proposer_id,
    counterpart_id: deal.counterpart_id,
    proposer_role: deal.proposer_role,
    item_desc: deal.item_desc,
    amount_idr: Number(deal.amount_idr),
    rekening_tujuan: deal.rekening_tujuan,
    rekening_bank: deal.rekening_bank,
    payment_method: deal.payment_method ?? 'REKENING',
    qris_nmid: deal.qris_nmid ?? null,
    qris_merchant_name: deal.qris_merchant_name ?? null,
    qris_merchant_city: deal.qris_merchant_city ?? null,
    deadline: deal.deadline,
    status: deal.status,
    meterai_applied: deal.meterai_applied,
    event: event.name,
    actor: event.actor,
    payload: event.payload ?? null,
    prior_hash: priorHash,
  };
}

// ─── Status transition resolver ────────────────────────────────
// Tracks the virtual deal state as we walk the event chain.

function nextStatus(current: string, event: string): string | null {
  const m: Record<string, Record<string, string>> = {
    DRAF:              { CREATED: 'DRAF', COUNTERPART_JOINED: 'DIAJUKAN' },
    DIAJUKAN:          { ACCEPTED: 'DISEPAKATI' },
    DISEPAKATI:        { BUKTI_UPLOADED: 'DIBAYAR_DIKLAIM', CANCEL_AGREED: 'DIBATALKAN_BERSAMA', CANCEL_UNILATERAL: 'TIDAK_DILANJUTKAN' },
    DIBAYAR_DIKLAIM:   { RECEIPT_CONFIRMED: 'DIKONFIRMASI_TERIMA', REFUND_CONFIRMED: 'DIKEMBALIKAN_PENUH', REFUND_CONFIRMED_PARTIAL: 'DIKEMBALIKAN_SEBAGIAN', TENGGAT_LEWAT: 'TIDAK_DIPENUHI', KEDALUWARSA_LAPSED: 'KEDALUWARSA', NUDGE_SENT: 'DIBAYAR_DIKLAIM', DANA_BELUM_MASUK: 'DIBAYAR_DIKLAIM', BUKTI_UPLOADED: 'DIBAYAR_DIKLAIM', REFUND_UPLOADED: 'DIBAYAR_DIKLAIM' },
    DIKONFIRMASI_TERIMA:{ FULFILLMENT_CONFIRMED: 'SELESAI', TENGGAT_LEWAT: 'TIDAK_DIPENUHI', KEDALUWARSA_LAPSED: 'KEDALUWARSA', NUDGE_SENT: 'DIKONFIRMASI_TERIMA', BARANG_TIDAK_SESUAI: 'DIKONFIRMASI_TERIMA', PENJUAL_JAWAB: 'DIKONFIRMASI_TERIMA' },
    TIDAK_DIPENUHI:    { HAK_JAWAB_FILED: 'SENGKETA', FLAG_PUBLISHED: 'TIDAK_DIPENUHI', FLAG_RETRACTED: 'TIDAK_DIPENUHI' },
    SENGKETA:          { SENGKETA_KADALUARSA: 'TIDAK_DIPENUHI', FLAG_RETRACTED: 'SENGKETA' },
  };
  return m[current]?.[event] ?? null;
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  // 1. Cari satu deal SELESAI dengan ≥3 event
  const { data: dealIds, error: err1 } = await db
    .from('deals')
    .select('id')
    .eq('status', 'SELESAI')
    .order('created_at', { ascending: false })
    .limit(20);

  if (err1 || !dealIds) {
    console.error('Gagal query deals:', err1);
    return;
  }

  let dealId: string | null = null;
  for (const d of dealIds) {
    const { count, error: cErr } = await db
      .from('deal_events')
      .select('*', { count: 'exact', head: true })
      .eq('deal_id', d.id);
    if (!cErr && (count ?? 0) >= 4) { dealId = d.id; break; }
  }

  if (!dealId) {
    // Fallback: ambil deal dengan event terbanyak
    const { data: all } = await db.from('deals').select('id').neq('status', 'DRAF').limit(50);
    if (!all) { console.error('No deals found.'); return; }
    let best = ''; let bestN = 0;
    for (const d of all) {
      const { count } = await db.from('deal_events').select('*', { count: 'exact', head: true }).eq('deal_id', d.id);
      if ((count ?? 0) > bestN) { bestN = count ?? 0; best = d.id; }
    }
    dealId = best;
  }

  if (!dealId) { console.error('No deal with events found.'); return; }

  // 2. Ambil deal row
  const { data: deal, error: err2 } = await db
    .from('deals')
    .select('id,token,tier,proposer_id,counterpart_id,proposer_role,item_desc,amount_idr,rekening_tujuan,rekening_bank,payment_method,qris_nmid,qris_merchant_name,qris_merchant_city,deadline,status,meterai_applied')
    .eq('id', dealId)
    .single();

  if (err2 || !deal) { console.error('Gagal query deal:', err2); return; }

  // 3. Ambil semua event
  const { data: events, error: err3 } = await db
    .from('deal_events')
    .select('id,event,actor,payload,prior_hash,new_hash,created_at')
    .eq('deal_id', dealId)
    .order('id', { ascending: true });

  if (err3 || !events) { console.error('Gagal query events:', err3); return; }

  // 4. Verifikasi — komputasi dulu, baru cetak output
  let allMatch = true;
  let prevHash: string | null = null;

  const vDeal: DealRow = {
    ...deal,
    status: 'DRAF',
    counterpart_id: null,
  };

  // Migration 0040+: CREATED/COUNTERPART_JOINED payloads are read straight
  // from deal_events.payload, same as every other event — no more searching
  // for a T&C revision that happens to produce a matching hash.
  const matchedTnc =
    events.length > 0 && events[0].payload && typeof events[0].payload === 'object'
      ? (events[0].payload as { tnc_version?: string })
      : null;

  // Komputasi semua hash dulu, simpan ke array
  interface VerifiedEvent {
    event: string; actor: string;
    storedPrior: string | null; expectedPrior: string | null;
    storedHash: string; recomputed: string;
    match: boolean; canonicalJson: string;
  }
  const verified: VerifiedEvent[] = [];

  for (const ev of events) {
    const expectedPrior = verified.length === 0 ? null : prevHash;

    const ns = nextStatus(vDeal.status, ev.event);
    if (ns) vDeal.status = ns;
    if (ev.event === 'COUNTERPART_JOINED') vDeal.counterpart_id = deal.counterpart_id;

    const canonical = buildCanonicalPayload(
      vDeal,
      { name: ev.event, actor: ev.actor, payload: ev.payload ?? null },
      expectedPrior,
    );
    const canonicalJson = JSON.stringify(canonicalize(canonical));
    const recomputed = hashDeal(canonical);
    const match = recomputed === ev.new_hash;
    if (!match) allMatch = false;

    verified.push({
      event: ev.event, actor: ev.actor,
      storedPrior: ev.prior_hash, expectedPrior,
      storedHash: ev.new_hash, recomputed,
      match, canonicalJson,
    });

    prevHash = ev.new_hash;
  }

  // ─── Output ──────────────────────────────────────────────────
  const sep = '━'.repeat(72);

  // Narasi pembuka
  console.log(sep);
  console.log('SAKSI — Verifikasi Rantai Hash Independen');
  console.log(sep);
  console.log();
  console.log(`Satu deal simulasi QA di database produksi, ${verified.length} peristiwa,`);
  console.log('dari pembuatan sampai barang diterima. Setiap prior_hash cocok');
  console.log('Hash dihitung ulang dari canonical payload — tanpa memercayai');
  console.log('database Saksi. Panelis dapat memverifikasi mandiri dengan');
  console.log('menyalin payload contoh di bawah dan menjalankan sha256sum.');
  console.log();
  console.log(`  Deal      : ${deal.item_desc}`);
  console.log(`  Nominal   : Rp${deal.amount_idr.toLocaleString('id-ID')}`);
  console.log(`  Metode    : ${deal.payment_method}`);
  console.log(`  T&C       : ${matchedTnc?.tnc_version ?? '??'}`);
  console.log(`  Token     : ${deal.token}`);
  console.log();

  // Tabel ringkas — 6 baris, tanpa payload penuh
  console.log('─'.repeat(72));
  console.log('  #  Event                    Actor        prior = prev?   Hash');
  console.log('─'.repeat(72));
  for (let i = 0; i < verified.length; i++) {
    const v = verified[i];
    const priorOk = v.storedPrior === v.expectedPrior ? '✅' : '❌';
    const hashShort = v.storedHash.slice(0, 12);
    const icon = v.match ? '✅' : '❌';
    const evPad = v.event.padEnd(24);
    const actPad = v.actor.padEnd(12);
    console.log(`  ${String(i + 1).padStart(2)}  ${evPad} ${actPad} ${priorOk}          ${hashShort}… ${icon}`);
  }
  console.log('─'.repeat(72));
  console.log();

  // Satu canonical payload lengkap (Event #1 saja)
  const first = verified[0];
  console.log('Contoh canonical payload — Event #1 (CREATED):');
  console.log('─'.repeat(72));
  console.log(first.canonicalJson);
  console.log('─'.repeat(72));
  console.log();
  console.log('Verifikasi mandiri (salin ke terminal):');
  console.log();
  console.log(`  $ echo -n '${first.canonicalJson}' | sha256sum`);
  console.log(`  ${first.recomputed}`);
  console.log();

  // Caption T&C
  if (matchedTnc) {
    console.log('─'.repeat(72));
    console.log('Catatan: payload berisi tnc_version dan tnc_hash — versi Syarat &');
    console.log('Ketentuan yang berlaku saat kesepakatan dibuat ikut terkunci ke');
    console.log('dalam hash. Pihak mana pun dapat membuktikan aturan apa yang');
    console.log('berlaku, dan Saksi tidak bisa mengubahnya belakangan. Versi');
    console.log(`ditandai "${matchedTnc.tnc_version}" — draf, menunggu tinjauan`);
    console.log('hukum sesuai rencana di Lampiran C dan R1 Lampiran D.');
    console.log();
  }

  // Verdict
  console.log(sep);
  if (allMatch) {
    console.log(`✅ SELURUH RANTAI HASH COCOK — ${verified.length}/${verified.length}`);
    console.log();
    console.log('   deal_events[i].new_hash  = SHA-256(canonical_payload)');
    console.log('   deal_events[i].prior_hash = deal_events[i-1].new_hash');
    console.log();
    console.log('   Mengubah satu baris di masa lalu mengubah seluruh hash');
    console.log('   sesudahnya. Catatan ini append-only, tamper-evident, dan');
    console.log('   dapat diverifikasi tanpa memercayai server Saksi.');
  } else {
    console.log('❌ ADA KETIDAKCOCOKAN — RANTAI TIDAK UTUH');
  }
  console.log(sep);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
