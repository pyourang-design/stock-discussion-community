// AI 운영자 자동 글 일시 정지 (2026-11-02, 애드센스 심사 대비) — 승인 후 둘 다 false로 되돌리면 원래대로
//   intro  : 📊 종목 소개글 새로 쓰기 멈춤 (api/_ai.js — 업종 탭 종목·숨은 종목 둘 다). 📢 실적 발표 글은 계속 씀
//   market : 업종·시장 게시판 자동 글(🌅 장 시작 전 체크 · 🔔 업종 장 마감 성적표 · 🔔 장 마감 시황 · 📋 업종 주요 공시 모음)
//            새로 쓰기 멈춤(api/_aiMarket.js) + 이미 쓴 글은 화면에서 숨김(api/posts.js 목록·작성자 목록, api/rss.js). DB의 글은 그대로 둠
// 종목 토론방의 AI 글(소개·실적)은 토론 창에 그대로 보이고, 종목 페이지(/stock/코드)에서는 '실적 요약' 칸에 최신 1건만 (api/page.js)
export const AI_PAUSE = { intro: true, market: true };

// 업종·시장 게시판(SEC로 시작하는 게시판 코드)의 AI 운영자 글인지
export const isHiddenAiPost = p => AI_PAUSE.market && Boolean(p?.ai) && /^SEC/.test(String(p.code || ''));
