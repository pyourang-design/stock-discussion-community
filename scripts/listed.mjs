// 상장 종목 전체(코스피·코스닥) 목록 만들기 — 실행: node scripts/listed.mjs  (상장·상폐 반영하려면 가끔 다시 실행 후 배포)
//   1) api/_listed.js : 상장 보통주 이름 (ETF·ETN·스팩·우선주 제외)
//      주식 시장 뉴스에서 특정 종목 기사(제목에 상장사 이름이 들어간 기사)를 거르는 데 사용 (api/news.js)
//   2) listed.json    : 업종 탭(stocks.js)에 없는 숨은 종목 [코드, 이름, 시장, 시총] (스팩 제외, 우선주 포함)
//      회원 검색 전용 — 검색해서 관심 종목에 넣고 종목 창(뉴스·리포트·공시·토론)을 볼 수 있음 (app.js loadHidden)
//      /stock/ 페이지·사이트맵에는 넣지 않음 (scripts/seo.mjs는 stocks.js만 사용)
//   3) api/_hidden.js : 같은 숨은 종목 [코드, 이름] (서버용: AI 운영자 소개글·실적 글, api/_ai.js · api/posts.js)
import fs from 'fs';
import { STOCKS } from '../api/_stocks.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const capText = v => v >= 1e13 ? (v / 1e12).toFixed(1) + '조' : v >= 1e12 ? (v / 1e12).toFixed(2) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
const shown = new Set(STOCKS.map(s => s.code));
const names = new Set(), hidden = [];
for (const market of ['KOSPI', 'KOSDAQ']) {
  for (let page = 1; ; page++) {
    const r = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`, { headers: { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' } });
    const { stocks = [] } = await r.json();
    if (!stocks.length) break;
    for (const s of stocks) {
      if (s.stockEndType !== 'stock' || /스팩/.test(s.stockName)) continue;  // ETF·ETN·스팩 제외
      if (!/우$|우B$|우\(전환\)$|\d+우$/.test(s.stockName)) names.add(s.stockName);  // 우선주는 본주 이름으로 걸림
      if (!shown.has(s.itemCode)) hidden.push({ code: s.itemCode, name: s.stockName, market: market.toLowerCase(), cap: Number(String(s.marketValue).replace(/,/g, '')) * 1e8 });
    }
  }
}
hidden.sort((a, b) => b.cap - a.cap);
const list = [...names].sort((a, b) => b.length - a.length);
const day = new Date().toISOString().slice(0, 10);
fs.writeFileSync(new URL('../api/_listed.js', import.meta.url),
  `// 자동 생성 (scripts/listed.mjs, ${day}) — 코스피·코스닥 상장 보통주 이름 ${list.length}개\nexport const LISTED_NAMES = ${JSON.stringify(list)};\n`);
fs.writeFileSync(new URL('../listed.json', import.meta.url), JSON.stringify(hidden.map(h => [h.code, h.name, h.market, capText(h.cap)])));
fs.writeFileSync(new URL('../api/_hidden.js', import.meta.url),
  `// 자동 생성 (scripts/listed.mjs, ${day}) — 업종 탭에 없는 숨은 종목 ${hidden.length}개 [코드, 이름] (회원 검색 전용, 시가총액 큰 순)\nexport const HIDDEN = ${JSON.stringify(hidden.map(h => [h.code, h.name]))};\n`);
console.log('종목명', list.length, '숨은 종목', hidden.length);
