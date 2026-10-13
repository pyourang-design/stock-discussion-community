// [Vercel 전용] Google 뉴스 RSS 중계 — Cloudflare 서버 IP는 Google이 503으로 막아서 Vercel을 거쳐 가져옴
// GET /api/gnews?q=<검색어>&when=1d  (헤더 x-proxy-key = Vercel 환경변수 GNEWS_PROXY_KEY 일 때만 응답)
// 운영 사이트(upjong.com, Cloudflare Pages)의 api/_google.js만 호출. Cloudflare에서는 이 파일을 쓰지 않음
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const digest = v => crypto.createHash('sha256').update(String(v ?? '')).digest();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.GNEWS_PROXY_KEY;
  if (!key || !crypto.timingSafeEqual(digest(req.headers['x-proxy-key']), digest(key))) return res.status(403).send('Forbidden');

  const q = String(req.query.q || '').slice(0, 300);
  const when = /^\d{1,2}[dh]$/.test(req.query.when || '') ? req.query.when : '1d';
  if (!q) return res.status(400).send('q required');

  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${when}`)}&hl=ko&gl=KR&ceid=KR:ko`, { headers: { 'User-Agent': UA } });
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.status(r.status).send(await r.text());
}
