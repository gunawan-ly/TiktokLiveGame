# Studio Photo Live TikTok

Overlay photo booth pseudo-3D untuk OBS/TikTok LIVE Studio. Gift TikTok masuk lewat
connector Python, dikirim ke overlay lewat WebSocket lokal, lalu dicetak oleh
**mesin roller** milik sendiri.

## Desain v3 — Roller Printer

Overlay memakai mesin cetak kinetik ala plotter/printer 3D:

- **Kepala cetak** bergerak dua sumbu di atas rel atasnya, menekan dan menggambar
  tiap pengiriman tiap: kolom 1 → 2 → 3, berpindah baris dengan kertas bergulir.
- **Fase cetak** diturunkan dari `printDurationMs`: `move` (geser kolom) 26%,
  `press` (tekanan) 10%, `draw` (menggambar) 44%, `lift` (hitung) 20%, `feed`
  (kertas bergulir) 23%.
- **Kertas cetak** bergaya vintage, 3 baris × 3 kolom. Baris yang turun ke roller
  bawah, snapshot salinan mini ke **drum** di atas gulungan (maks 7, `maxRollPhotos`).
- **Bingkai tier mewah** dalam bentuk **cincin perhiasan di keliling foto**:
  - **Perunggu**: cincin copper dengan sheen facet (khusus jalur like).
  - **Perak**: cincin satin putih-biru dan multitint.
  - **Emas**: cincin kuning berkilau multi-stop + kilat.
  - **Berlian**: cincin ice dengan rotasi perlahan + luster glow.
  - Cincin menggambar setengah putaran mulai dari atas (`--draw`) setiap cetakan,
    lalu sweep kilau sekali ketika selesai.
- **Nama pengirim** digambar ketik per huruf mengikuti fase drawing; tier
  muncul sebagai badge pill di pinggir bingkai.
- **UI studio**: judul besar, crest mesin dengan counter LIVE, HUD (TERCETAK /
  TARGET KOIN / ANTREAN), toast.

- Target koin default: **500**
- Tier gift (dari total akumulasi koin per penonton dalam satu sesi):
  Standar <10, Perak 10+, Emas 50+, Berlian 200+; Perunggu
  khusus like (frame avatar strip Top Tap-Tap, bukan dari gift)
- Slot foto aktif: **9** (kertas mesin), gulungan: **7**
- Overlay: `http://127.0.0.1:5173/overlay/`
- WebSocket: `ws://127.0.0.1:8080`
- Resolusi desain: **1080 × 1920**

## Struktur

```
connector/          Connector TikTok LIVE, mock feed, combo, bridge, log
overlay/            Overlay HTML/CSS/JS untuk OBS
config/game.json    Konfigurasi visual dan tier
tests/              Unit test Python dan Node
logs/               Log sesi JSONL (tidak berisi URL avatar)
```

## Mulai Cepat (Mock, Tanpa TikTok)

Prasyarat: Python 3.10+ dan Node.js 20+. Implementasi ini diuji dengan Python 3.15
dan Node 24.

```bash
cd /Users/runner/Desktop/TiktokLiveGame

python3 -m venv .venv
.venv/bin/pip install -r connector/requirements.txt

cp .env.example .env
```

Jalankan server overlay di terminal pertama:

```bash
python3 -m http.server 5173 --bind 127.0.0.1
```

Jalankan connector mock di terminal kedua:

```bash
.venv/bin/python -m connector.main --mock --mock-interval 1.5
```

Buka:

```
http://127.0.0.1:5173/overlay/
```

Connector mock mengirim combo, tier Standar sampai Berlian, avatar rusak, dan burst
gift tanpa API key. Hentikan connector dengan `Ctrl+C`; log sesi dan statistik akhir
tetap ditulis ke `logs/`.

## Live TikTok

1. Isi `.env`:

```dotenv
TIKTOK_USERNAME=@username_akun
SIGN_API_KEY=api_key_euler_stream
```

`EULER_API_KEY` juga didukung sebagai alias jika `SIGN_API_KEY` kosong. API key
diperlukan untuk signing request TikTok webcast; mode mock tidak memerlukannya.

2. Pastikan akun sedang live.
3. Jalankan connector:

```bash
.venv/bin/python -m connector.main
```

Override username tanpa mengubah `.env`:

```bash
.venv/bin/python -m connector.main --username @akun_lain --verbose
```

Jika room belum live, connector menampilkan status `waiting` dan mencoba lagi. Saat
koneksi terputus, backoff dimulai dari 5 detik sampai maksimum 30 detik.

## OBS / TikTok LIVE Studio

Tambahkan **Browser Source** dengan:

- URL: `http://127.0.0.1:5173/overlay/`
- Width: `1080`
- Height: `1440` (rasio 3:4, target utama live; `1080` persegi dan `1920` potret tetap didukung)
- FPS: `30` atau `60`
- Centang **Shutdown source when not visible** dan **Refresh browser when scene becomes active**
  agar overlay selalu memuat snapshot terbaru saat scene dibuka.

Pastikan server overlay dan connector berjalan sebelum scene diaktifkan. Overlay
tidak memerlukan audio; sound effect nonaktif secara default. Bila diaktifkan,
suaranya berlapis mengikuti mesin: bunyi proses selama kartu dicetak, desis kertas
saat kertas maju, bunyi lembut saat kartu pindah ke gulungan, dan nada selesai yang
makin meriah per tingkat bingkai. Semuanya disintesis WebAudio, tanpa file audio.

Backsound live memakai playlist lo-fi (2 lagu, loop berurutan) yang juga
nonaktif secara default; aktifkan dengan `?music=1`. Volumenya sengaja kecil
(0.15) sementara master bunyi aksi 0.4, supaya bunyi aksi selalu lebih
terdengar daripada musik. Daftar lagu, lisensi CC BY, dan teks kredit
yang ditampilkan lewat running teks ada di `overlay/assets/music/README.md`.

Running teks ada dua strip, model marquee klasik: teks muncul dari
kanan, berjalan ke kiri sampai hilang, lalu muncul lagi dari kanan.
Strip atas untuk info arahan live (di atas scene, supaya tidak terhalang
kolom komentar TikTok yang menutupi area bawah layar); pesannya dari
`ticker.messages` di `config/game.json`. Strip bawah khusus credits;
pesannya dari `tickerCredits.messages`. Keduanya bisa dimatikan terpisah
dengan `?ticker=0` dan `?tickerCredits=0`.

Cetak Zamrud adalah reward tap-tap: profil penonton dicetak dengan
bingkai zamrud saat total like-nya dalam satu sesi mencapai
`engagement.likeThreshold` (default 500, diatur di `config/game.json`;
connector juga menerima override env `LIKE_THRESHOLD`, berguna untuk uji
live dengan ambang kecil). Cetakan diberikan di setiap kelipatan ambang
(500, 1.000, 1.500, ...) per penonton per sesi connector, menambah
hitungan tercetak tanpa menambah koin. Tombol
"Zamrud · Tap 500" di panel debug (`?debug=1`) mensimulasikannya tanpa
connector.

## Konfigurasi

Edit `config/game.json`:

```json
{
  "title": "STUDIO PHOTO",
  "subtitle": "LIVE PHOTO BOOTH",
  "targetCoins": 500,
  "maxQueueItems": 100,
  "senderGapMs": 4000,
  "printDurationMs": 2000,
  "toastDurationMs": 5000,
  "tiers": {
    "bronze": { "minCoins": 10, "label": "PERUNGGU" },
    "silver": { "minCoins": 10, "label": "PERAK" },
    "gold": { "minCoins": 50, "label": "EMAS" },
    "diamond": { "minCoins": 200, "label": "BERLIAN" }
  }
}
```

Threshold gift (perak, emas, berlian) harus naik berurutan; bronze jalur
like tidak ikut rantai ini. Nilai yang tidak valid akan dikoreksi atau diabaikan
oleh overlay. Target yang tampil di HUD berasal dari `config/game.json` atau parameter
`?target=`; `TARGET_COINS` di `.env` adalah metadata target sesi pada connector.

### Jeda per pengirim dan batas antrean

- `senderGapMs` (default 4000) adalah jeda minimum antar cetakan dari pengirim yang
  sama. Overlay memakai strategi *skip-ahead*: langsung mengeksekusi antrean dari
  pengirim lain, item pengirim yang sedang dalam jeda dita­han sampai jeda selesai.
  Setel `0` untuk mematikan (urutan FIFO murni).
- `maxQueueItems` (default 100, batas 1-1000) membatasi panjang antrean. Gift yang
  datang saat antrean penuh ditolak dan HUD menampilkan **ANTREAN PENUH** selama
  3 detik. Gift yang ditolak tidak dapat dikembalikan; besarkan `maxQueueItems`
  atau jalankan sesi yang rapi jika volume gift sangat tinggi.

### Parameter URL

| Parameter | Contoh | Fungsi |
| --- | --- | --- |
| `debug` | `?debug=1` | Panel tes: tier, avatar rusak, antrean, kosongkan antrean |
| `sim` | `?sim=1` | Simulasi lokal tanpa connector/WebSocket |
| `ws` | `?ws=ws://127.0.0.1:8080` | Override alamat WebSocket |
| `target` | `?target=1000` | Override target koin |
| `gap` | `?gap=8000` | Jeda cetakan per pengirim (0-60.000 ms, 0 = nonaktif) |
| `queue` | `?queue=50` | Batas antrean cetak (1-1000) |
| `duration` | `?duration=1500` | Durasi cetak per kartu (1200–4000 ms) |
| `toast` | `?toast=4000` | Durasi toast (3000–12000 ms) |
| `title` | `?title=NAMA%20STUDIO` | Override judul |
| `subtitle` | `?subtitle=LIVE%20PHOTO%20BOOTH` | Override subjudul |
| `sound` | `?sound=1` | Aktifkan sound effect |
| `music` | `?music=1` | Aktifkan backsound lo-fi (playlist loop) |
| `ticker` | `?ticker=0` | Matikan running teks info (strip atas) |
| `tickerCredits` | `?tickerCredits=0` | Matikan running teks credits (strip bawah) |

Gunakan `?sim=1&sound=1&music=1` untuk demo audio lengkap. Browser dapat meminta interaksi pengguna
sebelum audio diputar.

### API Debug

Dari DevTools console:

```js
StudioPhoto.pushGift({
  eventId: "test-1",
  user: { displayName: "Tester", username: "tester", avatarUrl: "" },
  gift: { name: "Mawar", repeat: 1, coinsPerItem: 500, totalCoins: 500 },
});

StudioPhoto.getState();
StudioPhoto.clearQueue();
```

Payload connector memakai bentuk `user`, `gift`, `eventId`, dan timestamp. `totalCoins`
akan dihitung dari `repeat × coinsPerItem` jika tidak dikirim.

## Test

```bash
.venv/bin/python -m pytest -q
npm test
```

Unit test mencakup normalisasi payload, keamanan URL avatar, queue FIFO, dedupe,
cap antrean, jeda antar pengirim, dan batas tier. Test tidak memerlukan koneksi TikTok.

Verifikasi visual yang sudah dilakukan:

- Mesin cetak v3: fase move/press/draw/lift/feed berjalan; kepala cetak berpindah
  kolom 1 → 2 → 3; kertas bergulir tiap 3 foto dan baris lama melilit roller bawah.
- Cincin tier Perunggu/Perak/Emas/Berlian tergambar, badge tier muncul, nama
  pengirim diketik mengikuti fase drawing.
- Snapshot gulungan: foto lebih lama muncul sebagai mini avatar ber-dot accent tier
  di drum, counter GULUNGAN akurat (maks 7).
- Kertas kosong bergaya dashed halo; slot tercetak tidak menyisakan artefak.
- Koneksi TikTok LIVE dengan signing Euler Stream dan penerimaan gift nyata sudah diuji.

Belum diverifikasi:

- Sesi nonstop 60 menit dengan volume gift tinggi.
- Tampilan langsung di OBS/TikTok LIVE Studio (verifikasi visual memakai Chromium headless).

## Troubleshooting

**Overlay menampilkan `MENYAMBUNG` / `OFFLINE`**
Pastikan connector berjalan dan port 8080 tidak dipakai proses lain:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

**Halaman overlay kosong**
Jalankan lewat HTTP server, jangan buka `overlay/index.html` langsung. ES module dan
fetch config memerlukan origin HTTP.

**Port 5173 sudah dipakai**
Jalankan server di port lain:

```bash
python3 -m http.server 5174 --bind 127.0.0.1
```

Lalu buka `http://127.0.0.1:5174/overlay/` dan set `?ws=ws://127.0.0.1:8080` bila perlu.

**Avatar tidak muncul**
Avatar TikTok dapat gagal dimuat karena CDN/CORS. Overlay otomatis memakai inisial
nama. Ini bukan error kritis.

**HUD menampilkan ANTREAN PENUH (merah)**
Antrean mencapai `maxQueueItems`; gift baru ditolak sampai antrean menyusut.
Periksa panel debug untuk melihat panjang antrean, atau besarkan `?queue=` bila
volume gift memang tinggi. Jeda pengirim (`senderGapMs`) mencegah satu orang
memenuhi antrean sejak awal.

**Jumlah TERCETAK lebih besar dari jumlah kartu**
Overlay memakai snapshot jumlah cetak dari connector. Jika overlay di-refresh di
tengah sesi, HUD tetap mengikuti total sesi connector, sedangkan kartu aktif mulai
dari kosong. Ini disengaja.

**Live gagal tersambung**
Periksa username, status live, dan `SIGN_API_KEY`. Tanpa API key, koneksi live dapat
dibatasi oleh Euler Stream. Log connector menampilkan alasan kegagalan tanpa
menyimpan URL avatar.

## Keamanan

- Jangan bind WebSocket ke `0.0.0.0`; konfigurasi menolak host selain localhost.
- Jangan commit `.env`, API key, atau log sesi.
- Connector hanya mengirim username, display name, nama gift, repeat, dan koin.
- Hanya URL avatar `http/https` yang diterima overlay; skema berbahaya ditolak.
- Server overlay sengaja memakai `127.0.0.1` agar tidak terbuka ke jaringan.

## Aset

Font **Baloo 2** disertakan di `overlay/assets/fonts/` beserta lisensi SIL Open Font
License di `overlay/assets/fonts/OFL.txt`. Avatar contoh adalah SVG lokal di
`overlay/assets/avatars/`.
