// FluxDEX kit round 2: thesis, one-trade breakdown, ADL vs percolator. Reuses kit.js styling. usage: node _studio/kit2.js
'use strict';
const fs = require('fs'), path = require('path'); const { open, sleep } = require('./cdp.cjs');
const S = path.join(__dirname, 'src'), OUT = path.join(__dirname, '..', 'brand');
// borrow the page shell from a round-1 scene so the look is identical
const ref = fs.readFileSync(path.join(S, 'fluxdex-engine.html'), 'utf8');
const shellStart = ref.slice(0, ref.indexOf('<div style="position:absolute;left:120px;top:110px;right:120px">'));
const shellEnd = ref.slice(ref.lastIndexOf('<div class="foot">'));
const page = (body) => shellStart + body + shellEnd;
const box = (k, v, d, red) => `<div class="card" style="padding:36px${red ? ';border-color:rgba(255,77,109,.5)' : ''}"><div class="m" style="font-size:22px;color:#5b6685">${k}</div><div class="d" style="font-size:50px;font-weight:600;margin-top:18px${red ? ';color:#ff4d6d' : ''}">${v}</div><div style="font-size:24px;color:#9aa6c4;margin-top:8px">${d}</div></div>`;
const P = {
  'fluxdex-thesis': page(`<div style="position:absolute;left:120px;top:110px;right:120px"><div class="kick" style="font-size:24px">// the thesis</div><div class="d" style="font-size:96px;font-weight:800;margin-top:22px;line-height:1.05">The last perp DEX<br>that won hit <span class="g">$21.6B.</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:70px"><div class="card" style="padding:46px"><div class="m" style="font-size:24px;color:#5b6685">$HYPE · HYPERLIQUID</div><div class="d" style="font-size:96px;font-weight:800;margin-top:18px">$21.6B</div><div style="font-size:30px;color:#9aa6c4;margin-top:10px">peak market cap · Sep 23, 2026</div></div>
<div class="card" style="padding:46px;border-color:rgba(0,240,255,.4)"><div class="m" style="font-size:24px;color:#00f0ff">$FLUX · FLUXDEX</div><div class="d g" style="font-size:96px;font-weight:800;margin-top:18px">day one</div><div style="font-size:30px;color:#9aa6c4;margin-top:10px">perps on the percolator engine · Solana</div></div></div>
<div style="font-size:20px;color:#5b6685;margin-top:24px">HYPE peak market cap: CoinGecko daily data.</div></div>`),
  'fluxdex-trade': page(`<div style="position:absolute;left:120px;top:110px;right:120px"><div class="kick" style="font-size:24px">// one trade, start to finish</div><div class="d" style="font-size:92px;font-weight:800;margin-top:22px">Know your numbers <span class="g">before you click.</span></div>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:22px;margin-top:66px">${box('MARKET', 'HYPE-PERP', 'long')}${box('SIZE', '$5,000', '10x leverage')}${box('MARGIN', '$500', 'your collateral')}${box('FEE', '$3.00', '0.06% taker')}${box('LIQ PRICE', '$77.24', 'entry $85.39', true)}</div>
<div style="font-size:34px;color:#9aa6c4;margin-top:56px;max-width:1700px;line-height:1.5">Entry, margin, fee and liquidation price are all on the ticket before you sign. Close any time: <b style="color:#f2f6ff">your collateral comes back first</b>, profit is paid at H.</div></div>`),
  'fluxdex-adl': page(`<div style="position:absolute;left:120px;top:110px;right:120px"><div class="kick" style="font-size:24px">// when a market breaks</div><div class="d" style="font-size:92px;font-weight:800;margin-top:22px">Losses get shared, <span class="g">not dumped on you.</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:66px"><div class="card" style="padding:46px"><div class="m" style="font-size:24px;color:#ff4d6d">AUTO-DELEVERAGING (ADL)</div><div class="d" style="font-size:46px;font-weight:600;margin-top:20px;line-height:1.2">A queue picks winners to close.</div><div style="font-size:30px;color:#9aa6c4;margin-top:20px;line-height:1.5">When the insurance fund can't cover a bad liquidation, profitable traders at the top of the queue get force-closed. Who gets hit depends on where you sit.</div></div>
<div class="card" style="padding:46px;border-color:rgba(0,240,255,.4)"><div class="m" style="font-size:24px;color:#00f0ff">PERCOLATOR · FLUXDEX</div><div class="d" style="font-size:46px;font-weight:600;margin-top:20px;line-height:1.2">Everyone on the side shares it.</div><div style="font-size:30px;color:#9aa6c4;margin-top:20px;line-height:1.5">A deficit shifts the side's K index, so every account on that side absorbs its pro-rata share. No queue, no lottery, and capital stays senior to profit.</div></div></div></div>`),
};
(async () => {
  for (const [name, html] of Object.entries(P)) {
    const f = path.join(S, name + '.html'); fs.writeFileSync(f, html);
    const c = await open('file:///' + f.split(path.sep).join('/'), 2400, 1350, 9900 + Math.floor(Math.random() * 300)); await sleep(2500); await c.ev('document.fonts.ready.then(()=>1)'); await sleep(400);
    await c.shot(path.join(OUT, name + '.png')); c.close(); console.log('rendered', name);
  }
})().catch((e) => { console.error(e); process.exit(1); });
