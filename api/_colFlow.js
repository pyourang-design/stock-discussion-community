// 주식 강의 '시장 구조·수급' 시리즈 글 아래에 붙이는 업종닷컴 데이터 (2026-11-05, api/_colData.js에서 부름)
//   ① 코스피·코스닥: 국내 업종 탭 종목의 시장별 개수 (stocks.js)
//   ⑤ 수급 읽는 법 · ⑩ 총정리: 최근 국내 시황 글의 '코스피 투자자별 순매수' 막대 표 + 핫이슈 장 마감 계산(hot:cur:d)의 외국인·기관 연속 순매수 종목
//   ②③④⑥⑦⑧⑨는 맞는 데이터가 없어 안 붙임
import { redis, dbReady } from './_redis.js';
import { STOCKS, SECTORS, STOCKS_AS_OF } from './_stocks.js';

const DAYS = 10;        // 투자자별 순매수 표 거래일 수
const SCAN_SIHWANG = 60; // 시황 게시판 최근 글 중 찾을 범위 (국내·미국 시황이 섞여 있음)

// 시황 본문의 [막대:코스피 투자자별 순매수 (억 원)] 개인 | +400 ... [/막대] → { 개인, 외국인, 기관 }
const toNum = v => Number(String(v).replace(/[,+\s]/g, '').replace('−', '-'));
function parseFlow(content) {
  const m = String(content || '').match(/\[막대:코스피 투자자별 순매수[^\]]*\]([\s\S]*?)\[\/막대\]/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const [k, v] = line.split('|').map(x => x?.trim());
    if (['개인', '외국인', '기관'].includes(k) && Number.isFinite(toNum(v))) out[k] = toNum(v);
  }
  return Object.keys(out).length === 3 ? out : null;
}

// 최근 국내 시황 글 → [{ date: '11/04', 개인, 외국인, 기관 }] (최신 먼저, 같은 날짜는 하나만)
async function recentFlows() {
  const [ids] = await redis([['LRANGE', 'posts:COLNEWS', 0, SCAN_SIHWANG - 1]]);
  if (!ids?.length) return [];
  const [raws] = await redis([['MGET', ...ids.map(id => `post:${id}`)]]);
  const seen = new Set(), rows = [];
  for (const p of (raws || []).filter(Boolean).map(r => JSON.parse(r)).filter(p => !p.blind && /국내 시황/.test(p.title)).sort((a, b) => b.ts - a.ts)) {
    const date = (String(p.title).match(/^(\d{1,2}\/\d{1,2})/) || [])[1];
    const f = date && !seen.has(date) && parseFlow(p.content);
    if (!f) continue;
    seen.add(date);
    rows.push({ date, id: p.id, ...f });
    if (rows.length >= DAYS) break;
  }
  return rows;
}

// 핫이슈 장 마감 계산 → { date, foreign: [{ code, name, desc, val }], organ: [...] }
async function streaks() {
  const [raw] = await redis([['GET', 'hot:cur:d']]);
  if (!raw) return null;
  const h = JSON.parse(raw);
  const list = key => (h.hits?.[key] || []).map(([code, desc, val]) => ({ code, desc, val, name: h.stocks?.[code]?.n || STOCKS.find(s => s.code === code)?.name || code }))
    .sort((a, b) => b.val - a.val);
  return { date: h.date, foreign: list('foreign'), organ: list('organ') };
}

const fmt = n => `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
const cls = n => n > 0 ? 'up' : n < 0 ? 'down' : '';
const ymdLabel = d => d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : '';

function flowTable(rows, esc) {
  if (!rows.length) return '';
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const cells = r => ['개인', '외국인', '기관'].map(k => `<td class="${cls(r[k])}">${fmt(r[k])}</td>`).join('');
  return `<div class="ai-table-wrap"><div class="ai-table-title">최근 ${rows.length}거래일 코스피 투자자별 순매수 (억 원) <span>${esc(rows.at(-1).date)} ~ ${esc(rows[0].date)}</span></div>
  <table class="ai-table col-data-table"><thead><tr><th>날짜</th><th>개인</th><th>외국인</th><th>기관</th></tr></thead>
  <tbody>${rows.map(r => `<tr><th><a href="/sihwang/${esc(r.id)}">${esc(r.date)}</a></th>${cells(r)}</tr>`).join('')}
  <tr><th>합계</th>${cells({ 개인: sum('개인'), 외국인: sum('외국인'), 기관: sum('기관') })}</tr></tbody></table></div>`;
}

function streakTable(who, list, date, n, esc) {
  if (!list.length) return '';
  return `<div class="ai-table-wrap"><div class="ai-table-title">${who} 5거래일 이상 연속 순매수 종목 (금액 순 ${Math.min(n, list.length)}개) <span>${esc(ymdLabel(date))} 장 마감 기준</span></div>
  <table class="ai-table col-data-table"><thead><tr><th>종목</th><th>연속 일수 · 순매수 금액</th></tr></thead>
  <tbody>${list.slice(0, n).map(s => `<tr><th><a href="/stock/${esc(s.code)}">${esc(s.name)}</a></th><td>${esc(s.desc.replace(`${who} `, ''))}</td></tr>`).join('')}</tbody></table></div>`;
}

// ① 국내 업종 탭 종목을 코스피·코스닥으로 나눈 표
function marketTable(esc) {
  const rows = SECTORS.filter(s => s.key !== 'usa').map(sec => {
    const list = STOCKS.filter(s => s.sectors?.[sec.key] && !s.us);
    const n = m => list.filter(s => s.market === m).length;
    return { sec, kospi: n('kospi'), kosdaq: n('kosdaq') };
  }).filter(r => r.kospi + r.kosdaq);
  const tot = m => STOCKS.filter(s => !s.us && s.market === m).length;
  return `<div class="ai-table-wrap"><div class="ai-table-title">업종닷컴 국내 업종 탭 종목, 코스피·코스닥으로 나누면 <span>${esc(STOCKS_AS_OF)} 기준</span></div>
  <table class="ai-table col-data-table"><thead><tr><th>업종</th><th>코스피</th><th>코스닥</th></tr></thead>
  <tbody>${rows.map(r => `<tr><th><a href="/?sector=${esc(r.sec.key)}">${esc(r.sec.name)}</a></th><td>${r.kospi}개</td><td>${r.kosdaq}개</td></tr>`).join('')}
  <tr><th>전체 (중복 제외)</th><td>${tot('kospi')}개</td><td>${tot('kosdaq')}개</td></tr></tbody></table></div>`;
}

const wrap = (note, inner, foot) => `<section class="sp-section col-data"><h2>업종닷컴 데이터로 보기</h2>
  <p class="sp-note">${note}</p>
  ${inner}
  <p class="sp-note">${foot}</p></section>`;
const FLOW_NOTE = '업종닷컴 주식 시황에 매일 정리하는 코스피 투자자별 순매수와, 장 마감 후 계산하는 핫이슈 종목의 외국인·기관 연속 순매수입니다. 날짜를 누르면 그날 시황, 종목 이름을 누르면 시세와 토론을 볼 수 있습니다.';
const FLOW_FOOT = '순매수 금액은 네이버 증권 투자자별 매매동향을 정리한 것이며(종목 금액은 수량 × 그날 종가로 계산한 대략의 값) 투자 권유가 아닙니다.';

async function flowHtml(n, esc) {
  if (!dbReady()) return '';
  const [rows, st] = await Promise.all([recentFlows().catch(() => []), streaks().catch(() => null)]);
  const inner = flowTable(rows, esc) + (st ? streakTable('외국인', st.foreign, st.date, n, esc) + streakTable('기관', st.organ, st.date, n, esc) : '');
  return inner ? wrap(FLOW_NOTE, inner, FLOW_FOOT) : '';
}

// 칼럼 제목에 맞는 수급 데이터 칸 HTML (해당 없는 제목이면 null)
export async function flowDataHtml(title, esc) {
  if (/^코스피·코스닥·코넥스 차이/.test(title)) return wrap(`업종닷컴 업종 게시판에 있는 국내 종목이 어느 시장에 상장돼 있는지 나눠 본 표입니다. 업종 이름을 누르면 그 업종 게시판으로 갑니다.`, marketTable(esc), '한 종목이 여러 업종 탭에 들어 있을 수 있어 업종별 개수의 합은 전체보다 많습니다. 코넥스 종목은 업종닷컴에 없습니다.');
  if (/^외국인·기관·개인 수급 읽는 법/.test(title)) return flowHtml(5, esc);
  if (/^수급으로 시장 읽기 총정리/.test(title)) return flowHtml(10, esc);
  return null;
}
