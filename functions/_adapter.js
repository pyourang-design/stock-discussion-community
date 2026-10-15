import { ASSET_VERSION } from './_assets.js';

// Vercel 방식(req, res) API 핸들러를 Cloudflare Pages Functions(fetch 방식)로 감싸는 어댑터
// api/*.js 코드는 그대로 두고 Vercel·Cloudflare 양쪽에서 동작하게 함
const HANDLERS = {
  column: () => import('../api/column.js'),
  detail: () => import('../api/detail.js'),
  market: () => import('../api/market.js'),
  news: () => import('../api/news.js'),
  page: () => import('../api/page.js'),
  posts: () => import('../api/posts.js'),
  report: () => import('../api/report.js'),
  rss: () => import('../api/rss.js'),
  stock: () => import('../api/stock.js'),
};

const CACHE_PARAMS = ['code', 'codes', 'sector', 'type', 'kind', 'id', 'counts', 'page'];

export async function runVercelHandler(name, context, extraQuery = {}) {
  const load = HANDLERS[name];
  if (!load) return new Response('Not Found', { status: 404 });
  // 환경변수(Upstash, ADMIN_PASSWORD)를 process.env로 노출
  for (const [k, v] of Object.entries(context.env || {})) if (typeof v === 'string') process.env[k] = v;

  const { request } = context;
  const url = new URL(request.url);

  // s-maxage가 붙은 GET 응답은 Cloudflare 엣지 캐시에 저장 (Vercel CDN 캐시와 같은 효과)
  // 캐시 키: 쓰는 값만 남기고 정렬 (아무 값이나 붙여 캐시를 우회하며 네이버·구글·DB 호출을 늘리지 못하게)
  // 종목 페이지·RSS는 주소의 쿼리를 아예 무시
  const cache = caches.default;
  const keyUrl = new URL(url.origin + url.pathname);
  if (name !== 'page' && name !== 'rss') {
    for (const k of CACHE_PARAMS) {
      const v = url.searchParams.get(k);
      if (v == null) continue;
      keyUrl.searchParams.set(k, k === 'codes' ? [...new Set(v.split(','))].sort().join(',') : k === 'page' ? String(Math.min(Math.max(1, parseInt(v, 10) || 1), 1000)) : v);
    }
  }
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });
  const readOnly = request.method === 'GET' || request.method === 'HEAD';
  if (readOnly) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const out = new Response(request.method === 'HEAD' ? null : hit.body, hit);
      out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      return out;
    }
  }

  // 캐시하는 응답은 캐시 키와 같은 값으로 만듦 (쿼리 순서·중복과 무관하게 같은 결과)
  const query = { ...Object.fromEntries(name === 'page' || name === 'rss' ? [] : keyUrl.searchParams), ...(name === 'posts' ? Object.fromEntries(url.searchParams) : {}), ...extraQuery };
  let body;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const text = await request.text();
    try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  }
  const req = { method: request.method, query, body, headers: Object.fromEntries(request.headers), url: url.pathname + url.search, env: context.env || {} };

  let response = await new Promise((resolve, reject) => {
    const headers = new Headers();
    let status = 200;
    const res = {
      setHeader(k, v) { headers.set(k, v); return res; },
      status(code) { status = code; return res; },
      json(obj) { if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8'); resolve(new Response(JSON.stringify(obj), { status, headers })); return res; },
      send(data) { resolve(new Response(data, { status, headers })); return res; },
      end(data) { resolve(new Response(status === 204 || status === 301 || status === 302 ? null : (data ?? null), { status, headers })); return res; },
    };
    load().then(m => m.default(req, res)).catch(reject);
  }).catch(err => {
    console.error(`api/${name} error`, err);
    return new Response(JSON.stringify({ error: '일시적인 오류가 발생했습니다' }), { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  });

  // 서버 렌더링 HTML의 CSS·JS 링크에도 버전(?v=)을 붙임 (브라우저 캐시에 남은 옛 파일 방지)
  if ((response.headers.get('Content-Type') || '').startsWith('text/html')) {
    const html = (await response.text()).replace(/((?:src|href)="\/?)(styles\.css|app\.js|stocks\.js|theme\.js|contact\.js|visit\.js)"/g, (_, a, f) => `${a}${f}?v=${ASSET_VERSION[f]}"`);
    response = new Response(html, response);
  }

  const cc = response.headers.get('Cache-Control') || '';
  const m = cc.match(/s-maxage=(\d+)/);
  if (readOnly && response.status === 200 && m) {
    const cached = new Response(response.clone().body, response);
    cached.headers.set('Cache-Control', `public, max-age=${m[1]}`);
    context.waitUntil(cache.put(cacheKey, cached));
    // 브라우저에는 캐시하지 않도록 (Vercel의 s-maxage 동작과 동일)
    const out = new Response(response.body, response);
    out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return out;
  }
  return response;
}
