// worker.js — Cloudflare Worker: static assets + /api/calendar untuk D1.
// 1 user, 1 kalender. Satu baris DB per bulan (ym), konten per tanggal di JSON.
import { handleCalendar } from './api/calendar.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

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
