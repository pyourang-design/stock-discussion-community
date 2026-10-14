// /sitemap.xml → 정적 사이트맵(scripts/seo.mjs가 만든 홈·정책·종목 페이지) + 운영자 칼럼 페이지를 덧붙여 응답
// 칼럼은 관리자 화면에서 수시로 쓰므로 DB에서 읽어 자동 반영 (검색엔진에 사이트맵을 다시 제출할 필요 없음)
// Cloudflare 캐시에 10분 보관 (요청마다 DB를 읽지 않게)
import { redis, dbReady } from '../api/_redis.js';

const SITE = 'https://upjong.com';
const TTL = 600;
const kstDay = ts => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const cacheKey = new Request(new URL('/sitemap.xml', request.url).toString());
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;

  const base = await env.ASSETS.fetch(new URL('/sitemap.xml', request.url));
  let xml = base.ok ? await base.text() : '';
  if (!xml.includes('</urlset>')) return new Response('sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
  try {
    for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
    if (dbReady()) {
      const [ids] = await redis([['LRANGE', 'posts:COLMKT', 0, 199]]);
      const raws = ids?.length ? (await redis([['MGET', ...ids.map(id => `post:${id}`)]]))[0] : [];
      const posts = (raws || []).filter(Boolean).map(r => JSON.parse(r)).filter(p => !p.blind && Number.isFinite(p.ts));
      if (posts.length) {
        const latest = Math.max(...posts.map(p => p.editedTs || p.ts));
        const urls = [`  <url><loc>${SITE}/column</loc><lastmod>${kstDay(latest)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
          ...posts.map(p => `  <url><loc>${SITE}/column/${p.id}</loc><lastmod>${kstDay(p.editedTs || p.ts)}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`)];
        xml = xml.replace('</urlset>', urls.join('\n') + '\n</urlset>');
      }
    }
  } catch (e) {
    console.error('sitemap columns', e);  // DB 오류 시 정적 사이트맵만 (캐시하지 않음)
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const res = new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': `public, max-age=${TTL}` } });
  waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}
