// 미국 장 마감 시황 초안용 데이터 (functions/api/sihwang.js {op:'data', market:'us'}) — 예약 실행 루틴이 한국 시간 아침 8시(화~토)에 받음
// 네이버 증권: 지수(다우·나스닥·S&P 500·필라델피아 반도체·VIX), 빅테크(고정 8개), 크게 움직인 대형주(나스닥·뉴욕 시총 상위 중 빅테크 제외 상승·하락 5개씩),
//   S&P 500 섹터 ETF 11개, 달러인덱스·미국 국채 2/10년·유가·금·환율, S&P 500·나스닥 20거래일
// + 해외 증시 뉴스(네이버 worldNews) + 미국 증시 키워드 뉴스(/api/news?sector=usa)
import { candlesAndTa } from './_ta.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', Referer: 'https://m.stock.naver.com/', Accept: 'application/json' };
const getJson = async url => { const r = await fetch(url, { headers: HEADERS }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); };
const num = v => { const n = Number(String(v ?? '').replace(/[,+]/g, '')); return Number.isFinite(n) ? n : null; };

const INDEX = [['.DJI', '다우존스'], ['.IXIC', '나스닥 종합'], ['.INX', 'S&P 500'], ['.SOX', '필라델피아 반도체'], ['.VIX', 'VIX(변동성 지수)']];
const BIGTECH = [['NVDA.O', '엔비디아'], ['AAPL.O', '애플'], ['MSFT.O', '마이크로소프트'], ['AMZN.O', '아마존'], ['GOOGL.O', '알파벳'], ['META.O', '메타'], ['TSLA.O', '테슬라'], ['AVGO.O', '브로드컴']];
// S&P 500 섹터 = SPDR 섹터 ETF (네이버 코드: 부동산만 .K)
const SECTOR_ETF = [['XLK', '기술'], ['XLC', '커뮤니케이션'], ['XLY', '경기소비재'], ['XLP', '필수소비재'], ['XLV', '헬스케어'], ['XLF', '금융'], ['XLI', '산업재'], ['XLE', '에너지'], ['XLB', '소재'], ['XLU', '유틸리티'], ['XLRE.K', '부동산']];
const MACRO = [['exchange/.DXY', '달러인덱스', ''], ['bond/US2YT=RR', '미국 국채 2년', '%'], ['bond/US10YT=RR', '미국 국채 10년', '%'], ['energy/CLcv1', 'WTI 유가', '달러/배럴'], ['energy/LCOcv1', '브렌트유', '달러/배럴'], ['metals/GCcv1', '국제 금', '달러/온스'], ['exchange/FX_USDKRW', '원·달러 환율', '원']];

const quotes = async (kind, list) => {
  const j = await getJson(`https://polling.finance.naver.com/api/realtime/worldstock/${kind}/${list.map(x => x[0]).join(',')}`);
  const by = Object.fromEntries((j.datas || []).map(d => [d.reutersCode, d]));
  return list.map(([code, name]) => { const d = by[code]; return d ? { code: code.replace(/\.[A-Z]$/, ''), name, close: num(d.closePrice), diff: num(d.compareToPreviousClosePrice), rate: num(d.fluctuationsRatio), at: d.localTradedAt } : null; }).filter(Boolean);
};
async function macro() {
  const res = await Promise.all(MACRO.map(([c]) => getJson(`https://api.stock.naver.com/marketindex/${c}`).catch(() => null)));
  return res.map((j, i) => { const x = j && (j.exchangeInfo || j.energyInfo || j.metalsInfo || j.bondInfo || j); return x?.closePrice ? { name: MACRO[i][1], unit: MACRO[i][2], price: num(x.closePrice), diff: num(x.fluctuations), rate: num(x.fluctuationsRatio), at: x.localTradedAt } : null; }).filter(Boolean);
}
// 크게 움직인 대형주: 나스닥·뉴욕 거래소 시총 상위 100개씩(보통주만) 중 시총 큰 150개에서, 고정 빅테크를 빼고 등락률 상위·하위 5개
const BIG_SYMBOLS = new Set(BIGTECH.map(([c]) => c.replace(/\.[A-Z]$/, '')));
async function movers() {
  const lists = await Promise.all(['NASDAQ', 'NYSE'].map(ex => getJson(`https://api.stock.naver.com/stock/exchange/${ex}/marketValue?page=1&pageSize=100`).then(j => j.stocks || [])));
  const big = lists.flat().filter(s => s.stockEndType === 'stock' && !BIG_SYMBOLS.has(s.symbolCode))
    .sort((a, b) => num(b.marketValueRaw) - num(a.marketValueRaw)).slice(0, 150)
    .map(s => ({ code: s.symbolCode, name: s.stockName, close: num(s.closePrice), diff: num(s.compareToPreviousClosePrice), rate: num(s.fluctuationsRatio), cap: s.marketValueKrwHangeul, exchange: s.stockExchangeType?.nameKor }))
    .filter(s => s.rate != null);
  const byRate = [...big].sort((a, b) => b.rate - a.rate);
  return { up: byRate.filter(s => s.rate > 0).slice(0, 5), down: byRate.filter(s => s.rate < 0).slice(-5).reverse() };
}
// 지수 일봉(최근 40개, 봉 차트용) + 기술적 지표 — api/_ta.js
const days = async code => candlesAndTa((await getJson(`https://api.stock.naver.com/chart/foreign/index/${code}?periodType=dayCandle`)).priceInfos);
const worldNews = async () => (await getJson('https://api.stock.naver.com/news/worldNews?pageSize=30&page=1')).map(n => ({ title: n.tit, summary: String(n.subcontent || '').slice(0, 160), press: n.ohnm, time: n.dt }));

export async function usData(now, origin) {
  const kstDate = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const usExpected = new Date(now + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);  // 한국 아침 8시 = 미국 전날 저녁
  const settle = p => p.then(v => v, e => ({ error: String(e.message || e) }));
  const [idx, big, sec, mac, spxChart, nasChart, news, gnews, mov] = await Promise.all([
    settle(quotes('index', INDEX)), settle(quotes('stock', BIGTECH)), settle(quotes('stock', SECTOR_ETF)), settle(macro()),
    settle(days('.INX')), settle(days('.IXIC')), settle(worldNews()),
    settle(fetch(new URL('/api/news?sector=usa', origin)).then(r => r.json()).then(j => (j.data || []).slice(0, 20).map(n => ({ title: n.title, press: n.press, time: n.datetime })))),
    settle(movers()),
  ]);
  const usDate = Array.isArray(idx) ? String(idx.find(x => x.code === '.INX')?.at || '').slice(0, 10) : '';
  // 미국 휴장일(전날 거래 없음)이면 초안을 쓰지 않음
  if (usDate !== usExpected) return { tradingDay: false, kstDate, usDate, reason: `미국 ${usExpected} 거래 없음 (마지막 거래 ${usDate || '확인 못 함'})` };
  return {
    tradingDay: true, kstDate, usDate, generatedAt: new Date(now).toISOString(),
    indices: idx,         // code, name, close, diff(포인트), rate(%) — VIX는 오르면 불안 심리
    bigTech: big,         // 빅테크 8종목 (고정)
    movers: mov,          // 크게 움직인 대형주 (빅테크 제외): up 상승 5·down 하락 5 — name, code, close, diff, rate, cap(시총), exchange
    sectors: Array.isArray(sec) ? [...sec].sort((a, b) => b.rate - a.rate) : sec,  // S&P 500 섹터 ETF 등락률 큰 순
    macro: mac,           // 달러인덱스·미국 국채 2/10년·WTI·브렌트·금·원달러
    indexChart: { SPX: spxChart, NASDAQ: nasChart },  // candles: 최근 40일 일봉(date MM/DD, 미국 날짜), ta: 기술적 지표
    news,                 // 해외 증시 뉴스 (네이버, 최신순)
    googleNews: gnews,    // 미국 증시 키워드 뉴스
  };
}
