// GET /api/news?sector=semi&codes=005930,000660,...  → 업종 뉴스 (최신순)
// GET /api/news?sector=market  → 주식 시장·경제 뉴스 (네이버 증권 주요뉴스·실시간 속보 + 구글 시장·경제 키워드)
//   화면에서 업종 전체 종목을 25개씩 나눠 요청 (Cloudflare 무료 요금제: 요청 1번에 외부 호출 50번 제한). 구글은 sector가 있는 첫 요청에서만
//   - 네이버: 업종 대표 종목들의 네이버 종목 뉴스 (미국 종목은 네이버 해외주식 뉴스)
//   - 구글: Google 뉴스 RSS 업종 세부 분야별 키워드 검색 (최근 7일, 주식 관련 단어 포함 기사만)
//   - 자동 생성 시세 기사("주가 하락 중", "장마감" 등)는 제외
// { data: [{ title, summary, press, datetime, url, thumb, codes: [관련 종목코드], source: 'naver'|'google' }] }
import { googleNews, stripTags } from './_google.js';
import { LISTED_NAMES } from './_listed.js';
import { nameOf, stockQuery } from './_names.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_CODES = 25;
const MAX_ITEMS = 200;  // 화면에서 업종 키워드로 한 번 더 거른 뒤 최신 100건 표시
const GOOGLE_MAX = 50;
const MARKET_GOOGLE_PER_QUERY = 25;  // 주식 시장은 검색어 4개 × 25건 (검색어가 많아 업종처럼 50건을 나누면 검색어당 13건뿐)

// 업종별 Google 뉴스 검색어 (임의 검색어 프록시가 되지 않도록 서버에 고정)
// 업종을 세부 분야로 나눠 검색 (한쪽 분야로 쏠리지 않게, 검색어마다 GOOGLE_MAX / 개수 건씩)
// MKT: 주식 관련 단어가 함께 있는 기사만 (산업·정책·연예 기사 제외)
const MKT = '(주가 OR 주식 OR 특징주 OR 증시 OR 실적 OR 수주 OR 계약 OR 목표가)';
const GOOGLE_QUERY = {
  bio: [`(바이오주 OR 제약주 OR "제약·바이오" OR 제약바이오) ${MKT}`, '(신약 OR 임상 OR 기술이전 OR 기술수출 OR FDA) (주가 OR 특징주 OR 계약 OR 승인 OR 제약사)'],
  semi: [`(반도체주 OR "반도체 주가" OR 반도체株 OR "반도체 업황") ${MKT}`, `(HBM OR D램 OR 파운드리 OR 낸드 OR 메모리) ${MKT}`],
  battery: [`(2차전지 OR 이차전지 OR 배터리 OR 양극재 OR 전고체 OR ESS) ${MKT}`, `(로봇주 OR 휴머노이드 OR "피지컬 AI" OR 협동로봇 OR "로봇 기업") ${MKT}`],
  power: [`(전력기기 OR 변압기 OR 전선 OR 전력망 OR 초고압 OR 전력주) ${MKT}`, `(원전 OR 원자력 OR SMR OR 원전주) ${MKT} -의학원 -병원`],
  kbeauty: [`(K뷰티 OR K-뷰티 OR 화장품 OR 미용기기 OR 보톡스 OR 톡신) ${MKT}`, `(엔터주 OR 엔터사 OR K팝 OR 여행주 OR 카지노 OR 면세점 OR 호텔) ${MKT}`],
  ship: [`(조선주 OR 조선업 OR 조선사 OR K-조선 OR "선박 수주") ${MKT}`, `(방산주 OR 방산 OR 방위산업 OR K-방산) ${MKT}`],
  auto: [`(자동차주 OR 완성차 OR 현대차 OR 기아 OR "자동차 부품" OR 타이어) ${MKT}`],
  finance: [`(금융주 OR 은행주 OR 증권주 OR 보험주 OR 금융지주 OR 밸류업) ${MKT} -美 -유럽`],
  elec: [`(전자부품 OR MLCC OR 반도체기판 OR FC-BGA OR 카메라모듈 OR 전장부품) ${MKT}`, `(디스플레이 OR OLED OR 가전 OR TV OR 스마트폰 부품) ${MKT}`],
  chem: [`(석유화학 OR 화학주 OR 정유주 OR 정유사 OR 나프타 OR 에틸렌) ${MKT}`, `(철강주 OR 철강업 OR 후판 OR 열연 OR 비철금속 OR 아연 OR 구리) ${MKT}`],
  logistics: [`(해운주 OR 해운업 OR 컨테이너 운임 OR SCFI OR 물류 OR 항공주) ${MKT}`, `(건설주 OR 건설사 OR 건설기계 OR 기계주 OR 플랜트 수주) ${MKT}`],
  consumer: [`(음식료 OR 식품주 OR 라면 OR 주류 OR 담배 OR 음료) ${MKT}`, `(유통주 OR 백화점 OR 편의점 OR 의류 OR 패션주 OR 내수주) ${MKT}`],
  telecom: [`(통신주 OR 통신사 OR SK텔레콤 OR KT OR LG유플러스 OR 5G) ${MKT}`, `(인터넷 플랫폼 OR 네이버 OR 카카오 OR 게임주 OR IT서비스 OR 소프트웨어) ${MKT}`],
  // 주식 시장: 국내 증시 · 환율·금리·유가(증시 언급 기사만) · 금·은 시세 · 미국 증시 ('금'·'은' 한 글자는 다른 말과 겹쳐 금값·은값 등으로 검색)
  market: [
    '(코스피 OR 코스닥 OR 주식시장 OR 한국증시 OR 국내증시 OR KOSPI OR KOSDAQ OR "외국인 순매도" OR "외국인 순매수")',
    '(환율 OR 금리 OR 유가) (증시 OR 코스피 OR 코스닥 OR 주식 OR 주식시장)',
    '(금값 OR 금시세 OR "금 시세" OR "국제 금" OR 은값 OR 은시세 OR "은 시세" OR "금·은")',
    '(다우존스 OR 다우지수 OR 나스닥 OR S&P500 OR "S&P 500" OR 필라델피아반도체 OR "필라델피아 반도체")',
  ],
  usa: ['("미국 증시" OR 뉴욕증시 OR 나스닥 OR S&P500 OR 다우지수)', '(서학개미 OR "미국 주식" OR "미국 ETF" OR 미장)'],
};

// 자동 생성된 시세 기사 제외 ("○○ 주가 하락 중", "주가 2원 하락 후 장마감", "주가, 10월 13일 장중 74,300원", "[마감분석] … 보합 마감")
const AUTO_PRICE_RE = /주가,?\s*(상승|하락|보합)\s*중$|(상승|하락|보합)\s*후\s*장마감|주가,?\s*\d+월\s*\d+일\s*장중|^\[마감분석\]/;


// 미국 종목: 네이버 해외주식 뉴스 (로이터 등)
async function usStockNews(code) {
  const r = await fetch(`https://api.stock.naver.com/news/worldStock/${code}?pageSize=20&page=1`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(n => ({
    id: `${n.oid}_${n.aid}`,
    title: stripTags(n.tit),
    summary: stripTags(n.subcontent),
    press: n.ohnm,
    datetime: String(n.dt || '').slice(0, 12),
    url: `https://n.news.naver.com/article/${n.oid}/${n.aid}`,
    thumb: n.thumbUrl || null,
    code,
    source: 'naver',
  }));
}

// 주식 시장·경제 뉴스: 네이버 증권 주요뉴스 5쪽 + 실시간 속보 3쪽 (20건씩) — 특정 종목 기사는 빼고 시장 전체 기사만
const MARKET_PAGES = [['mainnews', 1], ['mainnews', 2], ['mainnews', 3], ['mainnews', 4], ['mainnews', 5], ['flashnews', 1], ['flashnews', 2], ['flashnews', 3]];

// 특정 종목 기사 판단: 제목에 상장사 이름(api/_listed.js, scripts/listed.mjs로 생성)이나 흔한 약칭이 있거나, 종목 기사 머리말·목표가 언급
// 두 글자 이하 상장사명(대상·동양·태양 등)은 일반 단어와 겹쳐 제외하고, 겹칠 일 없는 이름만 SHORT_NAMES로 따로 둠
const SHORT_NAMES = ['기아', '두산', '한화', '농심', '효성', '휴젤', '씨젠', '안랩', '루닛', '하림', '웹젠', '한샘', '보령', '풍산', '영풍', '대웅', '한섬', '쏘카', '삼립', '한진', '심텍', '파두', '고영', '엔켐', '천보', '툴젠', '바텍', '뷰노', '다날', '엠로', '샘표', '한독', '한컴'];
const NAME_ALIASES = ['신한금융', '롯데손보', 'SBI인베', '하나금융', '우리금융', '네이버', '포스코', 'LG엔솔', '하이닉스', '삼성바이오', '삼성중공업', '현대중공업'];
const STOCK_ARTICLE_RE = /\[(특징주|종목\+|클릭 e종목|줍줍리포트|Why 바이오|종목분석|종목진단|종목 ?Pick|애널리스트 ?픽)|목표가|목표주가|투자의견/i;
const isLatin = n => /^[A-Za-z0-9&.-]+$/.test(n);
const KO_NAMES = [...LISTED_NAMES.filter(n => n.length >= 3 && !isLatin(n)), ...SHORT_NAMES, ...NAME_ALIASES];
// 영문 이름(NAVER, KT&G 등)은 다른 영문 단어 일부와 겹치지 않게 앞뒤가 영문·숫자가 아닐 때만
const escRe = s => s.replace(/[.*+?^${}()|[\]\\&-]/g, '\\$&');
const EN_RE = new RegExp(`(^|[^A-Za-z0-9])(${LISTED_NAMES.filter(n => n.length >= 3 && isLatin(n)).map(escRe).join('|')})(?![A-Za-z0-9])`);
const isStockArticle = title => STOCK_ARTICLE_RE.test(title) || EN_RE.test(title) || KO_NAMES.some(n => title.includes(n));
async function marketNews([category, page]) {
  const r = await fetch(`https://m.stock.naver.com/api/news/list?category=${category}&pageSize=20&page=${page}`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).map(n => ({
    id: `${n.oid}_${n.aid}`,
    title: stripTags(n.tit),
    summary: stripTags(n.subcontent),
    press: n.ohnm,
    datetime: String(n.dt || '').slice(0, 12),
    url: `https://n.news.naver.com/mnews/article/${n.oid}/${n.aid}`,
    thumb: n.thumbUrl || null,
    source: 'naver',
  })).filter(n => !isStockArticle(n.title));
}

async function stockNews(code) {
  if (!/^[0-9][0-9A-Z]{5}$/.test(code)) return usStockNews(code);
  const r = await fetch(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=20&page=1`, {
    headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.flatMap(g => g.items ?? []).map(n => ({
    id: `${n.officeId}_${n.articleId}`,
    title: stripTags(n.titleFull || n.title),
    summary: stripTags(n.body),
    press: n.officeName,
    datetime: n.datetime, // YYYYMMDDHHmm
    url: n.mobileNewsUrl || `https://n.news.naver.com/mnews/article/${n.officeId}/${n.articleId}`,
    thumb: n.imageOriginLink || null,
    code,
    source: 'naver',
  }));
}

// 세부 분야 검색어별로 받아 합침 (한 검색어가 실패해도 나머지로 응답)
async function sectorGoogleNews(sector) {
  const qs = Object.hasOwn(GOOGLE_QUERY, sector) ? GOOGLE_QUERY[sector] : null;
  if (!qs) return [];
  const max = sector === 'market' ? MARKET_GOOGLE_PER_QUERY : Math.ceil(GOOGLE_MAX / qs.length);
  const results = await Promise.allSettled(qs.map(q => googleNews(q, { when: '7d', max })));
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// 관심 종목 모아보기: 종목명 여러 개를 OR로 묶어 구글 검색 (google=1인 첫 요청에서만, 검색어는 서버의 종목 이름으로만 만듦)
// 검색어가 너무 길지 않게 FAV_GOOGLE_NAMES개씩, 최대 2번
const FAV_GOOGLE_NAMES = 8;
async function favGoogleNews(codes) {
  const names = [...new Set(codes.map(nameOf).filter(Boolean))].slice(0, FAV_GOOGLE_NAMES * 2);
  if (!names.length) return [];
  const groups = [];
  for (let i = 0; i < names.length; i += FAV_GOOGLE_NAMES) groups.push(names.slice(i, i + FAV_GOOGLE_NAMES));
  const results = await Promise.allSettled(groups.map(g => googleNews(g.map(stockQuery).map(q => `(${q})`).join(' OR '), { when: '7d', max: Math.ceil(GOOGLE_MAX / groups.length) })));
  // 기사 제목에 들어간 종목을 관련 종목으로 (화면의 종목명 태그)
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []).map(n => {
    const code = codes.find(c => { const nm = nameOf(c); return nm && n.title.includes(nm); });
    return code ? { ...n, code } : n;
  });
}

export default async function handler(req, res) {
  const codes = String(req.query.codes || '')
    .split(',')
    .map(c => c.trim())
    .filter(c => /^[0-9][0-9A-Z]{5}$/.test(c) || /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c))
    .slice(0, MAX_CODES);

  const sector = String(req.query.sector || '');
  if (!codes.length && !Object.hasOwn(GOOGLE_QUERY, sector)) return res.status(400).json({ error: '종목코드 또는 업종이 올바르지 않습니다' });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');  // 10분까지는 지난 것을 바로 보여 주고 뒤에서 새로 받음 (functions/_adapter.js)

  const market = sector === 'market' ? MARKET_PAGES.map(marketNews) : [];
  const results = await Promise.allSettled([...market, ...codes.map(stockNews), sectorGoogleNews(sector), favGoogleNews(req.query.google === '1' ? codes : [])]);
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(n => !AUTO_PRICE_RE.test(n.title));
  if (!items.length) return res.status(502).json({ error: '뉴스를 불러오지 못했습니다' });

  // 같은 기사(여러 종목에 걸친 업종 기사)는 하나로 합치고 관련 종목을 모음
  const byKey = new Map();
  for (const n of items) {
    const key = n.title.replace(/\s+/g, '');
    const prev = byKey.get(key) || byKey.get(n.id);
    if (prev) {
      if (n.code && !prev.codes.includes(n.code)) prev.codes.push(n.code);
      continue;
    }
    const { code, id, ...rest } = n;
    const item = { ...rest, codes: code ? [code] : [] };
    byKey.set(key, item);
    byKey.set(id, item);
  }
  // 구글은 네이버보다 오래된 기사가 많아 함께 최신순으로 자르면 다 밀려남 → 따로 붙이고 화면에서 섞음 (app.js mixGoogle)
  const byTime = (a, b) => String(b.datetime).localeCompare(String(a.datetime));
  const all = [...new Set(byKey.values())];
  const data = [...all.filter(n => n.source !== 'google').sort(byTime).slice(0, MAX_ITEMS), ...all.filter(n => n.source === 'google').sort(byTime).slice(0, GOOGLE_MAX)];

  res.json({ data });
}
