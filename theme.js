// 다크/라이트 화면 전환 (모든 페이지 공통, <head>에서 먼저 읽어 화면 깜빡임 없이 적용)
// 기본값: ① 버튼으로 고른 모드(이 브라우저에 기억, localStorage 'theme') → ② 기기 설정(다크/라이트) → ③ 설정을 알 수 없으면 라이트
function savedTheme() {
  try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
}
function systemDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}
function applyTheme() {
  const light = (savedTheme() || (systemDark() ? 'dark' : 'light')) === 'light';
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}
applyTheme();

// 직접 고른 적이 없으면 기기 설정이 바뀔 때(예: 밤에 자동 다크) 따라감
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme()) { applyTheme(); renderThemeButtons(); }
  });
} catch (e) {}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function renderThemeButtons() {
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.textContent = isLightTheme() ? 'Light' : 'Dark';
    b.title = isLightTheme() ? '눌러서 다크모드로' : '눌러서 라이트모드로';
  });
}

function toggleTheme() {
  const light = !isLightTheme();
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
  renderThemeButtons();
}

document.addEventListener('DOMContentLoaded', renderThemeButtons);
