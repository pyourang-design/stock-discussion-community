// 문의 보내기 → /api/posts { action: 'contact' } (운영자만 관리자 모드에서 확인)
// contact.html 전용 (scripts/pages.mjs가 <script src>로 연결 — CSP 때문에 인라인 스크립트 대신 파일)
const CID = (() => { try { let id = localStorage.getItem('cid'); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem('cid', id); } return id; } catch { return 'tmp-' + Date.now().toString(36); } })();
async function sendContact() {
  const msg = document.getElementById('cMessage').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const out = document.getElementById('cResult');
  if (msg.length < 5) { out.textContent = '문의 내용을 5자 이상 입력해주세요.'; return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { out.textContent = '이메일 형식을 확인해주세요.'; return; }
  const btn = document.getElementById('cSubmit');
  btn.disabled = true;
  try {
    const res = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'contact', cid: CID, type: document.getElementById('cType').value, name: document.getElementById('cName').value.trim(), email, message: msg }) });
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.error || res.status);
    out.textContent = '문의가 접수되었습니다. 감사합니다.';
    document.getElementById('cMessage').value = '';
  } catch (e) {
    out.textContent = '보내지 못했습니다: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('cSubmit').addEventListener('click', sendContact);
