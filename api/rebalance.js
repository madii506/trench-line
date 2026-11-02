// The hourly engine run. Authorization: Bearer CRON_SECRET (GitHub Actions). ?dry=1 simulates.
const { wrap, fail } = require('../lib/http'); const E = require('../lib/engine'); const K = require('../lib/calls');
module.exports = wrap(async req => {
  const sec = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization || '');
  if (!sec || auth !== 'Bearer ' + sec) throw fail(401, 'unauthorized');
  const dry = String((req.query && req.query.dry) || '') === '1';
  const settled = await K.settle(40).catch(() => 0);
  return { settled, ...(await E.run({ dry })) };
});
