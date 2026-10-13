// ── 상태 ──────────────────────────────────────────────
let currentFilter = SECTORS[0].key;  // 현재 업종 탭
let currentStock = null;
let currentModalTab = 'discuss';
// index.html을 파일로 직접 열었을 때(file://)는 운영 서버 API 사용
const API_BASE = location.protocol === 'file:' ? 'https://upjong.com' : '';

// ── 초기화 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 맨 앞 '관심 종목' 탭 (회원 전용), 처음 화면은 첫 업종 탭
  document.getElementById('tabBar').innerHTML = [FAV_TAB, ...SECTORS].map(sec =>
    `<button class="tab${sec.key === currentFilter ? ' active' : ''}" onclick="filterTab('${sec.key}', this)">${tabLabel(sec)}</button>`).join('');
  renderTabNote();
  renderStocks(filteredList());
  startRealtime();
  loadSectorNews();
  setInterval(whenVisible(() => loadSectorNews(true)), NEWS_REFRESH);
  startMarketBanner();
  refreshAdminUi();
  loadForumMeta();
  checkMember();
  openFromUrl();
  countVisit();
  document.getElementById('postContent').addEventListener('input', updateCharCount);
});

// 사이트 조회수 (같은 브라우저 30분에 1회 집계) → 상단 "오늘 N · 누적 N"
async function countVisit() {
  try {
    const r = await api({}, { action: 'visit' });
    document.getElementById('siteStats').innerHTML = `오늘 <b>${r.today.toLocaleString()}</b> · 누적 <b>${r.total.toLocaleString()}</b>`;
  } catch {}
}

// 주소로 바로 열기: /?stock=005930 → 그 종목이 속한 업종 탭 + 토론 창, /?sector=bio → 업종 탭 (종목 페이지에서 넘어올 때)
function openFromUrl() {
  const q = new URLSearchParams(location.search);
  const s = STOCKS.find(x => x.code === q.get('stock'));
  const key = s ? Object.keys(s.sectors)[0] : q.get('sector');
  if (key && SECTORS.some(x => x.key === key) && key !== currentFilter) {
    const btn = [...document.querySelectorAll('#tabBar .tab')].find(b => b.getAttribute('onclick') === `filterTab('${key}', this)`);
    if (btn) filterTab(key, btn);
  }
  if (s) openModal(s.code);
}

// 탭 이름: PC는 한 줄, 모바일은 두 단어를 두 줄로 (예: 전력 / 원자력)
const FAV_TAB = { key: 'fav', name: '관심 종목' };
const TAB_LINES = { fav: ['관심', '종목'], battery: ['2차전지', '로봇'], power: ['전력', '원자력'], kbeauty: ['K뷰티', '컬쳐'], ship: ['조선', '방산'], usa: ['미국', '주식'] };
function tabLabel(sec) {
  const l = TAB_LINES[sec.key];
  return l ? `<span class="tab-pc">${sec.name}</span><span class="tab-mo">${l[0]}<br>${l[1]}</span>` : sec.name;
}

// 탭 아래 선정 기준 안내
function renderTabNote() {
  document.getElementById('tabNote').textContent = currentFilter === 'fav'
    ? '종목 카드의 ☆를 눌러 추가한 관심 종목 (회원 전용)'
    : currentFilter === 'usa'
    ? '국내 투자자 보유 TOP50 + 관심 TOP50 (한국예탁결제원) · 시총순'
    : '시총 TOP20 + 토론글 TOP20 + 거래대금 TOP10 · 시총순';
}

// 가격 표시: 국내 원, 미국 달러
const fmtPrice = s => s.us
  ? '$' + s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : s.price.toLocaleString() + '원';

// ── 종목 카드 렌더링 ──────────────────────────────────
function renderStocks(list) {
  const el = document.getElementById('stockList');
  if (currentFilter === 'fav') {
    // 관심 종목 탭: 업종 뉴스·게시판 카드 없이 관심 종목만
    el.innerHTML = !member
      ? '<p class="empty-msg">관심 종목은 회원 전용입니다.<br><button class="link-btn" onclick="toggleLogin()">로그인</button> 또는 <button class="link-btn" onclick="toggleSignup()">회원가입</button> 후 종목 카드의 ☆를 눌러 추가하세요.</p>'
      : list.length ? list.map(s => stockCard(s)).join('') : '<p class="empty-msg">아직 관심 종목이 없습니다.<br>종목 카드 오른쪽 위의 ☆를 눌러 추가하세요.</p>';
    return;
  }
  if (!list.length) {
    el.innerHTML = '<p class="empty-msg">검색 결과가 없습니다.</p>';
    return;
  }
  // 맨 앞 두 칸은 업종 실시간 뉴스 · 업종 게시판, 이어서 종목 카드(시총순)
  el.innerHTML = newsCardHtml() + boardCardHtml() + list.map(s => stockCard(s)).join('');
}

// ── 업종 게시판: 업종별 가상 코드(SECBIO 등)로 종목 게시판과 같은 DB를 사용 ──
const boardCode = key => 'SEC' + key.slice(0, 3).toUpperCase();
// 게시판·뉴스 카드 이름: "바이오 업종", 미국주식은 "미국주식"
const sectorTitle = sec => sec.key === 'usa' ? sec.name : `${sec.name} 업종`;
const SECTOR_BOARDS = SECTORS.map(sec => ({ code: boardCode(sec.key), name: sectorTitle(sec), sector: sec.key, isSector: true }));
const findStock = code => STOCKS.find(s => s.code === code) || SECTOR_BOARDS.find(b => b.code === code);
const sectorName = key => { const sec = SECTORS.find(x => x.key === key); return sec ? sectorTitle(sec) : ''; };

function boardCardHtml() {
  const code = boardCode(currentFilter);
  return `
  <div class="stock-card sector-card board" data-code="${code}" onclick="openModal('${code}', 'discuss')">
    <div class="sector-icon">💬</div>
    <div class="sector-label">${escHtml(sectorName(currentFilter))} 게시판 보기</div>
    <div class="sector-sub">${currentFilter === 'usa' ? '미국주식 전체 토론' : '업종 전체 토론'} · 글 ${postCounts[code] || 0}</div>
  </div>`;
}

// ── 업종 뉴스 (업종 대표 종목의 네이버 종목 뉴스 모음, 1분마다 갱신) ──
const NEWS_REFRESH = 60000;
// 시세·지수 갱신 주기. 탭이 화면에 안 보일 때는 갱신을 멈춰 서버 호출(Cloudflare 무료 한도)을 아낌
const PRICE_REFRESH = 20000;
const whenVisible = fn => () => { if (!document.hidden) fn(); };
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { fetchAllPrices(); fetchMarket(); }  // 다시 보이면 바로 최신값으로
});
const NEWS_CODES = 12;      // 업종 시총 상위 12종목의 뉴스를 모음
const sectorNews = {};      // 업종 key → { ts, data } | { error }
// 업종과 무관하게 종목 태그만 걸린 기사를 거르기 위한 업종 키워드 (제목·요약에 키워드나 관련 종목명이 있어야 표시)
const SECTOR_KEYWORDS = {
  bio: ['바이오', '제약', '신약', '임상', '의약품', '항체', '기술이전', '기술수출'],
  semi: ['반도체', 'HBM', '메모리', '파운드리', 'D램', '디램', '낸드', '웨이퍼', 'AI칩'],
  battery: ['2차전지', '이차전지', '배터리', '양극재', '음극재', '리튬', '전기차', '전고체',
    '로봇', '휴머노이드', '피지컬 AI', '피지컬AI', '협동로봇', '자동화', '감속기', '액추에이터'],
  ship: ['조선', '선박', 'LNG선', '수주', '해양', '해운', '마스가', 'MASGA',
    '방산', '방위', '국방', '무기', '전차', '미사일', 'K9', '전투기', '수출'],
  auto: ['자동차', '완성차', '전기차', '타이어', '車', '관세', '부품'],
  finance: ['금융', '은행', '증권', '보험', '카드', '밸류업', '배당', '주주환원', 'PF', '금리', '벤처'],
  power: ['전력', '변압기', '전선', '송전', '배전', '초고압', '전력망', '그리드', '데이터센터', '한전', '발전', '가스터빈',
    '원전', '원자력', 'SMR', '원자로', '체코', '한수원'],
  kbeauty: ['화장품', 'K뷰티', 'K-뷰티', '뷰티', '코스메틱', '미용', '피부', '보톡스', '톡신', '필러', '스킨부스터', '의료관광', '올리브영', 'ODM',
    '엔터', 'K팝', 'K-팝', '아이돌', '콘서트', '음원', '드라마', '콘텐츠', '영화', '관광', '여행', '면세', '카지노', '호텔', '방한', '유커', '한류'],
};

function isSectorNews(item, key) {
  if (item.source === 'google') return true;  // 구글은 업종 키워드 검색 결과라 그대로 사용
  if (key === 'usa') return true;              // 미국 종목 뉴스(로이터)는 종목별 기사라 그대로 사용
  const text = item.title + ' ' + (item.summary || '');
  const names = item.codes.map(c => STOCKS.find(s => s.code === c)?.name).filter(Boolean);
  return (SECTOR_KEYWORDS[key] || []).some(k => text.includes(k)) || names.some(nm => text.includes(nm));
}

// 업종 뉴스 목록 (모달의 실시간 업종 뉴스 탭)
function sectorNewsHtml(key) {
  const n = sectorNews[key];
  if (!n) return '<p class="empty-msg">뉴스를 불러오는 중...</p>';
  if (n.error && !n.data) return '<p class="empty-msg">뉴스를 불러오지 못했습니다.</p>';
  const updated = new Date(n.ts).toLocaleTimeString('ko-KR', { hour12: false });
  const foot = `<div class="panel-footer"><span class="news-src naver">N</span>네이버 증권 (업종 시총 상위 ${NEWS_CODES}종목 뉴스) · <span class="news-src google">G</span>Google 뉴스 (업종 키워드)</div>`;
  if (!n.data.length) return '<p class="empty-msg">최근 뉴스가 없습니다.</p>' + foot;
  const shown = sectorShown[key] || NEWS_PAGE;
  const more = n.data.length > shown
    ? `<button class="news-more" onclick="moreSectorNews('${key}')">더보기 (${shown} / ${n.data.length})</button>` : '';
  return `<div class="panel-status">업데이트 ${updated} · 1분마다 자동 갱신 · 최신 ${n.data.length}건</div>` + n.data.slice(0, shown).map(item => {
    const names = item.codes.map(c => STOCKS.find(s => s.code === c)?.name).filter(Boolean);
    return `
      <a class="news-item" href="${safeUrl(item.url)}" target="_blank" rel="noopener">
        <div class="news-item-title">${escHtml(item.title)}</div>
        <div class="news-item-meta"><span class="news-src ${item.source === 'google' ? 'google' : 'naver'}">${item.source === 'google' ? 'G' : 'N'}</span>${names.slice(0, 3).map(x => `<span class="news-stock">${escHtml(x)}</span>`).join('')}
          ${escHtml(item.press || '')} · ${newsTime(item.datetime)}</div>
      </a>`;
  }).join('') + more + foot;
}
// 업종 뉴스도 최대 100건을 20건씩 '더보기'로 표시 (자동 갱신해도 펼친 개수 유지)
const SECTOR_NEWS_MAX = 100;
const sectorShown = {};
function moreSectorNews(key) {
  if (!sectorNews[key]?.data) return;
  sectorShown[key] = (sectorShown[key] || NEWS_PAGE) + NEWS_PAGE;
  document.getElementById('newsTab').innerHTML = sectorNewsHtml(key);
}

function newsCardHtml() {
  const n = sectorNews[currentFilter];
  const updated = n?.ts ? new Date(n.ts).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '';
  const sub = n?.data ? `${n.data.length}건 · ${updated} 업데이트` : '불러오는 중...';
  return `
  <div class="stock-card sector-card news" id="sectorNews" onclick="openModal('${boardCode(currentFilter)}', 'news')">
    <div class="sector-icon">📰</div>
    <div class="sector-label">${escHtml(sectorName(currentFilter))} 실시간 뉴스 보기</div>
    <div class="sector-sub">${sub}</div>
  </div>`;
}

function redrawSectorNews(key) {
  const el = document.getElementById('sectorNews');
  if (el && currentFilter === key) el.outerHTML = newsCardHtml();
  // 모달에서 해당 업종 뉴스를 보고 있으면 함께 갱신
  if (currentStock?.isSector && currentStock.sector === key && currentModalTab === 'news') {
    document.getElementById('newsTab').innerHTML = sectorNewsHtml(key);
  }
}

async function loadSectorNews(force = false, key = currentFilter) {
  if (key === 'fav') return;
  const cached = sectorNews[key];
  if (cached && cached.data && !force && Date.now() - cached.ts < NEWS_REFRESH) return redrawSectorNews(key);
  const codes = sectorList(key).slice(0, NEWS_CODES).map(s => s.code);
  try {
    const res = await fetch(`${API_BASE}/api/news?sector=${key}&codes=${codes.join(',')}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || res.status);
    sectorNews[key] = { ts: Date.now(), data: json.data.filter(n => isSectorNews(n, key)).slice(0, SECTOR_NEWS_MAX) };
  } catch (e) {
    // 실패 시 이전 뉴스 유지
    sectorNews[key] = cached ? { ...cached, error: true } : { error: true };
  }
  redrawSectorNews(key);
}

function stockCard(s) {
  const up = s.change >= 0;
  const sign = up ? '+' : '';
  const postCount = postCounts[s.code] || 0;
  return `
  <div class="stock-card" data-code="${s.code}" onclick="openModal('${s.code}')">
    <div class="card-top">
      <div class="stock-avatar ${up ? 'up' : 'down'}">
        <img class="stock-logo" src="${s.logo || LOGO_URL(s.code)}" alt="${s.name} CI" loading="lazy"
             onerror="this.parentNode.classList.add('no-logo'); this.remove()">
        <span class="avatar-letter">${s.name[0]}</span>
      </div>
      <div class="card-quote">
        <div class="stock-price">${fmtPrice(s)}</div>
        <div class="price-change ${up ? 'up' : 'down'}">${sign}${s.change}%</div>
      </div>
      <div class="card-marks">
        <button class="fav-star${favs.has(s.code) ? ' on' : ''}" title="관심 종목" onclick="toggleFav(event, '${s.code}')">${favs.has(s.code) ? '★' : '☆'}</button>
      </div>
    </div>
    <div class="stock-meta">
      <div class="stock-name" title="${s.name}">${s.name}</div>
      <div class="stock-sub">${s.us ? s.ticker : s.code} · <span class="badge ${s.market}">${s.market.toUpperCase()}</span>${s.etf ? ' <span class="badge etf">ETF</span>' : ''}</div>
    </div>
    <div class="card-bottom">
      <div class="stock-extra">${s.etf ? '규모' : '시총'} ${s.cap} · 댓글 ${postCount}</div>
    </div>
  </div>`;
}

// ── 탭 필터 ───────────────────────────────────────────
function filterTab(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('stockList').classList.remove('hidden');
  renderTabNote();
  renderStocks(filteredList());
  fetchAllPrices();
  loadSectorNews();
}

// 업종 탭 종목: 시총 TOP 20 + 토론글 TOP 20 + 거래대금 TOP 10 (중복 제거, 시총순)
function filteredList() {
  if (currentFilter === 'fav') return member ? STOCKS.filter(s => favs.has(s.code)) : [];
  return sectorList(currentFilter);
}


function sectorList(key) {
  return STOCKS.filter(s => s.sectors[key]).sort((a, b) => a.sectors[key].order - b.sectors[key].order);
}


// ── 검색 ──────────────────────────────────────────────
function searchStocks() {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const stockEl = document.getElementById('stockList');
  const resultEl = document.getElementById('searchResults');

  if (!q) {
    resultEl.classList.add('hidden');
    stockEl.classList.remove('hidden');
    return;
  }

  const results = STOCKS.filter(s =>
    s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || (s.ticker || '').toLowerCase().includes(q)
  );
  stockEl.classList.add('hidden');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<p class="search-label">검색결과 <strong>${results.length}건</strong></p>` +
    (results.length ? results.map(s => stockCard(s)).join('') : '<p class="empty-msg">종목을 찾을 수 없습니다.</p>');
}

// ── 모달 열기 ─────────────────────────────────────────
function openModal(code, tab = 'discuss') {
  currentStock = findStock(code);
  if (!currentStock) return;

  const s = currentStock;
  // 업종 게시판: 가격·종목정보 탭 없이 토론 + 실시간 업종 뉴스
  document.getElementById('modal').classList.toggle('sector-mode', !!s.isSector);
  document.getElementById('modal').classList.toggle('us-mode', !!s.us);  // 미국 종목: 보고서·공시 탭 없음
  document.querySelector('.modal-tabs .tab[data-tab="news"]').textContent = s.isSector ? '실시간 업종 뉴스' : '실시간 종목 뉴스';
  document.getElementById('modalStockName').textContent = s.isSector ? `${s.name} 게시판` : s.name;
  document.getElementById('modalStockCode').textContent = s.isSector ? '업종 전체 토론' : s.us ? `${s.ticker} · ${s.market.toUpperCase()}${s.etf ? ' ETF' : ''}` : s.code;
  const chgEl = document.getElementById('modalChange');
  if (s.isSector) {
    document.getElementById('modalPrice').textContent = '';
    chgEl.textContent = '';
  } else {
    const up = s.change >= 0;
    document.getElementById('modalPrice').textContent = fmtPrice(s);
    chgEl.textContent = `${up ? '+' : ''}${s.change}%`;
    chgEl.className = 'modal-change ' + (up ? 'up' : 'down');
  }

  DETAIL_TABS.forEach(t => { document.getElementById(`${t}Tab`).innerHTML = ''; });
  switchModalTab(tab);
  renderPosts();

  const wasOpen = isOpen('modalOverlay');
  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.classList.add('no-scroll');
  // 작성자·팔로잉 창에서 종목으로 넘어온 경우: 그 창을 닫고 브라우저 기록을 토론 창 하나로 맞춤
  if (isOpen('authorOverlay')) {
    document.getElementById('authorOverlay').classList.add('hidden');
    if (history.state?.layer === 'author') {
      if (wasOpen) { ignorePop = true; history.back(); }
      else history.replaceState({ layer: 'modal' }, '');
      return;
    }
  }
  enterLayer('modal', wasOpen);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay') && e.type === 'click') return;
  if (!isOpen('modalOverlay')) return;
  hideModal();
  leaveLayer();
}

function hideModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.classList.remove('no-scroll');
  stopNewsRefresh();
}

// ── 뒤로가기로 창 닫기: 토론 창·작성자 창을 열 때 브라우저 기록을 하나 추가하고, 뒤로가기(popstate)에서 닫음 ──
let ignorePop = false;
const isOpen = id => !document.getElementById(id).classList.contains('hidden');
function enterLayer(layer, wasOpen) {
  if (!wasOpen) history.pushState({ layer }, '');
}
// ✕·ESC로 닫을 때는 추가했던 기록도 되돌림 (그때 생기는 popstate는 무시)
function leaveLayer() {
  if (history.state?.layer) { ignorePop = true; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  const layer = history.state?.layer;
  if (layer !== 'author' && isOpen('authorOverlay')) document.getElementById('authorOverlay').classList.add('hidden');
  if (!layer && isOpen('modalOverlay')) hideModal();
});
// 창이 열린 채 새로고침한 경우 남은 기록 상태 정리
if (history.state?.layer) history.replaceState(null, '');

// ── 모달 탭 전환 ─────────────────────────────────────
const DETAIL_TABS = ['news', 'info', 'research', 'disclosure'];

function switchModalTab(tab, btn) {
  currentModalTab = tab;
  document.querySelectorAll('.modal-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.getElementById('discussTab').classList.toggle('hidden', tab !== 'discuss');
  DETAIL_TABS.forEach(t => document.getElementById(`${t}Tab`).classList.toggle('hidden', t !== tab));

  stopNewsRefresh();
  if (currentStock?.isSector) {
    if (tab === 'news') {
      const key = currentStock.sector;
      document.getElementById('newsTab').innerHTML = sectorNewsHtml(key);
      loadSectorNews(false, key);
      newsTimer = setInterval(whenVisible(() => loadSectorNews(true, key)), NEWS_REFRESH);
    }
    return;
  }
  if (DETAIL_TABS.includes(tab)) loadDetail(tab);
  if (tab === 'news') newsTimer = setInterval(whenVisible(() => loadDetail('news', true)), NEWS_REFRESH);
}

// ── 상세 데이터 (뉴스·종목정보·보고서·공시) ────────────
const detailCache = {};
const DETAIL_TTL = { news: 60000, info: 600000, research: 600000, disclosure: 300000 };
// 종목 뉴스는 최대 100건을 받아 20건씩 '더보기'로 표시 (자동 갱신해도 펼친 개수 유지)
const NEWS_PAGE = 20;
const newsShown = {};
function moreNews() {
  const s = currentStock, cached = s && detailCache[`news_${s.code}`];
  if (!cached) return;
  newsShown[s.code] = (newsShown[s.code] || NEWS_PAGE) + NEWS_PAGE;
  document.getElementById('newsTab').innerHTML = renderDetail('news', cached.data, cached.ts);
}
let newsTimer = null;

function stopNewsRefresh() {
  if (newsTimer) clearInterval(newsTimer);
  newsTimer = null;
}

async function loadDetail(type, force = false) {
  const s = currentStock;
  if (!s) return;
  const panel = document.getElementById(`${type}Tab`);
  const key = `${type}_${s.code}`;
  const cached = detailCache[key];
  if (cached && !force && Date.now() - cached.ts < DETAIL_TTL[type]) {
    panel.innerHTML = renderDetail(type, cached.data, cached.ts);
    return;
  }
  if (!cached) panel.innerHTML = '<p class="empty-msg">불러오는 중...</p>';

  try {
    const res = await fetch(`${API_BASE}/api/detail?code=${s.code}&type=${type}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || res.status);
    detailCache[key] = { ts: Date.now(), data: json.data };
  } catch (e) {
    if (!cached && currentStock === s && currentModalTab === type) {
      panel.innerHTML = `<p class="empty-msg">데이터를 불러오지 못했습니다.<br><a class="panel-link" href="${naverUrl(s)}" target="_blank" rel="noopener">네이버 증권에서 보기 ↗</a></p>`;
    }
    return;
  }
  // 응답 도착 전에 다른 종목·탭으로 이동했으면 그리지 않음
  if (currentStock !== s || currentModalTab !== type) return;
  panel.innerHTML = renderDetail(type, detailCache[key].data, detailCache[key].ts);
}

const naverUrl = s => s.us
  ? `https://m.stock.naver.com/worldstock/${s.etf ? 'etf' : 'stock'}/${s.code}/total`
  : `https://m.stock.naver.com/domestic/stock/${s.code}/total`;
const safeUrl = u => /^https:\/\//.test(u || '') ? escHtml(u) : '#';

function renderDetail(type, data, ts) {
  const s = currentStock;
  const footer = `<div class="panel-footer">출처: ${type === 'news' ? '<span class="news-src naver">N</span>네이버 증권 · <span class="news-src google">G</span>Google 뉴스 (종목명 검색)' : '네이버 증권'}${type === 'info' && !s.us ? ' · WISEfn' : ''}
    · <a class="panel-link" href="${naverUrl(s)}" target="_blank" rel="noopener">네이버 증권에서 더 보기 ↗</a></div>`;

  if (type === 'info') return (data.us ? renderUsInfo(data) : renderInfo(data)) + footer;

  if (!data || !data.length) {
    const label = { news: '뉴스가', research: '분석 보고서가', disclosure: '공시가' }[type];
    return `<p class="empty-msg">최근 ${label} 없습니다.</p>` + footer;
  }

  if (type === 'news') {
    const updated = new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
    const shown = newsShown[s.code] || NEWS_PAGE;
    const more = data.length > shown
      ? `<button class="news-more" onclick="moreNews()">더보기 (${shown} / ${data.length})</button>` : '';
    return `<div class="panel-status">업데이트 ${updated} · 1분마다 자동 갱신 · 최신 ${data.length}건</div>` +
      data.slice(0, shown).map(n => `
      <a class="feed-item" href="${safeUrl(n.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(n.title)}</div>
          <div class="feed-summary">${escHtml(n.summary || '')}</div>
          <div class="feed-meta"><span class="news-src ${n.source === 'google' ? 'google' : 'naver'}">${n.source === 'google' ? 'G' : 'N'}</span>${escHtml(n.press || '')} · ${newsTime(n.datetime)}</div>
        </div>
        ${n.thumb ? `<img class="feed-thumb" src="${safeUrl(n.thumb)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      </a>`).join('') + more + footer;
  }

  if (type === 'research') {
    return data.map(r => `
      <a class="feed-item" href="${safeUrl(r.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(r.title)}</div>
          <div class="feed-summary">${escHtml(r.summary || '')}</div>
          <div class="feed-meta"><span class="feed-tag">${escHtml(r.broker || '')}</span> ${escHtml(r.date || '')} · 조회 ${escHtml(String(r.views ?? 0))}</div>
        </div>
      </a>`).join('') + footer;
  }

  // disclosure
  return data.map(d => `
      <a class="feed-item" href="${safeUrl(d.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(d.title)}</div>
          <div class="feed-meta">${escHtml((d.datetime || '').replace('T', ' ').slice(0, 16))} · ${escHtml(d.source || '')}</div>
        </div>
      </a>`).join('') + footer;
}

function renderInfo(d) {
  const num = v => {
    const t = String(v).trim();
    return `<td class="${t.startsWith('-') && t !== '-' ? 'down' : ''}">${escHtml(t)}</td>`;
  };
  const f = d.financials;
  const finTable = f && f.years.length ? `
    <table class="fin-table">
      <thead><tr><th>구분</th>${f.years.map(y => `<th>${escHtml(y)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><th>매출액</th>${f.revenue.map(num).join('')}</tr>
        <tr><th>영업이익</th>${f.operatingIncome.map(num).join('')}</tr>
        <tr><th>당기순이익</th>${f.netIncome.map(num).join('')}</tr>
      </tbody>
    </table>` : '<span class="info-sub">재무 데이터 없음</span>';

  const foreign = d.foreignOwnership
    ? escHtml(d.foreignOwnership)
    : `${escHtml(d.foreignExhaustion)} <span class="info-sub">(외인소진율)</span>`;
  const holder = d.majorHolder
    ? `${escHtml(d.majorHolder.name)} <span class="info-sub">${escHtml(d.majorHolder.pct)}%</span>`
    : '-';

  return `
    <table class="info-table">
      <tr><td class="info-key">시가총액</td><td class="info-val">${escHtml(d.marketCap)}</td></tr>
      <tr class="fin-row"><td class="info-key">최근 3개년 실적<br><span class="info-sub">(단위: ${escHtml(f?.unit || '억원')})</span></td><td class="info-val">${finTable}</td></tr>
      <tr><td class="info-key">PER</td><td class="info-val">${escHtml(d.per)}${d.perDate ? ` <span class="info-sub">${escHtml(d.perDate)} 기준</span>` : ''}</td></tr>
      <tr><td class="info-key">PBR</td><td class="info-val">${escHtml(d.pbr)}</td></tr>
      <tr><td class="info-key">외국인지분율</td><td class="info-val">${foreign}</td></tr>
      <tr><td class="info-key">최대주주</td><td class="info-val">${holder}</td></tr>
    </table>`;
}

// 미국 종목 정보: 네이버 해외주식 주요 지표 (시총·PER·PBR·52주 최고/최저 등)
function renderUsInfo(d) {
  const s = currentStock;
  const u = s?.sectors?.usa;
  const head = !u ? '' : u.hold
    ? `<tr><td class="info-key">국내 투자자 보관</td><td class="info-val">${escHtml(u.amt)} <span class="info-sub">보관금액 ${u.hold}위 · ${escHtml(US_AS_OF)} 기준</span></td></tr>`
    : `<tr><td class="info-key">국내 투자자 순위</td><td class="info-val">${u.sel}위 <span class="info-sub">예탁원 최근 1년 월말 보관·최근 결제금액 TOP 50 진입 ${u.hits}회</span></td></tr>`;
  const ind = d.industry ? `<tr><td class="info-key">업종</td><td class="info-val">${escHtml(d.industry)}</td></tr>` : '';
  return `
    <table class="info-table">${head}${ind}
      ${d.rows.map(r => `<tr><td class="info-key">${escHtml(r.key)}</td><td class="info-val">${escHtml(r.value)}${r.desc ? ` <span class="info-sub">${escHtml(r.desc)}</span>` : ''}</td></tr>`).join('')}
    </table>`;
}

// 뉴스 시각 (YYYYMMDDHHmm) → "N분 전"
function newsTime(dt) {
  const m = String(dt || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return '';
  return timeAgo(new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime());
}

// ── 게시글 · 좋아요 · 팔로우 (서버 DB: /api/posts) ──────
const POST_MAX = 1000;     // 게시글 최대 글자 수
const POST_PREVIEW = 500;  // 이 길이를 넘으면 '더 보기'로 접어서 표시
const NICK_RE = /^[가-힣]{1,10}$/;  // 닉네임: 한글만, 최대 10자
const PW_MIN = 4, PW_MAX = 20;      // 게시글 비밀번호 길이

// 브라우저별 익명 식별자 (좋아요·팔로우 주체)
const CLIENT_ID = (() => {
  try {
    let id = localStorage.getItem('cid');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem('cid', id);
    }
    return id;
  } catch {
    return 'tmp-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
})();

let postCounts = {};          // 종목코드 → 게시글 수 (카드의 '댓글 N')
let myFollowing = new Set();  // 내가 팔로우한 닉네임
let currentPosts = [];        // 현재 모달에 표시 중인 게시글
let postAction = null;        // { id, mode: 'edit' | 'delete' } 수정·삭제 입력창이 열린 글

async function api(params, body) {
  const qs = new URLSearchParams({ ...params, cid: CLIENT_ID }).toString();
  const res = await fetch(`${API_BASE}/api/posts?${qs}`, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, cid: CLIENT_ID, ...(memberToken && !body.token ? { token: memberToken } : {}) }),
  } : undefined);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function loadForumMeta() {
  try {
    const c = await api({ counts: 1 });
    postCounts = c.counts || {};
    renderStocks(filteredList());
  } catch (e) {
    // DB 미연결 시 댓글 수 0으로 표시
  }
}

// 게시글 본문: 500자 초과 시 앞부분만 보여주고 '더 보기' 버튼
function postBodyHtml(p) {
  const text = String(p.content || '');
  if (text.length <= POST_PREVIEW) return `<div class="post-body">${escHtml(text)}</div>`;
  return `<div class="post-body">${escHtml(text.slice(0, POST_PREVIEW))}<span class="post-ellipsis">…</span><span class="post-rest hidden">${escHtml(text.slice(POST_PREVIEW))}</span></div>
      <button class="btn-more" onclick="toggleMore(this)">더 보기</button>`;
}

function toggleMore(btn) {
  const body = btn.previousElementSibling;
  const open = body.querySelector('.post-rest').classList.toggle('hidden') === false;
  body.querySelector('.post-ellipsis').classList.toggle('hidden', open);
  btn.textContent = open ? '접기' : '더 보기';
}

const likeBtnHtml = p =>
  `<button class="btn-like ${p.liked ? 'liked' : ''}" data-id="${escHtml(p.id)}" onclick="toggleLike(this.dataset.id)">👍 ${p.likes || 0}</button>`;

async function renderPosts() {
  const s = currentStock;
  if (!s) return;
  const el = document.getElementById('postList');
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  postAction = null;
  try {
    const { posts } = await api({ code: s.code });
    if (currentStock !== s) return;
    currentPosts = posts;
  } catch (e) {
    if (currentStock === s) el.innerHTML = `<p class="empty-msg">게시글을 불러오지 못했습니다. (${escHtml(e.message)})</p>`;
    return;
  }
  drawPosts();
  countPostViews(s, currentPosts);
}

// 토론 창에 보인 글 조회수 +1 (같은 브라우저·게시판 1시간에 1회)
async function countPostViews(s, posts) {
  if (!posts.length) return;
  try {
    const { views } = await api({}, { action: 'viewBoard', code: s.code, ids: posts.map(p => p.id) });
    if (currentStock !== s) return;
    currentPosts.forEach(p => { if (views[p.id] != null) p.views = views[p.id]; });
    document.querySelectorAll('#postList .post-views').forEach(el => {
      const v = views[el.dataset.id];
      if (v != null) el.textContent = `👁 ${v.toLocaleString()}`;
    });
  } catch {}
}
const viewsHtml = p => `<span class="post-views" data-id="${escHtml(p.id)}" title="조회수">👁 ${(p.views || 0).toLocaleString()}</span>`;

function drawPosts() {
  const el = document.getElementById('postList');
  if (!currentPosts.length) {
    el.innerHTML = '<p class="empty-msg">첫 번째 의견을 남겨보세요!</p>';
    return;
  }
  el.innerHTML = currentPosts.map(p => `
    <div class="post-item">
      <div class="post-header">
        <span class="post-nick">${escHtml(p.nick)}</span>${p.member ? '<span class="member-badge">회원</span>' : ''}
        <span class="post-sentiment ${p.sentiment}">${sentimentLabel(p.sentiment)}</span>
        <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        ${likeBtnHtml(p)}
        ${p.member && !isMyPost(p) ? `<button class="btn-follow ${myFollowing.has(p.nick) ? 'following' : ''}" data-nick="${escHtml(p.nick)}" onclick="openAuthor(this.dataset.nick)">${myFollowing.has(p.nick) ? '팔로잉' : '팔로우'}</button>` : ''}
      </div>
      ${postAction?.id === p.id && postAction.mode === 'edit' ? editFormHtml(p) : p.blind ? `<div class="post-body post-blind">🚫 ${escHtml(p.content)}</div>` : postBodyHtml(p)}
      <div class="post-tools">
        ${p.editedTs ? `<span class="post-edited">수정됨 · ${timeAgo(p.editedTs)}</span>` : ''}
        ${canManage(p) ? `<button class="btn-tool" data-id="${escHtml(p.id)}" onclick="openPostAction(this.dataset.id, 'edit')">수정</button>
        <button class="btn-tool" data-id="${escHtml(p.id)}" onclick="openPostAction(this.dataset.id, 'delete')">삭제</button>` : ''}
        ${isMyPost(p) || p.blind ? '' : `<button class="btn-tool btn-report" data-id="${escHtml(p.id)}" onclick="openPostAction(this.dataset.id, 'report')">신고</button>`}
        ${adminDeleteBtnHtml(p)}
      </div>
      ${postAction?.id === p.id && postAction.mode === 'delete' ? deleteFormHtml(p) : ''}
      ${postAction?.id === p.id && postAction.mode === 'report' ? reportFormHtml(p) : ''}
    </div>
  `).join('');
}

// ── 게시글 수정·삭제 (비회원 글: 작성 시 입력한 비밀번호 / 회원 글: 로그인한 본인) ────
const isMyPost = p => Boolean(p.member && member && p.nick === member.nick);
const canManage = p => !p.member || isMyPost(p);
function editFormHtml(p) {
  return `
      <div class="post-form">
        <textarea id="editContent" maxlength="${POST_MAX}" rows="4">${escHtml(p.content)}</textarea>
        <div class="post-form-row">
          <select id="editSentiment">
            <option value="neutral" ${p.sentiment === 'neutral' ? 'selected' : ''}>-</option>
            <option value="up" ${p.sentiment === 'up' ? 'selected' : ''}>📈 매수</option>
            <option value="down" ${p.sentiment === 'down' ? 'selected' : ''}>📉 매도</option>
          </select>
          ${p.member ? '' : `<input id="actionPassword" type="password" placeholder="비밀번호" maxlength="${PW_MAX}" autocomplete="off">`}
          <button class="btn-submit" data-id="${escHtml(p.id)}" onclick="savePostEdit(this.dataset.id)">저장</button>
          <button class="btn-cancel" onclick="closePostAction()">취소</button>
        </div>
      </div>`;
}

function deleteFormHtml(p) {
  return `
      <div class="post-form post-form-row">
        <span class="post-form-label">${p.member ? '이 글을 삭제할까요?' : '삭제하려면 비밀번호를 입력하세요'}</span>
        ${p.member ? '' : `<input id="actionPassword" type="password" placeholder="비밀번호" maxlength="${PW_MAX}" autocomplete="off">`}
        <button class="btn-danger" data-id="${escHtml(p.id)}" onclick="deletePost(this.dataset.id)">삭제</button>
        <button class="btn-cancel" onclick="closePostAction()">취소</button>
      </div>`;
}

// ── 신고 (서로 다른 이용자 5건 누적 시 자동 블라인드) ──
const REPORT_REASONS = ['욕설·비방', '광고·스팸', '허위사실·시세조종', '음란·불법', '기타'];

function reportFormHtml(p) {
  return `
      <div class="post-form post-form-row">
        <span class="post-form-label">신고 사유</span>
        <select id="reportReason">${REPORT_REASONS.map(r => `<option>${r}</option>`).join('')}</select>
        <button class="btn-danger" data-id="${escHtml(p.id)}" onclick="reportPost(this.dataset.id)">신고</button>
        <button class="btn-cancel" onclick="closePostAction()">취소</button>
      </div>`;
}

async function reportPost(id) {
  try {
    const r = await api({}, { action: 'report', id, reason: document.getElementById('reportReason').value });
    postAction = null;
    if (r.blind) await renderPosts();
    else drawPosts();
    alert(r.blind ? '신고가 접수되었습니다. 신고가 누적되어 글이 블라인드 처리되었습니다.' : '신고가 접수되었습니다. 운영자가 확인합니다.');
  } catch (e) {
    alert(e.message);
  }
}

function openPostAction(id, mode) {
  postAction = postAction?.id === id && postAction.mode === mode ? null : { id, mode };
  drawPosts();
  document.getElementById(mode === 'edit' ? 'editContent' : 'actionPassword')?.focus();
}

function closePostAction() {
  postAction = null;
  drawPosts();
}

// 회원 글은 비밀번호 없이 로그인 정보로 처리 (빈 문자열 반환)
function actionPassword(id) {
  if (currentPosts.find(p => p.id === id)?.member) return '';
  const pw = document.getElementById('actionPassword').value;
  if (!pw) { alert('비밀번호를 입력해주세요.'); return null; }
  return pw;
}

async function savePostEdit(id) {
  const content = document.getElementById('editContent').value.trim();
  const sentiment = document.getElementById('editSentiment').value;
  if (!content) return alert('내용을 입력해주세요.');
  const password = actionPassword(id);
  if (password === null) return;
  try {
    const { post } = await api({}, { action: 'edit', id, password, content, sentiment });
    currentPosts = currentPosts.map(p => p.id === id ? post : p);
    postAction = null;
    drawPosts();
  } catch (e) {
    alert(`수정하지 못했습니다: ${e.message}`);
  }
}

async function deletePost(id) {
  const password = actionPassword(id);
  if (password === null) return;
  try {
    const r = await api({}, { action: 'delete', id, password });
    currentPosts = currentPosts.filter(p => p.id !== id);
    postCounts[r.code] = Math.max(0, (postCounts[r.code] || 1) - 1);
    postAction = null;
    drawPosts();
    renderStocks(filteredList());
  } catch (e) {
    alert(`삭제하지 못했습니다: ${e.message}`);
  }
}

async function submitPost() {
  if (!currentStock) return;
  const nick = document.getElementById('postNickname').value.trim() || '익명';
  const password = document.getElementById('postPassword').value;
  const content = document.getElementById('postContent').value.trim();
  const sentiment = document.getElementById('postSentiment').value;
  if (member) {
    if (!content) return alert('내용을 입력해주세요.');
  } else if (!NICK_RE.test(nick)) {
    alert('닉네임은 한글로만 최대 10자까지 입력할 수 있습니다.');
    return;
  }
  else if (password.length < PW_MIN || password.length > PW_MAX) {
    alert(`비밀번호를 ${PW_MIN}~${PW_MAX}자로 입력해주세요.\n(글 수정·삭제할 때 필요합니다)`);
    return;
  }
  else if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }

  const btn = document.querySelector('.write-box .btn-submit');
  btn.disabled = true;
  try {
    const { post } = await api({}, member
      ? { action: 'create', code: currentStock.code, content, sentiment }
      : { action: 'create', code: currentStock.code, nick, password, content, sentiment });
    currentPosts.unshift(post);
    postCounts[currentStock.code] = (postCounts[currentStock.code] || 0) + 1;
    document.getElementById('postContent').value = '';
    document.getElementById('postPassword').value = '';
    document.getElementById('charCount').textContent = `0/${POST_MAX}`;
    drawPosts();
    renderStocks(filteredList());
  } catch (e) {
    if (/로그인이 만료/.test(e.message)) setMember(null);
    alert(`등록하지 못했습니다: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function toggleLike(id) {
  try {
    const r = await api({}, { action: 'like', id });
    // 토론 목록과 작성자 화면 양쪽 버튼 갱신
    currentPosts.forEach(p => { if (p.id === id) { p.liked = r.liked; p.likes = r.likes; } });
    document.querySelectorAll(`.btn-like[data-id="${id}"]`).forEach(b => {
      b.classList.toggle('liked', r.liked);
      b.textContent = `👍 ${r.likes}`;
    });
  } catch (e) {
    alert(`처리하지 못했습니다: ${e.message}`);
  }
}

// ── 작성자 전체글 화면 (팔로우) ─────────────────────────
function feedPostHtml(p, showNick) {
  const s = findStock(p.code);
  return `
    <div class="post-item">
      <div class="post-header">
        ${showNick ? `<button class="post-nick author-link" data-nick="${escHtml(p.nick)}" onclick="openAuthor(this.dataset.nick)">${escHtml(p.nick)}</button>` : ''}
        <button class="author-stock" onclick="openModal('${escHtml(p.code)}')">${escHtml(s ? s.name : p.code)}</button>
        <span class="post-sentiment ${p.sentiment}">${sentimentLabel(p.sentiment)}</span>
        <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        ${likeBtnHtml(p)}
        ${adminDeleteBtnHtml(p)}
      </div>
      ${postBodyHtml(p)}
    </div>`;
}

function showAuthorOverlay(title, sub, actionHtml, bodyHtml) {
  document.getElementById('authorName').textContent = title;
  document.getElementById('authorCount').textContent = sub;
  document.getElementById('authorAction').innerHTML = actionHtml;
  document.getElementById('authorPosts').innerHTML = bodyHtml;
  const wasOpen = isOpen('authorOverlay');
  document.getElementById('authorOverlay').classList.remove('hidden');
  enterLayer('author', wasOpen);
}

async function openAuthor(nick) {
  showAuthorOverlay(nick, '불러오는 중...', '', '');
  try {
    const r = await api({}, { action: 'author', nick });
    if (member) r.following ? myFollowing.add(nick) : myFollowing.delete(nick);
    const mine = member && member.nick === nick;
    const action = !r.member || mine ? ''
      : member ? `<button class="btn-follow-big ${r.following ? 'following' : ''}" data-nick="${escHtml(nick)}" onclick="toggleFollow(this.dataset.nick)">${r.following ? '팔로잉 ✓' : '+ 팔로우'}</button>`
      : `<button class="btn-follow-big" onclick="closeAuthor(); toggleLogin()">로그인 후 팔로우</button>`;
    showAuthorOverlay(
      nick,
      r.member ? `회원 · 작성글 ${r.posts.length}개 · 팔로워 ${r.followers}명` : `${r.withdrawn ? '탈퇴한 회원' : '비회원'} · 작성글 ${r.posts.length}개`,
      action,
      r.posts.length ? r.posts.map(p => feedPostHtml(p, false)).join('') : '<p class="empty-msg">작성한 글이 없습니다.</p>'
    );
  } catch (e) {
    showAuthorOverlay(nick, '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

async function toggleFollow(nick) {
  if (!member) return toggleLogin();
  try {
    const r = await api({}, { action: 'follow', nick, follow: !myFollowing.has(nick) });
    r.following ? myFollowing.add(nick) : myFollowing.delete(nick);
    const btn = document.querySelector('#authorAction .btn-follow-big');
    if (btn) {
      btn.classList.toggle('following', r.following);
      btn.textContent = r.following ? '팔로잉 ✓' : '+ 팔로우';
    }
    const sub = document.getElementById('authorCount');
    sub.textContent = sub.textContent.replace(/팔로워 \d+명/, `팔로워 ${r.followers}명`);
    if (currentStock) drawPosts();
  } catch (e) {
    alert(`처리하지 못했습니다: ${e.message}`);
  }
}

// ── 팔로잉 피드: 내가 팔로우한 작성자들의 최신 글 ──────
async function openFeed() {
  if (!member) {
    return showAuthorOverlay('팔로잉', '회원 전용', '', '<p class="empty-msg">팔로우는 회원만 사용할 수 있습니다.<br><button class="link-btn" onclick="closeAuthor(); toggleLogin()">로그인</button> 또는 <button class="link-btn" onclick="closeAuthor(); toggleSignup()">회원가입</button> 후 다른 회원의 글에서 [팔로우]를 눌러보세요.</p>');
  }
  showAuthorOverlay('팔로잉', '불러오는 중...', '', '');
  try {
    const r = await api({}, { action: 'feed' });
    myFollowing = new Set(r.following);
    const chips = r.following.length
      ? `<div class="follow-chips">${r.following.map(n => `<button class="follow-chip" data-nick="${escHtml(n)}" onclick="openAuthor(this.dataset.nick)">${escHtml(n)}</button>`).join('')}</div>`
      : '';
    const body = r.following.length
      ? chips + (r.posts.length ? r.posts.map(p => feedPostHtml(p, true)).join('') : '<p class="empty-msg">팔로우한 회원의 글이 아직 없습니다.</p>')
      : '<p class="empty-msg">아직 팔로우한 회원이 없습니다.<br>회원 글 옆의 [팔로우] 버튼으로 팔로우해 보세요.</p>';
    showAuthorOverlay('팔로잉', `${r.following.length}명 팔로우 중`, '', body);
  } catch (e) {
    showAuthorOverlay('팔로잉', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

// ── 관리자: 로그인 후 모든 글에 [관리자 삭제] 버튼 표시 ──
// 관리자 비밀번호는 서버 환경변수(ADMIN_PASSWORD)로 확인, 브라우저 탭을 닫으면 로그아웃
let adminKey = (() => { try { return sessionStorage.getItem('adminKey'); } catch { return null; } })();
const isAdmin = () => Boolean(adminKey);

const adminDeleteBtnHtml = p => isAdmin()
  ? `<button class="btn-admin-del" data-id="${escHtml(p.id)}" onclick="adminDeletePost(this.dataset.id, this)">관리자 삭제</button>`
  : '';

function toggleAdminForm() {
  if (isAdmin()) return adminLogout();
  const form = document.getElementById('adminForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) document.getElementById('adminPassword').focus();
}

async function adminLogin() {
  const input = document.getElementById('adminPassword');
  const key = input.value;
  if (!key) return;
  try {
    await api({}, { action: 'adminCheck', adminKey: key });
    adminKey = key;
    try { sessionStorage.setItem('adminKey', key); } catch {}
    input.value = '';
    document.getElementById('adminForm').classList.add('hidden');
    refreshAdminUi();
  } catch (e) {
    alert(e.message);
  }
}

function adminLogout() {
  adminKey = null;
  try { sessionStorage.removeItem('adminKey'); } catch {}
  refreshAdminUi();
}

function refreshAdminUi() {
  document.body.classList.toggle('admin-mode', isAdmin());
  document.getElementById('adminToggle').textContent = isAdmin() ? '관리자 로그아웃' : '관리자';
  if (currentStock) drawPosts();
}

async function adminDeletePost(id, btn) {
  if (!confirm('이 게시글을 관리자 권한으로 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.')) return;
  try {
    const r = await api({}, { action: 'adminDelete', id, adminKey });
    currentPosts = currentPosts.filter(p => p.id !== id);
    postCounts[r.code] = Math.max(0, (postCounts[r.code] || 1) - 1);
    if (currentStock) drawPosts();
    btn?.closest('#authorPosts .post-item')?.remove();
    renderStocks(filteredList());
  } catch (e) {
    // 관리자 비밀번호가 바뀌었거나 잠긴 경우 로그아웃
    if (/관리자 비밀번호/.test(e.message)) adminLogout();
    alert(`삭제하지 못했습니다: ${e.message}`);
  }
}

// ── 관리자: 신고된 글 · 문의 내역 ──
async function openReports() {
  showAuthorOverlay('🚨 신고된 글', '불러오는 중...', '', '');
  try {
    const { posts } = await api({}, { action: 'adminReports', adminKey });
    showAuthorOverlay('🚨 신고된 글', `${posts.length}건 · 신고 ${5}건 이상이면 자동 블라인드`, '', posts.length ? posts.map(p => `
      <div class="post-item">
        <div class="post-header">
          <button class="author-stock" onclick="openModal('${escHtml(p.code)}')">${escHtml(findStock(p.code)?.name || p.code)}</button>
          <span class="post-nick">${escHtml(p.nick)}</span>${p.member ? '<span class="member-badge">회원</span>' : ''}
          <span class="report-count">신고 ${p.reports}건${p.blind ? ' · 블라인드' : ''}</span>
          <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        </div>
        <div class="post-body">${escHtml(p.content)}</div>
        <div class="post-tools">
          <span class="post-edited">${Object.entries(p.reasons || {}).map(([k, v]) => `${escHtml(k)} ${v}`).join(' · ')}</span>
          <button class="btn-tool" data-id="${escHtml(p.id)}" onclick="adminUnblind(this.dataset.id)">문제없음(신고 초기화)</button>
          <button class="btn-admin-del" data-id="${escHtml(p.id)}" onclick="adminDeletePost(this.dataset.id, this).then(openReports)">관리자 삭제</button>
        </div>
      </div>`).join('') : '<p class="empty-msg">신고된 글이 없습니다.</p>');
  } catch (e) {
    showAuthorOverlay('🚨 신고된 글', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

async function adminUnblind(id) {
  try {
    await api({}, { action: 'adminUnblind', id, adminKey });
    openReports();
  } catch (e) {
    alert(e.message);
  }
}

async function openContacts() {
  showAuthorOverlay('✉️ 문의 내역', '불러오는 중...', '', '');
  try {
    const { contacts } = await api({}, { action: 'adminContacts', adminKey });
    showAuthorOverlay('✉️ 문의 내역', `최근 ${contacts.length}건`, '', contacts.length ? contacts.map(c => `
      <div class="post-item">
        <div class="post-header">
          <span class="report-count">${escHtml(c.type)}</span>
          <span class="post-nick">${escHtml(c.name || '이름 없음')}</span>
          <span class="post-time">${escHtml(c.email || '이메일 없음')} · ${timeAgo(c.ts)}</span>
        </div>
        <div class="post-body">${escHtml(c.message)}</div>
      </div>`).join('') : '<p class="empty-msg">문의가 없습니다.</p>');
  } catch (e) {
    showAuthorOverlay('✉️ 문의 내역', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

function closeAuthor(e) {
  if (e && e.target !== document.getElementById('authorOverlay')) return;
  if (!isOpen('authorOverlay')) return;
  document.getElementById('authorOverlay').classList.add('hidden');
  leaveLayer();
}

function updateCharCount() {
  const len = document.getElementById('postContent').value.length;
  document.getElementById('charCount').textContent = `${len}/${POST_MAX}`;
}

// ── 유틸 ──────────────────────────────────────────────
function sentimentLabel(s) {
  if (s === 'up') return '📈 매수';
  if (s === 'down') return '📉 매도';
  return '🔍 중립';
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 회원: 로그인 · 회원가입 · 로그아웃 (세션 토큰은 이 브라우저에 30일 보관) ──
let member = null;  // { id, nick }
let memberToken = (() => { try { return localStorage.getItem('memberToken'); } catch { return null; } })();
const USER_ID_RE = /^(?=.*[A-Za-z])[A-Za-z0-9]{4,20}$/;
const MEMBER_NICK_RE = /^[가-힣]{2,10}$/;

function showDropdown(id) {
  ['loginDropdown', 'signupDropdown', 'memberDropdown'].forEach(d => {
    const el = document.getElementById(d);
    el.classList.toggle('hidden', d !== id || !el.classList.contains('hidden'));
  });
}
function toggleLogin() { showDropdown(member ? 'memberDropdown' : 'loginDropdown'); }
function toggleSignup() { showDropdown('signupDropdown'); }
function closeDropdowns() { ['loginDropdown', 'signupDropdown', 'memberDropdown'].forEach(d => document.getElementById(d).classList.add('hidden')); }

function setMember(user, token) {
  member = user;
  if (token !== undefined) memberToken = token;
  try { user && memberToken ? localStorage.setItem('memberToken', memberToken) : localStorage.removeItem('memberToken'); } catch {}
  if (!user) memberToken = null;
  document.getElementById('btnLogin').textContent = user ? `${user.nick}님` : '로그인';
  document.getElementById('btnSignup').classList.toggle('hidden', !!user);
  document.getElementById('btnProfile').classList.toggle('hidden', !user);
  document.getElementById('memberTitle').textContent = user ? `${user.nick}님` : '';
  document.getElementById('memberSub').textContent = user ? `아이디 ${user.id} · 회원 글쓰기 사용 중` : '';
  // 글쓰기 상자: 회원은 닉네임·비밀번호 입력 없음
  document.getElementById('writeGuest').classList.toggle('hidden', !!user);
  const wm = document.getElementById('writeMember');
  wm.classList.toggle('hidden', !user);
  wm.innerHTML = user ? `<b>${escHtml(user.nick)}</b> 님으로 작성 (회원)` : '';
  if (currentStock) drawPosts();
  loadFavs();
  loadFollowing();
}

async function loadFollowing() {
  if (!member) myFollowing = new Set();
  else {
    try { myFollowing = new Set((await api({}, { action: 'followingList' })).following || []); } catch { myFollowing = new Set(); }
  }
  if (currentStock) drawPosts();
}

// ── 회원정보: 내 정보 · 팔로잉 · 비밀번호 변경 · 회원 탈퇴 ──
async function openProfile() {
  if (!member) return toggleLogin();
  showAuthorOverlay('회원정보', '불러오는 중...', '', '');
  try {
    const r = await api({}, { action: 'profile' });
    const joined = r.user.ts ? new Date(r.user.ts).toLocaleDateString('ko-KR') : '-';
    const chips = r.following.length
      ? `<div class="follow-chips">${r.following.map(n => `<button class="follow-chip" data-nick="${escHtml(n)}" onclick="openAuthor(this.dataset.nick)">${escHtml(n)}</button>`).join('')}</div>`
      : '<span class="info-sub">팔로우한 회원이 없습니다</span>';
    showAuthorOverlay('회원정보', `${r.user.nick}님`, '', `
      <table class="info-table profile-table">
        <tr><td class="info-key">아이디</td><td class="info-val">${escHtml(r.user.id)}</td></tr>
        <tr><td class="info-key">닉네임</td><td class="info-val">${escHtml(r.user.nick)}</td></tr>
        <tr><td class="info-key">가입일</td><td class="info-val">${joined}</td></tr>
        <tr><td class="info-key">작성글</td><td class="info-val"><button class="link-btn" data-nick="${escHtml(r.user.nick)}" onclick="openAuthor(this.dataset.nick)">${r.posts}개 보기</button></td></tr>
        <tr><td class="info-key">팔로워</td><td class="info-val">${r.followers}명</td></tr>
        <tr><td class="info-key">팔로잉</td><td class="info-val">${r.following.length}명 ${chips}</td></tr>
        <tr><td class="info-key">관심 종목</td><td class="info-val">${r.favs}개</td></tr>
      </table>
      <div class="profile-section">
        <h3>비밀번호 변경</h3>
        <div class="post-form-row">
          <input id="pfCurPw" type="password" placeholder="현재 비밀번호" maxlength="30" autocomplete="current-password">
          <input id="pfNewPw" type="password" placeholder="새 비밀번호 (6~30자)" maxlength="30" autocomplete="new-password">
          <button class="btn-submit" onclick="changePassword()">변경</button>
        </div>
        <p class="info-sub">변경하면 다른 기기의 로그인은 모두 해제됩니다.</p>
      </div>
      <div class="profile-section">
        <h3>회원 탈퇴</h3>
        <p class="info-sub">계정·관심 종목·팔로우 정보가 삭제되며 되돌릴 수 없습니다. 작성한 글은 남으니 지우려면 탈퇴 전에 직접 삭제해주세요. 닉네임은 사칭 방지를 위해 다른 사람이 쓸 수 없게 남겨둡니다.</p>
        <div class="post-form-row">
          <input id="pfOutPw" type="password" placeholder="비밀번호 확인" maxlength="30" autocomplete="current-password">
          <button class="btn-danger" onclick="withdraw()">탈퇴하기</button>
        </div>
      </div>`);
  } catch (e) {
    if (/로그인이 만료/.test(e.message)) setMember(null);
    showAuthorOverlay('회원정보', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

async function changePassword() {
  const password = document.getElementById('pfCurPw').value;
  const newPassword = document.getElementById('pfNewPw').value;
  if (!password) return alert('현재 비밀번호를 입력해주세요.');
  if (newPassword.length < 6 || newPassword.length > 30) return alert('새 비밀번호는 6~30자로 입력해주세요.');
  try {
    const r = await api({}, { action: 'changePassword', password, newPassword });
    setMember(r.user, r.token);
    document.getElementById('pfCurPw').value = '';
    document.getElementById('pfNewPw').value = '';
    alert('비밀번호가 변경되었습니다.');
  } catch (e) {
    alert(e.message);
  }
}

async function withdraw() {
  const password = document.getElementById('pfOutPw').value;
  if (!password) return alert('비밀번호를 입력해주세요.');
  if (!confirm('정말 탈퇴할까요? 계정과 관심 종목·팔로우 정보가 삭제되며 되돌릴 수 없습니다.')) return;
  try {
    await api({}, { action: 'withdraw', password });
    setMember(null);
    closeAuthor();
    alert('탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.');
  } catch (e) {
    alert(e.message);
  }
}

// ── 관심 종목 (회원 전용, 서버에 저장) ──
let favs = new Set();

async function loadFavs() {
  if (!member) favs = new Set();
  else {
    try { favs = new Set((await api({}, { action: 'favList' })).codes || []); } catch { favs = new Set(); }
  }
  refreshStars();
  if (currentFilter === 'fav') { renderStocks(filteredList()); fetchAllPrices(); }
}

function refreshStars() {
  document.querySelectorAll('.stock-card[data-code]').forEach(card => {
    const star = card.querySelector('.fav-star');
    if (!star) return;
    const on = favs.has(card.dataset.code);
    star.classList.toggle('on', on);
    star.textContent = on ? '★' : '☆';
  });
}

async function toggleFav(e, code) {
  e.stopPropagation();  // 카드 클릭(토론 창 열기)과 분리
  if (!member) {
    alert('관심 종목은 회원만 사용할 수 있습니다. 로그인 또는 회원가입을 해주세요.');
    return toggleLogin();
  }
  const on = !favs.has(code);
  on ? favs.add(code) : favs.delete(code);
  refreshStars();
  if (currentFilter === 'fav') renderStocks(filteredList());
  try {
    favs = new Set((await api({}, { action: 'favToggle', code, on })).codes || []);
  } catch (err) {
    on ? favs.delete(code) : favs.add(code);  // 실패 시 되돌림
    alert(`처리하지 못했습니다: ${err.message}`);
  }
  refreshStars();
  if (currentFilter === 'fav') renderStocks(filteredList());
}

async function checkMember() {
  if (!memberToken) return setMember(null);
  try {
    const r = await api({}, { action: 'me', token: memberToken });
    setMember(r.user);
  } catch (e) {
    // 네트워크 오류 시 로그인 상태 유지 시도하지 않음
  }
}

async function doLogin() {
  const userId = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPw').value;
  if (!userId || !password) return alert('아이디와 비밀번호를 입력해주세요.');
  try {
    const r = await api({}, { action: 'login', userId, password });
    setMember(r.user, r.token);
    document.getElementById('loginPw').value = '';
    closeDropdowns();
  } catch (e) {
    alert(e.message);
  }
}

async function doSignup() {
  const userId = document.getElementById('signupId').value.trim();
  const nick = document.getElementById('signupNick').value.trim();
  const password = document.getElementById('signupPw').value;
  if (!USER_ID_RE.test(userId)) return alert('아이디는 영문 또는 영문+숫자 4~20자로 입력해주세요.');
  if (!MEMBER_NICK_RE.test(nick)) return alert('닉네임은 한글 2~10자로 입력해주세요.');
  if (password.length < 6 || password.length > 30) return alert('비밀번호는 6~30자로 입력해주세요.');
  try {
    const r = await api({}, { action: 'signup', userId, nick, password });
    setMember(r.user, r.token);
    ['signupId', 'signupNick', 'signupPw'].forEach(i => { document.getElementById(i).value = ''; });
    closeDropdowns();
    alert(`${r.user.nick}님, 가입을 환영합니다!`);
  } catch (e) {
    alert(e.message);
  }
}

async function doLogout() {
  const token = memberToken;
  setMember(null);
  closeDropdowns();
  try { await api({}, { action: 'logout', token }); } catch {}
}

// ── 화면에 보이는 종목 실시간 주가 연동 (네이버 금융, 20초 주기 · 탭 숨김 시 정지) ────
const liveCodes = new Set();

async function startRealtime() {
  await fetchAllPrices();
  setInterval(whenVisible(fetchAllPrices), PRICE_REFRESH);
}

async function fetchAllPrices() {
  try {
    // 현재 탭 + 검색결과 + 열린 모달 종목만 조회 (API 1회 최대 50종목)
    const codes = new Set(filteredList().map(s => s.code));
    document.querySelectorAll('#searchResults .stock-card').forEach(c => codes.add(c.dataset.code));
    if (currentStock && !currentStock.isSector) codes.add(currentStock.code);
    const list = [...codes], chunks = [];
    for (let i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
    const results = await Promise.all(chunks.map(async c => {
      const res = await fetch(`${API_BASE}/api/stock?codes=${c.join(',')}`);
      const data = res.ok ? await res.json() : {};
      return Array.isArray(data.stocks) ? data.stocks : [];
    }));

    results.flat().forEach(d => {
      const s = STOCKS.find(x => x.code === d.code);
      if (!s || !d.price) return;
      s.price = d.price;
      s.change = d.changeRate;
      if (d.volume) s.volume = d.volume;
      liveCodes.add(s.code);
      updateCard(s);
    });

    // 열려있는 모달 가격도 갱신
    if (currentStock && liveCodes.has(currentStock.code)) {
      const up = currentStock.change >= 0;
      document.getElementById('modalPrice').textContent = fmtPrice(currentStock);
      const mc = document.getElementById('modalChange');
      mc.textContent = `${up ? '+' : ''}${currentStock.change}%`;
      mc.className = 'modal-change ' + (up ? 'up' : 'down');
    }
  } catch (e) {
    // 네트워크 오류 시 마지막 가격 유지
  }
}

function updateCard(s) {
  const up = s.change >= 0;
  // 목록·검색결과 양쪽 카드 모두 갱신
  document.querySelectorAll(`.stock-card[data-code='${s.code}']`).forEach(card => {
    const priceEl = card.querySelector('.stock-price');
    const chgEl = card.querySelector('.price-change');
    const avatarEl = card.querySelector('.stock-avatar');
    if (priceEl) priceEl.textContent = fmtPrice(s);
    if (chgEl) {
      chgEl.textContent = `${up ? '+' : ''}${s.change}%`;
      chgEl.className = 'price-change ' + (up ? 'up' : 'down');
    }
    if (avatarEl) { avatarEl.classList.toggle('up', up); avatarEl.classList.toggle('down', !up); }
  });
}

// ── 상단 지수 실시간 갱신 (/api/market, 20초 주기 · 탭 숨김 시 정지) ──
const MARKET_STATUS = { CLOSE: '장마감', PREOPEN: '장전', OPEN: '' };

function startMarketBanner() {
  fetchMarket();
  setInterval(whenVisible(fetchMarket), PRICE_REFRESH);
}

async function fetchMarket() {
  try {
    const res = await fetch(`${API_BASE}/api/market`);
    if (!res.ok) return;
    const { indices } = await res.json();
    (indices || []).forEach(renderIndexCard);
  } catch (e) {
    // 네트워크 오류 시 마지막 값 유지
  }
}

function renderIndexCard(d) {
  const card = document.querySelector(`.index-card[data-key="${d.key}"]`);
  if (!card || d.value == null) return;
  const digits = d.key === 'USDKRW' || d.value < 100000 ? 2 : 0;
  const fmt = n => Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const up = (d.diff ?? 0) > 0, down = (d.diff ?? 0) < 0;
  const arrow = up ? '▲' : down ? '▼' : '-';
  const sign = up ? '+' : down ? '-' : '';

  card.querySelector('.idx-value').textContent = fmt(d.value);
  const chg = card.querySelector('.idx-change');
  chg.textContent = `${arrow} ${fmt(d.diff ?? 0)} (${sign}${Math.abs(d.rate ?? 0).toFixed(2)}%)`;
  chg.className = 'idx-change ' + (up ? 'up' : down ? 'down' : '');
  const tag = d.delay || MARKET_STATUS[d.status] || '';
  card.querySelector('.idx-status').textContent = tag ? ` · ${tag}` : '';
  card.classList.add('live');
}

// ── 키보드 ESC 닫기 ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!document.getElementById('authorOverlay').classList.contains('hidden')) return closeAuthor();
    closeModal(null);
    closeDropdowns();
  }
});
