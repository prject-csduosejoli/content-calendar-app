# Panduan Deploy Kalender Konten ke Cloudflare Workers + D1

**Lokal:** `D:\IT SUPPORT\`
**Repo:** https://github.com/prject-csduosejoli/content-calendar-app
**Commit terakhir:** `e6b4510`
**Node:** v26.7.0 (punya `node:sqlite` — wajib, buat test)

**Status:** Worker sudah LIVE di https://kalender-konten-golden.csduosejoli.workers.dev
D1 sudah dibuat (`kalender-konten-golden`, `num_tables: 1`) dan schema sudah terpasang.
`ADMIN_KEY` masih perlu kamu set sendiri dengan kunci punyamu — jangan pakai kunci
contoh di bawah.

`npm test` = 73 test (43 handler + 30 router), semua lulus.

---

## Yang Sudah Selesai

| File | Isi |
|---|---|
| `worker.js` | Router: `/health`, `/api/calendar`, assets. Gate `ADMIN_KEY` untuk POST |
| `api/calendar.js` | `GET /api/calendar?ym=2026-10` · `POST /api/calendar` (UPSERT) |
| `schema.sql` | 1 tabel `calendar_months`, 1 baris per bulan |
| `index.html` | Frontend kalender Oktober 2026, 11 hari besar |
| `public/index.html` | Hasil build — satu-satunya file yang di-deploy |
| `tests/calendar.test.mjs` | 43 test handler API |
| `tests/worker.test.mjs` | 30 test router + gate auth + tidak bocor |
| `scripts/build.mjs` | Salin `index.html` ke `public/` |
| `wrangler.toml` | `main`, `[assets]`, komentar setup |
| `package.json` | Script npm + dependency `wrangler` |

## Perintah yang Sering Dipakai

```bash
cd "D:/IT SUPPORT"

npm test          # 73 test
npm run build     # index.html -> public/
npm run dev       # build + wrangler dev (server lokal)
npm run deploy    # build + wrangler deploy
npm run db:init   # schema.sql -> D1 (remote)
```

---

# LANGKAH 0 — Install Dependency

Sekali saja. Perintah npm butuh `wrangler` terpasang lokal.

```bash
cd "D:/IT SUPPORT"
npm install
```

Akan muncul `added N packages`. Folder `node_modules/` tidak ikut ke git
sudah diatur di `.gitignore`.

# LANGKAH 1 — Login Wrangler

Token GitHub sudah ada di Windows Credential Manager, tapi **Cloudflare belum**.

```bash
cd "D:/IT SUPPORT"
npx wrangler login
```

Yang terjadi:

1. Browser terbuka ke halaman login Cloudflare
2. Klik **Allow** / **Authorize**
3. Terminal menampilkan `Successfully logged in`
4. Verifikasi:

```bash
npx wrangler whoami
```

Harus muncul namamu + email, bukan `You are not authenticated`.

> Kalau browser tidak terbuka otomatis, salin URL dari terminal dan paste di
> browser manual. Terminal menunggu sampai kamu selesai di browser — jangan
> ditutup.

---

# LANGKAH 2 — Bikin Database D1

```bash
npx wrangler d1 create kalender-konten-golden
```

Outputnya kira-kira begini:

```
Creating Cloudflare D1 database...
Success! Created your D1 database.

[[d1_databases]]
binding = "DB"
database_name = "kalender-konten-golden"
database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
migrations_dir = "migrations"
```

**Salin `database_id` itu.** Lalu buka `wrangler.toml` dan isi di dalam blok
`[[d1_databases]]`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "kalender-konten-golden"
database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

> **WAJIB ada di blok `[[d1_databases]]`.** Kalau `database_id` ditulis langsung
> di bawah blok `[assets]`, wrangler hanya memberi warning
> `Unexpected fields found in assets field` lalu **mengabaikannya diam-diam**.
> Worker tetap jalan, `/health` masih balas `storage: cloudflare-d1`, tapi
> `/api/calendar` balas `"D1 binding DB belum dipasang"`. Gejalanya sangat
> membingungkan karena `/health` bilang binding ada.

Alternatif: pasang lewat dashboard (**Settings -> Bindings -> D1 database**,
variable name `DB`). Tidak perlu edit file, tapi `wrangler.toml` lokal jadi tidak
lengkap.

---

# LANGKAH 3 — Isi Skema Database

```bash
npm run db:init
```

Perintah ini menjalankan `schema.sql` terhadap database **remote**.

Output sukses:

```
Executing on remote database kalender-konten-golden...
Executing 1 statement on remote database kalender-konten-golden...
Success!
```

Cek tabelnya sudah ada:

```bash
npx wrangler d1 execute kalender-konten-golden --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Harus muncul `calendar_months`. Kalau `no such table`, ulangi `npm run db:init`.

---

# LANGKAH 4 — Set ADMIN_KEY

Ini yang mengunci penambahan konten. Tanpa ini, semua POST ditolak.

> **Worker harus sudah di-deploy dulu (Langkah 5).** `wrangler secret put` gagal
> dengan pesan `If this is a new Worker, run wrangler deploy first` kalau Worker
> belum pernah dibuat. Kalau kamu sampai di sini dan dapat error itu, deploy dulu
> lalu ulangi langkah ini.

Buat dulu kuncinya dengan tool bawaan Node, tanpa install apa pun:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Salin hasilnya. Lalu set sebagai secret:

```bash
npx wrangler secret put ADMIN_KEY
```

Wrangler akan menampilkan:

```
Enter a secret value: ___________________________
```

**Tempel kuncimu, lalu tekan Enter.** Teks yang diketik tidak akan muncul di
layar — itu normal, bukan error.

Lalu verifikasi (nilai disembunyikan, cuma cek panjang):

```bash
npx wrangler secret list
```

Harus ada `ADMIN_KEY`. Nilai tidak pernah ditampilkan lagi setelah disimpan.

> **Jangan** tulis `ADMIN_KEY` ke `wrangler.toml` bagian `[vars]`. Yang di
> `[vars]` ikut ter-commit ke GitHub dan bisa dibaca siapa pun yang punya repo.
> `secret put` aman karena nilainya disimpan di Cloudflare dan tidak masuk git.

---

# LANGKAH 5 — Deploy

```bash
npm run deploy
```

Perintah ini build dulu (`index.html` ke `public/`), lalu `wrangler deploy`.

Output sukses:

```
Read 1 file from the assets directory D:\IT SUPPORT\public
Total Upload: 5.89 KiB / gzip: 2.09 KiB
Uploaded kalender-konten-golden
Deployed kalender-konten-golden triggers
  https://kalender-konten-golden.<subdomain>.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Catat URL-nya** — itu alamat Worker kamu.

Kalau muncul `No bindings found`, berarti `database_id` belum diisi (Langkah 2).
Kalau masih 401, `ADMIN_KEY` belum diset (Langkah 4).

---

# LANGKAH 6 — Verifikasi

Ganti `URL` di bawah dengan URL Worker dari Langkah 5.

```bash
URL=https://kalender-konten-golden.<subdomain>.workers.dev

# 1. Worker hidup?
curl $URL/health
```

Harus: `{"ok":true,"service":"kalender-konten-golden","storage":"cloudflare-d1"}`

Kalau `storage":"none"` berarti binding D1 belum terpasang.

```bash
# 2. GET tanpa token (read terbuka, boleh)
curl "$URL/api/calendar?ym=2026-10"
```

Harus: `{"ok":true,"found":false,"month":null}` — `found:false` itu benar, artinya
bulan Oktober belum punya data.

```bash
# 3. POST tanpa token (harus DITOLAK)
curl -X POST "$URL/api/calendar" \
  -H "Content-Type: application/json" \
  -d '{"ym":"2026-10","notes":"test"}'
```

Harus: HTTP **401** dengan pesan `Tidak diizinkan. Butuh ADMIN_KEY yang benar.`

Kalau sampai 200 berarti `ADMIN_KEY` belum diset. Cek `npx wrangler secret list`.

```bash
# 4. POST dengan token (harus BERHASIL)
curl -X POST "$URL/api/calendar" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: KUNCIMU" \
  -d '{"ym":"2026-10","notes":"disimpan dari panduan"}'
```

Harus: `{"ok":true,"month":{...,"notes":"disimpan dari panduan",...}}`

Lalu buka halamannya di browser:

```
https://kalender-konten-golden.<subdomain>.workers.dev
```

Harus tampil:

1. Judul **MONTHLY CONTENT CALENDAR**, subtitle Golden Studio & ShareUndangan
2. Kalender Oktober 2026, tanggal 1 di kolom **Kamis**
3. 11 sticky note kuning di tanggal 1, 2, 5, 8, 12, 16, 22, 24, 27, 28, 30
4. Tombol header: **Muat dari Database**, **Isi Oktober 2026**, **Cetak / PDF**, **Simpan**

Klik **Muat dari Database** — muncul teks hijau "Data 2026-10 dimuat dari database".

Klik **Simpan** — muncul dialog minta `ADMIN_KEY`. Tempel kuncimu, klik Simpan
lagi, teks hijau **Tersimpan di database**.

Kalau dialog tidak muncul dan langsung ada error, berarti token masih tersimpan
di `sessionStorage` dari percobaan sebelumnya. Klik Simpan sekali lagi.

---

# LANGKAH 7 — Update Nanti

Setelah mengedit `index.html`:

```bash
cd "D:/IT SUPPORT"
npm test          # pastikan tidak rusak
npm run deploy    # build + upload ulang
```

`npm run deploy` sudah menjalankan build, jadi tidak perlu `npm run build` terpisah.

Kontrol versi tetap lewat git:

```bash
git add -A
git commit -m "Update kalender"
git push
```

---

# Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `You are not authenticated` | Belum login | `npx wrangler login` |
| Browser tidak terbuka saat login | Popup diblokir | Salin URL manual dari terminal |
| `No bindings found` | `database_id` kosong | Ulangi Langkah 2, isi `wrangler.toml` |
| `Unexpected fields found in assets field: "database_id"` | `database_id` ditulis di blok `[assets]`, bukan `[[d1_databases]]` | Pindahkan ke blok `[[d1_databases]]` (lihat Langkah 2) |
| `/health` bilang `cloudflare-d1` tapi `/api/calendar` bilang `D1 binding DB belum dipasang` | Binding ada tapi salah blok, seperti baris di atas | Sama: pindahkan `database_id` ke `[[d1_databases]]` |
| `If this is a new Worker, run wrangler deploy first` | `secret put` sebelum Worker ada | `npm run deploy` dulu, lalu ulangi `secret put` |
| `d1 execute` balas `no such table: calendar_months` | Schema belum di-apply | `npm run db:init` |
| Cek tabel tidak menunjukkan apa-apa | `d1 execute` printing JSON penuh, bukan tabel rapi | Tambah `--json` lalu grep `"results"`, atau pakai `npx wrangler d1 execute ... --json` |
| `/health` balas `storage":"none"` | Binding tidak terpasang | Cek `database_id`, deploy ulang |
| `no such table: calendar_months` | Schema belum di-apply | `npm run db:init` |
| POST selalu 401 | `ADMIN_KEY` belum diset | `npx wrangler secret put ADMIN_KEY`, lalu deploy ulang |
| POST 401 padahal sudah diset | Secret belum masuk Worker aktif | `npx wrangler deploy` ulang setelah `secret put` |
| Halaman tampil tapi kalender kosong | Data belum ada di DB | Klik **Isi Oktober 2026** (butuh token) atau **Muat dari Database** |
| Tampil tanpa style | CDN Tailwind diblokir | Cek koneksi internet |
| `Error 1101 Worker threw exception` | Bug di kode | `npx wrangler tail` untuk lihat stack trace |
| `Authenticity of the response cannot be established` | Versi wrangler lama | `npx wrangler@latest login` ulang |
| Deploy sukses tapi URL 404 | Salah menyalin URL | Ambil ulang dari output deploy, baris `Deployed ...` |

## Melihat log Worker

```bash
npx wrangler tail
```

Live log dari request yang masuk. Berguna untuk melihat 401 datang dari mana atau
menangkap error yang tidak muncul di browser. Tekan `Ctrl+C` untuk berhenti.

---

# Catatan Teknis

- **POST memakai UPSERT dengan `COALESCE`.** Field yang tidak dikirim tidak akan
  menimpa data yang sudah ada. Jadi hanya `notes` yang berubah kalau kamu kirim
  `{"ym":"2026-10","notes":"x"}` — `days`, `dates`, dan `todos` tetap utuh.
- **Fail-closed.** Kalau `ADMIN_KEY` kosong, semua POST ditolak dengan 401.
  Lebih baik tidak bisa simpan daripada bisa simpan tanpa kunci.
- **Aset hanya `public/index.html`.** Folder sumber, `schema.sql`, `tests/`, dan
  `.git/` tidak ikut ter-deploy dan tidak bisa diunduh lewat URL. `wrangler` tidak
  mendukung filter per-file, jadi pemisahan folder adalah satu-satunya cara.
  Kalau muncul `Read 80 files`, itu berarti `assets.directory` salah set ke `./`.
- **Satu baris DB per bulan.** 11 dari 31 hari punya isi, jadi tabel per-hari cuma
  menambah join tanpa guna. Isi per tanggal disimpan sebagai JSON.
- **Read tetap terbuka tanpa token.** anyone bisa melihat isi kalender, cuma
  tidak bisa mengubah. Kalau nanti perlu kalender privat, gate GET juga.
- **Token disimpan di `sessionStorage`,** hilang saat tab ditutup dan tidak ikut
  masuk ke `localStorage` data kalender.
