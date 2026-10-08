// FluxDEX E2E: markets live, signed sessions, open/close with real ed25519 keys, forged/unsigned refused, H, listing guard.
'use strict';
const path = require('path'), os = require('os'), crypto = require('crypto'); const { spawn } = require('child_process');
const PORT = 8255, B = 'http://localhost:' + PORT; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  · ' + x : '')); };
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const b58 = (buf) => { let n = BigInt('0x' + Buffer.from(buf).toString('hex')), s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; } for (const x of buf) { if (x === 0) s = '1' + s; else break; } return s; };
const mk = () => { const k = crypto.generateKeyPairSync('ed25519'); return { w: b58(k.publicKey.export({ format: 'der', type: 'spki' }).subarray(12)), k: k.privateKey }; };
const post = (u, b) => fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
async function auth(u) { const m = await (await fetch(B + '/api/session?wallet=' + u.w)).json(); return { exp: m.exp, sig: b58(crypto.sign(null, Buffer.from(m.message), u.k)) }; }
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), DATA_PATH: path.join(os.tmpdir(), 'flux-e2e-' + Date.now() + '.json') }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { const m = await (await fetch(B + '/api/markets')).json(); if (m.filter((x) => x.live).length >= 8) break; } catch {} await sleep(500); }
    const mk8 = await (await fetch(B + '/api/markets')).json(); ok('8 majors live', mk8.filter((x) => x.live).length === 8 && ['BTC', 'ETH', 'SOL', 'HYPE', 'ZEC', 'NEAR', 'JUP', 'PUMP'].every((s) => mk8.some((m) => m.sym === s)), mk8.map((m) => m.sym + '=' + m.px.toPrecision(4)).join(' '));
    const me = mk(), evil = mk(); const a = await auth(me);
    const un = await post('/api/open', { wallet: me.w, market: 'BTC', side: 'long', sizeUsd: 1000, lev: 10 }); ok('unsigned open refused', un.auth === true, un.error);
    const m = await (await fetch(B + '/api/session?wallet=' + me.w)).json(); const forged = await post('/api/open', { wallet: me.w, market: 'BTC', side: 'long', sizeUsd: 1000, lev: 10, auth: { exp: m.exp, sig: b58(crypto.sign(null, Buffer.from(m.message), evil.k)) } }); ok('forged signature refused', /not from this wallet/.test(forged.error || ''), forged.error);
    const o = await post('/api/open', { wallet: me.w, market: 'HYPE', side: 'long', sizeUsd: 1000, lev: 10, auth: a }); ok('signed open HYPE 10x', !o.error, o.error || '');
    const z = await post('/api/open', { wallet: me.w, market: 'ZEC', side: 'short', sizeUsd: 500, lev: 5, auth: a }); ok('signed open ZEC short 5x', !z.error, z.error || '');
    const over = await post('/api/open', { wallet: me.w, market: 'PUMP', side: 'long', sizeUsd: 500, lev: 40, auth: a }); const pp = (over.positions || []).find((p) => p.sym === 'PUMP'); ok('40x on PUMP capped to its 15x max', pp && pp.lev <= 15.1, pp ? pp.lev + 'x' : over.error);
    let acc = await post('/api/account', { wallet: me.w }); ok('account shows 3 positions with liq prices', acc.positions.length === 3 && acc.positions.every((p) => p.liq > 0), acc.positions.map((p) => p.sym + ' ' + p.side + ' liq ' + p.liq.toPrecision(4)).join(', '));
    await sleep(3000); const id = acc.positions.find((p) => p.sym === 'HYPE').id;
    const c = await post('/api/close', { wallet: me.w, id, auth: a }); acc = await post('/api/account', { wallet: me.w }); ok('signed close works', !c.error && acc.positions.length === 2, c.error || 'usdc ' + acc.usdc.toFixed(2));
    const met = await (await fetch(B + '/api/metrics')).json(); ok('haircut H published and in [0,1]', met.haircut >= 0 && met.haircut <= 1, 'H ' + met.haircut + ' residual ' + Math.round(met.residual));
    const bad = await post('/api/list', { token: '0xdeadbeef' }); ok('EVM address rejected for listing', /Solana/.test(bad.error || ''), bad.error);
    const dupe = await post('/api/list', { token: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' }); ok('core mint re-list returns existing market', dupe.ok && dupe.existed && dupe.sym === 'JUP');
  } catch (e) { console.error(e); fail++; } finally { srv.kill(); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
