// 국내 투자자 미국주식 보관금액 TOP 50 (한국예탁결제원 SEIBro) → 네이버 해외주식 코드로 매핑 → us.json
// 사용: node us.mjs 20261008   (조회기준일: 당일 기준 2영업일 전까지 조회 가능)
import fs from 'fs';
const DATE = process.argv[2];
const UA = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com/' };

const body = `<reqParam action="getImptFrcurStkCusRemaList" task="ksd.safe.bip.cnts.OvsSec.process.OvsSecIsinPTask"><PG_START value="1"/><PG_END value="50"/><START_DT value="${DATE}"/><END_DT value="${DATE}"/><S_TYPE value="1"/><S_COUNTRY value="US"/></reqParam>`;
const xml = await (await fetch('https://seibro.or.kr/websquare/engine/proworks/callServletService.jsp', {
  method: 'POST', headers: { ...UA, 'Content-Type': 'application/xml; charset=UTF-8' }, body,
})).text();
const rows = [...xml.matchAll(/<RNUM value="(\d+)"\/>.*?<ISIN value="([^"]+)"\/><KOR_SECN_NM value="([^"]*)"\/><SUM_FRSEC_AMT value="(\d+)"/g)]
  .map(m => ({ rank: +m[1], isin: m[2], seibroName: m[3], amt: +m[4] }));
if (rows.length !== 50) throw new Error('SEIBro rows ' + rows.length);

// ISIN → 티커 (SEIBro 종목명 기준 수동 매핑, 네이버 시세의 isinCode로 검증)
const TICKER = {
  US88160R1014: 'TSLA', US67066G1040: 'NVDA', US02079K3059: 'GOOGL', US46090E1038: 'QQQ', US9229083632: 'VOO',
  US25459W4583: 'SOXL', US0378331005: 'AAPL', US74347X8314: 'TQQQ', US69608A1088: 'PLTR', US5951121038: 'MU',
  US8085247976: 'SCHD', US5949181045: 'MSFT', US46138G6492: 'QQQM', US46222L1089: 'IONQ', US74347R2067: 'QLD',
  US78462F1030: 'SPY', US11135F1012: 'AVGO', US84615Q1031: 'SPCX', US80004C2008: 'SNDK', US0231351067: 'AMZN',
  US46436E7186: 'SGOV', US0079031078: 'AMD', US8740391003: 'TSM', US46654Q2030: 'JEPQ', US4581401001: 'INTC',
  US30303M1027: 'META', US78464A8541: 'SPYM', US02079K1079: 'GOOG', US4642875235: 'SOXX', US25460G2865: 'TSLL',
  US5738741041: 'MRVL', AU0000185993: 'IREN', US5949724083: 'MSTR', US09175A2069: 'BMNR', US92189F6768: 'SMH',
  US7731211089: 'RKLB', US77926X3200: 'DRAM', US1725731079: 'CRCL', US78433H6751: 'QQQI', US55024U1097: 'LITE',
  US46641Q3323: 'JEPI', USN070592100: 'ASML', US0937121079: 'BE', US4642872000: 'IVV', US0846707026: 'BRK.B',
  US5128073062: 'LRCX', US0382221051: 'AMAT', NL0009805522: 'NBIS', US78392B2060: 'SKHY', US7561091049: 'O',
};

const SEARCH = { 'BRK.B': '버크셔' };  // 네이버 표기 'BRK B' (코드 BRKb)
async function resolve(ticker) {
  const j = await (await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(SEARCH[ticker] || ticker)}&target=stock`, { headers: UA })).json();
  const usa = (j.items || []).filter(i => i.nationCode === 'USA');
  const want = ticker.replace('.', ' ');
  return usa.find(i => i.code === ticker || i.code === want) || null;
}

const out = [];
for (const r of rows) {
  const t = TICKER[r.isin];
  if (!t) throw new Error('티커 매핑 없음: ' + r.isin + ' ' + r.seibroName);
  const item = await resolve(t);
  if (!item) throw new Error('네이버 검색 실패: ' + t);
  const code = item.reutersCode;
  const basic = await (await fetch(`https://api.stock.naver.com/stock/${code}/basic`, { headers: UA })).json();
  const poll = await (await fetch(`https://polling.finance.naver.com/api/realtime/worldstock/stock/${code}`, { headers: UA })).json();
  const p = poll.datas?.[0] || {};
  const info = Object.fromEntries((basic.stockItemTotalInfos || []).map(x => [x.code, x]));
  out.push({
    rank: r.rank, isin: r.isin, isinNaver: p.isinCode || null, seibroName: r.seibroName, amt: r.amt,
    code, ticker: basic.symbolCode || item.code, name: basic.stockName || item.name, nameEng: basic.stockNameEng,
    exchange: basic.stockExchangeType?.name || item.typeCode, etf: basic.stockEndType === 'etf',
    logo: basic.itemLogoUrl || null,
    price: Number(String(basic.closePrice).replace(/,/g, '')), change: Number(basic.fluctuationsRatio),
    capKrw: Number(basic.marketValueKrwRaw || 0), capText: info.marketValue?.valueDesc || null,
  });
  console.log(r.rank, t, '→', code, basic.stockName, basic.stockEndType, p.isinCode === r.isin ? 'ISIN OK' : `ISIN ${p.isinCode}`);
}
fs.writeFileSync(new URL('./data/us.json', import.meta.url), JSON.stringify({ asOf: DATE, rows: out }, null, 1));
