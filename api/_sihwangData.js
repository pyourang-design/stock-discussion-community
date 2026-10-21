// 주식 시황 초안용 데이터 모음 (functions/api/sihwang.js {op:'data'}) — 예약 실행(Claude Code 루틴)이 이 숫자로 초안을 씀
// 네이버 증권(지수·투자자별 매매·시총/상승/하락 상위·환율·유가·금리·지수 20일) + 사이트 업종 성적(ai:mk:{날짜}:sec, 15:40~ 자동 글이 5분에 한 업종씩 모음 — 아직 없는 업종은 여기서 바로 계산)
// + 주식 시장 뉴스 제목(/api/news?sector=market) + 오늘 모인 공시(ai:disc:{날짜})
import { redis } from './_redis.js';
import { buildMorning, buildMarketClose, buildSectorClose, isTradingDay } from './_aiMarket.js';
import { SECTORS } from './_stocks.js';

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

// 지수 최근 20거래일 종가 (꺾은선 그래프용)
async function indexDays(code) {
  const j = await getJson(`https://api.stock.naver.com/chart/domestic/index/${code}?periodType=dayCandle`);
  return (j.priceInfos || []).slice(-20).map(p => ({ date: p.localDate, close: p.closePrice }));
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
  const [secRaw, discRaw] = await redis([['HGETALL', `ai:mk:${day}:sec`], ['HVALS', `ai:disc:${day}`]]);
  const got = {};
  for (let i = 0; i < (secRaw || []).length; i += 2) got[secRaw[i]] = JSON.parse(secRaw[i + 1]);
  // 루틴이 16:00에 돌면 자동 글이 아직 못 모은 업종이 있음 → 같은 계산(buildSectorClose)으로 채움 (저장은 하지 않음)
  const missing = SECTORS.filter(s => s.key !== 'usa' && !got[s.key]);
  const extra = await Promise.all(missing.map(s => buildSectorClose(s.key, now, null).then(p => p.stat || null, () => null)));
  missing.forEach((s, i) => { if (extra[i]) got[s.key] = extra[i]; });
  const sectors = Object.values(got).sort((a, b) => b.avg - a.avg);
  const settle = p => p.then(v => v, e => ({ error: String(e.message || e) }));
  const [close, us, mac, kospi20, kosdaq20, capK, capQ, upK, downK, upQ, downQ, news] = await Promise.all([
    settle(buildMarketClose(now, Object.fromEntries(sectors.map(s => [s.name, s])))), settle(buildMorning(now)), settle(macro()),
    settle(indexDays('KOSPI')), settle(indexDays('KOSDAQ')),
    settle(stocks('marketValue', 'KOSPI', 10)), settle(stocks('marketValue', 'KOSDAQ', 5)),
    settle(stocks('up', 'KOSPI', 8)), settle(stocks('down', 'KOSPI', 8)), settle(stocks('up', 'KOSDAQ', 8)), settle(stocks('down', 'KOSDAQ', 8)),
    settle(fetch(new URL('/api/news?sector=market', origin)).then(r => r.json()).then(j => (j.data || []).slice(0, 40).map(n => ({ title: n.title, press: n.press || n.source, time: n.datetime, url: n.url })))),
  ]);
  if (close?.skip) return { tradingDay: false, date: today, reason: `오늘 거래 없음 (${close.skip})` };
  return {
    tradingDay: true, date: today, generatedAt: new Date(now).toISOString(),
    market: close?.error ? close : { summary: close.summary, tables: close.tables },  // 지수·투자자별 순매수(억 원)·사이트 업종 평균
    sectors,  // 사이트 업종별: name, avg(평균 등락 %), up·down(오른·내린 종목 수), n(종목 수)
    macro: mac,  // 환율·WTI·브렌트·금·한국 3년/10년·미국 10년 (price, diff, rate %)
    usOvernight: us?.tables ? { summary: us.summary, tables: us.tables } : us,  // 간밤 미국 증시·빅테크
    indexDays: { KOSPI: kospi20, KOSDAQ: kosdaq20 },  // 최근 20거래일 종가
    stocks: { capTopKOSPI: capK, capTopKOSDAQ: capQ, upKOSPI: upK, downKOSPI: downK, upKOSDAQ: upQ, downKOSDAQ: downQ },
    news,  // 주식 시장 뉴스 제목 (최신순)
    disclosures: (discRaw || []).map(x => JSON.parse(x)).slice(0, 40),  // 오늘 모인 주요 공시 (16시부터 모으는 중이라 일부)
  };
}
