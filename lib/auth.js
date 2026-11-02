// Wallet sign-in: the wallet signs a plain text message (free, no transaction), the server checks the ed25519 signature
// and hands back a token bound to that wallet. Calls are made as the wallet.
const crypto = require('crypto');
const bs58m = require('bs58'); const bs58 = bs58m.default || bs58m;
const OK = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const secret = () => process.env.TRENCH_SECRET || process.env.CRON_SECRET || process.env.DATABASE_URL || process.env.POSTGRES_URL || 'trench-dev-only';
const uidOf = w => crypto.createHash('sha256').update('trench:' + w).digest('hex').slice(0, 32);
const token = w => crypto.createHmac('sha256', secret()).update('trench-wallet:' + w).digest('base64url');
function check(w, t) {
  if (!OK.test(w || '') || typeof t !== 'string' || !t) return false;
  const a = Buffer.from(token(w)), b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function verify(w, msg, sigB64) {
  let pub; try { pub = Buffer.from(bs58.decode(w)); } catch (_) { return false; }
  if (pub.length !== 32) return false;
  const sig = Buffer.from(String(sigB64 || ''), 'base64'); if (sig.length !== 64) return false;
  try { const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: pub.toString('base64url') }, format: 'jwk' }); return crypto.verify(null, Buffer.from(String(msg), 'utf8'), key, sig); }
  catch (_) { return false; }
}
// the message must name the wallet and be fresh (10 minutes)
function fresh(w, msg) {
  msg = String(msg || ''); if (msg.length > 600) return false;
  const mw = (msg.match(/\nwallet: ([1-9A-HJ-NP-Za-km-z]{32,44})\n/) || [])[1];
  const mt = Date.parse((msg.match(/\nissued: ([0-9TZ:.\-]+)\n/) || [])[1] || '');
  return mw === w && isFinite(mt) && Math.abs(Date.now() - mt) < 10 * 60e3 && msg.startsWith('.trench wants you to sign in');
}
module.exports = { OK, uidOf, token, check, verify, fresh };
