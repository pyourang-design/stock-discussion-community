// 미국 상장 종목 전체 목록 만들기 — 실행: node scripts/us_listed.mjs  (상장·상폐 반영하려면 가끔 다시 실행 후 배포)
//   us-listed.json : 업종 탭(stocks.js)에 없는 미국 종목 [코드, 이름, 시장, 시총, 티커, ETF 여부]
//      회원 검색 전용 (국내 숨은 종목 listed.json과 같은 방식, app.js loadHidden) — 검색해서 관심 종목에 넣고 종목 창을 볼 수 있음
//      /stock/ 페이지·사이트맵에는 넣지 않음
//   출처: 네이버 증권 — 주식은 거래소별 시가총액 순(나스닥·뉴욕·아멕스), ETF는 거래대금 순
//   우선주·신주인수권·워런트 등 코드에 '_'가 붙은 종목은 시세 API 코드 형식이 달라 제외
import fs from 'fs';
import { STOCKS } from '../api/_stocks.js';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', Referer: 'https://m.stock.naver.com/' };
const CODE_RE = /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/;  // api/stock.js·api/posts.js와 같은 미국 코드 형식
const MARKET = { NASDAQ: 'nasdaq', NYSE: 'nyse', AMEX: 'amex' };
// 시총 "6,946조 8,757억원" → "6,946조", "8,757억원" → "8,757억"
const capText = v => !v || v === '-' ? '' : v.replace(/원$/, '').split(' ')[0];

// listed.json의 미국 종목(탭에서 빠진 옛 종목, 시총 빈칸)도 다시 넣어 시총을 채움 — app.js에서 뒤 파일 값이 덮어씀
const skip = new Set(STOCKS.map(s => s.code));
const rows = [], seen = new Set();
const add = row => { if (CODE_RE.test(row[0]) && !skip.has(row[0]) && !seen.has(row[0])) { seen.add(row[0]); rows.push(row); } };

// 주식: 거래소별 시가총액 순 → 합쳐서 시총(달러) 큰 순
const stocks = [];
for (const ex of Object.keys(MARKET)) {
  for (let page = 1; ; page++) {
    const r = await fetch(`https://api.stock.naver.com/stock/exchange/${ex}/marketValue?page=${page}&pageSize=100`, { headers: UA });
    const { stocks: list = [] } = await r.json();
    if (!list.length) break;
    for (const s of list) stocks.push({ s, ex, cap: Number(s.marketValueRaw) || 0 });
  }
}
stocks.sort((a, b) => b.cap - a.cap);
for (const { s, ex } of stocks) add([s.reutersCode, s.stockName, MARKET[ex], capText(s.marketValueKrwHangeul), s.symbolCode, 0]);
const nStock = rows.length;

// ETF: 거래대금 순 (한 번에 최대 50개)
for (let page = 1; page < 1000; page++) {
  const r = await fetch(`https://m.stock.naver.com/front-api/worldstock/etf/list?sortTypeCode=tradingValue&page=${page}&pageSize=50`, { headers: UA });
  const j = await r.json();
  const list = j.result?.result || [];
  for (const e of list) if (e.nationType === 'USA') add([e.reutersCode, e.name, MARKET[e.stockExchangeType] || 'amex', '', e.symbolCode, 1]);
  if (!j.result?.hasNext || !list.length) break;
}

fs.writeFileSync(new URL('../us-listed.json', import.meta.url), JSON.stringify(rows));
console.log('미국 주식', nStock, 'ETF', rows.length - nStock, '합계', rows.length);
