// DART 고유번호(corp_code) 표 만들기 — AI 운영자 실적 글용 (api/_corpcodes.js 생성)
// 사용: node scripts/corpcodes.mjs <CORPCODE.xml 경로>
//   CORPCODE.xml은 POST /api/ai {op:'dart', path:'corpCode.xml'} 로 받은 zip을 푼 파일
import fs from 'fs';
import { STOCKS } from '../api/_stocks.js';
import { HIDDEN } from '../api/_hidden.js';  // 숨은 종목 (scripts/listed.mjs) — 관심 종목으로 담기면 AI 소개글·실적 글

const xml = fs.readFileSync(process.argv[2], 'utf8');
const byStock = new Map();
for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
  const get = t => (m[1].match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]?.trim() || '';
  const sc = get('stock_code');
  if (sc) byStock.set(sc, get('corp_code'));
}
const capNum = c => { const m = String(c || '').match(/([\d.]+)\s*(조|억)/); return m ? Number(m[1]) * (m[2] === '조' ? 10000 : 1) : 0; };
const kr = STOCKS.filter(s => !s.sectors?.usa && /^[0-9A-Z]{6}$/.test(s.code));
const missing = kr.filter(s => !byStock.has(s.code));
const list = kr.filter(s => byStock.has(s.code)).sort((a, b) => capNum(b.cap) - capNum(a.cap)).map(s => [s.code, byStock.get(s.code)]);
const hidden = HIDDEN.filter(([c]) => byStock.has(c)).map(([c]) => [c, byStock.get(c)]);
fs.writeFileSync(new URL('../api/_corpcodes.js', import.meta.url),
  `// 자동 생성 (scripts/corpcodes.mjs, ${new Date().toISOString().slice(0, 10)}) — 국내 종목코드 → DART 고유번호, 시가총액 큰 순\n` +
  `export const CORP_CODES = ${JSON.stringify(list)};\n` +
  `// 숨은 종목 (업종 탭에 없는 상장 종목) → DART 고유번호 — 우선주는 DART에 따로 없어 빠짐\n` +
  `export const CORP_HIDDEN = ${JSON.stringify(hidden)};\n`);
console.log(`숨은 종목 ${HIDDEN.length}개 중 ${hidden.length}개 연결`);
console.log(`국내 ${kr.length}개 중 ${list.length}개 연결, 없음 ${missing.length}개:`, missing.map(s => `${s.code} ${s.name}`).join(', '));
