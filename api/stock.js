export default async function handler(req, res) {
  const { code = '005930' } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  try {
    const r = await fetch(
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Referer': 'https://finance.naver.com/',
          'Accept': 'application/json',
        },
      }
    );

    if (!r.ok) throw new Error(`Naver HTTP ${r.status}`);

    const json = await r.json();
    const d = json.result?.datas?.[0] ?? json.datas?.[0];
    if (!d) throw new Error('데이터 없음');

    res.json({
      code,
      price:      Number(String(d.closePrice).replace(/,/g, '')),
      diff:       Number(String(d.compareToPreviousClosePrice).replace(/,/g, '')),
      changeRate: Number(String(d.fluctuationsRatio).replace(/,/g, '')),
      volume:     Number(String(d.accumulatedTradingVolume ?? '0').replace(/,/g, '')),
      time:       d.localTradedAt ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
