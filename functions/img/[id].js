// GET /img/{id} → 운영자 칼럼 사진 (Workers KV IMAGES의 img:{id})
// 사진은 바뀌지 않으므로 Cloudflare 캐시·브라우저에 1년 캐시 (KV 조회 횟수 절약)
const ID_RE = /^[0-9a-f]{24}\.(webp|jpg|png|gif)$/;
const TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

export async function onRequestGet({ request, params, env, waitUntil }) {
  const id = String(params.id || '');
  if (!ID_RE.test(id) || !env.IMAGES) return new Response('Not Found', { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(`/img/${id}`, request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const data = await env.IMAGES.get(`img:${id}`, 'arrayBuffer');
  if (!data) return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const res = new Response(data, {
    headers: {
      'Content-Type': TYPES[id.split('.').pop()],  // 저장할 때 확인한 형식만 (SVG 등은 애초에 저장 불가)
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  waitUntil(cache.put(key, res.clone()));
  return res;
}
