# .trench

own the trenches. a terminal for calls on live pump.fun coins, and a basket of the top performers that the $TRENCH creator fees buy.

## what works

- **new · stretch · graduated** (like a pulse): new launches, coins past 50% of their bonding curve, and coins that just graduated to PumpSwap, all from the live stream.
- **the line, live**: new pump.fun launches stream in as they happen, straight from the chain through PumpPortal's public data websocket (`assets/js/stream.js`, in the visitor's browser, reconnects on its own). each new coin shows its market cap, bonding-curve progress and dev buy, and its trades tick in live. while the stream is down, `/api/fresh` (Jupiter recent + GeckoTerminal new pump.fun pools) fills the list every 10 s. hovering the list pauses it so nothing moves under the cursor.
- **trending · gainers · losers · ★ watch**: live pump.fun coins from Jupiter, a watchlist kept in the browser, search by ticker or paste any mint.
- **the open coin**: candles from its deepest pool (Dexscreener → GeckoTerminal), a tick chart of every trade for coins too new for candles, a live trade tape (`/api/trades` + the stream), prices and icons filled in by Jupiter once it has indexed the coin (`/api/coin?mints=`).
- **keys**: ↑↓ or j k move · l long · h hedge · 1 2 3 window · c call · w watch · / find · [ ] switch list · ` command line.
- **wallet**: connect Phantom, Solflare, Backpack or any browser wallet. the wallet signs a plain text message (free: no transaction, no fees), `/api/login` checks the ed25519 signature and returns a session token bound to that wallet. calls are made as the wallet.
- **calls**: long (up) or hedge (down) any live pump.fun coin over 15m, 1h or 4h. the entry locks at the live Jupiter price. when the window closes the call settles on the close of the 1-minute candle at that time. points only: a win is 100 + 10 per 1% moved (max 500), a miss −50, under 0.2% is a push. limits: 8 open calls per player, one open call per coin, 40 calls an hour per IP.
- **the board**: points by callsign, all time / 7d / 24h.
- **the basket**: every coin is scored live (momentum over 1h/6h/24h × organic volume) after gates (liquidity ≥ $40K, mcap ≥ $300K, holders ≥ 800, organic ≥ 55, age ≥ 6h, 1h volume ≥ $4K). top 8, 6–25% each. shown against the median coin.
- **the engine** (`/api/rebalance`, hourly): claims the $TRENCH creator fees to the engine wallet (the engine as creator, or pump's fee sharing paying the engine), sells coins that left the basket, trims coins 20% over weight, buys coins under weight with Jupiter. keeps 0.03 SOL for fees, max 6 swaps a run, never sells $TRENCH. every trade is logged with its signature.

## the intro and the score

the intro is a three.js night battlefield (`assets/js/intro.js`): a gate with sound on/off, a crane shot into the trench, the walk across no man's land (searchlights, tracers, lightning, a near miss), down the far trench into a timber bunker (swinging lamp, dust, a map, bunks), the CRT login and the throw into the terminal. it plays once per browser session; `?nointro` skips it.

the music ("line 7", `assets/js/score.js`) is synthesized live with Web Audio: a 3/4 waltz in A minor at 72 bpm (music box, harmonium, felt harp, upright bass) heard first through a field radio with rain and record crackle. the radio clears as you reach the dugout, the melody arrives as you land, and it fades out as you land inside the PC. it only starts after a click with sound on (the switch is in the corner of the intro).

## env (Vercel → project → settings → environment variables)

| name | what |
|---|---|
| `DATABASE_URL` | Postgres (Vercel Storage → Neon). calls, the board and the engine log live here. |
| `TRENCH_ENGINE_KEY` | the engine wallet's secret key (base58 or a JSON byte array). set this yourself, never paste it in a chat. |
| `TRENCH_CA` | the $TRENCH mint, once launched |
| `TRENCH_X` | your X profile url (optional) |
| `CRON_SECRET` | any long random string |
| `TRENCH_SECRET` | any long random string. signs wallet sessions (falls back to `CRON_SECRET`). |
| `RPC_URL` | a Solana RPC url (optional, a paid one is better for the engine) |

the engine wallet must be the coin's creator, or the coin's fee sharing must pay it.

## the hourly run

GitHub → repo → settings → secrets and variables → actions:

- `CRON_SECRET`: the same value as on Vercel
- `TRENCH_SITE`: the site url, e.g. `https://trench-line.vercel.app`

`.github/workflows/rebalance.yml` calls `/api/rebalance` at :07 every hour. run it once by hand with `?dry=1` first (simulates every swap):

```
curl -H "Authorization: Bearer $CRON_SECRET" "$TRENCH_SITE/api/rebalance?dry=1"
```

## dev

```
TRENCH_MOCK=1 TRENCH_PGLITE=memory node dev/server.cjs   # http://localhost:8791, market data from dev/real.json
node dev/t_calls.cjs                                     # calls: create, settle, points, board
node dev/t_engine.cjs                                    # the engine plan with stubbed chain + swaps
```
