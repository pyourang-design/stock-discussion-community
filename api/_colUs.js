// 주식 강의 '해외 주식' 시리즈 글 아래에 붙이는 업종닷컴 데이터 (2026-11-05, api/_colData.js에서 부름)
//   미국 주식 탭 종목 39개 + ETF 25개(stocks.js, 한국예탁결제원 국내 투자자 보관금액 기준 선정)를 글 주제별로 골라 표로
//   ③ 계좌·환전 ④ 세금 ⑤ 공시는 맞는 데이터가 없어 안 붙임
import { STOCKS, US_AS_OF } from './_stocks.js';

// 티커 → 분야 · 한 줄 설명 · 본사 나라(미국 밖만)
const META = {
  NVDA: ['빅테크', 'AI 반도체(GPU)'], AAPL: ['빅테크', '아이폰·맥·서비스'], MSFT: ['빅테크', '윈도·오피스·애저 클라우드'],
  GOOGL: ['빅테크', '구글 검색·유튜브·클라우드'], GOOG: ['빅테크', '구글 검색·유튜브·클라우드 (의결권 없는 주식)'],
  AMZN: ['빅테크', '전자상거래·AWS 클라우드'], META: ['빅테크', '페이스북·인스타그램'], TSLA: ['빅테크', '전기차·에너지 저장·자율주행'],
  AVGO: ['반도체', '네트워크 반도체·맞춤형 AI 칩'], MU: ['반도체', '메모리(D램·낸드)'], SNDK: ['반도체', '낸드 플래시'],
  AMD: ['반도체', 'CPU·GPU'], TSM: ['반도체', '파운드리(위탁 생산)', '대만'], INTC: ['반도체', 'CPU·파운드리'],
  MRVL: ['반도체', '데이터센터 반도체·맞춤형 칩'], ASML: ['반도체', '노광 장비(EUV)', '네덜란드'],
  LRCX: ['반도체', '식각·증착 장비'], AMAT: ['반도체', '증착 등 반도체 장비'], SKHY: ['반도체', '메모리(HBM·D램)', '한국'],
  LITE: ['반도체', '광통신 부품'],
  PLTR: ['AI·소프트웨어', '데이터 분석 플랫폼'], ORCL: ['AI·소프트웨어', '데이터베이스·클라우드'], PANW: ['AI·소프트웨어', '사이버 보안'],
  NBIS: ['AI·소프트웨어', 'AI 클라우드(GPU 임대)', '네덜란드'], IREN: ['AI·소프트웨어', 'AI 데이터센터·비트코인 채굴', '호주'],
  IONQ: ['양자컴퓨터', '이온 트랩 양자컴퓨터'], RGTI: ['양자컴퓨터', '초전도 양자컴퓨터'],
  SPCX: ['우주·항공', '로켓 발사·스타링크 위성 통신'], RKLB: ['우주·항공', '소형 로켓·위성 부품'], JOBY: ['우주·항공', '전기 수직이착륙기(에어택시)'],
  MSTR: ['가상자산', '비트코인 보유 기업'], BMNR: ['가상자산', '이더리움 보유 기업'], CRCL: ['가상자산', '스테이블코인(USDC) 발행'],
  BE: ['에너지·전력', '연료전지 발전'], SMR: ['에너지·전력', '소형모듈원전(SMR)'],
  'BRK B': ['금융', '워런 버핏의 지주회사'], UNH: ['헬스케어', '건강보험·의료 서비스'],
  O: ['리츠', '상업용 부동산 임대 (월 배당)'], CPNG: ['유통', '전자상거래 (한국 사업 중심)'],
};
// 이 시리즈 표에 나오는 ETF 설명 (전체 ETF 메타는 api/_colEtf.js)
const ETF_DESC = { SCHD: '미국 배당 성장주 100종목', JEPQ: '나스닥100 + 커버드콜', JEPI: 'S&P500 + 커버드콜', QQQI: '나스닥100 + 커버드콜', KORU: 'MSCI 한국 지수 3배 레버리지' };
const MARKET = { nasdaq: '나스닥', nyse: '뉴욕증권거래소', amex: 'NYSE 아카' };
const US = STOCKS.filter(s => s.sectors?.usa).map(s => {
  const u = s.sectors.usa, m = META[s.ticker] || [];
  return { ...s, field: s.etf ? 'ETF' : m[0] || '기타', desc: m[1] || ETF_DESC[s.ticker] || '', country: m[2] || '', hold: u.hold || null, amt: u.amt || '' };
}).sort((a, b) => (a.hold || 999) - (b.hold || 999) || (a.sectors.usa.sel || 999) - (b.sectors.usa.sel || 999));
const STK = US.filter(s => !s.etf);
const amtNum = a => parseFloat(String(a).replace(/[^\d.]/g, '')) || 0;  // '89.9억달러' → 89.9
const byTicker = list => list.map(t => US.find(s => s.ticker === t)).filter(Boolean);

const COLS = {
  name: ['종목', (s, esc) => `<th><a href="/stock/${esc(s.code)}">${esc(s.name)}</a><br><small>${esc(s.ticker)}</small></th>`],
  field: ['분야', (s, esc) => `<td>${esc(s.field)}</td>`],
  desc: ['하는 일', (s, esc) => `<td style="white-space:normal">${esc(s.desc || '-')}</td>`],
  market: ['거래소', (s, esc) => `<td>${esc(MARKET[s.market] || s.market)}</td>`],
  country: ['본사', (s, esc) => `<td>${esc(s.country || '미국')}</td>`],
  hold: ['국내 보관 (순위 · 금액)', (s, esc) => `<td>${esc(s.hold ? `${s.hold}위 · ${s.amt}` : 'TOP 50 밖')}</td>`],
  cap: ['시가총액 (원화 환산)', (s, esc) => `<td>${esc(s.cap || '-')}</td>`],
  pay: ['배당 주기', (s, esc) => `<td>${esc(PAY[s.ticker] || '-')}</td>`],
};
const PAY = { O: '매월', SCHD: '분기', JEPI: '매월', JEPQ: '매월', QQQI: '매월', AAPL: '분기', MSFT: '분기', AVGO: '분기', 'BRK B': '배당 없음' };

const tableWrap = (title, head, body, esc) => `<div class="ai-table-wrap"><div class="ai-table-title">${esc(title)} <span>${US_AS_OF} 기준</span></div>
  <table class="ai-table col-data-table">${head}<tbody>${body}</tbody></table></div>`;
function usTable(title, list, cols, esc) {
  if (!list.length) return '';
  return tableWrap(title, `<thead><tr>${cols.map(c => `<th>${COLS[c][0]}</th>`).join('')}</tr></thead>`,
    list.map(s => `<tr>${cols.map(c => COLS[c][1](s, esc)).join('')}</tr>`).join(''), esc);
}
const links = (list, esc) => list.map(s => `<a href="/stock/${esc(s.code)}">${esc(s.ticker)}</a>`).join(', ');

// 묶음별 개수 · TOP 50 안 보관금액 합 표
function groupTable(title, keyOf, first, esc) {
  const groups = new Map();
  for (const s of US) { const k = keyOf(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const rows = [...groups].map(([k, list]) => ({ k, list, sum: list.reduce((a, s) => a + (s.hold ? amtNum(s.amt) : 0), 0) })).sort((a, b) => b.sum - a.sum);
  return tableWrap(title, `<thead><tr><th>${esc(first)}</th><th>개수</th><th>보관금액 합 (TOP 50 안)</th><th>종목</th></tr></thead>`,
    rows.map(r => `<tr><th>${esc(r.k)}</th><td>${r.list.length}개</td><td>${r.sum ? r.sum.toFixed(1) + '억달러' : '-'}</td><td style="text-align:left;white-space:normal">${links(r.list, esc)}</td></tr>`).join(''), esc);
}

// 환율 예시: 보관 상위 5종목의 달러 보관금액을 환율별 원화로 (단순 곱셈)
const RATES = [1300, 1400, 1500];
function fxTable(esc) {
  const top = STK.filter(s => s.hold).slice(0, 5);
  const won = (usd100m, r) => { const jo = usd100m * r / 10000; return jo >= 1 ? `${jo.toFixed(1)}조 원` : `${Math.round(jo * 10000).toLocaleString()}억 원`; };
  return tableWrap('같은 달러 금액, 환율에 따라 달라지는 원화 평가액 (국내 투자자 보관 상위 5종목)',
    `<thead><tr><th>종목</th><th>보관금액 (달러)</th>${RATES.map(r => `<th>환율 ${r.toLocaleString()}원일 때</th>`).join('')}</tr></thead>`,
    top.map(s => `<tr><th><a href="/stock/${esc(s.code)}">${esc(s.name)}</a></th><td>${esc(s.amt)}</td>${RATES.map(r => `<td>${won(amtNum(s.amt), r)}</td>`).join('')}</tr>`).join(''), esc);
}

const FIELD_ORDER = ['빅테크', '반도체', 'AI·소프트웨어', '양자컴퓨터', '우주·항공', '가상자산', '에너지·전력'];
const GUIDES = [
  [/^해외 주식을 왜 사야/, esc => usTable('국내 투자자가 가장 많이 보유한 미국 주식 10', STK.filter(s => s.hold).slice(0, 10), ['name', 'field', 'desc', 'hold', 'cap'], esc)],
  [/^미국 주식시장 구조/, esc => groupTable('업종닷컴 미국 주식 탭 종목, 거래소별로 나누면', s => MARKET[s.market] || s.market, '거래소', esc)
    + usTable('국내 투자자 보관 상위 10 (ETF 포함), 어느 거래소에 상장돼 있나', US.filter(s => s.hold).slice(0, 10), ['name', 'market', 'field', 'hold'], esc)],
  [/^미국 대표 업종과 빅테크/, esc => usTable('빅테크 8종목: 하는 일과 국내 보관 순위', STK.filter(s => s.field === '빅테크'), ['name', 'desc', 'hold', 'cap'], esc)
    + FIELD_ORDER.slice(1).map(f => usTable(`${f} 분야`, STK.filter(s => s.field === f), ['name', 'desc', 'hold', 'cap'], esc)).join('')],
  [/^미국 배당주와 배당 성장주/, esc => usTable('국내 투자자가 많이 보유한 배당 종목·ETF', byTicker(['SCHD', 'O', 'JEPQ', 'JEPI', 'QQQI', 'AAPL', 'MSFT', 'AVGO', 'BRK B']), ['name', 'desc', 'pay', 'hold', 'cap'], esc)],
  [/^환율이 해외 주식 수익률/, esc => fxTable(esc)],
  [/^일본·중국·유럽·신흥국/, esc => usTable('미국에 상장된 미국 밖 기업 (업종닷컴 미국 주식 탭)', STK.filter(s => s.country), ['name', 'country', 'desc', 'market', 'hold'], esc)
    + usTable('한국 지수에 투자하는 미국 ETF', byTicker(['KORU']), ['name', 'desc', 'market', 'hold'], esc)],
  [/^해외 주식 총정리/, esc => groupTable(`국내 투자자 보유 상위 미국 종목·ETF ${US.length}개, 분야별로 나누면`, s => s.field, '분야', esc)],
];

const wrap = (inner, esc) => `<section class="sp-section col-data"><h2>업종닷컴 데이터로 보기</h2>
  <p class="sp-note">업종닷컴 미국 주식 탭에 있는 종목입니다. 한국예탁결제원이 공개하는 국내 투자자 미국 주식 보관금액 TOP 50(${esc(US_AS_OF)} 기준)을 바탕으로 골랐고, 50위 밖은 최근 1년 결제·보관 상위 목록에 자주 오른 종목입니다. 종목 이름을 누르면 시세와 토론을 볼 수 있습니다.</p>
  ${inner}
  <p class="sp-note">시가총액은 원화로 환산한 대략의 값입니다. 분야·하는 일·배당 주기는 회사 설명을 정리한 것이며 투자 권유가 아닙니다.</p></section>`;

export function usDataHtml(title, esc) {
  const hit = GUIDES.find(([re]) => re.test(title));
  if (!hit) return null;
  const inner = hit[1](esc);
  return inner ? wrap(inner, esc) : null;
}
