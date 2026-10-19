// GET /api/detail?code=068270&type=news|research|disclosure|info (info = 시세 정보)
// GET /api/detail?code=SECMKT|SECBIO…&type=research → 주식 시장(투자전략)·업종(산업분석) 증권사 리포트
// GET /api/detail?codes=005930,000660,…&type=research|disclosure → 관심 종목 모아보기 (국내 종목 최대 25개, 최신순 100건, 항목마다 code)
// 종목 상세 모달용 데이터 (네이버 금융 / WISEfn 프록시)
// 미국 종목(code=TSLA.O 등)은 news·info만 (네이버 해외주식)
// 뉴스 = 네이버 증권 최신 100건 + Google 뉴스 종목명 정확히 일치 검색(최근 7일) 50건 → 중복 제거 후 최신순 100건
//        (화면에는 20건씩 '더보기'로 표시)
//   네이버 국내: 20건×5쪽 (50건 단위로 받으면 2쪽이 1쪽과 겹침), 미국: 50건×2쪽 (한 번에 최대 50건)
import { googleNews, dedupeByTitle } from './_google.js';
import { STOCKS, SECTORS } from './_stocks.js';
import { nameOf, stockQuery } from './_names.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const NAVER = 'https://m.stock.naver.com/api';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const NEWS_MAX = 100, KR_NEWS_PAGE = 20, US_NEWS_PAGE = 50, GOOGLE_MAX = 50, LIST_SIZE = 50;

const ENTITIES = { amp: '&', nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', lt: '<', gt: '>', quot: '"', apos: "'" };
// 한 번에 풀기: 숫자(&#8943; &#x2026;)·이름(&amp; &middot; …) 엔티티 — 풀린 결과를 다시 풀지 않음
const decodeEntities = s => s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (m, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
  const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
});
const stripTags = s => decodeEntities(String(s ?? '').replace(/<[^>]*>/g, '')).trim();

// 종목명이 정확히 들어간 Google 뉴스 검색 (검색어는 서버의 종목 목록에서만 만듦 — 업종 탭·숨은 종목·탭에서 빠진 종목)
function stockGoogleNews(code) {
  const name = nameOf(code);
  return name ? googleNews(stockQuery(name), { when: '7d', max: GOOGLE_MAX }) : Promise.resolve([]);
}

// 네이버 최신 NEWS_MAX건 + 구글 최대 GOOGLE_KEEP건 (구글은 네이버보다 오래된 기사가 많아 함께 최신순으로 자르면 다 밀려남
// → 따로 넘기고 화면에서 20건마다 5건 정도 섞음, app.js mixGoogle). 한쪽이 실패해도 나머지로 응답
const GOOGLE_KEEP = 25;
async function mergeNews(naverPages, google) {
  const results = await Promise.allSettled([...naverPages, google]);
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  const items = dedupeByTitle(results.flatMap(r => r.status === 'fulfilled' ? r.value : []));  // 네이버 먼저 → 같은 기사는 네이버만
  const byTime = (a, b) => String(b.datetime).localeCompare(String(a.datetime));
  return [...items.filter(n => n.source !== 'google').sort(byTime).slice(0, NEWS_MAX), ...items.filter(n => n.source === 'google').sort(byTime).slice(0, GOOGLE_KEEP)];
}

// 실시간 종목 뉴스
const naverNewsPage = async (code, page) => {
  const data = await getJson(`${NAVER}/news/stock/${code}?pageSize=${KR_NEWS_PAGE}&page=${page}`);
  return data.flatMap(g => g.items ?? []).map(n => ({
    title: stripTags(n.titleFull || n.title),
    summary: stripTags(n.body),
    press: n.officeName,
    datetime: n.datetime, // YYYYMMDDHHmm
    url: n.mobileNewsUrl || `https://n.news.naver.com/mnews/article/${n.officeId}/${n.articleId}`,
    thumb: n.imageOriginLink || null,
    source: 'naver',
  }));
};
const news = code => mergeNews([1, 2, 3, 4, 5].map(p => naverNewsPage(code, p)), stockGoogleNews(code));

// 증권사 분석 보고서
async function research(code) {
  const data = await getJson(`${NAVER}/research/stock/${code}?pageSize=${LIST_SIZE}`);
  return data.map(r => ({
    title: stripTags(r.title),
    broker: r.brokerName,
    date: r.writeDate,
    views: r.readCount,
    summary: stripTags(r.previewContent),
    url: `/api/report?kind=company&id=${r.researchId}`,  // 원문 PDF 바로 보기 (api/report.js)
  }));
}

// ── 주식 시장·업종 게시판의 증권사 리포트 (네이버 증권 리서치) ──
// 주식 시장(SECMKT): 투자전략 최신 50건
// 업종(SECBIO 등): 산업분석은 업종 필터가 없어 최근 500건(약 한 달)을 받아 네이버 업종 분류 + 제목 키워드·업종 종목명으로 골라 최신 50건
// 미국 주식(SECUSA): 산업분석이 국내 업종 위주라 투자전략에서 미국·글로벌 관련 리포트
const MARKET_BOARD = 'SECMKT';
const boardSector = code => SECTORS.find(s => 'SEC' + s.key.slice(0, 3).toUpperCase() === code)?.key;
const INDUSTRY_RULES = {
  bio: { cats: ['제약', '바이오'], words: ['바이오', '제약', '신약', '헬스케어', '임상', '의약', 'CDMO', '비만', 'ADC'] },
  semi: { cats: ['반도체'], words: ['반도체', 'HBM', '메모리', '파운드리', 'D램', 'DRAM', '낸드', 'NAND', '칩', '패키지 기판', '기판', '웨이퍼', 'AI 서버'] },
  battery: { cats: [], words: ['2차전지', '이차전지', '배터리', '양극재', '음극재', '전해질', '리튬', '전고체', 'ESS', '전기차', '로봇', '휴머노이드', '피지컬 AI', '자동화'] },
  power: { cats: ['유틸리티'], words: ['전력', '변압기', '전선', '송전', '원전', '원자력', 'SMR', '가스터빈', '발전', '데이터센터', 'Power'] },
  kbeauty: { cats: ['화장품', '미디어', '여행'], words: ['화장품', '뷰티', '코스메틱', '미용', '엔터', '아이돌', 'K팝', '콘텐츠', '드라마', '카지노', '면세', '호텔', '여행', '관광'] },
  ship: { cats: ['조선'], words: ['조선', '선박', 'LNG선', '방산', '방위', '국방', '무기', '우주', '항공우주', 'MASGA'] },
  auto: { cats: ['자동차', '타이어'], words: ['자동차', '완성차', '車', '타이어', '부품', '현대차', '기아'] },
  finance: { cats: ['은행', '증권', '보험', '지주회사'], words: ['은행', '증권', '보험', '금융', '카드', '밸류업', '배당', '저PBR', '지주'] },
  elec: { cats: ['전기전자', 'IT'], words: ['전자부품', 'MLCC', '기판', 'PCB', 'FC-BGA', '카메라모듈', '디스플레이', 'OLED', '가전', '스마트폰', '전장'] },
  chem: { cats: ['석유화학', '철강금속', '에너지'], words: ['화학', '정유', '석유', '철강', '비철', '아연', '구리', '리튬', '태양광', '수소'] },
  logistics: { cats: ['건설', '해운', '항공운송'], words: ['건설', '해운', '물류', '항공', '운송', '기계', '건설기계', '플랜트', '시멘트'] },
  consumer: { cats: ['음식료', '유통', '섬유의류'], words: ['음식료', '식품', '라면', '주류', '담배', '유통', '백화점', '편의점', '의류', '패션', '소비', '내수'] },
  telecom: { cats: ['통신', '인터넷포탈', '게임'], words: ['통신', '5G', '인터넷', '플랫폼', '포털', '게임', '소프트웨어', 'IT서비스', '클라우드', '광고'] },
};
const USA_WORDS = ['미국', '美', '글로벌', 'Global', 'GLOBAL', '해외', 'ETF', 'S&P', '나스닥', '빅테크', '뉴욕', '연준', 'FOMC', 'US ', 'Fed'];
// 영어 3자 이하 종목명(LS, HLB 등)은 다른 단어와 겹치기 쉬워 제외
const sectorNames = key => STOCKS.filter(x => x.sectors?.[key] && x.name.length >= 3 && !/^[A-Za-z0-9&]{1,3}$/.test(x.name)).map(x => x.name);

const researchList = async (kind, page, size) => (await getJson(`${NAVER}/research/${kind}?pageSize=${size}&page=${page}`)).map(r => ({
  title: stripTags(r.title),
  broker: r.brokerName,
  date: r.writeDate,
  views: r.readCount,
  category: r.category,
  url: `/api/report?kind=${kind}&id=${r.researchId}`,
}));
async function pages(kind, n) {
  const results = await Promise.allSettled(Array.from({ length: n }, (_, i) => researchList(kind, i + 1, 100)));
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}
async function boardResearch(code) {
  if (code === MARKET_BOARD) return researchList('invest', 1, LIST_SIZE);
  const key = boardSector(code);
  if (key === 'usa') return (await pages('invest', 3)).filter(r => USA_WORDS.some(w => r.title.includes(w))).slice(0, LIST_SIZE);
  const rule = INDUSTRY_RULES[key];
  const names = sectorNames(key);
  return (await pages('industry', 5))
    .filter(r => rule.cats.includes(r.category) || rule.words.some(w => r.title.includes(w)) || names.some(nm => r.title.includes(nm)))
    .slice(0, LIST_SIZE);
}

// 공시 정보
async function disclosure(code) {
  const data = await getJson(`${NAVER}/stock/${code}/disclosure?pageSize=${LIST_SIZE}&page=1`);
  return data.map(d => ({
    title: stripTags(d.title),
    datetime: d.datetime,
    source: d.author,
    url: `https://m.stock.naver.com/domestic/stock/${code}/notice/${d.disclosureId}`,
  }));
}

// 시세 정보: 최근 10거래일 종가·등락률 + 외국인·기관·개인 순매수 수량 (네이버 일별 시세 + 투자자별 매매동향)
//   당일 장중에는 투자자별 수량이 아직 없을 수 있어 null로 둠
const DAYS = 10;
async function info(code) {
  const [prices, trend] = await Promise.all([
    getJson(`${NAVER}/stock/${code}/price?pageSize=${DAYS}&page=1`),
    getJson(`${NAVER}/stock/${code}/trend?pageSize=${DAYS}`).catch(() => []),
  ]);
  const byDate = new Map(trend.map(t => [t.bizdate, t]));
  return {
    days: prices.slice(0, DAYS).map(p => {
      const t = byDate.get(String(p.localTradedAt).replace(/-/g, ''));
      return {
        date: p.localTradedAt,
        close: p.closePrice,
        change: p.compareToPreviousClosePrice,
        rate: p.fluctuationsRatio,
        foreign: t?.foreignerPureBuyQuant ?? null,
        organ: t?.organPureBuyQuant ?? null,
        individual: t?.individualPureBuyQuant ?? null,
      };
    }),
  };
}

// ── 미국 종목 (네이버 해외주식) ──
const WORLD = 'https://api.stock.naver.com';

const usNewsPage = async (code, page) => {
  const data = await getJson(`${WORLD}/news/worldStock/${code}?pageSize=${US_NEWS_PAGE}&page=${page}`);
  return data.map(n => ({
    title: stripTags(n.tit),
    summary: stripTags(n.subcontent),
    press: n.ohnm,
    datetime: String(n.dt || '').slice(0, 12), // YYYYMMDDHHmm
    url: `https://n.news.naver.com/article/${n.oid}/${n.aid}`,
    thumb: n.thumbUrl || null,
    source: 'naver',
  }));
};
const usNews = code => mergeNews([usNewsPage(code, 1), usNewsPage(code, 2)], stockGoogleNews(code));

// 미국 종목 시세 정보: 최근 10거래일 종가·등락률 (투자자별 매매동향은 제공되지 않음)
async function usInfo(code) {
  const prices = await getJson(`${WORLD}/stock/${code}/price?pageSize=${DAYS}&page=1`);
  return {
    us: true,
    days: prices.slice(0, DAYS).map(p => ({
      date: String(p.localTradedAt).slice(0, 10),
      close: p.closePrice,
      change: p.compareToPreviousClosePrice,
      rate: p.fluctuationsRatio,
    })),
  };
}

const HANDLERS = { news, research, disclosure, info };
const US_HANDLERS = { news: usNews, info: usInfo, research: async () => [], disclosure: async () => [] };
const isDomestic = c => /^[0-9][0-9A-Z]{5}$/.test(c);
const isUs = c => /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c);

// 관심 종목 모아보기: 종목마다 받아 합쳐 최신순 (Cloudflare 무료 요금제: 요청 1번에 외부 호출 50번 제한 → 25종목씩)
const MULTI_MAX_CODES = 25, MULTI_MAX_ITEMS = 100;
const MULTI = { research, disclosure };
const itemTime = d => String(d.datetime || d.date || '');
async function multi(codes, type) {
  const results = await Promise.allSettled(codes.map(c => MULTI[type](c).then(list => list.map(d => ({ ...d, code: c })))));
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => itemTime(b).localeCompare(itemTime(a)))
    .slice(0, MULTI_MAX_ITEMS);
}

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').trim();
  const type = String(req.query.type ?? '');

  if (req.query.codes != null) {
    const codes = [...new Set(String(req.query.codes).split(',').map(c => c.trim()).filter(isDomestic))].slice(0, MULTI_MAX_CODES);
    if (!Object.hasOwn(MULTI, type)) return res.status(400).json({ error: 'type이 올바르지 않습니다' });
    if (!codes.length) return res.json({ type, data: [] });  // 미국 종목만 있으면 리포트·공시 없음
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=600');
    try {
      return res.json({ type, data: await multi(codes, type) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const isBoard = code === MARKET_BOARD || !!boardSector(code);
  const handlers = isBoard ? { research: boardResearch } : isDomestic(code) ? HANDLERS : isUs(code) ? US_HANDLERS : null;
  if (!handlers || !handlers[type]) {
    return res.status(400).json({ error: 'code 또는 type이 올바르지 않습니다' });
  }
  // 뉴스·시세 정보는 1분, 나머지는 10분 캐시
  // 뉴스: 1분마다 새로, 10분까지는 지난 것을 바로 보여 주고 뒤에서 새로 받음(functions/_adapter.js) / 시세 정보는 1분 / 리포트·공시: 10분, 1시간까지 바로
  res.setHeader('Cache-Control', type === 'news' ? 's-maxage=60, stale-while-revalidate=600' : type === 'info' ? 's-maxage=60, stale-while-revalidate=60' : 's-maxage=600, stale-while-revalidate=3600');

  try {
    res.json({ code, type, data: await handlers[type](code) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
