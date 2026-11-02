// Calls: free, points-only predictions on live pump.fun coins. long = it goes up, hedge = it goes down.
const db = require('./db');
const M = require('./market');
const WINS = [15, 60, 240];
const PUSH = 0.002; // moves under 0.2% are a push
function points(side, move) {
  if (Math.abs(move) < PUSH) return { result: 'push', points: 0 };
  const won = side === 'long' ? move > 0 : move < 0;
  return won ? { result: 'won', points: 100 + Math.min(400, Math.round(Math.abs(move) * 1000)) } : { result: 'lost', points: -50 };
}
const pub = r => ({ id: +r.id, callsign: r.callsign, tag: String(r.uid).slice(-4), mint: r.mint, sym: r.sym, name: r.name, icon: r.icon, side: r.side, win: r.win, entry: r.entry, entryAt: +r.entry_at, endsAt: +r.ends_at, exit: r.exit, move: r.move, result: r.result, points: r.points });

async function create({ uid, callsign, mint, side, win, ip }) {
  const e = m => Object.assign(new Error(m), { status: 400, expose: true });
  if (!/^[a-f0-9]{24,64}$/.test(uid || '')) throw e('missing player id');
  callsign = String(callsign || 'anon').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12) || 'anon';
  if (!['long', 'hedge'].includes(side)) throw e('side is long or hedge');
  win = +win; if (!WINS.includes(win)) throw e('window is 15, 60 or 240 minutes');
  const c = await M.coin(String(mint || '')); if (!c) throw e(/pump$/.test(String(mint || '')) ? 'this coin is too new for a price feed. try again in a minute.' : 'not a live pump.fun coin');
  const now = Date.now();
  const open = await db.q('select mint from trench_calls where uid=$1 and result is null', [uid]);
  if (open.length >= 8) throw e('8 open calls max. wait for one to settle');
  if (open.some(r => r.mint === c.mint)) throw e('you already have an open call on $' + c.sym);
  if (ip) { const n = await db.q('select count(*)::int n from trench_calls where ip=$1 and entry_at > $2', [ip, now - 3600e3]); if (n[0].n >= 40) throw Object.assign(new Error('slow down: 40 calls an hour'), { status: 429, expose: true }) }
  const px = (await M.prices([c.mint]))[c.mint]; if (!px) throw e('no live price for $' + c.sym + ' right now');
  const r = await db.q(`insert into trench_calls (uid,callsign,mint,sym,name,icon,side,win,entry,entry_at,ends_at,ip) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [uid, callsign, c.mint, c.sym, c.name, c.icon, side, win, px, now, now + win * 60e3, ip || null]);
  return pub(r[0]);
}

// settle calls whose window ended: the close of the 1-minute candle at the end time (fallback: live price within 3 min)
async function settle(limit = 10) {
  const now = Date.now();
  const due = await db.q('select * from trench_calls where result is null and ends_at <= $1 order by ends_at asc limit $2', [now, limit]);
  let n = 0;
  for (const r of due) {
    let px = null;
    try { px = await M.priceAt(r.mint, +r.ends_at) } catch (_) { }
    if (!px && now - r.ends_at < 180e3) { try { px = (await M.prices([r.mint]))[r.mint] } catch (_) { } }
    if (!px) { if (now - r.ends_at > 6 * 3600e3) await db.q(`update trench_calls set result='void', points=0 where id=$1 and result is null`, [r.id]); continue }
    const move = (px - r.entry) / r.entry; const p = points(r.side, move);
    await db.q('update trench_calls set exit=$2, move=$3, result=$4, points=$5 where id=$1 and result is null', [r.id, px, move, p.result, p.points]);
    n++;
  }
  return n;
}
async function list({ uid, mint, limit = 40 }) {
  limit = Math.min(100, +limit || 40);
  let rows;
  if (uid) rows = await db.q('select * from trench_calls where uid=$1 order by id desc limit $2', [uid, limit]);
  else if (mint) rows = await db.q('select * from trench_calls where mint=$1 order by id desc limit $2', [mint, limit]);
  else rows = await db.q('select * from trench_calls order by id desc limit $1', [limit]);
  return rows.map(pub);
}
async function board({ since = 0, limit = 50 }) {
  const rows = await db.q(`select uid, max(callsign) callsign, coalesce(sum(points),0)::int pts, count(*) filter (where result='won')::int won,
      count(*) filter (where result='lost')::int lost, count(*) filter (where result is null)::int open, max(case when result='won' then abs(move) end) best
    from trench_calls where entry_at >= $1 group by uid order by pts desc, won desc limit $2`, [since, Math.min(100, limit)]);
  return rows.map((r, i) => ({ rank: i + 1, callsign: r.callsign, tag: String(r.uid).slice(-4), points: r.pts, won: r.won, lost: r.lost, open: r.open, best: r.best == null ? null : +(+r.best * 100).toFixed(2) }));
}
async function stats() {
  const r = await db.q(`select count(*)::int total, count(*) filter (where result is null)::int open, count(distinct uid)::int players from trench_calls`);
  return r[0];
}
module.exports = { create, settle, list, board, stats, points, WINS };
