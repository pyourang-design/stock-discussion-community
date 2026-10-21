// POST /api/sihwang → 주식 시황 초안 (예약 실행 Claude Code 루틴 전용)
// 헤더 X-Draft-Key: SIHWANG_DRAFT_KEY 시크릿과 같아야 함 — 이 열쇠로는 데이터 받기·초안 저장·사진 올리기(/api/image)만 됨 (글 등록·수정·삭제 불가)
// 본문 { op: 'data', market? }             시황 데이터 — market 'kr'(기본, 국내 장 마감 api/_sihwangData.js) | 'us'(미국 장 마감 api/_usData.js), 휴장일이면 { tradingDay: false }
//      { op: 'save', title, content, market? }  초안 저장 (Redis sihwang:draft · sihwang:draft:us, 7일) → 관리자 모드 주식 시황 탭 맨 위 초안 카드
// (functions/api/[name].js 보다 이 파일이 우선 적용됨)
import { redis, dbReady } from '../../api/_redis.js';
import { sihwangData } from '../../api/_sihwangData.js';
import { usData } from '../../api/_usData.js';
import { renderRich } from '../../api/_rich.js';

const DRAFT_KEYS = { kr: 'sihwang:draft', us: 'sihwang:draft:us' };  // api/posts.js SIHWANG_DRAFT_KEYS와 같음
const TITLE_MAX = 100, CONTENT_MAX = 3000;  // api/posts.js checkTitle · SIHWANG_MAX와 같음
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequestPost({ request, env }) {
  for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
  if (!sameKey(request.headers.get('X-Draft-Key') || '', env.SIHWANG_DRAFT_KEY || '')) return json({ error: 'forbidden' }, 403);
  if (!dbReady()) return json({ error: 'DB 연결 없음' }, 503);
  try {
    const b = await request.json().catch(() => ({}));
    const market = b.market === 'us' ? 'us' : 'kr';
    if (b.op === 'data') return json(await (market === 'us' ? usData : sihwangData)(Date.now(), new URL(request.url).origin));
    if (b.op === 'save') {
      const title = String(b.title ?? '').trim(), content = String(b.content ?? '').replace(/\r\n/g, '\n').trim();
      if (!title || title.length > TITLE_MAX) return json({ error: `제목은 1~${TITLE_MAX}자` }, 400);
      if (!content || content.length > CONTENT_MAX) return json({ error: `본문은 1~${CONTENT_MAX}자 (지금 ${content.length}자)` }, 400);
      const draft = { title, content, ts: Date.now() };
      await redis([['SET', DRAFT_KEYS[market], JSON.stringify(draft), 'EX', 7 * 86400]]);
      // 저장한 그대로의 화면용 HTML을 돌려줌 (표·그래프 문법이 제대로 그려졌는지 루틴이 확인)
      return json({ saved: true, chars: content.length, html: renderRich(content) });
    }
    return json({ error: 'unknown op' }, 400);
  } catch (err) {
    console.error('sihwang', err);
    return json({ error: String(err.message || err) }, 500);
  }
}

export const onRequest = () => json({ error: 'Method Not Allowed' }, 405);
