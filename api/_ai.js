// AI 운영자 자동 글 — DART 실적 숫자로 표와 설명 글을 만듦 (AI API 없이 규칙으로 문장을 고름)
//   소개글: 시가총액 큰 순으로 하루 10개 (한국시간 9~20시, 약 1시간 간격)
//   실적 발표 글: 오늘 제출된 정기보고서(분기·반기·사업보고서)를 훑어 우리 종목이면 그날 올림
//   숨은 종목(업종 탭에 없는 상장 종목, api/_hidden.js): 회원이 처음 관심 종목으로 담으면 소개글 1번,
//     실적 글은 관심 종목으로 담은 회원이 있는 동안만 (api/posts.js countHiddenFav → favhidden·ai:introq)
// DB 키
//   ai:intro:i          다음 소개글 순번 (CORP_CODES 인덱스)
//   ai:intro:{날짜}     그날 올린 소개글 수, ai:intro:last 마지막 소개글 시각
//   ai:posted           종목코드 → AI 글을 올린 마지막 시각 (hash) — 실적 글이 먼저 나간 종목은 소개글 건너뜀
//   ai:done             올렸거나 줄에 넣은 실적 보고서 '종목:기간' (set) — 같은 분기 중복 방지
//   ai:queue            실적 글 대기열 (JSON 목록), ai:scan 공시 훑기 위치(JSON), ai:lock 겹침 방지
//   ai:introq           숨은 종목 소개글 대기열 (종목코드 또는 JSON {code, tries}), ai:introseen 한 번 넣은 종목 (set)
//   favhidden           숨은 종목코드 → 관심 종목으로 담은 회원 수 (hash), ai:corp 공시에서 알아낸 숨은 종목 DART 고유번호 (hash)
import { redis } from './_redis.js';
import { CORP_CODES, CORP_HIDDEN } from './_corpcodes.js';
import { HIDDEN } from './_hidden.js';
import { STOCKS } from './_stocks.js';
import { runMarketTasks } from './_aiMarket.js';

const DART = 'https://opendart.fss.or.kr/api/';
const DART_PATHS = new Set(['company.json', 'fnlttSinglAcnt.json', 'list.json']);
export const AI_NICK = 'AI 운영자';
const INTRO_PER_DAY = 10;
const MAX_BODY = 1000;  // 토론글 본문 한도 (posts.js MAX_CONTENT와 같음)
const INTRO_GAP = 55 * 60e3;
const JOBS_PER_RUN = 2;
const SCAN_PAGES_PER_RUN = 2;
const CORP = new Map(CORP_CODES);
const NAME = new Map(STOCKS.map(s => [s.code, s.name]));
const HIDDEN_NAME = new Map(HIDDEN);
const HIDDEN_CORP = new Map(CORP_HIDDEN);
// 숨은 종목 DART 고유번호: scripts/corpcodes.mjs로 만든 표 → 없으면 실적 공시를 훑다 알아둔 값
const hiddenCorp = async code => HIDDEN_CORP.get(code) || (await redis([['HGET', 'ai:corp', code]]))[0] || null;

export async function dart(path, params) {
  if (!DART_PATHS.has(path)) throw new Error('허용되지 않은 DART 경로');
  const q = new URLSearchParams({ crtfc_key: process.env.DART_API_KEY, ...params });
  let r;
  try {
    r = await fetch(DART + path + '?' + q, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; upjong.com)', Accept: 'application/json' }, redirect: 'manual' });
  } catch { throw new Error('DART 연결 실패'); }  // 오류 문구에 인증키가 든 주소가 섞이지 않게
  if (r.status >= 300 && r.status < 400) throw new Error(`DART 차단(${r.status} → ${(r.headers.get('Location') || '').split('?')[0]})`);
  if (!r.ok) throw new Error(`DART HTTP ${r.status}`);
  return r.json();
}

// ── 날짜 (한국시간) ──
const kstDate = ts => new Date(ts + 9 * 3600e3);
const ymd = ts => kstDate(ts).toISOString().slice(0, 10).replace(/-/g, '');

// ── 공시 목록에서 정기보고서 읽기: '반기보고서 (2026.06)' → { kind, y, m } ──
const REPORT_RE = /(사업|반기|분기)보고서\s*\((\d{4})\.(\d{2})\)/;
function parseReport(nm) {
  const m = String(nm || '').match(REPORT_RE);
  return m ? { kind: m[1], y: Number(m[2]), m: Number(m[3]) } : null;
}
// 보고서 코드: 사업 11011, 반기 11012, 1분기 11013, 3분기 11014 (결산월 기준)
function reprtCode(r, fyEnd) {
  if (r.kind === '사업') return '11011';
  if (r.kind === '반기') return '11012';
  return (r.m - fyEnd + 12) % 12 === 3 ? '11013' : '11014';
}

// ── 재무 숫자 ──
const toNum = s => {
  if (s == null || s === '' || s === '-') return null;
  const neg = /^\(.*\)$/.test(String(s).trim()) || String(s).trim().startsWith('-');
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};
const ACCOUNTS = {
  rev: /^(매출액|수익\(매출액\)|매출|영업수익)$/,
  op: /^영업이익/,
  ni: /^당기순이익/,
  liab: /^부채총계$/,
  eq: /^자본총계$/,
};
// 한 보고서의 주요 계정 (연결 우선, 없으면 별도)
// 결산월이 12월이 아니면 사업연도가 한 해 앞일 수 있어 그 해도 시도 (12월 결산은 정확한 해만 — 새 보고서가 아직 안 올라왔을 때 지난 자료를 쓰지 않게)
async function fin(corp, year, code, fyEnd = 12) {
  for (const y of fyEnd === 12 ? [year] : [year, year - 1]) {
    const j = await dart('fnlttSinglAcnt.json', { corp_code: corp, bsns_year: String(y), reprt_code: code });
    if (j.status !== '000' || !j.list?.length) { if (j.status === '013') continue; throw new Error(`DART ${j.status} ${j.message || ''}`); }
    const fs = j.list.some(r => r.fs_div === 'CFS') ? 'CFS' : 'OFS';
    const rows = j.list.filter(r => r.fs_div === fs);
    const out = { cfs: fs === 'CFS', rcept: rows[0]?.rcept_no };
    for (const [k, re] of Object.entries(ACCOUNTS)) {
      const r = rows.find(x => re.test(String(x.account_nm).trim()));
      if (!r) continue;
      out[k] = {
        cur: toNum(r.thstrm_amount), curCum: toNum(r.thstrm_add_amount) ?? toNum(r.thstrm_amount),
        prev: toNum(r.frmtrm_amount), prevCum: toNum(r.frmtrm_add_amount) ?? toNum(r.frmtrm_amount),
        bfe: toNum(r.bfefrmtrm_amount),
      };
    }
    if (!out.op && !out.ni) return null;
    return out;
  }
  return null;
}

// ── 숫자 쓰기 ──
const EOK = 1e8, JO = 1e12;
const comma = n => Math.round(n).toLocaleString('en-US');
const money = n => {  // 본문용: 4,234억 원 · 1.2조 원
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= JO) return `${s}${(a / JO).toFixed(a >= 10 * JO ? 0 : 1).replace(/\.0$/, '')}조 원`;
  if (a >= EOK) return `${s}${comma(a / EOK)}억 원`;
  return `${s}${comma(a / 1e4)}만 원`;
};
const pct = x => Math.abs(x) >= 100 ? `${comma(Math.abs(x))}%` : `${Math.abs(x).toFixed(1)}%`;
const growth = (a, b) => (a == null || b == null || b === 0) ? null : (a - b) / Math.abs(b) * 100;
// 증감 칸: +24.5% · −8.0% · 흑자전환 · 적자전환 · 적자지속
function changeCell(cur, prev) {
  if (cur == null || prev == null) return '';
  if (prev <= 0 && cur > 0) return '흑자전환';
  if (prev > 0 && cur <= 0) return '적자전환';
  if (prev < 0 && cur < 0) return Math.abs(cur) < Math.abs(prev) ? '적자축소' : '적자확대';
  const g = growth(cur, prev);
  return g == null ? '' : (g >= 0 ? '+' : '−') + pct(g);
}
// 본문용 증감: 23.9% 증가 · 8.0% 감소 · 흑자전환 · 적자 축소
function chgText(cur, prev) {
  const c = changeCell(cur, prev);
  if (!c || !/^[+−]/.test(c)) return c.replace(/^적자(축소|확대)$/, '적자 $1');
  return c.slice(1) + (c[0] === '+' ? ' 증가' : ' 감소');
}
const margin = (op, rev) => (op == null || !rev) ? null : op / rev * 100;
const marginCell = m => m == null ? '−' : `${m.toFixed(1)}%`;
const marginChg = (a, b) => { if (a == null || b == null) return ''; const d = Math.round(a * 10) / 10 - Math.round(b * 10) / 10; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%p`; };  // 표에 보이는 소수 첫째 자리끼리 뺌

// 표 하나: cols = [열 이름…], series = [[값…]…] (계정별), 마지막 열에 증감
function table(title, colNames, pick, withChange = true) {
  const unit = Math.max(...['rev', 'op', 'ni'].flatMap(k => pick(k) || []).filter(v => v != null).map(Math.abs)) >= 10 * JO ? 'jo' : 'eok';
  const cell = v => v == null ? '−' : unit === 'jo' ? `${v < 0 ? '−' : ''}${(Math.abs(v) / JO).toFixed(1)}` : `${v < 0 ? '−' : ''}${comma(Math.abs(v) / EOK)}`;
  const rows = [];
  const add = (label, k) => {
    const v = pick(k);
    if (!v || v.every(x => x == null)) return;
    rows.push([label, ...v.map(cell), ...(withChange ? [changeCell(v.at(-1), v.at(-2))] : [])]);
  };
  add('매출액', 'rev'); add('영업이익', 'op');
  const rev = pick('rev'), op = pick('op');
  if (rev && op && rev.some(x => x)) {
    const ms = rev.map((r, i) => margin(op[i], r));
    rows.push(['영업이익률', ...ms.map(marginCell), ...(withChange ? [marginChg(ms.at(-1), ms.at(-2))] : [])]);
  }
  add('순이익', 'ni');
  return { title, unit: unit === 'jo' ? '조 원' : '억 원', cols: ['', ...colNames, ...(withChange ? ['증감'] : [])], rows };
}

// ── 문장 고르기: 종목·기간마다 고정된 난수로 여러 표현 중 하나 ──
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };

// 상황 판단 (기준 기간의 지난해 대비)
function situation(f) {
  const { rev, op } = f;
  if (op.prev != null && op.cur != null) {
    if (op.prev <= 0 && op.cur > 0) return 'turnPos';
    if (op.prev > 0 && op.cur <= 0) return 'turnNeg';
    if (op.prev < 0 && op.cur < 0) return Math.abs(op.cur) < Math.abs(op.prev) ? 'lossShrink' : 'lossWiden';
  }
  const gr = growth(rev?.cur, rev?.prev), go = growth(op?.cur, op?.prev);
  if (gr == null) return go == null ? 'flat' : go >= 5 ? 'opUpOnly' : go <= -5 ? 'opDownOnly' : 'flat';
  if (Math.abs(gr) < 3 && (go == null || Math.abs(go) < 5)) return 'flat';
  if (gr >= 0 && go >= 0) return go >= 30 ? 'boom' : 'growth';
  if (gr >= 0 && go < 0) return 'squeeze';
  if (gr < 0 && go >= 0) return 'efficient';
  return 'slump';
}

const HEAD = {
  boom: ['{name}, {period} 영업이익 {opChgAbs} 급증', '{name} {period} 실적, 영업이익이 {opChgAbs} 뛰었다', '{period} {name}, 매출 {revChgAbs}·영업이익 {opChgAbs} 동반 증가', '{name}, 이익 증가 속도가 매출보다 빠르다'],
  growth: ['{name}, {period} 매출 {revChgAbs}·영업이익 {opChgAbs} 증가', '{name} {period} 실적, 외형과 이익 모두 늘었다', '{name}, 매출 {rev}로 성장 흐름 이어가', '{period} {name}, 매출도 이익도 지난해보다 많다'],
  squeeze: ['{name}, 매출은 {revChgAbs} 늘었지만 영업이익은 {opChgAbs} 감소', '{name} {period}, 외형은 커졌는데 이익률은 주춤', '{name}, 늘어난 매출만큼 이익이 따라오지 못했다', '{period} {name}, 매출 증가에도 영업이익 {opChgAbs} 감소'],
  efficient: ['{name}, 매출은 줄었지만 영업이익은 {opChgAbs} 증가', '{name} {period}, 덜 팔고 더 남겼다', '{name}, 매출 {revChgAbs} 감소에도 이익은 늘어난 {period}', '{period} {name}, 수익성 개선이 눈에 띈다'],
  slump: ['{name}, {period} 매출 {revChgAbs}·영업이익 {opChgAbs} 감소', '{name} {period} 실적, 매출과 이익 모두 줄었다', '{name}, 지난해보다 아쉬운 {period}', '{period} {name}, 외형과 수익성 동반 부진'],
  turnPos: ['{name}, {period} 영업이익 흑자전환', '{name} {period}, 적자 벗어나 흑자로', '{name}, 영업이익 {op}으로 흑자 돌아서', '{period} {name}, 흑자전환 성공'],
  turnNeg: ['{name}, {period} 영업손실로 적자전환', '{name} {period}, 영업이익이 적자로 돌아서', '{name}, 지난해 흑자에서 {period} 적자로', '{period} {name}, 적자전환에 주목'],
  lossShrink: ['{name}, {period} 적자 폭 줄였다', '{name} {period}, 영업손실이 지난해보다 축소', '{name}, 아직 적자지만 손실은 줄어드는 중', '{period} {name}, 적자 축소 흐름'],
  lossWiden: ['{name}, {period} 영업손실 확대', '{name} {period}, 적자 폭이 커졌다', '{name}, 영업손실 {opAbs}로 늘어', '{period} {name}, 적자 지속·손실 확대'],
  opUpOnly: ['{name}, {period} 영업이익 {opChgAbs} 증가', '{name} {period}, 영업이익 {op}', '{period} {name}, 이익이 지난해보다 늘었다'],
  opDownOnly: ['{name}, {period} 영업이익 {opChgAbs} 감소', '{name} {period}, 영업이익 {op}로 감소', '{period} {name}, 이익이 지난해보다 줄었다'],
  flat: ['{name}, {period} 실적 지난해와 비슷', '{name} {period}, 큰 변화 없는 실적', '{period} {name}, 매출·이익 모두 제자리걸음', '{name}, 숫자로 본 {period} 실적'],
};
const LEAD = {
  boom: ['{name}의 {period} 영업이익은 {op}으로, 지난해 같은 기간보다 {opChgAbs} 늘었습니다. 매출 증가율({revChgAbs})보다 이익 증가율이 훨씬 높습니다.', '{period} {name}는 매출 {rev}, 영업이익 {op}을 기록했습니다. 영업이익이 1년 전보다 {opChgAbs} 늘며 눈에 띄게 좋아졌습니다.', '이익이 크게 늘었습니다. {name}의 {period} 영업이익은 {op}으로 지난해보다 {opChgAbs} 증가했고, 매출도 {revChgAbs} 늘어 {rev}입니다.'],
  growth: ['{name}의 {period} 매출은 {rev}으로 지난해 같은 기간보다 {revChgAbs} 늘었고, 영업이익도 {op}으로 {opChgAbs} 증가했습니다.', '{period} {name}는 매출 {rev}, 영업이익 {op}을 올렸습니다. 1년 전과 비교하면 매출 {revChgAbs}, 영업이익 {opChgAbs} 늘어난 숫자입니다.', '매출과 이익이 함께 늘었습니다. {name}의 {period} 매출은 {rev}({revChg}), 영업이익은 {op}({opChg})입니다.'],
  squeeze: ['{name}의 {period} 매출은 {rev}으로 지난해보다 {revChgAbs} 늘었지만, 영업이익은 {op}으로 오히려 {opChgAbs} 줄었습니다.', '외형은 커졌지만 남긴 돈은 줄었습니다. {name}의 {period} 매출은 {revChgAbs} 늘어난 {rev}, 영업이익은 {opChgAbs} 줄어든 {op}입니다.', '{period} {name}는 매출 {rev}({revChg})을 기록했습니다. 다만 영업이익은 {op}으로 지난해 같은 기간보다 {opChgAbs} 감소했습니다.'],
  efficient: ['{name}의 {period} 매출은 {rev}으로 지난해보다 {revChgAbs} 줄었지만, 영업이익은 {op}으로 {opChgAbs} 늘었습니다.', '매출이 줄었는데도 이익은 늘었습니다. {name}의 {period} 영업이익은 {op}({opChg}), 매출은 {rev}({revChg})입니다.', '{period} {name}는 매출이 {revChgAbs} 줄어든 {rev}에 그쳤지만, 영업이익은 오히려 {opChgAbs} 늘어난 {op}을 기록했습니다.'],
  slump: ['{name}의 {period} 매출은 {rev}으로 지난해보다 {revChgAbs} 줄었고, 영업이익도 {op}으로 {opChgAbs} 감소했습니다.', '{period} {name}는 매출 {rev}({revChg}), 영업이익 {op}({opChg})로 1년 전보다 부진했습니다.', '매출과 이익이 함께 줄었습니다. {name}의 {period} 영업이익은 {op}으로 지난해 같은 기간보다 {opChgAbs} 적습니다.'],
  turnPos: ['{name}가 {period} 영업이익 {op}을 기록하며 흑자로 돌아섰습니다. 지난해 같은 기간에는 {opPrevAbs}의 영업손실이었습니다.', '지난해 같은 기간 {opPrevAbs} 영업손실을 냈던 {name}가 {period}에는 {op} 영업이익을 냈습니다.', '{period} {name}의 영업이익은 {op}입니다. 1년 전 영업손실({opPrevAbs})에서 흑자로 바뀌었습니다.'],
  turnNeg: ['{name}의 {period} 영업손익은 {opAbs} 손실로, 지난해 같은 기간 {opPrev} 이익에서 적자로 돌아섰습니다.', '지난해 같은 기간 {opPrev} 영업이익을 냈던 {name}가 {period}에는 {opAbs} 영업손실을 기록했습니다.', '{period} {name}는 영업손실 {opAbs}을 냈습니다. 1년 전에는 영업이익 {opPrev}이었습니다.'],
  lossShrink: ['{name}의 {period} 영업손실은 {opAbs}으로, 지난해 같은 기간({opPrevAbs})보다 줄었습니다.', '{period} {name}는 여전히 영업손실({opAbs})이지만, 1년 전 {opPrevAbs}보다 적자 폭이 작아졌습니다.', '적자는 이어졌지만 손실은 줄었습니다. {name}의 {period} 영업손실은 {opAbs}, 지난해 같은 기간은 {opPrevAbs}이었습니다.'],
  lossWiden: ['{name}의 {period} 영업손실은 {opAbs}으로, 지난해 같은 기간({opPrevAbs})보다 커졌습니다.', '{period} {name}는 영업손실 {opAbs}을 기록했습니다. 1년 전 {opPrevAbs}보다 적자 폭이 늘었습니다.', '적자가 이어지면서 손실도 커졌습니다. {name}의 {period} 영업손실은 {opAbs}입니다.'],
  opUpOnly: ['{name}의 {period} 영업이익은 {op}으로, 지난해 같은 기간보다 {opChgAbs} 늘었습니다.', '{period} {name}는 영업이익 {op}({opChg})을 기록했습니다.'],
  opDownOnly: ['{name}의 {period} 영업이익은 {op}으로, 지난해 같은 기간보다 {opChgAbs} 줄었습니다.', '{period} {name}는 영업이익 {op}({opChg})을 기록했습니다.'],
  flat: ['{name}의 {period} 매출은 {rev}({revChg}), 영업이익은 {op}({opChg})로 지난해와 큰 차이가 없습니다.', '{period} {name}는 매출 {rev}, 영업이익 {op}을 기록했습니다. 1년 전과 비슷한 수준입니다.', '큰 변화는 없었습니다. {name}의 {period} 매출과 영업이익은 각각 {rev}, {op}입니다.'],
};
const MARGIN = {
  up: ['매출 100원당 남긴 영업이익이 {mPrev}원에서 {mCur}원으로 늘었습니다.', '영업이익률은 {mPrevP}에서 {mCurP}로 높아졌습니다.', '수익성 지표인 영업이익률도 {mPrevP} → {mCurP}로 개선됐습니다.'],
  down: ['매출 100원당 남긴 영업이익이 {mPrev}원에서 {mCur}원으로 줄었습니다.', '영업이익률은 {mPrevP}에서 {mCurP}로 낮아졌습니다.', '영업이익률이 {mPrevP} → {mCurP}로 내려가, 비용이 매출보다 빠르게 늘었다는 뜻입니다.'],
};
const NI_GAP = {
  high: ['순이익({ni})이 영업이익보다 많았는데, 본업 밖에서 생긴 이익(금융·투자 이익 등)이 더해진 결과입니다.', '본업 외 이익이 더해지면서 순이익은 영업이익보다 많은 {ni}입니다.'],
  low: ['순이익은 {ni}으로 영업이익보다 크게 적습니다. 본업 밖의 비용이나 세금 영향이 컸다는 뜻입니다.', '영업이익에 비해 순이익({ni})이 적은 편으로, 영업 외 손실이나 세금 부담이 있었습니다.'],
  loss: ['영업이익은 냈지만 순이익은 {niAbs} 손실입니다. 본업 밖에서 손실이 컸습니다.', '본업은 흑자였지만 영업 외 손실로 순손실({niAbs})을 기록했습니다.'],
};
const TREND = {
  up2: ['연간으로 보면 {y0}년 {r0} → {y1}년 {r1} → {y2}년 {r2}로 매출이 2년 연속 늘었습니다.', '최근 3년 매출은 {r0}, {r1}, {r2}로 꾸준히 커졌습니다.'],
  down2: ['연간 매출은 {y0}년 {r0}에서 {y2}년 {r2}로 2년 연속 줄었습니다.', '최근 3년 매출이 {r0} → {r1} → {r2}로 계속 줄고 있습니다.'],
  rebound: ['{y1}년에 주춤했던 매출이 {y2}년 {r2}로 다시 늘었습니다.', '연간 매출은 {y1}년 {r1}로 줄었다가 {y2}년 {r2}로 반등했습니다.'],
  dip: ['{y1}년 {r1}까지 늘던 연간 매출이 {y2}년 {r2}로 줄었습니다.', '연간 매출은 {y1}년 정점({r1}) 이후 {y2}년 {r2}로 내려왔습니다.'],
  opUp2: ['연간 영업이익도 {o0} → {o1} → {o2}로 2년 연속 증가했습니다.', '영업이익은 최근 3년간 {o0}, {o1}, {o2}로 계속 늘었습니다.'],
  opDown2: ['연간 영업이익은 {o0} → {o1} → {o2}로 2년 연속 줄었습니다.', '영업이익은 최근 3년간 {o0}, {o1}, {o2}로 계속 줄었습니다.'],
};
const DEBT = {
  low: ['부채비율은 {debt}로 낮아 재무 구조는 탄탄한 편입니다.', '재무 상태는 안정적입니다. 부채비율이 {debt}에 불과합니다.', '빚 부담은 크지 않습니다(부채비율 {debt}).'],
  mid: ['부채비율은 {debt}로 무난한 수준입니다.', '재무 상태는 보통 수준으로, 부채비율은 {debt}입니다.'],
  high: ['부채비율이 {debt}로 높은 편이라 재무 부담은 살펴볼 필요가 있습니다.', '부채비율은 {debt}로, 갚아야 할 돈이 자기자본보다 꽤 많은 편입니다.'],
  fin: ['금융회사라 부채비율은 일반 기업과 같은 기준으로 보기 어렵습니다.'],
};
const ASK = {
  boom: ['이 성장세, 다음 분기에도 이어질까요?', '이익이 크게 늘었는데, 지금 주가에 다 반영됐다고 보시나요?', '실적 개선이 계속될지 여러분 생각을 나눠 주세요.'],
  growth: ['성장 흐름이 이어질지, 여러분 의견은 어떠신가요?', '매출과 이익이 함께 느는 지금, 어떻게 보시나요?', '이 실적이면 주가에 어떤 영향이 있을까요?'],
  squeeze: ['이익률 하락이 일시적이라고 보시나요?', '매출은 느는데 이익이 줄어드는 이유, 어떻게 보시나요?', '다음 분기에 수익성이 회복될까요?'],
  efficient: ['매출 감소에도 이익을 늘린 점, 어떻게 평가하시나요?', '수익성 개선이 매출 회복으로 이어질까요?', '이 흐름, 긍정적으로 보시나요?'],
  slump: ['실적 부진이 언제쯤 바닥을 칠까요?', '이번 숫자, 주가에 이미 반영됐다고 보시나요?', '반등 계기는 무엇이 될까요? 의견을 나눠 주세요.'],
  turnPos: ['흑자전환이 이어질 수 있을까요?', '흑자로 돌아선 지금, 어떻게 보시나요?', '이번 흑자가 추세 전환의 신호일까요?'],
  turnNeg: ['적자전환이 일시적일까요?', '이번 적자, 어떻게 보시나요?', '언제쯤 다시 흑자로 돌아설까요?'],
  lossShrink: ['적자 축소 흐름, 흑자전환까지 이어질까요?', '손실이 줄고 있는 지금, 어떻게 보시나요?'],
  lossWiden: ['적자 확대, 어떻게 보시나요?', '손실이 커지는 이유, 여러분 생각은 어떠신가요?'],
  opUpOnly: ['이 흐름이 이어질까요?', '이번 실적 어떻게 보시나요?'],
  opDownOnly: ['이익 감소가 일시적일까요?', '이번 실적 어떻게 보시나요?'],
  flat: ['정체된 실적, 다음 분기엔 달라질까요?', '이번 실적 어떻게 보시나요?', '변화가 없는 숫자, 여러분은 어떻게 해석하시나요?'],
};

const quarterOf = (m, fyEnd) => ((m - fyEnd + 12) % 12) / 3;
const fyStartMonth = fyEnd => fyEnd % 12 + 1;
const monthsLabel = (from, to) => `${from}~${to}월`;

// 설명 글 만들기: focus = 기준 기간 숫자 { rev, op, ni: {cur, prev}, period }
function writeText(name, sit, focus, extra, r, earnings = false) {
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const v = {
    name, period: focus.period,
    rev: focus.rev?.cur != null ? money(focus.rev.cur) : '', op: focus.op?.cur != null ? money(focus.op.cur) : '',
    opAbs: focus.op?.cur != null ? money(Math.abs(focus.op.cur)) : '', opPrev: focus.op?.prev != null ? money(focus.op.prev) : '',
    opPrevAbs: focus.op?.prev != null ? money(Math.abs(focus.op.prev)) : '',
    revChg: chgText(focus.rev?.cur, focus.rev?.prev), opChg: chgText(focus.op?.cur, focus.op?.prev),
    revChgAbs: pct(growth(focus.rev?.cur, focus.rev?.prev) ?? 0), opChgAbs: pct(growth(focus.op?.cur, focus.op?.prev) ?? 0),
    ni: focus.ni?.cur != null ? money(focus.ni.cur) : '', niAbs: focus.ni?.cur != null ? money(Math.abs(focus.ni.cur)) : '',
  };
  // 조사: '{name}가/는' → 받침에 맞게
  const fixJosa = s => s.replace(new RegExp(`${name}(가|는|의)`, 'g'), (_, j) => name + (j === '가' ? josa(name, '이', '가') : j === '는' ? josa(name, '은', '는') : '의'))
    .replace(/(\d[\d,.]*(?:조|억|만) 원)(으로|로)/g, (_, a) => a + '으로').replace(/(\d[\d.]*%p?)(으로|로)/g, (_, a) => a + '로');
  // 실적 발표 글은 머리표([2분기 실적])에 기간이 있으니 제목에서 기간을 뺌
  const heads = earnings ? HEAD[sit].filter(t => !/\{period\}$/.test(t)) : HEAD[sit];
  const title = fixJosa(fill(pick(heads), earnings ? { ...v, period: '' } : v)).replace(/\s{2,}/g, ' ').replace(/^[\s,]+/, '').replace(/ ,/g, ',');
  const paras = [{ k: 'lead', t: fixJosa(fill(pick(LEAD[sit]), v)) }];
  const more = [];
  // 이익률 변화
  const mCur = margin(focus.op?.cur, focus.rev?.cur), mPrev = margin(focus.op?.prev, focus.rev?.prev);
  if (mCur != null && mPrev != null && mCur > 0 && mPrev > 0 && Math.abs(mCur - mPrev) >= 1 && !['turnPos', 'turnNeg'].includes(sit))
    more.push(fill(pick(MARGIN[mCur > mPrev ? 'up' : 'down']), { mCur: mCur.toFixed(1), mPrev: mPrev.toFixed(1), mCurP: mCur.toFixed(1) + '%', mPrevP: mPrev.toFixed(1) + '%' }));
  // 순이익과 영업이익 차이
  const op = focus.op?.cur, ni = focus.ni?.cur;
  if (op > 0 && ni != null) {
    if (ni < 0) more.push(fill(pick(NI_GAP.loss), v));
    else if (ni > op * 1.3) more.push(fill(pick(NI_GAP.high), v));
    else if (ni < op * 0.5) more.push(fill(pick(NI_GAP.low), v));
  }
  if (more.length) paras.push({ k: 'more', t: more.join(' ') });
  // 최근 분기 흐름 (소개글에서 누적과 따로)
  if (extra.quarter) paras.push({ k: 'quarter', t: extra.quarter });
  // 3년 추세
  if (extra.trend) {
    const t = extra.trend, s = [];
    const [r0, r1, r2] = t.rev || [], [o0, o1, o2] = t.op || [];
    const tv = { y0: t.years[0], y1: t.years[1], y2: t.years[2], r0: r0 != null ? money(r0) : '', r1: r1 != null ? money(r1) : '', r2: r2 != null ? money(r2) : '', o0: o0 != null ? money(o0) : '', o1: o1 != null ? money(o1) : '', o2: o2 != null ? money(o2) : '' };
    if (r0 > 0 && r1 > 0 && r2 > 0) {
      const k = r2 > r1 && r1 > r0 ? 'up2' : r2 < r1 && r1 < r0 ? 'down2' : r2 > r1 && r1 < r0 ? 'rebound' : r2 < r1 && r1 > r0 ? 'dip' : null;
      if (k) s.push(fill(pick(TREND[k]), tv));
    }
    if (o0 > 0 && o1 > 0 && o2 > 0) {
      const k = o2 > o1 && o1 > o0 ? 'opUp2' : o2 < o1 && o1 < o0 ? 'opDown2' : null;
      if (k) s.push(fill(pick(TREND[k]), tv));
    }
    if (s.length) paras.push({ k: 'trend', t: s.join(' ') });
  }
  // 재무 상태
  if (extra.debt != null) {
    const k = extra.fin ? 'fin' : extra.debt < 100 ? 'low' : extra.debt < 200 ? 'mid' : 'high';
    const line = fill(pick(DEBT[k]), { debt: `${Math.round(extra.debt)}%` });
    // 표현 순서도 섞음: 재무 문장을 추세 앞에 두기도 함
    const item = { k: 'debt', t: line };
    if (paras.length > 2 && r() < 0.4) paras.splice(paras.length - 1, 0, item); else paras.push(item);
  }
  paras.push({ k: 'ask', t: '👉 ' + pick(ASK[sit]) });
  // 안전장치: 토론글 한도(1,000자)를 넘으면 덜 중요한 문단부터 뺌 (첫 문단·질문은 남김)
  const text = () => fixJosa(paras.map(x => x.t).join('\n\n'));
  for (const k of ['trend', 'quarter', 'debt', 'more']) {
    if (text().length <= MAX_BODY) break;
    const i = paras.findIndex(x => x.k === k);
    if (i >= 0) paras.splice(i, 1);
  }
  let body = text();
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY - 1) + '…';
  return { title, body };
}

const FIN_SECTOR = s => Boolean(s?.sectors?.finance);

// ── 글 만들기 ──
// kind 'intro': 가장 최근 사업보고서 + 그 뒤 분기·반기 보고서
// kind 'earnings': report = { kind, y, m, rcept } 해당 보고서 중심
export async function buildPost(code, kind = 'intro', report = null) {
  const stock = STOCKS.find(s => s.code === code) || (HIDDEN_NAME.has(code) ? { code, name: HIDDEN_NAME.get(code) } : null);
  const corp = CORP.get(code) || report?.corp || (HIDDEN_NAME.has(code) ? await hiddenCorp(code) : null);
  if (!corp || !stock) throw new Error('DART 연결 종목이 아닙니다');
  const name = stock.name;
  const lst = await dart('list.json', { corp_code: corp, bgn_de: ymd(Date.now() - 800 * 86400e3), end_de: ymd(Date.now()), pblntf_ty: 'A', page_count: '40' });
  if (lst.status !== '000') return { skip: `공시 목록 없음 (${lst.status})` };
  const reports = lst.list.map(x => ({ ...parseReport(x.report_nm), rcept: x.rcept_no })).filter(x => x.kind);
  const annual = reports.find(x => x.kind === '사업');
  if (!annual) return { skip: '사업보고서 없음' };
  const fyEnd = annual.m;
  const later = x => x.y * 12 + x.m > annual.y * 12 + annual.m;
  let target = report ? reports.find(x => x.kind === report.kind && x.y === report.y && x.m === report.m) || report : null;
  const interim = kind === 'intro' ? reports.find(x => x.kind !== '사업' && later(x)) : (target && target.kind !== '사업' ? target : null);
  const annualRep = kind === 'earnings' && target?.kind === '사업' ? target : annual;

  const A = await fin(corp, annualRep.y, '11011', fyEnd);
  if (!A) return kind === 'earnings' && !interim ? { wait: '보고서 숫자가 아직 DART에 없음' } : { skip: '연간 실적 없음' };
  const I = interim ? await fin(corp, interim.y, reprtCode(interim, fyEnd), fyEnd) : null;
  if (kind === 'earnings' && interim && !I) return { wait: '보고서 숫자가 아직 DART에 없음' };
  const r = rng(`${code}:${kind}:${(interim || annualRep).y}.${(interim || annualRep).m}`);

  const yLabel = y => fyEnd === 12 ? `${y}년` : `${y}.${fyEnd}월 결산`;
  const years = [annualRep.y - 2, annualRep.y - 1, annualRep.y];
  const seriesA = k => A[k] ? [A[k].bfe, A[k].prev, A[k].cur] : null;
  const tables = [];
  const debtOf = (l, e) => (l != null && e > 0) ? l / e * 100 : null;
  let focus, extra = { fin: FIN_SECTOR(stock) }, srcRcept;

  const trendYears = years.map(y => yLabel(y).replace('년', ''));
  extra.trend = { years: trendYears, rev: seriesA('rev'), op: seriesA('op') };

  if (I) {
    const q = quarterOf(interim.m, fyEnd);
    const startM = fyStartMonth(fyEnd), qStart = (interim.m + 9) % 12 + 1;
    const qLabel = fyEnd === 12 ? `${interim.y}년 ${q}분기` : `${interim.y}.${interim.m}월 분기`;
    const cumLabel = `${interim.y}년 ${monthsLabel(startM, interim.m)}`;
    const qOnly = q === 1;
    const pickQ = k => I[k] ? [I[k].prev, I[k].cur] : null;
    const pickC = k => I[k] ? [I[k].prevCum, I[k].curCum] : null;
    if (kind === 'earnings') {
      tables.push(table(`${qLabel} (${monthsLabel(qStart, interim.m)})`, [`${interim.y - 1}년`, `${interim.y}년`], pickQ));
      if (!qOnly) tables.push(table(`누적 (${monthsLabel(startM, interim.m)})`, [`${interim.y - 1}년`, `${interim.y}년`], pickC));
      focus = { period: `${q}분기`, rev: I.rev && { cur: I.rev.cur, prev: I.rev.prev }, op: I.op && { cur: I.op.cur, prev: I.op.prev }, ni: I.ni && { cur: I.ni.cur, prev: I.ni.prev } };
      if (!qOnly && I.op) {
        const cv = { period: monthsLabel(startM, interim.m) + ' 누적', op: money(I.op.curCum), opChg: chgText(I.op.curCum, I.op.prevCum), rev: I.rev ? money(I.rev.curCum) : '', revChg: I.rev ? chgText(I.rev.curCum, I.rev.prevCum) : '' };
        extra.quarter = fill(I.rev ? ['{period}으로는 매출 {rev}({revChg}), 영업이익 {op}({opChg})입니다.', '올해 {period} 실적은 매출 {rev}({revChg}), 영업이익 {op}({opChg})입니다.'][Math.floor(r() * 2)]
          : '{period} 영업이익은 {op}({opChg})입니다.', cv).replace(/\(\)/g, '');
      }
      extra.trend = null;
    } else {
      tables.push(table('연간 실적', years.map(yLabel), seriesA));
      tables.push(table(`올해 누적 (${monthsLabel(startM, interim.m)})`, [`${interim.y - 1}년`, `${interim.y}년`], pickC));
      focus = { period: `올해 ${monthsLabel(startM, interim.m)}`, rev: I.rev && { cur: I.rev.curCum, prev: I.rev.prevCum }, op: I.op && { cur: I.op.curCum, prev: I.op.prevCum }, ni: I.ni && { cur: I.ni.curCum, prev: I.ni.prevCum } };
      if (!qOnly && I.op && I.op.cur != null && I.op.prev != null) {
        const qv = { q: `${q}분기(${monthsLabel(qStart, interim.m)})`, op: money(I.op.cur), opChg: chgText(I.op.cur, I.op.prev), rev: I.rev ? money(I.rev.cur) : '', revChg: I.rev ? chgText(I.rev.cur, I.rev.prev) : '' };
        extra.quarter = fill(r() < 0.5 ? '가장 최근인 {q}만 보면 매출 {rev}({revChg}), 영업이익 {op}({opChg})입니다.' : '분기로 나눠 보면, 최근 {q} 영업이익은 {op}({opChg})입니다.', qv).replace(/매출 \(\), /, '').replace(/\(\)/g, '');
      }
    }
    extra.debt = debtOf(I.liab?.cur, I.eq?.cur);
    srcRcept = interim.rcept;
  } else {
    tables.push(table('연간 실적', years.map(yLabel), seriesA));
    focus = { period: `${yLabel(annualRep.y)}`, rev: A.rev && { cur: A.rev.cur, prev: A.rev.prev }, op: A.op && { cur: A.op.cur, prev: A.op.prev }, ni: A.ni && { cur: A.ni.cur, prev: A.ni.prev } };
    extra.debt = debtOf(A.liab?.cur, A.eq?.cur);
    srcRcept = annualRep.rcept;
  }
  if (!focus.op) return { skip: '영업이익 없음' };
  const sit = situation(focus);
  const { title, body } = writeText(name, sit, focus, extra, r, kind === 'earnings');
  const tag = kind === 'earnings' ? `📢 [${interim ? (fyEnd === 12 ? `${quarterOf(interim.m, fyEnd)}분기` : '분기') : '연간'} 실적] ` : '📊 ';
  const srcName = (interim ? `${interim.kind}보고서 (${interim.y}.${String(interim.m).padStart(2, '0')})` : `사업보고서 (${annualRep.y}.${String(annualRep.m).padStart(2, '0')})`);
  return {
    code, name, kind, sit,
    headline: tag + title,
    // 접힌 글에 보이는 핵심 한 줄: 기준 기간 · 매출 ○○(증감) · 영업이익 ○○(증감) [· 순이익 — 매출 없는 금융사]
    summary: [focus.period, ...[['매출', focus.rev], ['영업이익', focus.op], ...(focus.rev ? [] : [['순이익', focus.ni]])]
      .filter(([, x]) => x?.cur != null).map(([k, x]) => `${k} ${money(x.cur)}${changeCell(x.cur, x.prev) ? ` (${changeCell(x.cur, x.prev)})` : ''}`)].join(' · '),
    tables,
    content: body,
    src: { label: `DART ${srcName}${A.cfs ? ' · 연결 기준' : ' · 별도 기준'}`, url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${srcRcept}` },
    period: interim ? `${interim.y}.${interim.m}` : `${annualRep.y}.${annualRep.m}`,
  };
}

// 글 저장 (posts.js 'create'와 같은 키 구조)
export async function savePost(p, { mark = true } = {}) {  // mark: 종목 소개글 건너뛰기용 ai:posted 기록 (시장·업종 게시판 글은 false)
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const post = { id, code: p.code, nick: AI_NICK, content: p.content, sentiment: 'neutral', ts: Date.now(), official: true, ai: true, headline: p.headline, summary: p.summary, tables: p.tables, src: p.src };
  await redis([
    ['SET', `post:${id}`, JSON.stringify(post)],
    ['LPUSH', `posts:${p.code}`, id],
    ['LPUSH', `author:${AI_NICK}`, id],
    ['HINCRBY', 'postcount', p.code, 1],
    mark ? ['HSET', 'ai:posted', p.code, Date.now()] : ['ECHO', 'nomark'],
  ]);
  return id;
}

// ── 오늘 정기보고서 훑기: 한 번에 몇 쪽씩, 코스피(Y)·코스닥(K) 차례로 ──
async function scan(now, log) {
  const today = ymd(now), hour = kstDate(now).getUTCHours();
  const [raw] = await redis([['GET', 'ai:scan']]);
  let st = raw ? JSON.parse(raw) : null;
  if (!st || (st.day !== today && st.done)) st = { day: today, from: hour < 9 ? ymd(now - 86400e3) : today, cls: 'Y', page: 1, done: false };
  if (st.done) { if (now - st.doneAt < 10 * 60e3) return; st = { day: today, from: hour < 9 ? ymd(now - 86400e3) : today, cls: 'Y', page: 1, done: false }; }
  const recent = now - 200 * 86400e3;
  for (let i = 0; i < SCAN_PAGES_PER_RUN && !st.done; i++) {
    const j = await dart('list.json', { bgn_de: st.from, end_de: today, pblntf_ty: 'A', corp_cls: st.cls, page_no: String(st.page), page_count: '100' });
    const items = j.status === '000' ? j.list : [];
    // 숨은 종목은 관심 종목으로 담은 회원이 있을 때만
    const hiddenCodes = [...new Set(items.map(x => x.stock_code).filter(c => !CORP.has(c) && HIDDEN_NAME.has(c)))];
    const favd = new Set();
    if (hiddenCodes.length) {
      const [cnts] = await redis([['HMGET', 'favhidden', ...hiddenCodes]]);
      hiddenCodes.forEach((c, k) => { if (Number(cnts?.[k]) > 0) favd.add(c); });
    }
    const add = [];
    for (const x of items) {
      if (!(CORP.has(x.stock_code) || favd.has(x.stock_code)) || /^\[/.test(x.report_nm)) continue;  // 정정·첨부 보고서는 건너뜀
      const rp = parseReport(x.report_nm);
      if (!rp || Date.UTC(rp.y, rp.m, 1) < recent) continue;
      add.push({ code: x.stock_code, kind: rp.kind, y: rp.y, m: rp.m, rcept: x.rcept_no, ...(favd.has(x.stock_code) ? { corp: x.corp_code } : {}) });
    }
    const learned = add.filter(a => a.corp);
    if (learned.length) await redis([['HSET', 'ai:corp', ...learned.flatMap(a => [a.code, a.corp])]]);
    if (add.length) {
      const res = await redis(add.map(a => ['SADD', 'ai:done', `${a.code}:${a.y}.${a.m}`]));
      const fresh = add.filter((_, k) => Number(res[k]) === 1);
      if (fresh.length) await redis([['RPUSH', 'ai:queue', ...fresh.map(a => JSON.stringify(a))]]);
      log.push(`공시 ${st.cls} ${st.page}쪽: 새 실적 ${fresh.length}건`);
    }
    if (j.status !== '000' || st.page >= Number(j.total_page || 1)) {
      if (st.cls === 'Y') { st.cls = 'K'; st.page = 1; } else { st.done = true; st.doneAt = now; }
    } else st.page++;
  }
  await redis([['SET', 'ai:scan', JSON.stringify(st), 'EX', 3 * 86400]]);
}

// ── 예약 실행 1회 ──
export async function runOnce(now) {
  const [lock] = await redis([['SET', 'ai:lock', '1', 'NX', 'EX', 240]]);
  if (lock !== 'OK') return { skipped: 'running' };
  const log = [];
  try {
    await scan(now, log);
    // 실적 발표 글
    for (let i = 0; i < JOBS_PER_RUN; i++) {
      const [raw] = await redis([['LPOP', 'ai:queue']]);
      if (!raw) break;
      const job = JSON.parse(raw);
      if (job.notBefore > now) { await redis([['RPUSH', 'ai:queue', raw]]); continue; }
      try {
        const p = await buildPost(job.code, 'earnings', job);
        if (p.skip) { log.push(`실적 ${job.code} 건너뜀: ${p.skip}`); continue; }
        if (p.wait) {  // 공시는 나왔지만 재무 숫자가 아직 안 올라옴 → 1시간 뒤 다시 (최대 2일)
          job.waits = (job.waits || 0) + 1;
          if (job.waits <= 48) await redis([['RPUSH', 'ai:queue', JSON.stringify({ ...job, notBefore: now + 3600e3 })]]);
          log.push(`실적 ${job.code} 대기: ${p.wait}`);
          continue;
        }
        await savePost(p);
        log.push(`실적 글 ${job.code} ${p.headline}`);
      } catch (e) {
        job.tries = (job.tries || 0) + 1;
        if (job.tries < 3) await redis([['RPUSH', 'ai:queue', JSON.stringify(job)]]);
        log.push(`실적 ${job.code} 실패(${job.tries}): ${e.message}`);
      }
    }
    // 숨은 종목 소개글: 회원이 처음 관심 종목으로 담은 종목, 실행마다 1개 (시간·하루 개수 제한 없음)
    const [introRaw] = await redis([['LPOP', 'ai:introq']]);
    if (introRaw) {
      const job = introRaw.startsWith('{') ? JSON.parse(introRaw) : { code: introRaw };
      const [had] = await redis([['HEXISTS', 'ai:posted', job.code]]);
      if (Number(had)) log.push(`숨은 종목 소개 ${job.code} 이미 글 있음`);
      else {
        try {
          const p = await buildPost(job.code, 'intro');
          if (p.skip) log.push(`숨은 종목 소개 ${job.code} 건너뜀: ${p.skip}`);
          else { await savePost(p); log.push(`숨은 종목 소개글 ${job.code} ${p.headline}`); }
        } catch (e) {
          job.tries = (job.tries || 0) + 1;
          // DART 고유번호를 아직 모르면 다음에 누가 새로 담을 때 다시 (ai:introseen에서 뺌), 일시 오류는 3번까지
          if (/DART 연결 종목이 아닙니다/.test(e.message)) await redis([['SREM', 'ai:introseen', job.code]]);
          else if (job.tries < 3) await redis([['RPUSH', 'ai:introq', JSON.stringify(job)]]);
          log.push(`숨은 종목 소개 ${job.code} 실패(${job.tries}): ${e.message}`);
        }
      }
    }
    // 소개글: 한국시간 9~20시, 하루 10개, 약 1시간 간격
    const hour = kstDate(now).getUTCHours(), dayKey = `ai:intro:${ymd(now)}`;
    const [cnt, last, idx, qlen] = await redis([['GET', dayKey], ['GET', 'ai:intro:last'], ['GET', 'ai:intro:i'], ['LLEN', 'ai:queue']]);
    if (hour >= 9 && hour <= 20 && Number(cnt || 0) < INTRO_PER_DAY && now - Number(last || 0) >= INTRO_GAP && Number(qlen) < 20) {
      let i = Number(idx || 0);
      for (let tries = 0; tries < 3 && i < CORP_CODES.length; tries++, i++) {
        const code = CORP_CODES[i][0];
        const [had] = await redis([['HEXISTS', 'ai:posted', code]]);
        if (Number(had)) continue;
        try {
          const p = await buildPost(code, 'intro');
          if (p.skip) { log.push(`소개 ${code} 건너뜀: ${p.skip}`); continue; }
          await savePost(p);
          await redis([['INCR', dayKey], ['EXPIRE', dayKey, 3 * 86400], ['SET', 'ai:intro:last', now]]);
          log.push(`소개글 ${code} ${p.headline}`);
          i++;
          break;
        } catch (e) { log.push(`소개 ${code} 실패: ${e.message}`); break; }  // 일시 오류면 다음 실행에 같은 종목 다시
      }
      await redis([['SET', 'ai:intro:i', i]]);
    }
    // 시장·업종 정기 글 (장 시작 전·장 마감·공시 모음)
    try { await runMarketTasks(now, { dart, savePost }, log); } catch (e) { log.push(`시장글 오류: ${e.message}`); }
  } finally {
    await redis([['DEL', 'ai:lock']]);
  }
  return { log };
}
