// Postgres: Neon over HTTP when a DB url is set, PGlite in dev (TRENCH_PGLITE=memory|dir).
let _q = null, _ready = null;
function dbUrl() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || Object.entries(process.env).find(([k, v]) => /_DATABASE_URL$|_POSTGRES_URL$/.test(k) && v)?.[1] || '' }
function hasDb() { return !!(dbUrl() || process.env.TRENCH_PGLITE) }
async function conn() {
  if (_q) return _q;
  const url = dbUrl();
  if (url) { const { neon } = require('@neondatabase/serverless'); const sql = neon(url); _q = async (t, p = []) => { const r = await sql.query(t, p); return Array.isArray(r) ? r : (r.rows || []) } }
  else if (process.env.TRENCH_PGLITE) { const { PGlite } = require('@electric-sql/pglite'); const db = new PGlite(process.env.TRENCH_PGLITE === 'memory' ? undefined : process.env.TRENCH_PGLITE); _q = async (t, p = []) => (await db.query(t, p)).rows }
  else throw Object.assign(new Error('database not configured'), { status: 503, expose: true });
  return _q;
}
const SCHEMA = [
  `create table if not exists trench_calls (id bigserial primary key, uid text not null, callsign text not null, mint text not null, sym text, name text, icon text,
    side text not null, win integer not null, entry double precision not null, entry_at bigint not null, ends_at bigint not null,
    exit double precision, move double precision, result text, points integer, ip text)`,
  `create index if not exists trench_calls_uid on trench_calls (uid, id desc)`,
  `create index if not exists trench_calls_due on trench_calls (ends_at) where result is null`,
  `create index if not exists trench_calls_mint on trench_calls (mint, id desc)`,
  `create table if not exists trench_log (id bigserial primary key, t bigint not null, kind text not null, mint text, sym text, data jsonb, sig text)`,
  `create index if not exists trench_log_t on trench_log (t desc)`,
  `create table if not exists trench_meta (k text primary key, v text)`,
];
async function q(text, params) {
  const f = await conn();
  if (!_ready) _ready = (async () => { for (const s of SCHEMA) await f(s) })().catch(e => { _ready = null; throw e });
  await _ready; return f(text, params);
}
async function lock(name, ttl) {
  const now = Date.now();
  const r = await q(`insert into trench_meta (k,v) values ($1,$2) on conflict (k) do update set v=excluded.v where trench_meta.v is null or trench_meta.v='' or trench_meta.v::bigint < $3 returning v`, ['lock:' + name, String(now + ttl), String(now)]);
  return r.length > 0;
}
async function unlock(name) { await q(`update trench_meta set v='' where k=$1`, ['lock:' + name]) }
async function log(kind, mint, sym, data, sig) { await q('insert into trench_log (t,kind,mint,sym,data,sig) values ($1,$2,$3,$4,$5::jsonb,$6)', [Date.now(), kind, mint || null, sym || null, JSON.stringify(data || {}), sig || null]) }
module.exports = { hasDb, q, lock, unlock, log };
