// ── 상태 ──────────────────────────────────────────────
let currentFilter = 'semi';  // 현재 업종 탭 (처음 들어오면 반도체)
let currentStock = null;
let currentModalTab = 'discuss';
// index.html을 파일로 직접 열었을 때(file://)는 운영 서버 API 사용
const API_BASE = location.protocol === 'file:' ? 'https://upjong.com' : '';

// ── 초기화 ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 맨 앞 '관심 종목' 탭 (회원 전용), 처음 화면은 첫 업종 탭
  document.getElementById('tabBar').innerHTML = [FAV_TAB, ...SECTORS].map(sec =>
    `<button class="tab${sec.key === currentFilter ? ' active' : ''}" data-act="filterTab" data-key="${sec.key}">${tabLabel(sec)}</button>`).join('');
  renderStocks(filteredList());
  startRealtime();
  loadHomeNews();
  setInterval(whenVisible(() => loadHomeNews(true)), NEWS_REFRESH);
  startMarketBanner();
  refreshAdminUi();
  loadForumMeta();
  checkMember();
  openFromUrl();
  countVisit();
  loadSihwangLatest();
  document.getElementById('postContent').addEventListener('input', updateCharCount);
  document.getElementById('searchInput').addEventListener('input', searchStocks);
});

// ── 클릭·키 처리: 인라인 onclick 대신 data-act / data-enter / data-err (보안 헤더 CSP script-src 'self') ──
// 버튼에 data-act="이름"을 달면 아래 ACTIONS[이름](요소, 이벤트)가 실행됨 (안쪽 요소 우선 — 카드 안 ☆는 ☆만)
const ACTIONS = {
  openPdf: (el, e) => { e.preventDefault(); openPdf(el.getAttribute('href'), el.dataset.title); },
  closePdf: () => closePdf(),
  filterTab: el => filterTab(el.dataset.key, el),
  columnLink: (el, e) => { e.preventDefault(); el.blur(); openColumnLink(el.dataset.id || null, el.dataset.tab); },
  doSearch: () => doSearch(),
  openFeed: () => openFeed(),
  toggleLogin: () => toggleLogin(),
  toggleSignup: () => toggleSignup(),
  openProfile: () => openProfile(),
  profileFromMenu: () => { closeDropdowns(); openProfile(); },
  feedFromMenu: () => { closeDropdowns(); openFeed(); },
  closeDropdowns: () => closeDropdowns(),
  loginFromAuthor: () => { closeAuthor(); toggleLogin(); },
  signupFromAuthor: () => { closeAuthor(); toggleSignup(); },
  doLogin: () => doLogin(),
  doSignup: () => doSignup(),
  doLogout: () => doLogout(),
  modalOverlay: (el, e) => closeModal(e),
  modalClose: () => closeModal(),
  modalTab: el => switchModalTab(el.dataset.tab, el),
  authorOverlay: (el, e) => closeAuthor(e),
  authorClose: () => closeAuthor(),
  openNews: el => openModal(el.dataset.code, 'news'),
  openStock: el => openModal(el.dataset.code),
  openFavAll: () => openModal(FAV_ALL.code, 'news'),
  moreFavNews: () => moreFavNews(),
  toggleFav: (el, e) => toggleFav(e, el.dataset.code),
  moreSectorNews: el => moreSectorNews(el.dataset.key),
  moreNews: () => moreNews(),
  toggleMore: el => toggleMore(el),
  toggleAi: el => toggleAi(el),
  foldAi: el => foldAi(el),
  vote: el => vote(el.parentNode.dataset.id, el.dataset.dir),
  openAuthor: el => openAuthor(el.dataset.nick),
  toggleFollow: el => toggleFollow(el.dataset.nick),
  submitPost: () => submitPost(),
  pickImage: el => pickColumnImage(el.dataset.target),
  postAction: el => openPostAction(el.dataset.id, el.dataset.mode),
  savePostEdit: el => savePostEdit(el.dataset.id),
  closePostAction: () => closePostAction(),
  deletePost: el => deletePost(el.dataset.id),
  reportPost: el => reportPost(el.dataset.id),
  openColumn: el => openColumn(el.dataset.id),
  draftPreview: el => { el.closest('.draft-card')?.querySelector('.draft-preview')?.classList.toggle('hidden'); },
  draftLoad: el => loadDraftIntoWriteBox(el.dataset.kind),
  draftDiscard: el => discardSihwangDraft(el.dataset.kind),
  closeColumn: () => closeColumn(),
  goColumnPage: el => goColumnPage(Number(el.dataset.page)),
  toggleAdminForm: () => toggleAdminForm(),
  adminLogin: () => adminLogin(),
  adminLogout: () => adminLogout(),
  adminDelete: el => adminDeletePost(el.dataset.id, el),
  adminDeleteReported: el => adminDeletePost(el.dataset.id, el).then(openReports),
  adminUnblind: el => adminUnblind(el.dataset.id),
  openReports: () => openReports(),
  openContacts: () => openContacts(),
  openStats: () => openStats(),
  cleanupImages: el => cleanupImages(Number(el.dataset.n)),
  changePassword: () => changePassword(),
  withdraw: () => withdraw(),
  addToHome: () => addToHome(),
};
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-act]');
  const fn = el && ACTIONS[el.dataset.act];
  if (fn) fn(el, e);
});
// 입력칸에서 Enter → data-enter 동작 (로그인·가입·관리자 비밀번호)
document.addEventListener('keydown', e => {
  const fn = e.key === 'Enter' && e.target.dataset && ACTIONS[e.target.dataset.enter];
  if (fn) fn(e.target, e);
});
// 로그인·가입 폼은 Enter로 페이지가 다시 열리지 않게 (전송은 버튼·data-enter가 처리)
document.addEventListener('submit', e => e.preventDefault());
// 그림 못 불러오면: data-err="remove" 지움, "nologo" 종목 로고 자리 표시 (error는 버블링 안 돼서 캡처 단계)
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.err) return;
  if (img.dataset.err === 'nologo') img.parentNode?.classList.add('no-logo');
  img.remove();
}, true);

// 사이트 조회수 (같은 브라우저 30분에 1회 집계) — 화면 표시는 2026-10-19 삭제, 관리자 통계용 집계만
async function countVisit() {
  try { await api({}, { action: 'visit' }); } catch {}
}

// 주소로 바로 열기: /?stock=005930 → 그 종목이 속한 업종 탭 + 토론 창, /?sector=bio → 업종 탭 (종목 페이지에서 넘어올 때)
function openFromUrl() {
  const q = new URLSearchParams(location.search);
  const s = STOCKS.find(x => x.code === q.get('stock'));
  const key = s ? Object.keys(s.sectors)[0] : q.get('sector');
  if (key && SECTORS.some(x => x.key === key) && key !== currentFilter) {
    const btn = document.querySelector(`#tabBar .tab[data-key="${key}"]`);
    if (btn) filterTab(key, btn);
  }
  if (s) openModal(s.code);
  // 숨은 종목 바로가기 (/stock/코드 페이지가 공개된 숨은 종목에서 넘어올 때, api/_public.js) — 비회원도 listed.json을 받아 종목 창을 엶
  else if (/^([0-9][0-9A-Z]{5}|[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?)$/.test(q.get('stock') || '')) {
    const code = q.get('stock');
    loadHidden().then(() => { if (HIDDEN?.has(code)) openModal(code); });
  }
  if (q.get('tab') === 'fav') { history.replaceState(null, '', '/'); openFavTab(); }
  if (q.get('app') === '1') { history.replaceState(null, '', '/'); setTimeout(addToHome, 600); }  // 다른 페이지 하단 메뉴 '앱 다운' (설치 창 이벤트를 잠깐 기다림)
  const tab = q.has('sihwang') ? 'sihwang' : 'column', col = q.get(tab);
  // 바로가기 주소는 처음 기록에서 지움 (창을 닫으면 홈 주소로 돌아가게, 열린 칼럼 주소는 창 안에서 다시 반영)
  if (col) syncColumnUrl(null);
  if (col === 'list') openColumnLink(null, tab);
  else if (col && /^[0-9a-z]{6,20}$/.test(col)) openColumnLink(col, tab);
}

// 관심 종목 탭으로 (예전 하단 메뉴 '관심종목 추가'의 /?tab=fav 주소) → 회원은 검색창에 커서(검색해서 ☆로 추가), 비회원은 탭의 로그인·회원가입 안내
function openFavTab() {
  const btn = document.querySelector('#tabBar .tab[data-key="fav"]');
  if (btn && currentFilter !== 'fav') filterTab('fav', btn);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (member) document.getElementById('searchInput').focus();
}

// 탭 이름: PC는 한 줄, 모바일은 두 단어를 두 줄로 (예: 전력 / 원자력)
const FAV_TAB = { key: 'fav', name: '관심 종목' };
const TAB_LINES = { fav: ['관심', '종목'], elec: ['전자', '부품'], battery: ['2차전지', '로봇'], power: ['전력', '원자력'], ship: ['조선', '방산'], chem: ['화학', '철강'],
  logistics: ['물류·건설', '기계'], kbeauty: ['K뷰티', '컬쳐'], telecom: ['통신', '인터넷'], usa: ['미국', '주식'] };
function tabLabel(sec) {
  const l = TAB_LINES[sec.key];
  return l ? `<span class="tab-pc">${sec.name}</span><span class="tab-mo">${l[0]}<br>${l[1]}</span>` : sec.name;
}


// 가격 표시: 국내 원, 미국 달러
const fmtPrice = s => !s.price ? '-' : s.us
  ? '$' + s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : s.price.toLocaleString() + '원';
// 전일대비 금액 (가로 보기에서만 보임, 네이버처럼 ▲1,200 / ▼0.35) — 실시간 시세를 받기 전엔 빈칸
const fmtDiff = s => s.diff == null ? '' : (s.diff > 0 ? '▲' : s.diff < 0 ? '▼' : '') + Math.abs(s.diff).toLocaleString('en-US', s.us ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});

// ── 종목 카드 렌더링 ──────────────────────────────────
// 종목 목록 아래 안내: 업종 탭·미국 주식 탭 (관심 종목 탭·검색 결과를 보는 동안은 숨김)
const LIST_NOTE = {
  sector: '네이버 종목토론방 인기글·시가총액·거래대금 상위 64개 종목(시가총액순), 화면에 표시되지 않는 종목의 경우 회원 가입 후 관심 종목 등록을 통해 볼 수 있습니다.',
  usa: '국내 투자자가 가장 많이 보유한 미국 주식·ETF 상위 50개 + 최근 1년 보관·결제 상위 14개(한국예탁결제원 기준, 시가총액순)입니다.',
};
function updateListNote() {
  const el = document.getElementById('listNote');
  const searching = !document.getElementById('searchResults').classList.contains('hidden');
  el.classList.toggle('hidden', searching || currentFilter === 'fav');
  el.textContent = currentFilter === 'usa' ? LIST_NOTE.usa : LIST_NOTE.sector;
}

function renderStocks(list) {
  const el = document.getElementById('stockList');
  updateListNote();
  if (currentFilter === 'fav') {
    // 관심 종목 탭: 회원은 맨 앞에 주식 시장 경제 뉴스·토론 카드와 관심 종목 모아보기 카드, 이어서 등록한 관심 종목만 (비회원은 안내만)
    el.innerHTML = !member
      ? '<p class="empty-msg">관심 종목은 회원 전용입니다.<br><button class="link-btn" data-act="toggleLogin">로그인</button> 또는 <button class="link-btn" data-act="toggleSignup">회원가입</button> 후 상단의 종목 검색 또는 종목 카드의 ☆를 눌러 관심 종목을 추가하세요.<br>관심종목을 지정하면 지정한 관심종목들의 실시간 뉴스, 증권사 리포트, 공시 정보를 한꺼번에 볼 수 있습니다.</p>'
      : newsCardHtml(MARKET_KEY) + favAllCardHtml(list.length) + (list.length ? list.map(s => stockCard(s)).join('') : '<p class="empty-msg">아직 관심 종목이 없습니다.<br>종목 카드 오른쪽 위의 ☆를 눌러 추가하세요.</p>');
    loadCharts();
    return;
  }
  if (!list.length) {
    el.innerHTML = '<p class="empty-msg">검색 결과가 없습니다.</p>';
    return;
  }
  // 맨 앞 두 칸은 주식 시장 경제 뉴스·토론 → 업종 뉴스·토론, 이어서 종목 카드(시총순)
  el.innerHTML = newsCardHtml(MARKET_KEY) + newsCardHtml(currentFilter) + list.map(s => stockCard(s)).join('');
  loadCharts();
}

// ── 업종 게시판: 업종별 가상 코드(SECBIO 등)로 종목 게시판과 같은 DB를 사용 ──
const boardCode = key => 'SEC' + key.slice(0, 3).toUpperCase();
// 게시판·뉴스 카드 이름: "바이오 업종", 미국주식은 "미국주식"
const sectorTitle = sec => sec.key === 'usa' ? sec.name : `${sec.name} 업종`;
// 주식 시장 경제 게시판: 업종과 무관한 전체 시장·경제 뉴스와 토론 (뉴스는 /api/news?sector=market)
const MARKET_KEY = 'market';
const MARKET_BOARD = { code: 'SECMKT', name: '주식 시장 경제', sector: MARKET_KEY, isSector: true, isMarket: true };
const SECTOR_BOARDS = [MARKET_BOARD, ...SECTORS.map(sec => ({ code: boardCode(sec.key), name: sectorTitle(sec), sector: sec.key, isSector: true }))];
const sectorBoard = key => SECTOR_BOARDS.find(b => b.sector === key);
// 관심 종목 모아보기: 내 관심 종목들의 뉴스·리포트·공시를 한 창에서 (토론 게시판 없음)
const FAV_ALL = { code: 'FAVALL', name: '관심 종목 모아보기', isFav: true };
const findStock = code => stockOf(code) || SECTOR_BOARDS.find(b => b.code === code)
  || (code === FAV_ALL.code ? FAV_ALL : undefined)
  || (OP_CODES[code] ? { code, name: OP_BOARDS[OP_CODES[code]].name, isColumn: true } : undefined);
const sectorName = key => { const sec = SECTORS.find(x => x.key === key); return sec ? sectorTitle(sec) : ''; };

// ── 숨은 종목: 업종 탭에 없는 상장 종목 (listed.json, scripts/listed.mjs) ──
// 화면에는 안 보이고 회원 검색에서만 나옴 → 관심 종목에 넣고 종목 창(뉴스·리포트·공시·토론)을 볼 수 있음
// 회원이 관심 종목으로 담은 적 있는 종목은 /stock/ 페이지 공개, 회원 토론글이 쌓이면 사이트맵·RSS에도 (api/_public.js). 처음 필요할 때 한 번만 받음
let HIDDEN = null;  // 코드 → 종목
let hiddenLoading = null;
// 미국 종목 전체(us-listed.json, scripts/us_listed.mjs — 주식·ETF 약 1만 2천 개)도 같은 형식으로 함께 받아 뒤에 붙임 (국내 숨은 종목이 먼저 검색됨)
const getJson = f => fetch(`${API_BASE}/${f}`).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)));
function loadHidden() {
  return hiddenLoading ||= Promise.all([getJson('listed.json'), getJson('us-listed.json')]).then(([kr, us]) => kr.concat(us))
    .then(rows => { HIDDEN = new Map(rows.map(([code, name, market, cap, ticker, etf]) => [code, { code, name, market, cap, price: 0, change: 0, sectors: {}, hidden: true, ...(ticker ? { us: true, ticker, ...(etf ? { etf: true } : {}) } : {}) }])); })  // 6칸이면 탭에서 빠진 미국 종목
    .catch(() => { hiddenLoading = null; });  // 실패하면 다음에 다시
}
const stockOf = code => STOCKS.find(s => s.code === code) || HIDDEN?.get(code);


// ── 업종 뉴스 (업종 대표 종목의 네이버 종목 뉴스 모음, 1분마다 갱신) ──
const NEWS_REFRESH = 60000;
// 시세·지수 갱신 주기. 탭이 화면에 안 보일 때는 갱신을 멈춰 서버 호출(Cloudflare 무료 한도)을 아낌
const PRICE_REFRESH = 20000;
const whenVisible = fn => () => { if (!document.hidden) fn(); };
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { fetchAllPrices(); fetchMarket(); }  // 다시 보이면 바로 최신값으로
});
const NEWS_CHUNK = 25;      // 업종 전체 종목의 뉴스를 모음 — 서버 요청 1번에 25종목씩 나눠 보냄 (api/news.js MAX_CODES)
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
  elec: ['전자', '부품', 'MLCC', '기판', 'PCB', 'FC-BGA', '카메라모듈', '디스플레이', 'OLED', '가전', 'TV', '스마트폰', '갤럭시', '아이폰', '전장'],
  chem: ['화학', '석유화학', '정유', '유가', '나프타', '에틸렌', '철강', '철강재', '후판', '열연', '비철', '구리', '아연', '알루미늄', '리튬', '수소', '태양광', '가스'],
  logistics: ['해운', '운임', '컨테이너', 'SCFI', '벌크', '물류', '택배', '항공', '여객', '화물', '건설', '수주', '분양', '주택', '재건축', '플랜트', '기계', '건설기계', '굴착기', '시멘트'],
  consumer: ['식품', '음식료', '라면', '불닭', '과자', '음료', '주류', '담배', '의류', '패션', '유통', '백화점', '편의점', '마트', '이커머스', '소비', '내수', '가전렌탈', '교육'],
  telecom: ['통신', '5G', '6G', '요금', '플랫폼', '포털', '인터넷', '검색', 'AI', '클라우드', '데이터센터', 'IT서비스', 'SI', '게임', '신작', '소프트웨어', '보안', '광고', '웹툰'],
};

function isSectorNews(item, key) {
  if (item.source === 'google' || key === MARKET_KEY) return true;  // 구글·시장 뉴스는 검색어·주요뉴스 그대로 사용  // 구글은 업종 키워드 검색 결과라 그대로 사용
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
  const foot = key === MARKET_KEY
    ? `<div class="panel-footer"><span class="news-src naver">N</span>네이버 증권 (주요뉴스·실시간 속보) · <span class="news-src google">G</span>Google 뉴스 (증시·경제 키워드, 최근 7일)</div>`
    : `<div class="panel-footer"><span class="news-src naver">N</span>네이버 증권 (업종 전체 ${sectorList(key).length}종목 뉴스) · <span class="news-src google">G</span>Google 뉴스 (업종 키워드, 최근 7일)</div>`;
  if (!n.data.length) return '<p class="empty-msg">최근 뉴스가 없습니다.</p>' + foot;
  const shown = sectorShown[key] || NEWS_PAGE;
  const more = n.data.length > shown
    ? `<button class="news-more" data-act="moreSectorNews" data-key="${key}">더보기 (${shown} / ${n.data.length})</button>` : '';
  return `<div class="panel-status">업데이트 ${updated} · 1분마다 자동 갱신 · 최신 ${n.data.length}건</div>` + n.data.slice(0, shown).map(item => {
    const names = item.codes.map(c => STOCKS.find(s => s.code === c)?.name).filter(Boolean);
    // 종목 뉴스와 같은 모양: 제목 · 요약 · 출처 + 오른쪽 사진 미리보기 (구글 기사는 사진·요약 없음)
    return `
      <a class="feed-item" href="${safeUrl(item.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(item.title)}</div>
          ${item.summary ? `<div class="feed-summary">${escHtml(item.summary)}</div>` : ''}
          <div class="feed-meta"><span class="news-src ${item.source === 'google' ? 'google' : 'naver'}">${item.source === 'google' ? 'G' : 'N'}</span>${names.slice(0, 3).map(x => `<span class="news-stock">${escHtml(x)}</span>`).join('')}
            ${escHtml(item.press || '')} · ${newsTime(item.datetime)}</div>
        </div>
        ${/^https:\/\//.test(item.thumb || '') ? `<img class="feed-thumb" src="${safeUrl(item.thumb)}" alt="" loading="lazy" data-err="remove">` : ''}
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

// 실시간 뉴스 + 토론 게시판 통합 카드 (누르면 실시간 뉴스 탭, 토론 탭은 창 안에서 전환)
function newsCardHtml(key) {
  const n = sectorNews[key];
  const board = sectorBoard(key);
  const sub = `<span>${n?.data ? `뉴스 ${n.data.length}건` : '뉴스 불러오는 중...'}</span> · <span>댓글 ${postCounts[board.code] || 0}</span>`;
  // 두 줄 고정 (업종명이 길어도 줄바꿈은 한 번만): 첫 줄 이름, 둘째 줄 '실시간 뉴스 토론'
  const label = `<span>${escHtml(key === MARKET_KEY ? '주식 시장 경제' : board.name)}</span><br><span>실시간 뉴스 토론</span>`;
  return `
  <div class="stock-card sector-card ${key === MARKET_KEY ? 'market' : 'news'}" id="news-${key}" data-code="${board.code}" data-act="openNews">
    <div class="sector-icon">${key === MARKET_KEY ? '🌐' : '📰'}</div>
    <div class="sector-label">${label}</div>
    <div class="sector-sub">${sub}</div>
  </div>`;
}

// 시장 뉴스(관심 종목 탭 제외)와 현재 업종 뉴스를 함께 불러옴
function loadHomeNews(force = false) {
  if (currentFilter === 'fav') {
    if (member) loadSectorNews(force, MARKET_KEY);  // 관심 종목 탭(회원)도 맨 앞에 주식 시장 경제 카드
    return;
  }
  loadSectorNews(force, MARKET_KEY);
  loadSectorNews(force);
}

function redrawSectorNews(key) {
  const el = document.getElementById(`news-${key}`);
  if (el && (currentFilter === key || key === MARKET_KEY)) el.outerHTML = newsCardHtml(key);
  // 모달에서 해당 업종 뉴스를 보고 있으면 함께 갱신
  if (currentStock?.isSector && currentStock.sector === key && currentModalTab === 'news') {
    document.getElementById('newsTab').innerHTML = sectorNewsHtml(key);
  }
}

// 나눠 받은 업종 뉴스 합치기: 같은 제목은 하나로 (관련 종목은 모음) → 최신순
function mergeSectorNews(items) {
  const byTitle = new Map();
  for (const n of items) {
    const k = n.title.replace(/\s+/g, '');
    const prev = byTitle.get(k);
    if (prev) { for (const c of n.codes) if (!prev.codes.includes(c)) prev.codes.push(c); continue; }
    byTitle.set(k, { ...n, codes: [...n.codes] });
  }
  return [...byTitle.values()].sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)));
}

// 구글 뉴스 섞기: 20건마다 네이버 15건 + 구글 5건 — 네이버 3건 다음마다 구글 1건 (구글이 모자라면 네이버로, 네이버가 모자라면 구글로 채움)
// 구글 기사는 네이버보다 오래된 것이 많아 그냥 최신순으로 합치면 뒤로 밀려 거의 안 보임 (서버는 구글을 따로 붙여 보냄)
const MIX_STEP = 4;  // 4건마다 1건 = 20건에 5건
// arrange: 네이버·구글 목록을 각각 최신순으로 정리한 뒤 다시 줄 세우는 함수 (관심 종목 모아보기는 종목별 상한, capPerStock)
function mixGoogle(list, arrange = x => x) {
  const byTime = (a, b) => String(b.datetime).localeCompare(String(a.datetime));
  const naver = arrange(list.filter(n => n.source !== 'google').sort(byTime)), google = arrange(list.filter(n => n.source === 'google').sort(byTime));
  const out = [];
  while (naver.length || google.length) {
    const wantGoogle = out.length % MIX_STEP === MIX_STEP - 1;
    out.push((wantGoogle && google.length) || !naver.length ? google.shift() : naver.shift());
  }
  return out;
}

// 관심 종목 모아보기 뉴스: 화면 20건마다 한 종목은 최대 4건 (기사가 많은 종목이 화면을 다 채우지 않게)
// 네이버 15건·구글 5건 묶음 단위로 따로 적용(mixGoogle arrange) → 네이버는 15건 중 3건, 구글은 5건 중 1건까지
// 넘친 기사는 다음 묶음으로 넘기고, 다른 종목 기사가 모자라면 그대로 채움. 묶음 안은 최신순 유지
const capPerStock = (per, max) => list => {
  const out = [];
  let queue = list;
  while (queue.length) {
    const page = [], rest = [], cnt = {};
    for (const n of queue) {
      const c = n.codes?.[0];
      if (page.length < per && (!c || (cnt[c] || 0) < max)) { page.push(n); if (c) cnt[c] = (cnt[c] || 0) + 1; }
      else rest.push(n);
    }
    while (page.length < per && rest.length) page.push(rest.shift());  // 다른 종목 기사가 없으면 상한 넘어도 채움
    out.push(...page);
    queue = rest;
  }
  return out;
};
const capNaver = capPerStock(15, 3), capGoogle = capPerStock(5, 1);
const favNewsArrange = l => l[0]?.source === 'google' ? capGoogle(l) : capNaver(l);

async function loadSectorNews(force = false, key = currentFilter) {
  if (key === 'fav') return;
  const cached = sectorNews[key];
  if (cached && cached.data && !force && Date.now() - cached.ts < NEWS_REFRESH) return redrawSectorNews(key);
  const codes = key === MARKET_KEY ? [] : sectorList(key).map(s => s.code);
  const chunks = [];
  for (let i = 0; i < codes.length; i += NEWS_CHUNK) chunks.push(codes.slice(i, i + NEWS_CHUNK));
  if (!chunks.length) chunks.push([]);  // 시장 뉴스: 종목 없이 sector=market 한 번
  try {
    // 구글 업종 뉴스는 첫 요청(sector 포함)에서만 받음. 일부 요청이 실패해도 받은 기사로 표시
    const results = await Promise.allSettled(chunks.map(async (c, i) => {
      const res = await fetch(`${API_BASE}/api/news?${i === 0 ? `sector=${key}&` : ''}codes=${c.join(',')}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || res.status);
      return json.data;
    }));
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!items.length) throw new Error('no news');
    sectorNews[key] = { ts: Date.now(), data: mixGoogle(mergeSectorNews(items).filter(n => isSectorNews(n, key))).slice(0, SECTOR_NEWS_MAX) };
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
  <div class="stock-card" data-code="${escHtml(s.code)}" data-act="openNews">
    <div class="day-candle">${dayCandleSvg(s)}</div>
    <div class="card-top">
      <div class="stock-avatar ${up ? 'up' : 'down'}">
        <img class="stock-logo" src="${escHtml(s.logo || LOGO_URL(s.code))}" alt="${escHtml(s.name)} CI" loading="lazy"
             data-err="nologo">
        <span class="avatar-letter">${escHtml(s.name[0])}</span>
      </div>
      <div class="card-quote">
        <div class="stock-price">${fmtPrice(s)}</div>
        <div class="price-diff ${up ? 'up' : 'down'}">${fmtDiff(s)}</div>
        <div class="price-change ${up ? 'up' : 'down'}">${sign}${s.change}%</div>
      </div>
      <div class="mini-chart" data-chart="${escHtml(s.code)}">${miniChartSvg(s.code)}</div>
      <div class="card-marks">
        <button class="fav-star${favs.has(s.code) ? ' on' : ''}" title="관심 종목" data-code="${escHtml(s.code)}" data-act="toggleFav">${favs.has(s.code) ? '★' : '☆'}</button>
      </div>
    </div>
    <div class="stock-meta">
      <div class="stock-name" title="${escHtml(s.name)}">${escHtml(s.name)}</div>
      <div class="stock-sub">${escHtml(s.us ? s.ticker : s.code)} · <span class="badge ${escHtml(s.market)}">${escHtml(String(s.market).toUpperCase())}</span>${s.etf ? ' <span class="badge etf">ETF</span>' : ''}</div>
    </div>
    <div class="card-bottom">
      <div class="stock-extra"><span>${s.etf ? '규모' : '시총'} ${escHtml(s.cap)}</span><i> · </i><span>댓글 ${postCount}</span></div>
    </div>
  </div>`;
}

// 카드 보기 오른쪽 당일 캔들 1개 (실시간 시세마다 갱신): 높이 = 전일종가 포함 당일 범위, 단 전일종가의 4% 미만이면 4%로 잡아
// 작은 등락은 작게 보이게. 양봉(종가 ≥ 시가) 빨강·음봉 파랑
function dayCandleSvg(s) {
  const [o, h, l, c, prev] = s.ohlc || [];
  if (!(o > 0 && h > 0 && l > 0 && c > 0)) return '';
  const base = prev > 0 ? prev : o;
  let top = Math.max(h, base), bot = Math.min(l, base);
  const min = base * 0.04;
  if (top - bot < min) { const pad = (min - (top - bot)) / 2; top += pad; bot -= pad; }
  const y = v => ((top - v) / (top - bot) * 96 + 2).toFixed(1);
  const bodyTop = y(Math.max(o, c)), bodyH = Math.max(1.5, y(Math.min(o, c)) - bodyTop).toFixed(1);
  const cls = c >= o ? 'c-up' : 'c-down';
  return `<svg viewBox="0 0 12 100" preserveAspectRatio="none" aria-label="당일 일봉"><g class="${cls}"><line x1="6" x2="6" y1="${y(h)}" y2="${y(l)}"/><rect x="2" y="${bodyTop}" width="8" height="${bodyH}"/></g></svg>`;
}

// ── 가로 보기 일봉 (최근 20거래일, /api/chart 25종목씩, 5분 캐시) — 카드 보기에선 받지 않음 ──
const CHART_TTL = 5 * 60 * 1000;
const chartData = {};  // 코드 → { ts, candles: [[시가, 고가, 저가, 종가], ...] }
const chartLoading = new Set();
function miniChartSvg(code) {
  const c = chartData[code]?.candles;
  if (!c?.length) return '';
  const hi = Math.max(...c.map(d => d[1])), lo = Math.min(...c.map(d => d[2]));
  const H = 30, step = 3, range = hi - lo || 1;
  const y = v => ((hi - v) / range * (H - 2) + 1).toFixed(1);
  const bars = c.map(([o, h, l, cl], i) => {
    const x = i * step + 1.5, up = cl >= o;
    const top = y(Math.max(o, cl)), bh = Math.max(0.8, y(Math.min(o, cl)) - top).toFixed(1);
    return `<g class="${up ? 'c-up' : 'c-down'}"><line x1="${x}" x2="${x}" y1="${y(h)}" y2="${y(l)}"/><rect x="${x - 1}" y="${top}" width="2" height="${bh}"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${c.length * step} ${H}" preserveAspectRatio="none" aria-label="최근 ${c.length}거래일 일봉">${bars}</svg>`;
}
async function loadCharts() {
  if (!isListView()) return;
  const els = [...document.querySelectorAll('.mini-chart[data-chart]')];
  const need = [...new Set(els.map(e => e.dataset.chart))]
    .filter(c => !chartLoading.has(c) && !(chartData[c] && Date.now() - chartData[c].ts < CHART_TTL));
  // 이미 받은 일봉은 바로 그림 (탭을 오가며 다시 그린 카드)
  els.forEach(e => { if (!e.firstChild && chartData[e.dataset.chart]) e.innerHTML = miniChartSvg(e.dataset.chart); });
  if (!need.length) return;
  need.forEach(c => chartLoading.add(c));
  const chunks = [];
  for (let i = 0; i < need.length; i += 25) chunks.push(need.slice(i, i + 25));
  await Promise.all(chunks.map(async codes => {
    try {
      const res = await fetch(`${API_BASE}/api/chart?codes=${codes.join(',')}`);
      const { charts } = res.ok ? await res.json() : {};
      Object.entries(charts || {}).forEach(([code, candles]) => {
        chartData[code] = { ts: Date.now(), candles };
        document.querySelectorAll(`.mini-chart[data-chart='${code}']`).forEach(e => { e.innerHTML = miniChartSvg(code); });
      });
    } catch (e) {
      // 실패하면 빈칸으로 두고 다음 갱신 때 다시
    } finally {
      codes.forEach(c => chartLoading.delete(c));
    }
  }));
}
document.addEventListener('viewchange', loadCharts);  // theme.js 가로 보기 버튼
setInterval(whenVisible(loadCharts), CHART_TTL);

// ── 탭 필터 ───────────────────────────────────────────
function filterTab(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.tab-bar .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('stockList').classList.remove('hidden');
  renderStocks(filteredList());
  fetchAllPrices();
  loadHomeNews();
}

// 업종 탭 종목: 시총·토론글·거래대금 순위 상위 64개 (scripts/build.mjs, 시총순)
function filteredList() {
  if (currentFilter === 'fav') return member ? [...STOCKS.filter(s => favs.has(s.code)), ...[...favs].map(c => HIDDEN?.get(c)).filter(Boolean)] : [];
  return sectorList(currentFilter);
}


function sectorList(key) {
  return STOCKS.filter(s => s.sectors[key]).sort((a, b) => a.sectors[key].order - b.sectors[key].order);
}


// ── 검색 ──────────────────────────────────────────────
// 브라우저 자동 채우기(저장된 로그인 아이디 등)가 검색창에 들어가면 "종목을 찾을 수 없습니다"만 보이는 문제 방지:
// 검색창에 커서가 없는데 값이 바뀌면(=사용자가 친 게 아니면) 비움
function clearAutofilledSearch() {
  const input = document.getElementById('searchInput');
  if (input.value && document.activeElement !== input) { input.value = ''; searchStocks(); }
}
window.addEventListener('pageshow', clearAutofilledSearch);
[300, 1000, 2500].forEach(ms => setTimeout(clearAutofilledSearch, ms));

// 돋보기 버튼·Enter: 지금 입력한 글자로 검색하고 결과로 이동 (휴대폰 자판 닫힘). 빈 칸이면 검색창에 커서만
function doSearch() {
  const input = document.getElementById('searchInput');
  if (!input.value.trim()) return input.focus();
  searchStocks();
  input.blur();
  document.getElementById('searchResults').scrollIntoView({ block: 'start', behavior: 'smooth' });
}
document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doSearch(); } });

const HIDDEN_SEARCH_MAX = 30;
let searchPriceTimer;
// 별칭 검색: 영문 종목명(NAVER, SK, LG …)을 한글로, 한글 그룹명을 영문으로도 찾음 — [한글, 영문(소문자)]
// 긴 것부터 바꿈 (에스케이씨 → skc 가 에스케이 → sk 보다 먼저)
const SEARCH_ALIASES = [
  ['케이티앤지', 'kt&g'], ['에스케이씨', 'skc'], ['에이치엘비', 'hlb'], ['에이치엠엠', 'hmm'], ['엔에이치엔', 'nhn'], ['비지에프', 'bgf'],
  ['케이씨씨', 'kcc'], ['오씨아이', 'oci'], ['제이와이피', 'jyp'], ['에스오일', 's-oil'], ['포스코', 'posco'], ['네이버', 'naver'],
  ['에스케이', 'sk'], ['엘지', 'lg'], ['케이티', 'kt'], ['씨제이', 'cj'], ['지에스', 'gs'], ['에이치디', 'hd'], ['디비', 'db'], ['케이비', 'kb'],
  ['엘에스', 'ls'], ['에스디아이', 'sdi'], ['엔씨', 'nc'], ['와이지', 'yg'], ['아이에스씨', 'isc'], ['에스엔티', 'snt'],
  ['삼성', 'samsung'], ['현대', 'hyundai'], ['카카오', 'kakao'], ['롯데', 'lotte'], ['한화', 'hanwha'], ['두산', 'doosan'], ['셀트리온', 'celltrion'],
].sort((a, b) => b[0].length - a[0].length);
function searchVariants(q) {
  let ko2en = q, en2ko = q;
  for (const [ko, en] of SEARCH_ALIASES) { ko2en = ko2en.split(ko).join(en); }
  for (const [ko, en] of [...SEARCH_ALIASES].sort((a, b) => b[1].length - a[1].length)) { if (en.length >= 4 || en2ko === en) en2ko = en2ko.split(en).join(ko); }
  return [...new Set([q, ko2en, en2ko])];
}

function searchStocks(e) {
  const input = document.getElementById('searchInput');
  if (e && document.activeElement !== input) input.value = '';
  const q = input.value.trim().toLowerCase();
  const stockEl = document.getElementById('stockList');
  const resultEl = document.getElementById('searchResults');

  if (!q) {
    resultEl.classList.add('hidden');
    stockEl.classList.remove('hidden');
    updateListNote();
    return;
  }

  const qs = searchVariants(q);
  const match = s => { const nm = s.name.toLowerCase(); return qs.some(v => nm.includes(v)) || s.code.toLowerCase().includes(q) || (s.ticker || '').toLowerCase().includes(q); };
  const results = STOCKS.filter(match);
  // 회원은 숨은 종목도 검색 (최대 HIDDEN_SEARCH_MAX개, 시가총액 큰 순)
  if (member) {
    if (!HIDDEN) loadHidden().then(() => { if (HIDDEN && input.value.trim()) searchStocks(); });
    else {
      // 티커·종목명이 검색어와 똑같은 종목을 맨 앞에 (예: 'ON', 'T'처럼 짧은 미국 티커가 다른 종목에 묻히지 않게)
      const exact = [], more = [];
      for (const s of HIDDEN.values()) {
        if (!match(s)) continue;
        if ((s.ticker || '').toLowerCase() === q || s.name.toLowerCase() === q) exact.push(s);
        else if (more.length < HIDDEN_SEARCH_MAX) more.push(s);
      }
      more.unshift(...exact);
      more.length = Math.min(more.length, HIDDEN_SEARCH_MAX);
      if (more.length) { results.push(...more); clearTimeout(searchPriceTimer); searchPriceTimer = setTimeout(fetchAllPrices, 400); }
    }
  }
  stockEl.classList.add('hidden');
  resultEl.classList.remove('hidden');
  updateListNote();
  resultEl.innerHTML = `<p class="search-label">검색결과 <strong>${results.length}건</strong></p>` +
    (results.length ? results.map(s => stockCard(s)).join('') : member ? '<p class="empty-msg">종목을 찾을 수 없습니다.</p>' : '') +
    (member ? '' : '<p class="empty-msg">회원가입 시 전체 종목을 볼 수 있습니다.<br><button class="link-btn" data-act="toggleSignup">회원가입</button> 또는 <button class="link-btn" data-act="toggleLogin">로그인</button></p>');
  loadCharts();
}

// ── 모달 열기 ─────────────────────────────────────────
function openModal(code, tab = 'discuss') {
  currentStock = findStock(code);
  if (!currentStock) return;

  const s = currentStock;
  // 업종 게시판: 가격·종목정보 탭 없이 토론 + 실시간 업종 뉴스
  document.getElementById('modal').classList.toggle('sector-mode', !!s.isSector);
  document.getElementById('modal').classList.toggle('market-mode', !!s.isMarket);  // 운영자 칼럼 탭은 주식 시장 경제 게시판에만
  document.getElementById('modal').classList.toggle('fav-mode', !!s.isFav);  // 관심 종목 모아보기: 토론 탭·가격 없음
  delete document.getElementById('discussTab').dataset.board;
  document.getElementById('modal').classList.toggle('us-mode', !!s.us);  // 미국 종목: 보고서·공시 탭 없음
  document.querySelector('.modal-tabs .tab[data-tab="news"]').textContent = s.isMarket ? '실시간 뉴스' : s.isSector ? '실시간 업종 뉴스' : '실시간 종목 뉴스';
  document.querySelector('.modal-tabs .tab[data-tab="discuss"]').textContent = s.isMarket ? '시장 토론' : s.isSector ? '업종 토론' : '종목 토론';
  document.getElementById('modalStockName').textContent = s.isMarket ? '주식 시장 경제 토론 게시판' : s.isSector ? `${s.name} 게시판` : s.name;
  document.getElementById('modalStockCode').textContent = s.isMarket ? '시장·경제 전체 토론' : s.isSector ? '업종 전체 토론' : s.isFav ? `관심 종목 ${favs.size}개` : s.us ? `${s.ticker} · ${s.market.toUpperCase()}${s.etf ? ' ETF' : ''}` : s.code;
  const chgEl = document.getElementById('modalChange');
  if (s.isSector || s.isFav) {
    document.getElementById('modalPrice').textContent = '';
    chgEl.textContent = '';
  } else {
    const up = s.change >= 0;
    document.getElementById('modalPrice').textContent = fmtPrice(s);
    chgEl.innerHTML = `${up ? '+' : ''}${escHtml(s.change)}%${sessionTagHtml(s)}`;
    chgEl.className = 'modal-change ' + (up ? 'up' : 'down');
  }

  DETAIL_TABS.forEach(t => { document.getElementById(`${t}Tab`).innerHTML = ''; });
  switchModalTab(tab);
  prefetchDetails(currentStock);
  if (!s.isFav) renderPosts();

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
  const q = new URLSearchParams(location.search);
  if (q.has('column') || q.has('sihwang')) syncColumnUrl(null);
  currentStock = null;
  loadSihwangLatest();  // 시황을 쓰거나 지웠으면 홈 한 줄도 바뀜
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
  if (layer !== 'pdf' && isOpen('pdfOverlay')) closePdf(true);  // 리포트 보기 → 뒤로 가기: 보기 창만 닫힘
  if (layer !== 'author' && isOpen('authorOverlay')) document.getElementById('authorOverlay').classList.add('hidden');
  if (!layer && isOpen('modalOverlay')) hideModal();
});
// 창이 열린 채 새로고침한 경우 남은 기록 상태 정리
if (history.state?.layer) history.replaceState(null, '');

// ── 모달 탭 전환 ─────────────────────────────────────
const DETAIL_TABS = ['news', 'research', 'disclosure'];

function switchModalTab(tab, btn) {
  currentModalTab = tab;
  document.querySelectorAll('.modal-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.getElementById('discussTab').classList.toggle('hidden', tab !== 'discuss' && !OP_BOARDS[tab]);
  // 토론 ↔ 운영자 칼럼(강의·시황): 같은 글 목록 화면을 쓰므로, 불러온 게시판(renderPosts가 기록)과 다르면 다시 불러옴
  if ((tab === 'discuss' || OP_BOARDS[tab]) && currentStock) {
    renderWriteBox();
    const loaded = document.getElementById('discussTab').dataset.board;
    if (loaded && loaded !== boardCodeNow()) renderPosts();
  }
  DETAIL_TABS.forEach(t => document.getElementById(`${t}Tab`).classList.toggle('hidden', t !== tab));

  stopNewsRefresh();
  if (currentStock?.isFav) {
    if (!DETAIL_TABS.includes(tab)) return;
    loadFavDetail(tab);
    if (tab === 'news') newsTimer = setInterval(whenVisible(() => loadFavDetail('news', true)), NEWS_REFRESH);
    return;
  }
  if (currentStock?.isSector) {
    if (tab === 'news') {
      const key = currentStock.sector;
      document.getElementById('newsTab').innerHTML = sectorNewsHtml(key);
      loadSectorNews(false, key);
      newsTimer = setInterval(whenVisible(() => loadSectorNews(true, key)), NEWS_REFRESH);
    }
    if (tab === 'research') loadDetail(tab);  // 시장: 투자전략, 업종: 산업분석 리포트 (api/detail.js boardResearch)
    return;
  }
  if (DETAIL_TABS.includes(tab)) loadDetail(tab);
  if (tab === 'news') newsTimer = setInterval(whenVisible(() => loadDetail('news', true)), NEWS_REFRESH);
}

// ── 상세 데이터 (뉴스·종목정보·보고서·공시) ────────────
const detailCache = {};
const DETAIL_TTL = { news: 60000, research: 600000, disclosure: 300000 };
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

// 종목 뉴스·리포트·공시 받기 — 같은 것을 받는 중이면 그 요청을 같이 기다림 (미리 받기와 탭 누르기가 겹쳐도 한 번만)
const detailInflight = {};
function fetchDetail(s, type) {
  const key = `${type}_${s.code}`;
  return detailInflight[key] ||= fetch(`${API_BASE}/api/detail?code=${s.code}&type=${type}`)
    .then(async res => {
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || res.status);
      return detailCache[key] = { ts: Date.now(), data: type === 'news' && Array.isArray(json.data) ? mixGoogle(json.data) : json.data };
    })
    .finally(() => { delete detailInflight[key]; });
}
// 종목 창을 열면 뉴스·리포트·공시를 미리 받아 둠 → 탭을 누르면 바로 보임 (미국 종목은 뉴스만)
function prefetchDetails(s) {
  if (!s || s.isSector || s.isFav) return;
  for (const type of s.us ? ['news'] : DETAIL_TABS) {
    const c = detailCache[`${type}_${s.code}`];
    if (!c || Date.now() - c.ts >= DETAIL_TTL[type]) fetchDetail(s, type).catch(() => {});
  }
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
    await fetchDetail(s, type);
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

const naverUrl = s => s.isSector
  ? `https://m.stock.naver.com/research/${s.isMarket ? 'invest' : 'industry'}`
  : s.us
  ? `https://m.stock.naver.com/worldstock/${s.etf ? 'etf' : 'stock'}/${s.code}/total`
  : `https://m.stock.naver.com/domestic/stock/${s.code}/total`;
// 증권사 리포트 링크: PC는 원문 PDF(/api/report)를 새 탭으로, 휴대폰은 같은 원문을 사이트 안 보기 창(openPdf)으로
// (휴대폰·홈 화면 앱은 PDF를 새 창에서 못 띄워 빈 창이 열리거나 뒤로 가기 때 앱이 닫힘)
const MOBILE = matchMedia('(pointer: coarse)').matches;
const REPORT_RE = /^\/api\/report\?kind=(company|industry|invest)&id=(\d+)$/;
const reportAttrs = r => MOBILE && REPORT_RE.test(r.url || '') ? ` data-act="openPdf" data-title="${escHtml(r.title)}"` : '';

// ── 휴대폰 리포트 보기: PDF.js로 원문을 그려 사이트 안 전체 화면 창에 (뒤로 가기·← 뒤로로 닫으면 보던 종목 창) ──
let pdfjsLoading = null, pdfToken = 0;
const loadPdfjs = () => pdfjsLoading ||= new Promise((resolve, reject) => {
  const sc = document.createElement('script');
  sc.src = '/vendor/pdfjs/pdf.min.js';
  sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
  sc.onerror = () => { pdfjsLoading = null; reject(new Error('pdf.js')); };
  document.head.appendChild(sc);
});
async function openPdf(url, title) {
  const token = ++pdfToken;
  const box = document.getElementById('pdfPages');
  const m = String(url).match(REPORT_RE);
  const naver = m ? `https://m.stock.naver.com/investment/research/${m[1]}/${m[2]}` : url;
  document.getElementById('pdfTitle').textContent = title || '증권사 리포트';
  box.innerHTML = '<p class="empty-msg">리포트를 불러오는 중...</p>';
  box.scrollTop = 0;
  const wasOpen = isOpen('pdfOverlay');
  document.getElementById('pdfOverlay').classList.remove('hidden');
  enterLayer('pdf', wasOpen);
  try {
    // 원문 PDF가 없으면 서버가 네이버 리포트 화면으로 보내므로(302) 따라가지 않고 그때는 링크로 안내
    const [lib, res] = await Promise.all([loadPdfjs(), fetch(url, { redirect: 'manual' })]);
    if (!res.ok || !(res.headers.get('Content-Type') || '').includes('pdf')) throw new Error('no pdf');
    const pdf = await lib.getDocument({ data: await res.arrayBuffer(), isEvalSupported: false }).promise;
    if (token !== pdfToken) return;
    box.innerHTML = '';
    const width = box.clientWidth - 16, dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= pdf.numPages; i++) {  // 한 쪽씩 차례로 (앞쪽부터 바로 보이게)
      const page = await pdf.getPage(i);
      if (token !== pdfToken) return;
      const viewport = page.getViewport({ scale: (width * dpr * 1.5) / page.getViewport({ scale: 1 }).width });  // 1.5배: 손가락으로 확대해도 선명하게
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      box.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch {
    if (token !== pdfToken) return;
    box.innerHTML = `<p class="empty-msg">리포트 원문을 불러오지 못했습니다.<br><a href="${escHtml(naver)}" target="_blank" rel="noopener">네이버 증권에서 보기 ↗</a></p>`;
  }
}
function closePdf(fromPop) {
  if (!isOpen('pdfOverlay')) return;
  pdfToken++;
  document.getElementById('pdfOverlay').classList.add('hidden');
  document.getElementById('pdfPages').innerHTML = '';
  if (!fromPop) leaveLayer();
}
// 외부 https 링크 또는 우리 서버 경로(/api/report = 리포트 원문 PDF)
const safeUrl = u => /^(https:\/\/|\/api\/)/.test(u || '') ? escHtml(u) : '#';

function renderDetail(type, data, ts) {
  const s = currentStock;
  const footer = `<div class="panel-footer">출처: ${s.isSector ? `네이버 증권 리서치 · ${s.isMarket ? '투자전략' : s.sector === 'usa' ? '투자전략 (미국·글로벌 관련)' : '산업분석 (업종 분류·키워드로 선별, 최근 약 한 달)'}` : type === 'news' ? '<span class="news-src naver">N</span>네이버 증권 · <span class="news-src google">G</span>Google 뉴스 (종목명 검색)' : '네이버 증권'}</div>`;


  if (!data || !data.length) {
    const label = { news: '뉴스가', research: '증권사 리포트가', disclosure: '공시가' }[type];
    return `<p class="empty-msg">최근 ${label} 없습니다.</p>` + footer;
  }

  if (type === 'news') {
    const updated = new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
    const shown = newsShown[s.code] || NEWS_PAGE;
    const more = data.length > shown
      ? `<button class="news-more" data-act="moreNews">더보기 (${shown} / ${data.length})</button>` : '';
    return `<div class="panel-status">업데이트 ${updated} · 1분마다 자동 갱신 · 최신 ${data.length}건</div>` +
      data.slice(0, shown).map(n => `
      <a class="feed-item" href="${safeUrl(n.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(n.title)}</div>
          <div class="feed-summary">${escHtml(n.summary || '')}</div>
          <div class="feed-meta"><span class="news-src ${n.source === 'google' ? 'google' : 'naver'}">${n.source === 'google' ? 'G' : 'N'}</span>${escHtml(n.press || '')} · ${newsTime(n.datetime)}</div>
        </div>
        ${/^https:\/\//.test(n.thumb || '') ? `<img class="feed-thumb" src="${safeUrl(n.thumb)}" alt="" loading="lazy" data-err="remove">` : ''}
      </a>`).join('') + more + footer;
  }

  if (type === 'research') {
    return data.map(r => `
      <a class="feed-item" href="${safeUrl(r.url)}" target="_blank" rel="noopener"${reportAttrs(r)}>
        <div class="feed-main">
          <div class="feed-title">${escHtml(r.title)}</div>
          <div class="feed-summary">${escHtml(r.summary || '')}</div>
          <div class="feed-meta"><span class="feed-tag">${escHtml(r.broker || '')}</span>${r.category && r.category !== '기타' && r.category !== '투자전략' ? ` <span class="feed-tag">${escHtml(r.category)}</span>` : ''} ${escHtml(r.date || '')} · 조회 ${escHtml(String(r.views ?? 0))}</div>
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

// 뉴스 시각 (YYYYMMDDHHmm) → "N분 전"
function newsTime(dt) {
  const m = String(dt || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return '';
  return timeAgo(new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime());
}

// ── 관심 종목 모아보기 (관심 종목 탭의 두 번째 카드) ──
// 뉴스: /api/news?codes= (업종 뉴스와 같은 방식), 리포트·공시: /api/detail?codes=&type= (국내 종목만) — 둘 다 25종목씩 나눠 요청
const favDetail = {};  // type → { ts, key: 관심 종목 코드 목록, data } | { key, error }
let favNewsShown = NEWS_PAGE;
const favCodes = () => [...favs].filter(c => stockOf(c)).sort();
const stockName = c => stockOf(c)?.name;
const favItemTime = d => String(d.datetime || d.date || '');

function favAllCardHtml(count) {
  return `
  <div class="stock-card sector-card fav-all" id="favAllCard" data-act="openFavAll">
    <div class="sector-icon">⭐</div>
    <div class="sector-label"><span>관심 종목</span><br><span>뉴스·리포트·공시</span></div>
    <div class="sector-sub">관심 종목 ${count}개 한 번에 보기</div>
  </div>`;
}

async function loadFavDetail(type, force = false) {
  const panel = document.getElementById(`${type}Tab`);
  const codes = favCodes(), key = codes.join(',');
  if (!codes.length) {
    panel.innerHTML = '<p class="empty-msg">아직 관심 종목이 없습니다.<br>종목 카드 오른쪽 위의 ☆를 눌러 추가하세요.</p>';
    return;
  }
  const cached = favDetail[type]?.key === key ? favDetail[type] : null;
  if (cached?.data && !force && Date.now() - cached.ts < DETAIL_TTL[type]) {
    panel.innerHTML = favDetailHtml(type);
    return;
  }
  if (!cached?.data) panel.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  if (!cached) favNewsShown = NEWS_PAGE;

  // 미국 종목은 리포트·공시가 없어 뉴스만
  const list = type === 'news' ? codes : codes.filter(c => !stockOf(c).us);
  const chunks = [];
  for (let i = 0; i < list.length; i += NEWS_CHUNK) chunks.push(list.slice(i, i + NEWS_CHUNK));
  const results = await Promise.allSettled(chunks.map(async (c, i) => {
    // 뉴스 첫 요청은 구글 뉴스도 (관심 종목 이름으로 검색, api/news.js favGoogleNews)
    const res = await fetch(`${API_BASE}/api/${type === 'news' ? `news?${i === 0 ? 'google=1&' : ''}` : `detail?type=${type}&`}codes=${c.join(',')}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || res.status);
    return json.data;
  }));
  if (results.length && results.every(r => r.status === 'rejected')) {
    favDetail[type] = cached ? { ...cached, error: true } : { key, error: true };  // 실패 시 이전 목록 유지
  } else {
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const data = type === 'news'
      ? mixGoogle(mergeSectorNews(items), favNewsArrange).slice(0, SECTOR_NEWS_MAX)
      : items.sort((a, b) => favItemTime(b).localeCompare(favItemTime(a))).slice(0, SECTOR_NEWS_MAX);
    favDetail[type] = { ts: Date.now(), key, data };
  }
  // 응답 도착 전에 창을 닫았거나 다른 탭으로 옮겼으면 그리지 않음
  if (currentStock !== FAV_ALL || currentModalTab !== type) return;
  panel.innerHTML = favDetailHtml(type);
}

function moreFavNews() {
  if (!favDetail.news?.data) return;
  favNewsShown += NEWS_PAGE;
  document.getElementById('newsTab').innerHTML = favDetailHtml('news');
}

// 종목 뉴스·리포트·공시와 같은 모양 + 어느 관심 종목 것인지 종목명 표시
function favDetailHtml(type) {
  const d = favDetail[type];
  if (!d || !d.data) return '<p class="empty-msg">데이터를 불러오지 못했습니다.</p>';
  const footer = `<div class="panel-footer">출처: ${{
    news: '<span class="news-src naver">N</span>네이버 증권 (관심 종목 뉴스)',
    research: '네이버 증권 리서치 (관심 종목 분석 리포트, 국내 종목)',
    disclosure: '네이버 증권 (관심 종목 공시, 국내 종목)',
  }[type]}</div>`;
  if (!d.data.length) return `<p class="empty-msg">최근 ${{ news: '뉴스가', research: '증권사 리포트가', disclosure: '공시가' }[type]} 없습니다.</p>` + footer;
  const tags = codes => codes.map(stockName).filter(Boolean).slice(0, 3).map(x => `<span class="news-stock">${escHtml(x)}</span>`).join('');

  if (type === 'news') {
    const updated = new Date(d.ts).toLocaleTimeString('ko-KR', { hour12: false });
    const more = d.data.length > favNewsShown
      ? `<button class="news-more" data-act="moreFavNews">더보기 (${favNewsShown} / ${d.data.length})</button>` : '';
    return `<div class="panel-status">업데이트 ${updated} · 1분마다 자동 갱신 · 최신 ${d.data.length}건</div>` +
      d.data.slice(0, favNewsShown).map(n => `
      <a class="feed-item" href="${safeUrl(n.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(n.title)}</div>
          ${n.summary ? `<div class="feed-summary">${escHtml(n.summary)}</div>` : ''}
          <div class="feed-meta">${tags(n.codes)}${escHtml(n.press || '')} · ${newsTime(n.datetime)}</div>
        </div>
        ${/^https:\/\//.test(n.thumb || '') ? `<img class="feed-thumb" src="${safeUrl(n.thumb)}" alt="" loading="lazy" data-err="remove">` : ''}
      </a>`).join('') + more + footer;
  }

  if (type === 'research') {
    return d.data.map(r => `
      <a class="feed-item" href="${safeUrl(r.url)}" target="_blank" rel="noopener"${reportAttrs(r)}>
        <div class="feed-main">
          <div class="feed-title">${escHtml(r.title)}</div>
          <div class="feed-summary">${escHtml(r.summary || '')}</div>
          <div class="feed-meta">${tags([r.code])}<span class="feed-tag">${escHtml(r.broker || '')}</span> ${escHtml(r.date || '')} · 조회 ${escHtml(String(r.views ?? 0))}</div>
        </div>
      </a>`).join('') + footer;
  }

  return d.data.map(x => `
      <a class="feed-item" href="${safeUrl(x.url)}" target="_blank" rel="noopener">
        <div class="feed-main">
          <div class="feed-title">${escHtml(x.title)}</div>
          <div class="feed-meta">${tags([x.code])}${escHtml((x.datetime || '').replace('T', ' ').slice(0, 16))} · ${escHtml(x.source || '')}</div>
        </div>
      </a>`).join('') + footer;
}

// ── 게시글 · 좋아요 · 팔로우 (서버 DB: /api/posts) ──────
const POST_MAX = 1000;     // 게시글 최대 글자 수
// 운영자 칼럼: 주식 시장 경제 게시판의 '주식 시황'·'주식 강의' 탭 — 관리자 모드에서만 쓰기, 누구나 읽기, 최대 2000자 (api/posts.js isColumnCode)
// 강의는 연재 순서(먼저 쓴 글부터), 시황은 최신 글부터 (latest)
const OP_BOARDS = {
  sihwang: { code: 'COLNEWS', name: '주식 시황', unit: '시황', empty: '아직 주식 시황이 없습니다.', latest: true, max: 3000 },
  column: { code: 'COLMKT', name: '주식 강의', unit: '강의', empty: '아직 주식 강의가 없습니다.', latest: false, max: 2000 },
};  // max: 본문 글자 수 (api/posts.js columnMax)
const OP_CODES = { COLNEWS: 'sihwang', COLMKT: 'column' };  // 게시판 코드 → 탭
const isColumnTab = () => Boolean(OP_BOARDS[currentModalTab]) && Boolean(currentStock?.isMarket);
const opBoard = () => OP_BOARDS[currentModalTab];
const boardCodeNow = () => isColumnTab() ? opBoard().code : currentStock.code;  // 지금 보고 있는 게시판 (토론 또는 칼럼)
const postMax = () => isColumnTab() ? opBoard().max : POST_MAX;
let columnOpenId = null;   // 운영자 칼럼: 목록(제목만)에서 연 글 id, null이면 목록
// 칼럼 본문 사진: 본문에 [사진:/img/{id}] 로 저장 → 화면에서 그림으로 (사진 주소 형식이 정확할 때만)
const COLUMN_IMG_RE = /\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/g;
const columnBodyHtml = text => escHtml(text).replace(COLUMN_IMG_RE, '<img class="col-img" src="$1" alt="본문 사진" loading="lazy">').replace(/\n*(<img class="col-img"[^>]*>)\n*/g, '$1');  // 사진 앞뒤 빈 줄은 없앰 (사진 자체 여백으로 띄움)
const stripColumnImgs = text => String(text || '').replace(COLUMN_IMG_RE, '📷').replace(/^\[(표|막대|선|봉)(?::[^\]\n]*)?\]\n[\s\S]*?\n\[\/\1\]$/gm, '📊');  // 표·그래프 블록 (api/_rich.js)
const COLUMN_PAGE_SIZE = 10;  // 칼럼 목록 한 페이지 글 수
// 강의 시리즈 이름 (api/_colorder.js COLUMN_SERIES, columnList 응답으로 받음): 연재 순서 10편씩 = 목록 한 페이지
let columnSeries = [];
const seriesOf = i => !opBoard()?.latest && i >= 0 && columnSeries[Math.floor(i / COLUMN_PAGE_SIZE)] ? { n: Math.floor(i / COLUMN_PAGE_SIZE) + 1, name: columnSeries[Math.floor(i / COLUMN_PAGE_SIZE)] } : null;
// 목록 페이지 맨 위 띠: [주식 초보 탈출 N편] 시리즈 이름 · 10편
const seriesBandHtml = (s, count) => s ? `<div class="col-series"><span class="col-series-no">주식 초보 탈출 ${s.n}편</span><span class="col-series-name">${escHtml(s.name)}</span><span class="col-series-count">강의 ${count}편</span></div>` : '';
let columnPage = 1;
const POST_PREVIEW = 120, POST_PREVIEW_LINES = 4;  // 이보다 길면 4줄로 접고 '더 보기' (실제로 4줄 안이면 버튼 숨김)
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

// AI 운영자 실적 글: 제목 + 실적 표 (증가 빨강·감소 파랑) + 출처
const aiChgClass = t => /^(\+|흑자)/.test(t) ? 'up' : /^(−|적자)/.test(t) ? 'down' : '';
// 표 칸: 글자 또는 { t: 글자, u: DART 원문 주소 } (공시 모음)
const aiCellHtml = c => c && typeof c === 'object' ? (/^https:\/\/dart\.fss\.or\.kr\//.test(c.u) ? `<a href="${escHtml(c.u)}" target="_blank" rel="noopener nofollow">${escHtml(c.t)}</a>` : escHtml(c.t)) : escHtml(c);
const aiTablesHtml = p => (p.tables || []).map(t => `<div class="ai-table-wrap"><div class="ai-table-title">${escHtml(t.title)} <span>단위: ${escHtml(t.unit)}</span></div>
  <table class="ai-table"><thead><tr>${t.cols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
  <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th>${aiCellHtml(c)}</th>` : `<td class="${i === r.length - 1 && t.cols.at(-1) === '증감' ? aiChgClass(c) : ''}">${aiCellHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
const aiSrcHtml = p => p.src ? `<div class="ai-src">📄 출처: <a href="${escHtml(p.src.url)}" target="_blank" rel="noopener nofollow">${escHtml(p.src.label)}</a> · DART 공시 숫자를 프로그램이 정리한 글이며 투자 권유가 아닙니다.</div>` : '';

// AI 글 접힌 상태의 핵심 한 줄 (예전 글은 summary가 없어 본문 첫 문장)
const aiSummary = p => p.summary || String(p.content || '').split(/(?<=다\.)\s/)[0];

// 게시글 본문: 처음엔 4줄까지만 (styles.css .post-body.clamp), 넘치면 '더 보기' 버튼
// AI 운영자 글은 제목 + 핵심 한 줄만 보이고 표·설명은 '더 보기'로 펼침 (일반 글과 같은 버튼)
function postBodyHtml(p) {
  if (p.ai && !p.blind) return `${p.headline ? `<div class="ai-headline">${escHtml(p.headline)}</div>` : ''}<div class="ai-summary">${escHtml(aiSummary(p))}</div>
      <button class="btn-more" data-act="toggleAi">더 보기</button>
      <div class="ai-detail hidden">${aiTablesHtml(p)}<div class="post-body">${escHtml(p.content)}</div>${aiSrcHtml(p)}
      <button class="btn-more" data-act="foldAi">접기</button></div>`;
  return postTextHtml(p);
}
function postTextHtml(p) {
  const text = String(p.content || '');
  const maybeLong = text.length > POST_PREVIEW || text.split('\n').length > POST_PREVIEW_LINES;
  return `<div class="post-body${maybeLong ? ' clamp' : ''}">${escHtml(text)}</div>${maybeLong ? '<button class="btn-more" data-act="toggleMore">더 보기</button>' : ''}`;
}

function toggleMore(btn) {
  const open = btn.previousElementSibling.classList.toggle('clamp') === false;
  btn.textContent = open ? '접기' : '더 보기';
}
function toggleAi(btn) {
  const open = btn.nextElementSibling.classList.toggle('hidden') === false;
  btn.textContent = open ? '접기' : '더 보기';
}
// 펼친 글 맨 아래 '접기': 접은 뒤 글 제목이 화면 밖이면 제목 위치로 올려 줌 (보던 자리를 잃지 않게)
function foldAi(btn) {
  const top = btn.closest('.ai-detail').previousElementSibling;
  toggleAi(top);
  const item = top.closest('.post-item') || top;
  if (item.getBoundingClientRect().top < 0) item.scrollIntoView({ block: 'start' });
}
// 4줄 안에 다 들어가는 글은 '더 보기' 버튼을 숨김 (화면에 그려진 뒤 실제 높이로 판단)
let clampCheck = 0;
function checkClamps() {
  cancelAnimationFrame(clampCheck);
  clampCheck = requestAnimationFrame(() => {
    for (const b of document.querySelectorAll('.post-body.clamp')) {
      if (!b.clientHeight || b.dataset.checked) continue;  // 안 보이는 곳(닫힌 창)은 나중에
      b.dataset.checked = '1';
      if (b.scrollHeight <= b.clientHeight + 2) { b.classList.remove('clamp'); b.nextElementSibling?.classList.contains('btn-more') && b.nextElementSibling.remove(); }
    }
  });
}
new MutationObserver(checkClamps).observe(document.body, { childList: true, subtree: true });

// 공감·비공감 버튼 (같은 걸 다시 누르면 취소, 한 브라우저에 하나만)
const likeBtnHtml = p => `<span class="vote-btns" data-id="${escHtml(p.id)}">
  <button class="btn-vote up ${p.liked ? 'on' : ''}" data-act="vote" data-dir="up">공감 <b>${p.likes || 0}</b></button>
  <button class="btn-vote down ${p.disliked ? 'on' : ''}" data-act="vote" data-dir="down">비공감 <b>${p.dislikes || 0}</b></button>
</span>`;
const memberBadgeHtml = p => p.ai ? '<span class="member-badge ai">🤖 자동</span>' : p.official ? '<span class="member-badge official">운영자</span>'
  : p.member ? '<span class="member-badge">회원</span>' : '<span class="member-badge guest">비회원</span>';

async function renderPosts(keep = false) {
  const s = currentStock;
  const keepOpen = keep ? columnOpenId : null, keepPage = keep ? columnPage : 1;
  if (!s) return;
  const el = document.getElementById('postList');
  postAction = null;
  columnOpenId = null;
  columnPage = 1;
  if (!keep) sihwangDraft = undefined;  // 시황 탭을 새로 열 때마다 초안을 다시 받음
  const column = isColumnTab(), code = boardCodeNow();
  document.getElementById('discussTab').dataset.board = code;
  el.innerHTML = '<p class="empty-msg">불러오는 중...</p>';
  try {
    const { posts, series } = column ? await api({}, { action: 'columnList', board: code }) : await api({ code });
    if (currentStock !== s || boardCodeNow() !== code) return;
    currentPosts = posts;
    if (series) columnSeries = series;
  } catch (e) {
    if (currentStock === s) el.innerHTML = `<p class="empty-msg">게시글을 불러오지 못했습니다. (${escHtml(e.message)})</p>`;
    return;
  }
  if (column && keep) { columnPage = keepPage; columnOpenId = currentPosts.some(p => p.id === keepOpen) ? keepOpen : null; }
  drawPosts();
  if (!column) countPostViews(s, currentPosts, code);  // 칼럼은 글을 열 때 셈
  if (column && pendingColumnId) {
    const id = pendingColumnId;
    pendingColumnId = null;
    if (currentPosts.some(p => p.id === id)) openColumn(id);
  }
}

// 토론 창에 보인 글 조회수 +1 (같은 브라우저·게시판 1시간에 1회)
async function countPostViews(s, posts, code = s.code) {
  if (!posts.length) return;
  try {
    const { views } = await api({}, { action: 'viewBoard', code, ids: posts.map(p => p.id) });
    if (currentStock !== s) return;
    currentPosts.forEach(p => { if (views[p.id] != null) p.views = views[p.id]; });
    document.querySelectorAll('#postList .post-views').forEach(el => {
      const v = views[el.dataset.id];
      if (v != null) el.innerHTML = `${EYE_ICON}${v.toLocaleString()}`;
    });
  } catch {}
}
// 눈 아이콘: 👁 이모지를 쓰면 갤럭시에서 뒤 숫자까지 이모지 글꼴(굵고 넓은 숫자)로 그려져 그림으로 대신함
const EYE_ICON = '<svg class="eye-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const viewsHtml = p => `<span class="post-views" data-id="${escHtml(p.id)}" title="조회수">${EYE_ICON}${(p.views || 0).toLocaleString()}</span>`;

function drawPosts() {
  const el = document.getElementById('postList');
  if (isColumnTab()) return drawColumn(el);
  if (!currentPosts.length) {
    el.innerHTML = '<p class="empty-msg">첫 번째 의견을 남겨보세요!</p>';
    return;
  }
  el.innerHTML = currentPosts.map(p => `
    <div class="post-item">
      <div class="post-header">
        <span class="post-nick">${escHtml(p.nick)}</span>${memberBadgeHtml(p)}
        <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        ${isMyPost(p) || p.blind || p.official ? '' : `<button class="btn-tool btn-report btn-report-head" data-id="${escHtml(p.id)}" data-act="postAction" data-mode="report">신고</button>`}
        ${likeBtnHtml(p)}
        ${p.member && !isMyPost(p) ? `<button class="btn-follow ${myFollowing.has(p.nick) ? 'following' : ''}" data-nick="${escHtml(p.nick)}" data-act="openAuthor">${myFollowing.has(p.nick) ? '팔로잉' : '팔로우'}</button>` : ''}
      </div>
      ${postAction?.id === p.id && postAction.mode === 'edit' ? editFormHtml(p) : p.blind ? `<div class="post-body post-blind">🚫 ${escHtml(p.content)}</div>` : postBodyHtml(p)}
      <div class="post-tools">
        ${p.editedTs ? `<span class="post-edited">수정됨 · ${timeAgo(p.editedTs)}</span>` : ''}
        ${canManage(p) ? `<button class="btn-tool" data-id="${escHtml(p.id)}" data-act="postAction" data-mode="edit">수정</button>
        <button class="btn-tool" data-id="${escHtml(p.id)}" data-act="postAction" data-mode="delete">삭제</button>` : ''}
        ${adminDeleteBtnHtml(p)}
      </div>
      ${postAction?.id === p.id && postAction.mode === 'delete' ? deleteFormHtml(p) : ''}
      ${postAction?.id === p.id && postAction.mode === 'report' ? reportFormHtml(p) : ''}
    </div>
  `).join('');
}

// ── 운영자 칼럼: 목록은 제목만, 누르면 본문 ──
function drawColumn(el) {
  document.querySelector('.write-box').classList.toggle('hidden', !isAdmin() || Boolean(columnOpenId));  // 글을 보는 중엔 글쓰기 숨김
  const p = columnOpenId && currentPosts.find(x => x.id === columnOpenId);
  if (!p) {
    columnOpenId = null;
    const pages = Math.max(1, Math.ceil(currentPosts.length / COLUMN_PAGE_SIZE));
    columnPage = Math.min(Math.max(1, columnPage), pages);
    const shown = currentPosts.slice((columnPage - 1) * COLUMN_PAGE_SIZE, columnPage * COLUMN_PAGE_SIZE);
    const draft = isAdmin() && currentModalTab === 'sihwang' ? '<div id="draftCard"></div>' : '';  // 관리자: 루틴이 쓴 오늘 초안
    if (draft) setTimeout(drawSihwangDraft);
    el.innerHTML = draft + (currentPosts.length ? `${seriesBandHtml(seriesOf((columnPage - 1) * COLUMN_PAGE_SIZE), shown.length)}<div class="col-list">${shown.map(x => `
      <button class="col-row" data-id="${escHtml(x.id)}" data-act="openColumn">
        <span class="col-title">${escHtml(x.title || stripColumnImgs(x.content).slice(0, 40))}</span>
        <span class="col-meta">${colDate(x.ts)} · ${EYE_ICON}${(x.views || 0).toLocaleString()}</span>
      </button>`).join('')}</div>${pagerHtml(columnPage, pages, 'goColumnPage')}` : `<p class="empty-msg">${opBoard().empty}</p>`);
    return;
  }
  const editing = postAction?.id === p.id && postAction.mode === 'edit';
  el.innerHTML = `
    <div class="col-article${isAdmin() ? '' : ' no-copy'}">
      <button class="btn-tool col-back" data-act="closeColumn">← 목록</button>
      ${editing ? '' : `${(s => s ? `<p class="col-series-tag">주식 초보 탈출 ${s.n}편 · ${escHtml(s.name)}</p>` : '')(seriesOf(currentPosts.indexOf(p)))}<h3 class="col-article-title">${escHtml(p.title || '')}</h3>`}
      <div class="post-header">
        <span class="post-nick">${escHtml(p.nick)}</span>${memberBadgeHtml(p)}
        <span class="post-time">${colDate(p.ts)}</span>${viewsHtml(p)}
        ${likeBtnHtml(p)}
      </div>
      ${editing ? editFormHtml(p) : p.content == null ? '<p class="empty-msg">불러오는 중...</p>' : p.html != null ? `<div class="post-body col-body rich">${p.html}</div>` : `<div class="post-body col-body">${columnBodyHtml(p.content)}</div>`}
      <div class="post-tools">
        ${p.editedTs ? `<span class="post-edited">수정됨 · ${timeAgo(p.editedTs)}</span>` : ''}
        ${canManage(p) && p.content != null ? `<button class="btn-tool" data-id="${escHtml(p.id)}" data-act="postAction" data-mode="edit">수정</button>
        <button class="btn-tool" data-id="${escHtml(p.id)}" data-act="postAction" data-mode="delete">삭제</button>` : ''}
      </div>
      ${postAction?.id === p.id && postAction.mode === 'delete' ? deleteFormHtml(p) : ''}
      ${editing ? '' : columnNavHtml(p)}
    </div>`;
}
// 글 아래: 이전 글(먼저 쓴 글) · 목록으로 · 다음 글(나중에 쓴 글) — 강의 목록은 먼저 쓴 글부터, 시황은 최신 글부터라 반대
function columnNavHtml(p) {
  const i = currentPosts.findIndex(x => x.id === p.id), d = opBoard().latest ? -1 : 1;
  const prev = currentPosts[i - d], next = currentPosts[i + d];
  const link = (x, label, cls) => x
    ? `<button class="col-nav-btn ${cls}" data-id="${escHtml(x.id)}" data-act="openColumn"><span class="col-nav-label">${label}</span><span class="col-nav-title">${escHtml(x.title || '')}</span></button>`
    : `<span class="col-nav-btn ${cls} disabled"><span class="col-nav-label">${label}</span><span class="col-nav-title">${cls === 'prev' ? '이전 글이 없습니다' : '다음 글이 없습니다'}</span></span>`;
  return `<nav class="col-nav">
      ${link(prev, '← 이전 글', 'prev')}
      <button class="col-nav-list" data-act="closeColumn">목록으로</button>
      ${link(next, '다음 글 →', 'next')}
    </nav>`;
}
const colDate = ts => { const d = new Date(ts); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
// 주소창에 지금 보는 칼럼 반영 (공유·새로고침하면 같은 글이 열림), 창을 닫으면 원래 주소로
const syncColumnUrl = id => { try { history.replaceState(history.state, '', id ? `/?${currentModalTab === 'sihwang' ? 'sihwang' : 'column'}=${encodeURIComponent(id)}` : location.pathname); } catch {} };
function openColumn(id) {
  columnOpenId = id;
  syncColumnUrl(id);
  postAction = null;
  drawPosts();
  scrollColumnTop();  // 글 아래 이전·다음 버튼으로 넘어와도 새 글 맨 위부터
  if (currentStock) countPostViews(currentStock, currentPosts.filter(p => p.id === id), boardCodeNow());
  loadColumnPost(id);
}
// 칼럼 글을 열면 그 글의 본문·공감·비공감·내가 누른 것을 불러와 채움 (목록은 제목·날짜·조회수만 받음)
async function loadColumnPost(id) {
  const p = currentPosts.find(x => x.id === id);
  if (!p || (p.content != null && p.likes != null)) return;  // 이미 받았으면 생략 (방금 쓴 글 등)
  try {
    const { post } = await api({}, { action: 'columnPost', id });
    const cur = currentPosts.find(x => x.id === id);
    if (!cur) return;
    Object.assign(cur, post, { views: Math.max(cur.views || 0, post.views || 0) });
    if (columnOpenId === id && !postAction) drawPosts();
  } catch (e) {
    if (columnOpenId === id) document.querySelector('#postList .col-article .empty-msg')?.replaceChildren(`글을 불러오지 못했습니다. (${e.message})`);
  }
}
let pendingColumnId = null;  // 칼럼 목록을 불러온 뒤 열 글 (바로가기·작성자 목록에서)
function openColumnLink(id, tab = 'column') {
  pendingColumnId = id || null;
  openModal('SECMKT', OP_BOARDS[tab] ? tab : 'column');
}
// ── 주식 시황 초안 (관리자): 예약 실행 루틴이 써 두는 초안 — 국내 장 마감(평일 16시)·미국 장 마감(화~토 아침 8시) (functions/api/sihwang.js) → 보고 고쳐서 등록 ──
const DRAFT_KINDS = [['kr', '국내 장 마감', '평일 16:00쯤'], ['us', '미국 장 마감', '화~토 08:00쯤']];
let sihwangDraft;        // undefined: 아직 안 받음, { kr, us }: 각 { title, content, ts, html } 또는 null
let draftLoaded = false;  // 글쓰기 칸에 불러온 초안 ('kr' | 'us', 등록하면 서버가 그 초안을 지움)
async function drawSihwangDraft() {
  const box = document.getElementById('draftCard');
  if (!box || !isAdmin()) return;
  if (sihwangDraft === undefined) {
    box.innerHTML = '<div class="draft-card"><span class="draft-meta">시황 초안 확인 중...</span></div>';
    try { sihwangDraft = (await api({}, { action: 'sihwangDraft', adminKey })).drafts; } catch (e) { box.innerHTML = `<div class="draft-card"><span class="draft-meta">초안을 불러오지 못했습니다. (${escHtml(e.message)})</span></div>`; return; }
  }
  const el = document.getElementById('draftCard');
  if (!el) return;
  el.innerHTML = DRAFT_KINDS.map(([kind, label, when]) => {
    const d = sihwangDraft?.[kind];
    if (!d) return `<div class="draft-card empty"><span class="draft-meta">📝 ${label} 초안 없음 — ${when} 자동으로 만들어집니다</span></div>`;
    const at = new Date(d.ts);
    return `<div class="draft-card">
      <span class="draft-meta">📝 ${label} 초안 · ${colDate(d.ts).slice(5)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')} · ${d.content.length.toLocaleString()}자 · 방문자에게는 안 보임</span>
      <strong class="draft-title">${escHtml(d.title)}</strong>
      <div class="draft-btns"><button class="btn-tool" data-act="draftPreview">미리보기</button><button class="btn-submit" data-act="draftLoad" data-kind="${kind}">글쓰기 칸에 불러오기</button><button class="btn-tool" data-act="draftDiscard" data-kind="${kind}">버리기</button></div>
      <div class="draft-preview hidden"><div class="post-body col-body rich">${d.html}</div></div>
    </div>`;
  }).join('');
}
function loadDraftIntoWriteBox(kind) {
  const d = sihwangDraft?.[kind];
  if (!d) return;
  const ta = document.getElementById('postContent');
  if (ta.value.trim() && !confirm('글쓰기 칸에 쓰던 내용을 초안으로 바꿀까요?')) return;
  document.getElementById('postTitle').value = d.title;
  ta.value = d.content;
  draftLoaded = kind;
  updateCharCount();
  document.querySelector('.write-box').scrollIntoView({ block: 'start', behavior: 'smooth' });
  ta.focus();
}
async function discardSihwangDraft(kind) {
  if (!confirm('이 시황 초안을 버릴까요? 되돌릴 수 없습니다.')) return;
  try { sihwangDraft = (await api({}, { action: 'sihwangDraft', adminKey, discard: kind })).drafts; if (draftLoaded === kind) draftLoaded = false; drawSihwangDraft(); }
  catch (e) { alert(`버리지 못했습니다: ${e.message}`); }
}
// 홈 지수 칸 아래 한 줄: 주식 시황 최신 글 (없으면 숨김)
async function loadSihwangLatest() {
  const el = document.getElementById('sihwangLatest');
  if (!el) return;
  try {
    const { post } = await api({}, { action: 'sihwangLatest' });
    el.classList.toggle('hidden', !post);
    if (!post) return el.replaceChildren();
    el.href = `/sihwang/${encodeURIComponent(post.id)}`;
    el.dataset.id = post.id;
    el.innerHTML = `<span class="sl-tag">주식 시황</span><span class="sl-date">${colDate(post.ts).slice(5)}</span><span class="sl-title">${escHtml(post.title)}</span><span class="sl-go" aria-hidden="true">›</span>`;
  } catch {}
}
// 페이지 표시: ‹ 1 2 3 … › (현재 페이지 앞뒤 2개씩, 처음·끝 페이지는 항상)
function pagerHtml(page, pages, fn) {
  if (pages <= 1) return '';
  const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  let html = '', prev = 0;
  for (const n of nums) {
    if (n - prev > 1) html += '<span class="pager-gap">…</span>';
    html += `<button class="pager-btn${n === page ? ' on' : ''}" data-act="${fn}" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`;
    prev = n;
  }
  return `<nav class="pager" aria-label="페이지"><button class="pager-btn" data-act="${fn}" data-page="${page - 1}"${page === 1 ? ' disabled' : ''} aria-label="이전 페이지">‹</button>${html}<button class="pager-btn" data-act="${fn}" data-page="${page + 1}"${page === pages ? ' disabled' : ''} aria-label="다음 페이지">›</button></nav>`;
}
function goColumnPage(n) {
  columnPage = n;
  drawPosts();
  scrollColumnTop();
}
// 칼럼 글·목록을 바꿀 때 맨 위로: 스크롤되는 곳은 글 목록 칸(#postList) 안이라 그 안의 위치를 0으로 (scrollIntoView만으로는 안쪽 스크롤이 남음)
function scrollColumnTop() {
  for (const id of ['postList', 'discussTab']) document.getElementById(id).scrollTop = 0;
  document.getElementById('discussTab').scrollIntoView({ block: 'start' });
}
// ── 칼럼 사진 넣기 (관리자 모드): 사진 고르기 → 웹용 크기로 줄여 업로드 → 본문 커서 위치에 [사진:주소] ──
const COLUMN_IMG_MAX_SIDE = 1600, COLUMN_IMG_MAX_BYTES = 5 * 1024 * 1024;
let columnImgTarget = 'postContent';
function pickColumnImage(targetId) {
  if (!isAdmin()) return alert('관리자 모드에서만 사진을 넣을 수 있습니다.');
  columnImgTarget = targetId;
  const input = document.getElementById('colImgFile');
  input.value = '';
  input.onchange = () => { if (input.files[0]) uploadColumnImage(input.files[0]); };
  input.click();
}
// GIF(움직이는 그림)는 그대로, 나머지는 긴 변 1600px 이하 WEBP(안 되는 브라우저는 JPG)로 줄임
async function shrinkImage(file) {
  if (file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, COLUMN_IMG_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const toBlob = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  let out = await toBlob('image/webp', 0.85);
  if (!out || out.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    out = await toBlob('image/jpeg', 0.85);
  }
  bmp.close?.();
  return out && out.size < file.size ? out : file;
}
async function uploadColumnImage(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return alert('JPG·PNG·WEBP·GIF 사진만 넣을 수 있습니다.');
  const btns = document.querySelectorAll('.btn-col-img');
  btns.forEach(b => { b.disabled = true; b.textContent = '사진 올리는 중...'; });
  try {
    const img = await shrinkImage(file);
    if (img.size > COLUMN_IMG_MAX_BYTES) throw new Error('사진은 한 장에 5MB까지 넣을 수 있습니다');
    const res = await fetch(`${API_BASE}/api/image`, {
      method: 'POST', headers: { 'Content-Type': img.type || file.type, 'X-Admin-Key': adminKey || '' }, body: img,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
    const ta = document.getElementById(columnImgTarget);
    if (!ta) return;
    const tag = `[사진:${json.url}]`;
    const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
    const insert = (before && !before.endsWith('\n') ? '\n' : '') + tag + '\n';
    ta.value = before + insert + after;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = before.length + insert.length;
    if (columnImgTarget === 'postContent') updateCharCount();
  } catch (e) {
    if (/관리자 (로그인|비밀번호)/.test(e.message)) adminLogout();  // 관리자 로그인 만료 → 로그아웃 후 다시 로그인 안내
    alert(`사진을 넣지 못했습니다: ${e.message}`);
  } finally {
    btns.forEach(b => { b.disabled = false; b.textContent = '🖼 사진 넣기'; });
  }
}

function closeColumn() {
  syncColumnUrl(null);
  const i = currentPosts.findIndex(x => x.id === columnOpenId);
  if (i >= 0) columnPage = Math.floor(i / COLUMN_PAGE_SIZE) + 1;  // 보던 글이 있는 페이지로 돌아감
  columnOpenId = null;
  postAction = null;
  drawPosts();
  scrollColumnTop();  // 칼럼 전체 목록 처음부터
}

// ── 게시글 수정·삭제 (비회원 글: 작성 시 입력한 비밀번호 / 회원 글: 로그인한 본인) ────
const isMyPost = p => Boolean(p.member && member && p.nick === member.nick);
// 운영자 글은 관리자 모드에서만 수정·삭제 (비밀번호 입력 없음)
const canManage = p => p.official ? isAdmin() : !p.member || isMyPost(p);
const noPassword = p => p.member || p.official;
function editFormHtml(p) {
  return `
      <div class="post-form">
        ${OP_CODES[p.code] ? `<input id="editTitle" type="text" maxlength="100" placeholder="${OP_BOARDS[OP_CODES[p.code]].unit} 제목" value="${escHtml(p.title || '')}">` : ''}
        <textarea id="editContent" maxlength="${postMax()}" rows="4">${escHtml(p.content)}</textarea>
        <div class="post-form-row">
          ${noPassword(p) ? '' : `<input id="actionPassword" type="password" placeholder="비밀번호" maxlength="${PW_MAX}" autocomplete="off">`}
          ${OP_CODES[p.code] && isAdmin() ? `<button type="button" class="btn-tool btn-col-img" data-act="pickImage" data-target="editContent">🖼 사진 넣기</button>` : ''}
          <button class="btn-submit" data-id="${escHtml(p.id)}" data-act="savePostEdit">저장</button>
          <button class="btn-cancel" data-act="closePostAction">취소</button>
        </div>
      </div>`;
}

function deleteFormHtml(p) {
  return `
      <div class="post-form post-form-row">
        <span class="post-form-label">${noPassword(p) ? '이 글을 삭제할까요?' : '삭제하려면 비밀번호를 입력하세요'}</span>
        ${noPassword(p) ? '' : `<input id="actionPassword" type="password" placeholder="비밀번호" maxlength="${PW_MAX}" autocomplete="off">`}
        <button class="btn-danger" data-id="${escHtml(p.id)}" data-act="deletePost">삭제</button>
        <button class="btn-cancel" data-act="closePostAction">취소</button>
      </div>`;
}

// ── 신고 (서로 다른 이용자 5건 누적 시 자동 블라인드) ──
const REPORT_REASONS = ['욕설·비방', '광고·스팸', '허위사실·시세조종', '음란·불법', '기타'];

function reportFormHtml(p) {
  return `
      <div class="post-form post-form-row">
        <span class="post-form-label">신고 사유</span>
        <select id="reportReason">${REPORT_REASONS.map(r => `<option>${r}</option>`).join('')}</select>
        <button class="btn-danger" data-id="${escHtml(p.id)}" data-act="reportPost">신고</button>
        <button class="btn-cancel" data-act="closePostAction">취소</button>
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
  const p = currentPosts.find(x => x.id === id);
  if (p && noPassword(p)) return '';
  const pw = document.getElementById('actionPassword').value;
  if (!pw) { alert('비밀번호를 입력해주세요.'); return null; }
  return pw;
}

async function savePostEdit(id) {
  const content = document.getElementById('editContent').value.trim();
  const titleEl = document.getElementById('editTitle');
  const title = titleEl ? titleEl.value.trim() : undefined;
  if (titleEl && !title) return alert('제목을 입력해주세요.');
  if (!content) return alert('내용을 입력해주세요.');
  const password = actionPassword(id);
  if (password === null) return;
  try {
    const { post } = await api({}, { action: 'edit', id, password, content, ...(title !== undefined ? { title } : {}), ...(isAdmin() ? { adminKey } : {}) });
    currentPosts = currentPosts.map(p => p.id === id ? { ...post, views: p.views } : p);
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
    const r = await api({}, { action: 'delete', id, password, ...(isAdmin() ? { adminKey } : {}) });
    currentPosts = currentPosts.filter(p => p.id !== id);
    postCounts[r.code] = Math.max(0, (postCounts[r.code] || 1) - 1);
    postAction = null;
    if (columnOpenId === id) columnOpenId = null;
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
  const title = document.getElementById('postTitle').value.trim();
  if (isColumnTab() && !title) return alert('제목을 입력해주세요.');
  if (member || isAdmin()) {
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
  const code = boardCodeNow();
  try {
    const { post } = await api({}, isAdmin()
      ? { action: 'create', code, ...(isColumnTab() ? { title } : {}), content, asOperator: true, adminKey, ...(code === 'COLNEWS' && draftLoaded ? { fromDraft: draftLoaded } : {}) }
      : member
      ? { action: 'create', code, content }
      : { action: 'create', code, nick, password, content });
    if (code === 'COLNEWS' && draftLoaded) { if (sihwangDraft) sihwangDraft[draftLoaded] = null; draftLoaded = false; }  // 초안으로 올렸으면 서버가 그 초안을 지움
    if (currentStock && boardCodeNow() === code) {
      if (isColumnTab() && !opBoard().latest) { currentPosts.push(post); columnPage = Math.ceil(currentPosts.length / COLUMN_PAGE_SIZE); }  // 강의는 먼저 쓴 글부터라 새 글은 마지막 페이지
      else { currentPosts.unshift(post); columnPage = 1; }
    }
    postCounts[code] = (postCounts[code] || 0) + 1;
    document.getElementById('postContent').value = '';
    document.getElementById('postTitle').value = '';
    document.getElementById('postPassword').value = '';
    document.getElementById('charCount').textContent = `0/${postMax()}`;
    drawPosts();
    renderStocks(filteredList());
  } catch (e) {
    if (/로그인이 만료/.test(e.message)) setMember(null);
    alert(`등록하지 못했습니다: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function vote(id, type) {
  try {
    const r = await api({}, { action: 'vote', id, type });
    // 토론 목록과 작성자 화면 양쪽 버튼 갱신
    currentPosts.forEach(p => { if (p.id === id) Object.assign(p, { liked: r.liked, disliked: r.disliked, likes: r.likes, dislikes: r.dislikes }); });
    document.querySelectorAll(`.vote-btns[data-id="${id}"]`).forEach(box => { box.outerHTML = likeBtnHtml({ id, ...r }); });
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
        ${showNick ? `<button class="post-nick author-link" data-nick="${escHtml(p.nick)}" data-act="openAuthor">${escHtml(p.nick)}</button>` : ''}
        ${OP_CODES[p.code]
          ? `<button class="author-stock" data-id="${escHtml(p.id)}" data-tab="${OP_CODES[p.code]}" data-act="columnLink">${OP_BOARDS[OP_CODES[p.code]].name}</button>`
          : `<button class="author-stock" data-code="${escHtml(p.code)}" data-act="openStock">${escHtml(s ? s.name : p.code)}</button>`}
        <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        ${likeBtnHtml(p)}
        ${adminDeleteBtnHtml(p)}
      </div>
      ${OP_CODES[p.code] && p.title ? `<div class="feed-col-title">${escHtml(p.title)}</div>` : ''}${postBodyHtml(OP_CODES[p.code] ? { ...p, content: stripColumnImgs(p.content) } : p)}
    </div>`;
}

let overlaySeq = 0;
function overlayLoading(title) {
  showAuthorOverlay(title, '불러오는 중...', '', '');
  return ++overlaySeq;
}
const overlayStale = seq => seq !== overlaySeq || !isOpen('authorOverlay');
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
  const seq = overlayLoading(nick);
  try {
    const r = await api({}, { action: 'author', nick });
    if (overlayStale(seq)) return;
    if (member) r.following ? myFollowing.add(nick) : myFollowing.delete(nick);
    const mine = member && member.nick === nick;
    const action = !r.member || mine ? ''
      : member ? `<button class="btn-follow-big ${r.following ? 'following' : ''}" data-nick="${escHtml(nick)}" data-act="toggleFollow">${r.following ? '팔로잉 ✓' : '+ 팔로우'}</button>`
      : `<button class="btn-follow-big" data-act="loginFromAuthor">로그인 후 팔로우</button>`;
    showAuthorOverlay(
      nick,
      r.member ? `회원 · 작성글 ${r.posts.length}개 · 팔로워 ${r.followers}명` : `${r.posts.some(p => p.official) ? '운영자' : r.withdrawn ? '탈퇴한 회원' : '비회원'} · 작성글 ${r.posts.length}개`,
      action,
      r.posts.length ? r.posts.map(p => feedPostHtml(p, false)).join('') : '<p class="empty-msg">작성한 글이 없습니다.</p>'
    );
  } catch (e) {
    if (overlayStale(seq)) return;
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
    return showAuthorOverlay('팔로잉', '회원 전용', '', '<p class="empty-msg">팔로우는 회원만 사용할 수 있습니다.<br><button class="link-btn" data-act="loginFromAuthor">로그인</button> 또는 <button class="link-btn" data-act="signupFromAuthor">회원가입</button> 후 다른 회원의 글에서 [팔로우]를 눌러보세요.</p>');
  }
  const seq = overlayLoading('팔로잉');
  try {
    const r = await api({}, { action: 'feed' });
    if (overlayStale(seq)) return;
    myFollowing = new Set(r.following);
    const chips = r.following.length
      ? `<div class="follow-chips">${r.following.map(n => `<button class="follow-chip" data-nick="${escHtml(n)}" data-act="openAuthor">${escHtml(n)}</button>`).join('')}</div>`
      : '';
    const body = r.following.length
      ? chips + (r.posts.length ? r.posts.map(p => feedPostHtml(p, true)).join('') : '<p class="empty-msg">팔로우한 회원의 글이 아직 없습니다.</p>')
      : '<p class="empty-msg">아직 팔로우한 회원이 없습니다.<br>회원 글 옆의 [팔로우] 버튼으로 팔로우해 보세요.</p>';
    showAuthorOverlay('팔로잉', `${r.following.length}명 팔로우 중`, '', body);
  } catch (e) {
    if (overlayStale(seq)) return;
    showAuthorOverlay('팔로잉', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

// ── 관리자: 로그인 후 모든 글에 [관리자 삭제] 버튼 표시 ──
// 관리자 비밀번호는 서버 환경변수(ADMIN_PASSWORD)로 확인, 브라우저 탭을 닫으면 로그아웃
// 관리자 세션 토큰(adm_…)만 보관. 예전 방식으로 저장된 비밀번호는 지움 (다시 로그인)
let adminKey = (() => { try { const k = sessionStorage.getItem('adminKey'); if (k && !/^adm_[0-9a-f]{48}$/.test(k)) { sessionStorage.removeItem('adminKey'); return null; } return k; } catch { return null; } })();
const isAdmin = () => Boolean(adminKey);

const adminDeleteBtnHtml = p => isAdmin()
  ? `<button class="btn-admin-del" data-id="${escHtml(p.id)}" data-act="adminDelete">관리자 삭제</button>`
  : '';

// 관리자 로그인 창·관리 버튼·모드 표시는 HTML에 두지 않고 필요할 때만 만듦 (일반 방문자·검색 로봇에게 관리 화면 문구가 보이지 않게)
function toggleAdminForm() {
  if (isAdmin()) return adminLogout();
  const area = document.getElementById('adminArea');
  if (document.getElementById('adminForm')) { area.innerHTML = ''; return; }
  area.innerHTML = `<div class="admin-form" id="adminForm">
      <input type="password" id="adminPassword" name="admin-key" placeholder="관리자 비밀번호" autocomplete="new-password" data-lpignore="true" data-1p-ignore
             data-enter="adminLogin" />
      <button class="btn-submit" data-act="adminLogin">확인</button>
    </div>`;
  document.getElementById('adminPassword').focus();
}

function renderAdminArea() {
  document.getElementById('adminArea').innerHTML = isAdmin()
    ? '<p class="admin-tools"><button class="btn-tool" data-act="openReports">🚨 신고된 글</button> <button class="btn-tool" data-act="openContacts">✉️ 문의 내역</button> <button class="btn-tool" data-act="openStats">📊 화면 정보</button></p>'
    : '';
  document.getElementById('adminBadge')?.remove();
  if (isAdmin()) document.querySelector('footer').insertAdjacentHTML('beforeend',
    '<div class="admin-badge" id="adminBadge">관리자 모드 · <button data-act="adminLogout">로그아웃</button></div>');
}

async function adminLogin() {
  const input = document.getElementById('adminPassword');
  const key = input.value;
  if (!key) return;
  try {
    const { adminToken } = await api({}, { action: 'adminCheck', adminKey: key });
    adminKey = adminToken;
    try { sessionStorage.setItem('adminKey', adminToken); } catch {}
    input.value = '';
    document.getElementById('adminForm').classList.add('hidden');
    refreshAdminUi();
  } catch (e) {
    alert(e.message);
  }
}

function adminLogout() {
  if (adminKey) api({}, { action: 'adminLogout', adminKey }).catch(() => {});  // 서버의 관리자 세션도 폐기
  adminKey = null;
  try { sessionStorage.removeItem('adminKey'); } catch {}
  refreshAdminUi();
}

function refreshAdminUi() {
  document.body.classList.toggle('admin-mode', isAdmin());
  document.getElementById('adminToggle').textContent = isAdmin() ? '관리자 로그아웃' : '관리자';
  renderAdminArea();
  renderWriteBox();
  if (currentStock) isColumnTab() ? renderPosts(true) : drawPosts();
}

// 글쓰기 상자: 관리자 모드는 '운영자'로, 회원은 닉네임·비밀번호 입력 없이, 비회원은 닉네임·비밀번호 입력
function renderWriteBox() {
  const column = isColumnTab();
  document.querySelector('.write-box').classList.toggle('hidden', column && (!isAdmin() || Boolean(columnOpenId)));  // 칼럼은 관리자 모드에서만 쓰기
  const ta = document.getElementById('postContent');
  ta.maxLength = postMax();
  ta.placeholder = column ? `${opBoard().unit} 본문을 작성하세요 (최대 ${opBoard().max.toLocaleString()}자)` : '의견을 남겨보세요...';
  ta.rows = column ? 8 : 3;
  document.getElementById('postTitle').classList.toggle('hidden', !column);
  if (column) document.getElementById('postTitle').placeholder = `${opBoard().unit} 제목 (최대 100자)`;
  document.getElementById('btnColImg').classList.toggle('hidden', !(column && isAdmin()));
  updateCharCount();
  const asMember = Boolean(member) || isAdmin();
  document.getElementById('writeGuest').classList.toggle('hidden', asMember);
  const wm = document.getElementById('writeMember');
  wm.classList.toggle('hidden', !asMember);
  wm.innerHTML = isAdmin() ? '<b>운영자</b>로 작성 (관리자 모드)'
    : member ? `<b>${escHtml(member.nick)}</b> 님으로 작성 (회원)` : '';
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
  const seq = overlayLoading('🚨 신고된 글');
  try {
    const { posts } = await api({}, { action: 'adminReports', adminKey });
    if (overlayStale(seq)) return;
    showAuthorOverlay('🚨 신고된 글', `${posts.length}건 · 신고 ${5}건 이상이면 자동 블라인드`, '', posts.length ? posts.map(p => `
      <div class="post-item">
        <div class="post-header">
          <button class="author-stock" data-code="${escHtml(p.code)}" data-act="openStock">${escHtml(findStock(p.code)?.name || p.code)}</button>
          <span class="post-nick">${escHtml(p.nick)}</span>${memberBadgeHtml(p)}
          <span class="report-count">신고 ${p.reports}건${p.blind ? ' · 블라인드' : ''}</span>
          <span class="post-time">${timeAgo(p.ts)}</span>${viewsHtml(p)}
        </div>
        <div class="post-body">${escHtml(p.content)}</div>
        <div class="post-tools">
          <span class="post-edited">${Object.entries(p.reasons || {}).map(([k, v]) => `${escHtml(k)} ${v}`).join(' · ')}</span>
          <button class="btn-tool" data-id="${escHtml(p.id)}" data-act="adminUnblind">문제없음(신고 초기화)</button>
          <button class="btn-admin-del" data-id="${escHtml(p.id)}" data-act="adminDeleteReported">관리자 삭제</button>
        </div>
      </div>`).join('') : '<p class="empty-msg">신고된 글이 없습니다.</p>');
  } catch (e) {
    if (overlayStale(seq)) return;
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
  const seq = overlayLoading('✉️ 문의 내역');
  try {
    const { contacts } = await api({}, { action: 'adminContacts', adminKey });
    if (overlayStale(seq)) return;
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
    if (overlayStale(seq)) return;
    showAuthorOverlay('✉️ 문의 내역', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

// ── 관리자: 화면 정보 (사이트 통계) ──
const tile = (label, value, sub = '') => `<div class="stat-tile"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
const fmtN = n => Number(n || 0).toLocaleString();
const fmtDay = d => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
async function openStats() {
  const seq = overlayLoading('📊 화면 정보');
  try {
    const r = await api({}, { action: 'adminStats', adminKey });
    if (overlayStale(seq)) return;
    const since = fmtDay(r.visits.visitorsSince);
    const yday = r.days[1] || {};
    const pvSince = r.posts.viewsSince || '20261015';  // 날짜별 글 조회수 집계 시작일
    const maxViews = Math.max(1, ...r.days.map(d => d.postViews || 0));
    const body = `<div class="stat-wrap">
      <div class="stat-grid">
        ${tile('오늘 방문', fmtN(r.visits.today), `어제 ${fmtN(yday.views)}`)}
        ${tile('누적 방문', fmtN(r.visits.total))}
        ${tile('오늘 신규 회원', fmtN(r.members.today), `어제 ${fmtN(yday.members)}`)}
        ${tile('전체 회원', fmtN(r.members.total))}
        ${tile('오늘 신규 게시글', fmtN(r.posts.today), `어제 ${fmtN(yday.posts)}`)}
        ${tile('누적 게시글', fmtN(r.posts.total))}
      </div>
      <div class="stat-grid small">
        ${tile('오늘 순방문자', fmtN(r.visits.todayVisitors), `${since}부터 집계`)}
        ${tile('누적 순방문자', fmtN(r.visits.totalVisitors), `${since}부터 집계`)}
        ${tile('오늘 조회수', fmtN(r.posts.viewsToday), `어제 ${yday.day < pvSince ? '-' : fmtN(yday.postViews)}`)}
        ${tile('누적 조회수', fmtN(r.posts.views))}
        ${tile('신고된 글', fmtN(r.pending.reported))}
        ${tile('문의', fmtN(r.pending.contacts))}
      </div>
      <h3 class="stat-h">최근 ${r.days.length}일</h3>
      <table class="stat-table">
        <thead><tr><th>날짜</th><th>순방문자</th><th>조회수</th><th>신규 회원</th><th>게시글<br><small>(댓글 포함)</small></th></tr></thead>
        <tbody>${r.days.map(d => `<tr>
          <td>${fmtDay(d.day)}</td>
          <td>${d.day < r.visits.visitorsSince ? '-' : fmtN(d.visitors)}</td>
          <td class="stat-bar-cell">${d.day < pvSince ? '-' : `<span class="stat-bar" style="width:${Math.round((d.postViews || 0) / maxViews * 100)}%"></span><span>${fmtN(d.postViews)}</span>`}</td>
          <td>${fmtN(d.members)}</td><td>${fmtN(d.posts)}</td></tr>`).join('')}</tbody>
      </table>
      <h3 class="stat-h">게시판별 게시글 TOP ${r.boards.length}</h3>
      ${r.boards.length ? `<table class="stat-table"><tbody>${r.boards.map((b, i) => `<tr><td>${i + 1}</td><td class="stat-left"><button class="author-stock" ${OP_CODES[b.code] ? `data-act="columnLink" data-tab="${OP_CODES[b.code]}"` : `data-act="openStock" data-code="${escHtml(b.code)}"`}>${OP_CODES[b.code] ? OP_BOARDS[OP_CODES[b.code]].name : escHtml(findStock(b.code)?.name || b.code)}</button></td><td>${fmtN(b.count)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty-msg">게시글이 없습니다.</p>'}
      <h3 class="stat-h">강의 사진 저장소</h3>
      <div id="imgStats" class="stat-img"><p class="stat-note">불러오는 중...</p></div>
      <p class="stat-note">방문: 같은 브라우저의 30분 안 재방문은 1회로 셈 · 순방문자: 브라우저 기준 중복 제외 · 조회수: 게시판 글 조회수(같은 브라우저·게시판 1시간에 1회, 날짜별은 ${fmtDay(pvSince)}부터 집계) · 게시글: 게시판 글(카드의 '댓글') 수, 삭제된 글 제외 · 날짜는 한국시간</p></div>`;
    showAuthorOverlay('📊 화면 정보', `${fmtDay(r.today)} 기준 사이트 통계`, '<button class="btn-tool" data-act="openStats">새로고침</button>', body);
    loadImageStats();
  } catch (e) {
    if (overlayStale(seq)) return;
    if (/관리자 비밀번호/.test(e.message)) adminLogout();
    showAuthorOverlay('📊 화면 정보', '', '', `<p class="empty-msg">불러오지 못했습니다. (${escHtml(e.message)})</p>`);
  }
}

// 칼럼 사진 저장소 현황 (Cloudflare KV 무료 1GB) · 안 쓰는 사진 정리
const fmtMB = b => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 2 : 1) + 'MB';
async function loadImageStats(cleanup = false) {
  const el = () => document.getElementById('imgStats');
  if (!el()) return;
  try {
    const r = await api({}, { action: 'adminImages', adminKey, ...(cleanup ? { cleanup: true } : {}) });
    if (!el()) return;
    if (!r.available) { el().innerHTML = '<p class="stat-note">사진 저장소가 연결되지 않았습니다.</p>'; return; }
    const pct = r.bytes / r.limitBytes * 100;
    el().innerHTML = `
      <div class="stat-grid small">
        ${tile('사진', fmtN(r.count) + '장', '강의에 쓰는 사진 ' + fmtN(r.used) + '장')}
        ${tile('사용 용량', fmtMB(r.bytes), (pct < 0.1 ? '0.1% 미만' : pct.toFixed(1) + '%') + ' / 무료 1GB')}
        ${tile('안 쓰는 사진', fmtN(r.unused) + '장', fmtMB(r.unusedBytes))}
      </div>
      ${r.deleted ? `<p class="stat-note">안 쓰는 사진 ${fmtN(r.deleted)}장을 정리했습니다.</p>` : ''}
      ${r.unusedOld ? `<button class="btn-tool" data-act="cleanupImages" data-n="${r.unusedOld}">안 쓰는 사진 ${fmtN(r.unusedOld)}장 정리</button>` : ''}`;
  } catch (e) {
    if (el()) el().innerHTML = `<p class="stat-note">불러오지 못했습니다. (${escHtml(e.message)})</p>`;
  }
}
function cleanupImages(n) {
  if (!confirm(`어느 강의에도 쓰이지 않는 사진 ${n}장을 지울까요?\n지운 사진은 되돌릴 수 없습니다.`)) return;
  document.getElementById('imgStats').innerHTML = '<p class="stat-note">정리하는 중...</p>';
  loadImageStats(true);
}

function closeAuthor(e) {
  if (e && e.target !== document.getElementById('authorOverlay')) return;
  if (!isOpen('authorOverlay')) return;
  document.getElementById('authorOverlay').classList.add('hidden');
  overlaySeq++;
  leaveLayer();
}

function updateCharCount() {
  const len = document.getElementById('postContent').value.length;
  document.getElementById('charCount').textContent = `${len}/${postMax()}`;
}

// ── 유틸 ──────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  renderWriteBox();
  if (currentStock) isColumnTab() ? renderPosts(true) : drawPosts();
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
  const seq = overlayLoading('회원정보');
  try {
    const r = await api({}, { action: 'profile' });
    if (overlayStale(seq)) return;
    const joined = r.user.ts ? new Date(r.user.ts).toLocaleDateString('ko-KR') : '-';
    const chips = r.following.length
      ? `<div class="follow-chips">${r.following.map(n => `<button class="follow-chip" data-nick="${escHtml(n)}" data-act="openAuthor">${escHtml(n)}</button>`).join('')}</div>`
      : '<span class="info-sub">팔로우한 회원이 없습니다</span>';
    showAuthorOverlay('회원정보', `${r.user.nick}님`, '', `
      <table class="info-table profile-table">
        <tr><td class="info-key">아이디</td><td class="info-val">${escHtml(r.user.id)}</td></tr>
        <tr><td class="info-key">닉네임</td><td class="info-val">${escHtml(r.user.nick)}</td></tr>
        <tr><td class="info-key">가입일</td><td class="info-val">${joined}</td></tr>
        <tr><td class="info-key">작성글</td><td class="info-val"><button class="link-btn" data-nick="${escHtml(r.user.nick)}" data-act="openAuthor">${r.posts}개 보기</button></td></tr>
        <tr><td class="info-key">팔로워</td><td class="info-val">${r.followers}명</td></tr>
        <tr><td class="info-key">팔로잉</td><td class="info-val"><button class="link-btn follow-count" data-act="openFeed" title="팔로잉 보기">${r.following.length}명</button> ${chips}</td></tr>
        <tr><td class="info-key">관심 종목</td><td class="info-val">${r.favs}개</td></tr>
      </table>
      <div class="profile-section">
        <h3>비밀번호 변경</h3>
        <div class="post-form-row">
          <input id="pfCurPw" type="password" placeholder="현재 비밀번호" maxlength="30" autocomplete="current-password">
          <input id="pfNewPw" type="password" placeholder="새 비밀번호 (6~30자)" maxlength="30" autocomplete="new-password">
          <button class="btn-submit" data-act="changePassword">변경</button>
        </div>
        <p class="info-sub">변경하면 다른 기기의 로그인은 모두 해제됩니다.</p>
      </div>
      <div class="profile-section">
        <h3>회원 탈퇴</h3>
        <p class="info-sub">계정·관심 종목·팔로우 정보가 삭제되며 되돌릴 수 없습니다. 작성한 글은 남으니 지우려면 탈퇴 전에 직접 삭제해주세요. 닉네임은 사칭 방지를 위해 다른 사람이 쓸 수 없게 남겨둡니다.</p>
        <div class="post-form-row">
          <input id="pfOutPw" type="password" placeholder="비밀번호 확인" maxlength="30" autocomplete="current-password">
          <button class="btn-danger" data-act="withdraw">탈퇴하기</button>
        </div>
      </div>`);
  } catch (e) {
    if (overlayStale(seq)) return;
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
    if ([...favs].some(c => !STOCKS.some(s => s.code === c))) await loadHidden();  // 숨은 종목이 관심 종목에 있으면 이름·시장 정보 받기
  }
  refreshStars();
  if (currentFilter === 'fav') { renderStocks(filteredList()); fetchAllPrices(); loadHomeNews(); }
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
    if (currentStock && !currentStock.isSector && !currentStock.isFav) codes.add(currentStock.code);
    const list = [...codes], chunks = [];
    for (let i = 0; i < list.length; i += 50) chunks.push(list.slice(i, i + 50));
    const results = await Promise.all(chunks.map(async c => {
      const res = await fetch(`${API_BASE}/api/stock?codes=${c.join(',')}`);
      const data = res.ok ? await res.json() : {};
      return Array.isArray(data.stocks) ? data.stocks : [];
    }));

    results.flat().forEach(d => {
      const s = stockOf(d.code);
      if (!s || !d.price) return;
      s.price = d.price;
      if (d.changeRate != null && !isNaN(d.changeRate)) s.change = d.changeRate;
      if (d.diff != null && !isNaN(d.diff)) s.diff = d.diff;
      if (Array.isArray(d.ohlc)) s.ohlc = d.ohlc;
      s.session = d.session || null;  // 장 마감 후·시작 전 시간외 가격이면 PRE_MARKET/AFTER_MARKET
      if (d.volume) s.volume = d.volume;
      liveCodes.add(s.code);
      updateCard(s);
    });

    // 열려있는 모달 가격도 갱신
    if (currentStock && liveCodes.has(currentStock.code)) {
      const up = currentStock.change >= 0;
      document.getElementById('modalPrice').textContent = fmtPrice(currentStock);
      const mc = document.getElementById('modalChange');
      mc.innerHTML = `${up ? '+' : ''}${escHtml(currentStock.change)}%${sessionTagHtml(currentStock)}`;
      mc.className = 'modal-change ' + (up ? 'up' : 'down');
    }
  } catch (e) {
    // 네트워크 오류 시 마지막 가격 유지
  }
}

// 시간외 가격 표시: 장 마감 후(애프터마켓)·장 시작 전(프리마켓) 가격일 때 종목 창에 '시간외'
const sessionTagHtml = s => s.session ? ` <span class="session-tag" title="${s.session === 'PRE_MARKET' ? '장 시작 전' : '장 마감 후'} 시간외 거래 가격">시간외</span>` : '';
function updateCard(s) {
  const up = s.change >= 0;
  // 목록·검색결과 양쪽 카드 모두 갱신
  document.querySelectorAll(`.stock-card[data-code='${s.code}']`).forEach(card => {
    const priceEl = card.querySelector('.stock-price');
    const chgEl = card.querySelector('.price-change');
    const diffEl = card.querySelector('.price-diff');
    const candleEl = card.querySelector('.day-candle');
    if (candleEl) candleEl.innerHTML = dayCandleSvg(s);
    const avatarEl = card.querySelector('.stock-avatar');
    if (priceEl) priceEl.textContent = fmtPrice(s);
    if (chgEl) {
      chgEl.textContent = `${up ? '+' : ''}${s.change}%`;
      chgEl.className = 'price-change ' + (up ? 'up' : 'down');
    }
    if (diffEl) {
      diffEl.textContent = fmtDiff(s);
      diffEl.className = 'price-diff ' + (up ? 'up' : 'down');
    }
    if (avatarEl) { avatarEl.classList.toggle('up', up); avatarEl.classList.toggle('down', !up); }
  });
}

// ── 상단 지수 실시간 갱신 (/api/market, 20초 주기 · 탭 숨김 시 정지) ──
const MARKET_STATUS = { CLOSE: '장마감', PREOPEN: '장전', OPEN: '' };

function startMarketBanner() {
  setBannerSession();
  setInterval(setBannerSession, 60000);
  fetchMarket();
  setInterval(whenVisible(fetchMarket), PRICE_REFRESH);
}
// 휴대폰 지수 칸: 한국 시간 08:00~20:00는 코스피·코스닥·환율, 20:00~다음날 08:00는 다우·나스닥·S&P 500만 (styles.css .market-banner.show-kr/.show-us, PC는 6개 모두)
function setBannerSession() {
  const h = new Date(Date.now() + 9 * 3600e3).getUTCHours();
  const kr = h >= 8 && h < 20;
  const banner = document.getElementById('marketBanner');
  banner.classList.toggle('show-kr', kr);
  banner.classList.toggle('show-us', !kr);
}

async function fetchMarket() {
  try {
    const res = await fetch(`${API_BASE}/api/market`);
    if (!res.ok) return;
    const { indices } = await res.json();
    (indices || []).forEach(renderIndexCard);
    if (indices?.length) {
      const banner = document.getElementById('marketBanner');
      banner.classList.remove('loading');
      banner.removeAttribute('aria-busy');
    }
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
    if (isOpen('pdfOverlay')) return closePdf();
    if (!document.getElementById('authorOverlay').classList.contains('hidden')) return closeAuthor();
    closeModal(null);
    closeDropdowns();
  }
});

// ── 홈 화면 바로가기 (휴대폰 헤더 📲 버튼, PC에서는 CSS로 숨김) ──
// 안드로이드 크롬·삼성 인터넷·엣지: 브라우저 설치 창(beforeinstallprompt)을 띄움 (manifest.webmanifest + 아이콘)
// 아이폰(사파리·크롬)·설치 창을 못 받은 브라우저: '홈 화면에 추가' 방법 안내, 카카오톡 안 브라우저: 외부 브라우저로 열기
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });  // 브라우저 자동 배너 대신 버튼으로
window.addEventListener('appinstalled', () => { installPrompt = null; updateA2hsButton(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function updateA2hsButton() {
  const b = document.getElementById('btnA2hs');
  if (b) b.classList.toggle('hidden', isStandalone());  // 이미 홈 화면 앱으로 연 경우 숨김
}
document.addEventListener('DOMContentLoaded', updateA2hsButton);

async function addToHome() {
  if (installPrompt) {
    const p = installPrompt;
    installPrompt = null;  // 한 번만 쓸 수 있음
    try {
      await p.prompt();
      await p.userChoice;
      return;
    } catch {}  // 설치 창을 못 띄우면 아래 안내로
  }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const step = (n, html) => `<li class="a2hs-step"><b>${n}</b><span>${html}</span></li>`;
  let body;
  if (/KAKAOTALK/i.test(ua)) {
    body = `<p class="a2hs-note">카카오톡 안에서는 홈 화면에 추가할 수 없어요. 아래 버튼으로 ${ios ? '사파리' : '크롬'}에서 연 뒤 📲 버튼을 다시 눌러주세요.</p>
      <p><a class="btn-submit a2hs-open" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.origin + '/')}">다른 브라우저로 열기</a></p>`;
  } else if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
    body = `<p class="a2hs-note">앱 안 브라우저에서는 홈 화면에 추가할 수 없어요. 메뉴에서 <b>${ios ? 'Safari로 열기' : '다른 브라우저로 열기'}</b>를 누른 뒤 📲 버튼을 다시 눌러주세요.</p>`;
  } else if (/SamsungBrowser/i.test(ua)) {
    // 삼성 인터넷의 '앱 설치'는 Play 프로텍트가 막으므로 일반 바로가기로 (theme.js가 삼성 인터넷엔 manifest를 안 줌)
    body = `<ol class="a2hs-steps">${step(1, '화면 아래 오른쪽 <b>메뉴</b> <span class="a2hs-ico">⋮</span> 또는 <span class="a2hs-ico">≡</span> 를 누르세요')}${step(2, '<b>현재 페이지 추가</b>를 누르세요')}${step(3, '<b>홈 화면</b>을 고르고 <b>추가</b>를 누르면 끝!')}</ol>`;
  } else if (ios) {
    body = `<ol class="a2hs-steps">${step(1, '화면 아래(또는 주소창 옆) <b>공유 버튼</b> <span class="a2hs-ico">⬆︎</span> 을 누르세요')}${step(2, '목록을 내려 <b>홈 화면에 추가</b>를 누르세요')}${step(3, '오른쪽 위 <b>추가</b>를 누르면 끝!')}</ol>`;
  } else {
    body = `<ol class="a2hs-steps">${step(1, '브라우저 오른쪽 위(삼성 인터넷은 아래) <b>메뉴</b> <span class="a2hs-ico">⋮</span> 를 누르세요')}${step(2, '<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르세요 (삼성 인터넷: <b>현재 페이지 추가 → 홈 화면</b>)')}${step(3, '<b>추가</b>를 누르면 끝!')}</ol>`;
  }
  showAuthorOverlay('홈 화면에 바로가기 추가', '업종닷컴을 앱처럼 바로 열 수 있어요', '',
    `<div class="a2hs-box"><img class="a2hs-icon" src="/icon-192.png" alt="" width="56" height="56">${body}</div>`);
}
