// one coin by mint (?mint=), or many (?mints=a,b,c): the line, else Jupiter search (pump.fun only)
const { wrap, fail } = require('../lib/http'); const M = require('../lib/market'); const B = require('../lib/basket');
const OK = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
module.exports = wrap(async req => {
  const q = req.query || {};
  if (q.mints) {
    const mints = String(q.mints).split(',').map(s => s.trim()).filter(m => OK.test(m)).slice(0, 60);
    if (!mints.length) throw fail(400, 'bad mints');
    const u = await M.universe().catch(() => []); const have = new Map(u.map(c => [c.mint, c]));
    const miss = mints.filter(m => !have.has(m));
    const got = miss.length ? await M.many(miss) : [];
    got.forEach(c => have.set(c.mint, c));
    return { coins: mints.map(m => have.get(m)).filter(Boolean).map(c => ({ ...c, score: B.score(c) })) };
  }
  const mint = String(q.mint || ''); if (!OK.test(mint)) throw fail(400, 'bad mint');
  const c = await M.coin(mint); if (!c) throw fail(404, 'not a live pump.fun coin yet');
  return { coin: { ...c, score: B.score(c) } };
}, { cache: 'public, max-age=10, s-maxage=15, stale-while-revalidate=60' });
