// Upstash Redis REST 클라이언트 (의존성 없이 fetch 사용)
// Vercel Marketplace 연결 시 KV_REST_API_URL / KV_REST_API_TOKEN 환경변수가 자동 등록됨
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const dbReady = () => Boolean(URL_ && TOKEN);

// 여러 명령을 한 번에 실행: redis([['GET','a'], ['SET','b','1']]) → [결과, 결과]
export async function redis(commands) {
  if (!dbReady()) throw new Error('DB가 연결되지 않았습니다');
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const out = await r.json();
  return out.map(x => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}
