// Reference data, not locked copy from copy-id.md — a dropdown of standard
// Indonesian bank names, so "BCA"/"Bank BCA"/"bca" don't fragment into
// different strings on the public check page. "Lainnya" reveals a free-text
// fallback for anything not listed.

export const BANK_OPTIONS: readonly string[] = [
  'BCA',
  'Mandiri',
  'BRI',
  'BNI',
  'BSI',
  'CIMB Niaga',
  'Danamon',
  'Permata',
  'OCBC NISP',
  'Panin',
  'Maybank Indonesia',
  'BTN',
  'Bank Jago',
  'SeaBank',
  'Bank Neo Commerce',
  'BTPN/Jenius',
  'Bank Mega',
  'Bank Sinarmas',
  'Commonwealth Bank',
  'HSBC Indonesia',
  'Citibank Indonesia',
  'DBS Indonesia',
  'UOB Indonesia',
  'Bank DKI',
  'Bank Jatim',
  'Bank Jabar Banten (BJB)',
];

export const BANK_OTHER_VALUE = 'LAINNYA';
export const BANK_OTHER_LABEL = 'Bank lainnya (isi manual)';
