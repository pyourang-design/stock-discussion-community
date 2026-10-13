// GET /rss.xml (vercel.json rewrite → /api/rss) → 네이버 서치어드바이저·검색엔진용 RSS 2.0
//   1) 사이트 전체 최근 토론글 (최대 50건, 블라인드 글 제외)
//   2) 남는 자리는 업종별 대표 종목 토론방 페이지 (총 100건까지)
import { STOCKS, SECTORS, STOCKS_AS_OF } from './_stocks.js';
import { redis, dbReady } from './_redis.js';

const SITE = 'https://upjong.com';
const NAME = '주식 업종 종목 토론방';
const MAX_POSTS = 50, MAX_ITEMS = 100, PER_BOARD = 10;
const SENTIMENT = { up: '매수', down: '매도', neutral: '중립' };

const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stockUrl = code => `${SITE}/stock/${encodeURIComponent(code)}`;
const sectorName = key => key === 'usa' ? '미국 주식' : `${SECTORS.find(s => s.key === key)?.name || ''} 업종`;
// 업종 게시판 코드(SECBIO 등) → 업종 key
const boardSector = code => SECTORS.find(s => 'SEC' + s.key.slice(0, 3).toUpperCase() === code)?.key;

async function recentPosts() {
  if (!dbReady()) return [];
  const [flat] = await redis([['HGETALL', 'postcount']]);
  const codes = [];
  for (let i = 0; i < (flat || []).length; i += 2) if (Number(flat[i + 1]) > 0) codes.push(flat[i]);
  if (!codes.length) return [];
  const lists = await redis(codes.map(c => ['LRANGE', `posts:${c}`, 0, PER_BOARD - 1]));
  const ids = lists.flat().filter(Boolean);
  if (!ids.length) return [];
  const raws = await redis(ids.map(id => ['GET', `post:${id}`]));
  return raws.filter(Boolean).map(r => JSON.parse(r)).filter(p => !p.blind)
    .sort((a, b) => b.ts - a.ts).slice(0, MAX_POSTS);
}

export default async function handler(req, res) {
  let posts = [];
  try { posts = await recentPosts(); } catch { posts = []; }

  const items = posts.map(p => {
    const s = STOCKS.find(x => x.code === p.code);
    const sec = s ? null : boardSector(p.code);
    const where = s ? `${s.name} 종목 토론방` : sec ? `${sectorName(sec)} 게시판` : '토론방';
    const link = s ? stockUrl(s.code) : `${SITE}/?sector=${sec || ''}`;
    const text = String(p.content).replace(/\s+/g, ' ').trim();
    return {
      title: `[${where}] ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`,
      link, guid: `${link}#post-${p.id}`,
      desc: `${p.nick}님의 ${SENTIMENT[p.sentiment] || '중립'} 의견: ${text.slice(0, 300)}`,
      date: new Date(p.editedTs || p.ts), category: s ? sectorName(Object.keys(s.sectors)[0]) : sec ? sectorName(sec) : '토론',
    };
  });

  // 업종마다 시총 상위 종목부터 번갈아 채움 (업종이 고르게 섞이도록)
  const asOf = new Date(`${STOCKS_AS_OF}T09:00:00+09:00`);
  const bySector = SECTORS.map(sec => STOCKS.filter(s => s.sectors[sec.key]).sort((a, b) => a.sectors[sec.key].order - b.sectors[sec.key].order).map(s => [sec.key, s]));
  const seen = new Set();
  for (let i = 0; items.length < MAX_ITEMS && bySector.some(l => l[i]); i++) {
    for (const l of bySector) {
      if (items.length >= MAX_ITEMS || !l[i]) continue;
      const [key, s] = l[i];
      if (seen.has(s.code)) continue;
      seen.add(s.code);
      items.push({
        title: `${s.name} 종목 토론방 - 주가·뉴스·투자자 의견`,
        link: stockUrl(s.code), guid: stockUrl(s.code),
        desc: `${s.name}(${s.us ? s.ticker : s.code}) ${sectorName(key)} 종목 토론방. 실시간 주가, 시가총액·PER·PBR, 최근 뉴스와 투자자 토론 의견을 한곳에서 확인하는 주식 종목 토론방입니다.`,
        date: asOf, category: sectorName(key),
      });
    }
  }

  const latest = items.reduce((m, it) => (it.date > m ? it.date : m), asOf);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${NAME} - 업종별 주식 종목 토론방</title>
  <link>${SITE}/</link>
  <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
  <description>바이오·반도체·2차전지 등 업종별 주요 종목과 미국 주식 100, 실시간 시세·뉴스와 투자자 의견을 한곳에서 보는 주식 종목 토론방의 최근 토론글과 종목 토론방입니다.</description>
  <language>ko</language>
  <lastBuildDate>${latest.toUTCString()}</lastBuildDate>
${items.map(it => `  <item>
    <title>${xml(it.title)}</title>
    <link>${xml(it.link)}</link>
    <guid isPermaLink="${it.guid === it.link}">${xml(it.guid)}</guid>
    <description>${xml(it.desc)}</description>
    <category>${xml(it.category)}</category>
    <pubDate>${it.date.toUTCString()}</pubDate>
  </item>`).join('\n')}
</channel>
</rss>
`;
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(body);
}
