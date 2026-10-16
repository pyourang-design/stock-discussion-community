// POST /api/ai → AI 운영자 자동 글 (예약 실행 Worker `upjong-ai-cron`이 5분마다 호출)
// 헤더 X-Cron-Key: CRON_KEY 시크릿과 같아야 함 (Pages·Worker 양쪽에 같은 값)
// 본문 { op: 'run' }                       소개글(하루 10개)·실적 발표 글 처리 → 한 일 요약
//      { op: 'dart', path, params }        DART 조회 그대로 전달 (점검용)
//      { op: 'preview', code, kind? }      글을 올리지 않고 만들어 보기만 (점검용)
// (functions/api/[name].js 보다 이 파일이 우선 적용됨)
import { dart, runOnce, buildPost } from '../../api/_ai.js';
import { buildMorning, buildSectorClose, buildMarketClose, buildDisclosurePost, classifyDisclosure } from '../../api/_aiMarket.js';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function sameKey(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequestPost({ request, env }) {
  for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
  if (!sameKey(request.headers.get('X-Cron-Key') || '', env.CRON_KEY || '')) return json({ error: 'forbidden' }, 403);
  if (!env.DART_API_KEY) return json({ error: 'DART_API_KEY 없음' }, 503);
  try {
    const b = await request.json().catch(() => ({}));
    if (b.op === 'dart') {
      if (b.path === 'corpCode.xml') return fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${env.DART_API_KEY}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; upjong.com)' } });
      return json(await dart(String(b.path || ''), b.params || {}));
    }
    // 시장·업종 글 미리보기: market = morning | sector(key) | close | disc(key, day)
    if (b.op === 'previewMarket') {
      const now = Date.now();
      if (b.market === 'morning') return json(await buildMorning(now));
      if (b.market === 'sector') return json(await buildSectorClose(String(b.key), now, b.kospi ?? null));
      if (b.market === 'close') return json(await buildMarketClose(now, b.stats || {}));
      if (b.market === 'disc') {
        const day = String(b.day || ''), items = [];
        for (const [ty, cls] of [['B', 'Y'], ['B', 'K'], ['I', 'Y'], ['I', 'K']]) {
          const j = await dart('list.json', { bgn_de: day, end_de: day, pblntf_ty: ty, corp_cls: cls, page_count: '100' });
          for (const x of j.list || []) { const label = classifyDisclosure(x.report_nm); if (label) items.push({ code: x.stock_code, label, nm: x.report_nm, rcept: x.rcept_no }); }
        }
        return json(buildDisclosurePost(String(b.key), items, now) || { skip: '공시 없음' });
      }
    }
    if (b.op === 'preview') return json(await buildPost(String(b.code || ''), b.kind === 'earnings' ? 'earnings' : 'intro', b.report || null));
    if (b.op === 'run') return json(await runOnce(Date.now()));
    return json({ error: 'unknown op' }, 400);
  } catch (err) {
    console.error('ai', err);
    return json({ error: String(err.message || err) }, 500);
  }
}
