// one-shot: server branding + Solana config + no fabricated token price. (run once)
'use strict';
const fs = require('fs'); const path = require('path');
const F = path.join(__dirname, '..', 'server', 'index.js'); let s = fs.readFileSync(F, 'utf8');
const rep = (x, y) => { if (!s.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); s = s.split(x).join(y); };
const h0 = s.indexOf("'use strict';");
s = `// FLUXDEX — perpetual futures on Solana memecoins and majors, run on a port of the PERCOLATOR risk engine
// (toly / aeyakovenko percolator lineage). Structural solvency from three invariants:
//   1. H  — haircut ratio: capital is senior, profit is junior. Residual = V - (C_tot + I); profits pay out at H.
//   2. A/K/F — lazy per-side indices: queue-free ADL / funding / mark socialization, O(1) per account.
//   3. Bounded cranks: |ΔP|*1e4 <= max_move_bps*dt*P_last, so no single tick can blow up open interest.
//   + side recovery: Normal → DrainOnly (A<MIN_A) → ResetPending (OI=0, epoch++) → Normal.
// Every market is a Solana mint priced live by Jupiter. Dependency-free Node.
` + s.slice(h0);
rep("const TOKEN = 'HOOD';", "const TOKEN = 'FLUX';");
rep("const HOOD_MINT = process.env.HOOD_MINT || ''; // $HOOD · Robinhood Chain (CA bar, dormant until set)", "const FLUX_MINT = process.env.FLUX_MINT || ''; // $FLUX on Solana (CA bar shows once set)");
s = s.split('HOOD_MINT').join('FLUX_MINT').split('HOOD_PROGRAM_ID').join('FLUX_PROGRAM_ID').split('hoodMint').join('fluxMint');
rep("cluster: process.env.CHAIN_CLUSTER || 'robinhood',", "cluster: process.env.CHAIN_CLUSTER || 'mainnet-beta',");
rep("const coins = MKT.filter((m) => m.src === 'dex').map((m) => ({", "const coins = MKT.filter((m) => m.kind === 'meme').map((m) => ({");
rep("    pair: m.eco && m.eco.pair || m.ds || '',", "    mint: m.mint || '',");
rep("return { chain: 'robinhood', listed: coins.length, lastDiscovery: DISC_LAST, coins };", "return { chain: 'solana', listed: coins.length, lastDiscovery: DISC_LAST, coins };");
rep(", hoodPrice: +(0.002 + Math.max(0, s.residual) / 2e7).toFixed(6), leaderboard: lb };", ", leaderboard: lb };");
s = s.split("priceSource: 'Pyth + DEX'").join("priceSource: 'Jupiter'");
rep("network: 'robinhood-chain'", "network: 'solana'");
s = s.replace(/markets\(\) \{ return MKT\.map\(\(m\) => \(\{ sym: m\.sym, src: m\.src,/, "markets() { return MKT.map((m) => ({ sym: m.sym, src: m.src, kind: m.kind, mint: m.mint, name: m.eco && m.eco.name,");
s = s.replace(/\/\/ auto-list the Robinhood ecosystem from live pairs/g, '// auto-list liquid Solana memecoins').replace(/\/\/ re-scan the Robinhood ecosystem every 3 min/g, '// re-scan every 3 min');
s = s.replace(/console\.log\('HOODLIQUID[^;]*;/, "console.log('FLUXDEX × percolator on :' + PORT + ' · ' + MKT.length + ' markets (' + LISTED_COUNT + ' auto-listed) · Jupiter prices');");
s = s.replace(/\/\/ so positions on auto-listed Robinhood coins survive/, '// so positions on auto-listed coins survive');
fs.writeFileSync(F, s); console.log('server patched');
