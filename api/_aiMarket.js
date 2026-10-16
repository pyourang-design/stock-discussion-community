// AI 운영자 시장·업종 정기 글 (숫자로 표 + 규칙 기반 문장, AI API 없음) — api/_ai.js runOnce가 5분마다 호출
//   🌅 장 시작 전 체크  (주식 시장 경제 게시판 SECMKT, 거래일 08:30~)  간밤 미국 증시·반도체·빅테크·환율·유가·금리
//   🔔 업종 장 마감 성적표 (업종 게시판 SEC***, 거래일 15:40~ 한 번에 한 업종)  평균 등락·상승/하락 수·TOP5
//   🔔 장 마감 시황 (SECMKT, 업종 성적표가 다 나간 뒤)  지수·투자자별 매매·상승/하락 종목 수·업종 순위
//   📋 업종 주요 공시 모음 (업종 게시판, 19:00~ 한 번에 한 업종)  16~19시에 DART 공시를 훑어 모아 둔 것
// DB 키: ai:mk:{날짜}:{일} 한 번만 하기 표시, ai:mk:{날짜}:sec 업종별 성적(hash), ai:disc:{날짜} 모은 공시(hash rcept→JSON), ai:discscan:{날짜} 훑기 위치
import { redis } from './_redis.js';
import { STOCKS, SECTORS } from './_stocks.js';
import { CORP_CODES } from './_corpcodes.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/', Accept: 'application/json' };
const MARKET_BOARD = 'SECMKT';
const boardCode = key => 'SEC' + key.slice(0, 3).toUpperCase();  // app.js boardCode와 같음
const KR_SECTORS = SECTORS.filter(s => s.key !== 'usa');
const CORP = new Map(CORP_CODES);

// 한국거래소 휴장일 (주말 제외) — 해마다 12월에 다음 해 것을 추가
const KRX_HOLIDAYS = new Set([
  '20261225', '20261231',
  '20270101', '20270208', '20270209', '20270301', '20270505', '20270513', '20270816', '20270914', '20270915', '20270916', '20271004', '20271011', '20271231',
]);
const kst = ts => new Date(ts + 9 * 3600e3);
const ymd = ts => kst(ts).toISOString().slice(0, 10).replace(/-/g, '');
export const isTradingDay = ts => { const d = kst(ts).getUTCDay(); return d !== 0 && d !== 6 && !KRX_HOLIDAYS.has(ymd(ts)); };

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const num = v => { const n = Number(String(v ?? '').replace(/[,+]/g, '')); return Number.isFinite(n) ? n : null; };
// '3조 2,891억' → 억 원
const eokOf = s => { const m = String(s || '').match(/(?:([\d,]+)조)?\s*(?:([\d,]+)억)?/); return m ? (num(m[1]) || 0) * 10000 + (num(m[2]) || 0) : 0; };
const signed = (x, d = 2, unit = '%') => x == null ? '−' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}${unit}`;
const won = n => Math.round(n).toLocaleString('en-US');
const eokText = e => Math.abs(e) >= 10000 ? `${(Math.abs(e) / 10000).toFixed(1).replace(/\.0$/, '')}조` : `${won(Math.abs(e))}억`;
const flowText = e => e == null ? '−' : `${e > 0 ? '+' : e < 0 ? '−' : ''}${won(Math.abs(e))}`;
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const picker = r => arr => arr[Math.floor(r() * arr.length)];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// ── 🌅 장 시작 전 체크 ──
const US_IDX = [['.DJI', '다우존스'], ['.IXIC', '나스닥'], ['.INX', 'S&P 500'], ['.SOX', '필라델피아 반도체']];
const US_STOCKS = [['NVDA.O', '엔비디아'], ['TSLA.O', '테슬라'], ['AAPL.O', '애플'], ['MSFT.O', '마이크로소프트'], ['AVGO.O', '브로드컴']];
const MACRO = [['exchange/FX_USDKRW', '원·달러 환율', '원'], ['energy/CLcv1', 'WTI 유가', '달러'], ['metals/GCcv1', '국제 금', '달러'], ['bond/US10YT=RR', '미국 10년물 금리', '%']];

export async function buildMorning(now) {
  const [idx, stk, ...mac] = await Promise.all([
    getJson(`https://polling.finance.naver.com/api/realtime/worldstock/index/${US_IDX.map(x => x[0]).join(',')}`),
    getJson(`https://polling.finance.naver.com/api/realtime/worldstock/stock/${US_STOCKS.map(x => x[0]).join(',')}`),
    ...MACRO.map(m => getJson(`https://api.stock.naver.com/marketindex/${m[0]}`).catch(() => null)),
  ]);
  const by = Object.fromEntries([...(idx.datas || []), ...(stk.datas || [])].map(d => [d.reutersCode, d]));
  const q = code => { const d = by[code]; return d ? { price: num(d.closePrice), rate: num(d.fluctuationsRatio), at: d.localTradedAt } : null; };
  const I = Object.fromEntries(US_IDX.map(([c]) => [c, q(c)]));
  if (!I['.IXIC']?.price) return { skip: '미국 지수 없음' };
  const M = mac.map((j, i) => { const x = j && (j.exchangeInfo || j.energyInfo || j.metalsInfo || j.bondInfo || j); return x ? { name: MACRO[i][1], unit: MACRO[i][2], price: num(x.closePrice), rate: num(x.fluctuationsRatio), diff: num(x.fluctuations ?? x.compareToPreviousClosePrice) } : null; });
  const [fx, wti, gold, us10] = M;

  // 미국 거래일: 월요일 아침이면 '지난 금요일'
  const usDate = String(I['.IXIC'].at || '').slice(0, 10);
  const usDay = usDate ? DAYS[new Date(usDate + 'T12:00:00Z').getUTCDay()] : '';
  const yesterday = kst(now - 86400e3).toISOString().slice(0, 10);
  const when = usDate && usDate !== yesterday ? `지난 ${usDay}요일` : '간밤';
  const r = rng(`am:${ymd(now)}`), pick = picker(r);
  const nas = I['.IXIC'].rate, dji = I['.DJI']?.rate, spx = I['.INX']?.rate, sox = I['.SOX']?.rate;
  const ups = [nas, dji, spx].filter(x => x > 0).length;
  const mood = ups === 3 ? (nas >= 1 ? 'strong' : 'up') : ups === 0 ? (nas <= -1 ? 'weak' : 'down') : 'mixed';
  const v = { when, nas: signed(nas), dji: signed(dji), spx: signed(spx), sox: signed(sox),
    fx: fx?.price ? won(fx.price) : '', fxc: fx ? signed(fx.rate) : '', wti: wti?.price?.toFixed(2), wtic: wti ? signed(wti.rate) : '',
    gold: gold?.price ? won(gold.price) : '', us10: us10?.price?.toFixed(2) };
  const HEAD = {
    strong: ['{when} 뉴욕 증시 강세, 나스닥 {nas}', '{when} 미국 3대 지수 일제히 상승, 나스닥 {nas}', '뉴욕 증시 동반 강세 마감, 나스닥 {nas}'],
    up: ['{when} 뉴욕 증시 상승 마감', '{when} 미국 3대 지수 모두 올라', '뉴욕 증시 소폭 상승, 나스닥 {nas}'],
    mixed: ['{when} 뉴욕 증시 혼조 마감', '뉴욕 증시 엇갈린 흐름, 나스닥 {nas}', '{when} 미국 증시 지수별 엇갈려'],
    down: ['{when} 뉴욕 증시 하락 마감', '{when} 미국 3대 지수 모두 내려', '뉴욕 증시 소폭 하락, 나스닥 {nas}'],
    weak: ['{when} 뉴욕 증시 약세, 나스닥 {nas}', '{when} 미국 3대 지수 동반 하락, 나스닥 {nas}', '뉴욕 증시 약세 마감, 나스닥 {nas}'],
  };
  let headline = fill(pick(HEAD[mood]), v);
  if (Math.abs(sox ?? 0) >= 2) headline += `, 반도체 지수 ${v.sox}`;
  const paras = [];
  paras.push(fill(pick([
    '{when} 미국 증시는 다우 {dji}, 나스닥 {nas}, S&P 500 {spx}로 마감했습니다.',
    '{when} 뉴욕 증시에서 나스닥은 {nas}, S&P 500은 {spx}, 다우는 {dji} 움직였습니다.',
    '미국 3대 지수 마감: 다우 {dji} · 나스닥 {nas} · S&P 500 {spx}.',
  ]), v));
  if (sox != null) paras.push(fill(Math.abs(sox) >= 2
    ? pick(['필라델피아 반도체 지수가 {sox} 크게 움직여, 오늘 국내 반도체주 흐름에 관심이 모입니다.', '반도체 지수는 {sox}로 변동이 컸습니다. 국내 반도체 종목 개장 흐름을 지켜볼 만합니다.'])
    : pick(['필라델피아 반도체 지수는 {sox}였습니다.', '반도체 지수는 {sox}로 마감했습니다.']), v));
  const big = US_STOCKS.map(([c, n]) => q(c) ? `${n} ${signed(q(c).rate)}` : null).filter(Boolean);
  if (big.length) paras.push(`주요 빅테크: ${big.join(', ')}.`);
  const macro = [fx?.price && `원·달러 환율 ${v.fx}원(${v.fxc})`, wti?.price && `WTI ${v.wti}달러(${v.wtic})`, gold?.price && `금 ${v.gold}달러`, us10?.price && `미국 10년물 금리 ${v.us10}%`].filter(Boolean);
  if (macro.length) paras.push(pick(['환율·원자재·금리: ', '그 밖의 지표: ']) + macro.join(', ') + '.');
  const notes = [];
  if (Math.abs(wti?.rate ?? 0) >= 3) notes.push(`유가가 ${v.wtic} 크게 움직여 정유·항공·화학 업종 흐름도 볼 만합니다.`);
  if (Math.abs(fx?.rate ?? 0) >= 0.5) notes.push(`환율 변동(${v.fxc})이 커서 외국인 수급과 수출주 흐름에 관심이 필요합니다.`);
  if (notes.length) paras.push(notes.join(' '));
  paras.push('👉 ' + pick(['오늘 국내 증시, 어떻게 보시나요?', '오늘 장에서 주목하는 업종이나 종목이 있으신가요?', '간밤 미국 증시 흐름, 오늘 우리 시장에 어떤 영향이 있을까요?']));

  const row = (name, x, unit = '') => [name, x?.price == null ? '−' : unit === '%' ? x.price.toFixed(2) : x.price >= 1000 ? won(x.price) : x.price.toFixed(2), signed(x?.rate)];
  const tables = [
    { title: `미국 증시 (${usDate ? `${usDate.slice(5).replace('-', '/')} ${usDay}` : '최근'} 마감)`, unit: '포인트·달러', cols: ['', '종가', '증감'], rows: [...US_IDX.map(([c, n]) => row(n, I[c])), ...US_STOCKS.map(([c, n]) => row(n, q(c)))] },
    { title: '환율·원자재·금리', unit: '원·달러·%', cols: ['', '현재', '증감'], rows: M.filter(Boolean).map(m => row(m.name, m, m.unit)) },
  ];
  return {
    code: MARKET_BOARD, headline: `🌅 [장 시작 전] ${headline}`, tables, content: paras.join('\n\n'),
    summary: `나스닥 ${v.nas} · S&P 500 ${v.spx} · 반도체 ${v.sox}${fx?.price ? ` · 환율 ${v.fx}원` : ''}`,
    src: { label: '네이버 증권 시세', url: 'https://m.stock.naver.com/worldstock/' },
  };
}

// ── 🔔 업종 장 마감 성적표 ──
export async function buildSectorClose(key, now, kospiRate) {
  const sec = KR_SECTORS.find(s => s.key === key);
  const list = STOCKS.filter(s => s.sectors?.[key]);
  const j = await getJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${list.map(s => s.code).join(',')}`);
  const today = kst(now).toISOString().slice(0, 10);
  const rows = (j.datas || []).filter(d => String(d.localTradedAt || '').slice(0, 10) === today)  // 오늘 거래된 종목만 (거래정지 제외)
    .map(d => ({ code: d.itemCode, name: d.stockName, price: num(d.closePrice), rate: num(d.fluctuationsRatio), value: eokOf(d.accumulatedTradingValue) }))
    .filter(x => x.price != null && x.rate != null);
  if (rows.length < 5) return { skip: '시세 부족' };
  const n = rows.length, avg = rows.reduce((a, x) => a + x.rate, 0) / n;
  const up = rows.filter(x => x.rate > 0).length, down = rows.filter(x => x.rate < 0).length;
  const byRate = [...rows].sort((a, b) => b.rate - a.rate);
  const top = byRate.filter(x => x.rate > 0).slice(0, 5), bottom = byRate.filter(x => x.rate < 0).slice(-5).reverse();  // 오른 종목·내린 종목만
  const vol = [...rows].sort((a, b) => b.value - a.value)[0];
  const name = sec.name, r = rng(`sec:${key}:${ymd(now)}`), pick = picker(r);
  const mood = avg >= 2 ? 'strong' : avg >= 0.3 ? 'up' : avg > -0.3 ? 'flat' : avg > -2 ? 'down' : 'weak';
  const hi = byRate[0], lo = byRate.at(-1);
  const v = { name, sec: `${name} 업종`, avg: signed(avg), n, up, down, t1: hi.name, t1c: signed(hi.rate), b1: lo.name, b1c: signed(lo.rate),
    vol: vol.name, volAmt: eokText(vol.value), volc: signed(vol.rate), kospi: signed(kospiRate) };
  const HEAD = {
    strong: ['{sec} 평균 {avg} 강세, {t1} {t1c}', '{sec} 강세 마감, {n}종목 중 {up}개 상승', '{name} 업종 동반 강세, 평균 {avg}'],
    up: ['{sec} 평균 {avg} 상승 마감', '{sec} 오름세, {t1} {t1c}로 상승률 1위', '{name} 업종 {up}개 종목 상승, 평균 {avg}'],
    flat: ['{sec} 보합권 마감, 평균 {avg}', '{sec} 종목별 엇갈린 하루', '{name} 업종 등락 엇갈려, 상승 {up}·하락 {down}'],
    down: ['{sec} 평균 {avg} 하락 마감', '{sec} 약보합, {b1} {b1c}', '{name} 업종 {down}개 종목 하락, 평균 {avg}'],
    weak: ['{sec} 평균 {avg} 약세', '{sec} 약세 마감, {n}종목 중 {down}개 하락', '{name} 업종 동반 약세, {b1} {b1c}'],
  };
  const paras = [
    fill(pick([
      '오늘 {sec}(사이트 선정 {n}종목)은 평균 {avg}로 마감했습니다. 오른 종목 {up}개, 내린 종목 {down}개입니다.',
      '{sec} {n}종목의 평균 등락률은 {avg}입니다. 상승 {up}개, 하락 {down}개로 마감했습니다.',
      '{n}개 종목 가운데 {up}개가 오르고 {down}개가 내리며, {sec} 평균은 {avg}를 기록했습니다.',
    ]), v),
    fill(pick([
      '가장 많이 오른 종목은 {t1}({t1c})이고, 가장 많이 내린 종목은 {b1}({b1c})입니다.',
      '상승률 1위는 {t1}({t1c}), 하락률 1위는 {b1}({b1c})였습니다.',
      '{t1}가 {t1c}로 가장 강했고, {b1}는 {b1c}로 가장 약했습니다.',
    ]), v),
    fill(pick(['거래대금은 {vol}가 {volAmt} 원으로 가장 많았습니다({volc}).', '돈이 가장 많이 몰린 종목은 {vol}(거래대금 {volAmt} 원, {volc})입니다.']), v),
  ];
  if (kospiRate != null) paras.push(fill(Math.abs(avg - kospiRate) < 0.3 ? '같은 날 코스피({kospi})와 비슷한 흐름이었습니다.'
    : avg > kospiRate ? pick(['같은 날 코스피({kospi})보다 강한 흐름이었습니다.', '코스피({kospi})와 비교하면 업종이 더 강했습니다.'])
    : pick(['같은 날 코스피({kospi})보다 약한 흐름이었습니다.', '코스피({kospi})와 비교하면 업종이 더 약했습니다.']), v));
  paras.push('👉 ' + pick(mood === 'strong' || mood === 'up' ? ['이 흐름, 내일도 이어질까요?', '오늘 강했던 종목, 어떻게 보시나요?', '업종 상승의 이유, 여러분 생각은 어떠신가요?']
    : mood === 'flat' ? ['방향을 못 정한 업종, 다음 움직임은 어느 쪽일까요?', '오늘 눈에 띈 종목이 있으셨나요?']
    : ['약세가 이어질까요, 반등할까요?', '오늘 하락, 매수 기회로 보시나요?', '업종 약세의 이유, 어떻게 보시나요?']));
  const fixJ = s => s.replace(/([가-힣A-Za-z0-9&·]+)(가|는|이고|이|은)(?=[ (,])/g, (m, w, j) => STOCK_NAMES.has(w) ? w + (j === '가' || j === '이' ? josa(w, '이', '가') : j === '는' || j === '은' ? josa(w, '은', '는') : josa(w, '이고', '고')) : m);
  const tbl = (title, arr) => ({ title, unit: '원·%', cols: ['', '종가', '증감'], rows: arr.map(x => [x.name, won(x.price), signed(x.rate)]) });
  return {
    code: boardCode(key), headline: `🔔 [장 마감] ${fill(pick(HEAD[mood]), v)}`,
    tables: [top.length && tbl(`상승률 TOP ${top.length}`, top), bottom.length && tbl(`하락률 TOP ${bottom.length}`, bottom)].filter(Boolean),
    content: fixJ(paras.join('\n\n')),
    summary: `평균 ${v.avg} · 상승 ${up} / 하락 ${down} · 1위 ${v.t1} ${v.t1c}`,
    src: { label: '네이버 증권 시세 (사이트 선정 종목 기준)', url: `https://upjong.com/?sector=${key}` },
    stat: { name: `${name}`, avg, up, down, n },
  };
}
const STOCK_NAMES = new Set(STOCKS.map(s => s.name));

// ── 🔔 장 마감 시황 ──
export async function buildMarketClose(now, secStats) {
  const [pol, ks, kq, fxj] = await Promise.all([
    getJson('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ'),
    getJson('https://m.stock.naver.com/api/index/KOSPI/integration'),
    getJson('https://m.stock.naver.com/api/index/KOSDAQ/integration'),
    getJson('https://api.stock.naver.com/marketindex/exchange/FX_USDKRW').catch(() => null),
  ]);
  const by = Object.fromEntries((pol.datas || []).map(d => [d.itemCode, d]));
  const today = kst(now).toISOString().slice(0, 10);
  if (String(by.KOSPI?.localTradedAt || '').slice(0, 10) !== today) return { skip: '오늘 거래 없음' };
  const idx = (code, integ) => ({
    price: num(by[code].closePrice), rate: num(by[code].fluctuationsRatio), diff: num(by[code].compareToPreviousClosePrice),
    value: num(by[code].accumulatedTradingValueRaw) / 1e8,
    p: num(integ.dealTrendInfo?.personalValue), f: num(integ.dealTrendInfo?.foreignValue), i: num(integ.dealTrendInfo?.institutionalValue),
    up: (num(integ.upDownStockInfo?.riseCount) || 0) + (num(integ.upDownStockInfo?.upperCount) || 0),
    down: (num(integ.upDownStockInfo?.fallCount) || 0) + (num(integ.upDownStockInfo?.lowerCount) || 0),
  });
  const K = idx('KOSPI', ks), Q = idx('KOSDAQ', kq);
  const fx = fxj?.exchangeInfo || fxj;
  const r = rng(`mk:${ymd(now)}`), pick = picker(r);
  const mood = K.rate >= 1.5 ? 'strong' : K.rate >= 0.2 ? 'up' : K.rate > -0.2 ? 'flat' : K.rate > -1.5 ? 'down' : 'weak';
  const flowWord = x => x > 0 ? '순매수' : '순매도';
  const v = { k: K.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), kc: signed(K.rate), q: Q.price.toFixed(2), qc: signed(Q.rate),
    kf: eokText(K.f), kfw: flowWord(K.f), ki: eokText(K.i), kiw: flowWord(K.i), kp: eokText(K.p), kpw: flowWord(K.p), kup: K.up, kdown: K.down,
    fx: fx ? won(num(fx.closePrice)) : '', fxc: fx ? signed(num(fx.fluctuationsRatio)) : '' };
  const HEAD = {
    strong: ['코스피 {kc} 급등, {k} 마감', '코스피 강세 {kc}, 외국인 {kf} 원 {kfw}', '증시 큰 폭 상승, 코스피 {kc}·코스닥 {qc}'],
    up: ['코스피 {kc} 상승, {k} 마감', '코스피 오름세 {kc}, 코스닥 {qc}', '코스피·코스닥 상승 마감'],
    flat: ['코스피 보합 {kc}, {k} 마감', '코스피 제자리걸음, 코스닥 {qc}', '방향 탐색한 증시, 코스피 {kc}'],
    down: ['코스피 {kc} 하락, {k} 마감', '코스피 내림세 {kc}, 외국인 {kf} 원 {kfw}', '코스피·코스닥 하락 마감'],
    weak: ['코스피 {kc} 급락, {k} 마감', '증시 큰 폭 하락, 코스피 {kc}·코스닥 {qc}', '코스피 약세 {kc}, 외국인 {kf} 원 {kfw}'],
  };
  const paras = [
    fill(pick(['오늘 코스피는 {k}({kc}), 코스닥은 {q}({qc})로 마감했습니다.', '코스피 {kc}, 코스닥 {qc}. 코스피는 {k}, 코스닥은 {q}에 장을 마쳤습니다.', '코스피가 {kc} 움직이며 {k}에, 코스닥은 {qc} 움직이며 {q}에 마감했습니다.']), v),
    fill(pick(['코스피에서 외국인은 {kf} 원 {kfw}, 기관은 {ki} 원 {kiw}, 개인은 {kp} 원 {kpw}했습니다.', '수급을 보면 코스피 외국인 {kf} 원 {kfw}, 기관 {ki} 원 {kiw}, 개인 {kp} 원 {kpw}입니다.']), v),
    fill(pick(['코스피 종목 중 {kup}개가 오르고 {kdown}개가 내렸습니다.', '코스피 상승 종목 {kup}개, 하락 종목 {kdown}개입니다.']), v),
  ];
  const secs = Object.values(secStats || {}).sort((a, b) => b.avg - a.avg);
  if (secs.length >= 2) paras.push(fill(pick(['업종별로는 {best}({bc})가 가장 강했고, {worst}({wc})가 가장 약했습니다.', '사이트 업종 중 {best}({bc})가 1위, {worst}({wc})가 꼴찌였습니다.']),
    { best: secs[0].name, bc: signed(secs[0].avg), worst: secs.at(-1).name, wc: signed(secs.at(-1).avg) }).replace(/([가-힣·]+)\((.*?)\)가/, (m, w, c) => `${w}(${c})${josa(w, '이', '가')}`));
  if (v.fx) paras.push(fill('원·달러 환율은 {fx}원({fxc})입니다.', v));
  paras.push('👉 ' + pick(mood === 'strong' || mood === 'up' ? ['오늘 상승, 내일도 이어질까요?', '오늘 장 어떠셨나요? 수익 나신 분들 계신가요?', '상승을 이끈 업종, 어떻게 보시나요?']
    : mood === 'flat' ? ['방향을 못 잡은 증시, 내일은 어느 쪽일까요?', '오늘 장 어떠셨나요?']
    : ['오늘 하락, 매수 기회일까요?', '하락 마감, 내일 반등할까요?', '오늘 장 어떠셨나요? 의견 나눠 주세요.']));
  const tables = [
    { title: '지수', unit: '포인트·%', cols: ['', '종가', '증감', '상승', '하락'], rows: [['코스피', v.k, signed(K.rate), String(K.up), String(K.down)], ['코스닥', v.q, signed(Q.rate), String(Q.up), String(Q.down)]] },
    { title: '투자자별 순매수', unit: '억 원', cols: ['', '개인', '외국인', '기관'], rows: [['코스피', flowText(K.p), flowText(K.f), flowText(K.i)], ['코스닥', flowText(Q.p), flowText(Q.f), flowText(Q.i)]] },
  ];
  if (secs.length) tables.push({ title: '사이트 업종별 평균 등락', unit: '%', cols: ['', '상승', '하락', '증감'], rows: secs.map(s => [s.name, String(s.up), String(s.down), signed(s.avg)]) });
  return {
    code: MARKET_BOARD, headline: `🔔 [장 마감 시황] ${fill(pick(HEAD[mood]), v)}`, tables, content: paras.join('\n\n'),
    summary: `코스피 ${v.k} (${v.kc}) · 코스닥 ${v.q} (${v.qc}) · 외국인 ${flowText(K.f)}억`,
    src: { label: '네이버 증권 (지수·투자자별 매매)', url: 'https://m.stock.naver.com/domestic/index/KOSPI/total' },
  };
}

// ── 📋 업종 주요 공시 ──
const DISC = [
  [/횡령|배임|불성실공시|상장폐지|거래정지|매매거래정지|감사의견|관리종목|회생절차|부도/, '⚠️ 주의'],
  [/담보제공/, null],
  [/단일판매|공급계약/, '공급계약'],
  [/무상증자/, '무상증자'],
  [/유상증자/, '유상증자'],
  [/전환사채|신주인수권부사채|교환사채/, '사채 발행'],
  [/자기주식.*처분/, '자사주 처분'],
  [/자기주식|주식소각/, '자사주'],
  [/배당/, '배당'],
  [/잠정|영업실적|매출액또는손익구조/, '실적'],
  [/임상|품목허가|기술이전|라이선스|특허/, '임상·허가·특허'],
  [/합병|분할|영업양수|영업양도|자산양수|자산양도/, '합병·분할·양수도'],
  [/타법인주식|출자증권/, '지분 취득'],
  [/신규시설투자|시설투자/, '시설투자'],
  [/최대주주.*변경|최대주주변경/, '최대주주 변경'],
  [/투자판단|주요경영사항/, '주요 경영사항'],
  [/기업설명회/, 'IR 개최'],
];
export function classifyDisclosure(reportNm) {
  if (/^\[/.test(reportNm)) return null;  // [기재정정]·[첨부추가] 등은 뺌
  for (const [re, label] of DISC) if (re.test(reportNm)) return label;
  return null;
}
async function scanDisclosures(now, dart, log) {
  const day = ymd(now), stKey = `ai:discscan:${day}`;
  const [raw] = await redis([['GET', stKey]]);
  const combos = [['B', 'Y'], ['B', 'K'], ['I', 'Y'], ['I', 'K']];
  let st = raw ? JSON.parse(raw) : { c: 0, page: 1, cycleAt: 0 };
  if (st.c >= combos.length) { if (now - st.cycleAt < 30 * 60e3) return; st = { c: 0, page: 1, cycleAt: 0 }; }  // 30분마다 처음부터 다시 (새 공시)
  for (let k = 0; k < 2 && st.c < combos.length; k++) {
    const [ty, cls] = combos[st.c];
    const j = await dart('list.json', { bgn_de: day, end_de: day, pblntf_ty: ty, corp_cls: cls, page_no: String(st.page), page_count: '100' });
    const items = (j.status === '000' ? j.list : []).filter(x => CORP.has(x.stock_code)).map(x => ({ code: x.stock_code, label: classifyDisclosure(x.report_nm), nm: x.report_nm.replace(/\s+/g, ' ').trim(), rcept: x.rcept_no })).filter(x => x.label);
    if (items.length) await redis([['HSET', `ai:disc:${day}`, ...items.flatMap(x => [x.rcept, JSON.stringify(x)])], ['EXPIRE', `ai:disc:${day}`, 3 * 86400]]);
    if (j.status !== '000' || st.page >= Number(j.total_page || 1)) { st.c++; st.page = 1; } else st.page++;
    if (st.c >= combos.length) st.cycleAt = now;
  }
  await redis([['SET', stKey, JSON.stringify(st), 'EX', 2 * 86400]]);
}
export function buildDisclosurePost(key, items, now) {
  const sec = KR_SECTORS.find(s => s.key === key);
  const name = s => STOCKS.find(x => x.code === s)?.name || s;
  const list = items.filter(x => STOCKS.find(s => s.code === x.code)?.sectors?.[key]).map(x => ({ ...x, nm: String(x.nm).replace(/\s+/g, ' ').trim() }));
  if (!list.length) return null;
  const order = DISC.map(d => d[1]);
  list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  const counts = {};
  for (const x of list) counts[x.label] = (counts[x.label] || 0) + 1;
  const r = rng(`disc:${key}:${ymd(now)}`), pick = picker(r);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const v = { sec: `${sec.name} 업종`, n: list.length, cats: top.map(([k, c]) => `${k} ${c}건`).join(', ') };
  const paras = [fill(pick(['오늘 {sec} 종목들의 주요 공시는 {n}건입니다. ({cats})', '{sec}에서 오늘 나온 주요 공시 {n}건을 모았습니다. 종류별로는 {cats}입니다.', '오늘 {sec} 주요 공시: 모두 {n}건 ({cats}).']), v)];
  const namesOf = label => [...new Set(list.filter(x => x.label === label).map(x => name(x.code)))];
  const LINE = {
    '공급계약': ['공급계약 체결 공시가 {names}에서 나왔습니다.', '{names}가 공급계약 체결을 공시했습니다.'],
    '유상증자': ['{names}가 유상증자를 공시했습니다. 주식 수가 늘어나는 결정이라 조건을 확인해 볼 필요가 있습니다.'],
    '무상증자': ['{names}가 무상증자를 공시했습니다.'],
    '사채 발행': ['{names}가 전환사채 등 사채 발행을 공시했습니다.'],
    '자사주': ['{names}가 자사주 취득·소각 관련 공시를 냈습니다.', '자사주 관련 공시: {names}.'],
    '배당': ['{names}가 배당 결정을 공시했습니다.'],
    '실적': ['{names}가 실적 관련 공시를 냈습니다.'],
    '임상·허가·특허': ['임상·허가·특허 관련 공시: {names}.'],
    '⚠️ 주의': ['⚠️ {names}에서 투자 주의가 필요한 공시가 나왔습니다. 원문을 꼭 확인하세요.'],
  };
  for (const [label] of top) if (LINE[label]) {
    const ns = namesOf(label);
    const names = ns.slice(0, 3).join(', ') + (ns.length > 3 ? ` 등 ${ns.length}개 종목` : '');
    paras.push(fill(pick(LINE[label]), { names }).replace(/([가-힣A-Za-z0-9&·]+)가 /, (m, w) => STOCK_NAMES.has(w) ? `${w}${josa(w, '이', '가')} ` : m));
    if (paras.length >= 4) break;
  }
  paras.push('👉 ' + pick(['오늘 공시 중 눈여겨볼 만한 게 있으신가요?', '이 공시들, 주가에 어떤 영향이 있을까요?', '관심 종목 공시가 있다면 의견 나눠 주세요.']));
  const rows = list.slice(0, 30).map(x => [name(x.code), { t: x.label, u: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept}` }, { t: x.nm.length > 28 ? x.nm.slice(0, 27) + '…' : x.nm, u: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.rcept}` }]);
  return {
    code: boardCode(key), headline: `📋 [오늘의 공시] ${sec.name} 업종 주요 공시 ${list.length}건${counts['⚠️ 주의'] ? ' (주의 공시 포함)' : ''}`,
    tables: [{ title: `주요 공시 ${list.length}건${list.length > 30 ? ' (30건까지)' : ''}`, unit: '누르면 DART 원문', cols: ['종목', '종류', '공시'], rows }],
    content: paras.join('\n\n'),
    summary: v.cats,
    src: { label: 'DART 전자공시 (오늘 제출)', url: 'https://dart.fss.or.kr/dsac001/mainAll.do' },
  };
}

// ── 예약 실행: 시간대별로 할 일 한 가지씩 ──
const MARKET_ON = true;  // 끄려면 false (미리보기는 /api/ai {op:'previewMarket'})
export async function runMarketTasks(now, { dart, savePost }, log) {
  if (!MARKET_ON || !isTradingDay(now)) return;
  const t = kst(now), hm = t.getUTCHours() * 100 + t.getUTCMinutes(), day = ymd(now), k = s => `ai:mk:${day}:${s}`;
  const once = async (name, fn) => {
    const [ok] = await redis([['SET', k(name), '1', 'NX', 'EX', 2 * 86400]]);
    if (ok !== 'OK') return false;
    try {
      const p = await fn();
      if (p && !p.skip) { await savePost(p, { mark: false }); log.push(`시장글 ${p.code} ${p.headline}`); }
      else log.push(`시장글 ${name} 건너뜀: ${p?.skip || '내용 없음'}`);
    } catch (e) { await redis([['DEL', k(name)]]); log.push(`시장글 ${name} 실패: ${e.message}`); }  // 다음 실행에 다시
    return true;
  };
  if (hm >= 830 && hm < 900) { await once('am', () => buildMorning(now)); return; }
  if (hm >= 1540 && hm < 1800) {
    const [doneRaw, stats] = await redis([['MGET', ...KR_SECTORS.map(s => k(`sec:${s.key}`))], ['HGETALL', k('sec')]]);
    const statObj = {};
    for (let i = 0; i < (stats || []).length; i += 2) statObj[stats[i]] = JSON.parse(stats[i + 1]);
    const next = KR_SECTORS.find((s, i) => !doneRaw[i]);
    if (next) {
      let kospiRate = null;
      try { const p = await getJson('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI'); if (String(p.datas?.[0]?.localTradedAt || '').slice(0, 10) !== kst(now).toISOString().slice(0, 10)) { log.push('오늘 거래 없음'); return; } kospiRate = num(p.datas[0].fluctuationsRatio); } catch {}
      await once(`sec:${next.key}`, async () => {
        const p = await buildSectorClose(next.key, now, kospiRate);
        if (p.stat) await redis([['HSET', k('sec'), next.key, JSON.stringify(p.stat)], ['EXPIRE', k('sec'), 2 * 86400]]);
        return p;
      });
      return;
    }
    if (await once('close', () => buildMarketClose(now, statObj))) return;
  }
  if (hm >= 1600 && hm < 1900) { await scanDisclosures(now, dart, log); return; }
  if (hm >= 1900 && hm < 2200) {
    const [all] = await redis([['HVALS', `ai:disc:${day}`]]);
    const items = (all || []).map(x => JSON.parse(x));
    for (const s of KR_SECTORS) {
      if (await once(`disc:${s.key}`, async () => buildDisclosurePost(s.key, items, now) || { skip: '공시 없음' })) return;
    }
  }
}
