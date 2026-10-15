// 종목·칼럼 페이지(api/page.js 서버 렌더링) 조회수 집계 — CSP 때문에 인라인 스크립트 대신 파일
try {
  let id = localStorage.getItem('cid');
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem('cid', id); }
  fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'visit', cid: id }) });
} catch (e) {}
