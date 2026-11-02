// live pump.fun coins with their basket score
const { wrap } = require('../lib/http'); const M = require('../lib/market'); const B = require('../lib/basket');
module.exports = wrap(async req => {
  const sort = String((req.query && req.query.sort) || 'trending');
  const [list, sol] = await Promise.all([M.universe(), M.solPrice().catch(() => null)]);
  const tgt = new Set(B.target(list).map(t => t.mint));
  const key = { trending: c => c.vol1h * (1 + Math.max(0, c.ch1h) / 100), gainers: c => c.ch1h, losers: c => -c.ch1h, volume: c => c.vol24h, mcap: c => c.mcap, new: c => Date.parse(c.created || 0) || 0 }[sort] || (c => c.vol1h);
  const coins = list.slice().sort((a, b) => key(b) - key(a)).slice(0, 80).map(c => ({ ...c, score: B.score(c), inBasket: tgt.has(c.mint) }));
  return { sort, at: Date.now(), sol, coins };
}, { cache: 'public, max-age=8, s-maxage=12, stale-while-revalidate=60' });
