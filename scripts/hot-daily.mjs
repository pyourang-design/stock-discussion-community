// 핫이슈 종목 장 마감 계산 (GitHub Actions .github/workflows/hot-daily.yml — 평일 18:30 KST, 손으로: node scripts/hot-daily.mjs)
// 사이트 업종 종목(국내 약 800개)의 일봉 1년치·투자자별 매매 25일치·종목 뉴스 20건 + 증권사 리포트 목록 + 오늘 모인 공시(ai:disc)로
// 조건마다 오늘(1일)·주간(5거래일)·월간(20거래일) 종목을 골라 DB에 저장 → api/hot.js가 화면에 보여 줌
// 필요한 환경변수: KV_REST_API_URL, KV_REST_API_TOKEN (Upstash)
import { readFileSync } from 'fs';
import { redis } from '../api/_redis.js';
import { STOCKS } from '../api/_stocks.js';
import { isTradingDay } from '../api/_aiMarket.js';
import { liveRanks, getJson, num, kstYmd, HOT_TOP, HOT_DISC } from '../api/_hot.js';

// 손으로 돌릴 때 .dev.vars의 DB 열쇠 사용
if (!process.env.KV_REST_API_URL) {
  try { for (const l of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^(KV_REST_API_\w+)="?([^"\r]*)"?/); if (m) process.env[m[1]] = m[2]; } } catch {}
}

const now = Date.now(), today = kstYmd(now);
const hm = Number(new Date(now + 9 * 3600e3).toISOString().slice(11, 16).replace(':', ''));
if (!isTradingDay(now) && !process.argv.includes('--force')) { console.log(`${today} 휴장일 — 건너뜀`); process.exit(0); }
const closed = hm >= 1540;  // 장 마감 전에 돌리면 오늘 일봉(장중)은 빼고 어제까지로 계산
const WINDOWS = { d: 1, w: 5, m: 20 };
const KR = STOCKS.filter(s => /^[0-9][0-9A-Z]{5}$/.test(s.code));

// 동시에 limit개씩
async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(e => ({ error: e.message })); } }));
  return out;
}
const ymdOf = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const pct = x => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;

async function candles(code) {
  const end = ymdOf(new Date(now + 9 * 3600e3 + 86400e3)), start = ymdOf(new Date(now - 400 * 86400e3));
  const rows = await getJson(`https://api.stock.naver.com/chart/domestic/item/${code}/day?startDateTime=${start}0000&endDateTime=${end}0000`);
  return (rows || []).map(p => ({ d: p.localDate, o: p.openPrice, h: p.highPrice, l: p.lowPrice, c: p.closePrice, v: p.accumulatedTradingVolume, f: p.foreignRetentionRate }))
    .filter(p => [p.o, p.h, p.l, p.c].every(x => x > 0) && (closed || p.d !== today));
}
async function trend(code) {
  const rows = await getJson(`https://m.stock.naver.com/api/stock/${code}/trend?pageSize=25`);
  return (rows || []).map(r => ({ d: r.bizdate, fq: num(r.foreignerPureBuyQuant), oq: num(r.organPureBuyQuant), c: num(r.closePrice) })).filter(r => r.d && (closed || r.d !== today));
}
async function newsList(code) {
  const j = await getJson(`https://m.stock.naver.com/api/news/stock/${code}?pageSize=20&page=1`);
  return (j || []).flatMap(g => g.items || []).map(n => n.datetime).filter(Boolean);
}

// ── 일봉 조건: 기간(마지막 W거래일) 안에 일어났는지 ──
function candleHits(rows) {
  const n = rows.length;
  if (n < 130) return null;
  const C = rows.map(r => r.c), H = rows.map(r => r.h), L = rows.map(r => r.l), V = rows.map(r => r.v);
  const ma = (k, i) => i + 1 >= k ? avg(C.slice(i + 1 - k, i + 1)) : NaN;
  const maxH = (a, b) => Math.max(...H.slice(Math.max(0, a), b)), minL = (a, b) => Math.min(...L.slice(Math.max(0, a), b));
  const volAvg = (a, b) => avg(V.slice(Math.max(0, a), b));
  // RSI(14) 시리즈 (와일더)
  const rsi = new Array(n).fill(NaN);
  let up = 0, dn = 0;
  for (let i = 1; i < n; i++) {
    const d = C[i] - C[i - 1];
    if (i <= 14) { up += Math.max(d, 0); dn += Math.max(-d, 0); if (i === 14) { up /= 14; dn /= 14; rsi[i] = dn ? 100 - 100 / (1 + up / dn) : 100; } continue; }
    up = (up * 13 + Math.max(d, 0)) / 14; dn = (dn * 13 + Math.max(-d, 0)) / 14;
    rsi[i] = dn ? 100 - 100 / (1 + up / dn) : 100;
  }
  const aligned = i => ma(5, i) > ma(20, i) && ma(20, i) > ma(60, i) && ma(60, i) > ma(120, i);
  const streakAt = i => { let k = 0; while (i - k > 0 && C[i - k] > C[i - k - 1]) k++; return k; };
  const low52At = i => { let j = Math.max(0, i - 249); for (let k = j; k <= i; k++) if (L[k] <= L[j]) j = k; return j; };  // 최근 250일 최저가 날
  const cross = (a, b, i) => ma(a, i) > ma(b, i) && ma(a, i - 1) <= ma(b, i - 1);
  const out = {};
  for (const [w, W] of Object.entries(WINDOWS)) {
    const hits = {}, from = n - W;
    const last = (f) => { for (let i = n - 1; i >= from; i--) { const r = f(i); if (r) return r; } return null; };  // 기간 안 가장 최근
    hits.gap = last(i => { const g = rows[i].o / C[i - 1] - 1; return rows[i].o > H[i - 1] && g >= 0.05 ? [`갭 ${pct(g * 100)}`, g * 100] : null; });
    hits.big = last(i => { const b = C[i] / rows[i].o - 1, vr = V[i] / volAvg(i - 20, i); return b >= 0.07 && vr >= 2 ? [`장대양봉 ${pct(b * 100)}`, b * 100] : null; });
    hits.breakout = last(i => {
      if (!(C[i] > maxH(i - 20, i) && C[i - 1] <= maxH(i - 21, i - 1))) return null;
      return C[i] > maxH(i - 60, i) ? ['60일 고점 돌파', 60 + C[i] / maxH(i - 60, i)] : ['20일 고점 돌파', 20 + C[i] / maxH(i - 20, i)];
    });
    hits.align = last(i => aligned(i) && !aligned(i - 1) ? ['정배열 전환', ma(5, i) / ma(120, i)] : null);
    const st = Math.max(...Array.from({ length: W }, (_, k) => streakAt(n - 1 - k)));
    if (st >= 5) hits.streak = [`${st}일 연속 상승`, st];
    let nh = 0, nl = 0;
    // 거래정지(거래량 0)는 빼고, 같은 값은 경신이 아님
    for (let i = from; i < n; i++) { if (!V[i]) continue; if (H[i] > maxH(i - 249, i)) nh++; if (L[i] < minL(i - 249, i)) nl++; }
    if (nh) hits.high52 = [W === 1 ? '52주 신고가' : `52주 신고가 ${nh}회`, nh * 100 + (C[n - 1] / C[n - 2] - 1) * 100];
    if (nl) hits.low52 = [W === 1 ? '52주 신저가' : `52주 신저가 ${nl}회`, nl * 100 - (C[n - 1] / C[n - 2] - 1) * 100];
    hits.golden = W === 1
      ? (() => { for (let i = n - 1; i >= n - 3; i--) if (cross(5, 20, i)) return ['5·20일선 골든크로스', ma(5, n - 1) / ma(20, n - 1)]; return null; })()
      : last(i => cross(20, 60, i) ? ['20·60일선 골든크로스', ma(20, n - 1) / ma(60, n - 1)] : null);
    const vr = W === 1 ? V[n - 1] / volAvg(n - 21, n - 1) : avg(V.slice(n - W)) / volAvg(n - W - 60, n - W);
    if (vr >= (W === 1 ? 3 : 2)) hits.volume = [`거래량 ${vr.toFixed(1)}배`, vr];
    hits.rsi = last(i => rsi[i - 1] < 30 && rsi[i] >= 30 ? [`RSI ${rsi[i - 1].toFixed(0)}→${rsi[i].toFixed(0)} 반등`, 30 - rsi[i - 1]] : null);
    hits.rebound = last(i => { const j = low52At(i); const x = C[i] / L[j], y = C[i - 1] / L[j]; return j >= n - 60 && x >= 1.2 && y < 1.2 ? [`저점 대비 ${pct((x - 1) * 100)}`, x] : null; });
    hits.ma60 = last(i => { const m = ma(60, i); return L[i] <= m * 1.02 && L[i] >= m * 0.98 && C[i] > rows[i].o && C[i] >= m ? ['60일선 지지', C[i] / rows[i].o] : null; });
    if (W > 1) {
      const ret = C[n - 1] / C[n - 1 - W] - 1;
      if (ret >= (W === 5 ? 0.1 : 0.2)) hits.surge = [`${W === 5 ? '주간' : '월간'} ${pct(ret * 100)}`, ret * 100];
      const val = avg(rows.slice(n - W).map(r => r.c * r.v)) / 1e8;
      hits.value = [`거래대금 하루 ${Math.round(val).toLocaleString()}억`, val];
    }
    const fd = rows[n - 1].f - rows[n - 1 - W].f;
    if (Number.isFinite(fd) && fd >= (W === 1 ? 0.2 : W === 5 ? 0.5 : 1)) hits.fhold = [`외국인 보유율 +${fd.toFixed(2)}%p`, fd];
    for (const k of Object.keys(hits)) if (!hits[k]) delete hits[k];
    out[w] = hits;
  }
  return out;
}

// ── 수급: 외국인·기관 연속 순매수 (오늘·주간: 마지막까지 5일 이상 연속, 월간: 20일 중 15일 이상 순매수) — 금액 = 수량 × 그날 종가 ──
function flowHits(rows) {
  if (rows.length < 5) return { d: {}, w: {}, m: {} };
  const out = { d: {}, w: {}, m: {} };
  for (const [key, q, who] of [['foreign', 'fq', '외국인'], ['organ', 'oq', '기관']]) {
    let k = 0; while (k < rows.length && rows[k][q] > 0) k++;
    const amt = rows.slice(0, k).reduce((s, r) => s + r[q] * r.c, 0) / 1e8;
    if (k >= 5) out.d[key] = out.w[key] = [`${who} ${k}일 연속 · ${Math.round(amt).toLocaleString()}억`, amt];
    const m20 = rows.slice(0, 20), days = m20.filter(r => r[q] > 0).length, sum = m20.reduce((s, r) => s + r[q] * r.c, 0) / 1e8;
    if (m20.length === 20 && days >= 15 && sum > 0) out.m[key] = [`${who} 20일 중 ${days}일 · ${Math.round(sum).toLocaleString()}억`, sum];
  }
  return out;
}

// ── 뉴스 급증: 오늘 기사 수가 그 전 하루 평균의 3배 이상 (최근 20건 기준) ──
function newsHit(times) {
  const t = times.filter(x => x.startsWith(today)).length;
  if (t < 5) return null;
  const rest = times.filter(x => !x.startsWith(today));
  if (!rest.length) return [`기사 ${t}건 이상`, t * 10];
  const oldest = rest.at(-1), days = Math.max(1, (Date.parse(`${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`) - Date.parse(`${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-${oldest.slice(6, 8)}`)) / 86400e3);
  const ratio = t / (rest.length / days);
  return ratio >= 3 ? [`기사 ${t}건 · 평소 ${ratio.toFixed(1)}배`, ratio] : null;
}

// ── 리포트 집중: 기간 안 증권사 종목 리포트 건수 (오늘 2건·주간 3건·월간 5건 이상) — 시장 전체 ──
async function reportHits(dates) {
  const since = dates.at(-20), list = [];
  for (let p = 1; p <= 15; p++) {
    const rows = await getJson(`https://m.stock.naver.com/api/research/company?pageSize=100&page=${p}`).catch(() => []);
    list.push(...rows);
    if (!rows.length || rows.at(-1).writeDate.replace(/-/g, '') < since) break;
  }
  const out = { d: {}, w: {}, m: {} }, names = {};
  for (const [w, W, min] of [['d', 1, 2], ['w', 5, 3], ['m', 20, 5]]) {
    const set = new Set(dates.slice(-W)), cnt = {};
    for (const r of list) if (r.itemCode && set.has(r.writeDate.replace(/-/g, ''))) { cnt[r.itemCode] = (cnt[r.itemCode] || 0) + 1; names[r.itemCode] = r.itemName; }
    for (const [code, c] of Object.entries(cnt)) if (c >= min) out[w][code] = [`리포트 ${c}건`, c];
  }
  return { out, names };
}

// ── 실행 ──
const t0 = Date.now();
const results = await pool(KR, 8, async s => {
  const [rows, tr, news] = await Promise.all([candles(s.code), trend(s.code).catch(() => []), closed ? newsList(s.code).catch(() => []) : []]);
  return { s, rows, ch: candleHits(rows), fl: flowHits(tr), news: newsHit(news) };
});
const ok = results.filter(r => r && !r.error && r.rows?.length);
console.log(`일봉 ${ok.length}/${KR.length}종목 (${((Date.now() - t0) / 1000).toFixed(0)}초)`);
if (ok.length < KR.length * 0.8) throw new Error('일봉을 너무 많이 못 받음 — 저장하지 않음');

const ref = ok.find(r => r.s.code === '005930') || ok[0];
const dates = ref.rows.map(r => r.d), date = dates.at(-1);
const { out: rep, names: repNames } = await reportHits(dates);

// 조건별 상위 HOT_TOP개만 [code, 설명, 정렬값]
const stocks = {}, hits = { d: {}, w: {}, m: {} };
const add = (w, k, code, h) => (hits[w][k] ||= []).push([code, h[0], Math.round(h[1] * 100) / 100]);
for (const r of ok) {
  const last = r.rows.at(-1), prev = r.rows.at(-2);
  stocks[r.s.code] = { n: r.s.name, p: last.c, r: Math.round((last.c / prev.c - 1) * 10000) / 100 };
  for (const w of Object.keys(WINDOWS)) {
    for (const [k, h] of Object.entries(r.ch?.[w] || {})) add(w, k, r.s.code, h);
    for (const [k, h] of Object.entries(r.fl[w])) add(w, k, r.s.code, h);
  }
}
for (const w of Object.keys(WINDOWS)) for (const [code, h] of Object.entries(rep[w])) { add(w, 'report', code, h); stocks[code] ||= { n: repNames[code] }; }
for (const w of Object.keys(hits)) for (const k of Object.keys(hits[w])) hits[w][k] = hits[w][k].sort((a, b) => b[2] - a[2]).slice(0, HOT_TOP);
// 주간·월간 거래대금은 조건이 아니라 순위 (모든 종목이 들어가므로 위에서 상위만 남음)

// 그날 사진 (주간·월간 합산용): 네이버 순위(시장 전체) + 공시 + 뉴스 급증
const snap = { date };
if (closed && date === today) {
  const live = await liveRanks().catch(() => null);
  if (live?.traded) { Object.assign(snap, live.hits); for (const [c, x] of Object.entries(live.info)) stocks[c] ||= x; }
  const [disc] = await redis([['HVALS', `ai:disc:${today}`]]);
  snap.disc = (disc || []).map(x => JSON.parse(x)).filter(x => HOT_DISC.has(x.label)).map(x => [x.code, x.label, 1]);
  snap.news = ok.filter(r => r.news).map(r => [r.s.code, ...r.news]).sort((a, b) => b[2] - a[2]).slice(0, HOT_TOP);
  for (const k of ['disc', 'news']) for (const [c] of snap[k]) stocks[c] ||= { n: STOCKS.find(s => s.code === c)?.name || c };
}

const day = { date, at: now, closed, hits, stocks };
const cmds = [['SET', `hot:day:${date}`, JSON.stringify(day), 'EX', 40 * 86400]];
if (snap.disc) cmds.push(['SET', `hot:snap:${date}`, JSON.stringify(snap), 'EX', 40 * 86400], ['LREM', 'hot:dates', 0, date], ['LPUSH', 'hot:dates', date], ['LTRIM', 'hot:dates', 0, 24]);
cmds.push(['SET', 'hot:latest', date]);
const dry = process.argv.includes('--dry');  // 저장하지 않고 결과만 보기
if (!dry) await redis(cmds);
// 화면용 기간별 묶음 hot:cur:{d|w|m} — api/hot.js가 DB를 한 번만 읽도록 (그 기간 조건 + 쓰이는 종목 정보 + 최근 사진 W개)
if (!dry) {
  const [recent] = await redis([['LRANGE', 'hot:dates', 0, 19]]);
  const snapRaw = recent?.length ? (await redis([['MGET', ...recent.map(d => `hot:snap:${d}`)]]))[0] : [];
  const snapsAll = snapRaw.filter(Boolean).map(x => JSON.parse(x));
  await redis(Object.entries(WINDOWS).map(([w, W]) => {
    const sn = snapsAll.slice(0, W);
    const used = new Set([...Object.values(hits[w]).flat(), ...sn.flatMap(s => Object.values(s).filter(Array.isArray).flat())].map(h => h[0]));
    const st = Object.fromEntries([...used].filter(c => stocks[c]).map(c => [c, stocks[c]]));
    return ['SET', `hot:cur:${w}`, JSON.stringify({ date, hits: hits[w], stocks: st, snaps: sn }), 'EX', 40 * 86400];
  }));
}
if (process.argv.includes("--show")) for (const [k, v] of Object.entries(hits.d)) console.log("  d", k, v.slice(0, 3).map(([c, t]) => `${stocks[c]?.n}: ${t}`).join(" / "));
const size = JSON.stringify(day).length;
console.log(`${dry ? '(저장 안 함) ' : '저장: '}hot:day:${date} (${(size / 1024).toFixed(0)}KB)${snap.disc ? ` + hot:snap:${date}` : ' (장 마감 전이라 사진 없음)'}`);
for (const w of Object.keys(hits)) console.log(w, Object.entries(hits[w]).map(([k, v]) => `${k} ${v.length}`).join(', '));
