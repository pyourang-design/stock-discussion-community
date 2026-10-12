import fs from 'fs';
import { fileURLToPath } from 'url';
const S = p => new URL(p, import.meta.url);
const members = JSON.parse(fs.readFileSync(S('./data/members.json')));
const stats = JSON.parse(fs.readFileSync(S('./data/stats.json')));
// [탭 key, 탭 이름, 합칠 원본 업종들(members.json key)] — 합친 탭은 원본 업종별 선정 종목의 합집합
const SECTORS = [['bio', '바이오'], ['semi', '반도체'], ['battery', '2차전지·로봇', ['battery', 'robot']], ['power', '전력·원자력', ['power', 'nuclear']],
  ['kbeauty', 'K뷰티·컬쳐', ['kbeauty', 'kculture']], ['ship', '조선·방산', ['ship', 'defense']], ['auto', '자동차'], ['finance', '금융'], ['usa', '미국 주식']];
const us = JSON.parse(fs.readFileSync(S('./data/us100.json')));  // us.mjs → us_extra.mjs → us_merge.mjs
// 테마에 걸쳐 있을 뿐 해당 업종 본업이 아닌 종목 제외
const EXCLUDE = {
  robot: ['삼성전자', '현대차', '기아', '현대모비스', 'LG전자', '두산', '현대글로비스', 'LIG디펜스앤에어로스페이스', 'LG이노텍', '현대오토에버', '포스코DX', '에스엘', '원익홀딩스', 'HL만도', '현대위아', '신성델타테크', '한라캐스트', '퍼스텍', '디아이씨', '계양전기', '아이티엠반도체', 'SJG세종', '인탑스', '롯데이노베이트', '나인테크'],
  kbeauty: ['코웨이', '유한양행', '대웅제약', '네이처셀', '파미셀', '현대바이오', '미원상사', '지놈앤컴퍼니', '강스템바이오텍', '국제약품', '동성제약', '유바이오로직스', '현대퓨처넷', '원익'],
  kculture: ['카카오', '이마트', 'IPARK현대산업개발', 'HDC', '다날', '한국정보통신', '한화머시너리앤서비스홀딩스'],
};
const AS_OF = process.argv[2];
const capText = v => v >= 1e13 ? (v / 1e12).toFixed(1) + '조' : v >= 1e12 ? (v / 1e12).toFixed(2) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
const all = new Map();
const report = [];
const subList = key => members[key].filter(s => s.code.endsWith('0') && stats[s.code] && !(EXCLUDE[key] || []).includes(s.name));
// 원본 업종 하나의 선정 기준: 시총 TOP 20 + 토론 TOP 20 + 거래대금 TOP 10
// 종목 수를 정한 업종: 기존 기준(시총 N · 토론 N · 거래대금 N/2)의 N을 20에서 넓혀 가며 먼저 들어오는 순서로 채움
//   = 각 종목의 진입 기준 min(시총순위, 토론순위, 거래대금순위×2)이 작은 순, 같으면 시총순
const TARGET = { bio: 50, semi: 50 };
function targetPick(list, n) {
  const rankOf = k => { const r = new Map([...list].sort((a, b) => k(b) - k(a)).map((s, i) => [s.code, i + 1])); return c => r.get(c); };
  const cap = rankOf(s => s.cap), talk = rankOf(s => stats[s.code].posts), tv = rankOf(s => stats[s.code].tv);
  const score = s => Math.min(cap(s.code), talk(s.code), tv(s.code) * 2);
  return [...list].sort((a, b) => score(a) - score(b) || cap(a.code) - cap(b.code)).slice(0, n).map(s => s.code);
}
function subPick(list) {
  const top = (k, n) => [...list].sort((a, b) => k(b) - k(a)).slice(0, n).map(s => s.code);
  return [...top(s => s.cap, 20), ...top(s => stats[s.code].posts, 20), ...top(s => stats[s.code].tv, 10)];
}
for (const [key, , subs = [key]] of SECTORS) {
  if (key === 'usa') continue;
  const list = [...new Map(subs.flatMap(subList).map(s => [s.code, s])).values()];
  const byCap = [...list].sort((a, b) => b.cap - a.cap);
  const byTalk = [...list].sort((a, b) => stats[b.code].posts - stats[a.code].posts);
  const byTv = [...list].sort((a, b) => stats[b.code].tv - stats[a.code].tv);
  const rank = (arr, c) => arr.findIndex(s => s.code === c) + 1;
  const pick = new Set(TARGET[key] ? targetPick(list, TARGET[key]) : subs.flatMap(k => subPick(subList(k))));
  const base = pick.size;
  const chosen = byCap.filter(s => pick.has(s.code));
  chosen.forEach((s, i) => {
    const o = all.get(s.code) || { code: s.code, name: s.name, market: s.market, price: s.price, change: s.change, volume: s.volume, cap: capText(s.cap), sectors: {} };
    const t = rank(byTalk, s.code), v = rank(byTv, s.code);
    o.sectors[key] = { order: i + 1, cap: rank(byCap, s.code), ...(t <= 20 ? { talk: t } : {}), ...(v <= 10 ? { tv: v } : {}) };
    all.set(s.code, o);
  });
  report.push(`${key}: 후보 ${list.length}, 기준합집합 ${base}, 최종 ${chosen.length} | 토론TOP5 ${byTalk.slice(0, 5).map(s => s.name + '(' + stats[s.code].posts + ')').join(', ')}`);
}
// 미국주식 100: 1~50위 예탁원 보관금액 TOP 50, 51~100위 최근 1년 월말 보관 TOP 50·최근 결제금액 TOP 50 진입 횟수순
const krw = v => v >= 1e14 ? Math.round(v / 1e12).toLocaleString() + '조' : v >= 1e12 ? (v / 1e12).toFixed(1) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
const usd = v => v >= 1e10 ? Math.round(v / 1e8).toLocaleString() + '억달러' : (v / 1e8).toFixed(1) + '억달러';
// 원화 시총이 비어 있으면 '5조 4,874억원' 같은 한글 표기를 숫자로
const hangulKrw = t => { const m = String(t || '').match(/(?:([\d,]+)조)?\s*(?:([\d,]+)억)?/); return m ? Number((m[1] || '0').replace(/,/g, '')) * 1e12 + Number((m[2] || '0').replace(/,/g, '')) * 1e8 : 0; };
// 탭 안 순서는 시가총액순 (ETF는 운용 규모), 선정 순위는 hold(1~50위 보관금액)·sel(51~100위)로 따로 보관
const usCap = r => r.capKrw || hangulKrw(r.capText);
const usByCap = [...us.rows].sort((a, b) => usCap(b) - usCap(a)).map(r => r.code);
for (const r of us.rows) {
  const order = usByCap.indexOf(r.code) + 1;
  all.set(r.code, { code: r.code, ticker: r.ticker, name: r.name, market: r.exchange.toLowerCase(), us: true, ...(r.etf ? { etf: true } : {}),
    ...(r.logo ? { logo: r.logo } : {}), price: r.price, change: r.change, volume: 0, cap: krw(usCap(r)), sectors: { usa: r.extra ? { order, sel: r.rank, hits: r.hits } : { order, hold: r.rank, amt: usd(r.amt) } } });
}
const usAsOf = us.asOf.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
report.push(`usa: SEIBro ${usAsOf} 보관금액 TOP 50 + 보충 ${us.rows.length - 50} (ETF ${us.rows.filter(r => r.etf).length})`);
let out = `// 업종별 주요 종목 (기준: ${AS_OF}, 네이버 증권) — 가격은 페이지에서 실시간 갱신
// 업종 탭마다: 시가총액 TOP 20 + 네이버 종목토론방 최근 1년 글 수 TOP 20 + 최근 6개월 거래대금 TOP 10
//   → 중복 제거 (차순위로 채우지 않음). 탭 안 정렬은 시총순.
// 업종 구성: 네이버 증권 업종/테마 분류 (바이오=제약·생물공학·생명과학도구, 반도체=반도체와반도체장비,
//   2차전지=2차전지 테마, 조선=조선 업종·테마·조선기자재, 방산=우주항공과국방·방위산업 테마,
//   원자력=원자력발전·원전해체 테마, 자동차=자동차·자동차부품,
//   금융=은행·증권·생명보험·손해보험·카드·기타금융·창업투자,
//   전력=전기장비·전기유틸리티 업종 + 전력설비·전선·스마트그리드 테마, 로봇=로봇·휴머노이드 테마,
//   K뷰티=화장품 업종·테마 + 미용기기·보톡스 테마,
//   K컬쳐=방송과엔터테인먼트·호텔레스토랑레저 업종 + 엔터·음원·여행·카지노·면세점·호텔리조트 테마)
//   탭 합치기: 2차전지·로봇, 전력·원자력, K뷰티컬쳐(K뷰티+K컬쳐), 조선·방산 = 원본 업종별 선정 종목의 합집합 (순위는 합친 탭 기준)
//   미국주식 100 (ETF 포함, ${usAsOf} 기준): 1~50위 한국예탁결제원(SEIBro) 국내 투자자 보관금액 TOP 50,
//     51~100위 예탁원 최근 1년 월말 보관금액 TOP 50 + 최근 1주~3개월 결제금액 TOP 50 목록 진입 횟수순 (예탁원은 TOP 50까지만 공개)
//     us=true, code=네이버 해외주식 코드
//   로봇·K뷰티·K컬쳐는 테마에만 걸친 비본업 종목(대기업·제약사 등)을 EXCLUDE로 제외
// sectors.{업종}: order=탭 안 순서, cap=시총 순위, talk=토론글 순위(20위 이내), tv=거래대금 순위(10위 이내)
//   미국주식: order=탭 안 시총순(ETF는 규모), hold=국내 보관금액 순위, amt=보관금액 (1~50위) / sel=선정 순위, hits=예탁원 TOP 50 목록 진입 횟수 (51~100위)
// logo: 네이버 금융 종목 로고 (로드 실패 시 첫 글자로 대체)
const LOGO_URL = code => \`https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock\${code}.svg\`;

const STOCKS_AS_OF = ${JSON.stringify(AS_OF)};
const US_AS_OF = ${JSON.stringify(usAsOf)};

const SECTORS = [
${SECTORS.map(([key, name]) => `  { key: ${JSON.stringify(key)}, name: ${JSON.stringify(name)} },`).join('\n')}
];

const STOCKS = [
${[...all.values()].map(o => '  ' + JSON.stringify(o).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\w+: )/g, ', ') + ',').join('\n')}
];
`;
fs.writeFileSync(fileURLToPath(new URL('../stocks.js', import.meta.url)), out);
console.log(report.join('\n'), '\n총 고유 종목', all.size);


// 검색 노출용 파일(api/_stocks.js, sitemap.xml, 홈 종목 링크 목록) 갱신
await import('./seo.mjs');
