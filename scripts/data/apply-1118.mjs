// 2026-11-18 칼럼 재작성(column-v2) · 시황 운영자 코멘트(sihwang-comments) 반영
// 사용: node scripts/data/apply-1118.mjs columns|sihwang [--apply] [--only=id,id]
//   운영 본문이 backup-1118과 같을 때만 SET (되돌리기: backup-1118/{board}_{id}.json 의 content를 다시 SET)
import fs from 'node:fs';
import { richTextLength } from 'file:///D:/claude/homepage/api/_rich.js';
const [mode] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const R = 'D:/claude/homepage/scripts/data/';
const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
const BLOCK = /^\[(표|막대|선|봉)(?::([^\]\n]{0,60}))?\]\n([\s\S]*?)\n\[\/\1\]$/gm;
function lint(text) {
  const errs = [];
  for (const t of ['표', '막대', '선', '봉']) {
    const lines = text.split('\n');
    const open = lines.filter(l => l === '[' + t + ']' || (l.startsWith('[' + t + ':') && l.endsWith(']'))).length;
    const close = lines.filter(l => l === '[/' + t + ']').length;
    if (open !== close) errs.push('블록 짝 불일치 ' + t);
  }
  if (/\[(표|막대|선|봉)[:\]]/.test(text.replace(BLOCK, ''))) errs.push('블록 문법 오류(줄 맨 앞/짝)');
  for (const m of text.matchAll(/\[사진:([^\]]*)\]/g)) if (!/^\/img\/[0-9a-f]{24}\.(webp|jpg|png|gif)$/.test(m[1])) errs.push('사진 경로 오류 ' + m[1]);
  return errs;
}
const jobs = [];
if (mode === 'columns') {
  for (const f of fs.readdirSync(R + 'column-v2').filter(f => /^[0-9a-z]{14}\.txt$/.test(f))) {
    const id = f.slice(0, -4); if (only.length && !only.includes(id)) continue;
    const bk = JSON.parse(fs.readFileSync(R + `backup-1118/COLMKT_${id}.json`, 'utf8'));
    const content = fs.readFileSync(R + 'column-v2/' + f, 'utf8').replace(/\r\n/g, '\n').trim();
    const errs = lint(content);
    if (content.length > 5000) errs.push('5000자 초과 ' + content.length);
    if (content.length < 2800) errs.push('너무 짧음 ' + content.length);
    jobs.push({ id, bk, content, errs });
  }
} else if (mode === 'sihwang') {
  const info = Object.fromEntries(fs.readFileSync(R + 'sihwang-comments/INFO.tsv', 'utf8').split('\n').map(l => l.split('\t')).map(a => [a[0], +a[1]]));
  for (const f of fs.readdirSync(R + 'sihwang-comments').filter(f => /^[0-9a-z]{14}\.txt$/.test(f))) {
    const id = f.slice(0, -4); if (only.length && !only.includes(id)) continue;
    const bk = JSON.parse(fs.readFileSync(R + `backup-1118/COLNEWS_${id}.json`, 'utf8'));
    const cm = fs.readFileSync(R + 'sihwang-comments/' + f, 'utf8').replace(/\r\n/g, '\n').trim();
    const errs = [];
    if (cm.length > info[id]) errs.push(`코멘트 ${cm.length}자 > 허용 ${info[id]}`);
    if (cm.length < 200) errs.push('코멘트 너무 짧음 ' + cm.length);
    if (bk.content.includes('■ 운영자 코멘트')) errs.push('이미 코멘트 있음');
    const at = bk.content.lastIndexOf('\n※ ');
    if (at < 0) errs.push('면책 줄 없음');
    const content = bk.content.slice(0, at).trimEnd() + '\n\n■ 운영자 코멘트\n\n' + cm + '\n' + bk.content.slice(at);
    if (richTextLength(content) > 3000) errs.push('본문 3000자 초과 ' + richTextLength(content));
    errs.push(...lint(content));
    jobs.push({ id, bk, content, errs });
  }
}
let ok = 0, bad = 0;
for (const j of jobs) {
  if (j.errs.length) { bad++; console.log('SKIP', j.id, j.errs.join('; ')); continue; }
  const [{ result }] = await r([['GET', 'post:' + j.id]]);
  const cur = JSON.parse(result);
  if (cur.content !== j.bk.content) { bad++; console.log('SKIP', j.id, '운영 본문이 백업과 다름(이미 반영됐거나 수정됨)'); continue; }
  ok++;
  if (apply) { cur.content = j.content; await r([['SET', 'post:' + j.id, JSON.stringify(cur)]]); }
  console.log(apply ? 'SET ' : 'ok  ', j.id, j.content.length, cur.title.slice(0, 30));
}
console.log({ mode, apply, ok, bad });
