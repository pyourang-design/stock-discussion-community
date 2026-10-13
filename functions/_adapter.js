// Vercel 방식(req, res) API 핸들러를 Cloudflare Pages Functions(fetch 방식)로 감싸는 어댑터
// api/*.js 코드는 그대로 두고 Vercel·Cloudflare 양쪽에서 동작하게 함
const HANDLERS = {
  detail: () => import('../api/detail.js'),
  market: () => import('../api/market.js'),
  news: () => import('../api/news.js'),
  page: () => import('../api/page.js'),
  posts: () => import('../api/posts.js'),
  rss: () => import('../api/rss.js'),
  stock: () => import('../api/stock.js'),
};

export async function runVercelHandler(name, context, extraQuery = {}) {
  const load = HANDLERS[name];
  if (!load) return new Response('Not Found', { status: 404 });
  // 환경변수(Upstash, ADMIN_PASSWORD)를 process.env로 노출
  for (const [k, v] of Object.entries(context.env || {})) if (typeof v === 'string') process.env[k] = v;

  const { request } = context;
  const url = new URL(request.url);

  // s-maxage가 붙은 GET 응답은 Cloudflare 엣지 캐시에 저장 (Vercel CDN 캐시와 같은 효과)
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (request.method === 'GET') {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  const query = { ...Object.fromEntries(url.searchParams), ...extraQuery };
  let body;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const text = await request.text();
    try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  }
  const req = { method: request.method, query, body, headers: Object.fromEntries(request.headers), url: url.pathname + url.search };

  const response = await new Promise((resolve, reject) => {
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
  });

  const cc = response.headers.get('Cache-Control') || '';
  const m = cc.match(/s-maxage=(\d+)/);
  if (request.method === 'GET' && response.status === 200 && m) {
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
