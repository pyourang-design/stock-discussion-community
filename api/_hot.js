// 핫이슈 종목 공통: 조건 목록 · 네이버 실시간 순위 받기 (api/hot.js 화면용, scripts/hot-daily.mjs 장 마감 계산용)
// DB 키: hot:day:{YYYYMMDD} 장 마감 계산 결과(기간별 조건 — 일봉·수급·리포트), hot:snap:{YYYYMMDD} 그날 순위 사진(신고가·인기검색·공시·뉴스 — 주간·월간 합산용),
//        hot:dates 계산한 날짜 목록(최신 먼저, 25개)
export const HOT_GROUPS = [
  ['price', '가격'], ['trend', '추세'], ['rebound', '반등'], ['flow', '수급'], ['trade', '거래'], ['issue', '재료'],
];
// [키, 이름, 묶음] — 화면 칩 순서
export const HOT_CONDS = [
  ['surge', '급등', 'price'], ['gap', '갭 상승', 'price'], ['big', '장대양봉', 'price'],
  ['high52', '52주 신고가', 'price'], ['low52', '52주 신저가', 'price'],
  ['breakout', '박스권 돌파', 'trend'], ['golden', '골든크로스', 'trend'], ['align', '정배열 전환', 'trend'], ['streak', '연속 상승', 'trend'],
  ['rsi', '과매도 반등', 'rebound'], ['rebound', '신저가 대비 반등', 'rebound'], ['ma60', '60일선 지지', 'rebound'],
  ['value', '거래대금 상위', 'flow'], ['volume', '거래량 급증', 'flow'], ['search', '인기 검색', 'flow'],
  ['foreign', '외국인 연속 순매수', 'trade'], ['organ', '기관 연속 순매수', 'trade'], ['fhold', '외국인 보유율 상승', 'trade'],
  ['disc', '공시 특징주', 'issue'], ['news', '뉴스 급증', 'issue'], ['report', '리포트 집중', 'issue'],
];
export const HOT_DISC = new Set(['공급계약', '자사주', '무상증자', '실적']);  // api/_aiMarket.js classifyDisclosure 이름 중 특징주로 볼 것
export const HOT_TOP = 30;  // 조건마다 최대 종목 수

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', Referer: 'https://m.stock.naver.com/', Accept: 'application/json' };
export const getJson = async url => { const r = await fetch(url, { headers: HEADERS }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); };
export const num = v => { const n = Number(String(v ?? '').replace(/[,+]/g, '')); return Number.isFinite(n) ? n : null; };
export const kstYmd = ts => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');

// 잡주 거르기: 보통주만(ETF·ETN·스팩·우선주 제외), 시총 1,000억 이상, 거래대금 30억 이상(needValue)
const JUNK = /스팩|ETN|\d*우[BC]?$|\(전환\)/;
const okStock = (s, needValue) => s.stockEndType === 'stock' && !JUNK.test(s.stockName) && num(s.marketValue) >= 1000 && (!needValue || num(s.accumulatedTradingValue) >= 3000);
const row = s => ({ code: s.itemCode, name: s.stockName, price: num(s.closePrice), rate: num(s.fluctuationsRatio), value: Math.round(num(s.accumulatedTradingValue) / 100) });  // value: 거래대금 억 원

async function rank(kind, markets, size, needValue) {
  const lists = await Promise.all(markets.map(m => getJson(`https://m.stock.naver.com/api/stocks/${kind}/${m}?page=1&pageSize=${size}`).then(j => j.stocks || []).catch(() => [])));
  return lists.flat().filter(s => okStock(s, needValue)).map(row);
}

// 네이버 실시간 순위 → 조건별 [code, 설명, 정렬값] (급등·신고가·신저가·거래대금·인기 검색) + 종목 정보
export async function liveRanks() {
  const [up, high, low, value, search] = await Promise.all([
    rank('up', ['KOSPI', 'KOSDAQ'], 100, true),
    rank('high52week', ['KOSPI', 'KOSDAQ'], 100, true),
    rank('low52week', ['KOSPI', 'KOSDAQ'], 100, true),
    rank('priceTop', ['KOSPI', 'KOSDAQ'], 60, true),
    rank('searchTop', ['all'], 60, false),
  ]);
  const info = {};
  for (const s of [up, high, low, value, search].flat()) info[s.code] = { n: s.name, p: s.price, r: s.rate };
  const top = (list, f) => list.slice(0, HOT_TOP).map(f);
  // 갓 상장한 종목은 52주 기록이 짧아 신고가·신저가 양쪽에 같이 뜸 → 둘 다 있으면 뺌
  const both = new Set(high.map(s => s.code).filter(c => low.some(s => s.code === c)));
  return {
    info,
    traded: up.length > 0,  // 장 시작 전에는 네이버 순위가 비어 있음
    hits: {
      surge: top(up.filter(s => s.rate >= 15).sort((a, b) => b.rate - a.rate), s => [s.code, s.rate >= 29.5 ? '상한가' : `+${s.rate.toFixed(1)}%`, s.rate]),
      high52: top(high.filter(s => !both.has(s.code)).sort((a, b) => b.rate - a.rate), s => [s.code, '52주 신고가', s.rate]),
      low52: top(low.filter(s => !both.has(s.code)).sort((a, b) => a.rate - b.rate), s => [s.code, '52주 신저가', -s.rate]),
      value: top(value.sort((a, b) => b.value - a.value), s => [s.code, `거래대금 ${s.value.toLocaleString()}억`, s.value]),
      search: top(search, (s, i) => [s.code, `인기 검색 ${i + 1}위`, HOT_TOP - i]),
    },
  };
}
