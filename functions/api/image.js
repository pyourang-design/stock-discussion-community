// POST /api/image → 운영자 칼럼 본문 사진 업로드 (관리자 모드 전용)
// 본문 = 사진 파일 그대로, Content-Type: image/webp|jpeg|png|gif, X-Admin-Key: 관리자 세션 토큰(adm_…)
// 사진은 Workers KV(IMAGES)에 img:{id} 로 저장, 응답 { url: '/img/{id}.{확장자}' } → 본문에 [사진:/img/…] 으로 넣음
// (functions/api/[name].js 보다 이 파일이 우선 적용됨)
import { redis, dbReady } from '../../api/_redis.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
// 파일 앞부분(시그니처)으로 실제 그림 형식 확인 — 확장자·형식만 바꾼 다른 파일(SVG·HTML 등) 차단
const MAGIC = {
  webp: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  jpg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  gif: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  try {
    for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string') process.env[k] = v;
    if (!env.IMAGES || !dbReady()) return json({ error: '사진 저장소가 연결되지 않았습니다' }, 503);
    const token = request.headers.get('X-Admin-Key') || '';
    if (!/^adm_[0-9a-f]{48}$/.test(token)) return json({ error: '관리자 모드에서만 사진을 올릴 수 있습니다' }, 403);
    const [ok] = await redis([['EXISTS', `admsess:${token}`]]);
    if (!Number(ok)) return json({ error: '관리자 로그인이 만료되었습니다. 관리자 비밀번호로 다시 로그인해주세요' }, 401);

    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
    const ext = TYPES[type];
    if (!ext) return json({ error: 'JPG·PNG·WEBP·GIF 사진만 올릴 수 있습니다' }, 400);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return json({ error: '사진은 한 장에 5MB까지 올릴 수 있습니다' }, 400);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: '사진은 한 장에 5MB까지 올릴 수 있습니다' }, 400);
    if (!MAGIC[ext](bytes)) return json({ error: '사진 파일 형식이 올바르지 않습니다' }, 400);

    const id = [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('') + '.' + ext;
    await env.IMAGES.put(`img:${id}`, bytes, { metadata: { type, size: bytes.length, ts: Date.now() } });
    return json({ url: `/img/${id}`, size: bytes.length });
  } catch (err) {
    console.error('image upload', err);
    return json({ error: '사진을 올리지 못했습니다. 잠시 후 다시 시도해주세요' }, 500);
  }
}

export const onRequest = () => json({ error: 'Method Not Allowed' }, 405);
