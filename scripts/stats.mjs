import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const members = JSON.parse(fs.readFileSync(new URL('./data/members.json', import.meta.url)));
const DU = (code, id, n) => `https://m.stock.naver.com/front-api/discussion/list?discussionType=domesticStock&itemCode=${code}&pageSize=${n}${id ? `&offset=-${id}` : ''}&isHolderOnly=false&excludesItemNews=false&isItemNewsOnly=false`;
async function getJson(u, tries = 4) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(u, H); if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
  }
}
// 1) 경계 id: 지금부터 2개월 간격 7개 시점 (삼성전자 글로 이진탐색)
const now = Date.now(), DAY = 864e5;
async function idAt(t) {
  let lo = 404000000, hi = latest;
  while (hi - lo > 20000) {
    const mid = Math.floor((lo + hi) / 2);
    const p = (await getJson(DU('005930', mid, 1))).result.posts[0];
    if (new Date(p.writtenAt + '+09:00').getTime() > t) hi = mid; else lo = mid;
  }
  return hi;
}
const B = [430353451, 427651190, 422619843, 417369743, 412479941, 408426555, 404836412];
console.log('boundaries', B);

// 2) 종목별 1년 게시글 수 추정 (구간별 100건 샘플)
async function postCount(code) {
  const parts = await Promise.all([0, 1, 2, 3, 4, 5].map(async k => {
    const hi = B[k], lo = B[k + 1];
    const posts = (await getJson(DU(code, hi, 100))).result.posts;
    const inside = posts.filter(p => Number(p.id) >= lo);
    if (inside.length < posts.length || posts.length < 100) return inside.length;
    return 100 * (hi - lo) / (hi - Number(posts.at(-1).id));
  }));
  return Math.round(parts.reduce((a, b) => a + b, 0));
}
// 3) 최근 6개월 거래대금 (일봉 종가×거래량 합)
async function tradeValue(code) {
  const t = await (await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=125&requestType=0`, H)).text();
  let sum = 0;
  for (const m of t.matchAll(/data="(\d+)\|[^|]*\|[^|]*\|[^|]*\|(\d+)\|(\d+)"/g)) sum += Number(m[2]) * Number(m[3]);
  return sum;
}
const codes = new Map();
for (const list of Object.values(members)) for (const s of list) if (s.code.endsWith('0')) codes.set(s.code, s.name);
const F = new URL('./data/stats.json', import.meta.url);
const stats = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F)) : {};
const todo = [...codes.keys()].filter(c => !stats[c]);
let done = 0;
async function worker() {
  while (todo.length) {
    const c = todo.pop();
    try { const [posts, tv] = await Promise.all([postCount(c), tradeValue(c)]); stats[c] = { posts, tv }; }
    catch (e) { console.log('fail', c, e.message); }
    if (++done % 50 === 0) { console.log(done, '/', todo.length + done); fs.writeFileSync(F, JSON.stringify(stats)); }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
fs.writeFileSync(new URL('./data/stats.json', import.meta.url), JSON.stringify(stats));
console.log('done', Object.keys(stats).length);
