// stocks.js → 검색 노출용 파일 생성 (build.mjs 끝에서 자동 실행, 단독 실행도 가능)
//   1) api/_stocks.js  : 종목 페이지(/stock/{코드}) 서버 함수가 쓰는 종목·업종 데이터
//   2) sitemap.xml     : 홈 + 필수 페이지 + 종목 페이지 (2026-10-19 개편 전부터 탭에 있던 종목만 — 새로 들어온 종목은 회원 토론글 기준, api/_public.js·functions/sitemap.xml.js)
//   3) index.html      : <!-- SEO:START --> ~ <!-- SEO:END --> 사이 '전체 종목 토론방' 링크 목록 (접힘)
import fs from 'fs';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { LEGACY } from '../api/_legacy.js';
const DIR = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://upjong.com/';
const ctx = {};
vm.runInNewContext(fs.readFileSync(DIR + 'stocks.js', 'utf8') + '\nthis.r = { SECTORS, STOCKS, STOCKS_AS_OF, US_AS_OF };', ctx);
const { SECTORS, STOCKS, STOCKS_AS_OF, US_AS_OF } = ctx.r;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const LEGACY_CODES = new Set(LEGACY.map(r => r[0]));
const stockUrl = code => `${SITE}stock/${encodeURIComponent(code)}`;

// 1) 서버 함수용 데이터
const slim = STOCKS.map(s => ({ code: s.code, name: s.name, market: s.market, ...(s.us ? { us: true, ticker: s.ticker } : {}), ...(s.etf ? { etf: true } : {}),
  ...(s.logo ? { logo: s.logo } : {}), price: s.price, change: s.change, cap: s.cap, sectors: s.sectors }));
fs.writeFileSync(DIR + 'api/_stocks.js', `// 자동 생성 파일 (scripts/seo.mjs) — stocks.js의 종목·업종 데이터 (종목 페이지 서버 렌더링용)
export const STOCKS_AS_OF = ${JSON.stringify(STOCKS_AS_OF)};
export const US_AS_OF = ${JSON.stringify(US_AS_OF)};
export const SECTORS = ${JSON.stringify(SECTORS)};
export const STOCKS = ${JSON.stringify(slim)};
`);

// 2) 사이트맵
const urls = [
  { loc: SITE, freq: 'daily', pri: '1.0' },
  ...['about.html', 'terms.html', 'privacy.html', 'contact.html'].map(p => ({ loc: SITE + p.replace(/\.html$/, ''), freq: 'monthly', pri: '0.3' })),
  ...STOCKS.filter(s => LEGACY_CODES.has(s.code)).map(s => ({ loc: stockUrl(s.code), freq: 'daily', pri: '0.7' })),
];
fs.writeFileSync(DIR + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);

// 3) 홈 하단 '전체 종목 토론방' 링크 목록 (기본 접힘)
const blocks = SECTORS.map(({ key, name }) => {
  const list = STOCKS.filter(s => s.sectors[key]).sort((a, b) => a.sectors[key].order - b.sectors[key].order);
  return `        <section class="dir-sector">
          <h3>${esc(name)} 종목 토론방 <span>(${list.length})</span></h3>
          <ul>${list.map(s => `<li><a href="/stock/${encodeURIComponent(s.code)}">${esc(s.name)}</a></li>`).join('')}</ul>
        </section>`;
}).join('\n');
const html = `<!-- SEO:START (scripts/seo.mjs로 생성) -->
  <details class="sector-directory">
    <summary>전체 주식 종목 토론방 커뮤니티 게시판 보기 <span>(${STOCKS.length}개 종목)</span></summary>
    <div class="dir-grid">
${blocks}
    </div>
  </details>
  <!-- SEO:END -->`;
let idx = fs.readFileSync(DIR + 'index.html', 'utf8');
if (idx.includes('<!-- SEO:START')) idx = idx.replace(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->/, html);
else {
  if (!idx.includes('\n</main>')) throw new Error('</main> not found');
  idx = idx.replace('\n</main>', '\n\n  ' + html + '\n\n</main>');
}
fs.writeFileSync(DIR + 'index.html', idx);
console.log('seo: api/_stocks.js', STOCKS.length, '종목 · sitemap', urls.length, 'URL · 홈 링크 목록');
