// GET /api/detail?code=068270&type=news|research|disclosure|info (info = 시세 정보)
// 종목 상세 모달용 데이터 (네이버 금융 / WISEfn 프록시)
// 미국 종목(code=TSLA.O 등)은 news·info만 (네이버 해외주식)
// 뉴스 = 네이버 증권 최신 100건 + Google 뉴스 종목명 검색(최근 7일) 50건 → 중복 제거 후 최신순 100건
//        (화면에는 20건씩 '더보기'로 표시)
//   네이버 국내: 20건×5쪽 (50건 단위로 받으면 2쪽이 1쪽과 겹침), 미국: 50건×2쪽 (한 번에 최대 50건)
import { googleNews, dedupeByTitle } from './_google.js';
import { STOCKS } from './_stocks.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const NAVER = 'https://m.stock.naver.com/api';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const NEWS_MAX = 100, KR_NEWS_PAGE = 20, US_NEWS_PAGE = 50, GOOGLE_MAX = 50, LIST_SIZE = 50;

const stripTags = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

// 종목명으로 Google 뉴스 검색 (검색어는 서버의 종목 목록에서만 만듦)
function stockGoogleNews(code) {
  const s = STOCKS.find(x => x.code === code);
  if (!s) return Promise.resolve([]);
  return googleNews(`"${s.name}" (주가 OR 주식 OR 실적 OR 공시)`, { when: '7d', max: GOOGLE_MAX });
}

// 네이버 뉴스(+구글)를 합쳐 최신순 NEWS_MAX건. 한쪽이 실패해도 나머지로 응답
async function mergeNews(naverPages, google) {
  const results = await Promise.allSettled([...naverPages, google]);
  if (results.every(r => r.status === 'rejected')) throw results[0].reason;
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  return dedupeByTitle(items)
    .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))
    .slice(0, NEWS_MAX);
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
    url: `https://m.stock.naver.com/research/company/${r.researchId}`,
  }));
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

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').trim();
  const type = String(req.query.type ?? '');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const handlers = isDomestic(code) ? HANDLERS : isUs(code) ? US_HANDLERS : null;
  if (!handlers || !handlers[type]) {
    return res.status(400).json({ error: 'code 또는 type이 올바르지 않습니다' });
  }
  // 뉴스·시세 정보는 1분, 나머지는 10분 캐시
  res.setHeader('Cache-Control', type === 'news' || type === 'info' ? 's-maxage=60, stale-while-revalidate=60' : 's-maxage=600, stale-while-revalidate=600');

  try {
    res.json({ code, type, data: await handlers[type](code) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
