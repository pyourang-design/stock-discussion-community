// 네이버 서치어드바이저 소유확인 파일 (HTML 파일 방식)
// 정적 .html은 Cloudflare Pages가 확장자 없는 주소로 308 리다이렉트하므로 함수로 직접 응답
export const onRequest = () => new Response('naver-site-verification: navereef5b478f9f61ceb482eaa18871df0b8.html', {
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
