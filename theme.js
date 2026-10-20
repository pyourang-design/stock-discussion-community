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

// 홈 화면 앱 정보(manifest)는 삼성 인터넷에는 주지 않음: 삼성 인터넷이 만드는 설치 앱(APK)은 구형 안드로이드 기준이라
// 최신 갤럭시의 Play 프로텍트가 "안전하지 않은 앱 차단"으로 막음 → 삼성 인터넷은 '현재 페이지 추가 → 홈 화면' 일반 바로가기로 (app.js addToHome 안내)
if (!/SamsungBrowser/i.test(navigator.userAgent)) {
  const m = document.createElement('link');
  m.rel = 'manifest';
  m.href = '/manifest.webmanifest';
  document.head.appendChild(m);
}

// 직접 고른 적이 없으면 기기 설정이 바뀔 때(예: 밤에 자동 다크) 따라감
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme()) { applyTheme(); renderThemeButtons(); }
  });
} catch (e) {}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

// 버튼엔 누르면 바뀔 모드를 보여줌: 화이트 화면이면 🌙 Dark, 다크 화면이면 ☀️ Light (가로 보기 버튼과 같은 방식)
const THEME_ICON = {
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
};
function renderThemeButtons() {
  const next = isLightTheme() ? 'dark' : 'light';
  document.querySelectorAll('.theme-toggle').forEach(b => {
    const label = b.querySelector('.nav-label');
    if (label) {
      b.querySelector('svg')?.remove();
      label.insertAdjacentHTML('beforebegin', THEME_ICON[next]);
      label.textContent = next === 'dark' ? 'Dark' : 'Light';
    } else b.textContent = next === 'dark' ? 'Dark' : 'Light';
    b.title = next === 'dark' ? '눌러서 다크모드로' : '눌러서 라이트모드로';
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

// 종목 목록 보기 방식: 카드 보기(기본) ↔ 가로 보기(네이버 관심종목처럼 한 종목 한 줄), 이 브라우저에 기억 (localStorage 'view')
// <html data-view="list">로 styles.css가 모양을 바꿈 — 홈이 아닌 페이지에서 누르면 바꾼 뒤 홈으로
function isListView() {
  return document.documentElement.getAttribute('data-view') === 'list';
}
try { if (localStorage.getItem('view') === 'list') document.documentElement.setAttribute('data-view', 'list'); } catch (e) {}

const VIEW_ICON = {
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
};
function renderViewButtons() {
  const list = isListView();
  document.querySelectorAll('.view-toggle').forEach(b => {
    b.innerHTML = `${VIEW_ICON[list ? 'card' : 'list']}<span>${list ? '카드 보기' : '가로 보기'}</span>`;  // 누르면 바뀔 모양을 보여줌
    b.title = list ? '눌러서 카드로 보기' : '눌러서 한 줄로 보기';
  });
}

function toggleView() {
  const list = !isListView();
  if (list) document.documentElement.setAttribute('data-view', 'list');
  else document.documentElement.removeAttribute('data-view');
  try { localStorage.setItem('view', list ? 'list' : 'card'); } catch (e) {}
  renderViewButtons();
  if (!document.getElementById('stockList')) location.href = '/';
  else document.dispatchEvent(new Event('viewchange'));  // app.js가 가로 보기 일봉을 불러옴
}
document.addEventListener('DOMContentLoaded', renderViewButtons);
// 이미 홈 화면 앱으로 연 경우 하단 메뉴 '앱 다운' 숨김 (모든 페이지)
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true) document.querySelectorAll('.nav-app').forEach(b => b.classList.add('hidden'));
  } catch (e) {}
});

// 인라인 onclick 없이 처리 (보안 헤더 CSP script-src 'self'): 테마 버튼, data-go 링크(누르면 그 주소로 — 검색엔진엔 href 주소를 보여줌)
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('.theme-toggle, .view-toggle, a[data-go]');
  if (!t) return;
  if (t.classList.contains('theme-toggle')) return toggleTheme();
  if (t.classList.contains('view-toggle')) return toggleView();
  e.preventDefault();
  location.href = t.dataset.go;
});

// 운영자 칼럼 보호(.no-copy): 글 선택·복사·잘라내기, 오른쪽 버튼(사진 저장), 사진 끌어다 저장 막기
// (사이트 칼럼 탭과 /column/{id} 페이지 공통. 관리자 모드에서는 app.js가 .no-copy를 붙이지 않음)
function inNoCopy(node) {
  const el = node && (node.nodeType === 1 ? node : node.parentElement);
  return !!(el && el.closest && el.closest('.no-copy'));
}
['contextmenu', 'dragstart', 'selectstart'].forEach(type => document.addEventListener(type, e => {
  if (inNoCopy(e.target)) e.preventDefault();
}));
['copy', 'cut'].forEach(type => document.addEventListener(type, e => {
  const sel = window.getSelection && window.getSelection();
  // 칼럼 바깥에서 드래그해 칼럼까지 걸친 선택(전체 선택 Ctrl+A 포함)도 막음
  const touches = sel && !sel.isCollapsed && ([...document.querySelectorAll('.no-copy')].some(el => sel.containsNode(el, true)) || inNoCopy(sel.anchorNode));
  if (inNoCopy(e.target) || touches) e.preventDefault();
}));

// 소개·약관·개인정보·연락처 페이지 오른쪽 위 '닫기': 사이트 안에서 왔으면 이전 화면으로, 주소로 바로 들어왔으면 홈으로
document.addEventListener('click', e => {
  if (!(e.target.closest && e.target.closest('[data-close-page]'))) return;
  let fromSite = false;
  try { fromSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch (err) {}
  if (fromSite && history.length > 1) history.back();
  else location.href = '/';
});
