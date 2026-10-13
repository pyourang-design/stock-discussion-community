// Google 뉴스 RSS 검색 (업종 뉴스·종목 뉴스 공통)
// 결과 형식은 네이버 뉴스에 맞춤: { id, title, summary, press, datetime(YYYYMMDDHHmm KST), url, thumb, source: 'google' }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export const stripTags = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

// Date → 한국시간 YYYYMMDDHHmm (네이버 datetime 형식에 맞춤)
const kstStamp = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-T:]/g, '');

// query: 서버에 고정된 검색어만 넘길 것 (임의 검색어 프록시 방지)
export async function googleNews(query, { when = '1d', max = 20 } = {}) {
  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${when}`)}&hl=ko&gl=KR&ceid=KR:ko`, {
    headers: { 'User-Agent': UA },
  });
  if (!r.ok) throw new Error(`Google HTTP ${r.status}`);
  const xml = await r.text();
  const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const it = m[1];
    const press = stripTags(tag(it, 'source'));
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
    };
  }).filter(n => n.title && /^https:\/\//.test(n.url))
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
