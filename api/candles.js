const { wrap, fail } = require('../lib/http'); const M = require('../lib/market');
module.exports = wrap(async req => {
  const mint = String((req.query && req.query.mint) || ''); const tf = String((req.query && req.query.tf) || '5m');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw fail(400, 'bad mint');
  const p = await M.pool(mint).catch(() => null);
  const candles = p ? await M.candles(mint, tf, 96).catch(() => []) : [];
  return { mint, tf, pool: p, candles };
}, { cache: 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' });
