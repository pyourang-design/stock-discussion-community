// 주식 강의 'ETF 투자' 시리즈 글 아래에 붙이는 업종닷컴 데이터 (2026-11-04, api/_colData.js에서 부름)
//   미국 주식 탭의 ETF 25개(stocks.js, 한국예탁결제원 국내 투자자 보관금액 기준 선정)를 글 주제별로 골라 표로
//   국내 ETF(KODEX·TIGER 등)는 사이트에 데이터가 없어 넣지 않음
import { STOCKS, US_AS_OF } from './_stocks.js';

// 티커 → 운용사 · 추종 대상 · 유형 (배수: 2 = 2배, -3 = 인버스 3배)
const META = {
  QQQ: ['Invesco', '나스닥100 지수', '지수 추종'], QQQM: ['Invesco', '나스닥100 지수', '지수 추종'],
  VOO: ['Vanguard', 'S&P500 지수', '지수 추종'], SPY: ['State Street (SPDR)', 'S&P500 지수', '지수 추종'],
  SPYM: ['State Street (SPDR)', 'S&P500 지수', '지수 추종'], IVV: ['BlackRock (iShares)', 'S&P500 지수', '지수 추종'],
  SOXL: ['Direxion', '미국 반도체 지수', '레버리지', 3], SOXS: ['Direxion', '미국 반도체 지수', '인버스', -3],
  TQQQ: ['ProShares', '나스닥100 지수', '레버리지', 3], QLD: ['ProShares', '나스닥100 지수', '레버리지', 2],
  TSLL: ['Direxion', '테슬라 한 종목', '레버리지', 2], NVDL: ['GraniteShares', '엔비디아 한 종목', '레버리지', 2],
  KORU: ['Direxion', 'MSCI 한국 지수', '레버리지', 3], ETHU: ['Volatility Shares', '이더리움 선물', '레버리지', 2],
  TMF: ['Direxion', '미국 20년 이상 국채', '레버리지', 3],
  SCHD: ['Charles Schwab', '미국 배당 성장주 100종목', '배당'],
  JEPQ: ['JPMorgan', '나스닥100 + 커버드콜', '커버드콜'], JEPI: ['JPMorgan', 'S&P500 + 커버드콜', '커버드콜'],
  QQQI: ['NEOS', '나스닥100 + 커버드콜', '커버드콜'],
  SOXX: ['BlackRock (iShares)', '미국 반도체 지수', '섹터'], SMH: ['VanEck', '미국 반도체 지수', '섹터'],
  DRAM: ['Roundhill', '메모리 반도체 기업', '섹터'],
  SGOV: ['BlackRock (iShares)', '미국 국채 0~3개월', '채권'], TLT: ['BlackRock (iShares)', '미국 20년 이상 국채', '채권'],
  GLD: ['State Street (SPDR)', '금 현물', '금'],
};
const ETFS = STOCKS.filter(s => s.etf && META[s.ticker]).map(s => {
  const [mgr, track, type, x] = META[s.ticker];
  return { ...s, mgr, track, type, x: x || 1, hold: s.sectors.usa.hold || null, amt: s.sectors.usa.amt || '' };
}).sort((a, b) => (a.hold || 999) - (b.hold || 999) || (a.sectors.usa.sel || 999) - (b.sectors.usa.sel || 999));

const byTicker = list => list.map(t => ETFS.find(e => e.ticker === t)).filter(Boolean);
const typeLabel = e => e.x === 1 ? e.type : e.x > 0 ? `${e.type} ${e.x}배` : `${e.type} ${-e.x}배`;
const holdLabel = e => e.hold ? `${e.hold}위 · ${e.amt}` : 'TOP 50 밖';

// 표: cols에서 고른 칸만
const COLS = {
  etf: ['ETF', (e, esc) => `<th><a href="/stock/${esc(e.code)}">${esc(e.ticker)}</a><br><small>${esc(e.name)}</small></th>`],
  mgr: ['운용사', (e, esc) => `<td>${esc(e.mgr)}</td>`],
  track: ['추종 대상', (e, esc) => `<td>${esc(e.track)}</td>`],
  type: ['유형', (e, esc) => `<td>${esc(typeLabel(e))}</td>`],
  hold: ['국내 보관 (순위 · 금액)', (e, esc) => `<td>${esc(holdLabel(e))}</td>`],
  cap: ['규모 (원화 환산)', (e, esc) => `<td>${esc(e.cap || '-')}</td>`],
};
function etfTable(title, list, cols, esc) {
  if (!list.length) return '';
  return `<div class="ai-table-wrap"><div class="ai-table-title">${esc(title)} <span>${US_AS_OF} 기준</span></div>
  <table class="ai-table col-data-table col-etf-table"><thead><tr>${cols.map(c => `<th>${COLS[c][0]}</th>`).join('')}</tr></thead>
  <tbody>${list.map(e => `<tr>${cols.map(c => COLS[c][1](e, esc)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const ALL = ['etf', 'mgr', 'track', 'type', 'hold', 'cap'];
// 제목 앞부분 → 표 목록 [제목, ETF 목록, 칸]
const GUIDES = [
  [/^ETF란 무엇인가/, () => [['국내 투자자가 가장 많이 보유한 미국 ETF 10', ETFS.filter(e => e.hold).slice(0, 10), ['etf', 'track', 'type', 'hold']]]],
  [/^ETF 이름 읽는 법/, () => [['이름으로 읽는 미국 ETF: 운용사 · 추종 대상 · 배수', ETFS, ['etf', 'mgr', 'track', 'type']]]],
  [/^지수 추종 ETF/, () => [
    ['S&P500 지수를 따라가는 ETF', byTicker(['VOO', 'SPY', 'IVV', 'SPYM']), ['etf', 'mgr', 'hold', 'cap']],
    ['나스닥100 지수를 따라가는 ETF', byTicker(['QQQ', 'QQQM']), ['etf', 'mgr', 'hold', 'cap']]]],
  [/^좋은 ETF 고르는 기준/, () => [['같은 지수, 다른 ETF: 규모와 국내 보관금액 비교', byTicker(['VOO', 'IVV', 'SPY', 'SPYM', 'QQQ', 'QQQM']), ['etf', 'mgr', 'track', 'hold', 'cap']]]],
  [/^레버리지·인버스 ETF/, () => [['국내 투자자가 많이 보유한 레버리지·인버스 ETF', ETFS.filter(e => e.x !== 1), ['etf', 'track', 'type', 'hold', 'cap']]]],
  [/^섹터·테마 ETF/, () => [['국내 투자자가 많이 보유한 섹터 ETF', ETFS.filter(e => e.type === '섹터'), ['etf', 'mgr', 'track', 'hold', 'cap']]]],
  [/^배당·커버드콜 ETF/, () => [['국내 투자자가 많이 보유한 배당·커버드콜 ETF', ETFS.filter(e => e.type === '배당' || e.type === '커버드콜'), ['etf', 'mgr', 'track', 'type', 'hold', 'cap']]]],
  [/^채권·금·달러 ETF/, () => [['국내 투자자가 많이 보유한 채권·금 ETF', ETFS.filter(e => e.type === '채권' || e.type === '금' || e.track.includes('국채')), ['etf', 'track', 'type', 'hold', 'cap']]]],
];

// 총정리: 유형별 개수 · TOP 50 안 보관금액 합
function summaryTable(esc) {
  const amtNum = a => parseFloat(String(a).replace(/[^\d.]/g, '')) || 0;
  const groups = new Map();
  for (const e of ETFS) {
    const k = e.x !== 1 ? '레버리지·인버스' : e.type === '배당' || e.type === '커버드콜' ? '배당·커버드콜' : e.type === '채권' || e.type === '금' ? '채권·금' : e.type === '섹터' ? '섹터' : '지수';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const rows = [...groups].map(([k, list]) => ({ k, list, sum: list.reduce((a, e) => a + (e.hold ? amtNum(e.amt) : 0), 0) })).sort((a, b) => b.sum - a.sum);
  return `<div class="ai-table-wrap"><div class="ai-table-title">국내 투자자 보유 상위 미국 ETF ${ETFS.length}개, 유형별로 나누면 <span>${US_AS_OF} 기준</span></div>
  <table class="ai-table col-data-table"><thead><tr><th>유형</th><th>개수</th><th>보관금액 합 (TOP 50 안)</th><th>ETF</th></tr></thead>
  <tbody>${rows.map(r => `<tr><th>${esc(r.k)}</th><td>${r.list.length}개</td><td>${r.sum ? r.sum.toFixed(1) + '억달러' : '-'}</td><td style="text-align:left;white-space:normal">${r.list.map(e => `<a href="/stock/${esc(e.code)}">${esc(e.ticker)}</a>`).join(', ')}</td></tr>`).join('')}</tbody></table></div>`;
}

const wrap = (inner, esc) => `<section class="sp-section col-data"><h2>업종닷컴 데이터로 보기</h2>
  <p class="sp-note">업종닷컴 미국 주식 탭에 있는 ETF입니다. 한국예탁결제원이 공개하는 국내 투자자 미국 주식 보관금액 TOP 50(${esc(US_AS_OF)} 기준)을 바탕으로 골랐고, 50위 밖은 최근 1년 결제·보관 상위 목록에 자주 오른 ETF입니다. ETF 이름을 누르면 시세와 토론을 볼 수 있습니다.</p>
  ${inner}
  <p class="sp-note">규모는 원화로 환산한 대략의 값입니다. 운용사·추종 대상은 ETF 이름과 운용사 설명을 정리한 것이며 투자 권유가 아닙니다.</p></section>`;

export function etfDataHtml(title, esc) {
  if (/^ETF 총정리/.test(title)) return wrap(summaryTable(esc), esc);
  const hit = GUIDES.find(([re]) => re.test(title));
  if (!hit) return null;
  const inner = hit[1]().map(([t, list, cols]) => etfTable(t, list, cols, esc)).join('');
  return inner ? wrap(inner, esc) : null;
}
