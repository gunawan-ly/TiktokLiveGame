# AGENTS.md - Studio Photo Live TikTok (TiktokLiveGame)

Instruksi untuk AI agent yang bekerja di repo ini. Baca file ini sebelum mengubah
apa pun. Pemilik repo: Awan (GitHub `gunawan-ly`). Bahasa komunikasi dan dokumentasi:
Bahasa Indonesia.

## 1. Proyek ini apa

Game live interaktif TikTok: penonton mengirim gift saat LIVE, foto profil pengirim
"tercetak" satu per satu oleh mesin printer virtual di overlay yang tampil di OBS /
TikTok LIVE Studio, lengkap dengan username dan bingkai bertingkat sesuai total koin.

Alur data (jangan ubah arsitektur ini tanpa persetujuan pemilik):

```text
TikTok LIVE (webcast)
  -> connector/ (Python, library TikTokLive, signing via Euler Stream)
  -> bridge WebSocket lokal ws://127.0.0.1:8080
  -> overlay/ (HTML/CSS/JS murni, tanpa build step)
  -> OBS Browser Source 1080x1080 (persegi untuk live; potret tetap didukung)
```

TikTok tidak punya API publik resmi untuk ini. Connector cukup memakai username
publik akun yang live, TIDAK memakai password akun. Request webcast wajib
ditandatangani; di sinilah Euler Stream dipakai (free tier, API key di `.env`).

## 2. Peta folder

```text
connector/       Connector Python: main, bridge, combo, normalizer, config,
                 mock_feed, session_log, requirements.txt
overlay/         Overlay web: index.html, js/ (app, config, debug, machine,
                 music, normalize, queue, render, simulate, sound, tiers, ws),
                 styles/ (base, cards, effects, scene), assets/ (music lo-fi,
                 font, avatar)
config/game.json Sumber kebenaran konfigurasi game (tier, target, antrean)
tests/           Test Node (*.test.mjs) dan test Python (test_*.py)
logs/            Log sesi JSONL. Jangan commit. Tidak boleh berisi URL avatar.
```

Dokumen acuan: `README.md` (cara pakai) dan `PRD Studio Photo v1.1` (kebutuhan
fungsional ber-ID: CON, BRG, GAM, CFG). Kalau perilaku berubah, perbarui keduanya.

## 3. Cara menjalankan

Prasyarat: Python 3.10+ dan Node.js 20+. Lingkungan utama pemilik: **Windows**
(pakai `py` dan jalur `.venv\Scripts\...`). Di macOS/Linux jalur venv `.venv/bin/...`.

Persiapan sekali:

```bat
py -m venv .venv
.venv\Scripts\python -m pip install -r connector\requirements.txt
copy .env.example .env
```

Isi `.env`: `TIKTOK_USERNAME=@akun_yang_live` dan `SIGN_API_KEY=<key Euler Stream>`
(`EULER_API_KEY` didukung sebagai alias bila `SIGN_API_KEY` kosong).

Mode demo (tanpa TikTok, tanpa API key, gift palsu termasuk semua tier):

```bat
.venv\Scripts\python -m http.server 5173 --bind 127.0.0.1
.venv\Scripts\python -m connector.main --mock --mock-interval 1.5
```

Mode live (akun harus sedang live; kalau belum, connector berstatus `waiting`
dan menyambung sendiri, reconnect backoff 5 sampai 30 detik):

```bat
.venv\Scripts\python -m http.server 5173 --bind 127.0.0.1
.venv\Scripts\python -m connector.main
```

OBS: Browser Source ke `http://127.0.0.1:5173/overlay/`, 1080x1920, centang
"Shutdown source when not visible" dan "Refresh browser when scene becomes active".

Penting: server HTTP **wajib jalan dari root repo**, karena `overlay/js/config.js`
memuat `../../config/game.json`. Mengganti `.env` cukup menjalankan ulang
connector; Browser Source tidak perlu dibuat ulang, cukup refresh bila perlu.

## 4. Protokol bridge (connector -> overlay)

Satu pesan JSON per **combo yang selesai**, bukan per ketukan gift. Event mentah
TikTok mengirim `repeatCount` yang naik terus selama combo dan `repeatEnd`;
connector (lihat `connector/combo.py`) hanya menerbitkan aksi saat combo selesai
dengan total terakhir. Jangan pernah mencetak per event mentah, hasilnya dobel.

Tipe pesan: `gift`, `status`, `snapshot` (statistik sesi: `printed`, `totalCoins`).
Setiap gift wajib punya `eventId` unik; overlay menolak duplikat berdasar itu.
Skema gift ter-normalisasi ada di `overlay/js/normalize.js` dan
`connector/normalizer.py`; ubah keduanya bersamaan atau jangan sama sekali.

## 5. Aturan game (jangan diubah diam-diam)

Nilai berlaku ada di `config/game.json`, angka di bawah ini cerminannya:

- Tier gift dari total koin per combo: standar di bawah 10, **Perak 10+,
  Emas 50+, Berlian 200+**. **Perunggu khusus jalur like** (frame avatar
  strip Top Tap-Tap, bukan dari gift) dan tidak pernah dihasilkan
  `tierForCoins`. Label: PERUNGGU, PERAK, EMAS, BERLIAN.
- Target koin per sesi: 500. Slot foto aktif 9 (grid 3x3), gulungan foto 7.
- Antrean cetak FIFO, kapasitas **100** item (`maxQueueItems`); penuh = gift
  ditolak dengan indikator "ANTREAN PENUH", bukan ditumpuk tanpa batas.
- Cooldown per pengirim **4.000 ms** (`senderGapMs`) dengan **skip-ahead**:
  selama satu pengirim cooldown, gift pengirim lain tetap dicetak duluan;
  kalau semua antrean cooldown, mesin menunggu (timer), bukan membuang gift.
- Satu orang satu cetakan per combo selesai. Dedupe eventId disimpan maks 2.000.
- Durasi cetak per foto di-clamp 1.200-4.000 ms (default 2.000 ms).

## 6. Keamanan (wajib, tidak bisa ditawar)

- Data penonton (nama, username) adalah data tidak tepercaya: render selalu
  lewat `textContent`/`createElement`. **Dilarang `innerHTML`** dari data gift.
- URL avatar wajib lewat validasi skema di `normalize.js` (`isSafeAvatarUrl`):
  hanya http/https, data:image tertentu, atau path relatif. Gambar pakai
  `referrerPolicy: "no-referrer"` dan selalu ada fallback inisial bila gagal.
- API key Euler hanya di `.env` (sudah di-`.gitignore`). Jangan pernah menulis
  key, token, atau password ke kode, README, log, atau pesan commit.
- WebSocket bridge hanya bind `127.0.0.1`. Jangan buka ke jaringan lokal/LAN.
- Error 401 dari `api.eulerstream.com` ("The provided API Key is invalid")
  artinya key di `.env` salah/terpotong, bukan bug kode. Jangan "memperbaiki"
  kode untuk error ini; perbaiki key-nya.

## 7. Test dan verifikasi

Sebelum menyatakan pekerjaan selesai, jalankan dan laporkan hasilnya apa adanya:

```bat
npm test
.venv\Scripts\python -m pytest tests/ -q
```

- `npm test` menjalankan `node --test tests/*.test.mjs` (normalize, queue, tiers).
- Perubahan di `overlay/js/machine.js` wajib diverifikasi visual/DOM, bukan
  cuma dibaca: jalankan mode mock dan cetak minimal 7 foto (melewati 2x umpan
  kertas), atau uji PrintMachine di jsdom. Lihat bagian 8 untuk alasannya.
- Perubahan connector: verifikasi dengan mode mock dulu, baru mode live.

## 8. Masalah yang diketahui (status 24 Okt 2026, hasil review)

1. **BUG `feed()` di `overlay/js/machine.js` - SUDAH DIPERBAIKI (24 Okt 2026).**
   Dulu: mulai umpan kertas kedua, dua baris penuh bertumpuk di `--slot` yang
   sama (slot tengah kosong) dan `_snapshotToDrum()` selalu kena baris kosong
   sehingga foto tidak masuk gulungan tepat waktu. Akarnya: setelah rotasi
   array baris, `--slot` hanya dipasang untuk `rows[0]`/`rows[1]`, dan
   `rows[0]` pasca-`unshift` adalah baris keluar itu sendiri.
   Invariant yang sekarang wajib dijaga: sesudah setiap umpan, ketiga baris
   punya `--slot` unik 0/1/2 sesuai urutan tampilnya (baris keluar meluncur ke
   slot 3 lalu didaur ulang ke slot 0), dan baris terbawah yang keluar adalah
   yang ter-snapshot ke gulungan. Dijaga oleh test regresi
   `tests/machine.test.mjs`; jangan ubah `feed()` tanpa menjalankan test itu.
2. `maxActivePhotos` di `config/game.json` saat ini **tidak dipakai** kode;
   grid hardcoded 3x3 di `machine.js` (`COLS`/`ROWS`). Samakan salah satu.
3. `PHASES.liftFeed` / `liftFeedMs` di `machine.js` adalah kode mati.
4. Test DOM untuk `machine.js` sudah ada (`tests/machine.test.mjs`, stub DOM
   tanpa dependensi baru). Perilaku visual lain (animasi CSS di `styles/`)
   tetap diverifikasi manual lewat mode mock.

## 9. Alur git

- Branch aktif pengembangan: `redesign/overlay-v2`. `main` masih versi awal
  yang stabil dan sudah terbukti live (uji live pertama berhasil 23 Okt 2026
  memakai desain v2).
- **Jangan push dan jangan merge tanpa persetujuan pemilik.** Merge ke `main`
  mensyaratkan: test bagian 7 lulus, bug bagian 8 nomor 1 sudah beres, dan
  pemilik sudah melihat ringkasan perubahan.
- Gaya pesan commit repo ini: singkat, deskriptif, bahasa Inggris
  (contoh: "Redesign overlay v2: warm analog studio, portrait photo cards").
- Jangan commit: `.env`, folder `logs/`, `.venv/`, `node_modules/`.
- File screenshot `Screenshot_*.jpg` di root adalah referensi desain dari
  pemilik, biarkan apa adanya.

## 10. Definisi selesai untuk agent

Pekerjaan baru dianggap selesai bila: test lulus dan dilaporkan, perubahan
terverifikasi sesuai bagian 7, tidak ada aturan bagian 5 dan 6 yang dilanggar,
dan ringkasan perubahan disampaikan ke pemilik untuk persetujuan langkah
berikutnya (push/merge bukan bagian dari "selesai" tanpa izin pemilik).
