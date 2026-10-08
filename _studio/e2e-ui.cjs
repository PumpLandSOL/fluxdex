// FluxDEX real-UI E2E with a mock Phantom holding a real ed25519 key: connect + sign, trade from the ticket, close from positions.
'use strict';
const path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto'); const { spawn } = require('child_process'); const { open, sleep } = require('./cdp.cjs');
const PORT = 8256, B = 'http://localhost:' + PORT, SIGNER = 8257;
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const b58 = (buf) => { let n = BigInt('0x' + Buffer.from(buf).toString('hex')), s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; } for (const x of buf) { if (x === 0) s = '1' + s; else break; } return s; };
const K = crypto.generateKeyPairSync('ed25519'); const ME = b58(K.publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
let pass = 0, fail = 0; const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  · ' + x : '')); };
const signer = http.createServer((req, res) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); if (req.method === 'OPTIONS') return res.end(); res.end(JSON.stringify({ sig: [...crypto.sign(null, Buffer.from(JSON.parse(b).hex, 'hex'), K.privateKey)] })); }); }).listen(SIGNER);
const MOCK = `(()=>{const pk={toString:()=>'${ME}'};const p={isPhantom:true,on(){},async connect(){return {publicKey:pk}},async signMessage(bytes){const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');const r=await fetch('http://localhost:${SIGNER}',{method:'POST',body:JSON.stringify({hex})}).then(r=>r.json());return {signature:new Uint8Array(r.sig)}}};window.phantom={solana:p};window.solana=p;})();`;
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(PORT), DATA_PATH: path.join(os.tmpdir(), 'flux-ui-' + Date.now() + '.json') }, stdio: 'ignore' });
  let c, c2;
  try {
    for (let i = 0; i < 60; i++) { try { const m = await (await fetch(B + '/api/markets')).json(); if (m.filter((x) => x.live).length >= 8) break; } catch {} await sleep(500); }
    c = await open('about:blank', 1440, 900, 9801); await c.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK }); await c.send('Page.navigate', { url: B + '/app?m=SOL&side=long' }); await sleep(5000);
    await c.ev(`document.getElementById('connect').click()`); await sleep(2500);
    ok('Phantom connected + session signed', await c.ev(`!!localStorage.getItem('flux_auth_${ME}') && document.getElementById('connect').textContent.startsWith('${ME.slice(0, 4)}')`));
    await c.ev(`(()=>{const s=document.getElementById('size');s.value='2000';s.dispatchEvent(new Event('input'));const l=document.getElementById('lev');l.value='20';l.dispatchEvent(new Event('input'));document.getElementById('submit').click()})()`); await sleep(2500);
    let acc = await (await fetch(B + '/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: ME }) })).json();
    const p = acc.positions[0]; ok('trade placed from the ticket', !!p, p ? p.sym + ' ' + p.side + ' $' + Math.round(p.size) + ' @' + p.lev + 'x' : 'none');
    const rows = await c.ev(`document.getElementById('postbody').innerText`); ok('position shows in the table', p && rows.includes(p.sym), rows.split('\n')[0]);
    await c.ev(`(document.querySelector('[data-close]')||{click(){}}).click()`); await sleep(2500);
    acc = await (await fetch(B + '/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: ME }) })).json(); ok('closed from the table', acc.positions.length === 0, 'usdc ' + acc.usdc.toFixed(2));
    c2 = await open(B + '/app', 390, 800, 9802); await sleep(4500); await c2.ev(`document.getElementById('connect').click()`); await sleep(600);
    ok('no wallet → Open in Phantom', /phantom\.app\/ul\/browse/.test(await c2.ev(`(document.getElementById('phLink')||{}).href||''`)));
  } catch (e) { console.error(e); fail++; } finally { if (c) c.close(); if (c2) c2.close(); srv.kill(); signer.close(); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
