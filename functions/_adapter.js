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

const CACHE_PARAMS = ['code', 'codes', 'sector', 'type', 'kind', 'id', 'counts', 'page', 'google'];

export async function runVercelHandler(name, context, extraQuery = {}) {
  const load = HANDLERS[name];
  if (!load) return new Response('Not Found', { status: 404 });
  // 환경변수(Upstash, ADMIN_PASSWORD)를 process.env로 노출
  for (const [k, v] of Object.entries(context.env || {})) if (typeof v === 'string') process.env[k] = v;

  const { request } = context;
  const url = new URL(request.url);

  // s-maxage가 붙은 GET 응답은 Cloudflare 엣지 캐시에 저장 (Vercel CDN 캐시와 같은 효과)
  // 캐시 키: 쓰는 값만 남기고 정렬 (아무 값이나 붙여 캐시를 우회하며 네이버·구글·DB 호출을 늘리지 못하게)
  // 종목 페이지는 토론글 쪽 번호(page 2~1000)만, RSS는 쿼리를 아예 무시
  const cache = caches.default;
  const keyUrl = new URL(url.origin + url.pathname);
  if (name === 'page') {
    const n = parseInt(url.searchParams.get('page'), 10);
    if (n >= 2 && n <= 1000) keyUrl.searchParams.set('page', String(n));
  } else if (name !== 'rss') {
    for (const k of CACHE_PARAMS) {
      const v = url.searchParams.get(k);
      if (v == null) continue;
      keyUrl.searchParams.set(k, k === 'codes' ? [...new Set(v.split(','))].sort().join(',') : k === 'page' ? String(Math.min(Math.max(1, parseInt(v, 10) || 1), 1000)) : v);
    }
  }
  const cacheKey = new Request(keyUrl.toString(), { method: 'GET' });
  const readOnly = request.method === 'GET' || request.method === 'HEAD';

  // 캐시하는 응답은 캐시 키와 같은 값으로 만듦 (쿼리 순서·중복과 무관하게 같은 결과)
  const query = { ...Object.fromEntries(name === 'rss' ? [] : keyUrl.searchParams), ...(name === 'posts' ? Object.fromEntries(url.searchParams) : {}), ...extraQuery };
  let body;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const text = await request.text();
    try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
  }
  const req = { method: request.method, query, body, headers: Object.fromEntries(request.headers), url: url.pathname + url.search, env: context.env || {} };

  // 핸들러 실행 → Response
  const run = async () => {
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
    return response;
  };

  // s-maxage 동안은 새것, 그 뒤 stale-while-revalidate 동안은 캐시를 바로 돌려주고 뒤에서 새로 받아 둠
  // (기다리는 사람 없이 항상 빠르게 — 뉴스·리포트·공시·종목 페이지). 새것 기한은 X-Fresh-Until(ms)에 적어 둠
  const ttl = response => {
    const cc = response.headers.get('Cache-Control') || '';
    const m = cc.match(/s-maxage=(\d+)/);
    return m ? { fresh: Number(m[1]), stale: Number((cc.match(/stale-while-revalidate=(\d+)/) || [])[1] || 0) } : null;
  };
  const store = (response, t, freshMs = t.fresh * 1000) => {
    const cached = new Response(response.body, response);
    cached.headers.set('Cache-Control', `public, max-age=${t.fresh + t.stale}`);
    cached.headers.set('X-Fresh-Until', String(Date.now() + freshMs));
    return cache.put(cacheKey, cached);
  };
  const toClient = (response, head) => {
    const out = new Response(head ? null : response.body, response);
    out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');  // 브라우저에는 캐시하지 않도록 (Vercel의 s-maxage 동작과 동일)
    out.headers.delete('X-Fresh-Until');
    return out;
  };

  if (readOnly) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const freshUntil = Number(hit.headers.get('X-Fresh-Until') || 0);
      if (freshUntil && Date.now() > freshUntil) {
        context.waitUntil((async () => {
          await store(hit.clone(), { fresh: 0, stale: 120 }, 20000).catch(() => {});  // 새로 받는 20초 동안 다른 요청이 또 받지 않게
          const fresh = await run();
          const ft = ttl(fresh);
          if (fresh.status === 200 && ft) await store(fresh, ft);
        })());
      }
      return toClient(hit, request.method === 'HEAD');
    }
  }

  const response = await run();
  const t = ttl(response);
  if (readOnly && response.status === 200 && t) {
    context.waitUntil(store(response.clone(), t));
    return toClient(response);
  }
  return response;
}
