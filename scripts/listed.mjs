// 상장 종목명 전체(코스피·코스닥 보통주, ETF·ETN·스팩·우선주 제외) → api/_listed.js
// 주식 시장 뉴스에서 특정 종목 기사(제목에 상장사 이름이 들어간 기사)를 거르는 데 사용 (api/news.js)
// 실행: node scripts/listed.mjs  (상장·상폐 반영하려면 가끔 다시 실행 후 배포)
import fs from 'fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const names = new Set();
for (const market of ['KOSPI', 'KOSDAQ']) {
  for (let page = 1; ; page++) {
    const r = await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=100`, { headers: { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' } });
    const { stocks = [] } = await r.json();
    if (!stocks.length) break;
    for (const s of stocks) {
      if (s.stockEndType !== 'stock') continue;                       // ETF·ETN 제외
      if (/스팩|우$|우B$|우\(전환\)$|\d+우$/.test(s.stockName)) continue;  // 스팩·우선주 제외 (본주 이름으로 걸림)
      names.add(s.stockName);
    }
  }
}
const list = [...names].sort((a, b) => b.length - a.length);
fs.writeFileSync(new URL('../api/_listed.js', import.meta.url),
  `// 자동 생성 (scripts/listed.mjs, ${new Date().toISOString().slice(0, 10)}) — 코스피·코스닥 상장 보통주 이름 ${list.length}개\nexport const LISTED_NAMES = ${JSON.stringify(list)};\n`);
console.log('종목명', list.length);
