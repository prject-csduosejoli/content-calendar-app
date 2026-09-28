// tests/calendar.test.mjs — handler API kalender terhadap SQLite lokal yang memakai bentuk D1.
// Jalankan: node tests/calendar.test.mjs
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleCalendar } from '../api/calendar.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

// Mock D1: prepare().bind(...).run()/.all()/.first() -> { results } / baris pertama.
// WAJIB: all()/first() memakai argumen dari .bind() sebelumnya saat dipanggil tanpa argumen.
function mockD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const w = { _args: null };
      w.bind = (...a) => { w._args = a; return w; };
      const use = (p) => (p.length ? p : w._args || []);
      w.run = (...p) => ({ meta: { changes: stmt.run(...use(p)).changes } });
      w.all = (...p) => ({ results: stmt.all(...use(p)) });
      w.first = (...p) => { const r = stmt.all(...use(p)); return r.length ? r[0] : null; };
      return w;
    },
  };
}

const db = new DatabaseSync(':memory:');
db.exec(schema);
const env = { DB: mockD1(db) };

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' :: ' + extra : ''}`); }
}

const GET = (ym) => new Request(`https://x.test/api/calendar?ym=${ym}`);
const POST = (body) =>
  new Request('https://x.test/api/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const call = async (req) => {
  const res = await handleCalendar(req, env);
  return { status: res.status, body: await res.json() };
};

console.log('\n1. GET bulan yang belum ada -> found:false, bukan error');
{
  const r = await call(GET('2026-10'));
  check('status 200', r.status === 200, `status=${r.status}`);
  check('ok true', r.body.ok === true);
  check('found false', r.body.found === false);
  check('month null', r.body.month === null);
}

console.log('\n2. GET tanpa ym / format salah -> 400');
{
  const r = await call(GET(''));
  check('status 400', r.status === 400, `status=${r.status}`);
  check('pesan menyebut format', /YYYY-MM/.test(r.body.error || ''), r.body.error);
}
{
  const r = await call(GET('2026-13'));
  check('bulan 13 ditolak', r.status === 400, `status=${r.status}`);
}
{
  const r = await call(GET('2026-1'));
  check('ym tanpa nol depan ditolak', r.status === 400, `status=${r.status}`);
}

console.log('\n3. POST buat Oktober 2026 dengan 11 hari besar');
const OKTOBER = {
  ym: '2026-10',
  days: {
    '2026-10-01': '- Hari Kesaktian Pancasila - Hari Lansia Internasional - Hari Kopi',
    '2026-10-02': 'Hari Batik Nasional & Hari Batik Dunia',
    '2026-10-05': '- HUT ke-81 TNI - Hari Guru Sedunia - Hari Habitat Sedunia',
    '2026-10-08': 'Hari Tata Ruang Nasional',
    '2026-10-12': 'Hari Museum Nasional',
    '2026-10-16': '- Hari Parlemen Indonesia - Hari Pangan Sedunia',
    '2026-10-22': '- Hari Santri Nasional',
    '2026-10-24': '- HariOCKER Indonesia',
    '2026-10-27': '- Hari Penerbangan Nasional - Hari Listrik Nasional',
    '2026-10-28': '- Hari Sumpah Pemuda',
    '2026-10-30': '- Hari Keuangan Nasional',
  },
  dates: [{ date: '2026-10-10', event: 'Mid-Month Special Campaign' }],
  todos: ['Ide Konten : Sesi keluarga atau lamaran beauti', 'Ide Konten : Sesi prewedding bertema nasional'],
  notes: 'Fokus trafik website goldenstudio.id & konversi ShareUndangan.',
};
{
  const r = await call(POST(OKTOBER));
  check('status 200', r.status === 200, `status=${r.status}`);
  check('11 hari tersimpan', Object.keys(r.body.month?.days || {}).length === 11,
    `jumlah=${Object.keys(r.body.month?.days || {}).length}`);
  check('ada updated_at', !!r.body.month?.updated_at);
}

console.log('\n4. GET balik -> data utuh, tidak berubah');
{
  const r = await call(GET('2026-10'));
  check('found true', r.body.found === true);
  check('ym benar', r.body.month.ym === '2026-10');
  check('days 11', Object.keys(r.body.month.days).length === 11);
  check('tanggal 28 ada', !!r.body.month.days['2026-10-28']);
  check('dates 1', r.body.month.dates.length === 1);
  check('todos 2', r.body.month.todos.length === 2);
  check('notes tersimpan', r.body.month.notes.startsWith('Fokus trafik'));
}

console.log('\n5. POST partial (hanya notes) -> field lain tidak tertimpa');
{
  const before = (await call(GET('2026-10'))).body.month;
  const r = await call(POST({ ym: '2026-10', notes: 'Catatan diperbarui.' }));
  check('status 200', r.status === 200);
  check('notes baru', r.body.month.notes === 'Catatan diperbarui.', r.body.month.notes);
  check('days tetap 11', Object.keys(r.body.month.days).length === 11,
    `jumlah=${Object.keys(r.body.month.days).length}`);
  check('todos tetap 2', r.body.month.todos.length === 2);
  check('updated_at berubah', r.body.month.updated_at !== before.updated_at);
}

console.log('\n6. POST bulan lain -> baris terpisah, Oktober tidak berubah');
{
  await call(POST({ ym: '2026-11', days: { '2026-11-01': 'Paket.define' } }));
  const okt = (await call(GET('2026-10'))).body.month;
  const nov = (await call(GET('2026-11'))).body.month;
  check('November ada', nov && nov.ym === '2026-11');
  check('November 1 hari', Object.keys(nov.days).length === 1);
  check('Oktober masih 11', Object.keys(okt.days).length === 11);
  check('total baris 2', db.prepare('SELECT COUNT(*) n FROM calendar_months').get().n === 2);
}

console.log('\n7. POST tanpa ym / tanpa field -> 400');
{
  const r = await call(POST({ days: {} }));
  check('tanpa ym ditolak', r.status === 400, `status=${r.status}`);
}
{
  const r = await call(POST({ ym: '2026-10' }));
  check('tanpa field ditolak', r.status === 400, `status=${r.status}`);
}
{
  const r = await call(POST({ ym: 'abc' }));
  check('ym rusak ditolak', r.status === 400, `status=${r.status}`);
}

console.log('\n8. Input jahat dibersihkan, tidak crash');
{
  const r = await call(POST({
    ym: '2026-12',
    days: {
      'bukan tanggal': 'x',
      '2026-12-05': 123,
      '2026-12-06': '   ',
      '2026-12-07': 'ok',
      '2026-11-01': 'salah bulan tapi key valid',
    },
    dates: [{ event: 'tanpa date' }, { date: '2026-12-08' }, 'bukan objek', { date: '2026-12-09', event: 'ok' }],
    todos: ['', '   ', null, 42, { text: 'dari objek' }, 'nyata'],
  }));
  check('status 200', r.status === 200, `status=${r.status}`);
  const m = r.body.month;
  check('days hanya key valid', Object.keys(m.days).length === 2, JSON.stringify(Object.keys(m.days)));
  check('nilai non-string dibuang', !('2026-12-05' in m.days));
  check('string kosong dibuang', !('2026-12-06' in m.days));
  check('dates bersih', m.dates.length === 2, JSON.stringify(m.dates));
  check('todos bersih', m.todos.length === 2, JSON.stringify(m.todos));
}

console.log('\n9. Metode lain -> 405');
{
  const res = await handleCalendar(new Request('https://x.test/api/calendar?ym=2026-10', { method: 'DELETE' }), env);
  check('DELETE 405', res.status === 405, `status=${res.status}`);
}
{
  const res = await handleCalendar(new Request('https://x.test/api/calendar?ym=2026-10', { method: 'PUT' }), env);
  check('PUT 405', res.status === 405, `status=${res.status}`);
}

console.log('\n10. D1 binding hilang -> 500 dengan pesan jelas');
{
  const r = await handleCalendar(GET('2026-10'), {});
  check('status 500', r.status === 500, `status=${r.status}`);
  check('sebut binding', /binding/i.test((await r.json()).error || ''));
}

console.log('\n11. Batas panjang: teks dipotong, tidak ditolak');
{
  const long = 'x'.repeat(5000);
  const veryLong = 'y'.repeat(15000);
  const r = await call(POST({ ym: '2027-01', days: { '2027-01-01': long }, notes: veryLong }));
  check('status 200', r.status === 200, `status=${r.status}`);
  check('days dipotong 2000', r.body.month.days['2027-01-01'].length === 2000,
    `panjang=${r.body.month.days['2027-01-01'].length}`);
  check('notes dipotong 10000', r.body.month.notes.length === 10000, `panjang=${r.body.month.notes.length}`);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} lulus, ${fail} gagal\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
