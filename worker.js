// worker.js — Cloudflare Worker: static assets + /api/calendar untuk D1.
// 1 user, 1 kalender. Satu baris DB per bulan (ym), konten per tanggal di JSON.
// WRITE (POST) dikunci ADMIN_KEY supaya tidak semua orang bisa menambah konten.
import { handleCalendar } from './api/calendar.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

// Token dianggap sah kalau cocok persis dan tidak kosong. Kalau ADMIN_KEY belum
// diset, POST tetap ditolak (fail-closed) — lebih baik tidak bisa simpan daripada
// bisa simpan tanpa kunci.
// Kunci base64url: hanya huruf, angka, underscore, dan hyphen. Pola ini muncul di
// dalam teks apa pun yang ditempel user: backtick, tanda kutip, awalan "KUNCI=",
// kalimat penjelasan, atau seluruh isi file ADMIN-KEY.txt sekaligus ter-copy.
//
// Karena kunci bisa terpecah oleh karakter asing, normalizeKey() mengembalikan
// DAFTAR kandidat: tiap run apa adanya, tiap gabungan run yang berdekatan, dan
// seluruh teks tanpa karakter asing. isAuthorized() mencoba semua, jadi tidak ada
// kunci valid yang ikut terpotong oleh salah paste.
const KEY_ALPHABET = /[A-Za-z0-9_-]+/g;

function normalizeKey(v) {
  const raw = String(v || '');
  const runs = raw.match(KEY_ALPHABET) || [];
  const kandidat = new Set();
  for (const r of runs) kandidat.add(r);
  // gabungan dua run yang dipisah satu karakter asing saja ("kunci rahasia" ->
  // "kunci-rahasia" bila kunci aslinya ber-hyphen)
  for (let a = 0; a < runs.length; a++) {
    for (let b = a + 1; b < runs.length; b++) {
      kandidat.add(runs[a] + runs[b]);
    }
  }
  kandidat.add(raw.replace(/[^A-Za-z0-9_-]/g, ''));
  return [...kandidat];
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(request, env) {
  if (request.method !== 'POST') return true;
  const expected = normalizeKey(env.ADMIN_KEY)[0];
  if (!expected) return false;
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const xKey = request.headers.get('X-Admin-Key') || '';
  const coba = [...normalizeKey(bearer), ...normalizeKey(xKey)];
  return coba.some(c => timingSafeEqual(c, expected));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/health') {
      return json({
        ok: true,
        service: 'kalender-konten-golden',
        storage: env.DB ? 'cloudflare-d1' : 'none',
      });
    }

    if (pathname === '/api/calendar') {
      if (!isAuthorized(request, env)) {
        const got = request.headers.get('X-Admin-Key') || (request.headers.get('Authorization') || '').replace(/^Bearer\s*/i, '');
      return json({
        ok: false,
        error: 'Tidak diizinkan. Butuh ADMIN_KEY yang benar.',
        candidateLengths: normalizeKey(got).map(c => c.length)
      }, 401);
      }
      try {
        return await handleCalendar(request, env);
      } catch (err) {
        return json({ ok: false, error: String((err && err.message) || err) }, 500);
      }
    }

    // /api/* lain -> 404 JSON. Jangan sampai jatuh ke ASSETS: aset hanya punya
    // index.html, jadi request lain akan dapat "Not Found" teks biasa, bukan JSON.
    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404);
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404);
  },
};
