// GET /api/stock?code=207940            → 단일 종목 (기존 호환)
// GET /api/stock?codes=207940,068270,... → 여러 종목 일괄 조회 { stocks: [...] }
//   미국 종목은 네이버 해외주식 코드(TSLA.O, VOO, BRKb)로 함께 조회 가능
import { pickPrice } from './_price.js';

const toNum = v => {
  const n = Number(String(v ?? '0').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// 장 마감 후·장 시작 전에는 시간외(넥스트레이드·미국 프리/애프터마켓) 가격이 더 최근이면 그 가격 (api/_price.js)
function parse(d) {
  const p = pickPrice(d);
  return {
    code:       d.itemCode ?? d.reutersCode,
    price:      p.price,
    diff:       p.diff,
    changeRate: p.changeRate,
    volume:     toNum(d.accumulatedTradingVolume),
    status:     d.marketStatus ?? null,
    time:       p.time,
    session:    p.session,
  };
}

export default async function handler(req, res) {
  const { code, codes } = req.query;
  const all = String(codes || code || '207940').split(',').map(c => c.trim());
  const list = all.filter(c => /^[0-9][0-9A-Z]{5}$/.test(c)).slice(0, 50);
  const usList = all.filter(c => /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c)).slice(0, 50);

  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  if (!list.length && !usList.length) return res.status(400).json({ error: '종목코드가 올바르지 않습니다' });

  const poll = async (type, l) => {
    if (!l.length) return [];
    const r = await fetch(
      `https://polling.finance.naver.com/api/realtime/${type}/stock/${l.join(',')}`,
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
    return json.result?.datas ?? json.datas ?? [];
  };

  try {
    const datas = (await Promise.all([poll('domestic', list), poll('worldstock', usList)])).flat();
    if (!datas.length) throw new Error('데이터 없음');

    if (codes) return res.json({ stocks: datas.map(parse) });
    res.json(parse(datas[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
