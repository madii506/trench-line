// POST {wallet, msg, sig(base64)} → {wallet, uid, token}. The signature proves the wallet; nothing is sent onchain.
const { wrap, fail } = require('../lib/http'); const A = require('../lib/auth');
module.exports = wrap(async req => {
  if (req.method !== 'POST') throw fail(405, 'POST only');
  const b = req.body || {}, w = String(b.wallet || '');
  if (!A.OK.test(w)) throw fail(400, 'bad wallet address');
  if (!A.fresh(w, b.msg)) throw fail(400, 'the sign-in message is old or does not match this wallet. try again.');
  if (!A.verify(w, b.msg, b.sig)) throw fail(401, 'the signature does not match this wallet');
  return { wallet: w, uid: A.uidOf(w), token: A.token(w) };
});
