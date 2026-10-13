// Cloudflare Pages용 정적 파일을 dist/에 모음 (api·scripts 등 소스는 공개 폴더에 넣지 않음)
import fs from 'fs';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const STATIC = /\.(html|js|css|xml|txt|ico|png|jpg|jpeg|svg|webp|json)$/;
const SKIP = new Set(['skills-lock.json', 'package.json', 'package-lock.json', 'vercel.json']);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
let n = 0;
for (const f of fs.readdirSync(root, { withFileTypes: true })) {
  if (!f.isFile() || !STATIC.test(f.name) || SKIP.has(f.name)) continue;
  fs.copyFileSync(new URL(f.name, root), new URL(f.name, dist));
  n++;
}
console.log(`dist/ 에 정적 파일 ${n}개 복사`);
