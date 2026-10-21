// GET /column            → 운영자 칼럼(주식 강의) 목록 페이지 (서버 렌더링 HTML)
// GET /sihwang, /sihwang/{글 id} → 주식 시황 목록·본문 (query board=sihwang, functions/sihwang/*) — 목록은 최신 글부터
// GET /column/{글 id}     → 운영자 칼럼 본문 페이지
// 검색 로봇이 자바스크립트 없이 제목·본문을 읽을 수 있도록 글자로 내보냄 (홈 화면의 칼럼 탭 /?column={id}는 같은 글의 토론 화면)
import { redis, dbReady } from './_redis.js';
import { layout, esc, kst, SITE, NAME } from './page.js';
import { COLUMN_ORDER_KEY, SERIES_SIZE, seriesOf, sortColumns } from './_colorder.js';
import { renderRich, stripRich } from './_rich.js';

// 운영자 게시판 두 개: 주식 강의(연재 순서) · 주식 시황(최신 글부터)
const BOARDS = {
  column: { code: 'COLMKT', path: '/column', app: 'column', name: '주식 강의', unit: '강의', josa: '가', latest: false,
    titleTail: '주식 투자 기초·지표 분석', intro: '주식 투자에 필요한 지표 읽는 법, 기업 분석 방법, 시장을 보는 관점을 운영자가 쉽게 정리한 글입니다.',
    descTail: '등 투자 지표와 분석 방법을 쉽게 정리합니다.' },
  sihwang: { code: 'COLNEWS', path: '/sihwang', app: 'sihwang', name: '주식 시황', unit: '시황', josa: '이', latest: true,
    titleTail: '오늘의 주식 시장·종목 정보', intro: '운영자가 매일 정리하는 주식 시장 흐름과 종목 정보입니다.',
    descTail: '등 오늘의 주식 시장과 종목 정보를 정리합니다.' },
};
const LIST_MAX = 200;
const PAGE_SIZE = 10;  // 목록 한 페이지 칼럼 수
const isPostId = id => /^[0-9a-z]{6,20}$/.test(id || '');
const noImgs = text => stripRich(text);  // 요약용: 사진 빼고 표·그래프는 [표: 제목]처럼

// 칼럼 목록 (강의는 연재 순서, 시황은 최신 글부터, 삭제·블라인드 제외)
async function loadColumns(B) {
  if (!dbReady()) return [];
  const [ids] = await redis([['LRANGE', `posts:${B.code}`, 0, LIST_MAX - 1]]);
  if (!ids?.length) return [];
  const [raws, order] = await redis([['MGET', ...ids.map(id => `post:${id}`)], ['HGETALL', COLUMN_ORDER_KEY]]);  // 칼럼 전체를 한 번에
  // 연재 순서: 운영자가 정한 순번(colorder) → 없으면 먼저 쓴 글부터 (api/_colorder.js)
  const posts = (raws || []).filter(Boolean).map(r => JSON.parse(r)).filter(p => p.code === B.code && !p.blind && Number.isFinite(p.ts));
  return B.latest ? posts.sort((a, b) => b.ts - a.ts) : sortColumns(posts, order);
}

// 본문: 빈 줄로 문단을 나누고, 문단 안 줄바꿈은 그대로 · 표·그래프·사진 (api/_rich.js)
const paragraphs = renderRich;
const summary = (text, n = 150) => { const t = noImgs(text).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const day = ts => kst(ts).slice(0, 10);
const listHtml = (cols, B) => `<ul class="col-page-list">${cols.map(c => `
  <li><a href="${B.path}/${esc(c.id)}">${esc(c.title || summary(c.content, 40))}</a><span>${day(c.ts)}</span></li>`).join('')}
</ul>`;

// 강의 목록 페이지 맨 위 띠 (10편 = 한 시리즈 = 한 페이지, api/_colorder.js)
const seriesBand = (B, start, count) => {
  const s = !B.latest && PAGE_SIZE === SERIES_SIZE ? seriesOf(start) : null;
  return s ? `<div class="col-series"><span class="col-series-no">주식 초보 탈출 ${s.n}편</span><span class="col-series-name">${esc(s.name)}</span><span class="col-series-count">강의 ${count}편</span></div>` : '';
};

export default async function handler(req, res) {
  const B = req.query.board === 'sihwang' ? BOARDS.sihwang : BOARDS.column;
  const id = String(req.query.id ?? '').trim();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 칼럼 id 형식이 아니면 DB를 읽지 않고 바로 404 (아무 주소나 넣어 DB 호출을 늘리지 못하게)
  if (id && !isPostId(id)) {
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(404).send(layout({ title: `${B.unit}${B.josa === '가' ? '를' : '을'} 찾을 수 없습니다 | ${NAME}`, desc: `요청한 ${B.unit}${B.josa} 없습니다.`, canonical: `${SITE}${B.path}`, status: 404,
      body: `<h1>${B.unit}${B.josa === '가' ? '를' : '을'} 찾을 수 없습니다</h1><p><a href="${B.path}">${B.name} 목록 보기</a></p>` }));
  }
  let cols = [];
  try { cols = await loadColumns(B); } catch (err) {
    // DB 오류: 빈 목록·404를 캐시하거나 검색엔진에 알리지 않도록 잠시 후 다시 시도 응답
    console.error('column load', err);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.status(503).send(layout({ title: `잠시 후 다시 시도해주세요 | ${NAME}`, desc: '일시적인 오류입니다.', canonical: `${SITE}${B.path}`, status: 503,
      body: `<h1>잠시 후 다시 시도해주세요</h1><p>일시적으로 ${B.unit}${B.josa === '가' ? '를' : '을'} 불러오지 못했습니다.</p>` }));
  }

  // 목록 페이지
  if (!id) {
    const pages = Math.max(1, Math.ceil(cols.length / PAGE_SIZE));
    const page = Math.min(Math.max(1, parseInt(req.query.page, 10) || 1), pages);
    const shown = cols.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pageUrl = n => n === 1 ? B.path : `${B.path}?page=${n}`;
    const nums = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, i) => page - 2 + i)])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    let numHtml = '', last = 0;
    for (const n of nums) { if (n - last > 1) numHtml += '<span class="pager-gap">…</span>'; numHtml += n === page ? `<span class="pager-btn on" aria-current="page">${n}</span>` : `<a class="pager-btn" href="${pageUrl(n)}">${n}</a>`; last = n; }
    const pager = pages > 1 ? `<nav class="pager" aria-label="${B.unit} 페이지">${page > 1 ? `<a class="pager-btn" href="${pageUrl(page - 1)}" rel="prev" aria-label="이전 페이지">‹</a>` : '<span class="pager-btn disabled">‹</span>'}${numHtml}${page < pages ? `<a class="pager-btn" href="${pageUrl(page + 1)}" rel="next" aria-label="다음 페이지">›</a>` : '<span class="pager-btn disabled">›</span>'}</nav>` : '';
    const canonical = `${SITE}${pageUrl(page)}`;
    const title = `${B.name}${page > 1 ? ` ${page}페이지` : ''} - ${B.titleTail} | ${NAME}`;
    const desc = `${NAME} 운영자가 쓰는 ${B.name}. ${cols.slice(0, 3).map(c => c.title).filter(Boolean).join(', ')} ${B.descTail}`;
    const body = `
  <nav class="sp-sub"><a href="/">홈</a> › ${B.name}</nav>
  <h1>${B.name}</h1>
  <p class="sp-intro">${B.intro} ${B.unit} ${cols.length}편.</p>
  <section class="sp-section">${cols.length ? seriesBand(B, (page - 1) * PAGE_SIZE, shown.length) + listHtml(shown, B) + pager : `<p>아직 ${B.name}${B.josa} 없습니다.</p>`}</section>
  <p class="sp-section"><a class="btn-submit sp-cta" href="/?${B.app}=list">${B.name} 게시판 가기 (공감·의견)</a></p>`;
    const jsonld = {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: B.name, url: canonical,
      hasPart: shown.map(c => ({ '@type': 'Article', headline: c.title, url: `${SITE}${B.path}/${c.id}`, datePublished: new Date(c.ts).toISOString() })),
    };
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(layout({ title, desc, canonical, body, jsonld }));
  }

  const i = isPostId(id) ? cols.findIndex(c => c.id === id) : -1;
  if (i < 0) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(404).send(layout({
      title: `${B.unit}${B.josa === '가' ? '를' : '을'} 찾을 수 없습니다 | ${NAME}`, desc: `요청한 ${B.unit}${B.josa} 없거나 삭제되었습니다.`, canonical: `${SITE}${B.path}`, status: 404,
      body: `<h1>${B.unit}${B.josa === '가' ? '를' : '을'} 찾을 수 없습니다</h1><p>삭제되었거나 주소가 잘못되었습니다.</p><p><a href="${B.path}">${B.name} 목록 보기</a></p>`,
    }));
  }

  const c = cols[i];
  // 이전 글 = 먼저 쓴 글: 강의 목록은 먼저 쓴 글부터라 앞 칸, 시황은 최신 글부터라 뒤 칸
  const prev = B.latest ? cols[i + 1] : cols[i - 1], next = B.latest ? cols[i - 1] : cols[i + 1];
  const canonical = `${SITE}${B.path}/${c.id}`;
  const title = `${c.title || summary(c.content, 40)} | ${B.name} | ${NAME}`;
  const desc = summary(c.content, 150);
  const others = cols.filter(x => x.id !== c.id).slice(0, 10);
  const body = `
  <nav class="sp-sub"><a href="/">홈</a> › <a href="${B.path}">${B.name}</a></nav>
  <article class="col-page no-copy">
    ${(s => s ? `<p class="col-series-tag">주식 초보 탈출 ${s.n}편 · ${esc(s.name)}</p>` : '')(B.latest ? null : seriesOf(i))}
    <h1>${esc(c.title || '')}</h1>
    <p class="sp-sub">운영자 · ${day(c.ts)}${c.editedTs ? ` · 수정 ${day(c.editedTs)}` : ''}</p>
    <div class="col-page-body">
${paragraphs(c.content)}
    </div>
  </article>
  <p class="sp-disclaimer">본 ${B.unit}${B.josa === '가' ? '는' : '은'} 투자 이해를 돕기 위한 일반 정보이며 특정 종목의 매수·매도 권유가 아닙니다. 투자 결정은 본인 책임입니다.</p>
  <p class="sp-section"><a class="btn-submit sp-cta" href="/?${B.app}=${esc(c.id)}">이 ${B.unit}에 공감·의견 남기기 (토론 게시판)</a></p>
  <nav class="col-page-nav">
    ${prev ? `<a href="${B.path}/${esc(prev.id)}"><span>← 이전 글</span>${esc(prev.title || '')}</a>` : '<span class="disabled"><span>← 이전 글</span>이전 글이 없습니다</span>'}
    <a class="col-page-list-link" href="${B.path}">목록으로</a>
    ${next ? `<a href="${B.path}/${esc(next.id)}"><span>다음 글 →</span>${esc(next.title || '')}</a>` : '<span class="disabled"><span>다음 글 →</span>다음 글이 없습니다</span>'}
  </nav>
  ${others.length ? `<section class="sp-section"><h2>다른 ${B.name}</h2>${listHtml(others, B)}</section>` : ''}`;
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
        { '@type': 'ListItem', position: 2, name: B.name, item: `${SITE}${B.path}` },
        { '@type': 'ListItem', position: 3, name: c.title, item: canonical },
      ],
    },
  ];
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  const firstImg = (String(c.content).match(/\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/) || [])[1];
  if (firstImg) jsonld[0].image = SITE + firstImg;
  res.status(200).send(layout({ title, desc, canonical, body, jsonld, image: firstImg ? SITE + firstImg : null, ogType: 'article' }));
}
