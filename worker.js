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
// Token yang sering salah karena salah salin: ada backtick, spasi, atau awalan
// "KUNCI=" dari terminal. Buang semua itu sebelum dibandingkan supaya user tidak
// kehilangan waktu hanya karena salah paste.
function normalizeKey(v) {
  return String(v || '')
    .replace(/KUNCI\s*=\s*/i, '')
    .replace(/[`'"]/g, '')
    .trim();
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(request, env) {
  if (request.method !== 'POST') return true;
  const expected = normalizeKey(env.ADMIN_KEY);
  if (!expected) return false;
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const xKey = request.headers.get('X-Admin-Key') || '';
  return timingSafeEqual(normalizeKey(bearer), expected)
      || timingSafeEqual(normalizeKey(xKey), expected);
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
        return json({ ok: false, error: 'Tidak diizinkan. Butuh ADMIN_KEY yang benar.' }, 401);
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
