// the target basket (live), what the engine holds (on-chain), and the rebalance log
const { wrap } = require('../lib/http'); const M = require('../lib/market'); const B = require('../lib/basket'); const C = require('../lib/chain'); const E = require('../lib/engine'); const db = require('../lib/db');
module.exports = wrap(async () => {
  const list = await M.universe();
  const target = B.target(list);
  const out = { at: Date.now(), rules: B.RULES, target, vs: B.vsMarket(list, target), engine: null, held: null, log: [] };
  const pk = C.enginePub();
  if (pk) {
    out.engine = pk.toBase58();
    try { const h = await E.holdingsValued(pk); out.held = { sol: h.sol, total: +h.total.toFixed(2), tokens: h.tokens.filter(t => t.usd >= 0.5).map(t => ({ mint: t.mint, sym: (list.find(c => c.mint === t.mint) || {}).sym || null, usd: +t.usd.toFixed(2), weight: h.total ? +(t.usd / h.total).toFixed(4) : 0 })) } } catch (e) { out.heldError = 'could not read the engine wallet' }
  }
  if (db.hasDb()) { try { out.log = (await db.q('select t,kind,mint,sym,data,sig from trench_log order by t desc limit 30')).map(r => ({ t: +r.t, kind: r.kind, mint: r.mint, sym: r.sym, data: r.data, sig: r.sig })) } catch (_) { } }
  return out;
}, { cache: 'public, max-age=15, s-maxage=30, stale-while-revalidate=120' });
