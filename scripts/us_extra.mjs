// 미국주식 51~100위 보충 후보: 예탁원(SEIBro) 최근 1년 월말 보관금액 TOP 50 + 최근 결제금액 TOP 50 목록에
// 오른 종목 중 현재 보관 TOP 50 밖 종목 → 등장 횟수 많은 순, 같으면 최고 순위 순 → 네이버 코드 매핑(ISIN 검증)
import fs from 'fs';
const S = p => new URL(p, import.meta.url);
const UA = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' };
const res = JSON.parse(fs.readFileSync(S('./data/seibro-more.json')));
const top = new Set(JSON.parse(fs.readFileSync(S('./data/us.json'))).rows.map(r => r.isin));
const parse = x => [...x.matchAll(/<result>(.*?)<\/result>/g)].map(m => Object.fromEntries([...m[1].matchAll(/<(\w+) value="([^"]*)"\/>/g)].map(a => [a[1], a[2]])));

const cand = new Map();
for (const [list, xml] of Object.entries(res)) {
  parse(xml).forEach((r, i) => {
    if (top.has(r.ISIN)) return;
    const c = cand.get(r.ISIN) || { isin: r.ISIN, seibroName: r.KOR_SECN_NM.replace(/&amp;/g, '&').replace(/&apos;/g, "'"), hits: 0, best: 99, lists: [] };
    c.hits++; c.best = Math.min(c.best, i + 1); c.lists.push(list);
    cand.set(r.ISIN, c);
  });
}
const sorted = [...cand.values()].sort((a, b) => b.hits - a.hits || a.best - b.best);

// SEIBro 이름으로 찾기 어려운 종목은 검색어 지정 (합병·사명 변경 등)
const SEARCH = {
  US02156V1098: 'OKLO', US19247G1076: 'COHR', KYG651631007: 'JOBY', US25461H2913: 'SOXS', US4642874329: 'TLT',
  US25460G1388: 'TMF', US25461A3876: 'KORU', US38747R8271: 'NVDL', US78463V1070: 'GLD', US46428Q1094: 'SLV',
  US92864M7983: 'ETHU', US26923V4150: 'DRAMX', US0636795421: 'GDXU', US8629453007: 'ASST', US25461A5285: 'MUU',
  US46152A6689: 'SNXX', US76655K1034: 'RGTI', US92864M3016: 'BITX', US53656F4173: 'METV', US36828A1016: 'GEV',
  US02072L5654: 'BOXX', US25461A8412: 'GGLL', US67079K1007: 'SMR', US00123Q1040: 'AGNC', IE00BKVD2N49: 'STX',
  US66987P5089: 'NBY', US15675D1037: 'CBRS', US24703L2025: 'DELL', US03823U1025: 'AAOI', US90184D1000: 'TWST',
  US1912161007: 'KO', US58933Y1055: 'MRK', US01741R1023: 'ATI', US88634T4931: 'MSTY', US88634T8247: 'CONY',
  US38149W6306: 'GPIQ', US46125A1007: 'LUNR', US26923N4622: 'MSTU', US25461H5726: 'SOXL',
};
const words = n => n.replace(/\b(INC|CORP|CO|LTD|PLC|CL [A-Z]|COM|THE|HOLDINGS?|GROUP|MRGR|CHAN|SPLR|EXOF|SOFF)\b.*$/i, '').trim();

async function lookup(c) {
  const qs = [SEARCH[c.isin], words(c.seibroName), c.seibroName.split(' ').slice(0, 2).join(' ')].filter(Boolean);
  for (const q of qs) {
    const j = await (await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, { headers: UA })).json();
    for (const it of (j.items || []).filter(i => i.nationCode === 'USA').slice(0, 5)) {
      const p = (await (await fetch(`https://polling.finance.naver.com/api/realtime/worldstock/stock/${it.reutersCode}`, { headers: UA })).json()).datas?.[0];
      if (p?.isinCode === c.isin) return it;
    }
  }
  // 액면병합 등으로 ISIN만 바뀐 ETF(MSTY, CONY 등)는 지정 티커가 정확히 일치하면 같은 종목으로 봄
  if (SEARCH[c.isin]) {
    const j = await (await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(SEARCH[c.isin])}&target=stock`, { headers: UA })).json();
    const it = (j.items || []).find(i => i.nationCode === 'USA' && i.code === SEARCH[c.isin] && /ETF|ETN/i.test(i.name));
    if (it) return { ...it, isinChanged: true };
  }
  return null;
}

const out = [];
for (const c of sorted) {
  const it = await lookup(c);
  console.log(c.hits, c.best, c.isin, c.seibroName.slice(0, 38), '→', it ? `${it.reutersCode} ${it.name}` : '없음(ISIN 불일치/상장폐지)');
  if (it) out.push({ ...c, code: it.reutersCode });
}
fs.writeFileSync(S('./data/us_extra.json'), JSON.stringify(out, null, 1));
console.log('매핑', out.length, '/', sorted.length);
