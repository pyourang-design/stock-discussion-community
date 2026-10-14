// /favicon.ico → 로고 아이콘(/favicon.svg)으로 (아이콘 링크를 안 보는 브라우저·검색 로봇용)
export const onRequest = ({ request }) => Response.redirect(new URL('/favicon.svg', request.url).toString(), 301);
