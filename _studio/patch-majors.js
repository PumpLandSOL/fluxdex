// one-shot: majors-first market list (BTC ETH SOL HYPE ZEC NEAR JUP PUMP), CoinGecko pricing + Jupiter fallback, no meme auto-discovery.
'use strict';
const fs = require('fs'), path = require('path'); const F = path.join(__dirname, '..', 'server', 'index.js'); let s = fs.readFileSync(F, 'utf8');
const a = s.indexOf('const CORE = ['), b = s.indexOf('];', a) + 2; if (a < 0) throw new Error('core');
s = s.slice(0, a) + `const CORE = [   // [symbol, solana mint (for Jupiter fallback / listing), max lev, name, kind, coingecko id]
  ['BTC', '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 50, 'Bitcoin', 'major', 'bitcoin'],
  ['ETH', '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 50, 'Ethereum', 'major', 'ethereum'],
  ['SOL', 'So11111111111111111111111111111111111111112', 50, 'Solana', 'major', 'solana'],
  ['HYPE', '', 25, 'Hyperliquid', 'major', 'hyperliquid'],
  ['ZEC', '', 20, 'Zcash', 'major', 'zcash'],
  ['NEAR', '', 20, 'NEAR Protocol', 'major', 'near'],
  ['JUP', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 20, 'Jupiter', 'major', 'jupiter-exchange-solana'],
  ['PUMP', 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', 15, 'Pump.fun', 'major', 'pump-fun'],
];` + s.slice(b);
s = s.replace("const FEED = {}; for (const c of CORE) FEED[c[0]] = c[1];", "const FEED = {}; for (const c of CORE) FEED[c[0]] = c[1] || c[5];");
s = s.replace("const MKT = CORE.map(([sym, mint, lev, name, kind]) => mkMarket(sym, 1, 4, { mint, maxLev: lev, kind, name, eco: { name } }));",
  "const MKT = CORE.map(([sym, mint, lev, name, kind, cg]) => Object.assign(mkMarket(sym, 1, 4, { mint, maxLev: lev, kind, name, eco: { name } }), { cg }));");
const f0 = s.indexOf('async function fetchPrices() {'), f1 = s.indexOf('async function fetchDexPrices()');
s = s.slice(0, f0) + `async function fetchPrices() {
  let ok = false; const cgs = MKT.filter((m) => m.cg);
  try {   // majors: CoinGecko (cross-chain, keyless)
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 8000);
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=' + cgs.map((m) => m.cg).join(','), { headers: { accept: 'application/json' }, signal: ac.signal }); clearTimeout(tm);
    if (!r.ok) throw new Error('http ' + r.status); const j = await r.json();
    for (const m of cgs) { const p = j[m.cg]; if (!p || !(p.usd > 0)) continue; seedOrMark(m, +p.usd); m.eco = Object.assign(m.eco || {}, { chg24: p.usd_24h_change || 0 }); m.cgAt = Date.now(); }
    ok = true;
  } catch (e) {}
  // Jupiter: listed Solana mints, and fallback for any Solana major CoinGecko missed
  const jl = MKT.filter((m) => m.mint && (!m.cg || !m.cgAt || Date.now() - m.cgAt > 30000));
  for (let i = 0; i < jl.length; i += 50) {
    const chunk = jl.slice(i, i + 50);
    try { const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 8000); const r = await fetch(JUP_PRICE + chunk.map((m) => m.mint).join(','), { signal: ac.signal }); clearTimeout(tm); if (!r.ok) continue; const j = await r.json();
      for (const m of chunk) { const p = j[m.mint]; if (!p) continue; seedOrMark(m, +p.usdPrice); m.eco = Object.assign(m.eco || {}, { liq: p.liquidity || 0, chg24: p.priceChange24h || 0 }); } ok = true; } catch (e) {}
  }
  PRICE_OK = ok; if (ok) LAST_OK = Date.now();
}
` + s.slice(f1);
s = s.replace("const DISC_MAX = +(process.env.DISC_MAX || 10);", "const DISC_MAX = +(process.env.DISC_MAX || 0);   // majors-first: no meme auto-discovery (set DISC_MAX to turn it on)");
s = s.replace("async function discover() {\n", "async function discover() {\n  if (!DISC_MAX) return;\n");
s = s.replace("setInterval(fetchPrices, 2500)", "setInterval(fetchPrices, 10000)");
s = s.replace("priceSource: 'Jupiter'", "priceSource: 'CoinGecko + Jupiter'").replace("priceSource: 'Jupiter'", "priceSource: 'CoinGecko + Jupiter'");
s = s.replace("const coins = MKT.filter((m) => m.kind === 'meme')", "const coins = MKT.filter((m) => m.dyn)");
fs.writeFileSync(F, s); console.log('majors in');
