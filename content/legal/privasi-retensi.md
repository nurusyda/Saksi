# Kebijakan Privasi & Retensi Data SAKSI

**Versi: 1.1 (DRAF)**
**Berlaku sejak: 1 Agustus 2026**
**Hash dokumen (SHA-256): [diisi otomatis saat publikasi]**

Dokumen ini adalah satu kesatuan dengan Syarat & Ketentuan SAKSI dan menjelaskan data apa yang SAKSI kumpulkan, untuk apa, siapa yang bisa melihatnya, dan berapa lama disimpan.

---

## 1. Data yang dikumpulkan

| Data | Sumber | Wajib? |
|---|---|---|
| Nomor HP | Anda masukkan sendiri | Ya, ini pengenal Anda di SAKSI. Tidak ada akun, email, atau kata sandi |
| Nomor rekening tujuan dan nama bank | Diisi pihak yang menerima pembayaran | Ya, untuk kesepakatan yang melibatkan transfer |
| Isi kesepakatan (deskripsi, nominal, tenggat) | Anda masukkan sendiri | Ya |
| Bukti transfer atau pengembalian dana (gambar) | Anda unggah | Hanya jika Anda mengunggahnya |
| Riwayat peristiwa kesepakatan | Dihasilkan sistem | Ya, ini fungsi utama SAKSI |

SAKSI tidak mengumpulkan data lokasi, kontak telepon Anda, atau data dari aplikasi lain.

## 2. Untuk apa data diproses

Sebagaimana Anda setujui saat membuat atau bergabung ke kesepakatan:

1. **Mencatat kesepakatan** dan menyaksikan perjalanannya.
2. **Menyusun riwayat kesepakatan Anda**: selesai, dibatalkan, diperpanjang, maupun tidak terpenuhi. Riwayat ini yang muncul saat seseorang memeriksa rekening atau nomor HP di halaman cek SAKSI.
3. **Mengidentifikasi Anda kembali** setiap kali Anda melakukan tindakan pada kesepakatan (misalnya menanggapi laporan), dengan meminta nomor HP Anda lagi setiap saat, bukan lewat akun tersimpan. SAKSI saat ini belum mengirim pemberitahuan otomatis melalui WhatsApp, SMS, atau kanal lain; nomor HP Anda disimpan agar hal ini dapat diaktifkan di kemudian hari.
4. **Mencegah penyalahgunaan**: pembatasan laju (rate limiting) dan penelusuran pelapor.

Dasar hukum pemrosesan adalah persetujuan Anda dan pelaksanaan kesepakatan yang Anda buat, sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.

## 3. Apa yang publik dan apa yang tidak

**Tidak pernah publik:**

- Nomor HP Anda dalam bentuk utuh.
- Gambar bukti transfer.
- Isi lengkap kesepakatan antara Anda dan pihak lain (hanya dapat diakses pemegang tautan kesepakatan).
- Foto KTP atau NIK (SAKSI memang tidak menyimpannya).

**Dapat menjadi publik, hanya melalui mekanisme yang dijelaskan di Syarat & Ketentuan:**

- Nomor rekening tujuan dalam bentuk **tersamar** (2 digit awal dan 2 digit akhir) beserta nama bank.
- Sidik jari kriptografis (hash SHA-256) dari nomor HP, yang memungkinkan pencocokan riwayat tanpa mengungkap nomor itu sendiri.
- Jumlah kesepakatan per hasil akhir (selesai, dibatalkan bersama, dibatalkan sepihak, dikembalikan penuh, tidak terpenuhi, dalam sengketa), usia akun, dan tingkat verifikasi.
- Status dan tanggal kesepakatan yang tercatat tidak terpenuhi, sesuai tingkat pembuktiannya.

SAKSI tidak pernah menampilkan skor, bintang, atau label "aman" untuk siapa pun.

## 4. Retensi: berapa lama data disimpan

| Data | Masa simpan | Alasan |
|---|---|---|
| Draf kesepakatan yang tidak pernah disetujui | **Dihapus otomatis setelah 7 hari** | Kesepakatan yang tidak pernah terbentuk tidak meninggalkan jejak |
| Kesepakatan yang ditolak pada tahap pengajuan | **Dihapus saat ditolak** | Sama seperti di atas |
| Rekaman kesepakatan yang disetujui kedua pihak, beserta riwayat peristiwanya | **Selama SAKSI beroperasi** | Ini adalah fungsi inti SAKSI sebagai saksi. Catatan yang bisa hilang bukan catatan |
| Nomor HP (bentuk utuh) | Selama Anda memiliki kesepakatan aktif atau riwayat tercatat, untuk keperluan identifikasi kembali dan hak jawab | Diperlukan agar hak jawab dapat berjalan |
| Sidik jari nomor HP (hash) | **Selama SAKSI beroperasi** | Kunci pencocokan riwayat lintas kesepakatan. Tanpa ini, riwayat yang Anda dan pihak lain andalkan tidak dapat disusun |
| Gambar bukti transfer | Selama rekaman kesepakatannya disimpan | Bagian dari catatan; dapat dibutuhkan dalam sengketa atau proses hukum |

Prinsip yang mendasari tabel ini: **data yang menjadi bagian dari kesaksian disimpan selama kesaksiannya; data yang hanya alat bantu sesaat dihapus secepatnya.**

## 5. Hak Anda

Sesuai UU Pelindungan Data Pribadi, Anda berhak:

1. **Mengakses** data pribadi Anda yang SAKSI simpan.
2. **Memperbaiki** data yang keliru. Perbaikan atas rekaman kesepakatan dilakukan dengan menambahkan peristiwa koreksi, bukan mengubah riwayat, agar rantai catatan tetap utuh.
3. **Meminta penghapusan** data pribadi Anda. Permintaan ini akan dipenuhi sepanjang tidak bertentangan dengan dasar hukum penyimpanan catatan (persetujuan kedua belah pihak atas pencatatan, dan kepentingan sah pihak lain atas riwayat yang telah disepakati bersama). SAKSI akan menjelaskan alasannya jika sebagian data tidak dapat dihapus.
4. **Menarik persetujuan** untuk pemrosesan di masa depan. Penarikan tidak berlaku surut atas catatan yang dibuat berdasarkan persetujuan sebelumnya.
5. **Mengajukan keberatan** atas suatu catatan melalui mekanisme hak jawab di Syarat & Ketentuan.

Semua permintaan: sapa@saksi.app. SAKSI menanggapi selambatnya dalam batas waktu yang ditentukan peraturan yang berlaku.

## 6. Pihak ketiga yang memproses data

| Pihak | Untuk apa | Data yang diproses |
|---|---|---|
| Penyedia basis data dan penyimpanan (Supabase) | Menyimpan rekaman dan gambar bukti | Seluruh data pada Bagian 1, di pusat data kawasan Singapura |
| Penyedia hosting (Vercel) | Menjalankan situs saksi.app | Data yang melintas saat Anda menggunakan situs |
| Penyedia pembayaran (jika ada) | Memproses biaya tingkatan berbayar | Data pembayaran biaya; **bukan** uang transaksi antar pihak |
| Penyedia pemeriksaan konsistensi bukti | Membaca nominal, tanggal, dan rekening pada gambar bukti | Gambar bukti yang Anda unggah |

SAKSI tidak menjual data pribadi Anda dan tidak membagikannya untuk iklan.

## 7. Keamanan dan keutuhan catatan

1. Data pribadi berada di balik kontrol akses tingkat baris (Row Level Security); halaman publik hanya menampilkan data turunan yang tersamar.
2. Setiap perubahan status disegel hash SHA-256 yang berantai; catatan tidak dapat diubah diam-diam, termasuk oleh SAKSI.
3. Cadangan basis data dibuat setiap hari dan disimpan di luar penyedia utama.

## 8. Perubahan kebijakan ini

Setiap versi diberi nomor, tanggal, dan hash SHA-256, dengan ketentuan yang sama seperti perubahan Syarat & Ketentuan: tidak berlaku surut atas persetujuan yang sudah tercatat.

---

*Pertanyaan tentang dokumen ini: sapa@saksi.app.*
