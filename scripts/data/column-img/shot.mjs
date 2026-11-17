// 사용: node scripts/data/column-img/shot.mjs 입력.html 출력.webp  (헤드리스 크롬 CDP, 가로 1600 전체 높이 캡처)
import { spawn } from 'child_process'; import fs from 'fs'; import os from 'os'; import path from 'path';
const [inp, out] = process.argv.slice(2);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9351', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, seq = 0; const pending = new Map();
for (let i = 0; i < 50; i++) { try { const p = (await (await fetch('http://127.0.0.1:9351/json')).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
if (ws.readyState !== 1) await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + path.resolve(inp).split(path.sep).join('/') }); await sleep(1500);
const h = (await send('Runtime.evaluate', { expression: 'document.body.scrollHeight', returnByValue: true })).result.result.value;
const r = await send('Page.captureScreenshot', { format: 'webp', quality: 92, clip: { x: 0, y: 0, width: 1600, height: h, scale: 1 } });
fs.writeFileSync(out, Buffer.from(r.result.data, 'base64')); console.log(out, 1600 + 'x' + h, fs.statSync(out).size + 'B');
ws.close(); chrome.kill();
