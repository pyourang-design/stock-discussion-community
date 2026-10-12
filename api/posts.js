// 토론 게시글 · 좋아요 · 팔로우 API (Upstash Redis)
//
// GET  /api/posts?code=068270&cid=..   → 종목 게시글 목록
// GET  /api/posts?counts=1             → 종목별 게시글 수
// POST /api/posts { action: 'create', cid, code, nick, password, content, sentiment }   비회원 글
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
// POST /api/posts { action: 'favList',   cid, token }            관심 종목 목록 → { codes }
// POST /api/posts { action: 'favToggle', cid, token, code, on }  관심 종목 추가(on=true)·해제
// POST /api/posts { action: 'adminCheck',  cid, adminKey }       관리자 로그인 확인
// POST /api/posts { action: 'adminDelete', cid, id, adminKey }   관리자 삭제 (ADMIN_PASSWORD 환경변수)
// POST /api/posts { action: 'like',   cid, id }
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
//   likes:{id}         좋아요 누른 cid 집합
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
//   reports:{id}       게시글을 신고한 cid 집합, reportwhy:{id} 신고 사유별 건수(hash)
//   reported           신고된 게시글 id → 신고 수 (sorted set)
//   contacts           연락처 문의 JSON 목록 (최신순, 최대 500건)
//   views:total        사이트 누적 조회수, views:{YYYYMMDD} 날짜별(한국시간) 조회수 (400일 보관)
//   postviews          게시글 id → 조회수 (hash)
//   게시글의 uid(회원 아이디)는 서버에서만 쓰고 응답에서는 member: true 로만 표시
import crypto from 'crypto';
import { redis, dbReady } from './_redis.js';

const MAX_CONTENT = 1000;
const MAX_NICK = 10;
const PW_MIN = 4, PW_MAX = 20;
const PW_FAIL_LIMIT = 5;          // 10분 내 5회 틀리면 잠금
const NICK_RE = /^[가-힣]{1,10}$/; // 한글(완성형)만, 최대 10자
const LIST_LIMIT = 200;
const SENTIMENTS = ['up', 'down', 'neutral'];
// 회원: 아이디 영문 또는 영문+숫자 4~20자, 닉네임 한글 2~10자, 비밀번호 6~30자
const USER_ID_RE = /^(?=.*[A-Za-z])[A-Za-z0-9]{4,20}$/;
const MEMBER_NICK_RE = /^[가-힣]{2,10}$/;
const MEMBER_PW_MIN = 6, MEMBER_PW_MAX = 30;
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
const isCode = c => /^[0-9][0-9A-Z]{5}$/.test(c || '') || /^[A-Z][A-Za-z0-9]{0,6}(\.[A-Z])?$/.test(c || '');
const isCid = c => /^[0-9a-zA-Z-]{8,64}$/.test(c || '');
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
async function authorize(id, password, token) {
  if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
  const [rawPost] = await redis([['GET', `post:${id}`]]);
  if (!rawPost) throw new BadRequest('게시글이 없습니다');
  const target = JSON.parse(rawPost);
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

// 게시글과 연결된 데이터 모두 삭제
async function removePost(post) {
  await redis([
    ['DEL', `post:${post.id}`, `pw:${post.id}`, `likes:${post.id}`, `pwfail:${post.id}`, `reports:${post.id}`, `reportwhy:${post.id}`],
    ['ZREM', 'reported', post.id],
    ['HDEL', 'postviews', post.id],
    ['LREM', `posts:${post.code}`, 0, post.id],
    ['LREM', `author:${post.nick}`, 0, post.id],
    ['HINCRBY', 'postcount', post.code, -1],
  ]);
  return { deleted: post.id, code: post.code };
}

// 관리자 비밀번호 확인 (Vercel 환경변수 ADMIN_PASSWORD, 브라우저별 10분 내 5회 실패 시 잠금)
async function checkAdmin(key, cid) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new BadRequest('관리자 비밀번호가 설정되지 않았습니다');
  const [fails] = await redis([['GET', `adminfail:${cid}`]]);
  if (Number(fails) >= PW_FAIL_LIMIT) throw new BadRequest('관리자 비밀번호를 여러 번 틀려 10분간 잠겼습니다');
  const digest = v => crypto.createHash('sha256').update(String(v ?? '')).digest();
  if (!crypto.timingSafeEqual(digest(key), digest(secret))) {
    await redis([['INCR', `adminfail:${cid}`], ['EXPIRE', `adminfail:${cid}`, 600]]);
    throw new BadRequest('관리자 비밀번호가 일치하지 않습니다');
  }
}

function checkContent(content) {
  content = String(content ?? '').trim();
  if (!content) throw new BadRequest('내용을 입력해주세요');
  if (content.length > MAX_CONTENT) throw new BadRequest(`최대 ${MAX_CONTENT}자까지 입력할 수 있습니다`);
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
  if (nick === '익명' || /운영자|관리자|운영진/.test(nick)) throw new BadRequest('사용할 수 없는 닉네임입니다');
  checkBanned(nick, '닉네임');
  if (password.length < MEMBER_PW_MIN || password.length > MEMBER_PW_MAX) throw new BadRequest(`비밀번호는 ${MEMBER_PW_MIN}~${MEMBER_PW_MAX}자로 입력해주세요`);
  const [ok] = await redis([['SET', `rl:signup:${b.cid}`, '1', 'NX', 'EX', 10]]);
  if (ok !== 'OK') throw new BadRequest('잠시 후 다시 시도해주세요');

  const key = userId.toLowerCase();  // 아이디는 대소문자 구분 없이 중복 확인
  // 비회원이 이미 글을 쓴 닉네임도 사용 불가 (작성자 화면이 섞이지 않도록)
  const [usedId, usedNick, guestPosts] = await redis([['EXISTS', `user:${key}`], ['EXISTS', `nickowner:${nick}`], ['EXISTS', `author:${nick}`]]);
  if (Number(usedId)) throw new BadRequest('이미 사용 중인 아이디입니다');
  if (Number(usedNick) || Number(guestPosts)) throw new BadRequest('이미 사용 중인 닉네임입니다');

  const user = { id: userId, nick, pw: hashPassword(password), ts: Date.now() };
  const [setUser] = await redis([['SET', `user:${key}`, JSON.stringify(user), 'NX']]);
  if (setUser !== 'OK') throw new BadRequest('이미 사용 중인 아이디입니다');
  const [setNick] = await redis([['SET', `nickowner:${nick}`, key, 'NX']]);
  if (setNick !== 'OK') {
    await redis([['DEL', `user:${key}`]]);
    throw new BadRequest('이미 사용 중인 닉네임입니다');
  }
  return newSession(user);
}

async function login(b) {
  const key = String(b.userId ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!USER_ID_RE.test(key) || !password) throw new BadRequest('아이디와 비밀번호를 입력해주세요');
  const [raw, fails] = await redis([['GET', `user:${key}`], ['GET', `loginfail:${key}`]]);
  if (Number(fails) >= PW_FAIL_LIMIT) throw new BadRequest('비밀번호를 여러 번 틀려 10분간 로그인할 수 없습니다');
  const user = raw ? JSON.parse(raw) : null;
  if (!user || !samePassword(password, user.pw)) {
    if (user) await redis([['INCR', `loginfail:${key}`], ['EXPIRE', `loginfail:${key}`, 600]]);
    throw new BadRequest('아이디 또는 비밀번호가 일치하지 않습니다');
  }
  await redis([['DEL', `loginfail:${key}`]]);
  return newSession(user);
}

// id 목록 → 게시글 + 좋아요 수 + 내가 좋아요 했는지
async function loadPosts(ids, cid) {
  if (!ids.length) return [];
  const cmds = [];
  ids.forEach(id => {
    cmds.push(['GET', `post:${id}`], ['SCARD', `likes:${id}`]);
    cmds.push(cid ? ['SISMEMBER', `likes:${id}`, cid] : ['ECHO', '0']);
    cmds.push(['HGET', 'postviews', id]);
  });
  const res = await redis(cmds);
  const posts = [];
  ids.forEach((id, i) => {
    const raw = res[i * 4];
    if (!raw) return;
    const p = publicPost(JSON.parse(raw));
    if (p.blind) p.content = BLIND_TEXT;
    p.likes = Number(res[i * 4 + 1]) || 0;
    p.liked = Number(res[i * 4 + 2]) === 1;
    p.views = Number(res[i * 4 + 3]) || 0;
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

async function handlePost(b) {
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
    const [following, followers] = await redis([['SMEMBERS', `mfollowing:${uid}`], ['SMEMBERS', `mfollowers:${user.nick}`]]);
    const cmds = [
      // 탈퇴한 닉네임은 다른 사람이 쓰지 못하게 예약만 남김 (사칭 방지)
      ['SET', `nickowner:${user.nick}`, '-'],
      ['DEL', `user:${uid}`, `fav:${uid}`, `mfollowing:${uid}`, `mfollowers:${user.nick}`, `usess:${uid}`, ...sessKeys],
      ...(following || []).map(n => ['SREM', `mfollowers:${n}`, uid]),
      ...(followers || []).map(f => ['SREM', `mfollowing:${f}`, user.nick]),
    ];
    await redis(cmds);
    return { withdrawn: true };
  }

  if (b.action === 'visit') {
    const day = `views:${kstDay()}`;
    const [ok] = await redis([['SET', `vrl:${b.cid}`, '1', 'NX', 'EX', VISIT_GAP]]);
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
    const [ok] = await redis([['SET', `pvb:${b.code}:${b.cid}`, '1', 'NX', 'EX', BOARD_VIEW_GAP]]);
    const res = await redis(ids.map(id => ok === 'OK' ? ['HINCRBY', 'postviews', id, 1] : ['HGET', 'postviews', id]));
    return { views: Object.fromEntries(ids.map((id, i) => [id, Number(res[i]) || 0])) };
  }

  if (b.action === 'report') {
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const reason = REPORT_REASONS.includes(b.reason) ? b.reason : '기타';
    const [raw] = await redis([['GET', `post:${id}`]]);
    if (!raw) throw new BadRequest('게시글이 없습니다');
    const [added] = await redis([['SADD', `reports:${id}`, b.cid]]);
    if (!Number(added)) throw new BadRequest('이미 신고한 글입니다');
    const [, count] = await redis([['HINCRBY', `reportwhy:${id}`, reason, 1], ['SCARD', `reports:${id}`], ['ZADD', 'reported', 0, id]]);
    await redis([['ZADD', 'reported', Number(count), id]]);
    const post = JSON.parse(raw);
    if (Number(count) >= REPORT_BLIND && !post.blind) {
      post.blind = true;
      await redis([['SET', `post:${id}`, JSON.stringify(post)]]);
    }
    return { id, reports: Number(count), blind: Boolean(post.blind) };
  }

  if (b.action === 'contact') {
    const message = String(b.message ?? '').trim().slice(0, 2000);
    if (message.length < 5) throw new BadRequest('문의 내용을 5자 이상 입력해주세요');
    const email = String(b.email ?? '').trim().slice(0, 100);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest('이메일 형식이 올바르지 않습니다');
    const [ok] = await redis([['SET', `rl:contact:${b.cid}`, '1', 'NX', 'EX', 30]]);
    if (ok !== 'OK') throw new BadRequest('잠시 후 다시 보내주세요');
    const item = { id: Date.now().toString(36), ts: Date.now(), type: String(b.type ?? '기타').slice(0, 30), name: String(b.name ?? '').trim().slice(0, 30), email, message };
    await redis([['LPUSH', 'contacts', JSON.stringify(item)], ['LTRIM', 'contacts', 0, 499]]);
    return { ok: true };
  }

  if (b.action === 'adminReports') {
    await checkAdmin(b.adminKey, b.cid);
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
    await checkAdmin(b.adminKey, b.cid);
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
    await checkAdmin(b.adminKey, b.cid);
    const [list] = await redis([['LRANGE', 'contacts', 0, 199]]);
    return { contacts: (list || []).map(x => JSON.parse(x)) };
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
      await redis([[b.on ? 'SADD' : 'SREM', key, b.code]]);
    }
    const [codes] = await redis([['SMEMBERS', key]]);
    return { codes };
  }

  if (b.action === 'create') {
    const member = b.token ? await sessionUser(b.token) : null;
    if (b.token && !member) throw new BadRequest('로그인이 만료되었습니다. 다시 로그인해주세요');
    let nick, password;
    if (member) {
      nick = member.nick;
    } else {
      nick = String(b.nick ?? '').trim() || '익명';
      if (!NICK_RE.test(nick)) throw new BadRequest('닉네임은 한글로만 최대 10자까지 입력할 수 있습니다');
      checkBanned(nick, '닉네임');
      password = checkPassword(b.password);
      const [owned] = await redis([['EXISTS', `nickowner:${nick}`]]);
      if (Number(owned)) throw new BadRequest('회원 닉네임이라 비회원 글쓰기에 사용할 수 없습니다');
    }
    const content = checkContent(b.content);
    const sentiment = SENTIMENTS.includes(b.sentiment) ? b.sentiment : 'neutral';
    if (!isCode(b.code)) throw new BadRequest('종목코드가 올바르지 않습니다');

    // 도배 방지: 같은 브라우저에서 5초에 1건
    const [ok] = await redis([['SET', `rl:${b.cid}`, '1', 'NX', 'EX', 5]]);
    if (ok !== 'OK') throw new BadRequest('잠시 후 다시 등록해주세요');

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const post = { id, code: b.code, nick, content, sentiment, ts: Date.now(), ...(member ? { uid: member.id.toLowerCase() } : {}) };
    await redis([
      ['SET', `post:${id}`, JSON.stringify(post)],
      member ? ['ECHO', 'member'] : ['SET', `pw:${id}`, hashPassword(password)],
      ['LPUSH', `posts:${b.code}`, id],
      ['LPUSH', `author:${nick}`, id],
      ['HINCRBY', 'postcount', b.code, 1],
    ]);
    return { post: { ...publicPost(post), likes: 0, liked: false } };
  }

  if (b.action === 'edit') {
    const post = await authorize(String(b.id ?? ''), b.password, b.token);
    if (post.blind) throw new BadRequest('블라인드 처리된 글은 수정할 수 없습니다');
    post.content = checkContent(b.content);
    if (SENTIMENTS.includes(b.sentiment)) post.sentiment = b.sentiment;
    post.editedTs = Date.now();
    await redis([['SET', `post:${post.id}`, JSON.stringify(post)]]);
    const [likes, liked] = await redis([['SCARD', `likes:${post.id}`], ['SISMEMBER', `likes:${post.id}`, b.cid]]);
    return { post: { ...publicPost(post), likes: Number(likes) || 0, liked: Number(liked) === 1 } };
  }

  if (b.action === 'delete') {
    const post = await authorize(String(b.id ?? ''), b.password, b.token);
    return removePost(post);
  }

  // 관리자: 비밀번호 확인(로그인) / 아무 글이나 삭제
  if (b.action === 'adminCheck') {
    await checkAdmin(b.adminKey, b.cid);
    return { admin: true };
  }

  if (b.action === 'adminDelete') {
    await checkAdmin(b.adminKey, b.cid);
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const [raw] = await redis([['GET', `post:${id}`]]);
    if (!raw) throw new BadRequest('게시글이 없습니다');
    return removePost(JSON.parse(raw));
  }

  if (b.action === 'like') {
    const id = String(b.id ?? '');
    if (!isPostId(id)) throw new BadRequest('게시글 id가 올바르지 않습니다');
    const [exists, isMember] = await redis([['EXISTS', `post:${id}`], ['SISMEMBER', `likes:${id}`, b.cid]]);
    if (!exists) throw new BadRequest('게시글이 없습니다');
    const liked = Number(isMember) !== 1;
    const [, count] = await redis([[liked ? 'SADD' : 'SREM', `likes:${id}`, b.cid], ['SCARD', `likes:${id}`]]);
    return { id, liked, likes: Number(count) || 0 };
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
    const lists = await redis(nicks.map(n => ['LRANGE', `author:${n}`, 0, 49]));
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
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      return res.json(await handlePost(body));
    }
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    res.status(err instanceof BadRequest ? 400 : 500).json({ error: err.message });
  }
}
