// GET /api/news?sector=semi&codes=005930,000660,...  → 업종 뉴스 (최신순)
//   - 네이버: 업종 대표 종목들의 네이버 종목 뉴스 (미국 종목은 네이버 해외주식 뉴스)
// { data: [{ title, summary, press, datetime, url, thumb, codes: [관련 종목코드], source: 'naver' }] }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_CODES = 15;
const MAX_ITEMS = 50;

const stripTags = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

// 미국 종목: 네이버 해외주식 뉴스 (로이터 등)
async function usStockNews(code) {
  const r = await fetch(`https://api.stock.naver.com/news/worldStock/${code}?pageSize=10&page=1`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(n => ({
    id: `${n.oid}_${n.aid}`,
    title: stripTags(n.tit),
    summary: stripTags(n.subcontent),
    press: n.ohnm,
    datetime: String(n.dt || '').slice(0, 12),
    url: `https://n.news.naver.com/article/${n.oid}/${n.aid}`,
    thumb: n.thumbUrl || null,
    code,
    source: 'naver',
  }));
}

async function stockNews(code) {
  if (!/^[0-9][0-9A-Z]{5}$/.test(code)) return usStockNews(code);
  const r = await fetch(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=15&page=1`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.flatMap(g => g.items ?? []).map(n => ({
    id: `${n.officeId}_${n.articleId}`,
    title: stripTags(n.titleFull || n.title),
    summary: stripTags(n.body),
    press: n.officeName,
    datetime: n.datetime, // YYYYMMDDHHmm
    url: n.mobileNewsUrl || `https://n.news.naver.com/mnews/article/${n.officeId}/${n.articleId}`,
    thumb: n.imageOriginLink || null,
    code,
    source: 'naver',
  }));
}

export default async function handler(req, res) {
  const codes = String(req.query.codes || '')
    .split(',')
    .map(c => c.trim())
    .filter(c => /^[0-9][0-9A-Z]{5}$/.test(c) || /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c))
    .slice(0, MAX_CODES);

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!codes.length) return res.status(400).json({ error: '종목코드 또는 업종이 올바르지 않습니다' });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=60');

  const results = await Promise.allSettled([...codes.map(stockNews)]);
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (!items.length) return res.status(502).json({ error: '뉴스를 불러오지 못했습니다' });

  // 같은 기사(여러 종목에 걸친 업종 기사)는 하나로 합치고 관련 종목을 모음
  const byKey = new Map();
  for (const n of items) {
    const key = n.title.replace(/\s+/g, '');
    const prev = byKey.get(key) || byKey.get(n.id);
    if (prev) {
      if (n.code && !prev.codes.includes(n.code)) prev.codes.push(n.code);
      continue;
    }
    const { code, id, ...rest } = n;
    const item = { ...rest, codes: code ? [code] : [] };
    byKey.set(key, item);
    byKey.set(id, item);
  }
  const data = [...new Set(byKey.values())]
    .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))
    .slice(0, MAX_ITEMS);

  res.json({ data });
}
