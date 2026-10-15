// www.upjong.com · stock-forum.pages.dev → https://upjong.com 으로 301 (검색엔진 중복 주소 방지)
// 미리보기 배포(<hash>.stock-forum.pages.dev)는 그대로 둠
const CANONICAL = 'upjong.com';
const ALIASES = new Set(['www.upjong.com', 'stock-forum.pages.dev']);
const HTML_CSP = [
  "default-src 'self'",
  // Cloudflare Web Analytics(대시보드에서 켜 둔 방문 통계)가 넣는 스크립트·전송 주소 허용
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://cloudflareinsights.com",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

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
  // HTML은 전체 CSP: 스크립트는 이 사이트 파일만(인라인 onclick·<script> 금지 — app.js data-act로 처리), 그림은 https 어디서나(로고·뉴스 썸네일)
  // 애드센스 붙일 때 script-src·frame-src·connect-src에 구글 광고 주소 추가 필요. PDF·JSON 등은 기존 최소 정책 유지(PDF 보기 영향 없게)
  const isHtml = (out.headers.get('Content-Type') || '').startsWith('text/html');
  out.headers.set('Content-Security-Policy', isHtml ? HTML_CSP : "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  if (url.hostname !== CANONICAL) out.headers.set('X-Robots-Tag', 'noindex');  // 미리보기 배포 주소
  return out;
}
