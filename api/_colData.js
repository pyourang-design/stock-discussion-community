// 주식 강의 '업종별 투자 가이드' 글 아래에 붙이는 업종닷컴 데이터 (2026-11-04, 애드센스·색인 대비)
//   글 제목으로 업종 탭을 찾아(SECTOR_GUIDES) 그 탭의 시가총액 상위 종목 + 최근 DART 실적(AI 운영자 실적 글의 요약)을 표로
//   칼럼 본문(DB)은 그대로 두고 /column/{id} 화면에서만 덧붙임 — 다른 시리즈도 여기 규칙만 추가하면 됨
import { redis, dbReady } from './_redis.js';
import { STOCKS, SECTORS, STOCKS_AS_OF } from './_stocks.js';

const TOP_N = 8;
const SCAN_POSTS = 60;  // 종목 게시판 최근 글 중 AI 실적 글을 찾을 범위

// 제목 앞부분 → 업종 탭 key (여러 개면 탭마다 표 하나)
const SECTOR_GUIDES = [
  [/^반도체 업종/, ['semi']],
  [/^2차전지/, ['battery']],
  [/^자동차/, ['auto']],
  [/^바이오/, ['bio']],
  [/^인터넷·게임/, ['telecom']],
  [/^금융 업종/, ['finance']],
  [/^조선·방산/, ['ship', 'logistics']],
  [/^소재 업종/, ['chem']],
  [/^소비재 업종/, ['consumer', 'kbeauty']],
];
const isSectorSummary = t => /^업종별 투자 가이드 총정리/.test(t);

const sectorName = key => SECTORS.find(s => s.key === key)?.name || key;
const topOf = (key, n) => STOCKS.filter(s => s.sectors?.[key]).sort((a, b) => a.sectors[key].cap - b.sectors[key].cap).slice(0, n);

// AI 운영자 실적 글의 표(tables)에서 최근 기간 매출·영업이익 (예전 글은 summary가 없어 표를 기준으로)
//   '올해 누적 (1~6월)' 표가 있으면 그것, 없으면 '연간 실적' 표의 마지막 해
export function fromTables(tables) {
  const t = (tables || []).find(x => /누적/.test(x.title)) || (tables || []).find(x => /연간/.test(x.title)) || (tables || [])[0];
  if (!t?.cols?.length || !t.rows?.length) return null;
  const hasChg = t.cols.at(-1) === '증감';
  const vi = t.cols.length - (hasChg ? 2 : 1);
  const cell = c => (c && typeof c === 'object' ? c.t : String(c ?? '')).trim();
  const val = name => {
    const r = t.rows.find(x => cell(x[0]) === name);
    if (!r) return '';
    const v = cell(r[vi]);
    return v ? `${v}${/^[-−]?[\d,.]+$/.test(v) ? t.unit : ''}${hasChg && cell(r.at(-1)) ? ` (${cell(r.at(-1))})` : ''}` : '';
  };
  const range = (String(t.title).match(/\(([^)]+)\)/) || [])[1];
  const year = cell(t.cols[vi]);
  return { period: range ? `${year} ${range}` : year, sales: val('매출액') || val('매출') || val('영업수익'), op: val('영업이익') };
}
// 표가 없는 글: 요약 '올해 1~6월 · 매출 9조 원 (+8.0%) · 영업이익 5,478억 원 (+32.4%)'
export function fromSummary(s) {
  const parts = String(s || '').split(' · ').map(x => x.trim()).filter(Boolean);
  const pick = re => (parts.find(x => re.test(x)) || '').replace(re, '').trim();
  return parts.length ? { period: parts[0], sales: pick(/^매출(액)?/), op: pick(/^영업(이익|손실)/) } : null;
}

// 종목별 최신 AI 실적 글 (블라인드 제외) → Map(code → { period, sales, op, ts })
async function latestEarnings(codes) {
  if (!dbReady() || !codes.length) return new Map();
  const lists = await redis(codes.map(c => ['LRANGE', `posts:${c}`, 0, SCAN_POSTS - 1]));
  const ids = [...new Set(lists.flatMap(l => l || []))];
  if (!ids.length) return new Map();
  const raws = [];
  for (let i = 0; i < ids.length; i += 300) raws.push(...(((await redis([['MGET', ...ids.slice(i, i + 300).map(id => `post:${id}`)]]))[0]) || []));
  const best = new Map();
  for (const r of raws) {
    if (!r) continue;
    const p = JSON.parse(r);
    if (!p.ai || p.blind || !codes.includes(p.code)) continue;
    const e = fromTables(p.tables) || fromSummary(p.summary);
    if (!e || !(e.sales || e.op)) continue;
    if (!best.has(p.code) || best.get(p.code).ts < p.ts) best.set(p.code, { ...e, ts: p.ts });
  }
  return best;
}

const chgClass = t => /\(\+|흑자/.test(t) ? 'up' : /\(−|\(-|적자/.test(t) ? 'down' : '';

function sectorTable(key, rows, earn, esc) {
  const body = rows.map(s => {
    const e = earn.get(s.code);
    return `<tr><th><a href="/stock/${esc(s.code)}">${esc(s.name)}</a></th><td>${esc(s.cap || '-')}</td>${e
      ? `<td>${esc(e.period)}</td><td class="${chgClass(e.sales)}">${esc(e.sales || '-')}</td><td class="${chgClass(e.op)}">${esc(e.op || '-')}</td>`
      : '<td colspan="3" class="muted">실적 정리 전</td>'}</tr>`;
  }).join('');
  return `<div class="ai-table-wrap"><div class="ai-table-title">${esc(sectorName(key))} 업종 시가총액 상위 ${rows.length}종목 <span>시가총액 ${STOCKS_AS_OF} 기준</span></div>
  <table class="ai-table col-data-table"><thead><tr><th>종목</th><th>시가총액</th><th>실적 기간</th><th>매출 (전년 대비)</th><th>영업이익 (전년 대비)</th></tr></thead><tbody>${body}</tbody></table>
  <p class="col-data-more"><a href="/?sector=${esc(key)}">${esc(sectorName(key))} 업종 게시판에서 전체 종목·토론 보기 →</a></p></div>`;
}

// 칼럼 제목에 맞는 데이터 칸 HTML (해당 없으면 '')
export async function columnDataHtml(title, esc) {
  title = String(title || '');
  if (isSectorSummary(title)) {
    const items = SECTORS.filter(s => s.key !== 'usa').map(s => `<tr><th><a href="/?sector=${esc(s.key)}">${esc(s.name)}</a></th><td style="text-align:left;white-space:normal">${topOf(s.key, 3).map(x => `<a href="/stock/${esc(x.code)}">${esc(x.name)}</a>`).join(', ')}</td></tr>`).join('');
    return `<section class="sp-section col-data"><h2>업종닷컴 업종 게시판 한눈에 보기</h2>
  <p class="sp-note">업종닷컴의 국내 업종 탭과 탭별 시가총액 상위 3종목입니다 (${STOCKS_AS_OF} 기준). 업종 이름을 누르면 그 업종 게시판으로 갑니다.</p>
  <div class="ai-table-wrap"><table class="ai-table col-data-table"><thead><tr><th>업종</th><th>시가총액 상위 종목</th></tr></thead><tbody>${items}</tbody></table></div></section>`;
  }
  const hit = SECTOR_GUIDES.find(([re]) => re.test(title));
  if (!hit) return '';
  const groups = hit[1].map(key => [key, topOf(key, TOP_N)]).filter(([, rows]) => rows.length);
  if (!groups.length) return '';
  const earn = await latestEarnings(groups.flatMap(([, rows]) => rows.map(s => s.code))).catch(() => new Map());
  return `<section class="sp-section col-data"><h2>업종닷컴 데이터로 보기</h2>
  <p class="sp-note">위 글에서 설명한 업종의 실제 종목입니다. 실적은 각 회사가 DART에 낸 최근 정기 보고서(사업·반기·분기)의 누적 숫자이며, 종목 이름을 누르면 실적 표 전체와 토론을 볼 수 있습니다.</p>
  ${groups.map(([key, rows]) => sectorTable(key, rows, earn, esc)).join('')}
  <p class="sp-note">숫자는 DART 공시를 프로그램으로 정리한 것이며 투자 권유가 아닙니다.</p></section>`;
}
