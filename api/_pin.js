// 종목 토론방 상단 고정 글: 운영자(AI 운영자 아님)가 '[운영자 종목 체크포인트]'로 시작해 쓴 글 (블라인드 글은 제외)
// DB 키: pins:{종목코드} 고정 글 id (set) — 글이 많아져 최신 목록(posts:{코드} 앞 200개)에서 밀려나도 항상 함께 불러옴
// 쓰는 곳: api/posts.js(글쓰기·수정·삭제 때 pins 갱신, 목록 맨 위로), api/page.js(종목 페이지 첫 쪽 맨 위), app.js(📌 표시)
export const PIN_PREFIX = '[운영자 종목 체크포인트]';
export const pinKey = code => `pins:${code}`;
export const isPinPost = p => Boolean(p && p.official && !p.ai && !p.blind && String(p.content || '').startsWith(PIN_PREFIX));
// 고정 글을 최신순으로 맨 위에 (pinned: true), 나머지는 원래 순서 그대로
export const pinFirst = posts => [
  ...posts.filter(isPinPost).sort((a, b) => b.ts - a.ts).map(p => ({ ...p, pinned: true })),
  ...posts.filter(p => !isPinPost(p)),
];
