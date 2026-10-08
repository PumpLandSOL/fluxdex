'use strict';
const fs = require('fs'), path = require('path');
const BIO = 'Perps that can\'t go insolvent. BTC, ETH, SOL, HYPE, ZEC, NEAR, JUP and PUMP up to 50x, on the percolator risk engine. $FLUX · fluxdex.fun';
const T = [
  ['hype video', 'fluxdex-hype-12s.mp4', `most perp DEXs stay solvent on a promise.

then come the ADL, the socialized losses, the bank runs.

FluxDEX runs on the math instead: the percolator risk engine.

8 majors. up to 50x. perps that can't go insolvent.

fluxdex.fun`],
  ['engine video', 'fluxdex-engine-27s.mp4', `how FluxDEX stays solvent, in 3 rules:

01 capital is senior. profit is paid at haircut H
02 A/K/F indices. no queue, no ADL lottery
03 bounded cranks. one bad tick can't blow up the book

the percolator engine, explained.`],
  ['demo video', 'fluxdex-demo-22s.mp4', `22 seconds inside FluxDEX:

→ pick from 8 majors
→ set size + leverage, see your liq price first
→ track PnL and what you can withdraw, live
→ watch the vault and haircut H in public

fluxdex.fun`],
  ['key art', 'fluxdex-keyart.png', `perps that can't go insolvent.

FluxDEX: BTC, ETH, SOL, HYPE, ZEC, NEAR, JUP and PUMP, up to 50x, on the percolator risk engine.

profit is only ever paid from capital that actually exists.

fluxdex.fun`],
  ['markets', 'fluxdex-markets.png', `8 majors. live.

BTC 50x · ETH 50x · SOL 50x
HYPE 25x · ZEC 20x · NEAR 20x
JUP 20x · PUMP 15x

marks refresh every 10 seconds. leverage capped per market.

fluxdex.fun`],
  ['engine', 'fluxdex-engine.png', `solvency isn't a promise. it's the math.

H = min(Residual, ΣPnL⁺) / ΣPnL⁺

capital is senior, profit is junior, and nobody can withdraw more than the vault holds.

that's percolator. that's FluxDEX.`],
  ['solvency', 'fluxdex-solvency.png', `every exit, fully backed.

FluxDEX publishes the vault, the insurance fund, the residual and every dollar of open profit, live.

if exits weren't covered, you'd see the haircut H move first.

fluxdex.fun`],
  ['vs perp DEX tokens', 'fluxdex-vs.png', `perp DEX tokens right now:

$HYPE $19.3B
$ASTER $1.94B
$DYDX $0.11B
$GMX $0.09B
$DRIFT $0.01B

none of them run the percolator engine.

$FLUX does. ATH: not set.

fluxdex.fun`],
  ['pfp (intro)', 'fluxdex-pfp.png', `FluxDEX is live.

the perp DEX built on percolator: capital senior, profit junior, exits backed by math.

trade the majors up to 50x.

$FLUX · fluxdex.fun`],
  ['banner (pinned)', 'fluxdex-banner.png', `pinned:

FluxDEX — perps that can't go insolvent.

BTC · ETH · SOL · HYPE · ZEC · NEAR · JUP · PUMP
up to 50x
percolator risk engine
Solana

fluxdex.fun`],
];
let bad = 0; const out = [`# FluxDEX · X kit\n\n**X:** @FluxDEXSOL (https://x.com/FluxDEXSOL) · **Site:** https://fluxdex.fun · **Ticker:** $FLUX · **Chain:** Solana\n\n## Bio (${[...BIO].length}/160)\n\`\`\`\n${BIO}\n\`\`\`\n\n## Tweets (all ≤245 chars)\n`];
T.forEach(([n, a, t], i) => { const c = [...t].length; if (c > 245) bad++; console.log(String(i + 1).padStart(2), n.padEnd(20), c); out.push(`**${i + 1} · ${n}** (\`brand/${a}\`, ${c} chars)\n\`\`\`\n${t}\n\`\`\`\n`); });
if ([...BIO].length > 160) { bad++; console.log('BIO', [...BIO].length); } if (bad) { console.log('OVER'); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '..', 'X-KIT.md'), out.join('\n')); console.log('wrote X-KIT.md');
