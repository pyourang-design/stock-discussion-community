// 네이버 증권 전체 업종 + 업종별 시가총액 합계 (보통주만)
import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async u => (await fetch(u, H)).json();
const groups = [];
for (let p = 1; p < 10; p++) {
  const j = await get(`https://m.stock.naver.com/api/stocks/industry?page=${p}&pageSize=100`);
  groups.push(...j.groups);
  if (groups.length >= j.totalCount || !j.groups.length) break;
}
const out = await Promise.all(groups.map(async g => {
  const stocks = [];
  for (let p = 1; p < 10; p++) {
    const j = await get(`https://m.stock.naver.com/api/stocks/industry/${g.no}?page=${p}&pageSize=100`);
    stocks.push(...j.stocks);
    if (j.stocks.length < 100) break;
  }
  const common = stocks.filter(s => s.stockEndType === 'stock' && s.itemCode.endsWith('0'));
  const cap = common.reduce((a, s) => a + Number(s.marketValueRaw || 0), 0);
  const top = [...common].sort((a, b) => b.marketValueRaw - a.marketValueRaw).slice(0, 3).map(s => s.stockName);
  return { no: g.no, name: g.name, count: common.length, cap, top };
}));
out.sort((a, b) => b.cap - a.cap);
const total = out.reduce((a, g) => a + g.cap, 0);
fs.writeFileSync(new URL('./data/industries.json', import.meta.url), JSON.stringify(out));
const fmt = v => v >= 1e12 ? (v / 1e12).toFixed(1) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
out.forEach((g, i) => console.log(`${i + 1}|${g.name}|${fmt(g.cap)}|${(g.cap / total * 100).toFixed(1)}%|${g.count}|${g.top.join(', ')}`));
console.log('total', fmt(total), out.length);
