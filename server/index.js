// FLUXDEX — perpetual futures on Solana memecoins and majors, run on a port of the PERCOLATOR risk engine
// (toly / aeyakovenko percolator lineage). Structural solvency from three invariants:
//   1. H  — haircut ratio: capital is senior, profit is junior. Residual = V - (C_tot + I); profits pay out at H.
//   2. A/K/F — lazy per-side indices: queue-free ADL / funding / mark socialization, O(1) per account.
//   3. Bounded cranks: |ΔP|*1e4 <= max_move_bps*dt*P_last, so no single tick can blow up open interest.
//   + side recovery: Normal → DrainOnly (A<MIN_A) → ResetPending (OI=0, epoch++) → Normal.
// Every market is a Solana mint priced live by Jupiter. Dependency-free Node.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

const PORT = process.env.PORT || 8254;
const ROOT = path.join(__dirname, '..');
const DATA_PATH = process.env.DATA_PATH || path.join(ROOT, 'data.json');
const TOKEN = 'FLUX';
const FLUX_MINT = process.env.FLUX_MINT || ''; // $FLUX on Solana (CA bar shows once set)
const SEED_USDC = +(process.env.SEED_USDC || 10000);

// On-chain (Phase 1.5): set these once the Anchor program is deployed to enable
// on-chain mode that routes trades through the program via wallet. Until then
// CHAIN is null and the site stays in off-chain demo mode.
const CHAIN = process.env.FLUX_PROGRAM_ID ? {
  programId: process.env.FLUX_PROGRAM_ID,
  usdcMint: process.env.USDC_MINT || '',
  cluster: process.env.CHAIN_CLUSTER || 'mainnet-beta',
  rpc: process.env.SOLANA_RPC || '',
  fluxMint: FLUX_MINT,
} : null;

// ---- engine config (analogues of the spec's cfg_* knobs) ----
const FEE = 0.0006;                 // taker fee
const MAINT_BPS = 50;               // cfg_maintenance_bps  (0.5% maintenance margin)
const LIQ_FEE_BPS = 50;             // cfg_liquidation_fee_bps
const MAX_MOVE_BPS = 800;           // cfg_max_price_move_bps_per_slot (bounded crank / bad-tick clamp)
const MIN_A = 0.25;                 // MIN_A_SIDE → DrainOnly
const MIN_MM = 1;                   // cfg_min_nonzero_mm_req
const WARMUP = 25;                  // admission/warmup slots for fresh profit (reserves R_i)
const SEC = 1;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const id6 = () => { let s = ''; for (const x of randomBytes(6)) s += B58[x % 58]; return s; };
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

// ---------- markets (each holds two side-states) ----------
// ---------- markets: every market is a Solana mint, priced live by Jupiter (aggregated on-chain liquidity) ----------
const JUP_PRICE = 'https://lite-api.jup.ag/price/v3?ids=';
// [symbol, mint, max leverage, name, kind]
const CORE = [   // [symbol, solana mint (for Jupiter fallback / listing), max lev, name, kind, coingecko id]
  ['BTC', '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh', 50, 'Bitcoin', 'major', 'bitcoin'],
  ['ETH', '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', 50, 'Ethereum', 'major', 'ethereum'],
  ['SOL', 'So11111111111111111111111111111111111111112', 50, 'Solana', 'major', 'solana'],
  ['HYPE', '', 25, 'Hyperliquid', 'major', 'hyperliquid'],
  ['ZEC', '', 20, 'Zcash', 'major', 'zcash'],
  ['NEAR', '', 20, 'NEAR Protocol', 'major', 'near'],
  ['JUP', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 20, 'Jupiter', 'major', 'jupiter-exchange-solana'],
  ['PUMP', 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', 15, 'Pump.fun', 'major', 'pump-fun'],
];
const FEED = {}; for (const c of CORE) FEED[c[0]] = c[1] || c[5];   // core symbols can't be re-listed
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
const MKT = CORE.map(([sym, mint, lev, name, kind, cg]) => Object.assign(mkMarket(sym, 1, 4, { mint, maxLev: lev, kind, name, eco: { name } }), { cg }));
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
async function fetchDexPrices() {}   // kept for the call sites; Jupiter prices everything now

// ---------- Solana memecoin DISCOVERY ----------
// Live Solana pairs from DexScreener, filtered for real liquidity and volume, deduped by ticker (deepest pool wins),
// auto-listed as perp markets priced by Jupiter.
const DISC_MIN_LIQ = +(process.env.DISC_MIN_LIQ || 150000);
const DISC_MIN_VOL = +(process.env.DISC_MIN_VOL || 100000);
const DISC_MAX = +(process.env.DISC_MAX || 0);   // majors-first: no meme auto-discovery (set DISC_MAX to turn it on)
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
  if (!DISC_MAX) return;
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

// ---------- state ----------
// positions are isolated sub-accounts; V (vault) + I (insurance) + the haircut are GLOBAL.
let db = { wallets: {}, pos: [], V: 35000, I: 8000, mkt: null };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))); } catch (e) {}
if (!db.wallets) db.wallets = {}; if (!db.pos) db.pos = [];
if (db.V == null) db.V = 35000; if (db.I == null) db.I = 8000;
// recreate previously-discovered dynamic markets BEFORE reapplying side-states,
// so positions on auto-listed coins survive a restart even before the
// next discovery pass completes.
if (Array.isArray(db.dyn)) for (const d of db.dyn) if (d.mint) addDyn(d.sym, d.base || 0.0001, d.dp || dpForPx(d.base || 0.0001), { mint: d.mint, maxLev: d.maxLev, eco: d.eco });
// restore per-market side indices + price refs so persisted positions stay consistent across restarts
if (db.mkt) for (const s of db.mkt) { const m = M(s.sym); if (!m) continue; m.long = s.long; m.short = s.short; m.P_last = s.P_last; m.base = s.base; m.dayRef = s.dayRef; m.seenLive = true; m.bootCatch = true; }
function snapMkt() { return MKT.map((m) => ({ sym: m.sym, long: m.long, short: m.short, P_last: m.P_last, base: m.base, dayRef: m.dayRef })); }
let saveT = null; const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; db.mkt = snapMkt(); try { fs.writeFileSync(DATA_PATH, JSON.stringify(db)); } catch (e) {} }, 1000); };
const isWallet = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
function b58dec(str) { let n = 0n; for (const ch of str) { const i = B58.indexOf(ch); if (i < 0) throw new Error('b58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const ch of str) { if (ch === '1') out.unshift(0); else break; } return Buffer.from(out); }
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex'); const SESSIONS = new Map();
const sessionMsg = (w, exp) => ['FLUXDEX trading session', 'Wallet: ' + w, 'Expires: ' + exp, 'Signing is free and moves no funds.'].join('\n');
function requireSess(w, auth) {
  if (!auth || !auth.sig || !auth.exp) throw 'sign in with your wallet first';
  const exp = +auth.exp; if (!(exp > Date.now())) throw 'session expired, sign in again'; if (exp > Date.now() + 8 * 864e5) throw 'bad session';
  const key = w + ':' + exp + ':' + auth.sig; if (SESSIONS.get(key)) return true;
  let ok = false; try { const pk = b58dec(w), sig = b58dec(auth.sig); if (pk.length !== 32 || sig.length !== 64) throw 0;
    ok = require('crypto').verify(null, Buffer.from(sessionMsg(w, exp), 'utf8'), require('crypto').createPublicKey({ key: Buffer.concat([SPKI_ED25519, pk]), format: 'der', type: 'spki' }), sig); } catch (e) { throw 'bad signature'; }
  if (!ok) throw 'signature is not from this wallet';
  if (SESSIONS.size > 5000) SESSIONS.clear(); SESSIONS.set(key, 1); return true;
}
function W(a) { return db.wallets[a] || (db.wallets[a] = { usdc: SEED_USDC, realized: 0 }); }
const num = (v, hi) => { let n = +v; if (!isFinite(n) || n <= 0) return 0; return hi != null ? Math.min(n, hi) : n; };

// ---------- engine primitives ----------
const effPos = (p, m) => { const S = m[p.side]; if (S.epoch !== p.epoch) return 0; return p.basis * S.A / p.a_basis; };

// (1) bounded crank: apply a REAL oracle price → mark-to-market + funding via the lazy indices
function applyMark(m, target) {
  if (!(target > 0)) return;
  const cap = (MAX_MOVE_BPS / 1e4) * m.P_last;           // sanity clamp: reject absurd single-tick jumps
  const dP = clamp(-cap, cap, target - m.P_last);
  const px = m.P_last + dP;
  // mark: K_side += A_side * ΔP  (only sides that have OI)
  if (m.long.OI > 0) m.long.K += m.long.A * dP;
  if (m.short.OI > 0) m.short.K -= m.short.A * dP;
  // funding: model-based (paper market — no real perp funding feed), only when BOTH sides hold OI
  if (m.long.OI > 0 && m.short.OI > 0) {
    m.fundingRate = clamp(-8e-4, 8e-4, m.fundingRate + (Math.random() - .5) * 3e-5);
    const f = m.P_last * m.fundingRate;
    m.long.F -= m.long.A * f;
    m.short.F += m.short.A * f;
  }
  m.px = px; m.P_last = px;
  m.hist.push(+px); if (m.hist.length > 180) m.hist.shift();
}

// (2) O(1) per-account settlement from K/F snapshot deltas → realized PnL; warmup reserves
function settle(p, m) {
  const S = m[p.side];
  if (S.epoch !== p.epoch) { p.basis = 0; return; }       // stale (post side-reset) → zeroed
  const dPnl = (p.basis / p.a_basis) * ((S.K - p.k_snap) + (S.F - p.f_snap));
  p.PNL += dPnl; p.k_snap = S.K; p.f_snap = S.F;
  if (dPnl > 0) p.R += dPnl;                               // fresh profit enters reserve (pending)
  if (p.R > 0) p.R = Math.max(0, p.R - p.R / WARMUP);      // matures over WARMUP slots
}

function riskNotional(p, m) { return Math.abs(effPos(p, m)) * m.px; }
function mmReq(p, m) { return Math.max(riskNotional(p, m) * MAINT_BPS / 1e4, MIN_MM); }

// (3) liquidation + ADL: shrink A on the liquidated side, socialize deficit into opposing K
function liquidate(p, m, idx) {
  const S = m[p.side], opp = m[p.side === 'long' ? 'short' : 'long'];
  const eff = Math.abs(effPos(p, m));
  const fee = riskNotional(p, m) * LIQ_FEE_BPS / 1e4;
  const equity = p.C + p.PNL;
  const payout = Math.max(0, equity - fee);
  const w = W(p.wallet); w.usdc += payout; w.realized += payout - p.C; db.V -= payout;
  const OIb = S.OI; S.OI = Math.max(0, S.OI - eff);
  let D = Math.max(0, -equity);                            // uninsured deficit
  if (D > 0) { const pay = Math.min(D, db.I); db.I -= pay; D -= pay; }
  if (D > 0 && opp.OI > 1e-9) opp.K += (-D / opp.OI);      // socialize into opposing side's K
  if (OIb > 1e-9) { S.A = S.A * (S.OI / OIb); if (S.A < MIN_A) S.mode = 'DrainOnly'; }
  db.pos.splice(idx, 1);
}

// (+) side-recovery state machine
function recover(m) {
  for (const key of ['long', 'short']) {
    const S = m[key];
    if (S.OI <= 1e-9 && (S.mode === 'DrainOnly' || S.A < 1)) {
      S.K0 = S.K; S.F0 = S.F; S.epoch += 1; S.A = 1; S.OI = 0; S.mode = 'Normal';
    }
  }
}

function tick() {
  for (const p of db.pos) settle(p, M(p.sym));
  for (let i = db.pos.length - 1; i >= 0; i--) {
    const p = db.pos[i], m = M(p.sym);
    if (effPos(p, m) === 0 && p.basis !== 0) { /* dust */ }
    if (Math.max(0, p.C + p.PNL) <= mmReq(p, m) && Math.abs(effPos(p, m)) > 1e-12) liquidate(p, m, i);
  }
  for (const m of MKT) recover(m);
  bots();
  save();
}

// ---------- haircut (global) ----------
function solvency() {
  let C_tot = 0, pnlPos = 0, pendR = 0;
  for (const p of db.pos) { C_tot += p.C; if (p.PNL > 0) pnlPos += p.PNL; pendR += Math.max(0, p.R); }
  const residual = db.V - (C_tot + db.I);
  const H = pnlPos > 1e-9 ? clamp(0, 1, residual / pnlPos) : 1;
  return { V: db.V, I: db.I, C_tot, pnlPos, residual, H, pendR };
}
const withdrawable = (p, H) => p.C + Math.min(0, p.PNL) + Math.max(0, p.PNL) * H;

// ---------- bots (keep both sides alive so funding + ADL have life) ----------
const BOTW = ['Bot1xPercoLPdemoaaaaaaaaaaaaaaaaaaaaa1', 'Bot2xPercoLPdemoaaaaaaaaaaaaaaaaaaaaa2', 'Bot3xPercoLPdemoaaaaaaaaaaaaaaaaaaaaa3', 'Bot4xPercoLPdemoaaaaaaaaaaaaaaaaaaaaa4'];
function bots() {
  if (Math.random() < 0.25 && db.pos.filter((p) => p.wallet.startsWith('Bot')).length < 10) {
    const m = MKT[Math.floor(Math.random() * MKT.length)];
    const sd = Math.random() < 0.5 ? 'long' : 'short';
    if (m[sd].mode !== 'Normal') return;
    openPos(BOTW[Math.floor(Math.random() * BOTW.length)], m.sym, sd, 400 + Math.random() * 2600, 3 + Math.floor(Math.random() * 12), true);
  }
  if (Math.random() < 0.12) { const bp = db.pos.filter((p) => p.wallet.startsWith('Bot')); if (bp.length) closePos(bp[Math.floor(Math.random() * bp.length)].id); }
}

// ---------- open / close ----------
function openPos(wallet, sym, sd, sizeUsd, lev, isBot) {
  const m = M(sym); if (!m) return { error: 'bad market' };
  if (!m.seenLive || !(m.px > 0)) return { error: 'waiting for the first live price on ' + sym };   // never open against a placeholder price
  const S = m[sd]; if (S.mode !== 'Normal') return { error: sd + ' side in recovery — closes only' };
  const w = W(wallet); const size = num(sizeUsd); if (!size) return { error: 'enter a size' };
  lev = clamp(1, m.maxLev, +lev || 1);
  const margin = size / lev, fee = size * FEE;
  if (!isBot && w.usdc < margin + fee) return { error: 'not enough USDC for margin + fee' };
  w.usdc -= margin + fee; db.V += margin; db.I += fee;     // margin → vault, fee → insurance
  const basis = size / m.px;
  S.OI += basis;
  db.pos.push({ id: id6(), wallet, sym, side: sd, basis, a_basis: S.A, k_snap: S.K, f_snap: S.F, epoch: S.epoch, C: margin, PNL: 0, R: 0, entry: m.px, ts: Date.now() });
  return { ok: true };
}
function closePos(id) {
  const i = db.pos.findIndex((p) => p.id === id); if (i < 0) return { error: 'no position' };
  const p = db.pos[i], m = M(p.sym); settle(p, m);
  const H = solvency().H, eff = Math.abs(effPos(p, m));
  const fee = Math.abs(effPos(p, m)) * m.px * FEE;
  const pay = Math.max(0, withdrawable(p, H) - fee);
  const w = W(p.wallet); w.usdc += pay; w.realized += pay - p.C; db.V -= pay; db.I += fee;
  m[p.side].OI = Math.max(0, m[p.side].OI - eff);
  db.pos.splice(i, 1);
  return { ok: true, closedPnl: pay - p.C, haircut: H };
}

// ---------- views ----------
function sideView(S) { return { A: S.A, K: S.K, F: S.F, OI: S.OI, epoch: S.epoch, mode: S.mode }; }
const chg = (m) => (m.eco && typeof m.eco.chg24 === 'number' && m.eco.chg24 !== 0) ? m.eco.chg24 : (m.px / m.dayRef.price - 1) * 100;   // real 24h change from the price source
function markets() { return MKT.map((m) => ({ sym: m.sym, src: m.src, kind: m.kind, mint: m.mint, name: m.eco && m.eco.name, px: m.px, dp: m.dp, change: chg(m), funding: m.fundingRate * 100, maxLev: m.maxLev, live: m.live, longMode: m.long.mode, shortMode: m.short.mode })); }
function marketDetail(sym) { const m = M(sym); if (!m) return null; return { sym: m.sym, src: m.src, px: m.px, dp: m.dp, change: chg(m), funding: m.fundingRate * 100, maxLev: m.maxLev, live: m.live, hist: m.hist.slice(-120), long: sideView(m.long), short: sideView(m.short) }; }
// live memecoin board: every auto-listed / permissionlessly-listed coin
function ecosystem() {
  const coins = MKT.filter((m) => m.dyn).map((m) => ({
    sym: m.sym, name: m.eco && m.eco.name || m.sym, px: m.px, dp: m.dp, change: chg(m),
    maxLev: m.maxLev, live: m.live, oi: (m.long.OI + m.short.OI) * m.px,
    liq: m.eco && m.eco.liq || 0, vol24: m.eco && m.eco.vol24 || 0, chg24: m.eco && m.eco.chg24 || 0,
    mint: m.mint || '',
  })).sort((a, b) => b.vol24 - a.vol24);
  return { chain: 'solana', listed: coins.length, lastDiscovery: DISC_LAST, coins };
}
function account(addr) {
  const w = W(addr), s = solvency();
  const positions = db.pos.filter((p) => p.wallet === addr).map((p) => {
    const m = M(p.sym), eff = effPos(p, m);
    return { id: p.id, sym: p.sym, side: p.side, basis: p.basis, eff, size: Math.abs(eff) * m.px, lev: +(Math.abs(p.basis * p.entry) / p.C).toFixed(1), collateral: p.C, entry: p.entry, mark: m.px, liq: liqEstimate(p, m), pnl: p.PNL, withdraw: withdrawable(p, s.H), reserved: Math.max(0, p.R), roe: p.PNL / p.C * 100, adl: 1 - m[p.side].A };
  });
  return { wallet: addr, usdc: w.usdc, realized: w.realized, positions, H: s.H };
}
function liqEstimate(p, m) {
  // solve  C + PnL + basis*(liq - mark) = basis*liq*mm  for liq  (mm = maintenance rate)
  const mm = MAINT_BPS / 1e4, b = Math.abs(p.basis), mark = m.px;
  if (b < 1e-12) return 0;
  if (p.side === 'long') return Math.max(0, (b * mark - p.C - p.PNL) / (b * (1 - mm)));
  return (p.C + p.PNL + b * mark) / (b * (1 + mm));
}
function metrics() {
  const s = solvency();
  let oi = 0; for (const m of MKT) oi += (m.long.OI + m.short.OI) * m.px;
  const lb = Object.entries(db.wallets).filter(([a]) => !a.startsWith('Bot')).map(([a, w]) => ({ wallet: a.slice(0, 4) + '…' + a.slice(-4), realized: w.realized, open: db.pos.filter((p) => p.wallet === a).length }))
    .filter((x) => x.realized !== 0 || x.open > 0).sort((a, b) => b.realized - a.realized).slice(0, 8);
  return { token: TOKEN, mint: FLUX_MINT, oi, traders: Object.keys(db.wallets).filter((a) => !a.startsWith('Bot')).length, openPositions: db.pos.length,
    priceLive: PRICE_OK, priceSource: 'CoinGecko + Jupiter',
    vault: s.V, insurance: s.I, capital: s.C_tot, profit: s.pnlPos, residual: s.residual, haircut: s.H, pending: s.pendR, leaderboard: lb };
}

// ---------- http ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };
function serve(req, res) { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/client/landing.html'; if (u === '/app' || u === '/app/' || u === '/trade') u = '/client/index.html'; if (u === '/docs' || u === '/docs/') u = '/client/docs.html'; const f = path.normalize(path.join(ROOT, u)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end('no'); } fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(b); }); }
function json(res, c, o) { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e4) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); }); }

const server = http.createServer(async (req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/api/session') { const w = new URL(req.url, 'http://x').searchParams.get('wallet') || ''; if (!isWallet(w)) return json(res, 200, { error: 'bad wallet' }); const exp = Date.now() + 7 * 864e5; return json(res, 200, { exp, message: sessionMsg(w, exp) }); }
  if (u === '/api/config') return json(res, 200, { token: TOKEN, mint: FLUX_MINT, network: 'solana', priceLive: PRICE_OK, priceSource: 'CoinGecko + Jupiter', lastPrice: LAST_OK, listed: LISTED_COUNT, maint_bps: MAINT_BPS, maxMoveBps: MAX_MOVE_BPS, markets: MKT.map((m) => ({ sym: m.sym, maxLev: m.maxLev, dp: m.dp, src: m.src })), chain: CHAIN });
  if (u === '/api/markets') return json(res, 200, markets());
  if (u === '/api/ecosystem') return json(res, 200, ecosystem());
  if (u === '/api/metrics') return json(res, 200, metrics());
  if (u.startsWith('/api/market/')) { const d = marketDetail(u.split('/')[3]); return d ? json(res, 200, d) : json(res, 404, { error: 'no market' }); }
  if (req.method === 'POST') {
    const d = await body(req);
    if (u === '/api/list') return json(res, 200, await listToken(d.token || ''));   // permissionless listing
    if (u === '/api/account') { if (!isWallet(d.wallet || '')) return json(res, 200, { error: 'paste a valid Solana wallet' }); return json(res, 200, account(d.wallet)); }
    if (!isWallet(d.wallet || '')) return json(res, 200, { error: 'connect a wallet first' });
    try { requireSess(d.wallet, d.auth); } catch (e) { return json(res, 200, { error: String(e), auth: true }); }
    if (u === '/api/open') { const r = openPos(d.wallet, d.market, d.side === 'short' ? 'short' : 'long', d.sizeUsd, d.lev); if (r.error) return json(res, 200, r); save(); return json(res, 200, Object.assign({ ok: true }, account(d.wallet))); }
    if (u === '/api/close') { const p = db.pos.find((x) => x.id === d.id && x.wallet === d.wallet); if (!p) return json(res, 200, { error: 'no position' }); const r = closePos(d.id); if (r.error) return json(res, 200, r); save(); return json(res, 200, Object.assign({ ok: true, closedPnl: r.closedPnl }, account(d.wallet))); }
  }
  serve(req, res);
});

(async () => {
  await discover();                                                     // auto-list liquid Solana memecoins
  await fetchPrices(); await fetchDexPrices();                          // seed real prices before accepting traffic
  server.listen(PORT, () => console.log('FLUXDEX × percolator on :' + PORT + ' · ' + MKT.length + ' markets (' + LISTED_COUNT + ' auto-listed) · Jupiter prices'));
  setInterval(fetchPrices, 10000); setInterval(fetchDexPrices, 4000);               // live oracle refresh
  setInterval(discover, 180000);                // re-scan every 3 min
  setInterval(tick, SEC * 1000);                // settle / liquidate / recover
})();
