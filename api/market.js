// GET /api/market → 상단 지수 6개 (네이버 금융)
// KOSPI · KOSDAQ · USD/KRW · 다우 · 나스닥 · S&P500
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' };

const num = v => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const fromPolling = (key, name, d) => ({
  key, name,
  value: num(d.closePrice),
  diff: num(d.compareToPreviousClosePrice),
  rate: num(d.fluctuationsRatio),
  status: d.marketStatus ?? null,
  time: d.localTradedAt ?? null,
});

async function domestic() {
  const j = await getJson('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ');
  const by = Object.fromEntries((j.datas ?? []).map(d => [d.itemCode, d]));
  return [fromPolling('KOSPI', 'KOSPI', by.KOSPI), fromPolling('KOSDAQ', 'KOSDAQ', by.KOSDAQ)];
}

async function world() {
  const j = await getJson('https://polling.finance.naver.com/api/realtime/worldstock/index/.DJI,.IXIC,.INX');
  const by = Object.fromEntries((j.datas ?? []).map(d => [d.reutersCode, d]));
  return [
    fromPolling('DJI', '다우존스', by['.DJI']),
    fromPolling('IXIC', '나스닥', by['.IXIC']),
    fromPolling('INX', 'S&P 500', by['.INX']),
  ];
}

async function marketIndex(key, name, path, unit) {
  const d = await getJson(`https://api.stock.naver.com/marketindex/${path}`);
  const info = d.exchangeInfo ?? d;
  return {
    key, name, unit,
    value: num(info.closePrice),
    diff: num(info.fluctuations),
    rate: num(info.fluctuationsRatio),
    status: info.marketStatus ?? null,
    time: info.localTradedAt ?? null,
    delay: info.delayTimeName || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  // 한 곳이 실패해도 나머지 지수는 표시
  const settled = await Promise.allSettled([
    domestic(),
    marketIndex('USDKRW', 'USD/KRW', 'exchange/FX_USDKRW', '원'),
    world(),
  ]);
  const indices = settled.flatMap(s => (s.status === 'fulfilled' ? [s.value].flat() : []));
  if (!indices.length) return res.status(500).json({ error: '지수 데이터를 불러오지 못했습니다' });
  res.json({ indices });
}
