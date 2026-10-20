// GET /api/chart?codes=207940,068270,NVDA.O,... → { charts: { 코드: [[시가, 고가, 저가, 종가], ...] } }
//   가로 보기 줄마다 그리는 작은 일봉 (최근 CANDLES 거래일, 오래된 날 → 오늘 순)
//   종목마다 네이버 차트 API 1회 → Cloudflare 무료 서브요청 50 제한 때문에 한 번에 25종목까지 (app.js가 나눠 요청)
const CANDLES = 20;
const MAX_CODES = 25;

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

export default async function handler(req, res) {
  const all = String(req.query.codes || '').split(',').map(c => c.trim());
  const codes = [...new Set(all.filter(c => /^[0-9][0-9A-Z]{5}$/.test(c) || /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c)))].slice(0, MAX_CODES);
  if (!codes.length) return res.status(400).json({ error: '종목코드가 올바르지 않습니다' });

  // 휴장일을 감안해 45일 전부터 받아 최근 20거래일만 사용 (한국 시간 기준 오늘까지)
  const now = new Date(Date.now() + 9 * 3600e3);
  const start = ymd(new Date(now - 45 * 86400e3)) + '0000';
  const end = ymd(now) + '2359';

  const charts = {};
  await Promise.all(codes.map(async code => {
    const kind = /^[0-9]/.test(code) ? 'domestic' : 'foreign';
    try {
      const r = await fetch(`https://api.stock.naver.com/chart/${kind}/item/${code}/day?startDateTime=${start}&endDateTime=${end}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Referer': 'https://m.stock.naver.com/' },
      });
      if (!r.ok) return;
      const rows = await r.json();
      if (!Array.isArray(rows)) return;
      charts[code] = rows.slice(-CANDLES)
        .map(d => [d.openPrice, d.highPrice, d.lowPrice, d.closePrice].map(Number))
        .filter(c => c.every(n => Number.isFinite(n) && n > 0));
    } catch (e) {
      // 실패한 종목은 빠짐 (화면엔 빈칸)
    }
  }));

  // 장중엔 오늘 봉이 바뀌므로 5분 캐시
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.json({ charts });
}
