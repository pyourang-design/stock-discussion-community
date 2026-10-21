// 주식 시황 초안용 데이터 모음 (functions/api/sihwang.js {op:'data'}) — 예약 실행(Claude Code 루틴)이 이 숫자로 초안을 씀
// 네이버 증권(지수·투자자별 매매·시총/상승/하락 상위·환율·유가·금리·지수 20일) + 거래소(KRX) 업종지수(다음 금융 — 코스피 24개·코스닥 37개)
// + 주식 시장 뉴스 제목(/api/news?sector=market) + 오늘 모인 공시(ai:disc:{날짜})
import { redis } from './_redis.js';
import { buildMorning, buildMarketClose, isTradingDay } from './_aiMarket.js';
import { candlesAndTa } from './_ta.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', Referer: 'https://m.stock.naver.com/', Accept: 'application/json' };
const getJson = async url => { const r = await fetch(url, { headers: HEADERS }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return r.json(); };
const num = v => { const n = Number(String(v ?? '').replace(/[,+]/g, '')); return Number.isFinite(n) ? n : null; };
const kst = ts => new Date(ts + 9 * 3600e3);
const ymd = ts => kst(ts).toISOString().slice(0, 10).replace(/-/g, '');
// 환율·유가·금·금리 (네이버 marketindex)
const MACRO = [
  ['exchange/FX_USDKRW', '원·달러 환율', '원'], ['energy/CLcv1', 'WTI 유가', '달러/배럴'], ['energy/LCOcv1', '브렌트유', '달러/배럴'], ['metals/GCcv1', '국제 금', '달러/온스'],
  ['bond/KR3YT=RR', '한국 국채 3년', '%'], ['bond/KR10YT=RR', '한국 국채 10년', '%'], ['bond/US10YT=RR', '미국 국채 10년', '%'],
];

async function macro() {
  const res = await Promise.all(MACRO.map(([c]) => getJson(`https://api.stock.naver.com/marketindex/${c}`).catch(() => null)));
  return res.map((j, i) => {
    const x = j && (j.exchangeInfo || j.energyInfo || j.metalsInfo || j.bondInfo || j);
    return x?.closePrice ? { name: MACRO[i][1], unit: MACRO[i][2], price: num(x.closePrice), diff: num(x.fluctuations), rate: num(x.fluctuationsRatio), at: x.localTradedAt } : null;
  }).filter(Boolean);
}

// 코스피·코스닥 종가·증감 포인트·등락률 (네이버 실시간 지수 — 하락이면 증감에 - 붙임)
async function indices() {
  const j = await getJson('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ');
  return (j.datas || []).map(d => { const rate = num(d.fluctuationsRatio); const diff = Math.abs(num(d.compareToPreviousClosePrice) ?? 0); return { name: d.itemCode === 'KOSPI' ? '코스피' : '코스닥', close: num(d.closePrice), diff: rate < 0 ? -diff : diff, rate, status: d.marketStatus }; });
}

// 지수 일봉(최근 40개, 봉 차트용) + 기술적 지표(이동평균·RSI·고점/저점·거래량 비율·교차) — api/_ta.js
async function indexChart(code) {
  const j = await getJson(`https://api.stock.naver.com/chart/domestic/index/${code}?periodType=dayCandle`);
  return candlesAndTa(j.priceInfos);
}

// 거래소 업종지수 (사이트 업종 탭 평균이 아닌 KRX 공식 업종 분류) — 다음 금융 API, 등락률 큰 순
// 대형주·중형주·소형주·제조업처럼 여러 업종을 묶은 지수는 aggregate: true (업종 순위에서 빼고 참고용)
const AGGREGATE = /대형주|중형주|소형주|^제조업?$|^코스닥 IT$/;
async function krxSectors(market) {
  const r = await fetch(`https://finance.daum.net/api/quotes/sectors?market=${market}`, { headers: { 'User-Agent': HEADERS['User-Agent'], Referer: 'https://finance.daum.net/' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} daum sectors`);
  const j = await r.json();
  return (j.data || []).map(x => {
    const sign = x.change === 'FALL' ? -1 : x.change === 'RISE' ? 1 : 0;
    return { name: x.sectorName, close: x.tradePrice, diff: sign * Math.abs(x.changePrice), rate: Math.round(sign * Math.abs(x.changeRate) * 10000) / 100, date: x.date, ...(AGGREGATE.test(x.sectorName) ? { aggregate: true } : {}) };
  }).sort((a, b) => b.rate - a.rate);
}

// 종목 목록 (시총 상위·상승 상위·하락 상위)
async function stocks(kind, market, size) {
  const j = await getJson(`https://m.stock.naver.com/api/stocks/${kind}/${market}?page=1&pageSize=${size}`);
  return (j.stocks || []).map(s => ({ code: s.itemCode, name: s.stockName, type: s.stockEndType, price: s.closePrice, rate: num(s.fluctuationsRatio), value: s.accumulatedTradingValueKrwHangeul, cap: s.marketValueHangeul }));
}

export async function sihwangData(now, origin) {
  const today = kst(now).toISOString().slice(0, 10);
  if (!isTradingDay(now)) return { tradingDay: false, date: today, reason: '휴장일·주말' };
  const day = ymd(now);
  const [discRaw] = await redis([['HVALS', `ai:disc:${day}`]]);
  const settle = p => p.then(v => v, e => ({ error: String(e.message || e) }));
  const [close, us, mac, kospiChart, kosdaqChart, capK, capQ, upK, downK, upQ, downQ, news, secK, secQ, idx] = await Promise.all([
    settle(buildMarketClose(now, {})), settle(buildMorning(now)), settle(macro()),
    settle(indexChart('KOSPI')), settle(indexChart('KOSDAQ')),
    settle(stocks('marketValue', 'KOSPI', 10)), settle(stocks('marketValue', 'KOSDAQ', 5)),
    settle(stocks('up', 'KOSPI', 8)), settle(stocks('down', 'KOSPI', 8)), settle(stocks('up', 'KOSDAQ', 8)), settle(stocks('down', 'KOSDAQ', 8)),
    settle(fetch(new URL('/api/news?sector=market', origin)).then(r => r.json()).then(j => (j.data || []).slice(0, 40).map(n => ({ title: n.title, press: n.press || n.source, time: n.datetime, url: n.url })))),
    settle(krxSectors('KOSPI')), settle(krxSectors('KOSDAQ')), settle(indices()),
  ]);
  if (close?.skip) return { tradingDay: false, date: today, reason: `오늘 거래 없음 (${close.skip})` };
  return {
    tradingDay: true, date: today, generatedAt: new Date(now).toISOString(),
    indices: idx,  // 코스피·코스닥: close 종가, diff 증감 포인트, rate 등락률 %
    market: close?.error ? close : { summary: close.summary, tables: close.tables },  // 지수·투자자별 순매수(억 원)
    krxSectors: { KOSPI: secK, KOSDAQ: secQ },  // 거래소 업종지수: name, close(지수), diff, rate(%), aggregate(묶음 지수) — 등락률 큰 순
    macro: mac,  // 환율·WTI·브렌트·금·한국 3년/10년·미국 10년 (price, diff, rate %)
    usOvernight: us?.tables ? { summary: us.summary, tables: us.tables } : us,  // 간밤 미국 증시·빅테크
    indexChart: { KOSPI: kospiChart, KOSDAQ: kosdaqChart },  // candles: 최근 40일 일봉(date MM/DD, open, high, low, close, volume), ta: 기술적 지표
    stocks: { capTopKOSPI: capK, capTopKOSDAQ: capQ, upKOSPI: upK, downKOSPI: downK, upKOSDAQ: upQ, downKOSDAQ: downQ },
    news,  // 주식 시장 뉴스 제목 (최신순)
    disclosures: (discRaw || []).map(x => JSON.parse(x)).slice(0, 40),  // 오늘 모인 주요 공시 (16시부터 모으는 중이라 일부)
  };
}
