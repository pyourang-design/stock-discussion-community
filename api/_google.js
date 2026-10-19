// Google 뉴스 RSS 검색 (업종 뉴스·종목 뉴스 공통)
// Google은 Cloudflare 서버 IP를 503으로 막아서, 환경변수 GNEWS_PROXY_URL이 있으면 Vercel 중계(api/gnews.js)를 거침
// (GNEWS_PROXY_KEY로 인증). 중계·구글이 실패해도 호출하는 쪽은 네이버 기사만으로 응답
// 결과 형식은 네이버 뉴스에 맞춤: { id, title, summary, press, datetime(YYYYMMDDHHmm KST), url, thumb, source: 'google' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const ENTITIES = { amp: '&', nbsp: ' ', middot: '·', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', lt: '<', gt: '>', quot: '"', apos: "'" };
// 한 번에 풀기: 숫자(&#8943; &#x2026;)·이름(&amp; &middot; …) 엔티티 — 풀린 결과를 다시 풀지 않음
const decodeEntities = s => s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (m, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
  const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m;
});
export const stripTags = s => decodeEntities(String(s ?? '').replace(/<[^>]*>/g, '')).trim();

// Date → 한국시간 YYYYMMDDHHmm (네이버 datetime 형식에 맞춤)
const kstStamp = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-T:]/g, '');

// 언론사 기사만 남김 — 블로그·카페·개인 연재, 투자정보·시세 사이트, 기업 뉴스룸, SNS·동영상, 관련 없는 해외 사이트 제외
// (언론사 이름 또는 출처 주소로 판단, 출처 주소는 하위 도메인까지 포함해 비교)
const NON_PRESS_NAME = /blog|블로그|티스토리|tistory|brunch|브런치|velog|egloos|이글루스|medium|카페|프리미엄콘텐츠|뉴스룸|newsroom|investing\.com|tradingview|simply wall|youtube/i;
const NON_PRESS_HOST = [
  // 블로그·카페·개인 연재
  'blog.naver.com', 'tistory.com', 'brunch.co.kr', 'velog.io', 'egloos.com', 'medium.com', 'blogspot.com', 'wordpress.com',
  'cafe.naver.com', 'cafe.daum.net', 'contents.premium.naver.com', 'note.com',
  // 투자정보·시세·분석 사이트
  'judal.co.kr', 'itooza.com', 'buffettlab.co.kr', 'thinkpool.com', 'investing.com', 'tradingview.com', 'tradingkey.com',
  'simplywall.st', 'tikr.com', 'tradersunion.com', 'idnfinancials.com', 'indexbox.io', 'kbthink.com', 'econmingle.com',
  'seekingalpha.com', 'fool.com', 'marketscreener.com',
  // 기업 뉴스룸·홍보 사이트
  'shinsegaegroupnewsroom.com', 'hyundaimotorgroup.com', 'about.nike.com',
  // SNS·동영상·커뮤니티·쇼핑
  'youtube.com', 'youtu.be', 'weverse.io', 't.co', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'reddit.com',
  'coolenjoy.net', 'danawa.com', 'dazabi.com',
  // 관련 없는 해외·기타 사이트
  'calgaryroughnecks.com', 'wwr-stardom.com', 'actt.org.tt', 'haveagood-holiday.com', 'belpostel.com', 'mezha.net', 'vietnam.vn',
  'storagereview.com', 'faq.donga.com', 'programs.sbs.co.kr', 'webzine.kacta.or.kr',
];
const isNonPress = (press, host) => NON_PRESS_NAME.test(press) || /^blog\./.test(host) || /\.go\.kr$/.test(host)
  || NON_PRESS_HOST.some(d => host === d || host.endsWith('.' + d));

// 구글(중계)이 막히거나 느려도 뉴스 전체가 기다리지 않게 짧게 끊음 (2026-10-19 중계가 503을 10초 뒤에 돌려줘 뉴스가 느려졌던 문제)
const GOOGLE_TIMEOUT = 3500;
// 같은 검색어는 10분 동안 Cloudflare 캐시에서 (구글 요청 수를 줄여 다시 막히지 않게, 7일치 검색이라 10분이면 충분)
const GOOGLE_TTL = 600;
async function fetchRss(query, when) {
  const proxy = process.env.GNEWS_PROXY_URL;
  const url = proxy ? `${proxy}?q=${encodeURIComponent(query)}&when=${when}`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${when}`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = cache ? new Request(`https://gnews.cache/${encodeURIComponent(query)}/${when}`) : null;
  const hit = cache && await cache.match(key).catch(() => null);
  if (hit) return hit.text();
  const r = await fetch(url, { headers: proxy ? { 'x-proxy-key': process.env.GNEWS_PROXY_KEY || '' } : { 'User-Agent': UA }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT) });
  if (!r.ok) throw new Error(`Google HTTP ${r.status}`);
  const xml = await r.text();
  if (cache) await cache.put(key, new Response(xml, { headers: { 'Cache-Control': `public, max-age=${GOOGLE_TTL}` } })).catch(() => {});
  return xml;
}

// query: 서버에 고정된 검색어만 넘길 것 (임의 검색어 프록시 방지)
export async function googleNews(query, { when = '1d', max = 20 } = {}) {
  const xml = await fetchRss(query, when);
  const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const it = m[1];
    const press = stripTags(tag(it, 'source'));
    const host = ((it.match(/<source[^>]*url="https?:\/\/([^/"]+)/) || [])[1] || '').toLowerCase();
    let title = stripTags(tag(it, 'title').replace(/<!\[CDATA\[|\]\]>/g, ''));
    if (press && title.endsWith(` - ${press}`)) title = title.slice(0, -(press.length + 3));
    const d = new Date(tag(it, 'pubDate'));
    return {
      id: 'g_' + tag(it, 'guid').slice(0, 60),
      title,
      summary: '',
      press,
      datetime: isNaN(d) ? '' : kstStamp(d),
      url: stripTags(tag(it, 'link')),
      thumb: null,
      source: 'google',
      nonPress: isNonPress(press, host),
    };
  }).filter(n => n.title && /[가-힣]/.test(n.title) && /^https:\/\//.test(n.url) && !n.nonPress)  // 한글 제목만 (NAVER 등 영문 종목명은 해외 영문 기사가 섞임)
    .map(({ nonPress, ...n }) => n)
    .sort((a, b) => b.datetime.localeCompare(a.datetime))
    .slice(0, max);
}

// 네이버·구글에 같은 기사가 함께 있으면 먼저 온 것(네이버)만 남김 — 제목 앞부분(공백·기호 제거)으로 비교
export function dedupeByTitle(items) {
  const seen = new Set();
  return items.filter(n => {
    const k = n.title.replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 24);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
