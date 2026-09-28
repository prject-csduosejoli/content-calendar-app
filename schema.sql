-- Kalender konten Golden Studio — 1 user, 1 kalender, 1 baris per bulan.
-- days/dates/todos/notes disimpan sebagai JSON: hari besar itu jarang
-- (11 dari 31 pada Oktober 2026), jadi tabel per-hari cuma menambah join tanpa guna.
CREATE TABLE IF NOT EXISTS calendar_months (
    ym         TEXT PRIMARY KEY,          -- '2026-10'
    days       TEXT NOT NULL DEFAULT '{}',-- {"2026-10-01": "..."} konten per tanggal
    dates      TEXT NOT NULL DEFAULT '[]',-- [{"date":"...","event":"..."}] sidebar Important Dates
    todos      TEXT NOT NULL DEFAULT '[]',-- ["..."]  sidebar Goals / To-Do
    notes      TEXT NOT NULL DEFAULT '',  -- sidebar Notes
    updated_at TEXT NOT NULL
);
