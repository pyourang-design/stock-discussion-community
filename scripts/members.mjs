import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async u => (await fetch(u, H)).json();
const SECTORS = {
  bio:     [['industry', 261], ['industry', 286], ['industry', 262]],
  semi:    [['industry', 278], ['theme', 155]],
  battery: [['theme', 64]],
  ship:    [['industry', 291], ['theme', 30], ['theme', 94]],
  defense: [['industry', 284], ['theme', 144]],
  nuclear: [['theme', 205], ['theme', 401]],
  auto:    [['industry', 273], ['industry', 270]],
};
const out = {};
for (const [sec, groups] of Object.entries(SECTORS)) {
  const m = new Map();
  for (const [kind, no] of groups) {
    for (let p = 1; p < 10; p++) {
      const j = await get(`https://m.stock.naver.com/api/stocks/${kind}/${no}?page=${p}&pageSize=100`);
      for (const s of j.stocks) m.set(s.itemCode, {
        code: s.itemCode, name: s.stockName, market: s.sosok === '0' ? 'kospi' : 'kosdaq', endType: s.stockEndType,
        cap: Number(s.marketValueRaw), price: Number(s.closePriceRaw), change: Number(s.fluctuationsRatio), volume: Number(s.accumulatedTradingVolumeRaw),
      });
      if (j.stocks.length < 100) break;
    }
  }
  out[sec] = [...m.values()].filter(s => s.endType === 'stock' && !/스팩|\d호$/.test(s.name)).sort((a, b) => b.cap - a.cap);
  console.log(sec, out[sec].length, out[sec].slice(0, 12).map(s => s.name).join(','));
}
fs.writeFileSync(new URL('./data/members.json', import.meta.url), JSON.stringify(out));
