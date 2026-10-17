// GET /column            → 운영자 칼럼 목록 페이지 (서버 렌더링 HTML)
// GET /column/{글 id}     → 운영자 칼럼 본문 페이지
// 검색 로봇이 자바스크립트 없이 제목·본문을 읽을 수 있도록 글자로 내보냄 (홈 화면의 칼럼 탭 /?column={id}는 같은 글의 토론 화면)
import { redis, dbReady } from './_redis.js';
import { layout, esc, kst, SITE, NAME } from './page.js';
import { COLUMN_ORDER_KEY, sortColumns } from './_colorder.js';

const COLUMN_CODE = 'COLMKT';
const LIST_MAX = 200;
const PAGE_SIZE = 10;  // 목록 한 페이지 칼럼 수
const isPostId = id => /^[0-9a-z]{6,20}$/.test(id || '');
// 본문 사진: [사진:/img/{id}] (관리자 칼럼 글쓰기에서 넣음)
const IMG_RE = /\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/g;
const noImgs = text => String(text || '').replace(IMG_RE, ' ');

// 칼럼 목록 (연재 순서, 삭제·블라인드 제외)
async function loadColumns() {
  if (!dbReady()) return [];
  const [ids] = await redis([['LRANGE', `posts:${COLUMN_CODE}`, 0, LIST_MAX - 1]]);
  if (!ids?.length) return [];
  const [raws, order] = await redis([['MGET', ...ids.map(id => `post:${id}`)], ['HGETALL', COLUMN_ORDER_KEY]]);  // 칼럼 전체를 한 번에
  // 연재 순서: 운영자가 정한 순번(colorder) → 없으면 먼저 쓴 글부터 (api/_colorder.js)
  return sortColumns((raws || []).filter(Boolean).map(r => JSON.parse(r)).filter(p => p.code === COLUMN_CODE && !p.blind && Number.isFinite(p.ts)), order);
}

// 본문: 빈 줄로 문단을 나누고, 문단 안 줄바꿈은 그대로
const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  .map(p => `<p>${esc(p).replace(IMG_RE, '<img class="col-img" src="$1" alt="강의 사진" loading="lazy">').replace(/\n/g, '<br>')}</p>`).join('\n');
const summary = (text, n = 150) => { const t = noImgs(text).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const day = ts => kst(ts).slice(0, 10);
const listHtml = cols => `<ul class="col-page-list">${cols.map(c => `
  <li><a href="/column/${esc(c.id)}">${esc(c.title || summary(c.content, 40))}</a><span>${day(c.ts)}</span></li>`).join('')}
</ul>`;

export default async function handler(req, res) {
  const id = String(req.query.id ?? '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 칼럼 id 형식이 아니면 DB를 읽지 않고 바로 404 (아무 주소나 넣어 DB 호출을 늘리지 못하게)
  if (id && !isPostId(id)) {
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(404).send(layout({ title: `강의를 찾을 수 없습니다 | ${NAME}`, desc: '요청한 강의가 없습니다.', canonical: `${SITE}/column`, status: 404,
      body: '<h1>강의를 찾을 수 없습니다</h1><p><a href="/column">주식 강의 목록 보기</a></p>' }));
  }
  let cols = [];
  try { cols = await loadColumns(); } catch (err) {
    // DB 오류: 빈 목록·404를 캐시하거나 검색엔진에 알리지 않도록 잠시 후 다시 시도 응답
    console.error('column load', err);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.status(503).send(layout({ title: `잠시 후 다시 시도해주세요 | ${NAME}`, desc: '일시적인 오류입니다.', canonical: `${SITE}/column`, status: 503,
      body: '<h1>잠시 후 다시 시도해주세요</h1><p>일시적으로 강의를 불러오지 못했습니다.</p>' }));
  }

  // 목록 페이지
  if (!id) {
    const pages = Math.max(1, Math.ceil(cols.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);
    const shown = cols.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pageUrl = n => n === 1 ? '/column' : `/column?page=${n}`;
    const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    let numHtml = '', last = 0;
    for (const n of nums) { if (n - last > 1) numHtml += '<span class="pager-gap">…</span>'; numHtml += n === page ? `<span class="pager-btn on" aria-current="page">${n}</span>` : `<a class="pager-btn" href="${pageUrl(n)}">${n}</a>`; last = n; }
    const pager = pages > 1 ? `<nav class="pager" aria-label="강의 페이지">${page > 1 ? `<a class="pager-btn" href="${pageUrl(page - 1)}" rel="prev" aria-label="이전 페이지">‹</a>` : '<span class="pager-btn disabled">‹</span>'}${numHtml}${page < pages ? `<a class="pager-btn" href="${pageUrl(page + 1)}" rel="next" aria-label="다음 페이지">›</a>` : '<span class="pager-btn disabled">›</span>'}</nav>` : '';
    const canonical = `${SITE}${pageUrl(page)}`;
    const title = `주식 강의${page > 1 ? ` ${page}페이지` : ''} - 주식 투자 기초·지표 분석 | ${NAME}`;
    const desc = `${NAME} 운영자가 쓰는 주식 강의. ${cols.slice(0, 3).map(c => c.title).filter(Boolean).join(', ')} 등 투자 지표와 분석 방법을 쉽게 정리합니다.`;
    const body = `
  <nav class="sp-sub"><a href="/">홈</a> › 주식 강의</nav>
  <h1>주식 강의</h1>
  <p class="sp-intro">주식 투자에 필요한 지표 읽는 법, 기업 분석 방법, 시장을 보는 관점을 운영자가 쉽게 정리한 글입니다. 강의 ${cols.length}편.</p>
  <section class="sp-section">${cols.length ? listHtml(shown) + pager : '<p>아직 주식 강의가 없습니다.</p>'}</section>
  <p class="sp-section"><a class="btn-submit sp-cta" href="/?column=list">주식 강의 게시판 가기 (공감·의견)</a></p>`;
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: '주식 강의', url: canonical,
      hasPart: shown.map(c => ({ '@type': 'Article', headline: c.title, url: `${SITE}/column/${c.id}`, datePublished: new Date(c.ts).toISOString() })),
    };
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(layout({ title, desc, canonical, body, jsonld }));
  }

  const i = isPostId(id) ? cols.findIndex(c => c.id === id) : -1;
  if (i < 0) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(404).send(layout({
      title: `강의를 찾을 수 없습니다 | ${NAME}`, desc: '요청한 강의가 없거나 삭제되었습니다.', canonical: `${SITE}/column`, status: 404,
      body: `<h1>강의를 찾을 수 없습니다</h1><p>삭제되었거나 주소가 잘못되었습니다.</p><p><a href="/column">주식 강의 목록 보기</a></p>`,
    }));
  }

  const c = cols[i];
  const prev = cols[i - 1], next = cols[i + 1];  // 목록은 먼저 쓴 글부터: 이전 글 = 앞 칸
  const canonical = `${SITE}/column/${c.id}`;
  const title = `${c.title || summary(c.content, 40)} | 주식 강의 | ${NAME}`;
  const desc = summary(c.content, 150);
  const others = cols.filter(x => x.id !== c.id).slice(0, 10);
  const body = `
  <nav class="sp-sub"><a href="/">홈</a> › <a href="/column">주식 강의</a></nav>
  <article class="col-page no-copy">
    <h1>${esc(c.title || '')}</h1>
    <p class="sp-sub">운영자 · ${day(c.ts)}${c.editedTs ? ` · 수정 ${day(c.editedTs)}` : ''}</p>
    <div class="col-page-body">
${paragraphs(c.content)}
    </div>
  </article>
  <p class="sp-disclaimer">본 강의는 투자 이해를 돕기 위한 일반 정보이며 특정 종목의 매수·매도 권유가 아닙니다. 투자 결정은 본인 책임입니다.</p>
  <p class="sp-section"><a class="btn-submit sp-cta" href="/?column=${esc(c.id)}">이 강의에 공감·의견 남기기 (토론 게시판)</a></p>
  <nav class="col-page-nav">
    ${prev ? `<a href="/column/${esc(prev.id)}"><span>← 이전 글</span>${esc(prev.title || '')}</a>` : '<span class="disabled"><span>← 이전 글</span>이전 글이 없습니다</span>'}
    <a class="col-page-list-link" href="/column">목록으로</a>
    ${next ? `<a href="/column/${esc(next.id)}"><span>다음 글 →</span>${esc(next.title || '')}</a>` : '<span class="disabled"><span>다음 글 →</span>다음 글이 없습니다</span>'}
  </nav>
  ${others.length ? `<section class="sp-section"><h2>다른 주식 강의</h2>${listHtml(others)}</section>` : ''}`;
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'Article', headline: c.title, description: desc,
      datePublished: new Date(c.ts).toISOString(), dateModified: new Date(c.editedTs || c.ts).toISOString(),
      author: { '@type': 'Organization', name: `${NAME} 운영자`, url: SITE }, publisher: { '@type': 'Organization', name: NAME, url: SITE },
      mainEntityOfPage: canonical, inLanguage: 'ko-KR',
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: '주식 강의', item: `${SITE}/column` },
        { '@type': 'ListItem', position: 3, name: c.title, item: canonical },
      ],
    },
  ];
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  const firstImg = (String(c.content).match(/\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/) || [])[1];
  if (firstImg) jsonld[0].image = SITE + firstImg;
  res.status(200).send(layout({ title, desc, canonical, body, jsonld, image: firstImg ? SITE + firstImg : null, ogType: 'article' }));
}
