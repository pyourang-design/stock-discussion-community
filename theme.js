// 다크/화이트 화면 전환 (모든 페이지 공통, <head>에서 먼저 읽어 화면 깜빡임 없이 적용)
// 기본은 다크, 선택한 모드는 이 브라우저에 기억 (localStorage 'theme')
(function () {
  try {
    if (localStorage.getItem('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
})();

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function renderThemeButtons() {
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.textContent = isLightTheme() ? '라이트모드' : '다크모드';
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
