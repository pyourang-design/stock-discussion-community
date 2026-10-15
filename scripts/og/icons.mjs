// scripts/og/icon.html(512px)을 캡처 배율(scale)로 줄여 홈 화면 아이콘 저장 — 실행: cd 홈페이지 폴더 && node scripts/og/icons.mjs
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path';
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9342', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
for (let i = 0; i < 50; i++) { try { const p = (await (await fetch('http://127.0.0.1:9342/json')).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
if (ws.readyState !== 1) await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///D:/claude/homepage/scripts/og/icon.html' }); await sleep(1500);
for (const [n, out] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 512, height: 512, scale: n / 512 } });
  fs.writeFileSync(new URL('../../' + out, import.meta.url), Buffer.from(r.result.data, 'base64'));
  const b = fs.readFileSync(new URL('../../' + out, import.meta.url)); console.log(out, b.readUInt32BE(16) + 'x' + b.readUInt32BE(20), b.length + 'B');
}
ws.close(); chrome.kill();
