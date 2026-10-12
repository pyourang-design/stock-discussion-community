import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async u => (await fetch(u, H)).json();
const SECTORS = {
  power:    [['industry', 306], ['industry', 325], ['theme', 123], ['theme', 178], ['theme', 229]],
  robot:    [['theme', 505], ['theme', 587]],
  kbeauty:  [['industry', 266], ['theme', 110], ['theme', 513], ['theme', 397]],
  kculture: [['industry', 285], ['industry', 317], ['theme', 128], ['theme', 98], ['theme', 147], ['theme', 47], ['theme', 380], ['theme', 407]],
};
const out = JSON.parse(fs.readFileSync(new URL('./data/members.json', import.meta.url)));  // 기존 업종은 그대로 두고 추가
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
