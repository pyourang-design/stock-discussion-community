// GET /stock/{코드} (vercel.json rewrite → /api/page?code=) → 종목별 토론방 페이지 (서버 렌더링 HTML)
// 검색 로봇이 자바스크립트 없이 읽을 수 있도록 시세·종목 정보·최근 토론글·뉴스·같은 업종 종목 링크를 글자로 내보냄.
// 실제 토론 참여(글쓰기)는 홈 화면의 종목 토론 창(/?stock={코드})에서 함.
import { STOCKS, SECTORS, STOCKS_AS_OF, US_AS_OF } from './_stocks.js';
import { redis, dbReady } from './_redis.js';
import { pickPrice } from './_price.js';
import { needsPosts, publicExtra, indexable } from './_public.js';

const SITE = 'https://upjong.com';
const NAME = '주식 업종 종목 토론방';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' };
const POSTS_SHOWN = 20;
const NEWS_SHOWN = 8;
const BLIND_TEXT = '신고가 누적되어 블라인드 처리된 글입니다.';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 받침에 따라 조사 고르기 (셀트리온은 / 삼성전자는). 영문·숫자로 끝나면 읽는 소리 기준
function josa(word, withBatchim, withoutBatchim) {
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return code % 28 ? withBatchim : withoutBatchim;
  const batchimEnd = /[LMNRlmnr136780]$/;  // 엘·엠·엔·알, 일·삼·육·칠·팔·영 등 받침 소리
  return batchimEnd.test(ch) ? withBatchim : withoutBatchim;
}
const strip = s =>String(s ?? '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
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
    // 종목 정보는 basic, 가격은 시간외(프리·애프터마켓)까지 들어 있는 실시간 시세에서
    const [d, live] = await Promise.all([
      getJson(`https://api.stock.naver.com/stock/${s.code}/basic`),
      getJson(`https://polling.finance.naver.com/api/realtime/worldstock/stock/${s.code}`).catch(() => null),
    ]);
    const q = pickPrice((live?.result?.datas ?? live?.datas ?? [])[0] || d);
    return {
      price: q.price.toLocaleString('en-US', { maximumFractionDigits: 2 }), change: q.changeRate, diff: q.diff, time: q.time, session: q.session,
      infos: (d.stockItemTotalInfos ?? []).filter(x => x.value && x.value !== 'N/A').map(x => [x.key, x.value + (x.valueDesc ? ` (${x.valueDesc})` : '')]),
    };
  }
  const [p, integ] = await Promise.all([
    getJson(`https://polling.finance.naver.com/api/realtime/domestic/stock/${s.code}`),
    getJson(`https://m.stock.naver.com/api/stock/${s.code}/integration`).catch(() => null),
  ]);
  const d = (p.result?.datas ?? p.datas ?? [])[0] || {};
  const q = pickPrice(d);
  return {
    price: q.price.toLocaleString('ko-KR'), change: q.changeRate, diff: q.diff, time: q.time, session: q.session,
    infos: (integ?.totalInfos ?? []).filter(x => x.value).map(x => [x.key, x.value]),
  };
}

async function news(s) {
  if (s.us) {
    const data = await getJson(`https://api.stock.naver.com/news/worldStock/${s.code}?pageSize=${NEWS_SHOWN}&page=1`);
    return data.slice(0, NEWS_SHOWN).map(n => ({ title: strip(n.tit), press: n.ohnm, dt: String(n.dt || '').slice(0, 12), url: `https://n.news.naver.com/article/${n.oid}/${n.aid}` }));
  }
  // 넉넉히 받아 제목이 잘린 기사("…선보...")는 빼고 NEWS_SHOWN건
  const data = await getJson(`https://m.stock.naver.com/api/news/stock/${s.code}?pageSize=${NEWS_SHOWN * 2}&page=1`);
  return data.flatMap(g => g.items ?? []).map(n => ({
    title: strip(n.titleFull || n.title), press: n.officeName, dt: n.datetime,
    url: /^https:\/\//.test(n.mobileNewsUrl || '') ? n.mobileNewsUrl : `https://n.news.naver.com/mnews/article/${n.officeId}/${n.articleId}`,
  })).filter(n => n.title && !/(\.\.\.|…)$/.test(n.title)).slice(0, NEWS_SHOWN);
}

// AI 운영자 실적 글: 제목·표·본문 전체·출처 (검색엔진이 표 숫자를 읽도록 서버에서 그림)
const aiChgClass = t => /^(\+|흑자)/.test(t) ? 'up' : /^(−|적자)/.test(t) ? 'down' : '';
const aiCellHtml = c => c && typeof c === 'object' ? (/^https:\/\/dart\.fss\.or\.kr\//.test(c.u) ? `<a href="${esc(c.u)}" target="_blank" rel="noopener nofollow">${esc(c.t)}</a>` : esc(c.t)) : esc(c);
function aiPostHtml(p) {
  const tables = (p.tables || []).map(t => `<div class="ai-table-wrap"><div class="ai-table-title">${esc(t.title)} <span>단위: ${esc(t.unit)}</span></div>
  <table class="ai-table"><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th>${aiCellHtml(c)}</th>` : `<td class="${i === r.length - 1 && t.cols.at(-1) === '증감' ? aiChgClass(c) : ''}">${aiCellHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('');
  const summary = p.summary || String(p.content || '').split(/(?<=다\.)\s/)[0];
  return `<h3 class="ai-headline">${esc(p.headline || '')}</h3><p class="ai-summary">${esc(summary)}</p><details class="ai-more"><summary>더 보기</summary>${tables}<p>${esc(p.content)}</p>${p.src ? `<div class="ai-src">📄 출처: <a href="${esc(p.src.url)}" target="_blank" rel="noopener nofollow">${esc(p.src.label)}</a> · DART 공시 숫자를 프로그램이 정리한 글이며 투자 권유가 아닙니다.</div>` : ''}</details>`;
}

// page: 1부터, POSTS_SHOWN개씩 (2쪽부터 /stock/{코드}?page=N — 지난 토론글도 검색 로봇이 읽도록)
async function posts(code, page = 1) {
  if (!dbReady()) return { list: [], total: 0 };
  const from = (page - 1) * POSTS_SHOWN;
  const [ids, total] = await redis([['LRANGE', `posts:${code}`, from, from + POSTS_SHOWN - 1], ['LLEN', `posts:${code}`]]);
  if (!ids?.length) return { list: [], total: Number(total) || 0 };
  const raws = await redis(ids.map(id => ['GET', `post:${id}`]));
  const list = raws.filter(Boolean).map(r => JSON.parse(r)).map(p => ({ nick: p.nick, member: Boolean(p.uid), official: Boolean(p.official), ts: p.ts, content: p.blind ? BLIND_TEXT : p.content, ...(p.ai && !p.blind ? { ai: true, headline: p.headline, summary: p.summary, tables: p.tables, src: p.src } : {}) }));
  return { list, total: Number(total) || list.length };
}

// image 없으면(종목 페이지·사진 없는 칼럼) 사이트 공유 이미지 /og-image.png (카카오톡·SNS 미리보기, 원본 scripts/og/og.html)
function layout({ title, desc, canonical, body, jsonld, status = 200, image = null, ogType = 'website', noindex = false }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  ${status === 200 && !noindex ? `<link rel="canonical" href="${esc(canonical)}" />` : '<meta name="robots" content="noindex" />'}
  <meta property="og:type" content="${esc(ogType)}" />
  <meta property="og:site_name" content="${NAME}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(canonical)}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:image" content="${esc(image || SITE + '/og-image.png?v=6')}" />${image ? '' : `
  <meta property="og:image:width" content="2400" />
  <meta property="og:image:height" content="1260" />`}
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
  <script src="/theme.js"></script>
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="업종닷컴" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="/"><span class="logo-icon"><svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true"><defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a5c"/><stop offset="1" stop-color="#e02f4b"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#logoGrad)"/><path d="M9 14v12M16 10v12M23 6v12" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><g fill="#fff"><rect x="7" y="17" width="4" height="6" rx="1"/><rect x="14" y="13" width="4" height="6" rx="1"/><rect x="21" y="9" width="4" height="6" rx="1"/></g></svg></span><span class="logo-text">${NAME} 커뮤니티</span></a>
  </div>
</header>
<main class="container stock-page">
${body}
</main>
<footer class="site-footer">
  <div class="container">
    <nav class="policy-links"><a class="footer-about-link" href="/about.html">사이트 소개</a><a href="/terms.html">이용약관</a><a href="/privacy.html"><b>개인정보처리방침</b></a><a href="/contact.html">연락처</a></nav>
    <p>⚠️ 본 사이트 정보는 투자 권유가 아닙니다. 투자 결정은 본인 책임입니다.</p>
    <p>© 2026 ${NAME}</p>
  </div>
</footer>
<nav class="bottom-nav" aria-label="하단 메뉴">
  <a href="/?tab=fav"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg><span>관심종목 추가</span></a>
  <a href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg><span>Home</span></a>
  <a class="nav-lecture" href="/?column=list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z"/><path d="M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/></svg><span>주식 강의</span></a>
  <button class="theme-toggle" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg><span class="nav-label">Dark</span></button>
  <a class="nav-app" href="/?app=1" title="홈 화면에 바로가기 추가"><span class="nav-app-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11"/><path d="M6.5 9.5 12 15l5.5-5.5"/><path d="M4.5 20h15"/></svg></span><span>앱 다운</span></a>
</nav>
<script src="/visit.js"></script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const code = String(req.query.code ?? '').trim();
  let s = STOCKS.find(x => x.code === code) || STOCKS.find(x => x.code.toLowerCase() === code.toLowerCase());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 업종 탭 밖 종목: 개편으로 탭에서 빠진 옛 종목·관심 종목으로 담긴 적 있는 숨은 종목만 페이지 공개 (api/_public.js)
  // 탭에 새로 들어온 종목과 탭 밖 종목은 회원 토론글이 기준 개수가 되기 전엔 noindex
  let noindex = false;
  if (!s && dbReady()) {
    const x = await publicExtra(code).catch(() => null);
    if (x) s = { market: '', ...x, price: 0, change: 0, sectors: {}, hidden: true };
  }
  if (s && needsPosts(s.code)) noindex = !dbReady() || !(await indexable([s.code]).catch(() => new Map())).has(s.code);

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

  // 토론글 쪽 번호 (어댑터가 2~1000만 넘김). 2쪽부터는 지난 토론글만 — 시세·뉴스·종목 정보는 1쪽에만 (중복 내용·외부 호출 줄임)
  const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), 1000);
  const base = `/stock/${encodeURIComponent(s.code)}`;
  const pageUrl = n => n === 1 ? base : `${base}?page=${n}`;
  const [q, nw, ps] = await Promise.allSettled(page === 1 ? [quote(s), news(s), posts(s.code)] : [null, null, posts(s.code, page)]);
  const qt = q.status === 'fulfilled' ? q.value : null;
  const newsList = nw.status === 'fulfilled' && nw.value ? nw.value : [];
  const { list: postList, total } = ps.status === 'fulfilled' ? ps.value : { list: [], total: 0 };
  const pages = Math.max(1, Math.ceil(total / POSTS_SHOWN));
  if (page > pages && ps.status === 'fulfilled') {  // 없는 쪽 → 마지막 쪽으로
    res.setHeader('Location', pageUrl(pages));
    return res.status(301).end();
  }
  const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  let numHtml = '', last = 0;
  for (const n of nums) { if (n - last > 1) numHtml += '<span class="pager-gap">…</span>'; numHtml += n === page ? `<span class="pager-btn on" aria-current="page">${n}</span>` : `<a class="pager-btn" href="${pageUrl(n)}">${n}</a>`; last = n; }
  const pager = pages > 1 ? `<nav class="pager" aria-label="토론글 페이지">${page > 1 ? `<a class="pager-btn" href="${pageUrl(page - 1)}" rel="prev" aria-label="이전 페이지">‹</a>` : '<span class="pager-btn disabled">‹</span>'}${numHtml}${page < pages ? `<a class="pager-btn" href="${pageUrl(page + 1)}" rel="next" aria-label="다음 페이지">›</a>` : '<span class="pager-btn disabled">›</span>'}</nav>` : '';
  const postsHtml = postList.length ? `<ul class="sp-posts">${postList.map(p => `
      <li><div class="sp-post-head"><b>${esc(p.nick)}</b>${p.ai ? ' <span class="member-badge ai">🤖 자동</span>' : p.official ? ' <span class="member-badge official">운영자</span>' : p.member ? ' <span class="member-badge">회원</span>' : ' <span class="member-badge guest">비회원</span>'} <time>${kst(p.ts)}</time></div>
      ${p.ai ? aiPostHtml(p) : `<p class="sp-clamp">${esc(String(p.content).slice(0, 400))}${String(p.content).length > 400 ? '…' : ''}</p>`}</li>`).join('')}
    </ul>` : `<p class="sp-empty">아직 ${esc(s.name)} 토론글이 없습니다. 첫 번째 의견을 남겨보세요.</p>`;

  const keys = Object.keys(s.sectors);
  const main = keys[0];
  const r = s.sectors[main] || {};
  const rankParts = [];
  if (r.hold) rankParts.push(`국내 투자자 보유 ${r.hold}위 (${r.amt})`);
  if (r.hits) rankParts.push(`국내 투자자 관심 ${r.sel}위`);
  if (r.cap) rankParts.push(`시가총액 ${r.cap}위`);
  if (r.talk) rankParts.push(`네이버 토론글 ${r.talk}위`);  // 네이버 종목토론방 최근 1년 글 수 순위 (이 사이트 글 수 아님)
  if (r.tv) rankParts.push(`거래대금 ${r.tv}위`);
  const idLabel = s.us ? `${s.ticker} · ${s.market.toUpperCase()}${s.etf ? ' ETF' : ''}` : s.hidden ? s.code : `${s.code} · ${s.market.toUpperCase()}`;
  const unit = s.us ? '$' : '';
  const won = s.us ? '' : '원';
  const price = qt?.price ?? (s.hidden ? '-' : s.us ? s.price.toFixed(2) : s.price.toLocaleString());
  const change = Number.isFinite(qt?.change) ? qt.change : s.change;
  const up = change >= 0;
  const sectorNames = keys.map(sectorTitle);
  const sectorName = sectorNames[0] || '';
  const peers = s.hidden ? [] : STOCKS.filter(x => x.code !== s.code && x.sectors[main]).sort((a, b) => a.sectors[main].order - b.sectors[main].order).slice(0, 40);
  const discussUrl = `/?stock=${encodeURIComponent(s.code)}`;

  const title = `${s.name} 종목 토론방(종토방) - 주가·뉴스·투자자 의견 | 주식 종목 토론 게시판`;
  const desc = `${s.name}(${s.us ? s.ticker : s.code}) 종목 토론방·종목 토론 게시판.${s.hidden ? '' : ` ${sectorName} ${rankParts[0] || ''} 종목의`} 실시간 주가, 시가총액·PER·PBR, 최근 뉴스와 투자자 토론 의견을 한곳에서 확인하고 함께 이야기하는 주식 종목 토론방입니다.`;
  const canonical = `${SITE}${pageUrl(page)}`;

  if (page > 1) {
    const from = (page - 1) * POSTS_SHOWN + 1, to = Math.min(page * POSTS_SHOWN, total);
    const body2 = `
  <nav class="breadcrumb"><a href="/">홈</a> › ${s.hidden ? '' : `<a href="/?sector=${esc(main)}">${esc(sectorName)}</a> › `}<a href="${esc(base)}">${esc(s.name)} 종목 토론방</a> › <span>${page}페이지</span></nav>
  <h1>${esc(s.name)} 종목 토론방 지난 토론글 (${page}페이지)</h1>
  <p class="sp-sub">${esc(idLabel)} · 전체 ${total}건 중 ${from}~${to}번째 글 (최신순)</p>
  <a class="btn-submit sp-cta" href="${esc(discussUrl)}">💬 ${esc(s.name)} 토론 참여하기 · 실시간 시세 보기</a>
  <p class="sp-disclaimer">⚠️ 토론글은 투자자 개인 의견이며 투자 권유가 아닙니다. 투자 판단과 그 결과의 책임은 투자자 본인에게 있습니다.</p>

  <section class="sp-section">
    <h2>${esc(s.name)} 지난 토론글 <span>(${page}/${pages}페이지)</span></h2>
    ${postsHtml}
    ${pager}
    <a class="sp-more" href="${esc(base)}">${esc(s.name)} 종목 토론방 첫 페이지 (주가·뉴스·종목 정보) →</a>
  </section>
`;
    const jsonld2 = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: `${s.name} 종목 토론방`, item: SITE + base },
        { '@type': 'ListItem', position: 3, name: `${page}페이지`, item: canonical },
      ],
    };
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(layout({
      title: `${s.name} 종목 토론방 지난 토론글 ${page}페이지 | 주식 종목 토론 게시판`,
      desc: `${s.name}(${s.us ? s.ticker : s.code}) 종목 토론방의 지난 투자자 토론글 ${page}페이지 — 전체 ${total}건 중 ${from}~${to}번째 글.`,
      canonical, body: body2, jsonld: jsonld2, noindex,
    }));
  }

  const body = `
  <nav class="breadcrumb"><a href="/">홈</a> › ${s.hidden ? '' : `<a href="/?sector=${esc(main)}">${esc(sectorName)}</a> › `}<span>${esc(s.name)}</span></nav>
  <h1>${esc(s.name)} 종목 토론방</h1>
  <p class="sp-sub">${esc(idLabel)}${sectorNames.length ? ' · ' + sectorNames.map(esc).join(', ') : ''}${rankParts.length ? ' · ' + esc(rankParts.join(' · ')) : ''}</p>

  <div class="sp-quote">
    <span class="sp-price">${esc(unit + price + won)}</span>
    <span class="sp-change ${up ? 'up' : 'down'}">${up ? '+' : ''}${esc(change)}%</span>${qt?.session ? ' <span class="session-tag">시간외</span>' : ''}
    <span class="sp-time">${qt?.time ? esc(String(qt.time).replace('T', ' ').slice(0, 16)) + ' 기준' : '시세는 토론 화면에서 실시간 확인'}</span>
  </div>
  <a class="btn-submit sp-cta" href="${esc(discussUrl)}">💬 ${esc(s.name)} 토론 참여하기 · 실시간 시세 보기</a>
  <p class="sp-disclaimer">⚠️ 이 페이지의 시세·뉴스·토론글은 정보 제공용이며 투자 권유가 아닙니다. 투자 판단과 그 결과의 책임은 투자자 본인에게 있습니다.</p>

  <p class="sp-intro">${esc(s.name)} 종목 토론방은 ${esc(s.name)}(${esc(s.us ? s.ticker : s.code)}) 주가와 뉴스, 종목 정보, 투자자들의 매수·매도 의견을 한곳에서 보는 주식 종목 토론방입니다.
  ${s.hidden ? '' : `${esc(s.name)}${josa(s.name, '은', '는')} ${esc(sectorNames.join(', '))}에 속하며${rankParts.length ? `, ${esc(rankParts.join(', '))}` : ''} 종목입니다.`}
  회원은 닉네임·비밀번호 입력 없이 바로 의견을 남길 수 있고, 비회원도 닉네임과 비밀번호로 글을 쓸 수 있습니다.</p>

  <section class="sp-section">
    <h2>${esc(s.name)} 최근 토론글 <span>(${total}건)</span></h2>
    ${postsHtml}
    ${pager}
    <a class="sp-more" href="${esc(discussUrl)}">${esc(s.name)} 토론 전체 보기 · 글쓰기 →</a>
  </section>

  ${qt?.infos?.length ? `<section class="sp-section">
    <h2>${esc(s.name)} 종목 정보</h2>
    <table class="policy-table sp-info">${qt.infos.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    <p class="sp-note">출처: 네이버 증권${s.us ? ` · 국내 보유 순위: 한국예탁결제원 (${esc(US_AS_OF)} 기준)` : s.hidden ? '' : ` · 업종 순위: ${esc(STOCKS_AS_OF)} 기준`}</p>
  </section>` : ''}

  ${newsList.length ? `<section class="sp-section">
    <h2>${esc(s.name)} 최근 뉴스</h2>
    <ul class="sp-news">${newsList.map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener nofollow">${esc(n.title)}</a> <span>${esc(n.press || '')} · ${newsTime(n.dt)}</span></li>`).join('')}</ul>
  </section>` : ''}

  <section class="sp-section">
    ${s.hidden ? '' : `<h2>${esc(sectorName)} 다른 종목 토론방</h2>
    <ul class="sp-peers">${peers.map(x => `<li><a href="/stock/${encodeURIComponent(x.code)}">${esc(x.name)} 토론방</a></li>`).join('')}</ul>`}
    <p><a href="/">업종별 주식 종목 토론방 전체 보기 →</a></p>
  </section>
`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
      ...(s.hidden ? [] : [{ '@type': 'ListItem', position: 2, name: sectorName, item: `${SITE}/?sector=${main}` }]),
      { '@type': 'ListItem', position: s.hidden ? 2 : 3, name: `${s.name} 종목 토론방`, item: canonical },
    ],
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(layout({ title, desc, canonical, body, jsonld, noindex }));
}

// 운영자 칼럼 페이지(api/column.js)에서 같은 틀을 씀
export { layout, esc, kst, SITE, NAME };
