// one-shot: Phantom (Solana) wallet + ed25519-signed sessions on open/close. (run once)
'use strict';
const fs = require('fs'); const path = require('path');
const SF = path.join(__dirname, '..', 'server', 'index.js'), AF = path.join(__dirname, '..', 'client', 'src', 'app.js'), HF = path.join(__dirname, '..', 'client', 'index.html');
let s = fs.readFileSync(SF, 'utf8'), a = fs.readFileSync(AF, 'utf8'), h = fs.readFileSync(HF, 'utf8');
if (s.includes('requireSess')) throw new Error('already patched');
const rep = (src, x, y) => { if (!src.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); return src.split(x).join(y); };
// ---------- server ----------
s = rep(s, "const isWallet = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);", `const isWallet = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58dec(str) { let n = 0n; for (const ch of str) { const i = B58.indexOf(ch); if (i < 0) throw new Error('b58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const ch of str) { if (ch === '1') out.unshift(0); else break; } return Buffer.from(out); }
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex'); const SESSIONS = new Map();
const sessionMsg = (w, exp) => ['FLUXDEX trading session', 'Wallet: ' + w, 'Expires: ' + exp, 'Signing is free and moves no funds.'].join('\\n');
function requireSess(w, auth) {
  if (!auth || !auth.sig || !auth.exp) throw 'sign in with your wallet first';
  const exp = +auth.exp; if (!(exp > Date.now())) throw 'session expired, sign in again'; if (exp > Date.now() + 8 * 864e5) throw 'bad session';
  const key = w + ':' + exp + ':' + auth.sig; if (SESSIONS.get(key)) return true;
  let ok = false; try { const pk = b58dec(w), sig = b58dec(auth.sig); if (pk.length !== 32 || sig.length !== 64) throw 0;
    ok = require('crypto').verify(null, Buffer.from(sessionMsg(w, exp), 'utf8'), require('crypto').createPublicKey({ key: Buffer.concat([SPKI_ED25519, pk]), format: 'der', type: 'spki' }), sig); } catch (e) { throw 'bad signature'; }
  if (!ok) throw 'signature is not from this wallet';
  if (SESSIONS.size > 5000) SESSIONS.clear(); SESSIONS.set(key, 1); return true;
}`);
s = rep(s, "  if (u === '/api/config')", "  if (u === '/api/session') { const w = new URL(req.url, 'http://x').searchParams.get('wallet') || ''; if (!isWallet(w)) return json(res, 200, { error: 'bad wallet' }); const exp = Date.now() + 7 * 864e5; return json(res, 200, { exp, message: sessionMsg(w, exp) }); }\n  if (u === '/api/config')");
s = rep(s, "{ error: 'paste a valid 0x wallet' }", "{ error: 'paste a valid Solana wallet' }");
s = rep(s, "    if (!isWallet(d.wallet || '')) return json(res, 200, { error: 'connect a wallet first' });",
  "    if (!isWallet(d.wallet || '')) return json(res, 200, { error: 'connect a wallet first' });\n    try { requireSess(d.wallet, d.auth); } catch (e) { return json(res, 200, { error: String(e), auth: true }); }");
fs.writeFileSync(SF, s);
// ---------- client ----------
a = rep(a, "const api = (u, b) => fetch(u, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : undefined).then((r) => r.json());",
`const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
async function api(u, b) { if (!b) return fetch(u).then((r) => r.json()); const wa = () => (b.wallet && b.wallet === wallet ? Object.assign({}, b, { auth: getAuth() }) : b); let r = await post(u, wa()); if (r && r.auth) { if (await signIn()) r = await post(u, wa()); } return r; }`);
a = a.split("'hood_w'").join("'flux_w'");
const i0 = a.indexOf('// ---------- wallet ----------'), i1 = a.indexOf('function needWallet()');
a = a.slice(0, i0) + `// ---------- wallet (Phantom / any Solana wallet) ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(bytes) { let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x === 0) s = '1' + s; else break; } return s; }
const isW = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const sol = () => (window.phantom && window.phantom.solana) || window.solana || null;
const errText = (e) => { const m = (e && (e.message || (e.error && e.error.message))) || String(e || ''); if ((e && e.code === 4001) || /reject|denied|cancel/i.test(m)) return 'request rejected in your wallet'; return m.slice(0, 120) || 'wallet error'; };
const AKEY = () => 'flux_auth_' + wallet;
function getAuth() { try { const x = JSON.parse(localStorage.getItem(AKEY()) || 'null'); return x && x.exp > Date.now() + 6e4 ? x : null; } catch (e) { return null; } }
async function signIn() {
  if (!wallet) return false; if (getAuth()) return true; const p = sol();
  if (!p || !p.signMessage) { toast('connect Phantom to sign in', 'err'); return false; }
  try { const m = await (await fetch('/api/session?wallet=' + wallet)).json(); toast('sign the message in your wallet (free, no transaction)', 'ok');
    const r = await p.signMessage(new TextEncoder().encode(m.message), 'utf8'); localStorage.setItem(AKEY(), JSON.stringify({ exp: m.exp, sig: b58enc(new Uint8Array(r.signature || r)) })); return true;
  } catch (e) { toast(errText(e), 'err'); return false; }
}
function setConnected() { $('connect').textContent = wallet ? (wallet.slice(0, 4) + '…' + wallet.slice(-4)) : 'Connect'; }
async function connectWallet() {
  if (wallet) { localStorage.removeItem(AKEY()); wallet = ''; localStorage.removeItem('flux_w'); setConnected(); A = null; renderAccount(); toast('wallet disconnected', 'ok'); return; }
  const p = sol();
  if (!p) { if ($('wmodal')) $('wmodal').classList.add('on'); else toast('install Phantom to trade', 'err'); return; }
  try { const r = await p.connect(); const pk = (r && r.publicKey ? r.publicKey : p.publicKey).toString(); if (!isW(pk)) throw new Error('no Solana address returned');
    wallet = pk; localStorage.setItem('flux_w', wallet); setConnected(); await signIn(); toast('wallet connected', 'ok'); await loadAccount();
  } catch (e) { toast(errText(e), 'err'); }
}
$('connect').onclick = connectWallet;
(function () { const p = sol(); if (p && p.on) p.on('accountChanged', async (pk) => { if (pk) { wallet = pk.toString(); localStorage.setItem('flux_w', wallet); setConnected(); await loadAccount(); } }); })();
` + a.slice(i1);
fs.writeFileSync(AF, a);
// no-wallet modal: open inside Phantom on phones
h = h.replace(/<div class="modal" id="wmodal"><div class="card mcard">[\s\S]*?<\/div><\/div>/, `<div class="modal" id="wmodal"><div class="card mcard"><h3>Connect a Solana wallet</h3><p style="color:var(--dim);margin:10px 0 16px">No wallet found in this browser. Open FluxDEX inside Phantom, or install Phantom on desktop.</p><a class="btn" id="phLink" style="display:block;text-align:center" href="#">Open in Phantom</a><script>document.getElementById('phLink').href='https://phantom.app/ul/browse/'+encodeURIComponent(location.href)+'?ref='+encodeURIComponent(location.origin);document.getElementById('wmodal').onclick=function(e){if(e.target.id==='wmodal')this.classList.remove('on')};</script></div></div>`);
fs.writeFileSync(HF, h); console.log('wallet patched');
