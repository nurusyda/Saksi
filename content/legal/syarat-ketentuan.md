# Syarat & Ketentuan SAKSI

**Versi: 1.2 (DRAF, menunggu tinjauan hukum)**
**Berlaku sejak: [tanggal publikasi]**
**Hash dokumen (SHA-256): [diisi otomatis saat publikasi]**

<!--
  CHANGELOG (untuk peninjau, tidak untuk ditampilkan sebagai bagian dokumen):
  v1.2 (2026-07-22) — gambar pendukung pada keterangan klarifikasi:
    - Bagian 3A: keterangan klarifikasi kini dapat menyertakan satu gambar
      pendukung (foto/tangkapan layar), bersifat opsional.
    - Bagian 6: daftar unggahan yang tunduk pada larangan bukti palsu diperluas
      untuk mencakup gambar pendukung tersebut. Gambar yang dilampirkan
      memerlukan pernyataan keaslian yang sama seperti bukti transfer.
    (Detail implementasi: copy-id.md §45.)

  v1.1 (2026-07-21) — menyelaraskan dokumen dengan sistem yang sebenarnya
  dibangun:
    - Bagian 4: kewajiban verifikasi OTP pelapor DIHAPUS. Mekanisme OTP
      WhatsApp sudah dihapus dari sistem (tidak dapat diandalkan: kegagalan
      kanal notifikasi tidak boleh memblokir hak seseorang untuk mengadu).
      Pelapor kini teridentifikasi sebagai pihak yang tercatat pada
      kesepakatan, bukan melalui OTP. Klaim "verifikasi OTP" telah dihapus,
      bukan diperlunak.
    - Bagian 3A (BARU): klarifikasi dua arah sebelum laporan resmi — kedua
      pihak dapat saling memberi keterangan (maksimal dua putaran) yang
      tercatat sebagai pernyataan, bukan laporan.
    - Bagian 7: tingkatan berbayar diselaraskan dengan model produk terbaru
      (Akun Saksi, Toko Saksi Pro). Tingkatan berbayar belum aktif.
  Publikasi catatan (Bagian 4) masih dinonaktifkan secara operasional sampai
  tinjauan hukum selesai; teksnya tetap ada sebagai dasar persetujuan.
-->

<!-- Untuk peninjau hukum: catatan implementasi lengkap tiap perubahan ada di
     .claude/skills/saksi-builder/references/copy-id.md (§25, §30, §42). -->


Setiap persetujuan atas Syarat & Ketentuan ini dicatat dalam riwayat kesepakatan Anda beserta versi dan hash dokumen yang berlaku saat itu. Anda menyetujui versi yang Anda baca, bukan versi yang datang kemudian.

---

## 1. Apa itu SAKSI, dan apa yang bukan

SAKSI adalah layanan pencatatan kesepakatan antara dua pihak. SAKSI mencatat isi kesepakatan, menyaksikan perjalanannya (disepakati, dibayar, selesai, dibatalkan, diperpanjang, atau tidak terpenuhi), dan menyimpan catatannya dalam bentuk yang tidak dapat diubah diam-diam.

SAKSI **bukan**:

- **Rekening bersama atau escrow.** Uang transaksi Anda tidak pernah melewati, disimpan, atau dijamin oleh SAKSI. Pembayaran terjadi langsung antara para pihak.
- **Hakim atau penilai.** SAKSI tidak memutuskan siapa yang benar, siapa yang salah, atau siapa yang menipu. SAKSI mencatat apa yang terjadi dan siapa yang mengklaim apa.
- **Notaris atau lembaga penegak hukum.** Catatan SAKSI dapat membantu Anda menyusun bukti, tetapi SAKSI tidak memberikan nasihat hukum, tidak melaporkan ke polisi atas nama Anda, dan tidak menjamin hasil proses hukum apa pun.
- **Jaminan atas pihak lain.** Tidak ada tingkatan layanan, verifikasi, atau catatan di SAKSI yang berarti seseorang "aman" atau "terpercaya". Ketiadaan catatan buruk bukan bukti kebaikan; sebagian besar rekening dan nomor HP belum tercatat di SAKSI.

## 2. Syarat menggunakan SAKSI

Dengan membuat atau bergabung ke dalam kesepakatan di SAKSI, Anda menyatakan bahwa:

1. Anda berusia 18 tahun ke atas dan cakap hukum untuk membuat kesepakatan.
2. Nomor HP dan nomor rekening yang Anda masukkan adalah milik Anda sendiri. Memasukkan pengenal milik orang lain dapat merugikan orang tersebut dan merupakan pelanggaran berat atas Syarat & Ketentuan ini.
3. Informasi yang Anda masukkan tentang kesepakatan (barang atau jasa, nominal, tenggat) adalah benar sepengetahuan Anda.

## 3. Cara kerja pencatatan

1. Satu kesepakatan tercatat sebagai satu rekaman dengan riwayat peristiwa yang hanya bisa bertambah, tidak bisa diubah atau dihapus, kecuali sebagaimana dijelaskan pada Kebijakan Privasi & Retensi Data.
2. Setiap perubahan status kesepakatan disegel dengan sidik jari kriptografis (hash SHA-256) yang saling berantai. Ini berarti SAKSI sendiri pun tidak dapat mengubah catatannya secara diam-diam tanpa merusak rantai tersebut.
3. Draf kesepakatan yang tidak pernah dibuka atau disetujui pihak lain terhapus otomatis setelah 7 hari. Mengurungkan niat atas kesepakatan yang belum terbentuk adalah hak Anda; tidak ada catatan yang tersisa.
4. Menolak kesepakatan pada tahap pengajuan (sebelum kedua pihak menyetujui) menghapus rekaman tersebut. Pihak pengaju diberi tahu secara pribadi. Tidak ada jejak publik.

## 3A. Klarifikasi sebelum laporan

Sebelum sebuah perselisihan menjadi laporan resmi (Bagian 4), SAKSI memberi ruang bagi kedua pihak untuk saling menjelaskan.

1. Jika salah satu pihak menganggap kewajiban belum dipenuhi — misalnya penjual menyatakan dana belum masuk, atau pembeli menyatakan barang tidak sesuai — pihak tersebut dapat mencatat keterangannya, dan pihak lain dapat menanggapi. Pertukaran ini dibatasi maksimal dua putaran per pihak.
2. Keterangan pada tahap ini adalah **pernyataan yang tercatat dan diatributkan kepada pihak yang menyatakannya**, bukan laporan, bukan putusan, dan bukan publikasi. Keterangan ini tidak mengubah status kesepakatan dan tidak mengubah tenggat waktunya. Keterangan dapat menyertakan satu gambar pendukung (foto atau tangkapan layar); gambar tersebut opsional, ditampilkan sebagaimana adanya tanpa penilaian keaslian oleh SAKSI, dan tunduk pada larangan bukti palsu (Bagian 6).
3. Kedua keterangan ditampilkan berdampingan pada halaman kesepakatan sehingga kedua sisi terlihat. SAKSI tidak menyimpulkan siapa yang benar; SAKSI hanya menampilkan bahwa kedua pihak berbeda pendapat.
4. Tahap klarifikasi ini bersifat sukarela dan tidak menghapus hak pihak yang dirugikan untuk mengajukan laporan resmi (Bagian 4) setelah tenggat waktu terlewati.

## 4. Publikasi catatan kesepakatan tidak terpenuhi

Bagian ini adalah inti dari SAKSI. Bacalah dengan saksama.

1. Jika sebuah kesepakatan melewati tenggat waktunya setelah ada klaim atau konfirmasi pembayaran, dan pihak yang berkewajiban tidak memenuhi kewajibannya, pihak yang dirugikan dapat mengajukan laporan.
2. Setiap laporan diajukan oleh pihak yang tercatat sebagai salah satu pihak dalam kesepakatan tersebut; identitas pelapor ditetapkan dari nomor HP yang tercatat pada kesepakatan, bukan melalui verifikasi terpisah. Setiap laporan karenanya melekat pada pihak yang mengajukannya. Laporan palsu juga tercatat permanen atas nomor HP tersebut, sehingga pelapor yang berulang kali membuat laporan tidak berdasar akan sama terlihatnya dengan pihak yang berulang kali tidak memenuhi kesepakatan.
3. Pihak terlapor diberi tahu dan memiliki **14 hari** untuk menanggapi (hak jawab, lihat Bagian 5).
4. Jika jendela 14 hari berakhir tanpa tanggapan, catatan dipublikasikan pada halaman cek SAKSI, memuat: nomor rekening tujuan (disamarkan sebagian), nama bank, tanggal, status kesepakatan, dan tingkat pembuktian yang tercapai. Pada tingkatan layanan tertentu, sidik jari nomor HP (bukan nomor HP itu sendiri) atau penanda identitas terverifikasi juga disertakan.
5. Catatan yang dipublikasikan menyatakan **apa yang tercatat dan diklaim**, bukan penilaian moral atas seseorang. Kalimat pada catatan disusun agar tetap benar pada setiap kemungkinan keadaan, termasuk jika di kemudian hari terbukti pelapor keliru.
6. **Dengan menyetujui kesepakatan di SAKSI, kedua pihak menyetujui bahwa catatan sebagaimana dijelaskan di atas dapat dipublikasikan jika kesepakatan tidak terpenuhi.** Persetujuan ini adalah dasar hukum pemrosesan dan publikasi tersebut, dan dicatat beserta versi dokumen ini pada saat Anda menyetujuinya.

## 4A. Riwayat lengkap rekening dan nomor HP

1. Selain catatan kesepakatan tidak terpenuhi (Bagian 4), SAKSI juga menampilkan riwayat lengkap sebuah nomor rekening atau nomor HP kepada siapa pun yang memeriksanya di SAKSI, mencakup kesepakatan yang selesai maupun yang tidak, tanggal, dan nomor HP pihak lain yang tercatat bertransaksi dengan rekening tersebut (dalam bentuk sidik jari nomor HP, bukan nomor HP itu sendiri, kecuali pada tingkatan layanan yang menampilkannya sebagaimana diatur pada Bagian 4).
2. Riwayat ini ditampilkan sebagai catatan peristiwa, bukan penilaian: SAKSI tidak menyimpulkan bahwa suatu pola berarti kecurangan, hanya menampilkan pola tersebut sebagai angka.
3. **Dengan menyetujui kesepakatan di SAKSI, kedua pihak menyetujui bahwa riwayat kesepakatan mereka — baik yang selesai maupun yang tidak — dapat ditampilkan sebagai bagian dari riwayat lengkap rekening atau nomor HP yang digunakan, sebagaimana dijelaskan di atas.** Persetujuan ini adalah dasar hukum pemrosesan dan publikasi tersebut, dicatat beserta versi dokumen ini pada saat Anda menyetujuinya, dan berlaku terpisah dari persetujuan Bagian 4 mengenai catatan tidak terpenuhi.

## 5. Hak jawab dan klaim berbeda

1. Pihak terlapor dapat menanggapi laporan dalam 14 hari sejak pemberitahuan.
2. Tanggapan pihak terlapor, dengan atau tanpa bukti pendukung, mengubah status catatan menjadi **klaim berbeda**. Catatan yang klaim berbeda menampilkan bantahan tersebut; SAKSI tidak memutus siapa yang benar.
3. Jika setelah membantah pihak terlapor tidak melanjutkan tanggapan dalam 14 hari berikutnya, catatan mencantumkan bahwa terlapor tidak merespons dalam 14 hari.
4. Kesepakatan yang kemudian dipenuhi setelah tercatat tidak terpenuhi dapat diperbarui statusnya atas konfirmasi kedua pihak. Riwayat sebelumnya tetap tercatat; pemenuhan yang terlambat tercatat sebagai pemenuhan yang terlambat, bukan sebagai penghapusan.

## 6. Larangan bukti palsu

1. Setiap bukti (bukti transfer, bukti pengembalian dana, atau gambar pendukung yang dilampirkan pada keterangan klarifikasi) yang Anda unggah harus asli dan belum diubah. Anda menyatakan hal ini melalui centang wajib pada saat mengunggah.
2. Mengunggah bukti palsu atau yang telah dimanipulasi adalah tanggung jawab hukum Anda sepenuhnya, termasuk kemungkinan tuntutan pidana dari pihak yang dirugikan.
3. Pemeriksaan otomatis SAKSI atas bukti adalah **pemeriksaan konsistensi** (kecocokan nominal, tanggal, dan rekening tujuan dengan rekaman kesepakatan), bukan pemeriksaan keaslian. Bukti yang lolos pemeriksaan konsistensi tidak berarti asli; bukti yang tidak lolos tercatat sebagai tidak konsisten dan ketidakcocokan itu sendiri menjadi bagian dari catatan.
4. SAKSI dapat menolak, menandai, atau membekukan rekaman yang diyakini secara wajar memuat bukti palsu, penyalahgunaan identitas, atau penggunaan yang melanggar hukum.

## 7. Biaya

1. Saat ini **tingkatan berbayar belum aktif.** Membuat tagihan, mengirim link, mencatat pembayaran, mengklarifikasi, dan melaporkan kesepakatan tidak terpenuhi belum dikenai biaya.
2. SAKSI akan menyediakan dua tingkatan berbayar sebagai layanan tambahan bagi penjual: **Akun Saksi (Rp20.000, sekali bayar)** — login HP, data rekening tersimpan, lencana rekam jejak ditampilkan; dan **Toko Saksi Pro (Rp200.000/tahun)** — logo penjual di tagihan, dan halaman toko sendiri (`saksi.app/namatoko`). Tingkatan berbayar menambah **kemudahan dan tampilan bagi penjual**, bukan jaminan atas pihak lain dan bukan tingkat keamanan kesepakatan.
3. Rekam jejak yang Anda bangun — jumlah kesepakatan selesai, umur akun, riwayat — **tidak dapat dibeli dan tidak diperjualbelikan.** Membayar tingkatan apa pun tidak pernah menambah, memalsukan, atau mempercepat rekam jejak; rekam jejak hanya terbentuk dari kesepakatan nyata seiring waktu.
4. Ketika tingkatan berbayar aktif, rinciannya — harga, apa yang termasuk, dan ketentuan pengembalian — akan dijelaskan pada saat pembelian dan dalam versi dokumen ini yang berlaku saat itu. Sampai saat itu, tidak ada biaya apa pun yang dikenakan.

## 8. Batasan tanggung jawab

1. SAKSI menyediakan pencatatan sebagaimana adanya. SAKSI tidak menjamin pihak lain akan memenuhi kesepakatannya, tidak menjamin kebenaran klaim para pihak, dan tidak bertanggung jawab atas kerugian dari transaksi antara para pihak.
2. SAKSI berupaya menjaga ketersediaan layanan dan keutuhan catatan, termasuk pencadangan berkala di luar penyedia utama, tetapi tidak menjamin layanan bebas gangguan.
3. Tidak ada dalam dokumen ini yang menghapus hak Anda yang tidak dapat dikesampingkan menurut hukum Indonesia.

## 9. Perubahan Syarat & Ketentuan

1. SAKSI dapat mengubah dokumen ini. Setiap versi diberi nomor, tanggal berlaku, dan hash SHA-256.
2. Perubahan tidak berlaku surut: kesepakatan yang sudah disetujui tetap tunduk pada versi yang berlaku saat persetujuan, sebagaimana tercatat dalam rekaman kesepakatan itu.

## 10. Hukum yang berlaku

Syarat & Ketentuan ini tunduk pada hukum Republik Indonesia, termasuk Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Pengelolaan data pribadi Anda dijelaskan terpisah dalam Kebijakan Privasi & Retensi Data, yang merupakan satu kesatuan dengan dokumen ini.

---

*Pertanyaan tentang dokumen ini: sapa@saksi.app. Cek keaslian catatan hanya di saksi.app, bukan .com, bukan .id, bukan yang lain.*
