// scripts/build.mjs — salin file statis ke public/ sebelum deploy.
// Dipakai karena wrangler tidak bisa memfilter aset per-file: tanpa ini, source
// code, schema.sql, tests/ dan .git/ ikut ter-upload dan bisa diunduh publik.
import { cp, mkdir, rm, readdir } from 'node:fs/promises';

const SRC = new URL('../index.html', import.meta.url);
const OUT_DIR = new URL('../public/', import.meta.url);
const OUT = new URL('../public/index.html', import.meta.url);

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
await cp(SRC, OUT);

const files = await readdir(OUT_DIR);
console.log(`build: public/ berisi ${files.length} file -> ${files.join(', ')}`);
