// 과거 주간 시황 리뷰(W1~W4)를 주식 시황 게시판에 등록 — 그 주 마지막 일간 글 바로 위(최신 쪽)에 끼워 넣어 목록 순서가 날짜 순서를 따르게 함
// 사용: node scripts/data/weekly/publish.mjs W1,W2 [--apply]   (글 작성일 ts는 실제 등록 시각)
import fs from 'node:fs';
import { richTextLength } from 'file:///D:/claude/homepage/api/_rich.js';
const apply = process.argv.includes('--apply');
const weeks = (process.argv[2] || '').split(',').filter(Boolean);
const R = 'D:/claude/homepage/scripts/data/weekly/';
const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
const LAST = { W1: ['10/23', '미국'], W2: ['10/30', '미국'], W3: ['11/06', '미국'], W4: ['11/13', '미국'] };  // 그 주 마지막 일간 글(제목 날짜·시장)
const BK = 'D:/claude/homepage/scripts/data/backup-1118/';
const posts = fs.readdirSync(BK).filter(f => f.startsWith('COLNEWS_')).map(f => JSON.parse(fs.readFileSync(BK + f, 'utf8')));
for (const w of weeks) {
  const title = fs.readFileSync(R + w + '.title.txt', 'utf8').trim();
  const content = fs.readFileSync(R + w + '.body.txt', 'utf8').replace(/\r\n/g, '\n').trim();
  const errs = [];
  if (!title || title.length > 100) errs.push('제목 길이');
  if (/국내 시황/.test(title)) errs.push("제목에 '국내 시황'");
  if (!/주간 시황 리뷰/.test(title)) errs.push('제목 형식');
  const n = richTextLength(content);
  if (n > 3000) errs.push('본문 3000자 초과 ' + n);
  if (content.length > 12000) errs.push('전체 12000자 초과');
  if (!content.includes('■ 운영자 코멘트')) errs.push('운영자 코멘트 없음');
  const lines = content.split('\n');
  for (const t of ['표', '막대']) {
    const o = lines.filter(l => l === `[${t}]` || (l.startsWith(`[${t}:`) && l.endsWith(']'))).length, c = lines.filter(l => l === `[/${t}]`).length;
    if (o !== c) errs.push('블록 짝 ' + t);
  }
  if (/\[봉|\[선/.test(content)) errs.push('봉/선 차트');
  const [d, mk] = LAST[w];
  const anchor = posts.find(p => p.title.startsWith(d + ' ' + mk + ' 시황'));
  if (!anchor) errs.push('기준 글 없음');
  console.log(w, title.slice(0, 50), 'text', n, 'raw', content.length, errs.length ? 'ERR ' + errs.join('; ') : 'ok', anchor?.id);
  if (errs.length || !apply) continue;
  const [dv] = await r([['HVALS', 'colmeta:COLNEWS']]); const dupe = dv.result;
  if ((dupe || []).some(m => JSON.parse(m).title === title)) { console.log('  이미 등록됨, 건너뜀'); continue; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const post = { id, code: 'COLNEWS', nick: '운영자', title, content, sentiment: 'neutral', ts: Date.now(), official: true };
  const res = await r([['SET', 'post:' + id, JSON.stringify(post)], ['HSET', 'colmeta:COLNEWS', id, JSON.stringify({ id, title, ts: post.ts })], ['LINSERT', 'posts:COLNEWS', 'BEFORE', anchor.id, id], ['LPUSH', 'author:운영자', id], ['HINCRBY', 'postcount', 'COLNEWS', 1]]);
  console.log('  등록', id, 'LINSERT 결과', res[2].result, res.map(x => x.error).filter(Boolean));
}
