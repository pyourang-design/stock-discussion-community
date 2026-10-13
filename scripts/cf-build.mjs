// Cloudflare Pages용 정적 파일을 dist/에 모음 (api·scripts 등 소스는 공개 폴더에 넣지 않음)
// CSS·JS는 브라우저에 4시간 캐시되므로(Cloudflare 기본값) 링크에 내용 해시(?v=)를 붙여 수정 즉시 반영
import fs from 'fs';
import crypto from 'crypto';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const STATIC = /\.(html|js|css|xml|txt|ico|png|jpg|jpeg|svg|webp|json)$/;
const SKIP = new Set(['skills-lock.json', 'package.json', 'package-lock.json', 'vercel.json']);
const ASSETS = ['styles.css', 'app.js', 'stocks.js', 'theme.js'];
const ver = Object.fromEntries(ASSETS.map(a => [a, crypto.createHash('md5').update(fs.readFileSync(new URL(a, root))).digest('hex').slice(0, 8)]));
// href="styles.css" · src="/app.js" → ...?v=해시
const versioned = html => html.replace(/((?:src|href)=")(\/?)(styles\.css|app\.js|stocks\.js|theme\.js)"/g, (_, a, slash, f) => `${a}${slash}${f}?v=${ver[f]}"`);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
let n = 0;
for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  if (!f.isFile() || !STATIC.test(f.name) || SKIP.has(f.name)) continue;
  const src = new URL(f.name, root), out = new URL(f.name, dist);
  if (f.name.endsWith('.html')) fs.writeFileSync(out, versioned(fs.readFileSync(src, 'utf8')));
  else fs.copyFileSync(src, out);
  n++;
}
// 종목 페이지(api/page.js 서버 렌더링)도 같은 버전을 쓰도록 함수용 파일 생성
fs.writeFileSync(new URL('functions/_assets.js', root), `// scripts/cf-build.mjs가 생성 — 정적 파일 버전(내용 해시)\nexport const ASSET_VERSION = ${JSON.stringify(ver)};\n`);
console.log(`dist/ 에 정적 파일 ${n}개 복사, 버전 ${JSON.stringify(ver)}`);
