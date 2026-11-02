const { wrap } = require('../lib/http'); const db = require('../lib/db'); const C = require('../lib/chain'); const B = require('../lib/basket');
module.exports = wrap(async () => ({ ready: db.hasDb(), engine: C.enginePub() ? C.enginePub().toBase58() : null, ca: C.ca(), x: process.env.TRENCH_X || null, rules: B.RULES, windows: [15, 60, 240] }), { cache: 'public, max-age=30, s-maxage=60' });
