// demo captures from the running app: landing, markets, ticket filled, position open, solvency, docs. usage: node _studio/shots.cjs (server on :8254)
'use strict';
const { open, sleep } = require('./cdp.cjs'); const path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto');
const B = 'http://localhost:8254', OUT = path.join(__dirname, 'shots'), SIGNER = 8258; fs.mkdirSync(OUT, { recursive: true });
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; const b58 = (buf) => { let n = BigInt('0x' + Buffer.from(buf).toString('hex')), s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; } for (const x of buf) { if (x === 0) s = '1' + s; else break; } return s; };
const K = crypto.generateKeyPairSync('ed25519'); const ME = b58(K.publicKey.export({ format: 'der', type: 'spki' }).subarray(12));
const signer = http.createServer((q, r) => { let b = ''; q.on('data', (c) => b += c); q.on('end', () => { r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*'); if (q.method === 'OPTIONS') return r.end(); r.end(JSON.stringify({ sig: [...crypto.sign(null, Buffer.from(JSON.parse(b).hex, 'hex'), K.privateKey)] })); }); }).listen(SIGNER);
const MOCK = `(()=>{const pk={toString:()=>'${ME}'};const p={isPhantom:true,on(){},async connect(){return {publicKey:pk}},async signMessage(bytes){const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');const r=await fetch('http://localhost:${SIGNER}',{method:'POST',body:JSON.stringify({hex})}).then(r=>r.json());return {signature:new Uint8Array(r.sig)}}};window.phantom={solana:p};window.solana=p;})();`;
(async () => {
  const c = await open('about:blank', 1440, 860, 9831); await c.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  const go = async (u, w = 5000) => { await c.send('Page.navigate', { url: B + u }); await sleep(w); };
  const S = async (n) => { await sleep(900); await c.shot(path.join(OUT, n + '.png')); console.log(n); };
  await go('/', 6500); await S('01-landing');
  await go('/app?m=HYPE&side=long', 5000); await c.ev(`document.getElementById('trade').scrollIntoView()`); await S('02-markets');
  await c.ev(`document.getElementById('connect').click()`); await sleep(2500);
  await c.ev(`(()=>{const s=document.getElementById('size');s.value='2500';s.dispatchEvent(new Event('input'));const l=document.getElementById('lev');l.value='15';l.dispatchEvent(new Event('input'))})()`); await S('03-ticket');
  await c.ev(`document.getElementById('submit').click()`); await sleep(2500); await c.ev(`document.getElementById('postbody').scrollIntoView({block:'center'})`); await S('04-position');
  await c.ev(`(document.getElementById('engine')||document.body).scrollIntoView()`); await S('05-solvency');
  await go('/docs', 3500); await S('06-docs');
  c.close(); signer.close();
})().catch((e) => { console.error(e); process.exit(1); });
