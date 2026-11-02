// Solana connection, the engine key, and the pump.fun creator-fee claim for $TRENCH.
const { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
let _conn = null;
function connection() { return _conn || (_conn = new Connection(process.env.RPC_URL || 'https://solana-rpc.publicnode.com', { commitment: 'confirmed' })) }
function engineKeypair() {
  const s = process.env.TRENCH_ENGINE_KEY; if (!s) return null;
  try { const t = s.trim(); return Keypair.fromSecretKey(t.startsWith('[') ? Uint8Array.from(JSON.parse(t)) : bs58.decode(t)) } catch (_) { return null }
}
function enginePub() { const k = engineKeypair(); return k ? k.publicKey : null }
function ca() { const c = (process.env.TRENCH_CA || '').trim(); try { return c ? new PublicKey(c).toBase58() : null } catch (_) { return null } }
function v0(payer, ixs, blockhash) { return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()) }
function cu(limit, micro) { return [ComputeBudgetProgram.setComputeUnitLimit({ units: limit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: micro })] }

// Claim $TRENCH creator fees to the engine. Works when the engine is the coin's creator, or when the coin's
// fee sharing config pays the engine (pump's distribute instruction). Returns { sol, sig } (sol 0 = nothing to claim).
async function claimFees(kp, { dry } = {}) {
  const mint = ca(); if (!mint) return { sol: 0, skipped: 'no TRENCH_CA' };
  const SDK = require('@pump-fun/pump-sdk');
  const online = new SDK.OnlinePumpSdk(connection());
  const mintPk = new PublicKey(mint), me = kp.publicKey;
  let ixs = [], sol = 0, via = '';
  try {
    const min = await online.getMinimumDistributableFee(mintPk, me, { payer: me });
    const lam = +min.distributableFees.toString();
    if (min.canDistribute && lam > 0) { ixs = (await online.buildDistributeCreatorFeesInstructions(mintPk, { payer: me })).instructions; sol = lam / 1e9; via = 'sharing' }
  } catch (_) { /* no sharing config: the engine is the creator */ }
  if (!ixs.length) {
    const bal = await online.getCreatorVaultBalanceBothPrograms(me).catch(() => null);
    const lam = bal ? +bal.toString() : 0;
    if (lam > 5000) { ixs = await online.collectCoinCreatorFeeInstructions(me); sol = lam / 1e9; via = 'creator' }
  }
  if (!ixs.length) return { sol: 0 };
  const bh = (await connection().getLatestBlockhash('confirmed')).blockhash;
  const tx = v0(me, [...cu(400000, 100000), ...ixs], bh);
  if (dry) { const sim = await connection().simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true }); return { sol, via, dry: true, simErr: sim.value.err || null } }
  tx.sign([kp]);
  const J = require('./jup');
  const sig = await J.sendAndConfirm(tx);
  return { sol, via, sig };
}

// Token balances of a wallet across both token programs: [{mint, raw, decimals, ui}]
async function holdings(owner) {
  const c = connection(); const pk = new PublicKey(owner);
  const progs = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
  const out = [];
  for (const p of progs) {
    const r = await c.getParsedTokenAccountsByOwner(pk, { programId: new PublicKey(p) });
    for (const a of r.value) { const i = a.account.data.parsed.info; const t = i.tokenAmount; if (+t.amount > 0) out.push({ mint: i.mint, raw: t.amount, decimals: t.decimals, ui: +t.uiAmountString }) }
  }
  const lam = await c.getBalance(pk);
  return { sol: lam / 1e9, tokens: out };
}

module.exports = { connection, engineKeypair, enginePub, ca, claimFees, holdings, v0, cu };
