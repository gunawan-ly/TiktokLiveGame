# Studio Photo Live TikTok

Overlay photo booth pseudo-3D untuk OBS/TikTok LIVE Studio. Gift TikTok masuk lewat
connector Python, dikirim ke overlay lewat WebSocket lokal, lalu dicetak menjadi kartu
foto dengan bingkai tier, animasi printer, toast, dan gulungan foto.

- Target koin default: **500**
- Tier: Perunggu 10+, Perak 100+, Emas 500+, Berlian 5.000+
- Slot foto aktif: **9**, gulungan: **7**
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

Connector mock mengirim combo, tier Perunggu sampai Berlian, avatar rusak, dan burst
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
- Height: `1920`
- FPS: `30` atau `60`
- Centang **Shutdown source when not visible** dan **Refresh browser when scene becomes active**
  agar overlay selalu memuat snapshot terbaru saat scene dibuka.

Pastikan server overlay dan connector berjalan sebelum scene diaktifkan. Overlay
tidak memerlukan audio; sound effect nonaktif secara default.

## Konfigurasi

Edit `config/game.json`:

```json
{
  "title": "STUDIO PHOTO",
  "subtitle": "LIVE PHOTO BOOTH",
  "targetCoins": 500,
  "printDurationMs": 2000,
  "toastDurationMs": 5000,
  "tiers": {
    "bronze": { "minCoins": 10, "label": "PERUNGGU" },
    "silver": { "minCoins": 100, "label": "PERAK" },
    "gold": { "minCoins": 500, "label": "EMAS" },
    "diamond": { "minCoins": 5000, "label": "BERLIAN" }
  }
}
```

Threshold harus naik berurutan. Nilai yang tidak valid akan dikoreksi atau diabaikan
oleh overlay. Target yang tampil di HUD berasal dari `config/game.json` atau parameter
`?target=`; `TARGET_COINS` di `.env` adalah metadata target sesi pada connector.

### Parameter URL

| Parameter | Contoh | Fungsi |
| --- | --- | --- |
| `debug` | `?debug=1` | Panel tes: tier, avatar rusak, antrean, kosongkan antrean |
| `sim` | `?sim=1` | Simulasi lokal tanpa connector/WebSocket |
| `ws` | `?ws=ws://127.0.0.1:8080` | Override alamat WebSocket |
| `target` | `?target=1000` | Override target koin |
| `duration` | `?duration=1500` | Durasi cetak per kartu (1200–4000 ms) |
| `toast` | `?toast=4000` | Durasi toast (3000–12000 ms) |
| `title` | `?title=NAMA%20STUDIO` | Override judul |
| `subtitle` | `?subtitle=LIVE%20PHOTO%20BOOTH` | Override subjudul |
| `sound` | `?sound=1` | Aktifkan sound effect |

Gunakan `?sim=1&sound=1` untuk demo audio. Browser dapat meminta interaksi pengguna
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

Unit test mencakup normalisasi payload, keamanan URL avatar, queue FIFO, dedupe, dan
batas tier. Test tidak memerlukan koneksi TikTok.

Verifikasi visual yang sudah dilakukan:

- Semua tier tampil dengan label, warna, dan avatar yang benar.
- Setelah 13 gift: 9 kartu, 4 foto di gulungan, 0 slot kosong, 2 toast.
- Avatar gagal dimuat menampilkan inisial tanpa merusak layout.
- Debug panel tidak menutupi HUD.
- Mode mock end-to-end dan shutdown graceful sudah diuji.
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
