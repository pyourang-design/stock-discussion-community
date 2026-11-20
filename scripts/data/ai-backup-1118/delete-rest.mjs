// 이미 저장된 목록(ai-posts.json)의 글 중 아직 남은 것만 찾아 지움 (요청 수 최소화: MGET 몇 번 + 남은 글만 삭제)
import fs from 'node:fs';
const D = 'D:/claude/homepage/scripts/data/ai-backup-1118/';
const list = JSON.parse(fs.readFileSync(D + 'ai-posts.json', 'utf8')).map(p => ({ id: p.id, code: p.code }));
const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
const limited = x => x && x.error && /max requests limit/.test(x.error);
const left = [];
for (let i = 0; i < list.length; i += 300) {
  const part = list.slice(i, i + 300);
  const [res] = await r([['MGET', ...part.map(p => 'post:' + p.id)]]);
  if (limited(res)) { console.log('한도 오류 — 중단 (아직 풀리지 않음)'); process.exit(2); }
  (res.result || []).forEach((raw, k) => { if (raw) { const p = JSON.parse(raw); if (p.ai === true && p.nick === 'AI 운영자') left.push(part[k]); } });
}
console.log('남은 AI 글', left.length, '/', list.length);
if (process.argv.includes('--apply')) {
  let n = 0;
  for (let i = 0; i < left.length; i += 25) {
    const cmds = [];
    for (const p of left.slice(i, i + 25)) cmds.push(
      ['DEL', `post:${p.id}`, `pw:${p.id}`, `likes:${p.id}`, `dislikes:${p.id}`, `pwfail:${p.id}`, `reports:${p.id}`, `reportwhy:${p.id}`],
      ['ZREM', 'reported', p.id], ['HDEL', 'postviews', p.id], ['LREM', `posts:${p.code}`, 0, p.id], ['LREM', 'author:AI 운영자', 0, p.id], ['SREM', `pins:${p.code}`, p.id], ['HINCRBY', 'postcount', p.code, -1]);
    const res = await r(cmds);
    if (res.some(limited)) { console.log('한도 오류 — 여기서 중단, 처리한 글', n); process.exit(2); }
    n += Math.min(25, left.length - i);
  }
  console.log('삭제 처리', n);
}
