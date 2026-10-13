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
  return next();
}
