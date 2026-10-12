// 미국주식 100종목: us.json(보관금액 TOP 50) + us_extra.json(51~100위 보충 후보, 등장 횟수순) → us100.json
// 순서: node us.mjs <기준일> → (브라우저로 seibro-more.json 수집) → node us_extra.mjs → node us_merge.mjs → node build.mjs
import fs from 'fs';
const S = p => new URL(p, import.meta.url);
const UA = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' };
const us = JSON.parse(fs.readFileSync(S('./data/us.json')));
const extra = JSON.parse(fs.readFileSync(S('./data/us_extra.json')));
const used = new Set(us.rows.map(r => r.code));
const rows = [...us.rows];
for (const c of extra) {
  if (rows.length >= 100) break;
  if (used.has(c.code)) continue;   // 예: SOXL 옛 ISIN
  used.add(c.code);
  const basic = await (await fetch(`https://api.stock.naver.com/stock/${c.code}/basic`, { headers: UA })).json();
  const info = Object.fromEntries((basic.stockItemTotalInfos || []).map(x => [x.code, x]));
  rows.push({
    rank: rows.length + 1, isin: c.isin, seibroName: c.seibroName, amt: null, extra: true, hits: c.hits, best: c.best,
    code: c.code, ticker: basic.symbolCode, name: basic.stockName, nameEng: basic.stockNameEng,
    exchange: basic.stockExchangeType?.name, etf: basic.stockEndType === 'etf' || /\bET[FN]\b/.test(basic.stockName), logo: basic.itemLogoUrl || null,
    price: Number(String(basic.closePrice).replace(/,/g, '')), change: Number(basic.fluctuationsRatio),
    capKrw: Number(basic.marketValueKrwRaw || 0), capText: info.marketValue?.valueDesc || null,
  });
  console.log(rows.length, c.code, basic.stockName, basic.stockEndType, 'hits', c.hits);
}
fs.writeFileSync(S('./data/us100.json'), JSON.stringify({ asOf: us.asOf, rows }, null, 1));
console.log('총', rows.length, 'ETF', rows.filter(r => r.etf).length);
