// 종목 게시판 AI 글(ai:true) 전체 백업 후 삭제 (2026-11-18)
// 사용: node scripts/data/ai-backup-1118/delete-ai.mjs [--apply]
//  백업: ai-posts.json (삭제 대상 글 전체). 복구: 각 글을 SET post:{id} 하고 LPUSH posts:{code}·author:AI 운영자, HINCRBY postcount +1 (순서는 ts 오름차순으로 LPUSH)
import fs from 'node:fs';
const D = 'D:/claude/homepage/scripts/data/ai-backup-1118/';
const apply = process.argv.includes('--apply');
const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
const [{ result: pc }] = await r([['HGETALL', 'postcount']]);
const codes = []; for (let i = 0; i < pc.length; i += 2) if (Number(pc[i + 1]) > 0) codes.push(pc[i]);
const found = new Map();
for (let i = 0; i < codes.length; i += 40) {
  const batch = codes.slice(i, i + 40);
  const lists = (await r(batch.map(c => ['LRANGE', 'posts:' + c, 0, -1]))).map(x => x.result || []);
  const ids = [...new Set(lists.flat())];
  for (let j = 0; j < ids.length; j += 300) {
    const part = ids.slice(j, j + 300);
    const raws = (await r([['MGET', ...part.map(id => 'post:' + id)]]))[0].result || [];
    for (const raw of raws) { if (!raw) continue; const p = JSON.parse(raw); if (p.ai === true && p.nick === 'AI 운영자' && /^[0-9A-Za-z.]+$/.test(p.code)) found.set(p.id, p); }
  }
}
const posts = [...found.values()].sort((a, b) => a.ts - b.ts);
console.log('삭제 대상 AI 글', posts.length, '게시판', new Set(posts.map(p => p.code)).size);
if (!apply) process.exit(0);
fs.writeFileSync(D + 'ai-posts.json', JSON.stringify(posts));
const bk = JSON.parse(fs.readFileSync(D + 'ai-posts.json', 'utf8')).length;
if (bk !== posts.length) throw new Error('백업 검증 실패');
console.log('백업 저장', bk, fs.statSync(D + 'ai-posts.json').size, 'bytes');
let done = 0;
for (let i = 0; i < posts.length; i += 25) {
  const cmds = [];
  for (const p of posts.slice(i, i + 25)) cmds.push(
    ['DEL', `post:${p.id}`, `pw:${p.id}`, `likes:${p.id}`, `dislikes:${p.id}`, `pwfail:${p.id}`, `reports:${p.id}`, `reportwhy:${p.id}`],
    ['ZREM', 'reported', p.id], ['HDEL', 'postviews', p.id], ['LREM', `posts:${p.code}`, 0, p.id], ['LREM', 'author:AI 운영자', 0, p.id], ['SREM', `pins:${p.code}`, p.id], ['HINCRBY', 'postcount', p.code, -1]);
  const res = await r(cmds);
  const err = res.filter(x => x.error); if (err.length) console.log('오류', err.slice(0, 2));
  done += Math.min(25, posts.length - i);
}
console.log('삭제 처리', done);
