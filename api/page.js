// GET /stock/{코드} (vercel.json rewrite → /api/page?code=) → 종목별 토론방 페이지 (서버 렌더링 HTML)
// 검색 로봇이 자바스크립트 없이 읽을 수 있도록 시세·종목 정보·최근 토론글·뉴스·같은 업종 종목 링크를 글자로 내보냄.
// 실제 토론 참여(글쓰기)는 홈 화면의 종목 토론 창(/?stock={코드})에서 함.
import { STOCKS, SECTORS, STOCKS_AS_OF, US_AS_OF } from './_stocks.js';
import { redis, dbReady } from './_redis.js';

const SITE = 'https://upjong.com';
const NAME = '주식 업종 종목 토론방';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' };
const POSTS_SHOWN = 20;
const NEWS_SHOWN = 8;
const SENTIMENT = { up: '📈 매수', down: '📉 매도', neutral: '🔍 중립' };
const BLIND_TEXT = '신고가 누적되어 블라인드 처리된 글입니다.';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const sectorTitle = key => key === 'usa' ? '미국 주식' : `${SECTORS.find(s => s.key === key)?.name || ''} 업종`;
// 한국시간 표시
const kst = ts => {
  const d = new Date(ts + 9 * 3600e3);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const newsTime = dt => { const m = String(dt || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : ''; };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 시세 + 주요 지표
async function quote(s) {
  if (s.us) {
    const d = await getJson(`https://api.stock.naver.com/stock/${s.code}/basic`);
    return {
      price: d.closePrice, change: Number(d.fluctuationsRatio), diff: d.compareToPreviousClosePrice, time: d.localTradedAt,
      infos: (d.stockItemTotalInfos ?? []).filter(x => x.value && x.value !== 'N/A').map(x => [x.key, x.value + (x.valueDesc ? ` (${x.valueDesc})` : '')]),
    };
  }
  const [p, integ] = await Promise.all([
    getJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${s.code}`),
    getJson(`https://m.stock.naver.com/api/stock/${s.code}/integration`).catch(() => null),
  ]);
  const d = (p.result?.datas ?? p.datas ?? [])[0] || {};
  return {
    price: d.closePrice, change: Number(d.fluctuationsRatio), diff: d.compareToPreviousClosePrice, time: d.localTradedAt,
    infos: (integ?.totalInfos ?? []).filter(x => x.value).map(x => [x.key, x.value]),
  };
}

async function news(s) {
  if (s.us) {
    const data = await getJson(`https://api.stock.naver.com/news/worldStock/${s.code}?pageSize=${NEWS_SHOWN}&page=1`);
    return data.slice(0, NEWS_SHOWN).map(n => ({ title: strip(n.tit), press: n.ohnm, dt: String(n.dt || '').slice(0, 12), url: `https://n.news.naver.com/article/${n.oid}/${n.aid}` }));
  }
  const data = await getJson(`https://m.stock.naver.com/api/news/stock/${s.code}?pageSize=${NEWS_SHOWN}&page=1`);
  return data.flatMap(g => g.items ?? []).slice(0, NEWS_SHOWN).map(n => ({
    title: strip(n.titleFull || n.title), press: n.officeName, dt: n.datetime,
    url: n.mobileNewsUrl || `https://n.news.naver.com/mnews/article/${n.officeId}/${n.articleId}`,
  }));
}

async function posts(code) {
  if (!dbReady()) return { list: [], total: 0 };
  const [ids, counts] = await redis([['LRANGE', `posts:${code}`, 0, POSTS_SHOWN - 1], ['HGET', 'postcount', code]]);
  if (!ids?.length) return { list: [], total: 0 };
  const raws = await redis(ids.map(id => ['GET', `post:${id}`]));
  const list = raws.filter(Boolean).map(r => JSON.parse(r)).map(p => ({ nick: p.nick, member: Boolean(p.uid), sentiment: p.sentiment, ts: p.ts, content: p.blind ? BLIND_TEXT : p.content }));
  return { list, total: Number(counts) || list.length };
}

function layout({ title, desc, canonical, body, jsonld, status = 200 }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  ${status === 200 ? `<link rel="canonical" href="${esc(canonical)}" />` : '<meta name="robots" content="noindex" />'}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${NAME}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:locale" content="ko_KR" />
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
  <script src="/theme.js"></script>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="/"><span class="logo-icon">📈</span><span class="logo-text">${NAME}</span></a>
    <nav class="main-nav page-nav"><a href="/">Home</a><button class="theme-toggle" onclick="toggleTheme()">Dark</button></nav>
  </div>
</header>
<main class="container stock-page">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <nav class="policy-links"><a href="/about.html">사이트 소개</a><a href="/terms.html">이용약관</a><a href="/privacy.html"><b>개인정보처리방침</b></a><a href="/contact.html">연락처</a></nav>
    <p>⚠️ 본 사이트 정보는 투자 권유가 아닙니다. 투자 결정은 본인 책임입니다.</p>
    <p>© 2026 ${NAME} · 운영자 김유랑 · <a href="mailto:tpsdurang@naver.com">tpsdurang@naver.com</a></p>
  </div>
</footer>
<script>
try {
  let id = localStorage.getItem('cid');
  if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); localStorage.setItem('cid', id); }
  fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'visit', cid: id }) });
} catch (e) {}
</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').trim();
  const s = STOCKS.find(x => x.code === code) || STOCKS.find(x => x.code.toLowerCase() === code.toLowerCase());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!s) {
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(404).send(layout({
      title: `종목을 찾을 수 없습니다 | ${NAME}`, desc: '요청한 종목 토론방이 없습니다.', canonical: SITE + '/', status: 404,
      body: `  <h1>종목을 찾을 수 없습니다</h1>\n  <p>주소를 확인하거나 <a href="/">홈</a>에서 업종별 주식 종목 토론방을 둘러보세요.</p>`,
    }));
  }
  // 대소문자만 다른 주소는 정식 주소로
  if (s.code !== code) {
    res.setHeader('Location', `/stock/${encodeURIComponent(s.code)}`);
    return res.status(301).end();
  }

  const [q, nw, ps] = await Promise.allSettled([quote(s), news(s), posts(s.code)]);
  const qt = q.status === 'fulfilled' ? q.value : null;
  const newsList = nw.status === 'fulfilled' ? nw.value : [];
  const { list: postList, total } = ps.status === 'fulfilled' ? ps.value : { list: [], total: 0 };

  const keys = Object.keys(s.sectors);
  const main = keys[0];
  const r = s.sectors[main];
  const rankParts = [];
  if (r.hold) rankParts.push(`국내 투자자 보유 ${r.hold}위 (${r.amt})`);
  if (r.hits) rankParts.push(`국내 투자자 관심 ${r.sel}위`);
  if (r.cap) rankParts.push(`시가총액 ${r.cap}위`);
  if (r.talk) rankParts.push(`토론 ${r.talk}위`);
  if (r.tv) rankParts.push(`거래대금 ${r.tv}위`);
  const idLabel = s.us ? `${s.ticker} · ${s.market.toUpperCase()}${s.etf ? ' ETF' : ''}` : `${s.code} · ${s.market.toUpperCase()}`;
  const unit = s.us ? '$' : '';
  const won = s.us ? '' : '원';
  const price = qt?.price ?? (s.us ? s.price.toFixed(2) : s.price.toLocaleString());
  const change = Number.isFinite(qt?.change) ? qt.change : s.change;
  const up = change >= 0;
  const sectorNames = keys.map(sectorTitle);
  const sectorName = sectorNames[0];
  const peers = STOCKS.filter(x => x.code !== s.code && x.sectors[main]).sort((a, b) => a.sectors[main].order - b.sectors[main].order).slice(0, 40);
  const discussUrl = `/?stock=${encodeURIComponent(s.code)}`;

  const title = `${s.name} 종목 토론방(종토방) - 주가·뉴스·투자자 의견 | 주식 종목 토론 게시판`;
  const desc = `${s.name}(${s.us ? s.ticker : s.code}) 종목 토론방·종목 토론 게시판. ${sectorName} ${rankParts[0] || ''} 종목의 실시간 주가, 시가총액·PER·PBR, 최근 뉴스와 투자자 토론 의견을 한곳에서 확인하고 함께 이야기하는 주식 종목 토론방입니다.`;
  const canonical = `${SITE}/stock/${encodeURIComponent(s.code)}`;

  const body = `
  <nav class="breadcrumb"><a href="/">홈</a> › <a href="/?sector=${esc(main)}">${esc(sectorName)}</a> › <span>${esc(s.name)}</span></nav>
  <h1>${esc(s.name)} 종목 토론방</h1>
  <p class="sp-sub">${esc(idLabel)} · ${sectorNames.map(esc).join(', ')}${rankParts.length ? ' · ' + esc(rankParts.join(' · ')) : ''}</p>

  <div class="sp-quote">
    <span class="sp-price">${esc(unit + price + won)}</span>
    <span class="sp-change ${up ? 'up' : 'down'}">${up ? '+' : ''}${esc(change)}%</span>
    <span class="sp-time">${qt?.time ? esc(String(qt.time).replace('T', ' ').slice(0, 16)) + ' 기준' : '시세는 토론 화면에서 실시간 확인'}</span>
  </div>
  <a class="btn-submit sp-cta" href="${esc(discussUrl)}">💬 ${esc(s.name)} 토론 참여하기 · 실시간 시세 보기</a>

  <p class="sp-intro">${esc(s.name)} 종목 토론방은 ${esc(s.name)}(${esc(s.us ? s.ticker : s.code)}) 주가와 뉴스, 종목 정보, 투자자들의 매수·매도 의견을 한곳에서 보는 주식 종목 토론방입니다.
  ${esc(s.name)}은(는) ${esc(sectorNames.join(', '))}에 속하며${rankParts.length ? `, ${esc(rankParts.join(', '))}` : ''} 종목입니다.
  회원은 닉네임·비밀번호 입력 없이 바로 의견을 남길 수 있고, 비회원도 닉네임과 비밀번호로 글을 쓸 수 있습니다.</p>

  <section class="sp-section">
    <h2>${esc(s.name)} 최근 토론글 <span>(${total}건)</span></h2>
    ${postList.length ? `<ul class="sp-posts">${postList.map(p => `
      <li><div class="sp-post-head"><b>${esc(p.nick)}</b>${p.member ? ' <span class="member-badge">회원</span>' : ''} <span class="post-sentiment ${esc(p.sentiment)}">${SENTIMENT[p.sentiment] || SENTIMENT.neutral}</span> <time>${kst(p.ts)}</time></div>
      <p>${esc(String(p.content).slice(0, 400))}${String(p.content).length > 400 ? '…' : ''}</p></li>`).join('')}
    </ul>` : `<p class="sp-empty">아직 ${esc(s.name)} 토론글이 없습니다. 첫 번째 의견을 남겨보세요.</p>`}
    <a class="sp-more" href="${esc(discussUrl)}">${esc(s.name)} 토론 전체 보기 · 글쓰기 →</a>
  </section>

  ${qt?.infos?.length ? `<section class="sp-section">
    <h2>${esc(s.name)} 종목 정보</h2>
    <table class="policy-table sp-info">${qt.infos.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    <p class="sp-note">출처: 네이버 증권${s.us ? ` · 국내 보유 순위: 한국예탁결제원 (${esc(US_AS_OF)} 기준)` : ` · 업종 순위: ${esc(STOCKS_AS_OF)} 기준`}</p>
  </section>` : ''}

  ${newsList.length ? `<section class="sp-section">
    <h2>${esc(s.name)} 최근 뉴스</h2>
    <ul class="sp-news">${newsList.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener nofollow">${esc(n.title)}</a> <span>${esc(n.press || '')} · ${newsTime(n.dt)}</span></li>`).join('')}</ul>
  </section>` : ''}

  <section class="sp-section">
    <h2>${esc(sectorName)} 다른 종목 토론방</h2>
    <ul class="sp-peers">${peers.map(x => `<li><a href="/stock/${encodeURIComponent(x.code)}">${esc(x.name)} 토론방</a></li>`).join('')}</ul>
    <p><a href="/">업종별 주식 종목 토론방 전체 보기 →</a></p>
  </section>
`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: sectorName, item: `${SITE}/?sector=${main}` },
      { '@type': 'ListItem', position: 3, name: `${s.name} 종목 토론방`, item: canonical },
    ],
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(layout({ title, desc, canonical, body, jsonld }));
}
