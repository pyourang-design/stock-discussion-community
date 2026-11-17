// 과거 시황 글의 소제목 순서·문구만 바꿔 형식을 다양하게 (숫자·문장은 그대로)
// 사용: node scripts/data/sihwang-restyle.mjs [--apply]
//   백업: scripts/data/sihwang-backup/{id}.json — 운영 본문이 백업과 같을 때만 반영 (되돌리기: 백업의 content를 다시 SET)
import fs from 'node:fs';
const B = 'D:/claude/homepage/scripts/data/sihwang-backup/';
const apply = process.argv.includes('--apply');
const NL = String.fromCharCode(10);
const KEYS = {
  kr: [['index', /^지수/], ['flow', /^투자자/], ['sector', /^업종/], ['pick', /^오늘 주목/], ['tech', /기술적 분석|코스피 흐름/], ['next', /^내일/]],
  us: [['index', /^지수/], ['sector', /^섹터/], ['bigtech', /^빅테크/], ['movers', /^크게 움직인/], ['news', /^간밤 주요 뉴스/], ['tech', /S&P 500/], ['kr', /^오늘 국내/]],
};
const BASE = { kr: ['index', 'flow', 'sector', 'pick', 'tech', 'next'], us: ['index', 'sector', 'bigtech', 'movers', 'news', 'tech', 'kr'] };
const ORDER = {
  kr: { 0: BASE.kr, 1: ['flow', 'index', 'sector', 'pick', 'tech', 'next'], 2: ['sector', 'pick', 'flow', 'index', 'tech', 'next'], 3: BASE.kr, 4: ['tech', 'flow', 'sector', 'pick', 'index', 'next'], 5: ['next', 'flow', 'sector', 'index', 'pick', 'tech'] },
  us: { 0: BASE.us, 1: ['sector', 'index', 'bigtech', 'movers', 'news', 'tech', 'kr'], 2: ['bigtech', 'movers', 'sector', 'index', 'news', 'tech', 'kr'], 3: BASE.us, 4: ['kr', 'index', 'sector', 'bigtech', 'movers', 'news', 'tech'], 5: ['news', 'index', 'sector', 'bigtech', 'movers', 'tech', 'kr'] },
};
const Q = {
  kr: {
    index: ['오늘 코스피와 환율은 어떻게 움직였나', '코스피는 얼마나 움직였고 환율·금리는 어땠나', '오늘 시장 숫자는 어땠나'],
    flow: ['외국인·기관은 사고팔았나', '오늘 누가 주식을 사고 팔았나', '수급은 어느 쪽이 주도했나'],
    sector: ['어떤 업종이 강했고 약했나', '오늘 업종별로는 무엇이 달랐나', '업종 지도는 어떻게 그려졌나'],
    pick: ['오늘 눈에 띈 종목은 무엇인가', '어떤 종목이 시선을 끌었나', '주목받은 종목은 무엇이었나'],
    tech: ['코스피 차트는 지금 어디에 있나', '차트로 본 코스피는 어떤 모습인가', '코스피의 기술적 위치는 어디쯤인가'],
    next: ['내일은 무엇을 볼까', '내일 장에서 무엇을 확인할까', '내일 체크할 것은 무엇인가'],
  },
  us: {
    index: ['간밤 미국 지수는 어떻게 마감했나', '간밤 지수·금리·유가는 어땠나', '미국 시장 숫자는 어땠나'],
    sector: ['어떤 섹터가 올랐고 내렸나', '간밤 섹터 지도는 어땠나', '섹터별로는 무엇이 달랐나'],
    bigtech: ['빅테크는 어땠나', '빅테크 8종목은 어떻게 움직였나', '대형 기술주는 어디로 향했나'],
    movers: ['크게 움직인 대형주는 무엇인가', '어떤 대형주가 크게 움직였나', '간밤 변동이 컸던 종목은 무엇인가'],
    news: ['간밤 시장을 움직인 뉴스는 무엇인가', '무슨 소식이 시장에 영향을 줬나', '간밤 주요 뉴스는 무엇이었나'],
    tech: ['S&P 500 차트는 어디에 있나', '차트로 본 S&P 500은 어떤 모습인가', 'S&P 500의 기술적 위치는 어디쯤인가'],
    kr: ['오늘 국내 장에는 무엇이 영향을 줄까', '국내 장에서 무엇을 볼까', '오늘 한국 증시에서 확인할 것은 무엇인가'],
  },
};
const FNAME = ['기본', '수급/섹터 먼저', '업종/빅테크 먼저', '질문형 소제목', '숫자 3가지로 시작', '내일/뉴스 먼저'];

// 표의 한 줄 "이름 | 종가 | 증감 | 등락률" 찾기
function row(txt, name) {
  for (const line of txt.split(NL)) {
    const c = line.split('|').map(x => x.trim());
    if (c.length === 4 && c[0] === name) return { close: c[1], diff: c[2], rate: c[3] };
  }
  return null;
}
function barValue(txt, name) {
  for (const line of txt.split(NL)) {
    const c = line.split('|').map(x => x.trim());
    if (c.length === 2 && c[0] === name && /^[+\-−]?[\d,]+$/.test(c[1])) return c[1].replace('−', '-');
  }
  return null;
}
function numbers(mk, content) {
  const L = [];
  if (mk === 'kr') {
    const k = row(content, '코스피'), fx = row(content, '원·달러 환율'), f = barValue(content, '외국인');
    if (k) L.push('- 코스피: ' + k.close + ' 마감, 전일 대비 ' + k.rate);
    if (f) L.push('- 외국인: 코스피에서 ' + (f.startsWith('-') ? '순매도 ' + f.slice(1) : '순매수 ' + f.replace('+', '')) + '억 원');
    if (fx) L.push('- 원·달러 환율: ' + fx.close + ', 전일 대비 ' + fx.diff + '원');
  } else {
    const s = row(content, 'S&P 500'), sox = row(content, '필라델피아 반도체'), t = row(content, '미국 국채 10년');
    if (s) L.push('- S&P 500: ' + s.close + ' 마감, ' + s.rate);
    if (sox) L.push('- 필라델피아 반도체: ' + sox.close + ' 마감, ' + sox.rate);
    if (t) L.push('- 미국 국채 10년: 수익률 ' + t.close + ', 전일 대비 ' + t.diff);
  }
  return L.length === 3 ? L : null;
}
function restyle(p, n, mk) {
  const fmt = n % 6;
  let body = p.content.trim();
  const fi = body.lastIndexOf(NL + '※');
  const foot = fi >= 0 ? body.slice(fi + 1).trim() : '';
  if (fi >= 0) body = body.slice(0, fi).trim();
  const i0 = body.indexOf('■ ');
  if (i0 < 0) return { fmt, skip: '소제목 없음' };
  const pre = body.slice(0, i0).trim();
  const raw = body.slice(i0).split(new RegExp('^(?=■ )', 'm')).map(s => s.trim()).filter(Boolean);
  const secs = raw.map(s => { const h = s.split(NL)[0].slice(2).trim(); const k = KEYS[mk].find(([, re]) => re.test(h)); return { key: k && k[0], h, s }; });
  if (secs.some(x => !x.key) || new Set(secs.map(x => x.key)).size !== secs.length) return { fmt, skip: '소제목 분류 실패 ' + secs.map(x => x.h + '→' + x.key).join(' / ') };
  const by = Object.fromEntries(secs.map(x => [x.key, x]));
  const order = ORDER[mk][fmt].filter(k => by[k]);
  if (order.length !== secs.length) return { fmt, skip: '섹션 수 불일치' };
  const parts = [];
  if (fmt === 4) {
    const nm = numbers(mk, p.content);
    if (!nm) return { fmt, skip: '숫자 3개 추출 실패' };
    parts.push('■ ' + (mk === 'kr' ? '오늘의 숫자 3가지' : '간밤의 숫자 3가지') + NL + NL + nm.join(NL));
  }
  if (pre) parts.push(pre);
  for (const k of order) {
    let s = by[k].s;
    if (fmt === 3) { const v = Q[mk][k][Math.floor(n / 6) % 3]; const lines = s.split(NL); lines[0] = '■ ' + v; s = lines.join(NL); }
    parts.push(s);
  }
  if (foot) parts.push(foot);
  return { fmt, content: parts.join(NL + NL), order };
}

const posts = fs.readdirSync(B).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(B + f, 'utf8'))).sort((a, b) => a.ts - b.ts);
const cnt = { kr: 0, us: 0 };
const res = posts.map(p => { const mk = /미국 시황/.test(p.title) ? 'us' : 'kr'; const n = cnt[mk]++; return { p, mk, n, r: restyle(p, n, mk) }; });

// 검증: 소제목 줄과 추가한 숫자 3줄을 빼면, 줄 단위로 원본과 완전히 같은 내용이어야 함
const norm = t => t.split(NL).map(l => l.trim()).filter(l => l && !l.startsWith('■ ')).sort().join(NL);
let bad = 0;
for (const x of res) {
  if (x.r.skip) { bad++; console.log('SKIP', x.p.id, x.p.title.slice(0, 20), x.r.skip); continue; }
  const a = norm(x.p.content);
  let bl = norm(x.r.content).split(NL);
  if (x.r.fmt === 4) { const nm = numbers(x.mk, x.p.content); bl = bl.filter(l => !nm.includes(l)); }
  if (a !== bl.join(NL)) { bad++; console.log('MISMATCH', x.p.id, x.p.title.slice(0, 20)); }
  if (x.r.content.length < x.p.content.length - 5) { bad++; console.log('SHORTER', x.p.id); }
}
res.forEach(x => console.log(x.p.id.slice(0, 8), x.mk, FNAME[x.r.fmt], (x.r.order || []).join('>') || x.r.skip, '|', x.p.title.slice(0, 22)));
console.log('검증 실패/건너뜀:', bad, '/', res.length);
const show = process.argv.find(a => a.startsWith('--show='));
if (show) for (const x of res.filter(y => y.p.id.startsWith(show.slice(7)))) console.log(NL + '=== ' + x.p.title + NL + x.r.content.split(NL).filter(l => !/^\d\d\/\d\d \|/.test(l)).slice(0, 40).join(NL));

if (apply && bad === 0) {
  const env = Object.fromEntries(fs.readFileSync('D:/claude/homepage/.dev.vars', 'utf8').split(new RegExp('\\r?\\n')).filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(new RegExp('^["\']|["\']$', 'g'), '')]; }));
  const r = async c => (await fetch(env.KV_REST_API_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + env.KV_REST_API_TOKEN }, body: JSON.stringify(c) })).json();
  for (const x of res) {
    if (x.r.fmt === 0) continue;
    const [{ result }] = await r([['GET', 'post:' + x.p.id]]);
    const cur = JSON.parse(result);
    if (cur.content !== x.p.content) { console.log('운영 본문이 백업과 다름 — 건너뜀', x.p.id); continue; }
    cur.content = x.r.content;
    const [{ result: s }] = await r([['SET', 'post:' + x.p.id, JSON.stringify(cur)]]);
    console.log('반영', x.p.id, s);
  }
}
