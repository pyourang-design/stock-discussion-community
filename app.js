// ── 상태 ──────────────────────────────────────────────
let currentFilter = 'all';
let currentStock = null;
let currentModalTab = 'discuss';
let loggedInUser = null;
let samsungLive = false;

// ── 초기화 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderStocks(STOCKS);
  simulatePriceFlicker();
  startSamsungRealtime();
  document.getElementById('postContent').addEventListener('input', updateCharCount);
});

// ── 종목 카드 렌더링 ──────────────────────────────────
function renderStocks(list) {
  const el = document.getElementById('stockList');
  if (!list.length) {
    el.innerHTML = '<p class="empty-msg">검색 결과가 없습니다.</p>';
    return;
  }
  el.innerHTML = list.map(s => stockCard(s)).join('');
}

function stockCard(s) {
  const up = s.change >= 0;
  const sign = up ? '+' : '';
  const posts = getPostsFor(s.code);
  const postCount = posts.length;
  const isLive = s.code === '005930';
  return `
  <div class="stock-card ${s.hot ? 'hot' : ''}" data-code="${s.code}" onclick="openModal('${s.code}')">
    <div class="card-left">
      <div class="stock-avatar ${up ? 'up' : 'down'}">${s.name[0]}</div>
      <div class="stock-meta">
        <div class="stock-name">${s.hot ? '🔥 ' : ''}${s.name}${isLive ? ' <span class="live-badge">LIVE</span>' : ''}</div>
        <div class="stock-sub">${s.code} · <span class="badge ${s.market}">${s.market.toUpperCase()}</span></div>
      </div>
    </div>
    <div class="card-right">
      <div class="stock-price" id="price-${s.code}">${s.price.toLocaleString()}원</div>
      <div class="price-change ${up ? 'up' : 'down'}" id="change-${s.code}">${sign}${s.change}%</div>
      <div class="stock-extra" id="extra-${s.code}">시총 ${s.cap} · 댓글 ${postCount}</div>
    </div>
  </div>`;
}

// ── 탭 필터 ───────────────────────────────────────────
function filterTab(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  let list = [...STOCKS];
  if (type === 'kospi') list = list.filter(s => s.market === 'kospi');
  else if (type === 'kosdaq') list = list.filter(s => s.market === 'kosdaq');
  else if (type === 'hot') list = list.filter(s => s.hot);
  else if (type === 'rise') list = list.filter(s => s.change > 0).sort((a, b) => b.change - a.change);
  else if (type === 'fall') list = list.filter(s => s.change < 0).sort((a, b) => a.change - b.change);

  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('stockList').classList.remove('hidden');
  renderStocks(list);
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
    s.name.includes(q) || s.code.includes(q)
  );
  stockEl.classList.add('hidden');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `<p class="search-label">검색결과 <strong>${results.length}건</strong></p>` +
    (results.length ? results.map(s => stockCard(s)).join('') : '<p class="empty-msg">종목을 찾을 수 없습니다.</p>');
}

// ── 모달 열기 ─────────────────────────────────────────
function openModal(code) {
  currentStock = STOCKS.find(s => s.code === code);
  if (!currentStock) return;

  const s = currentStock;
  const up = s.change >= 0;
  const sign = up ? '+' : '';

  document.getElementById('modalStockName').textContent = s.name;
  document.getElementById('modalStockCode').textContent = s.code;
  document.getElementById('modalPrice').textContent = s.price.toLocaleString() + '원';
  const chgEl = document.getElementById('modalChange');
  chgEl.textContent = `${sign}${s.change}%`;
  chgEl.className = 'modal-change ' + (up ? 'up' : 'down');

  // 종목 정보 테이블
  const tbl = document.getElementById('infoTable');
  tbl.innerHTML = Object.entries(s.info).map(([k, v]) =>
    `<tr><td class="info-key">${k}</td><td class="info-val">${v}</td></tr>`
  ).join('');

  switchModalTab('discuss', document.querySelector('.modal-tabs .tab'));
  renderPosts();

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.classList.add('no-scroll');
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay') && e.type === 'click') return;
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.classList.remove('no-scroll');
}

// ── 모달 탭 전환 ─────────────────────────────────────
function switchModalTab(tab, btn) {
  currentModalTab = tab;
  document.querySelectorAll('.modal-tabs .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('discussTab').classList.toggle('hidden', tab !== 'discuss');
  document.getElementById('infoTab').classList.toggle('hidden', tab !== 'info');
}

// ── 게시글 (localStorage) ─────────────────────────────
function storageKey(code) { return `posts_${code}`; }

function getPostsFor(code) {
  try { return JSON.parse(localStorage.getItem(storageKey(code)) || '[]'); } catch { return []; }
}

function savePost(code, post) {
  const posts = getPostsFor(code);
  posts.unshift(post);
  localStorage.setItem(storageKey(code), JSON.stringify(posts.slice(0, 200)));
}

function renderPosts() {
  if (!currentStock) return;
  const posts = getPostsFor(currentStock.code);
  const el = document.getElementById('postList');
  if (!posts.length) {
    el.innerHTML = '<p class="empty-msg">첫 번째 의견을 남겨보세요!</p>';
    return;
  }
  el.innerHTML = posts.map((p, i) => `
    <div class="post-item">
      <div class="post-header">
        <span class="post-nick">${escHtml(p.nick)}</span>
        <span class="post-sentiment ${p.sentiment}">${sentimentLabel(p.sentiment)}</span>
        <span class="post-time">${timeAgo(p.ts)}</span>
        <button class="btn-like ${p.liked ? 'liked' : ''}" onclick="toggleLike(${i})">
          👍 ${p.likes || 0}
        </button>
      </div>
      <div class="post-body">${escHtml(p.content)}</div>
    </div>
  `).join('');
}

function submitPost() {
  if (!currentStock) return;
  const nick = document.getElementById('postNickname').value.trim() || '익명';
  const content = document.getElementById('postContent').value.trim();
  const sentiment = document.getElementById('postSentiment').value;

  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }

  savePost(currentStock.code, { nick, content, sentiment, ts: Date.now(), likes: 0, liked: false });
  document.getElementById('postContent').value = '';
  document.getElementById('charCount').textContent = '0/500';
  renderPosts();
  renderStocks(filteredList());
}

function toggleLike(idx) {
  if (!currentStock) return;
  const posts = getPostsFor(currentStock.code);
  if (!posts[idx]) return;
  posts[idx].liked = !posts[idx].liked;
  posts[idx].likes = (posts[idx].likes || 0) + (posts[idx].liked ? 1 : -1);
  localStorage.setItem(storageKey(currentStock.code), JSON.stringify(posts));
  renderPosts();
}

function updateCharCount() {
  const len = document.getElementById('postContent').value.length;
  document.getElementById('charCount').textContent = `${len}/500`;
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

function filteredList() {
  let list = [...STOCKS];
  if (currentFilter === 'kospi') return list.filter(s => s.market === 'kospi');
  if (currentFilter === 'kosdaq') return list.filter(s => s.market === 'kosdaq');
  if (currentFilter === 'hot') return list.filter(s => s.hot);
  if (currentFilter === 'rise') return list.filter(s => s.change > 0).sort((a, b) => b.change - a.change);
  if (currentFilter === 'fall') return list.filter(s => s.change < 0).sort((a, b) => a.change - b.change);
  return list;
}

// ── 로그인 드롭다운 ───────────────────────────────────
function toggleLogin() {
  document.getElementById('loginDropdown').classList.toggle('hidden');
}

function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  if (!id) return;
  loggedInUser = id;
  document.getElementById('loginDropdown').classList.add('hidden');
  document.querySelector('.btn-login').textContent = id;
  document.getElementById('postNickname').value = id;
}

// ── 주가 깜빡임 시뮬레이션 (삼성전자 실시간 연동 시 제외) ──
function simulatePriceFlicker() {
  setInterval(() => {
    STOCKS.forEach(s => {
      if (s.code === '005930' && samsungLive) return;
      const delta = (Math.random() - 0.5) * 0.1;
      s.change = Math.round((s.change + delta) * 100) / 100;
      s.price = Math.max(100, Math.round(s.price * (1 + delta / 100)));
    });
    const cards = document.querySelectorAll('.stock-card');
    cards.forEach(card => {
      const code = card.dataset.code;
      if (code === '005930' && samsungLive) return;
      const s = STOCKS.find(x => x.code === code);
      if (!s) return;
      const priceEl = document.getElementById(`price-${code}`);
      const chgEl = document.getElementById(`change-${code}`);
      const avatarEl = card.querySelector('.stock-avatar');
      if (priceEl) priceEl.textContent = s.price.toLocaleString() + '원';
      if (chgEl) {
        const up = s.change >= 0;
        chgEl.textContent = `${up ? '+' : ''}${s.change}%`;
        chgEl.className = 'price-change ' + (up ? 'up' : 'down');
        if (avatarEl) avatarEl.className = 'stock-avatar ' + (up ? 'up' : 'down');
      }
    });
  }, 3000);
}

// ── 삼성전자 실시간 주가 연동 (네이버 금융) ─────────────
async function startSamsungRealtime() {
  await fetchSamsungPrice();
  setInterval(fetchSamsungPrice, 10000);
}

async function fetchSamsungPrice() {
  try {
    const res = await fetch('/api/stock?code=005930');
    if (!res.ok) return;
    const data = await res.json();
    if (data.error) return;

    const s = STOCKS.find(x => x.code === '005930');
    if (!s) return;
    s.price = data.price;
    s.change = data.changeRate;
    samsungLive = true;

    const up = data.changeRate >= 0;
    const sign = up ? '+' : '';

    const priceEl = document.getElementById('price-005930');
    const chgEl   = document.getElementById('change-005930');
    const card     = document.querySelector('[data-code="005930"]');
    const avatarEl = card?.querySelector('.stock-avatar');

    if (priceEl) priceEl.textContent = data.price.toLocaleString() + '원';
    if (chgEl) {
      chgEl.textContent = `${sign}${data.changeRate}%`;
      chgEl.className = 'price-change ' + (up ? 'up' : 'down');
    }
    if (avatarEl) avatarEl.className = 'stock-avatar ' + (up ? 'up' : 'down');

    // 열려있는 모달이 삼성전자면 가격도 갱신
    if (currentStock?.code === '005930') {
      document.getElementById('modalPrice').textContent = data.price.toLocaleString() + '원';
      const mc = document.getElementById('modalChange');
      mc.textContent = `${sign}${data.changeRate}%`;
      mc.className = 'modal-change ' + (up ? 'up' : 'down');
    }
  } catch (e) {
    // 장 마감 / 네트워크 오류 시 시뮬레이션 유지
  }
}

// ── 키보드 ESC 닫기 ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(null);
    document.getElementById('loginDropdown').classList.add('hidden');
  }
});
