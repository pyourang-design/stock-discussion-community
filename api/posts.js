// 토론 게시글 · 좋아요 · 팔로우 API (Upstash Redis)
//
// GET  /api/posts?code=068270&cid=..   → 종목 게시글 목록
// GET  /api/posts?counts=1             → 종목별 게시글 수
// POST /api/posts { action: 'create', cid, code, nick, password, content, sentiment }   비회원 글
// POST /api/posts { action: 'create', cid, code, content, sentiment, asOperator: true, adminKey }   운영자 글 (관리자 모드)
// POST /api/posts { action: 'create', cid, code, token, content, sentiment }             회원 글 (닉네임·비밀번호 없이)
// POST /api/posts { action: 'edit',   cid, id, password | token, content, sentiment }
// POST /api/posts { action: 'delete', cid, id, password | token }
// POST /api/posts { action: 'signup', cid, userId, nick, password }   회원가입 → { token, user }
// POST /api/posts { action: 'login',  cid, userId, password }         로그인 → { token, user }
// POST /api/posts { action: 'me',     cid, token }                    로그인 상태 확인 → { user }
// POST /api/posts { action: 'logout', cid, token }
// POST /api/posts { action: 'visit', cid }                     사이트 조회수 +1 (같은 브라우저 30분에 1회) → { today, total }
// POST /api/posts { action: 'viewBoard', cid, code, ids }       토론 창에 보인 글 조회수 +1 (같은 브라우저·게시판 1시간에 1회) → { views }
// POST /api/posts { action: 'report', cid, id, reason }        게시글 신고 (서로 다른 브라우저 5건 → 자동 블라인드)
// POST /api/posts { action: 'contact', cid, type, name, email, message }   연락처 문의
// POST /api/posts { action: 'adminReports',  cid, adminKey }      신고된 글 목록 (원문 포함)
// POST /api/posts { action: 'adminUnblind',  cid, id, adminKey }  신고 기록 초기화·블라인드 해제
// POST /api/posts { action: 'adminContacts', cid, adminKey }      문의 목록
// POST /api/posts { action: 'adminStats',    cid, adminKey }      사이트 통계 (방문·회원·게시글, 최근 14일)
// POST /api/posts { action: 'columnList',    cid } 운영자 칼럼 목록 (누구나 읽기) — 제목·본문·조회수만 (명령 3개)
// POST /api/posts { action: 'columnPost',    cid, id } 칼럼 한 편의 공감·비공감 (글을 열 때)
// POST /api/posts { action: 'adminImages',   cid, adminKey, cleanup? } 칼럼 사진 저장소 현황 / 안 쓰는 사진 정리
//   운영자 칼럼(COLUMN_CODE): 주식 시장 경제 게시판의 칼럼 탭 — 관리자 모드에서만 쓰기, 누구나 읽기, 제목(최대 100자) + 본문(최대 2000자)
//   (2026-10-14부터 공개: RSS·작성자 목록(author:운영자)에도 포함, 바로가기 /?column={id})
// POST /api/posts { action: 'favList',   cid, token }            관심 종목 목록 → { codes }
// POST /api/posts { action: 'favToggle', cid, token, code, on }  관심 종목 추가(on=true)·해제
// POST /api/posts { action: 'adminCheck',  cid, adminKey }       관리자 로그인 확인
// POST /api/posts { action: 'adminDelete', cid, id, adminKey }   관리자 삭제 (ADMIN_PASSWORD 환경변수)
// POST /api/posts { action: 'like',   cid, id }               공감 토글 (예전 화면 호환)
// POST /api/posts { action: 'vote',   cid, id, type: 'up'|'down' }   공감·비공감 토글 (둘 중 하나만)
// 팔로우 (회원 전용: 로그인한 회원이 다른 회원 닉네임을 팔로우)
// POST /api/posts { action: 'follow',  cid, token, nick, follow: true|false }
// POST /api/posts { action: 'author',  cid, nick, token? }   작성자 전체글 + 팔로워 수 + 내 팔로우 여부 + 회원 여부
// POST /api/posts { action: 'followingList', cid, token }  내가 팔로우한 닉네임 목록
// POST /api/posts { action: 'feed',    cid, token }        내가 팔로우한 회원들의 글
// 회원정보
// POST /api/posts { action: 'profile', cid, token }        내 정보 · 작성글/팔로워/팔로잉/관심 종목 수
// POST /api/posts { action: 'changePassword', cid, token, password, newPassword }
// POST /api/posts { action: 'withdraw', cid, token, password }   회원 탈퇴 (계정·세션·관심 종목·팔로우 삭제, 글은 남음)
//
// Redis 키
//   post:{id}          게시글 JSON
//   posts:{code}       종목별 게시글 id 목록 (최신순)
//   author:{nick}      작성자별 게시글 id 목록 (최신순)
//   likes:{id}         공감 누른 cid 집합
//   dislikes:{id}      비공감 누른 cid 집합
//   postcount          종목코드 → 게시글 수 (hash)
//   mfollowing:{아이디} 회원이 팔로우한 회원 닉네임 집합
//   mfollowers:{닉네임} 해당 회원을 팔로우한 회원 아이디 집합
//   usess:{아이디}      회원의 로그인 세션 token 집합 (탈퇴·비밀번호 변경 시 전체 로그아웃)
//   pw:{id}            게시글 비밀번호 해시 (salt:scrypt hash, 응답에 절대 포함하지 않음)
//   pwfail:{id}        비밀번호 연속 실패 횟수 (10분)
//   user:{아이디 소문자} 회원 JSON { id, nick, pw(salt:scrypt hash), ts }
//   nickowner:{닉네임}  회원 닉네임 → 아이디 (닉네임 중복 방지, 비회원은 회원 닉네임 사용 불가, 탈퇴하면 '-'로 예약)
//   sess:{token}       로그인 세션 → 아이디 (30일)
//   loginfail:{아이디}  로그인 연속 실패 횟수 (10분)
//   fav:{아이디}        회원 관심 종목코드 집합
//   favhidden          숨은 종목(업종 탭에 없는 상장 종목, api/_hidden.js)코드 → 관심 종목으로 담은 회원 수 (hash) — AI 운영자 실적 글 대상
//   ai:introq          숨은 종목 AI 소개글 대기열 (처음 관심 종목으로 담길 때 넣음, api/_ai.js가 처리), ai:introseen 한 번 넣은 종목 (set)
//   reports:{id}       게시글을 신고한 cid 집합, reportwhy:{id} 신고 사유별 건수(hash)
//   reported           신고된 게시글 id → 신고 수 (sorted set)
//   contacts           연락처 문의 JSON 목록 (최신순, 최대 500건)
//   views:total        사이트 누적 조회수, views:{YYYYMMDD} 날짜별(한국시간) 조회수 (400일 보관)
//   uv:total, uv:{YYYYMMDD}  순방문자(브라우저 cid 기준 HyperLogLog, 2026-10-14부터 집계, 날짜별 400일 보관)
//   postviews          게시글 id → 조회수 (hash)
//   게시글의 uid(회원 아이디)는 서버에서만 쓰고 응답에서는 member: true 로만 표시
import crypto from 'crypto';
import { COLUMN_ORDER_KEY, sortColumns } from './_colorder.js';
import { redis, dbReady } from './_redis.js';
import { HIDDEN } from './_hidden.js';

const MAX_CONTENT = 1000;
const COLUMN_CODE = 'COLMKT';
const COLUMN_MAX = 2000;
const COLUMN_TITLE_MAX = 100;
// 칼럼 본문 사진 [사진:/img/{id}] → 사진 저장소(Workers KV, 키 img:{id}) 정리용
const IMG_TAG_RE = /\[사진:\/img\/([0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/g;
const imagesIn = text => new Set([...String(text || '').matchAll(IMG_TAG_RE)].map(m => m[1]));
const ORPHAN_AGE = 24 * 3600e3;  // 올린 지 하루가 지나도 어느 칼럼에도 없는 사진만 정리 (쓰는 중인 글의 사진 보호)
async function deleteImages(env, ids) {
  if (!env?.IMAGES || !ids.length) return 0;
  await Promise.all(ids.map(id => env.IMAGES.delete(`img:${id}`)));
  // 이 서버(지역)의 캐시도 비움 — 다른 지역 캐시는 남을 수 있지만 글에서 빠진 사진이라 보이지 않음
  if (typeof caches !== 'undefined') await Promise.all(ids.map(id => caches.default.delete(new Request(`https://upjong.com/img/${id}`)).catch(() => false)));
  return ids.length;
}
// 사진 저장소 현황: 전체·안 쓰는 사진 (cleanup이면 하루 지난 안 쓰는 사진 삭제)
async function imageStats(env, cleanup) {
  if (!env?.IMAGES) return { available: false };
  const keys = [];
  let cursor;
  do {
    const r = await env.IMAGES.list({ prefix: 'img:', cursor });
    keys.push(...r.keys);
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor && keys.length < 20000);
  const [ids] = await redis([['LRANGE', `posts:${COLUMN_CODE}`, 0, -1]]);
  const [raws] = ids?.length ? await redis([['MGET', ...ids.map(id => `post:${id}`)]]) : [[]];
  const used = new Set();
  for (const r of raws || []) if (r) for (const id of imagesIn(JSON.parse(r).content)) used.add(id);
  const now = Date.now();
  const all = keys.map(k => ({ id: k.name.slice(4), size: Number(k.metadata?.size) || 0, ts: Number(k.metadata?.ts) || 0 }));
  const unused = all.filter(x => !used.has(x.id));
  const old = unused.filter(x => now - x.ts > ORPHAN_AGE);
  const deleted = cleanup ? await deleteImages(env, old.map(x => x.id)) : 0;
  const sum = list => list.reduce((a, x) => a + x.size, 0);
  return { available: true, count: all.length, bytes: sum(all), used: all.length - unused.length, unused: unused.length, unusedOld: old.length, unusedBytes: sum(unused), deleted, limitBytes: 1024 ** 3 };
}
function checkTitle(title) {
  title = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!title) throw new BadRequest('제목을 입력해주세요');
  if (title.length > COLUMN_TITLE_MAX) throw new BadRequest(`제목은 최대 ${COLUMN_TITLE_MAX}자까지 입력할 수 있습니다`);
  checkBanned(title, '제목');
  return title;
}
const MAX_NICK = 10;
const PW_MIN = 4, PW_MAX = 20;
const PW_FAIL_LIMIT = 5;          // 10분 내 5회 틀리면 잠금
const LOGIN_FAIL_ACCOUNT = 20;    // 한 계정에 10분 내 20회 틀리면 (IP와 무관하게) 잠금
const NICK_RE = /^[가-힣]{1,10}$/; // 한글(완성형)만, 최대 10자
const LIST_LIMIT = 200;
const SENTIMENTS = ['up', 'down', 'neutral'];
// 회원: 아이디 영문 또는 영문+숫자 4~20자, 닉네임 한글 2~10자, 비밀번호 6~30자
const USER_ID_RE = /^(?=.*[A-Za-z])[A-Za-z0-9]{4,20}$/;
const MEMBER_NICK_RE = /^[가-힣]{2,10}$/;
const MEMBER_PW_MIN = 6, MEMBER_PW_MAX = 30;
// 운영자 계정 닉네임 (관리자 모드에서 쓴 글)
const OPERATOR_NICK = '운영자';
// 운영진 사칭 방지: 회원가입·비회원 글쓰기 닉네임 모두 사용 불가
const RESERVED_NICK_RE = /운영자|관리자|운영진|운영팀|관리팀|어드민|스태프|업종토론방/;
const SESSION_TTL = 30 * 24 * 3600;
const FAV_MAX = 300;
const VISIT_GAP = 1800;        // 사이트 조회수: 같은 브라우저 30분에 1회
const BOARD_VIEW_GAP = 3600;  // 글 조회수: 같은 브라우저·게시판 1시간에 1회
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const REPORT_BLIND = 5;  // 신고 5건 누적 시 자동 블라인드
const REPORT_REASONS = ['욕설·비방', '광고·스팸', '허위사실·시세조종', '음란·불법', '기타'];
const BLIND_TEXT = '신고가 누적되어 블라인드 처리된 글입니다. 운영자가 검토 중입니다.';

// 금칙어: 기호를 지운 뒤 포함 여부 확인 (시.발 같은 회피 방지). 띄어쓰기는 지우지 않음 ("하락 시 발생" 오탐 방지)
// 단, 오픈채팅·수익보장 같은 광고 문구(SPAM_JOINED)는 띄어쓰기까지 지우고 확인
const BANNED = [
  '시발', '씨발', '씨빨', '시빨', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '븅신', '좆', '존나', '졸라', '개새끼', '개새기', '새끼', '지랄', 'ㅈㄹ',
  '미친놈', '미친년', '닥쳐', '꺼져', '등신', '애미', '느금마', '니미', '창녀', '걸레년',
  '리딩방', '오픈채팅', '오픈톡', 'open.kakao', '카톡방', '텔레그램', 't.me/', '수익보장', '원금보장', '무료리딩', '무료추천방',
  '종목추천방', 'vip방', '급등주무료', '카지노사이트', '온라인카지노', '바카라', '토토사이트', '불법대출',
];
const SPAM_JOINED = ['리딩방', '오픈채팅', '오픈톡', '카톡방', '수익보장', '원금보장', '무료리딩', '무료추천방', '종목추천방', '급등주무료', '카지노사이트', '온라인카지노', '토토사이트', '불법대출'];
const ALLOWED = ['시발점', '시발역', '등신대', '새끼손가락'];  // 금칙어를 포함하지만 정상인 단어
const normalize = t => ALLOWED.reduce((x, w) => x.split(w).join(''), String(t).toLowerCase())
  .replace(/[.,·~!@#$%^&*()\-_=+\[\]{}|;:'"<>?/\\]/g, '');
// 기호가 들어간 금칙어(t.me/ 등)는 원문 그대로만 비교 (settlement → tme 같은 오탐 방지)
const BANNED_N = BANNED.map(w => ({ w, n: /[^가-힣ㄱ-ㅎa-z0-9]/.test(w) ? null : normalize(w) }));
function checkBanned(text, label = '내용') {
  const raw = String(text).toLowerCase(), n = normalize(text), joined = n.replace(/\s+/g, '');
  const hit = BANNED_N.find(b => (b.n ? n.includes(b.n) : raw.includes(b.w))) || SPAM_JOINED.find(w => joined.includes(w));
  if (hit) throw new BadRequest(`${label}에 사용할 수 없는 표현(욕설·광고·외부 유도)이 있습니다. 게시판 운영정책을 확인해주세요`);
}

// 국내 종목코드(6자리) · 미국 종목(네이버 해외주식 코드: TSLA.O, BRKb) · 업종 게시판(SECBIO)
// 숨은 종목을 관심 종목으로 담은 회원 수 (AI 운영자 실적 글 대상) + 처음 담긴 종목은 AI 소개글 대기열에 (api/_ai.js runOnce)
const HIDDEN_CODES = new Set(HIDDEN.map(h => h[0]));
async function countHiddenFav(codes, d) {
  const hidden = codes.filter(c => HIDDEN_CODES.has(c));
  if (!hidden.length) return;
  await redis(hidden.map(c => ['HINCRBY', 'favhidden', c, d]));
  if (d < 0) return;
  const seen = await redis(hidden.map(c => ['SADD', 'ai:introseen', c]));
  const fresh = hidden.filter((_, i) => Number(seen[i]) === 1);
  if (fresh.length) await redis([['RPUSH', 'ai:introq', ...fresh]]);
}
const isCode = c => typeof c === 'string' && (/^[0-9][0-9A-Z]{5}$/.test(c) || /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c));
const isCid = c => typeof c === 'string' && /^[0-9a-zA-Z-]{8,64}$/.test(c);
const cleanNick = n => String(n ?? '').trim().slice(0, MAX_NICK);
const isPostId = id => /^[0-9a-z]{6,20}$/.test(id || '');

function checkPassword(pw) {
  pw = String(pw ?? '');
  if (pw.length < PW_MIN || pw.length > PW_MAX) throw new BadRequest(`비밀번호는 ${PW_MIN}~${PW_MAX}자로 입력해주세요`);
  return pw;
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function samePassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(pw, salt, 32), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 수정·삭제 전 작성자 확인: 회원 글은 로그인한 본인, 비회원 글은 비밀번호 검증 (연속 실패 시 잠금)
async function authorize(id, password, token, adminKey, ip) {
  if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
  const [rawPost] = await redis([['GET', `post:${id}`]]);
  if (!rawPost) throw new BadRequest('게시글이 없습니다');
  const target = JSON.parse(rawPost);
  // 운영자 글: 관리자 비밀번호로만 수정·삭제
  if (target.official) {
    await checkAdmin(adminKey, ip);
    return target;
  }
  if (target.uid) {
    const user = await sessionUser(token);
    if (!user || user.id.toLowerCase() !== target.uid) throw new BadRequest('작성한 회원만 수정·삭제할 수 있습니다');
    return target;
  }
  const pw = String(password ?? '');
  if (!pw) throw new BadRequest('비밀번호를 입력해주세요');
  const [raw, stored, fails] = await redis([['GET', `post:${id}`], ['GET', `pw:${id}`], ['GET', `pwfail:${id}`]]);
  if (!raw) throw new BadRequest('게시글이 없습니다');
  if (Number(fails) >= PW_FAIL_LIMIT) throw new BadRequest('비밀번호를 여러 번 틀려 10분간 잠겼습니다');
  if (!samePassword(pw, stored)) {
    await redis([['INCR', `pwfail:${id}`], ['EXPIRE', `pwfail:${id}`, 600]]);
    throw new BadRequest('비밀번호가 일치하지 않습니다');
  }
  await redis([['DEL', `pwfail:${id}`]]);
  return JSON.parse(raw);
}

// ── 관리자 사이트 통계 ──
// 방문: views:{날짜}(30분 안 재방문 제외한 방문 수), 순방문자: uv:{날짜}
// 회원: 카운터 members:total(가입 +1, 탈퇴 -1), members:{날짜}(그날 가입 수, 400일) — 가입·탈퇴 때 갱신
//   카운터가 생기기 전(2026-10-15) 회원은 처음 통계를 열 때 한 번만 user:*를 훑어 채움(initMemberCounters)
// 게시글: 게시판별 목록(posts:{코드})의 글 id 앞부분이 작성 시각(Date.now 36진수)이라 날짜별로 셈 (삭제된 글 제외)
const STATS_DAYS = 14;
const kstDayOf = ts => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const postTs = id => parseInt(id.slice(0, -6), 36);
async function initMemberCounters() {
  const [lock] = await redis([['SET', 'members:init', '1', 'NX']]);
  if (lock !== 'OK') return;  // 이미 채웠음 (또는 다른 요청이 채우는 중)
  try {
    const keys = [];
    let cursor = '0';
    do {
      const [[next, found]] = await redis([['SCAN', cursor, 'MATCH', 'user:*', 'COUNT', 1000]]);
      cursor = String(next);
      keys.push(...found);
    } while (cursor !== '0');
    const users = [];
    for (let i = 0; i < keys.length; i += 500) {
      const [vals] = await redis([['MGET', ...keys.slice(i, i + 500)]]);
      users.push(...vals.filter(Boolean).map(x => JSON.parse(x)));
    }
    const perDay = {};
    for (const u of users) { const d = kstDayOf(u.ts || 0); perDay[d] = (perDay[d] || 0) + 1; }
    // 훑는 사이 가입·탈퇴가 INCR/DECR 했어도 user:* 실제 개수로 맞춤
    await redis([['SET', 'members:total', users.length],
      ...Object.entries(perDay).map(([d, n]) => ['SET', `members:${d}`, n, 'EX', 400 * 86400])]);
  } catch (e) {
    await redis([['DEL', 'members:init']]);  // 실패하면 다음에 다시
    throw e;
  }
}

async function siteStats() {
  const now = Date.now();
  const days = Array.from({ length: STATS_DAYS }, (_, i) => kstDayOf(now - i * 86400e3));
  const today = days[0];

  await initMemberCounters();

  const [countsFlat, reported, contacts, pvFlat, uvTotal, viewsTotal, membersTotal, ...daily] = await redis([
    ['HGETALL', 'postcount'], ['ZCARD', 'reported'], ['LLEN', 'contacts'], ['HVALS', 'postviews'], ['PFCOUNT', 'uv:total'], ['GET', 'views:total'], ['GET', 'members:total'],
    ...days.flatMap(d => [['GET', `views:${d}`], ['PFCOUNT', `uv:${d}`], ['GET', `members:${d}`], ['GET', `pv:${d}`]]),
  ]);
  const boards = [];
  for (let i = 0; i < (countsFlat || []).length; i += 2) if (Number(countsFlat[i + 1]) > 0) boards.push({ code: countsFlat[i], count: Number(countsFlat[i + 1]) });
  const lists = boards.length ? await redis(boards.map(x => ['LRANGE', `posts:${x.code}`, 0, -1])) : [];
  const postDays = lists.flat().filter(Boolean).map(id => kstDayOf(postTs(id)));

  const per = days.map((d, i) => ({
    day: d,
    views: Number(daily[i * 4]) || 0,
    visitors: Number(daily[i * 4 + 1]) || 0,
    members: Number(daily[i * 4 + 2]) || 0,
    postViews: Number(daily[i * 4 + 3]) || 0,  // 글 조회수 (pv:{날짜})
    posts: postDays.filter(x => x === d).length,
  }));
  return {
    today,
    visits: { today: per[0].views, total: Number(viewsTotal) || 0, todayVisitors: per[0].visitors, totalVisitors: Number(uvTotal) || 0, visitorsSince: '20261014' },
    members: { today: per[0].members, total: Math.max(0, Number(membersTotal) || 0) },
    posts: { today: per[0].posts, total: boards.reduce((a, x) => a + x.count, 0), views: (pvFlat || []).reduce((a, v) => a + (Number(v) || 0), 0), viewsToday: per[0].postViews, viewsSince: '20261015' },
    pending: { reported: Number(reported) || 0, contacts: Number(contacts) || 0 },
    days: per,
    boards: boards.sort((a, b) => b.count - a.count).slice(0, 10),
  };
}

// 게시글과 연결된 데이터 모두 삭제
async function removePost(post, env) {
  const [removed] = await redis([['DEL', `post:${post.id}`]]);
  if (!Number(removed)) throw new BadRequest('이미 삭제된 게시글입니다');
  await redis([
    ['DEL', `pw:${post.id}`, `likes:${post.id}`, `dislikes:${post.id}`, `pwfail:${post.id}`, `reports:${post.id}`, `reportwhy:${post.id}`],
    ['ZREM', 'reported', post.id],
    ['HDEL', 'postviews', post.id],
    ['LREM', `posts:${post.code}`, 0, post.id],
    ['LREM', `author:${post.nick}`, 0, post.id],
    ['HINCRBY', 'postcount', post.code, -1],
  ]);
  if (post.code === COLUMN_CODE) await deleteImages(env, [...imagesIn(post.content)]).catch(e => console.error('column image delete', e));
  return { deleted: post.id, code: post.code };
}

// 관리자 확인: 관리자 세션 토큰(adm_…, 로그인 시 발급, 12시간) 또는 관리자 비밀번호(ADMIN_PASSWORD)
// 비밀번호 실패는 접속 IP별 10분 내 5회 · 사이트 전체 10분 내 30회에서 잠금 (cid는 클라이언트가 바꿀 수 있어 잠금 기준으로 쓰지 않음)
const ADMIN_SESSION_TTL = 12 * 3600;
const ADMIN_TOKEN_RE = /^adm_[0-9a-f]{48}$/;
const ADMIN_FAIL_GLOBAL = 30;
async function checkAdmin(key, ip) {
  if (typeof key === 'string' && ADMIN_TOKEN_RE.test(key)) {
    const [ok] = await redis([['EXISTS', `admsess:${key}`]]);
    if (Number(ok)) return;
    throw new BadRequest('관리자 로그인이 만료되었습니다. 관리자 비밀번호로 다시 로그인해주세요');
  }
  const secret = String(process.env.ADMIN_PASSWORD ?? '').trim();  // 대시보드 입력 시 딸려 들어간 앞뒤 공백·줄바꿈 무시
  if (!secret) throw new BadRequest('관리자 비밀번호가 설정되지 않았습니다');
  const failKey = `adminfail:${ip || 'unknown'}`;
  const [fails] = await redis([['GET', failKey]]);
  if (Number(fails) >= PW_FAIL_LIMIT) throw new BadRequest('관리자 비밀번호를 여러 번 틀려 10분간 잠겼습니다');
  const digest = v => crypto.createHash('sha256').update(String(v ?? '')).digest();
  if (!crypto.timingSafeEqual(digest(String(key ?? '').trim()), digest(secret))) {
    const [, , global] = await redis([['INCR', failKey], ['EXPIRE', failKey, 600], ['INCR', 'adminfail:global'], ['EXPIRE', 'adminfail:global', 600, 'NX']]);
    if (Number(global) >= ADMIN_FAIL_GLOBAL) console.warn('관리자 비밀번호 실패가 10분 내 ' + global + '회 — 여러 IP에서 대입 시도 가능성');
    throw new BadRequest('관리자 비밀번호가 일치하지 않습니다');
  }
}

function checkContent(content, max = MAX_CONTENT) {
  content = String(content ?? '').trim();
  if (!content) throw new BadRequest('내용을 입력해주세요');
  if (content.length > max) throw new BadRequest(`최대 ${max}자까지 입력할 수 있습니다`);
  checkBanned(content);
  return content;
}

class BadRequest extends Error {}

// ── 회원 ──
const isToken = t => /^[0-9a-f]{48}$/.test(t || '');
const publicUser = u => ({ id: u.id, nick: u.nick });
const publicPost = p => { const { uid, ...rest } = p; return uid ? { ...rest, member: true } : rest; };

async function sessionUser(token) {
  if (!isToken(token)) return null;
  const [uid] = await redis([['GET', `sess:${token}`]]);
  if (!uid) return null;
  const [raw] = await redis([['GET', `user:${uid}`]]);
  return raw ? JSON.parse(raw) : null;
}

async function newSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const uid = user.id.toLowerCase();
  await redis([['SET', `sess:${token}`, uid, 'EX', SESSION_TTL], ['SADD', `usess:${uid}`, token], ['EXPIRE', `usess:${uid}`, SESSION_TTL]]);
  return { token, user: publicUser(user) };
}

async function signup(b) {
  const userId = String(b.userId ?? '').trim();
  const nick = String(b.nick ?? '').trim();
  const password = String(b.password ?? '');
  if (!USER_ID_RE.test(userId)) throw new BadRequest('아이디는 영문 또는 영문+숫자 4~20자로 입력해주세요');
  if (!MEMBER_NICK_RE.test(nick)) throw new BadRequest('닉네임은 한글 2~10자로 입력해주세요');
  if (nick === '익명' || RESERVED_NICK_RE.test(nick)) throw new BadRequest('사용할 수 없는 닉네임입니다');
  checkBanned(nick, '닉네임');
  if (password.length < MEMBER_PW_MIN || password.length > MEMBER_PW_MAX) throw new BadRequest(`비밀번호는 ${MEMBER_PW_MIN}~${MEMBER_PW_MAX}자로 입력해주세요`);
  const [ok, okIp] = await redis([['SET', `rl:signup:${b.cid}`, '1', 'NX', 'EX', 10], ['SET', `rl:signup:ip:${b._ip}`, '1', 'NX', 'EX', 10]]);
  if (ok !== 'OK' || okIp !== 'OK') throw new BadRequest('잠시 후 다시 시도해주세요');

  const key = userId.toLowerCase();  // 아이디는 대소문자 구분 없이 중복 확인
  // 비회원이 이미 글을 쓴 닉네임도 사용 불가 (작성자 화면이 섞이지 않도록)
  const [usedId, usedNick, guestPosts, goneId] = await redis([['EXISTS', `user:${key}`], ['EXISTS', `nickowner:${nick}`], ['EXISTS', `author:${nick}`], ['EXISTS', `uidgone:${key}`]]);
  if (Number(usedId) || Number(goneId)) throw new BadRequest('이미 사용 중인 아이디입니다');
  if (Number(usedNick) || Number(guestPosts)) throw new BadRequest('이미 사용 중인 닉네임입니다');

  const user = { id: userId, nick, pw: hashPassword(password), ts: Date.now() };
  const [setUser] = await redis([['SET', `user:${key}`, JSON.stringify(user), 'NX']]);
  if (setUser !== 'OK') throw new BadRequest('이미 사용 중인 아이디입니다');
  const [setNick] = await redis([['SET', `nickowner:${nick}`, key, 'NX']]);
  if (setNick !== 'OK') {
    await redis([['DEL', `user:${key}`]]);
    throw new BadRequest('이미 사용 중인 닉네임입니다');
  }
  const joinKey = `members:${kstDay()}`;
  await redis([['INCR', 'members:total'], ['INCR', joinKey], ['EXPIRE', joinKey, 400 * 86400]]);
  return newSession(user);
}

async function login(b) {
  const key = String(b.userId ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!USER_ID_RE.test(key) || !password) throw new BadRequest('아이디와 비밀번호를 입력해주세요');
  const failKey = `loginfail:${key}:${b._ip}`, acctKey = `loginfail:${key}`;
  const [raw, fails, acctFails] = await redis([['GET', `user:${key}`], ['GET', failKey], ['GET', acctKey]]);
  if (Number(fails) >= PW_FAIL_LIMIT || Number(acctFails) >= LOGIN_FAIL_ACCOUNT) throw new BadRequest('비밀번호를 여러 번 틀려 10분간 로그인할 수 없습니다');
  const user = raw ? JSON.parse(raw) : null;
  if (!user || !samePassword(password, user.pw)) {
    if (user) await redis([['INCR', failKey], ['EXPIRE', failKey, 600], ['INCR', acctKey], ['EXPIRE', acctKey, 600, 'NX']]);
    throw new BadRequest('아이디 또는 비밀번호가 일치하지 않습니다');
  }
  await redis([['DEL', failKey]]);
  return newSession(user);
}

// 공감·비공감 수 + 내가 누른 것 조회 명령 (4개)
const voteCmds = (id, cid) => [
  ['SCARD', `likes:${id}`], ['SCARD', `dislikes:${id}`],
  cid ? ['SISMEMBER', `likes:${id}`, cid] : ['ECHO', '0'],
  cid ? ['SISMEMBER', `dislikes:${id}`, cid] : ['ECHO', '0'],
];
const voteFields = ([likes, dislikes, liked, disliked]) => ({
  likes: Number(likes) || 0, dislikes: Number(dislikes) || 0, liked: Number(liked) === 1, disliked: Number(disliked) === 1,
});

// id 목록 → 게시글 + 공감·비공감 수 + 내가 누른 것 + 조회수
async function loadPosts(ids, cid) {
  if (!ids.length) return [];
  const cmds = [];
  ids.forEach(id => cmds.push(['GET', `post:${id}`], ...voteCmds(id, cid), ['HGET', 'postviews', id]));
  const res = await redis(cmds);
  const posts = [];
  ids.forEach((id, i) => {
    const r = res.slice(i * 6, i * 6 + 6);
    if (!r[0]) return;
    const p = publicPost(JSON.parse(r[0]));
    if (p.blind) p.content = BLIND_TEXT;
    Object.assign(p, voteFields(r.slice(1, 5)));
    p.views = Number(r[5]) || 0;
    posts.push(p);
  });
  return posts;
}

async function handleGet(q) {
  const cid = isCid(q.cid) ? q.cid : null;

  if (q.counts) {
    const [flat] = await redis([['HGETALL', 'postcount']]);
    const counts = {};
    for (let i = 0; i < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]);
    return { counts };
  }

  if (q.code) {
    if (!isCode(q.code)) throw new BadRequest('종목코드가 올바르지 않습니다');
    const [ids] = await redis([['LRANGE', `posts:${q.code}`, 0, LIST_LIMIT - 1]]);
    return { posts: await loadPosts(ids, cid) };
  }

  throw new BadRequest('조회 조건이 없습니다');
}

const STRING_FIELDS = ['action', 'cid', 'code', 'id', 'token', 'nick', 'password', 'adminKey', 'content', 'title', 'userId', 'reason', 'message', 'email', 'name', 'type', 'sentiment'];
async function handlePost(b, env = {}) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BadRequest('요청 형식이 올바르지 않습니다');
  for (const k of STRING_FIELDS) if (b[k] != null && typeof b[k] !== 'string') throw new BadRequest(`${k} 값이 올바르지 않습니다`);
  if (!isCid(b.cid)) throw new BadRequest('cid가 올바르지 않습니다');

  if (b.action === 'signup') return signup(b);
  if (b.action === 'login') return login(b);
  if (b.action === 'me') {
    const user = await sessionUser(b.token);
    return { user: user ? publicUser(user) : null };
  }
  if (b.action === 'logout') {
    if (isToken(b.token)) {
      const [uid] = await redis([['GET', `sess:${b.token}`]]);
      await redis([['DEL', `sess:${b.token}`], uid ? ['SREM', `usess:${uid}`, b.token] : ['ECHO', '0']]);
    }
    return { ok: true };
  }

  // ── 회원정보 ──
  if (b.action === 'profile' || b.action === 'changePassword' || b.action === 'withdraw') {
    const user = await sessionUser(b.token);
    if (!user) throw new BadRequest('로그인이 만료되었습니다. 다시 로그인해주세요');
    const uid = user.id.toLowerCase();

    if (b.action === 'profile') {
      const [posts, followers, following, favCount] = await redis([
        ['LLEN', `author:${user.nick}`], ['SCARD', `mfollowers:${user.nick}`], ['SMEMBERS', `mfollowing:${uid}`], ['SCARD', `fav:${uid}`],
      ]);
      return { user: { ...publicUser(user), ts: user.ts }, posts: Number(posts) || 0, followers: Number(followers) || 0, following: (following || []).sort(), favs: Number(favCount) || 0 };
    }

    // 비밀번호 확인 (연속 실패 시 잠금은 로그인과 같은 기준)
    const [fails] = await redis([['GET', `loginfail:${uid}`]]);
    if (Number(fails) >= PW_FAIL_LIMIT) throw new BadRequest('비밀번호를 여러 번 틀려 10분간 잠겼습니다');
    if (!samePassword(String(b.password ?? ''), user.pw)) {
      await redis([['INCR', `loginfail:${uid}`], ['EXPIRE', `loginfail:${uid}`, 600]]);
      throw new BadRequest('현재 비밀번호가 일치하지 않습니다');
    }
    await redis([['DEL', `loginfail:${uid}`]]);
    const [tokens] = await redis([['SMEMBERS', `usess:${uid}`]]);
    const sessKeys = (tokens || []).map(t => `sess:${t}`);

    if (b.action === 'changePassword') {
      const np = String(b.newPassword ?? '');
      if (np.length < MEMBER_PW_MIN || np.length > MEMBER_PW_MAX) throw new BadRequest(`새 비밀번호는 ${MEMBER_PW_MIN}~${MEMBER_PW_MAX}자로 입력해주세요`);
      user.pw = hashPassword(np);
      // 다른 기기 로그인은 모두 해제하고 지금 브라우저만 새 세션 발급
      await redis([['SET', `user:${uid}`, JSON.stringify(user)], ['DEL', `usess:${uid}`, ...sessKeys]]);
      return newSession(user);
    }

    // 회원 탈퇴: 계정·세션·관심 종목·팔로우 관계 삭제 (작성한 글은 남음)
    const [following, followers, favCodes] = await redis([['SMEMBERS', `mfollowing:${uid}`], ['SMEMBERS', `mfollowers:${user.nick}`], ['SMEMBERS', `fav:${uid}`]]);
    // 계정을 실제로 지운 요청만 회원 수 감소 (동시에 두 번 눌러도 한 번만)
    const [removed] = await redis([['DEL', `user:${uid}`]]);
    if (Number(removed)) await redis([['DECR', 'members:total']]);
    const cmds = [
      // 탈퇴한 닉네임은 다른 사람이 쓰지 못하게 예약만 남김 (사칭 방지)
      ['SET', `nickowner:${user.nick}`, '-'],
      ['SET', `uidgone:${uid}`, '1'],
      ['DEL', `fav:${uid}`, `mfollowing:${uid}`, `mfollowers:${user.nick}`, `usess:${uid}`, ...sessKeys],
      ...(following || []).map(n => ['SREM', `mfollowers:${n}`, uid]),
      ...(followers || []).map(f => ['SREM', `mfollowing:${f}`, user.nick]),
    ];
    await redis(cmds);
    if (Number(removed)) await countHiddenFav(favCodes || [], -1);
    return { withdrawn: true };
  }

  if (b.action === 'visit') {
    const day = `views:${kstDay()}`;
    const [ok] = await redis([['SET', `vrl:${b.cid}`, '1', 'NX', 'EX', VISIT_GAP]]);
    if (ok === 'OK') await redis([['PFADD', `uv:${kstDay()}`, b.cid], ['EXPIRE', `uv:${kstDay()}`, 400 * 86400], ['PFADD', 'uv:total', b.cid]]);
    const [today, total] = ok === 'OK'
      ? (await redis([['INCR', day], ['INCR', 'views:total'], ['EXPIRE', day, 400 * 86400]])).slice(0, 2)
      : await redis([['GET', day], ['GET', 'views:total']]);
    return { today: Number(today) || 0, total: Number(total) || 0 };
  }

  if (b.action === 'viewBoard') {
    if (!isCode(b.code)) throw new BadRequest('종목코드가 올바르지 않습니다');
    const want = new Set((Array.isArray(b.ids) ? b.ids : []).map(String).filter(isPostId));
    const [listed] = await redis([['LRANGE', `posts:${b.code}`, 0, LIST_LIMIT - 1]]);
    const ids = (listed || []).filter(id => want.has(id));  // 이 게시판에 실제 있는 글만
    if (!ids.length) return { views: {} };
    // 칼럼은 글을 열 때 글마다 셈 (목록엔 제목만 보이므로), 그 외 게시판은 게시판 단위
    const viewKey = b.code === COLUMN_CODE ? `pvb:${b.code}:${b.cid}:${ids[0]}` : `pvb:${b.code}:${b.cid}`;
    if (b.code === COLUMN_CODE) ids.length = 1;
    const [ok] = await redis([['SET', viewKey, '1', 'NX', 'EX', BOARD_VIEW_GAP]]);
    const res = await redis(ids.map(id => ok === 'OK' ? ['HINCRBY', 'postviews', id, 1] : ['HGET', 'postviews', id]));
    // 날짜별 글 조회수 (관리자 화면 정보 '오늘 조회수'·최근 14일, 2026-10-15부터)
    if (ok === 'OK') await redis([['INCRBY', `pv:${kstDay()}`, ids.length], ['EXPIRE', `pv:${kstDay()}`, 400 * 86400]]);
    return { views: Object.fromEntries(ids.map((id, i) => [id, Number(res[i]) || 0])) };
  }

  if (b.action === 'report') {
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const reason = REPORT_REASONS.includes(b.reason) ? b.reason : '기타';
    const [raw] = await redis([['GET', `post:${id}`]]);
    if (!raw) throw new BadRequest('게시글이 없습니다');
    if (JSON.parse(raw).official) throw new BadRequest('운영자 글은 신고할 수 없습니다');  // 신고 누적으로 운영자 공지가 가려지지 않게
    // 같은 글 중복 신고 확인: 접속 IP는 원문 대신 되돌릴 수 없는 해시로 저장 (개인정보처리방침 3항)
    const reporter = b._ip && b._ip !== 'unknown' ? 'ip:' + crypto.createHmac('sha256', String(process.env.KV_REST_API_TOKEN || process.env.ADMIN_PASSWORD || '')).update('report:' + b._ip).digest('hex').slice(0, 24) : b.cid;
    const [added] = await redis([['SADD', `reports:${id}`, reporter]]);
    if (!Number(added)) throw new BadRequest('이미 신고한 글입니다');
    const [, count] = await redis([['HINCRBY', `reportwhy:${id}`, reason, 1], ['SCARD', `reports:${id}`], ['ZADD', 'reported', 0, id]]);
    await redis([['ZADD', 'reported', Number(count), id]]);
    const post = JSON.parse(raw);
    if (Number(count) >= REPORT_BLIND && !post.blind) {
      post.blind = true;
      await redis([['SET', `post:${id}`, JSON.stringify(post), 'XX']]);
    }
    return { id, reports: Number(count), blind: Boolean(post.blind) };
  }

  if (b.action === 'contact') {
    const message = String(b.message ?? '').trim().slice(0, 2000);
    if (message.length < 5) throw new BadRequest('문의 내용을 5자 이상 입력해주세요');
    const email = String(b.email ?? '').trim().slice(0, 100);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('이메일 형식이 올바르지 않습니다');
    const [ok, okIp] = await redis([['SET', `rl:contact:${b.cid}`, '1', 'NX', 'EX', 30], ['SET', `rl:contact:ip:${b._ip}`, '1', 'NX', 'EX', 30]]);
    if (ok !== 'OK' || okIp !== 'OK') throw new BadRequest('잠시 후 다시 보내주세요');
    const item = { id: Date.now().toString(36), ts: Date.now(), type: String(b.type ?? '기타').slice(0, 30), name: String(b.name ?? '').trim().slice(0, 30), email, message };
    await redis([['LPUSH', 'contacts', JSON.stringify(item)], ['LTRIM', 'contacts', 0, 499]]);
    return { ok: true };
  }

  if (b.action === 'adminReports') {
    await checkAdmin(b.adminKey, b._ip);
    const [flat] = await redis([['ZREVRANGE', 'reported', 0, 99, 'WITHSCORES']]);
    const ids = [], counts = {};
    for (let i = 0; i < (flat || []).length; i += 2) { ids.push(flat[i]); counts[flat[i]] = Number(flat[i + 1]); }
    if (!ids.length) return { posts: [] };
    const res = await redis(ids.flatMap(id => [['GET', `post:${id}`], ['HGETALL', `reportwhy:${id}`]]));
    const posts = [];
    ids.forEach((id, i) => {
      const raw = res[i * 2];
      if (!raw) return;
      const why = res[i * 2 + 1] || [];
      const reasons = {};
      for (let j = 0; j < why.length; j += 2) reasons[why[j]] = Number(why[j + 1]);
      posts.push({ ...publicPost(JSON.parse(raw)), reports: counts[id], reasons, likes: 0 });
    });
    return { posts };
  }

  if (b.action === 'adminUnblind') {
    await checkAdmin(b.adminKey, b._ip);
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const [raw] = await redis([['GET', `post:${id}`]]);
    if (!raw) throw new BadRequest('게시글이 없습니다');
    const post = JSON.parse(raw);
    delete post.blind;
    await redis([['SET', `post:${id}`, JSON.stringify(post)], ['DEL', `reports:${id}`, `reportwhy:${id}`], ['ZREM', 'reported', id]]);
    return { id, unblind: true };
  }

  if (b.action === 'adminContacts') {
    await checkAdmin(b.adminKey, b._ip);
    const [list] = await redis([['LRANGE', 'contacts', 0, 199]]);
    return { contacts: (list || []).map(x => JSON.parse(x)) };
  }

  if (b.action === 'columnList') {
    const [ids] = await redis([['LRANGE', `posts:${COLUMN_CODE}`, 0, LIST_LIMIT - 1]]);
    if (!ids?.length) return { posts: [] };
    const [raws, views, order] = await redis([['MGET', ...ids.map(id => `post:${id}`)], ['HMGET', 'postviews', ...ids], ['HGETALL', COLUMN_ORDER_KEY]]);
    // 연재 순서: 운영자가 정한 순번(colorder) → 없으면 먼저 쓴 글부터 (api/_colorder.js)
    const posts = sortColumns(ids.map((id, i) => raws[i] ? { ...publicPost(JSON.parse(raws[i])), views: Number(views?.[i]) || 0 } : null).filter(Boolean), order);
    return { posts };
  }

  if (b.action === 'columnPost') {
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const [post] = await loadPosts([id], b.cid);
    if (!post || post.code !== COLUMN_CODE) throw new BadRequest('칼럼이 없습니다');
    return { post };
  }

  if (b.action === 'adminImages') {
    await checkAdmin(b.adminKey, b._ip);
    return imageStats(env, b.cleanup === true);
  }

  if (b.action === 'adminStats') {
    await checkAdmin(b.adminKey, b._ip);
    return siteStats();
  }

  if (b.action === 'favList' || b.action === 'favToggle') {
    const user = await sessionUser(b.token);
    if (!user) throw new BadRequest('로그인한 회원만 관심 종목을 사용할 수 있습니다');
    const key = `fav:${user.id.toLowerCase()}`;
    if (b.action === 'favToggle') {
      if (!isCode(b.code)) throw new BadRequest('종목코드가 올바르지 않습니다');
      if (b.on) {
        const [count] = await redis([['SCARD', key]]);
        if (Number(count) >= FAV_MAX) throw new BadRequest(`관심 종목은 최대 ${FAV_MAX}개까지 추가할 수 있습니다`);
      }
      const [changed] = await redis([[b.on ? 'SADD' : 'SREM', key, b.code]]);
      if (Number(changed)) await countHiddenFav([b.code], b.on ? 1 : -1);
    }
    const [codes] = await redis([['SMEMBERS', key]]);
    return { codes };
  }

  if (b.action === 'create') {
    // 운영자 글: 관리자 모드(관리자 비밀번호)에서만, 닉네임 '운영자' 고정 (일반 회원·비회원은 RESERVED_NICK_RE로 사용 불가)
    const official = b.asOperator === true;
    if (official) await checkAdmin(b.adminKey, b._ip);
    const member = !official && b.token ? await sessionUser(b.token) : null;
    if (!official && b.token && !member) throw new BadRequest('로그인이 만료되었습니다. 다시 로그인해주세요');
    let nick, password;
    if (official) {
      nick = OPERATOR_NICK;
    } else if (member) {
      nick = member.nick;
    } else {
      nick = String(b.nick ?? '').trim() || '익명';
      if (!NICK_RE.test(nick)) throw new BadRequest('닉네임은 한글로만 최대 10자까지 입력할 수 있습니다');
      if (RESERVED_NICK_RE.test(nick)) throw new BadRequest('사용할 수 없는 닉네임입니다 (운영진 사칭 방지)');
      checkBanned(nick, '닉네임');
      password = checkPassword(b.password);
      const [owned] = await redis([['EXISTS', `nickowner:${nick}`]]);
      if (Number(owned)) throw new BadRequest('회원 닉네임이라 비회원 글쓰기에 사용할 수 없습니다');
    }
    if (!isCode(b.code)) throw new BadRequest('종목코드가 올바르지 않습니다');
    const column = b.code === COLUMN_CODE;
    if (column && !official) throw new BadRequest('주식 강의는 관리자 모드에서만 쓸 수 있습니다');
    const title = column ? checkTitle(b.title) : null;
    const content = checkContent(b.content, column ? COLUMN_MAX : MAX_CONTENT);
    const sentiment = SENTIMENTS.includes(b.sentiment) ? b.sentiment : 'neutral';

    // 도배 방지: 같은 브라우저에서 5초에 1건
    const [ok, okIp] = await redis([['SET', `rl:${b.cid}`, '1', 'NX', 'EX', 5], ['SET', `rl:ip:${b._ip}`, '1', 'NX', 'EX', 2]]);
    if (ok !== 'OK' || okIp !== 'OK') throw new BadRequest('잠시 후 다시 등록해주세요');

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const post = { id, code: b.code, nick, ...(title ? { title } : {}), content, sentiment, ts: Date.now(), ...(member ? { uid: member.id.toLowerCase() } : {}), ...(official ? { official: true } : {}) };
    await redis([
      ['SET', `post:${id}`, JSON.stringify(post)],
      member || official ? ['ECHO', 'nopw'] : ['SET', `pw:${id}`, hashPassword(password)],
      ['LPUSH', `posts:${b.code}`, id],
      ['LPUSH', `author:${nick}`, id],
      ['HINCRBY', 'postcount', b.code, 1],
    ]);
    return { post: { ...publicPost(post), likes: 0, dislikes: 0, liked: false, disliked: false } };
  }

  if (b.action === 'edit') {
    const post = await authorize(String(b.id ?? ''), b.password, b.token, b.adminKey, b._ip);
    if (post.blind) throw new BadRequest('블라인드 처리된 글은 수정할 수 없습니다');
    const oldImages = post.code === COLUMN_CODE ? imagesIn(post.content) : new Set();
    if (post.code === COLUMN_CODE) post.title = checkTitle(b.title);
    post.content = checkContent(b.content, post.code === COLUMN_CODE ? COLUMN_MAX : MAX_CONTENT);
    if (SENTIMENTS.includes(b.sentiment)) post.sentiment = b.sentiment;
    post.editedTs = Date.now();
    const [saved] = await redis([['SET', `post:${post.id}`, JSON.stringify(post), 'XX']]);
    if (saved !== 'OK') throw new BadRequest('게시글이 없습니다');
    if (oldImages.size) { const now = imagesIn(post.content); await deleteImages(env, [...oldImages].filter(x => !now.has(x))).catch(e => console.error('column image delete', e)); }
    return { post: { ...publicPost(post), ...voteFields(await redis(voteCmds(post.id, b.cid))) } };
  }

  if (b.action === 'delete') {
    const post = await authorize(String(b.id ?? ''), b.password, b.token, b.adminKey, b._ip);
    return removePost(post, env);
  }

  // 관리자: 비밀번호 확인(로그인) / 아무 글이나 삭제
  if (b.action === 'adminCheck') {
    await checkAdmin(b.adminKey, b._ip);
    // 브라우저엔 비밀번호 대신 관리자 세션 토큰을 저장 (유출돼도 12시간 뒤 만료, 로그아웃 시 즉시 폐기)
    const token = 'adm_' + crypto.randomBytes(24).toString('hex');
    await redis([['SET', `admsess:${token}`, '1', 'EX', ADMIN_SESSION_TTL]]);
    return { admin: true, adminToken: token };
  }

  if (b.action === 'adminLogout') {
    if (typeof b.adminKey === 'string' && ADMIN_TOKEN_RE.test(b.adminKey)) await redis([['DEL', `admsess:${b.adminKey}`]]);
    return { ok: true };
  }

  if (b.action === 'adminDelete') {
    await checkAdmin(b.adminKey, b._ip);
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const [raw] = await redis([['GET', `post:${id}`]]);
    if (!raw) throw new BadRequest('게시글이 없습니다');
    return removePost(JSON.parse(raw), env);
  }

  // 공감·비공감: 같은 걸 다시 누르면 취소, 반대쪽을 누르면 옮겨감 (한 브라우저에 하나만)
  if (b.action === 'vote' || b.action === 'like') {
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const type = b.action === 'like' ? 'up' : b.type;
    if (type !== 'up' && type !== 'down') throw new BadRequest('잘못된 요청입니다');
    const key = type === 'up' ? `likes:${id}` : `dislikes:${id}`;
    const other = type === 'up' ? `dislikes:${id}` : `likes:${id}`;
    const [exists, on] = await redis([['EXISTS', `post:${id}`], ['SISMEMBER', key, b.cid]]);
    if (!exists) throw new BadRequest('게시글이 없습니다');
    await redis(Number(on) === 1 ? [['SREM', key, b.cid]] : [['SADD', key, b.cid], ['SREM', other, b.cid]]);
    return { id, ...voteFields(await redis(voteCmds(id, b.cid))) };
  }

  // ── 팔로우 (회원 전용) ──
  if (b.action === 'author') {
    const nick = cleanNick(b.nick);
    if (!nick) throw new BadRequest('닉네임이 필요합니다');
    const me = b.token ? await sessionUser(b.token) : null;
    const [ids, followers, owner, following] = await redis([
      ['LRANGE', `author:${nick}`, 0, LIST_LIMIT - 1],
      ['SCARD', `mfollowers:${nick}`],
      ['GET', `nickowner:${nick}`],
      me ? ['SISMEMBER', `mfollowing:${me.id.toLowerCase()}`, nick] : ['ECHO', '0'],
    ]);
    return { nick, member: Boolean(owner) && owner !== '-', withdrawn: owner === '-', posts: await loadPosts(ids, b.cid), followers: Number(followers) || 0, following: Number(following) === 1 };
  }

  if (b.action === 'follow' || b.action === 'followingList' || b.action === 'feed') {
    const me = await sessionUser(b.token);
    if (!me) throw new BadRequest('팔로우는 로그인한 회원만 사용할 수 있습니다');
    const uid = me.id.toLowerCase();

    if (b.action === 'follow') {
      const nick = cleanNick(b.nick);
      if (!nick) throw new BadRequest('닉네임이 필요합니다');
      if (nick === me.nick) throw new BadRequest('자기 자신은 팔로우할 수 없습니다');
      const follow = Boolean(b.follow);
      if (follow) {
        const [owner] = await redis([['GET', `nickowner:${nick}`]]);
        if (!owner || owner === '-') throw new BadRequest('회원만 팔로우할 수 있습니다');
      }
      const [, , followers] = await redis([
        [follow ? 'SADD' : 'SREM', `mfollowing:${uid}`, nick],
        [follow ? 'SADD' : 'SREM', `mfollowers:${nick}`, uid],
        ['SCARD', `mfollowers:${nick}`],
      ]);
      return { nick, following: follow, followers: Number(followers) || 0 };
    }

    const [nicks] = await redis([['SMEMBERS', `mfollowing:${uid}`]]);
    if (b.action === 'followingList') return { following: nicks || [] };
    if (!nicks?.length) return { following: [], posts: [] };
    const lists = await redis(nicks.slice(0, 200).map(n => ['LRANGE', `author:${n}`, 0, 49]));  // 팔로우가 아주 많아도 요청 크기 제한
    const posts = (await loadPosts(lists.flat(), b.cid)).filter(p => p.member);
    posts.sort((a, b2) => b2.ts - a.ts);
    return { following: nicks.sort(), posts: posts.slice(0, LIST_LIMIT) };
  }

  throw new BadRequest('지원하지 않는 action입니다');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!dbReady()) return res.status(503).json({ error: 'DB가 연결되지 않았습니다' });

  try {
    if (req.method === 'GET') return res.json(await handleGet(req.query));
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { throw new BadRequest('요청 형식이 올바르지 않습니다'); } }
      body = { ...(body || {}) };
      // 접속 IP (Cloudflare가 넣는 헤더, 클라이언트가 body로 보낸 _ip는 덮어씀) — 도배·잠금 기준
      body._ip = String(req.headers?.['cf-connecting-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 64);
      return res.json(await handlePost(body, req.env));
    }
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error('posts error', err);
    res.status(500).json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요' });
  }
}
