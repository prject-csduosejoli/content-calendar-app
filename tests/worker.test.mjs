// tests/worker.test.mjs — uji router worker.js end-to-end (assets + /health + /api/calendar).
// Jalankan: node tests/worker.test.mjs
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker.js';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(schema);

const DB = {
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

// ASSETS fake: kembalikan hanya file yang di-allow-list, seperti folder public/.
const PUBLIC = new Set(['index.html']);
const env = {
  DB,
  ASSETS: {
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const name = path === '/' ? 'index.html' : path.replace(/^\//, '');
      if (!PUBLIC.has(name)) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  },
};

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' :: ' + extra : ''}`); }
}

const hit = async (path, init) => {
  const res = await worker.fetch(new Request('https://k.test' + path, init), env);
  return { status: res.status, body: await res.text() };
};
const hitJson = async (path, init) => {
  const res = await worker.fetch(new Request('https://k.test' + path, init), env);
  return { status: res.status, body: await res.json() };
};
const POST = (obj) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

console.log('\n1. /health');
{
  const r = await hitJson('/health');
  check('status 200', r.status === 200, `status=${r.status}`);
  check('ok true', r.body.ok === true);
  check('storage cloudflare-d1', r.body.storage === 'cloudflare-d1', r.body.storage);
}

console.log('\n2. Aset: hanya index.html yang boleh dilayani');
{
  const r = await hit('/');
  check('root 200', r.status === 200, `status=${r.status}`);
  check('root berisi kalender', /MONTHLY CONTENT CALENDAR/i.test(r.body));
}
{
  const r = await hit('/index.html');
  check('index.html 200', r.status === 200, `status=${r.status}`);
}
for (const leak of ['/worker.js', '/api/calendar.js', '/schema.sql', '/wrangler.toml', '/package.json', '/.git/config']) {
  const r = await hit(leak);
  check(`${leak} tidak bocor (404)`, r.status === 404, `status=${r.status}`);
}

console.log('\n3. Alur nyata: POST -> GET lewat worker');
{
  const post = await hitJson('/api/calendar', POST({
    ym: '2026-10',
    days: { '2026-10-01': 'Pancasila', '2026-10-28': 'Sumpah Pemuda' },
    dates: [{ date: '2026-10-10', event: 'Mid-Month Special Campaign' }],
    todos: ['Ide Konten : Sesi prewedding bertema nasional'],
    notes: 'Fokus trafik goldenstudio.id',
  }));
  check('POST 200', post.status === 200, `status=${post.status}`);
  check('2 hari tersimpan', Object.keys(post.body.month.days).length === 2);

  const get = await hitJson('/api/calendar?ym=2026-10');
  check('GET 200', get.status === 200);
  check('found true', get.body.found === true);
  check('hari kembali utuh', get.body.month.days['2026-10-28'] === 'Sumpah Pemuda');
  check('todos kembali', get.body.month.todos[0].includes('prewedding'));
}

console.log('\n4. /health tanpa D1 binding -> storage none (tidak crash)');
{
  const r = await worker.fetch(new Request('https://k.test/health'), {});
  const b = await r.json();
  check('status 200', r.status === 200);
  check('storage none', b.storage === 'none', b.storage);
}

console.log('\n5. Endpoint tak dikenal -> 404 JSON');
{
  const r = await hitJson('/api/tidak-ada');
  check('status 404', r.status === 404, `status=${r.status}`);
  check('body JSON', r.body.ok === false);
}

console.log(`\n${'='.repeat(46)}\n  ${pass} lulus, ${fail} gagal\n${'='.repeat(46)}`);
process.exit(fail ? 1 : 0);
