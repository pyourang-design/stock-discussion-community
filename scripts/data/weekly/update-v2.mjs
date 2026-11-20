// 주간 시황 리뷰 4편을 개인 의견·전망 형식(v2)으로 교체 — 운영 본문이 v1 파일과 같을 때만 SET (되돌리기: v1/W?.body.txt·title.txt)
// 사용: node scripts/data/weekly/update-v2.mjs W1,W2 [--apply]
import fs from 'node:fs';
import { richTextLength } from 'file:///D:/claude/homepage/api/_rich.js';
const apply = process.argv.includes('--apply');
const weeks = (process.argv[2] || '').split(',').filter(Boolean);
const R = 'D:/claude/homepage/scripts/data/weekly/';
const IDS = { W1: 'mwllwk2y1193rg', W2: 'mwllwk7zpw33eq', W3: 'mwllwkamdvr02l', W4: 'mwllwkd8ybvdjm' };
const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
for (const w of weeks) {
  const title = fs.readFileSync(R + w + '.v2.title.txt', 'utf8').trim();
  const content = fs.readFileSync(R + w + '.v2.body.txt', 'utf8').replace(/\r\n/g, '\n').trim();
  const errs = [];
  if (!title || title.length > 100) errs.push('제목 길이');
  if (/국내 시황/.test(title) || !/주간 시황 리뷰/.test(title)) errs.push('제목 형식');
  const n = richTextLength(content);
  if (n > 3000) errs.push('본문 3000자 초과 ' + n);
  if (n < 2000) errs.push('본문 짧음 ' + n);
  if (content.length > 12000) errs.push('전체 12000자 초과');
  if (!/복기형 글/.test(content)) errs.push('복기형 고지 없음');
  if (!/그 뒤 실제/.test(content)) errs.push("'그 뒤 실제' 대조 없음");
  if (/사라(?![지졌진])|팔라(?![가-힣])|매수하세요|매도하세요|비중을 (늘려|줄여)/.test(content)) errs.push('행동 지시 표현 의심');
  if (/\[봉|\[선/.test(content)) errs.push('봉/선');
  const lines = content.split('\n');
  for (const t of ['표', '막대']) {
    const o = lines.filter(l => l === `[${t}]` || (l.startsWith(`[${t}:`) && l.endsWith(']'))).length, c = lines.filter(l => l === `[/${t}]`).length;
    if (o !== c) errs.push('블록 짝 ' + t);
  }
  const [{ result }] = await r([['GET', 'post:' + IDS[w]]]);
  const cur = JSON.parse(result);
  const v1 = fs.readFileSync(R + 'v1/' + w + '.body.txt', 'utf8').replace(/\r\n/g, '\n').trim();
  if (cur.content !== v1) errs.push('운영 본문이 v1과 다름(이미 교체됐거나 수정됨)');
  console.log(w, title.slice(0, 60), 'text', n, 'raw', content.length, errs.length ? 'ERR ' + errs.join('; ') : 'ok');
  if (errs.length || !apply) continue;
  cur.title = title; cur.content = content; cur.editedTs = Date.now();
  const res = await r([['SET', 'post:' + cur.id, JSON.stringify(cur), 'XX'], ['HSET', 'colmeta:COLNEWS', cur.id, JSON.stringify({ id: cur.id, title, ts: cur.ts })]]);
  console.log('  교체', res.map(x => x.result ?? x.error));
}
