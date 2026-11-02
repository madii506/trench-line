// The basket: the top-performing live pump.fun coins, weighted by score, rebalanced against the market.
const RULES = { n: 8, minLiq: 40000, minMcap: 300000, minHolders: 800, minOrganic: 55, minAgeH: 6, minVol1h: 4000, cap: 0.25, floor: 0.06 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function ageH(c) { const t = c.created ? Date.parse(c.created) : NaN; return isFinite(t) ? (Date.now() - t) / 3600e3 : 999 }
function gates(c) {
  const fails = [];
  if (c.liq < RULES.minLiq) fails.push('liquidity');
  if (c.mcap < RULES.minMcap) fails.push('market cap');
  if (c.holders < RULES.minHolders) fails.push('holders');
  if (c.organic < RULES.minOrganic) fails.push('organic score');
  if (ageH(c) < RULES.minAgeH) fails.push('age');
  if (c.vol1h < RULES.minVol1h) fails.push('volume');
  return fails;
}
// proportional weights with a cap and a floor (water-filling, sums to 1)
function capped(raw, cap, floor) {
  const n = raw.length; let w = new Array(n).fill(0); const fixed = new Array(n).fill(false);
  for (let it = 0; it < n + 2; it++) {
    const left = 1 - w.reduce((s, v, i) => s + (fixed[i] ? v : 0), 0);
    const free = raw.map((v, i) => fixed[i] ? 0 : v); const fs = free.reduce((a, b) => a + b, 0) || 1;
    let changed = false;
    for (let i = 0; i < n; i++) if (!fixed[i]) { w[i] = left * free[i] / fs; if (w[i] > cap) { w[i] = cap; fixed[i] = true; changed = true } else if (w[i] < floor) { w[i] = floor; fixed[i] = true; changed = true } }
    if (!changed) break;
  }
  const s = w.reduce((a, b) => a + b, 0); return w.map(v => v / s);
}
// momentum (1h, 6h, 24h) times quality (organic, volume depth)
function score(c) {
  const mom = 0.5 * clamp(c.ch1h, -50, 150) + 0.3 * clamp(c.ch6h, -80, 300) / 2 + 0.2 * clamp(c.ch24h, -90, 600) / 4;
  const qual = (c.organic / 100) * clamp(Math.log10(Math.max(10, c.vol1h)) / 5, 0.2, 1.2);
  return +(mom * qual).toFixed(3);
}
function target(list) {
  const ranked = list.map(c => ({ c, s: score(c), fails: gates(c) })).filter(x => !x.fails.length && x.s > 0).sort((a, b) => b.s - a.s).slice(0, RULES.n);
  if (!ranked.length) return [];
  const w = capped(ranked.map(x => x.s), ranked.length < 4 ? 1 / ranked.length : RULES.cap, Math.min(RULES.floor, 1 / ranked.length));
  return ranked.map((x, i) => ({
    mint: x.c.mint, sym: x.c.sym, name: x.c.name, icon: x.c.icon, price: x.c.price, weight: +w[i].toFixed(4), score: x.s,
    why: { ch1h: x.c.ch1h, ch6h: x.c.ch6h, ch24h: x.c.ch24h, vol1h: Math.round(x.c.vol1h), organic: x.c.organic, holders: x.c.holders, liq: Math.round(x.c.liq), mcap: Math.round(x.c.mcap), ageH: Math.round(ageH(x.c)) },
  }));
}
// the basket against the market: weighted vs equal-weight moves of every coin we track
function vsMarket(list, tgt) {
  const avg = k => { const v = list.map(c => c[k]).filter(x => isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0 }; // the market = the median coin
  const bw = k => tgt.reduce((s, t) => s + t.weight * clamp((list.find(c => c.mint === t.mint) || {})[k] || 0, -95, 1000), 0);
  return { basket1h: +bw('ch1h').toFixed(2), market1h: +avg('ch1h').toFixed(2), basket24h: +bw('ch24h').toFixed(2), market24h: +avg('ch24h').toFixed(2), tracked: list.length };
}
module.exports = { RULES, score, gates, target, vsMarket, ageH };
