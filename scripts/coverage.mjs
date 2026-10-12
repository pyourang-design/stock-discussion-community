// 네이버 업종별 시총 중 사이트 9개 탭(후보 종목 기준)이 커버하는 비율
import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async u => (await fetch(u, H)).json();
const members = JSON.parse(fs.readFileSync(new URL('./data/members.json', import.meta.url)));
const covered = new Set(Object.values(members).flat().map(s => s.code));
const groups = [];
for (let p = 1; p < 10; p++) {
  const j = await get(`https://m.stock.naver.com/api/stocks/industry?page=${p}&pageSize=100`);
  groups.push(...j.groups);
  if (groups.length >= j.totalCount || !j.groups.length) break;
}
const fmt = v => v >= 1e12 ? (v / 1e12).toFixed(1) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
const rows = await Promise.all(groups.map(async g => {
  const stocks = [];
  for (let p = 1; p < 10; p++) {
    const j = await get(`https://m.stock.naver.com/api/stocks/industry/${g.no}?page=${p}&pageSize=100`);
    stocks.push(...j.stocks);
    if (j.stocks.length < 100) break;
  }
  const common = stocks.filter(s => s.stockEndType === 'stock' && s.itemCode.endsWith('0'));
  const cap = common.reduce((a, s) => a + Number(s.marketValueRaw || 0), 0);
  const miss = common.filter(s => !covered.has(s.itemCode)).sort((a, b) => b.marketValueRaw - a.marketValueRaw);
  const missCap = miss.reduce((a, s) => a + Number(s.marketValueRaw || 0), 0);
  return { name: g.name, cap, missCap, top: miss.slice(0, 4).map(s => `${s.stockName}(${fmt(Number(s.marketValueRaw))})`) };
}));
const total = rows.reduce((a, r) => a + r.cap, 0);
const totalMiss = rows.reduce((a, r) => a + r.missCap, 0);
console.log('전체', fmt(total), '미포함', fmt(totalMiss), (totalMiss / total * 100).toFixed(1) + '%');
rows.sort((a, b) => b.missCap - a.missCap).slice(0, 25).forEach((r, i) =>
  console.log(`${i + 1}|${r.name}|${fmt(r.cap)}|${fmt(r.missCap)}|${(r.missCap / total * 100).toFixed(1)}%|${(100 - r.missCap / r.cap * 100).toFixed(0)}%|${r.top.join(', ')}`));
