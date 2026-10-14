// www.upjong.com · stock-forum.pages.dev → https://upjong.com 으로 301 (검색엔진 중복 주소 방지)
// 미리보기 배포(<hash>.stock-forum.pages.dev)는 그대로 둠
const CANONICAL = 'upjong.com';
const ALIASES = new Set(['www.upjong.com', 'stock-forum.pages.dev']);

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (ALIASES.has(url.hostname)) {
    url.hostname = CANONICAL;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  if (url.hostname !== CANONICAL) out.headers.set('X-Robots-Tag', 'noindex');  // 미리보기 배포 주소
  return out;
}
