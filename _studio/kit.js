// FluxDEX brand kit: writes 7 graphic scenes to _studio/src and renders them to brand/ via headless Chrome (cdp.cjs).
// usage: node _studio/kit.js [name]   (live market data is pulled from a running server on KIT_API, default :8254)
'use strict';
const fs = require('fs'), path = require('path'); const { open, sleep } = require('./cdp.cjs');
const S = path.join(__dirname, 'src'), OUT = path.join(__dirname, '..', 'brand'); fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const API = process.env.KIT_API || 'http://localhost:8254';
const LOGO = (w, id = 'lg') => `<svg viewBox="0 0 40 40" style="width:${w}px;height:${w}px"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset=".55" stop-color="#7b5cff"/><stop offset="1" stop-color="#ff3df5"/></linearGradient></defs><path d="M6 27c5-16 10-16 13 0s9 15 15-2" stroke="url(#${id})" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
const BASE = `@import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{background:#05060a;color:#f2f6ff;font-family:Inter,sans-serif;position:relative;overflow:hidden}
.d{font-family:Unbounded,sans-serif;letter-spacing:-.02em}.m{font-family:'JetBrains Mono',monospace}
.g{background:linear-gradient(100deg,#00f0ff,#7b5cff 55%,#ff3df5);-webkit-background-clip:text;background-clip:text;color:transparent}
.glow{position:absolute;border-radius:50%;filter:blur(140px);opacity:.45}
.lines{position:absolute;inset:0;opacity:.5}
.card{background:rgba(14,18,32,.72);border:1px solid rgba(140,170,255,.16);border-radius:28px}
.kick{font-family:'JetBrains Mono';color:#00f0ff;letter-spacing:.22em;text-transform:uppercase}
.foot{position:absolute;left:120px;right:120px;bottom:70px;display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#9aa6c4;letter-spacing:.08em}
.foot b{display:flex;align-items:center;gap:18px;font-family:Unbounded;font-weight:800;color:#f2f6ff;letter-spacing:.02em;font-size:30px}`;
// deterministic flow-line backdrop
function lines(w, h, n = 90, seed = 3) { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const c = ['#00f0ff', '#7b5cff', '#ff3df5']; let o = '';
  for (let i = 0; i < n; i++) { let x = r() * w, y = r() * h, d = 'M' + x.toFixed(0) + ' ' + y.toFixed(0); for (let k = 0; k < 26; k++) { const a = Math.sin(x * .0016) * 1.6 + Math.cos(y * .0021) * 1.4 + Math.sin((x + y) * .0009); x += Math.cos(a) * 14; y += Math.sin(a) * 14; d += ' L' + x.toFixed(0) + ' ' + y.toFixed(0); } o += `<path d="${d}" stroke="${c[i % 3]}" stroke-width="2" fill="none" opacity=".55"/>`; }
  return `<svg class="lines" viewBox="0 0 ${w} ${h}">${o}</svg>`; }
const page = (w, h, body, css = '', foot = true) => `<!doctype html><meta charset="utf-8"><style>${BASE}body{width:${w}px;height:${h}px}${css}</style><body><div class="glow" style="width:900px;height:900px;left:-300px;top:-300px;background:#7b5cff"></div><div class="glow" style="width:800px;height:800px;right:-260px;bottom:-320px;background:#00f0ff"></div>${lines(w, h)}${body}${foot ? `<div class="foot"><b>${LOGO(54, 'fl')}FLUXDEX</b><span>fluxdex.fun · $FLUX · Solana</span></div>` : ''}`;
const fp = (p) => '$' + (p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 1 ? p.toFixed(2) : p >= .01 ? p.toFixed(4) : p.toPrecision(3));

async function build() {
  let MK = []; try { MK = await (await fetch(API + '/api/markets')).json(); } catch (e) {}
  const LEV = { BTC: 50, ETH: 50, SOL: 50, HYPE: 25, ZEC: 20, NEAR: 20, JUP: 20, PUMP: 15 };
  const NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', HYPE: 'Hyperliquid', ZEC: 'Zcash', NEAR: 'NEAR', JUP: 'Jupiter', PUMP: 'Pump.fun' };
  const mk = Object.keys(LEV).map((s) => { const m = MK.find((x) => x.sym === s) || {}; return { sym: s, px: m.px, lev: LEV[s], name: NAMES[s] }; });
  const P = {};
  // 1 pfp
  P['fluxdex-pfp'] = [2000, 2000, `<!doctype html><meta charset="utf-8"><style>${BASE}body{width:2000px;height:2000px;display:grid;place-items:center}</style><body><div class="glow" style="width:1400px;height:1400px;left:300px;top:300px;background:#7b5cff;opacity:.5"></div><div class="glow" style="width:900px;height:900px;left:200px;top:200px;background:#00f0ff;opacity:.35"></div><div style="position:relative;width:1300px;height:1300px;border-radius:340px;background:#0a0c16;border:6px solid rgba(140,170,255,.25);display:grid;place-items:center">${LOGO(900, 'pp')}</div>`];
  // 2 banner
  P['fluxdex-banner'] = [3000, 1000, page(3000, 1000, `<div style="position:absolute;left:180px;top:250px"><div class="d" style="font-size:170px;font-weight:800;line-height:1">Perps that</div><div class="d g" style="font-size:170px;font-weight:800;line-height:1.1">can't go insolvent.</div><div style="font-size:44px;color:#9aa6c4;margin-top:40px">BTC · ETH · SOL · HYPE · ZEC · NEAR · JUP · PUMP &nbsp;·&nbsp; up to 50x &nbsp;·&nbsp; fluxdex.fun</div></div><div style="position:absolute;right:200px;top:230px">${LOGO(520, 'bn')}</div>`, '', false)];
  // 3 keyart
  P['fluxdex-keyart'] = [2400, 1350, page(2400, 1350, `<div style="position:absolute;left:120px;top:120px"><div class="kick" style="font-size:24px">fluxdex · percolator engine · solana</div><div class="d" style="font-size:150px;font-weight:800;line-height:1;margin-top:40px">Perps that<br><span class="g">can't go insolvent.</span></div><div style="font-size:40px;color:#9aa6c4;margin-top:48px;max-width:1500px;line-height:1.45">Trade the majors with up to <b style="color:#f2f6ff">50x</b>. Profit is only ever paid from capital that actually exists.</div><div style="display:flex;gap:18px;margin-top:70px;flex-wrap:wrap">${mk.map((m) => `<div class="card" style="padding:20px 26px;border-radius:18px"><span class="d" style="font-size:30px;font-weight:600">${m.sym}</span> <span class="m" style="font-size:26px;color:#9aa6c4;margin-left:10px">${m.px ? fp(m.px) : ""}</span> <span class="m" style="font-size:20px;color:#00f0ff;margin-left:10px">${m.lev}x</span></div>`).join("")}</div></div>`)];
  // 4 markets
  P['fluxdex-markets'] = [2400, 1350, page(2400, 1350, `<div style="position:absolute;left:120px;top:110px;right:120px"><div class="kick" style="font-size:24px">// markets</div><div class="d" style="font-size:96px;font-weight:800;margin-top:22px">Eight majors. <span class="g">Live.</span></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:60px">${mk.map((m) => `<div class="card" style="padding:38px 40px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="d" style="font-size:46px;font-weight:600">${m.sym}</div><span class="m" style="font-size:24px;padding:8px 14px;border-radius:12px;background:rgba(0,240,255,.14);color:#00f0ff">${m.lev}x</span></div><div style="font-size:24px;color:#5b6685;margin-top:4px">${m.name}</div><div class="d" style="font-size:44px;margin-top:30px">${m.px ? fp(m.px) : '—'}</div></div>`).join('')}</div></div>`)];
  // 5 engine
  const E = [['01 / HAIRCUT', 'Capital is senior.', 'Profit is paid at a haircut H, so no one can withdraw more than the vault holds.', 'H = min(Residual, ΣPnL⁺) / ΣPnL⁺'], ['02 / A·K·F', 'No ADL lottery.', 'Marks, funding and deleveraging settle through lazy per-side indices. O(1) per account.', 'K += A·ΔP · F ±= A·funding'], ['03 / CRANKS', 'No single-tick blowups.', 'Each price update can only move the mark so far per slot.', '|ΔP|·1e4 ≤ max_move·Δt·P']];
  P['fluxdex-engine'] = [2400, 1350, page(2400, 1350, `<div style="position:absolute;left:120px;top:110px;right:120px"><div class="kick" style="font-size:24px">// the percolator engine</div><div class="d" style="font-size:92px;font-weight:800;margin-top:22px;line-height:1.05">Solvency isn't a promise.<br><span class="g">It's the math.</span></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:64px">${E.map(([n, t, d, c]) => `<div class="card" style="padding:44px;position:relative;overflow:hidden"><div style="position:absolute;left:0;right:0;top:0;height:6px;background:linear-gradient(100deg,#00f0ff,#7b5cff,#ff3df5)"></div><div class="m" style="font-size:22px;color:#5b6685">${n}</div><div class="d" style="font-size:44px;font-weight:600;margin-top:22px">${t}</div><div style="font-size:28px;color:#9aa6c4;margin-top:18px;line-height:1.45">${d}</div><div class="m" style="font-size:24px;color:#00f0ff;margin-top:26px;padding:16px 18px;border-radius:14px;background:rgba(0,240,255,.07);border:1px solid rgba(0,240,255,.18)">${c}</div></div>`).join('')}</div></div>`)];
  // 6 solvency
  P['fluxdex-solvency'] = [2400, 1350, page(2400, 1350, `<div style="position:absolute;left:120px;top:110px;width:1100px"><div class="kick" style="font-size:24px">// live balance sheet</div><div class="d" style="font-size:96px;font-weight:800;margin-top:22px;line-height:1.05">Every exit<br><span class="g">fully backed.</span></div><div style="font-size:36px;color:#9aa6c4;margin-top:40px;line-height:1.5">The vault, the insurance fund and every dollar of open profit are published live. Capital always comes back first. Profit is paid from what actually exists.</div></div>
<div style="position:absolute;right:160px;top:220px;width:820px;height:820px"><svg viewBox="0 0 120 120" style="width:100%;height:100%;transform:rotate(-90deg)"><defs><linearGradient id="ag"><stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#ff3df5"/></linearGradient></defs><circle cx="60" cy="60" r="50" stroke="rgba(140,170,255,.12)" stroke-width="9" fill="none"/><circle cx="60" cy="60" r="50" stroke="url(#ag)" stroke-width="9" fill="none" stroke-linecap="round"/></svg><div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center"><div><div class="d" style="font-size:150px;font-weight:800">H</div><div class="m" style="font-size:28px;color:#9aa6c4;letter-spacing:.2em">EXITS BACKED</div></div></div></div>`)];
  // 7 comparison vs perp DEX tokens (CoinGecko, 2026-10-08)
  const C = [['HYPE', 'Hyperliquid', '$19.3B', '$97.96', '−11%'], ['ASTER', 'Aster', '$1.94B', '$2.41', '−70%'], ['DYDX', 'dYdX', '$0.11B', '$4.52', '−97%'], ['GMX', 'GMX', '$0.09B', '$91.07', '−91%'], ['DRIFT', 'Drift', '$0.01B', '$2.60', '−99%']];
  P['fluxdex-vs'] = [2400, 1350, page(2400, 1350, `<div style="position:absolute;left:120px;top:100px;right:120px"><div class="kick" style="font-size:24px">// perp dex tokens, compared</div><div class="d" style="font-size:84px;font-weight:800;margin-top:20px;line-height:1.05">The perp DEX trade is <span class="g">a $21B market.</span></div>
<div style="margin-top:46px"><div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr 1.3fr;font-family:'JetBrains Mono';font-size:22px;color:#5b6685;letter-spacing:.16em;padding:0 0 18px">${['TOKEN', 'MARKET CAP', 'ATH', 'FROM ATH', 'PERCOLATOR ENGINE'].map((x) => `<div>${x}</div>`).join('')}</div>
${C.map(([s, n, mc, ath, dd]) => `<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr 1.3fr;align-items:center;border-top:1px solid rgba(140,170,255,.14);padding:22px 0;font-size:34px"><div><b class="d" style="font-size:34px">$${s}</b> <span style="color:#5b6685;font-size:24px">${n}</span></div><div>${mc}</div><div>${ath}</div><div style="color:#ff4d6d">${dd}</div><div style="color:#ff4d6d;font-weight:700">NO</div></div>`).join('')}
<div style="display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr 1.3fr;align-items:center;padding:24px 22px;margin-top:6px;font-size:34px;border-radius:20px;background:linear-gradient(100deg,rgba(0,240,255,.12),rgba(123,92,255,.14),rgba(255,61,245,.10));border:1px solid rgba(0,240,255,.3)"><div><b class="d g" style="font-size:36px">$FLUX</b> <span style="color:#9aa6c4;font-size:24px">FluxDEX</span></div><div class="g d">early</div><div class="g d">not set</div><div>—</div><div style="color:#2dffa8;font-weight:700">YES · haircut H</div></div></div>
<div style="font-size:20px;color:#5b6685;margin-top:22px">Market data: CoinGecko, 2026-10-08.</div></div>`)];
  return P;
}
(async () => {
  const only = process.argv[2]; const P = await build();
  for (const [name, [w, h, html]] of Object.entries(P)) {
    if (only && name !== only) continue;
    const f = path.join(S, name + '.html'); fs.writeFileSync(f, html);
    const c = await open('file:///' + f.split(path.sep).join('/'), w, h, 9810 + Math.floor(Math.random() * 300)); await sleep(2500); await c.ev('document.fonts.ready.then(()=>1)'); await sleep(400);
    await c.shot(path.join(OUT, name + '.png')); c.close(); console.log('rendered', name);
  }
})().catch((e) => { console.error(e); process.exit(1); });
