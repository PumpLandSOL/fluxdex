// one-shot: HoodLiquid market layer -> FluxDEX on Solana. Every market is a Solana mint priced by Jupiter (keyless),
// majors + blue-chip memecoins always listed, DexScreener discovery of liquid Solana memecoins, permissionless list-by-mint.
'use strict';
const fs = require('fs'); const path = require('path');
const F = path.join(__dirname, '..', 'server', 'index.js'); let s = fs.readFileSync(F, 'utf8');
if (s.includes('JUP_PRICE')) throw new Error('already patched');
const a = s.indexOf('// Real LIVE prices from Pyth'), b = s.indexOf('// ---------- state ----------');
if (a < 0 || b < 0) throw new Error('anchors');
const BLOCK = `// ---------- markets: every market is a Solana mint, priced live by Jupiter (aggregated on-chain liquidity) ----------
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3?ids=';
// [symbol, mint, max leverage, name, kind]
const CORE = [
  ['BTC', '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 50, 'Bitcoin', 'major'],
  ['ETH', '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 50, 'Ethereum', 'major'],
  ['SOL', 'So11111111111111111111111111111111111111112', 50, 'Solana', 'major'],
  ['JUP', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 20, 'Jupiter', 'major'],
  ['WIF', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 20, 'dogwifhat', 'meme'],
  ['BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 20, 'Bonk', 'meme'],
  ['POPCAT', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', 15, 'Popcat', 'meme'],
  ['FARTCOIN', '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', 15, 'Fartcoin', 'meme'],
  ['PENGU', '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', 15, 'Pudgy Penguins', 'meme'],
  ['TRUMP', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', 20, 'Official Trump', 'meme'],
  ['MEW', 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', 15, 'cat in a dogs world', 'meme'],
  ['GOAT', 'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump', 10, 'Goatseus Maximus', 'meme'],
  ['MOODENG', 'ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY', 10, 'Moo Deng', 'meme'],
];
const FEED = {}; for (const c of CORE) FEED[c[0]] = c[1];   // core symbols can't be re-listed
function side() { return { A: 1, K: 0, F: 0, OI: 0, epoch: 0, mode: 'Normal', K0: 0, F0: 0 }; }
// leverage scales to REAL liquidity: deeper pool, more leverage. Honest risk gating.
function levForLiq(liq) { return liq >= 5e6 ? 20 : liq >= 1e6 ? 15 : liq >= 5e5 ? 10 : liq >= 1.5e5 ? 5 : 3; }
function dpForPx(p) { return p >= 100 ? 2 : p >= 1 ? 3 : p >= 0.01 ? 4 : p >= 1e-4 ? 6 : 8; }
function mkMarket(sym, px, dp, o) {
  o = o || {};
  return {
    sym, mint: o.mint, src: 'jup', kind: o.kind || 'meme',
    px, P_last: px, base: px, dp,
    maxLev: o.maxLev != null ? o.maxLev : 10,
    fundingRate: (Math.random() - .5) * 4e-5,
    seenLive: false, live: false, lastTs: 0, dayRef: { price: px, ts: Date.now() },
    hist: [], long: side(), short: side(),
    dyn: !!o.dyn, eco: o.eco || { name: o.name || sym },
  };
}
const MKT = CORE.map(([sym, mint, lev, name, kind]) => mkMarket(sym, 1, 4, { mint, maxLev: lev, kind, name, eco: { name } }));
const M = (s) => MKT.find((m) => m.sym === s);
function addDyn(sym, px, dp, o) {
  sym = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!sym || !(px > 0) || !o.mint) return null;
  let m = M(sym);
  if (m) { if (!FEED[sym]) { m.mint = o.mint; if (o.maxLev != null) m.maxLev = o.maxLev; if (o.eco) m.eco = o.eco; m.dyn = true; } return m; }
  m = mkMarket(sym, px, dp, Object.assign({ dyn: true, kind: 'meme' }, o));
  MKT.push(m); return m;
}
let PRICE_OK = false, LAST_OK = 0;
function seedOrMark(m, px) {
  if (!(px > 0)) return;
  if (!m.seenLive || m.bootCatch) {
    if (!m.seenLive) { m.base = px; m.dayRef = { price: px, ts: Date.now() }; m.dp = dpForPx(px); }
    m.px = m.P_last = px; m.seenLive = true; m.bootCatch = false;
  } else applyMark(m, px);
  m.live = true; m.lastTs = Date.now();
  if (Date.now() - m.dayRef.ts > 864e5) m.dayRef = { price: px, ts: Date.now() };
}
// one batched Jupiter call (≤50 mints per request) prices every market
async function fetchPrices() {
  const list = MKT.filter((m) => m.mint); let ok = false;
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    try {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(JUP_PRICE + chunk.map((m) => m.mint).join(','), { headers: { accept: 'application/json' }, signal: ac.signal }); clearTimeout(tm);
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      for (const m of chunk) { const p = j[m.mint]; if (!p) continue; seedOrMark(m, +p.usdPrice); m.eco = Object.assign(m.eco || {}, { liq: p.liquidity || 0, chg24: p.priceChange24h || 0 }); }
      ok = true;
    } catch (e) {}
  }
  PRICE_OK = ok; if (ok) LAST_OK = Date.now();
}
async function fetchDexPrices() {}   // kept for the call sites; Jupiter prices everything now

// ---------- Solana memecoin DISCOVERY ----------
// Live Solana pairs from DexScreener, filtered for real liquidity and volume, deduped by ticker (deepest pool wins),
// auto-listed as perp markets priced by Jupiter.
const DISC_MIN_LIQ = +(process.env.DISC_MIN_LIQ || 150000);
const DISC_MIN_VOL = +(process.env.DISC_MIN_VOL || 100000);
const DISC_MAX = +(process.env.DISC_MAX || 10);
const DISC_TERMS = ['pump', 'cat', 'dog', 'ai', 'pepe'];
let LISTED_COUNT = 0, DISC_LAST = 0;
const QUOTES = new Set(['SOL', 'USDC', 'USDT', 'WSOL']);
async function dsSearch(term) {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(term), { headers: { accept: 'application/json' } });
    if (!r.ok) return [];
    return ((await r.json()).pairs || []).filter((p) => p.chainId === 'solana' && p.quoteToken && QUOTES.has(String(p.quoteToken.symbol).toUpperCase()));
  } catch (e) { return []; }
}
function bestByTicker(pairs) {
  const by = {};
  for (const p of pairs) {
    const sym = String(p.baseToken && p.baseToken.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const liq = p.liquidity && p.liquidity.usd || 0, vol = p.volume && p.volume.h24 || 0, px = +p.priceUsd;
    if (!sym || FEED[sym] || QUOTES.has(sym) || !(px > 0) || liq < DISC_MIN_LIQ || vol < DISC_MIN_VOL) continue;
    if (!by[sym] || liq > by[sym].liq) by[sym] = { sym, px, liq, vol, chg: p.priceChange && p.priceChange.h24 || 0, mint: p.baseToken.address, name: p.baseToken.name || sym };
  }
  return by;
}
function persistDyn() { db.dyn = MKT.filter((m) => m.dyn).map((m) => ({ sym: m.sym, mint: m.mint, dp: m.dp, maxLev: m.maxLev, base: m.base, eco: m.eco })); }
async function discover() {
  const all = [].concat(...(await Promise.all(DISC_TERMS.map(dsSearch))));
  if (!all.length) return;
  const ranked = Object.values(bestByTicker(all)).sort((x, y) => y.vol - x.vol).slice(0, DISC_MAX);
  for (const c of ranked) addDyn(c.sym, c.px, dpForPx(c.px), { mint: c.mint, maxLev: levForLiq(c.liq), eco: { liq: c.liq, vol24: c.vol, chg24: c.chg, name: c.name } });
  LISTED_COUNT = MKT.filter((m) => m.dyn).length; DISC_LAST = Date.now(); persistDyn();
}
// permissionless listing: paste ANY Solana mint with real liquidity, get a live perp market.
async function listToken(addr) {
  addr = String(addr || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return { error: 'paste a valid Solana token mint' };
  if (MKT.some((m) => m.mint === addr)) { const m = MKT.find((x) => x.mint === addr); return { ok: true, sym: m.sym, existed: true, maxLev: m.maxLev, px: m.px }; }
  let pairs;
  try { const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + addr, { headers: { accept: 'application/json' } }); pairs = ((await r.json()).pairs || []).filter((p) => p.chainId === 'solana' && +p.priceUsd > 0); }
  catch (e) { return { error: 'could not reach the price oracle, try again' }; }
  if (!pairs.length) return { error: 'no Solana market found for that mint' };
  pairs.sort((x, y) => (y.liquidity && y.liquidity.usd || 0) - (x.liquidity && x.liquidity.usd || 0));
  const p = pairs[0], liq = p.liquidity && p.liquidity.usd || 0, vol = p.volume && p.volume.h24 || 0, px = +p.priceUsd;
  const LIST_MIN = +(process.env.LIST_MIN_LIQ || 50000);
  if (liq < LIST_MIN) return { error: 'liquidity too thin to list safely ($' + Math.round(liq).toLocaleString() + ' < $' + LIST_MIN.toLocaleString() + ')' };
  const sym = String(p.baseToken.symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (FEED[sym]) return { error: sym + ' is already a core market' };
  const existed = !!M(sym);
  const m = addDyn(sym, px, dpForPx(px), { mint: addr, maxLev: levForLiq(liq), eco: { liq, vol24: vol, chg24: p.priceChange && p.priceChange.h24 || 0, name: p.baseToken.name || sym } });
  if (!m) return { error: 'could not list that token' };
  seedOrMark(m, px); LISTED_COUNT = MKT.filter((x) => x.dyn).length; persistDyn(); save();
  return { ok: true, sym: m.sym, existed, maxLev: m.maxLev, px: m.px, liq, vol24: vol };
}

`;
s = s.slice(0, a) + BLOCK + s.slice(b);
s = s.replace("if (Array.isArray(db.dyn)) for (const d of db.dyn) addDyn(d.sym, d.base || 0.0001, d.dp || dpForPx(d.base || 0.0001), { ds: d.ds, maxLev: d.maxLev, eco: d.eco });",
  "if (Array.isArray(db.dyn)) for (const d of db.dyn) if (d.mint) addDyn(d.sym, d.base || 0.0001, d.dp || dpForPx(d.base || 0.0001), { mint: d.mint, maxLev: d.maxLev, eco: d.eco });");
s = s.replace("const isWallet = (s) => /^0x[a-fA-F0-9]{40}$/.test(s);", "const isWallet = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);");
fs.writeFileSync(F, s); console.log('solana market layer in');
