// GET /api/hot?period=d|w|m → 핫이슈 종목 (오늘·주간·월간) — 화면: app.js 핫이슈 창, 홈 한 줄
// 오늘: 급등·신고가·신저가·거래대금·인기 검색은 네이버 실시간 순위(장 시작 전·휴장일은 마지막 장 마감 사진), 오늘 공시는 ai:disc
//       나머지(일봉·수급·리포트)는 장 마감 계산(scripts/hot-daily.mjs) 결과
// 주간·월간: 장 마감 계산의 5·20거래일 결과 + 그동안 저장한 그날 사진(인기 검색·신고가·신저가·공시·뉴스)을 합침
// { period, asOf: { date 장 마감 계산 기준일, live 실시간 순위를 썼는지 }, groups, conds, rows: [{ code, name, price, rate, hits: { 조건: [설명, 정렬값] } }] }
import { redis, dbReady } from './_redis.js';
import { STOCKS } from './_stocks.js';
import { pickPrice } from './_price.js';
import { isTradingDay } from './_aiMarket.js';
import { liveRanks, getJson, kstYmd, HOT_CONDS, HOT_GROUPS, HOT_TOP, HOT_DISC } from './_hot.js';

const LIVE_KEYS = ['surge', 'high52', 'low52', 'value', 'search'];
const WIN = { d: 1, w: 5, m: 20 };

// 그날 사진 여러 개 합치기: 인기 검색은 순위 점수 합, 신고가·신저가·뉴스는 날 수, 공시는 종류 모음
function mergeSnaps(snaps) {
  const acc = {};
  const put = (k, code, f) => { const m = (acc[k] ||= new Map()); m.set(code, f(m.get(code))); };
  for (const s of snaps) {
    for (const [code, , v] of s.search || []) put('search', code, o => ({ n: (o?.n || 0) + 1, v: (o?.v || 0) + v }));
    for (const k of ['high52', 'low52', 'news']) for (const [code] of s[k] || []) put(k, code, o => ({ n: (o?.n || 0) + 1, v: (o?.n || 0) + 1 }));
    for (const [code, label] of s.disc || []) put('disc', code, o => ({ labels: new Set([...(o?.labels || []), label]), v: (o?.v || 0) + 1 }));
  }
  const out = {};
  const name = { search: o => `인기 검색 ${o.n}일`, high52: o => `52주 신고가 ${o.n}회`, low52: o => `52주 신저가 ${o.n}회`, news: o => `뉴스 급증 ${o.n}일`, disc: o => [...o.labels].join('·') };
  for (const [k, m] of Object.entries(acc)) out[k] = [...m].map(([code, o]) => [code, name[k](o), o.v]);
  return out;
}

async function livePrices(codes) {
  const out = {};
  for (let i = 0; i < codes.length; i += 50) {
    const j = await getJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${codes.slice(i, i + 50).join(',')}`).catch(() => null);
    for (const d of j?.datas || []) { const p = pickPrice(d); if (p.price) out[d.itemCode] = { p: p.price, r: p.changeRate }; }
  }
  return out;
}

export default async function handler(req, res) {
  const period = WIN[req.query.period] ? req.query.period : 'd', W = WIN[period];
  if (!dbReady()) return res.status(503).json({ error: 'DB 연결 없음' });
  try {
    const now = Date.now(), hm = Number(new Date(now + 9 * 3600e3).toISOString().slice(11, 16).replace(':', ''));
    const [latest, dates] = await redis([['GET', 'hot:latest'], ['LRANGE', 'hot:dates', 0, W - 1]]);
    const keys = [`hot:day:${latest}`, ...(dates || []).map(d => `hot:snap:${d}`)];
    const [dayRaw, ...snapRaw] = latest ? await redis([['MGET', ...keys]]).then(r => r[0]) : [null];
    const day = dayRaw ? JSON.parse(dayRaw) : { hits: { d: {}, w: {}, m: {} }, stocks: {} };
    const snaps = snapRaw.filter(Boolean).map(x => JSON.parse(x));

    const hits = { ...day.hits[period] };
    const info = { ...day.stocks };
    let live = null;
    if (period === 'd') {
      // 장중·장 마감 후: 네이버 실시간 순위, 장 시작 전·휴장일: 마지막 장 마감 사진
      if (isTradingDay(now) && hm >= 900) live = await liveRanks().catch(() => null);
      if (live?.traded) { for (const k of LIVE_KEYS) hits[k] = live.hits[k]; Object.assign(info, live.info); }
      else { live = null; for (const k of LIVE_KEYS) if (snaps[0]?.[k]) hits[k] = snaps[0][k]; }
      // 공시: 오늘 모인 것 (16시 이후 api/_aiMarket.js가 모음) — 없으면 마지막 사진
      const [disc] = await redis([['HVALS', `ai:disc:${kstYmd(now)}`]]);
      const today = (disc || []).map(x => JSON.parse(x)).filter(x => HOT_DISC.has(x.label));
      hits.disc = today.length ? today.map(x => [x.code, x.label, 1]) : snaps[0]?.disc || [];
      if (snaps[0]?.news) hits.news = snaps[0].news;
    } else {
      // 주간·월간: 일봉으로 계산한 신고가·신저가(사이트 종목)에 그날 사진(시장 전체)을 더함
      const m = mergeSnaps(snaps.slice(0, W));
      for (const k of ['search', 'disc', 'news']) if (m[k]) hits[k] = m[k];
      for (const k of ['high52', 'low52']) {
        const by = new Map((hits[k] || []).map(h => [h[0], h]));
        for (const h of m[k] || []) if (!by.has(h[0])) by.set(h[0], [h[0], h[1], h[2] * 100]);
        hits[k] = [...by.values()];
      }
    }

    // 조건마다 상위 HOT_TOP개 → 종목별로 모음
    const rows = new Map();
    for (const [k] of HOT_CONDS) {
      for (const [code, text, v] of (hits[k] || []).sort((a, b) => b[2] - a[2]).slice(0, HOT_TOP)) {
        if (!rows.has(code)) rows.set(code, { code, hits: {} });
        rows.get(code).hits[k] = [text, v];
      }
    }
    const prices = await livePrices([...rows.keys()]);
    const out = [...rows.values()].map(r => {
      const st = STOCKS.find(s => s.code === r.code), i = info[r.code] || {}, p = prices[r.code] || {};
      return { ...r, name: i.n || st?.name || r.code, price: p.p ?? i.p ?? null, rate: p.r ?? i.r ?? null };
    }).sort((a, b) => Object.keys(b.hits).length - Object.keys(a.hits).length || Math.abs(b.rate || 0) - Math.abs(a.rate || 0));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.json({ period, asOf: { date: day.date || null, live: Boolean(live), snapDays: Math.min(snaps.length, W) }, groups: HOT_GROUPS, conds: HOT_CONDS, rows: out });
  } catch (e) {
    console.error('hot', e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
