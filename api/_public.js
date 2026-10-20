// 종목 페이지(/stock/코드) 공개·검색 노출 규칙
//   1) 업종 탭마다 시가총액 상위 CORE_N개(탭 안 순서 = 시총순, 미국 ETF는 규모순)에 드는 종목: 항상 공개·검색 노출, 사이트맵 포함
//      (2026-10-20 애드센스 대비 — 같은 틀의 종목 페이지가 너무 많이 색인되지 않게 줄임. scripts/seo.mjs CORE_N과 같은 값)
//   2) 아래 종목은 페이지는 공개하되, 회원 토론글(AI·운영자·블라인드 제외)이 INDEX_MIN개 이상일 때만 검색 노출
//      (그 전엔 noindex, 사이트맵·RSS 제외)
//      - 업종 탭에 있지만 어느 탭에서도 시총 상위 CORE_N개에 들지 않는 종목
//      - 개편으로 탭에서 빠진 옛 종목 (이미 검색엔진에 등록된 주소라 404로 끊지 않음, 미국 주식 포함)
//      - 숨은 종목(업종 탭에 없는 상장 종목, api/_hidden.js) 중 회원이 한 번이라도 관심 종목으로 담은 것 (hiddenpublic)
// DB 키: hiddenpublic  관심 종목으로 담긴 적 있는 숨은 종목코드 (set, api/posts.js countHiddenFav가 추가)
import { redis } from './_redis.js';
import { HIDDEN } from './_hidden.js';
import { LEGACY } from './_legacy.js';
import { STOCKS } from './_stocks.js';

export const HIDDEN_NAME = new Map(HIDDEN);
export const PUBLIC_KEY = 'hiddenpublic';
export const INDEX_MIN = 3;
export const CORE_N = 8;
const SCAN = 200;  // 종목마다 최근 글 몇 개까지 세는지

const IN_TAB = new Set(STOCKS.map(s => s.code));
// 탭에서 빠진 옛 종목 → 종목 정보 (미국 종목은 티커·ETF 여부도)
export const DROPPED = new Map(LEGACY.filter(r => !IN_TAB.has(r[0])).map(([code, name, market, ticker, etf]) =>
  [code, { code, name, market, ...(ticker ? { us: true, ticker, ...(etf ? { etf: true } : {}) } : {}) }]));
// 업종 탭마다 시총 상위 CORE_N개 → 항상 검색 노출
const SECTOR_KEYS = [...new Set(STOCKS.flatMap(s => Object.keys(s.sectors)))];
const CORE = new Set(SECTOR_KEYS.flatMap(k => STOCKS.filter(s => s.sectors[k]).sort((a, b) => a.sectors[k].order - b.sectors[k].order).slice(0, CORE_N).map(s => s.code)));

// 이 종목 페이지가 회원 토론글 기준을 따라야 하는지 (아니면 항상 검색 노출)
export const needsPosts = code => !CORE.has(code);
// 회원 토론글 기준 대상인 종목 코드인지 (탭 밖 종목 포함 — RSS에서 게시판 구분용)
export const isStockBoard = code => IN_TAB.has(code) || DROPPED.has(code) || HIDDEN_NAME.has(code);

// 업종 탭에 없는 종목 중 페이지를 열 수 있는 것 → 종목 정보, 아니면 null
export async function publicExtra(code) {
  if (IN_TAB.has(code)) return null;
  if (DROPPED.has(code)) return DROPPED.get(code);
  if (!HIDDEN_NAME.has(code)) return null;
  const [on] = await redis([['SISMEMBER', PUBLIC_KEY, code]]);
  return Number(on) === 1 ? { code, name: HIDDEN_NAME.get(code) } : null;
}

// 회원 토론글 수 세기 (검색 노출 기준)
const isMemberPost = p => p && p.uid && !p.ai && !p.official && !p.blind;

// codes 중 검색 노출 기준을 넘은 종목 → Map(코드 → 가장 최근 회원 글 시각)
export async function indexable(codes) {
  const out = new Map();
  codes = [...new Set(codes)];
  if (!codes.length) return out;
  const lists = await redis(codes.map(c => ['LRANGE', `posts:${c}`, 0, SCAN - 1]));
  const ids = lists.flat().filter(Boolean);
  if (!ids.length) return out;
  const [raws] = await redis([['MGET', ...ids.map(id => `post:${id}`)]]);
  const stat = new Map();
  for (const r of raws || []) {
    if (!r) continue;
    const p = JSON.parse(r);
    if (!isMemberPost(p)) continue;
    const s = stat.get(p.code) || { n: 0, ts: 0 };
    s.n++; s.ts = Math.max(s.ts, p.editedTs || p.ts || 0);
    stat.set(p.code, s);
  }
  for (const [c, s] of stat) if (s.n >= INDEX_MIN) out.set(c, s.ts);
  return out;
}

// 회원 토론글 기준 대상 전체(탭의 상위 CORE_N 밖 종목·빠진 종목·공개된 숨은 종목) 중 기준을 넘은 것 — 사이트맵·RSS용
// 글이 하나라도 있는 종목만 세어 봄 (postcount)
export async function indexableAll() {
  const [flat, pub] = await redis([['HGETALL', 'postcount'], ['SMEMBERS', PUBLIC_KEY]]);
  const pubSet = new Set(pub || []);
  const codes = [];
  for (let i = 0; i < (flat || []).length; i += 2) {
    const c = flat[i];
    if (Number(flat[i + 1]) < INDEX_MIN) continue;
    if ((IN_TAB.has(c) && !CORE.has(c)) || DROPPED.has(c) || pubSet.has(c)) codes.push(c);
  }
  return indexable(codes);
}
