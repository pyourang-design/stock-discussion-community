// POST /api/sihwang → 주식 시황 초안 (예약 실행 Claude Code 루틴 전용)
// 헤더 X-Draft-Key: SIHWANG_DRAFT_KEY 시크릿과 같아야 함 — 이 열쇠로는 데이터 받기·초안 저장·사진 올리기(/api/image)만 됨 (글 등록·수정·삭제 불가)
// 본문 { op: 'data', market? }             시황 데이터 — market 'kr'(기본, 국내 장 마감 api/_sihwangData.js) | 'us'(미국 장 마감 api/_usData.js), 휴장일이면 { tradingDay: false }
//      { op: 'save', title, content, market? }  초안 저장 (Redis sihwang:draft · sihwang:draft:us · sihwang:draft:weekly, 7일) → 관리자 모드 주식 시황 탭 맨 위 초안 카드
//   market 'weekly'(2026-11-18~): 주간 시황 리뷰 — op 'data'는 최근 7일 일간 시황 글 전문(봉 차트 줄 제외)과 지난 주간 리뷰 제목을 돌려줌 (토요일 아침 루틴)
// (functions/api/[name].js 보다 이 파일이 우선 적용됨)
import { redis, dbReady } from '../../api/_redis.js';
import { sihwangData } from '../../api/_sihwangData.js';
import { usData } from '../../api/_usData.js';
import { renderRich, richTextLength } from '../../api/_rich.js';

const DRAFT_KEYS = { kr: 'sihwang:draft', us: 'sihwang:draft:us', weekly: 'sihwang:draft:weekly' };  // api/posts.js SIHWANG_DRAFT_KEYS와 같음
const TITLE_MAX = 100, CONTENT_MAX = 3000, RAW_MAX = 12000;  // api/posts.js checkTitle · SIHWANG_MAX · SIHWANG_RAW_MAX와 같음 (CONTENT_MAX는 표·그래프 블록을 뺀 글자 수)
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// 주간 리뷰 재료: 최근 7일 일간 시황 글(국내·미국) 전문 — 40거래일 봉 차트 줄은 빼서 크기를 줄임, 주간 리뷰 글 자신은 제외
const WEEKLY_RE = /주간 시황 리뷰/;
async function weeklyData(now) {
  const [ids] = await redis([['LRANGE', 'posts:COLNEWS', 0, 119]]);
  if (!ids?.length) return { posts: [], weekly: [], lastWeekly: null };
  const [raws] = await redis([['MGET', ...ids.map(id => `post:${id}`)]]);
  const all = (raws || []).filter(Boolean).map(r => JSON.parse(r)).filter(p => !p.blind);
  const strip = c => {  // [봉:…] 줄부터 [/봉] 줄까지(40거래일 일봉)를 한 줄로
    const out = []; let skip = false;
    for (const line of String(c).split('\n')) {
      if (!skip && /^\[봉(:|\])/.test(line)) { skip = true; out.push('[봉 차트 생략]'); continue; }
      if (skip) { if (line.startsWith('[/봉]')) skip = false; continue; }
      out.push(line);
    }
    return out.join('\n');
  };
  const posts = all.filter(p => !WEEKLY_RE.test(p.title || '') && p.ts >= now - 7 * 86400000).sort((a, b) => a.ts - b.ts).map(p => ({ id: p.id, title: p.title, ts: p.ts, content: strip(p.content) }));
  const weeklies = all.filter(p => WEEKLY_RE.test(p.title || '')).sort((a, b) => b.ts - a.ts);
  const weekly = weeklies.slice(0, 4).map(p => p.title);  // 지난 주간 리뷰 제목들 (틀·형식이 겹치지 않게 보라는 용도)
  const lastWeekly = weeklies[0] ? { id: weeklies[0].id, title: weeklies[0].title, content: strip(weeklies[0].content) } : null;  // 바로 지난 리뷰 전문 — 그때의 전망을 이번 주 실제와 대조하는 용도
  return { posts, weekly, lastWeekly, note: '국내 시황은 MM/DD 국내 시황, 미국 시황은 MM/DD 미국 시황(미국 거래일 날짜). 이 주의 월~금 거래일 글만 사용' };
}

export async function onRequestPost({ request, env }) {
  for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
  if (!sameKey(request.headers.get('X-Draft-Key') || '', env.SIHWANG_DRAFT_KEY || '')) return json({ error: 'forbidden' }, 403);
  if (!dbReady()) return json({ error: 'DB 연결 없음' }, 503);
  try {
    const b = await request.json().catch(() => ({}));
    const market = b.market === 'us' ? 'us' : b.market === 'weekly' ? 'weekly' : 'kr';
    if (b.op === 'data' && market === 'weekly') return json(await weeklyData(Date.now()));
    if (b.op === 'data') return json(await (market === 'us' ? usData : sihwangData)(Date.now(), new URL(request.url).origin));
    if (b.op === 'save') {
      const title = String(b.title ?? '').trim(), content = String(b.content ?? '').replace(/\r\n/g, '\n').trim();
      if (!title || title.length > TITLE_MAX) return json({ error: `제목은 1~${TITLE_MAX}자` }, 400);
      const chars = richTextLength(content);
      if (!chars || chars > CONTENT_MAX) return json({ error: `표·그래프를 뺀 본문은 1~${CONTENT_MAX}자 (지금 ${chars}자)` }, 400);
      if (content.length > RAW_MAX) return json({ error: `표·그래프까지 합친 본문은 ${RAW_MAX}자까지 (지금 ${content.length}자)` }, 400);
      const draft = { title, content, ts: Date.now() };
      await redis([['SET', DRAFT_KEYS[market], JSON.stringify(draft), 'EX', 7 * 86400]]);
      // 저장한 그대로의 화면용 HTML을 돌려줌 (표·그래프 문법이 제대로 그려졌는지 루틴이 확인)
      return json({ saved: true, chars, rawChars: content.length, html: renderRich(content) });
    }
    return json({ error: 'unknown op' }, 400);
  } catch (err) {
    console.error('sihwang', err);
    return json({ error: String(err.message || err) }, 500);
  }
}

export const onRequest = () => json({ error: 'Method Not Allowed' }, 405);
