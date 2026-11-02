// Jupiter swaps signed by the OCT engine key, plus send/confirm helpers.
const { VersionedTransaction, PublicKey } = require('@solana/web3.js');
const { getJSON, fetchT } = require('./http');
const { connection } = require('./chain');

const JUP = 'https://lite-api.jup.ag/swap/v1';

async function quote(inputMint, outputMint, amount, slippageBps = 100, exclude = '') {
  const u = `${JUP}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${BigInt(Math.floor(amount))}&slippageBps=${slippageBps}&restrictIntermediateTokens=true` + (exclude ? '&excludeDexes=' + encodeURIComponent(exclude) : '');
  const q = await getJSON(u, {}, 10000);
  if (!q || !q.outAmount) throw new Error('no route ' + inputMint.slice(0, 4) + '→' + outputMint.slice(0, 4));
  return q;
}

async function swapTx(q, user) {
  const r = await fetchT(`${JUP}/swap`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse: q, userPublicKey: user.toString(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, dynamicSlippage: false, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 300000, priorityLevel: 'high' } } }),
  }, 12000);
  if (!r.ok) throw new Error('jupiter swap ' + r.status);
  const j = await r.json();
  if (!j.swapTransaction) throw new Error('jupiter swap: no tx');
  return VersionedTransaction.deserialize(Buffer.from(j.swapTransaction, 'base64'));
}

async function sendAndConfirm(tx, { skipPreflight = false } = {}) {
  const c = connection();
  const raw = tx.serialize();
  const sig = await c.sendRawTransaction(raw, { skipPreflight, maxRetries: 3, preflightCommitment: 'confirmed' });
  const bh = tx.message.recentBlockhash;
  const lv = (await c.getLatestBlockhash('confirmed')).lastValidBlockHeight;
  const res = await c.confirmTransaction({ signature: sig, blockhash: bh, lastValidBlockHeight: lv }, 'confirmed');
  if (res.value && res.value.err) throw new Error('tx failed ' + sig + ' ' + JSON.stringify(res.value.err));
  return sig;
}

// Token delta for owner/mint in a confirmed tx (raw units). SOL mint → lamports delta of the owner.
async function deltas(sig, owner, mints) {
  const c = connection();
  let tx = null;
  for (let i = 0; i < 4 && !tx; i++) { tx = await c.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }); if (!tx) await new Promise(r => setTimeout(r, 800)) }
  if (!tx || !tx.meta) return null;
  const o = owner.toString(), out = {};
  for (const m of mints) {
    if (m === 'So11111111111111111111111111111111111111112') {
      const keys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
      const i = keys.findIndex(k => k.toString() === o);
      out[m] = i >= 0 ? (tx.meta.postBalances[i] - tx.meta.preBalances[i]) : 0;
      // include wrapped SOL changes too
      const pre = (tx.meta.preTokenBalances || []).filter(b => b.owner === o && b.mint === m).reduce((s, b) => s + +b.uiTokenAmount.amount, 0);
      const post = (tx.meta.postTokenBalances || []).filter(b => b.owner === o && b.mint === m).reduce((s, b) => s + +b.uiTokenAmount.amount, 0);
      out[m] += post - pre;
    } else {
      const pre = (tx.meta.preTokenBalances || []).filter(b => b.owner === o && b.mint === m).reduce((s, b) => s + +b.uiTokenAmount.amount, 0);
      const post = (tx.meta.postTokenBalances || []).filter(b => b.owner === o && b.mint === m).reduce((s, b) => s + +b.uiTokenAmount.amount, 0);
      out[m] = post - pre;
    }
  }
  out.fee = tx.meta.fee;
  return out;
}

// Swap with the engine key. Returns {sig, in, out} in raw units (actual fills when readable).
async function swap(kp, inputMint, outputMint, amountRaw, { dry = false, slippageBps = 100, exclude = '' } = {}) {
  const q = await quote(inputMint, outputMint, amountRaw, slippageBps, exclude);
  const tx = await swapTx(q, kp.publicKey);
  if (dry) {
    const sim = await connection().simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    return { sig: null, dry: true, in: +q.inAmount, out: +q.outAmount, simErr: sim.value.err || null, logs: (sim.value.logs || []).slice(-3) };
  }
  tx.sign([kp]);
  let sig;
  try { sig = await sendAndConfirm(tx) }
  catch (e) {
    // one retry around the venues of the failed route (preflight rejects never land, so nothing was spent)
    if (exclude || !/simulation|preflight|custom program error|0x/i.test(String(e.message))) throw e;
    const venues = [...new Set((q.routePlan || []).map(r => r.swapInfo && r.swapInfo.label).filter(Boolean))].join(',');
    return swap(kp, inputMint, outputMint, amountRaw, { dry, slippageBps: slippageBps + 50, exclude: venues || 'GoonFi V2' });
  }
  const d = await deltas(sig, kp.publicKey, [inputMint, outputMint]).catch(() => null);
  const inAmt = d && d[inputMint] < 0 ? -d[inputMint] - (inputMint.startsWith('So111') ? d.fee : 0) : +q.inAmount;
  const outAmt = d && d[outputMint] + (outputMint.startsWith('So111') ? d.fee : 0) > 0 ? d[outputMint] + (outputMint.startsWith('So111') ? d.fee : 0) : +q.outAmount;
  return { sig, in: inAmt, out: outAmt };
}

module.exports = { quote, swapTx, swap, sendAndConfirm, deltas };
