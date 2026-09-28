// api/calendar.js — CRUD satu baris per bulan (ym) di D1.
// Kontrak: GET /api/calendar?ym=2026-10 | POST /api/calendar (body: {ym, days, dates, todos, notes})
// POST memakai UPSERT, jadi frontend boleh kirim subset field dan field yang tidak
// dikirim tidak akan ditimpa. Field ym wajib ada di body POST.

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const bad = (error) => json({ ok: false, error }, 400);

function parseJson(text, fallback) {
  if (text == null || text === '') return fallback;
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

// Validasi bentuk nilai sebelum masuk DB. String JSON bisa rusak karena input
// pengguna atau versi lama file lokal, jadi coerce dan buang yang tidak cocok.
function cleanDays(v) {
  const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const [k, val] of Object.entries(src)) {
    if (!YM_RE.test(k.slice(0, 7)) || !/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    if (typeof val !== 'string') continue;
    const text = val.trim();
    if (text) out[k] = text.slice(0, 2000);
  }
  return out;
}

function cleanDates(v) {
  const src = Array.isArray(v) ? v : [];
  return src
    .filter((r) => r && typeof r === 'object' && typeof r.date === 'string')
    .map((r) => ({
      date: String(r.date).slice(0, 40),
      event: String(r.event ?? '').slice(0, 300),
    }))
    .slice(0, 200);
}

function cleanTodos(v) {
  const src = Array.isArray(v) ? v : [];
  return src
    .map((t) => (typeof t === 'string' ? t : typeof t === 'object' && t ? String(t.text ?? '') : ''))
    .map((t) => t.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 200);
}

function rowToJson(row) {
  if (!row) return null;
  return {
    ym: row.ym,
    days: parseJson(row.days, {}),
    dates: parseJson(row.dates, []),
    todos: parseJson(row.todos, []),
    notes: row.notes || '',
    updated_at: row.updated_at,
  };
}

export async function handleCalendar(request, env) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB belum dipasang' }, 500);

  const url = new URL(request.url);
  const ym = url.searchParams.get('ym') || '';

  if (request.method === 'GET') {
    if (!YM_RE.test(ym)) return bad('Parameter ym wajib diisi format YYYY-MM, misal 2026-10');
    const row = await env.DB
      .prepare('SELECT ym, days, dates, todos, notes, updated_at FROM calendar_months WHERE ym = ?')
      .bind(ym)
      .first();
    return json({ ok: true, found: !!row, month: rowToJson(row) });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return bad('Body harus JSON yang valid');
    }
    if (!body || typeof body !== 'object') return bad('Body harus objek JSON');
    if (!YM_RE.test(String(body.ym || ''))) return bad('Field ym wajib diisi format YYYY-MM');

    const days = body.days !== undefined ? cleanDays(body.days) : undefined;
    const dates = body.dates !== undefined ? cleanDates(body.dates) : undefined;
    const todos = body.todos !== undefined ? cleanTodos(body.todos) : undefined;
    const notes = body.notes !== undefined ? String(body.notes ?? '').slice(0, 10000) : undefined;

    if (days === undefined && dates === undefined && todos === undefined && notes === undefined) {
      return bad('Tidak ada field yang dikirim (minimal salah satu dari: days, dates, todos, notes)');
    }

    // COALESCE menjaga field yang tidak dikirim: NULL berarti "biarkan yang ada".
    const row = await env.DB
      .prepare(
        `INSERT INTO calendar_months (ym, days, dates, todos, notes, updated_at)
         VALUES (?1, COALESCE(?2, '{}'), COALESCE(?3, '[]'), COALESCE(?4, '[]'), COALESCE(?5, ''), ?6)
         ON CONFLICT(ym) DO UPDATE SET
           days       = COALESCE(?2, days),
           dates      = COALESCE(?3, dates),
           todos      = COALESCE(?4, todos),
           notes      = COALESCE(?5, notes),
           updated_at = ?6
         RETURNING ym, days, dates, todos, notes, updated_at`
      )
      .bind(
        String(body.ym),
        days === undefined ? null : JSON.stringify(days),
        dates === undefined ? null : JSON.stringify(dates),
        todos === undefined ? null : JSON.stringify(todos),
        notes === undefined ? null : notes,
        new Date().toISOString()
      )
      .first();

    return json({ ok: true, month: rowToJson(row) });
  }

  return json({ ok: false, error: 'Metode tidak diizinkan' }, 405);
}
