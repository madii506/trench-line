// The basket engine: claim $TRENCH creator fees, then trade the engine wallet toward the target basket.
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
const C = require('./chain'), M = require('./market'), B = require('./basket'), J = require('./jup'), db = require('./db');
const RESERVE_SOL = 0.03;   // kept for network fees
const MIN_USD = 5;          // smallest trade
const BAND = 0.2;           // only trade when a coin is 20% off its target value
const MAX_SWAPS = 6;        // per run (function time limit)

async function holdingsValued(owner, extraMints = []) {
  const h = await C.holdings(owner);
  const mints = [...new Set([...h.tokens.map(t => t.mint), ...extraMints, M.SOL])];
  const px = await M.prices(mints);
  const sol = px[M.SOL] || 0;
  const tokens = h.tokens.map(t => ({ ...t, price: px[t.mint] || 0, usd: (px[t.mint] || 0) * t.ui })).filter(t => t.mint !== M.SOL);
  return { sol: h.sol, solUsd: h.sol * sol, solPrice: sol, tokens, total: h.sol * sol + tokens.reduce((s, t) => s + t.usd, 0), px };
}

async function run({ dry = false } = {}) {
  const kp = C.engineKeypair(); if (!kp) throw Object.assign(new Error('engine is off (no TRENCH_ENGINE_KEY)'), { status: 503, expose: true });
  if (!dry && !(await db.lock('rebalance', 240e3))) return { skipped: 'another run is in progress' };
  const report = { dry, at: Date.now(), claimed: 0, swaps: [], errors: [] };
  try {
    // 1 · fees in
    try { const cl = await C.claimFees(kp, { dry }); report.claimed = cl.sol || 0; if (cl.sig) await db.log('claim', C.ca(), 'TRENCH', { sol: cl.sol, via: cl.via }, cl.sig); if (cl.simErr) report.errors.push('claim sim ' + JSON.stringify(cl.simErr)) }
    catch (e) { report.errors.push('claim: ' + e.message) }
    // 2 · where we are, where we go
    const list = await M.universe();
    const tgt = B.target(list);
    report.target = tgt.map(t => ({ sym: t.sym, weight: t.weight }));
    const h = await holdingsValued(kp.publicKey, tgt.map(t => t.mint));
    if (!h.solPrice) throw new Error('no SOL price');
    const investable = Math.max(0, h.total - RESERVE_SOL * h.solPrice);
    const want = Object.fromEntries(tgt.map(t => [t.mint, investable * t.weight]));
    const have = Object.fromEntries(h.tokens.map(t => [t.mint, t]));
    // 3 · sells first: coins that left the basket, then trims
    const sells = [];
    for (const t of h.tokens) {
      if (t.mint === C.ca()) continue; // never sell $TRENCH itself
      const w = want[t.mint] || 0;
      if (t.usd < MIN_USD) continue;
      if (!w) sells.push({ t, usd: t.usd, why: 'left the basket' });
      else if (t.usd > w * (1 + BAND)) sells.push({ t, usd: t.usd - w, why: 'trim' });
    }
    const buys = [];
    for (const g of tgt) {
      const cur = have[g.mint] ? have[g.mint].usd : 0, w = want[g.mint];
      if (w - cur > Math.max(MIN_USD, w * BAND)) buys.push({ g, usd: w - cur });
    }
    let n = 0;
    for (const s of sells.sort((a, b) => b.usd - a.usd)) {
      if (n >= MAX_SWAPS) break;
      const raw = s.why === 'left the basket' ? BigInt(s.t.raw) : BigInt(Math.floor(Number(s.t.raw) * Math.min(1, s.usd / s.t.usd)));
      try {
        const r = await J.swap(kp, s.t.mint, M.SOL, Number(raw), { dry, slippageBps: 300 });
        report.swaps.push({ side: 'sell', mint: s.t.mint, usd: +s.usd.toFixed(2), why: s.why, sig: r.sig });
        if (r.sig) await db.log('sell', s.t.mint, (list.find(c => c.mint === s.t.mint) || {}).sym, { usd: s.usd, why: s.why }, r.sig);
        n++;
      } catch (e) { report.errors.push('sell ' + s.t.mint.slice(0, 6) + ': ' + e.message) }
    }
    // SOL available after sells (re-read when trading for real)
    const solNow = dry ? h.sol + report.swaps.reduce((s, x) => s + x.usd / h.solPrice, 0) : (await C.holdings(kp.publicKey)).sol;
    let budget = Math.max(0, solNow - RESERVE_SOL);
    for (const b of buys.sort((a, b2) => b2.usd - a.usd)) {
      if (n >= MAX_SWAPS || budget <= 0.005) break;
      const sol = Math.min(budget, b.usd / h.solPrice);
      if (sol * h.solPrice < MIN_USD) continue;
      try {
        const r = await J.swap(kp, M.SOL, b.g.mint, Math.floor(sol * LAMPORTS_PER_SOL), { dry, slippageBps: 300 });
        report.swaps.push({ side: 'buy', mint: b.g.mint, sym: b.g.sym, usd: +(sol * h.solPrice).toFixed(2), sig: r.sig });
        if (r.sig) await db.log('buy', b.g.mint, b.g.sym, { usd: sol * h.solPrice, weight: b.g.weight }, r.sig);
        budget -= sol; n++;
      } catch (e) { report.errors.push('buy ' + b.g.sym + ': ' + e.message) }
    }
    if (!dry) await db.log('rebalance', null, null, { claimed: report.claimed, swaps: report.swaps.length, errors: report.errors.length, total: Math.round(h.total) });
    return report;
  } finally { if (!dry) await db.unlock('rebalance').catch(() => { }) }
}
module.exports = { run, holdingsValued };
