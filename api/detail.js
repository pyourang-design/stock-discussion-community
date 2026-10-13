// GET /api/detail?code=068270&type=news|research|disclosure|info
// 종목 상세 모달용 데이터 (네이버 금융 / WISEfn 프록시)
// 미국 종목(code=TSLA.O 등)은 news·info만 (네이버 해외주식)
// 뉴스 = 네이버 최신 100건(50건×2쪽) + Google 뉴스 종목명 검색(최근 7일) → 중복 제거 후 최신순 100건
//        (화면에는 20건씩 '더보기'로 표시)
import { googleNews, dedupeByTitle } from './_google.js';
import { STOCKS } from './_stocks.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const NAVER = 'https://m.stock.naver.com/api';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const NEWS_MAX = 100, NAVER_PAGE = 50, GOOGLE_MAX = 50, LIST_SIZE = 50;

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
  const data = await getJson(`${NAVER}/news/stock/${code}?pageSize=${NAVER_PAGE}&page=${page}`);
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
const news = code => mergeNews([naverNewsPage(code, 1), naverNewsPage(code, 2)], stockGoogleNews(code));

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

// WISEfn 기업개요: 최대주주, 외국인지분율
async function wise(code) {
  const r = await fetch(`https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=${code}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return {};
  const html = await r.text();
  const out = {};
  const fr = html.match(/>외국인지분율<\/th>\s*<td[^>]*>\s*([\d.,]+%)/);
  if (fr) out.foreignOwnership = fr[1];
  const mj = html.match(/<tr class="p_sJJ10">[\s\S]*?title="([^"]*)"[\s\S]*?<td class="line num">([^<]*)<\/td>\s*<td class="noline-right num">([^<]*)</);
  if (mj && mj[1]) out.majorHolder = { name: mj[1].trim(), shares: mj[2].trim(), pct: mj[3].trim() };
  return out;
}

// 종목 정보: 시가총액, 최근 3개년 실적, PER, PBR, 외국인지분율, 최대주주
async function info(code) {
  const [integ, fin, w] = await Promise.all([
    getJson(`${NAVER}/stock/${code}/integration`),
    getJson(`${NAVER}/stock/${code}/finance/annual`).catch(() => null),
    wise(code).catch(() => ({})),
  ]);
  const m = Object.fromEntries((integ.totalInfos ?? []).map(x => [x.code, x]));

  let financials = null;
  const fi = fin?.financeInfo;
  if (fi) {
    const periods = (fi.trTitleList ?? []).filter(p => p.isConsensus === 'N').slice(-3);
    const pick = title => {
      const row = (fi.rowList ?? []).find(r => r.title === title);
      return periods.map(p => row?.columns?.[p.key]?.value ?? '-');
    };
    financials = {
      unit: '억원',
      years: periods.map(p => p.title.replace(/\.$/, '')),
      revenue: pick('매출액'),
      operatingIncome: pick('영업이익'),
      netIncome: pick('당기순이익'),
    };
  }

  return {
    marketCap: m.marketValue?.value ?? '-',
    financials,
    per: m.per?.value ?? '-',
    perDate: m.per?.valueDesc ?? '',
    pbr: m.pbr?.value ?? '-',
    foreignOwnership: w.foreignOwnership ?? null,
    foreignExhaustion: m.foreignRate?.value ?? '-', // 외인소진율 (지분율 조회 실패 시 대체)
    majorHolder: w.majorHolder ?? null,
  };
}

// ── 미국 종목 (네이버 해외주식) ──
const WORLD = 'https://api.stock.naver.com';

const usNewsPage = async (code, page) => {
  const data = await getJson(`${WORLD}/news/worldStock/${code}?pageSize=${NAVER_PAGE}&page=${page}`);
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

// 시총·PER·PBR·52주 최고/최저 등 네이버 해외주식 주요 지표 그대로
async function usInfo(code) {
  const d = await getJson(`${WORLD}/stock/${code}/basic`);
  return {
    us: true,
    industry: d.industryCodeType?.industryGroupKor || null,
    rows: (d.stockItemTotalInfos ?? [])
      .filter(x => x.value && x.value !== 'N/A' && x.code !== 'industryGroupKor')
      .map(x => ({ key: x.key, value: x.value, desc: x.valueDesc || x.keyDesc || '' })),
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
  // 뉴스는 1분, 나머지는 10분 캐시
  res.setHeader('Cache-Control', type === 'news' ? 's-maxage=60, stale-while-revalidate=60' : 's-maxage=600, stale-while-revalidate=600');

  try {
    res.json({ code, type, data: await handlers[type](code) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
