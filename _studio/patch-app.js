// one-shot: re-theme + rebrand the trading app (client/index.html, app.js) to FluxDEX. (run once)
'use strict';
const fs = require('fs'); const path = require('path');
const HF = path.join(__dirname, '..', 'client', 'index.html'), AF = path.join(__dirname, '..', 'client', 'src', 'app.js');
let h = fs.readFileSync(HF, 'utf8'), a = fs.readFileSync(AF, 'utf8');
const rep = (x, y) => { if (!h.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); h = h.split(x).join(y); };
// head
h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>FluxDEX — trade</title>');
h = h.replace(/<meta name="description"[^>]*>/, '<meta name="description" content="Trade BTC, ETH, SOL, HYPE, ZEC, NEAR, JUP and PUMP perps up to 50x on FluxDEX, run on the percolator risk engine.">');
h = h.replace(/hoodliquiddex\.xyz/g, 'fluxdex.fun').replace(/content="HOODLIQUID"/, 'content="FluxDEX"');
h = h.replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="FluxDEX — perps that can\'t go insolvent">').replace(/<meta name="twitter:title"[^>]*>/, '<meta name="twitter:title" content="FluxDEX — perps that can\'t go insolvent">');
h = h.replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="BTC, ETH, SOL, HYPE, ZEC, NEAR, JUP and PUMP perps on the percolator risk engine. $FLUX">');
h = h.replace('family=Audiowide&', 'family=Unbounded:wght@400;600;800&');
// palette: plasma cyan / violet / magenta on deep space
const r0 = h.indexOf(':root{'), r1 = h.indexOf('}', r0) + 1;
h = h.slice(0, r0) + `:root{
  /* FLUXDEX theme — plasma cyan → violet → magenta on deep space */
  --bg:#05060a; --bg2:#0a0c16; --pnl:#0c0f1c; --pnl2:#111527;
  --line:rgba(140,170,255,.14); --line2:rgba(140,170,255,.28);
  --ink:#f2f6ff; --dim:#9aa6c4; --mut:#5b6685; --faint:#323a55;
  --up:#2dffa8; --up-d:#1fcf86; --down:#ff4d6d; --down-d:#d43a57;
  --acc:#00f0ff; --acc2:#9ff8ff; --gold:#ffd166; --glow:rgba(0,240,255,.22);
  --disp:'Unbounded',sans-serif;
  --chrome:linear-gradient(100deg,#00f0ff,#7b5cff 55%,#ff3df5);
  --glass:linear-gradient(180deg,rgba(24,30,58,.55),rgba(8,10,20,.6));
}` + h.slice(r1);
// brand
h = h.replace(/<b>HoodLiquid<\/b><span class="chip">PAPER<\/span>/, '<b>FLUXDEX</b>');
h = h.replace(/<svg class="drop"[\s\S]*?<\/svg>/, '<svg class="drop" viewBox="0 0 40 40"><defs><linearGradient id="fxg" x1="0" x2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset=".55" stop-color="#7b5cff"/><stop offset="1" stop-color="#ff3df5"/></linearGradient></defs><path d="M6 27c5-16 10-16 13 0s9 15 15-2" stroke="url(#fxg)" stroke-width="5" fill="none" stroke-linecap="round"/></svg>');
h = h.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%2305060a'/%3E%3Cpath d='M9 27c5-14 9-14 11 0s7 13 11-1' stroke='%2300f0ff' stroke-width='4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">`);
h = h.replace('https://github.com/PumpLandSOL/hoodliquid', 'https://github.com/PumpLandSOL/fluxdex').replace('https://x.com/HoodLiquidDEX', 'https://x.com/');
// copy: no paper/demo framing; honest about what it is
h = h.replace(/<div class="status-pill">[\s\S]*?<\/div>/, '<div class="status-pill"><span class="d"></span>LIVE PRICES · PERCOLATOR RISK ENGINE · SOLANA</div>');
h = h.replace(/<h1>Trade perps on <span class="g">any token.<\/span><\/h1>/, '<h1>Trade the majors. <span class="g">Up to 50x.</span></h1>');
h = h.replace('Start paper trading ↓', 'Start trading ↓');
h = h.replace(/<div class="nettoggle"[\s\S]*?<\/div>\s*<\/div>/, '');
h = h.replace(/<div class="card stat"><div class="l">\$HOOD Price<\/div><div class="v mono" id="s-drip">—<\/div><\/div>/, '');
h = h.replace('<span class="t">$HOOD CA</span>', '<span class="t">$FLUX CA</span>');
h = h.replace(/<div class="disc">[\s\S]*?<\/div>/, '<div class="disc"><b>How FluxDEX settles.</b> Every market marks to live prices (CoinGecko for the majors, Jupiter for Solana listings). Funding, mark-to-market, liquidations and the haircut H run on the percolator engine in real time. Each wallet trades from its own margin account; profit is always paid at H, so exits never exceed what the vault holds.</div>');
h = h.replace(/<footer>[\s\S]*?<\/footer>/, '<footer>FluxDEX · perps on the percolator risk engine · Solana · <span class="mono">$FLUX</span></footer>');
h = h.replace('/* HOODLIQUID theme — liquid emerald on black, green gloss */', '');
fs.writeFileSync(HF, h);
// app.js
a = a.replace("(m.src === 'dex' ? 'DEX oracle (pinned pair)' : 'Pyth oracle')", "(m.kind === 'major' ? 'CoinGecko + Jupiter' : 'Jupiter')");
a = a.replace(/\$\('s-drip'\)\.textContent = [^;]*;/, '');
a = a.replace(/document\.getElementById\('net-demo'\)\.onclick = \(\) => setMode\(false\);/, "if (document.getElementById('net-demo')) document.getElementById('net-demo').onclick = () => setMode(false);");
fs.writeFileSync(AF, a);
const left = (h + a).match(/HOOD|HoodLiquid|hoodliquid|Robinhood|Pyth|paper|PAPER/g) || [];
console.log('app patched; leftovers:', left.length ? [...new Set(left)].join(',') : 'none');
