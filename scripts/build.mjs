import fs from 'fs';
import { fileURLToPath } from 'url';
const S = p => new URL(p, import.meta.url);
const members = JSON.parse(fs.readFileSync(S('./data/members.json')));
const stats = JSON.parse(fs.readFileSync(S('./data/stats.json')));
// [탭 key, 탭 이름, 합칠 원본 업종들(members.json key), 새 탭 여부] — 탭 순서 그대로 화면에 나옴 (2026-10-19 13개 업종 + 미국 주식)
//   key 앞 세 글자가 업종 게시판 코드(SECxxx)가 되므로 서로 겹치면 안 됨
//   새 탭(2026-10-19 추가)은 기존 탭에 이미 뽑힌 종목은 빼고 고름 (DUAL에 있는 종목만 양쪽)
const SECTORS = [['semi', '반도체'], ['elec', '전자·부품', ['elec'], true], ['bio', '바이오'], ['battery', '2차전지·로봇', ['battery', 'robot']],
  ['power', '전력·원자력', ['power', 'nuclear']], ['ship', '조선·방산', ['ship', 'defense']], ['chem', '화학·철강', ['chem'], true], ['auto', '자동차'],
  ['logistics', '물류·건설·기계', ['logistics'], true], ['consumer', '소비재', ['consumer'], true], ['kbeauty', 'K뷰티·컬쳐', ['kbeauty', 'kculture']],
  ['finance', '금융'], ['telecom', '통신·인터넷', ['telecom'], true], ['usa', '미국 주식']];
// 기존 탭에도 있지만 새 탭에도 넣는 종목 (본업이 새 탭에 더 가까운 대표 종목)
const DUAL = {
  elec: ['009150', '353200', '222800', '007810', '140860', '098460'],  // 반도체 기판·장비: 삼성전기·대덕전자·심텍·코리아써키트·파크시스템스·고영
  chem: ['005490', '010130', '051910', '096770'],                      // POSCO홀딩스·고려아연·LG화학·SK이노베이션 (2차전지 탭에도)
  logistics: ['003490', '000720', '047040', '006360', '375500'],      // 대한항공, 대형 건설사 현대건설·대우건설·GS건설·DL이앤씨 (원전 테마로 전력·원자력에도)
};
// 네이버 테마가 여러 업종에 걸쳐 기존 탭끼리 겹치던 종목 → 주력 사업 탭 하나에만 (2026-10-19)
const ONLY = {
  power: ['우리기술', '태웅', '삼미금속', '비츠로테크'],
  ship: ['비츠로셀', '성광벤드', '태광', '하이록코리아', 'SNT다이내믹스', '한일단조', '삼영엠텍'],
  auto: ['기아', '현대위아', 'SNT모티브', '세방전지', '에스엠벡셀'],
  semi: ['솔브레인', '인텍플러스', '미코'],
  battery: ['아진엑스텍', '삼현', '스맥'],
  kbeauty: ['휴젤'],
  bio: ['동국제약'],
  finance: ['케이프'],  // 매출 대부분이 케이프투자증권
};
const ONLY_TAB = new Map(Object.entries(ONLY).flatMap(([k, names]) => names.map(n => [n, k])));
const us = JSON.parse(fs.readFileSync(S('./data/us100.json')));  // us.mjs → us_extra.mjs → us_merge.mjs
// 테마에 걸쳐 있을 뿐 해당 업종 본업이 아닌 종목 제외
const EXCLUDE = {
  robot: ['삼성전자', '현대차', '기아', '현대모비스', 'LG전자', '두산', '현대글로비스', 'LIG디펜스앤에어로스페이스', 'LG이노텍', '현대오토에버', '포스코DX', '에스엘', '원익홀딩스', 'HL만도', '현대위아', '신성델타테크', '한라캐스트', '퍼스텍', '디아이씨', '계양전기', '아이티엠반도체', 'SJG세종', '인탑스', '롯데이노베이트', '나인테크'],
  kbeauty: ['코웨이', '유한양행', '대웅제약', '네이처셀', '파미셀', '현대바이오', '미원상사', '지놈앤컴퍼니', '강스템바이오텍', '국제약품', '동성제약', '유바이오로직스', '현대퓨처넷', '원익'],
  kculture: ['카카오', '이마트', 'IPARK현대산업개발', 'HDC', '다날', '한국정보통신', '한화머시너리앤서비스홀딩스'],
};
// 100개로 늘리며 추가로 걸러낸 비본업 종목 (네이버 업종이 탭과 무관: 석유화학·통신·컴퓨터·휴대폰 액세서리·완구·반도체·방송 등)
const EXCLUDE_MORE = {
  battery: ['대한유화', '성우하이텍'],
  power: ['프리티', '에이루트', 'CS', '코콤', 'SG&G', '대창스틸'],
  kbeauty: ['휴온스', '동구바이오제약', '모아라이프플러스', '슈피겐코리아', '알에프텍', '제이에스코퍼레이션', '넥사다이내믹스', 'HLB글로벌', '헝셩그룹', '프리티', '그래디언트', '고스트스튜디오', '프롬바이오'],
  ship: ['덕산하이메탈', 'YTN', '아이티엠반도체', '아이티센엔텍', '국영지앤엠', '에이텀', '케이앤에스아이앤씨', '웰크론', '에스코넥', '평화산업'],
  auto: ['폴라리스오피스'],
  finance: ['LS네트웍스', '글로벌텍스프리'],
  // 2026-10-19 새 탭: 네이버 업종이 맞지 않는 바이오 성격 종목
  consumer: ['메지온', 'HLB글로벌'],
  chem: ['파미셀'],
  elec: ['아리바이오홀딩스'],
};
EXCLUDE_MORE.nuclear = EXCLUDE_MORE.power;
EXCLUDE_MORE.kculture = EXCLUDE_MORE.kbeauty;
EXCLUDE_MORE.defense = EXCLUDE_MORE.ship;
for (const [k, v] of Object.entries(EXCLUDE_MORE)) EXCLUDE[k] = [...(EXCLUDE[k] || []), ...v];
const AS_OF = process.argv[2];
const capText = v => v >= 1e13 ? (v / 1e12).toFixed(1) + '조' : v >= 1e12 ? (v / 1e12).toFixed(2) + '조' : Math.round(v / 1e8).toLocaleString() + '억';
const all = new Map();
const report = [];
const subList = key => members[key].filter(s => s.code.endsWith('0') && stats[s.code] && !(EXCLUDE[key] || []).includes(s.name));
// 2026-10-19부터 탭마다 64개: 진입 기준 min(시총순위, 토론순위, 거래대금순위×2)이 작은 순 64개 (합친 탭은 합친 후보 전체에서)
const TARGET_N = 64;  // PC 한 줄 6칸: 시장·업종 카드 2 + 64 = 66칸 (빈칸 없음)
const US_N = 64;  // 미국 주식: 보관금액 TOP 50 + 보충 순위 14
const DRY = process.argv.includes('--dry');  // 목록만 보고 stocks.js는 안 바꿈
function targetPick(list, n) {
  const rankOf = k => { const r = new Map([...list].sort((a, b) => k(b) - k(a)).map((s, i) => [s.code, i + 1])); return c => r.get(c); };
  const cap = rankOf(s => s.cap), talk = rankOf(s => stats[s.code].posts), tv = rankOf(s => stats[s.code].tv);
  const score = s => Math.min(cap(s.code), talk(s.code), tv(s.code) * 2);
  return [...list].sort((a, b) => score(a) - score(b) || cap(a.code) - cap(b.code)).slice(0, n).map(s => s.code);
}
const taken = new Set();  // 기존 탭에 뽑힌 종목 (새 탭에서 제외)
const ORDERED = [...SECTORS.filter(x => !x[3]), ...SECTORS.filter(x => x[3])];  // 기존 탭 먼저 고르고 새 탭
for (const [key, , subs = [key], isNew] of ORDERED) {
  if (key === 'usa') continue;
  let list = [...new Map(subs.flatMap(subList).map(s => [s.code, s])).values()];
  if (isNew) list = list.filter(s => !taken.has(s.code) || (DUAL[key] || []).includes(s.code));
  list = list.filter(s => !ONLY_TAB.has(s.name) || ONLY_TAB.get(s.name) === key);
  const byCap = [...list].sort((a, b) => b.cap - a.cap);
  const byTalk = [...list].sort((a, b) => stats[b.code].posts - stats[a.code].posts);
  const byTv = [...list].sort((a, b) => stats[b.code].tv - stats[a.code].tv);
  const rank = (arr, c) => arr.findIndex(s => s.code === c) + 1;
  const pick = new Set(targetPick(list, TARGET_N));
  const base = pick.size;
  const chosen = byCap.filter(s => pick.has(s.code));
  if (!isNew) chosen.forEach(s => taken.add(s.code));
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
const usRows = us.rows.filter(r => !r.extra || r.rank <= US_N);
const usByCap = [...usRows].sort((a, b) => usCap(b) - usCap(a)).map(r => r.code);
for (const r of usRows) {
  const order = usByCap.indexOf(r.code) + 1;
  all.set(r.code, { code: r.code, ticker: r.ticker, name: r.name, market: r.exchange.toLowerCase(), us: true, ...(r.etf ? { etf: true } : {}),
    ...(r.logo ? { logo: r.logo } : {}), price: r.price, change: r.change, volume: 0, cap: krw(usCap(r)), sectors: { usa: r.extra ? { order, sel: r.rank, hits: r.hits } : { order, hold: r.rank, amt: usd(r.amt) } } });
}
const usAsOf = us.asOf.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
report.push(`usa: SEIBro ${usAsOf} 보관금액 TOP 50 + 보충 ${usRows.length - 50} (ETF ${usRows.filter(r => r.etf).length})`);
let out = `// 업종별 주요 종목 (기준: ${AS_OF}, 네이버 증권) — 가격은 페이지에서 실시간 갱신
// 업종 탭마다 64종목 (2026-10-19): 시가총액 순위·네이버 종목토론방 최근 1년 글 수 순위·최근 6개월 거래대금 순위(×2) 중
//   가장 좋은 순위가 높은 순으로 64개 (같으면 시총순). 탭 안 정렬은 시총순.
// 업종 구성: 네이버 증권 업종/테마 분류 (바이오=제약·생물공학·생명과학도구, 반도체=반도체와반도체장비,
//   2차전지=2차전지 테마, 조선=조선 업종·테마·조선기자재, 방산=우주항공과국방·방위산업 테마,
//   원자력=원자력발전·원전해체 테마, 자동차=자동차·자동차부품,
//   금융=은행·증권·생명보험·손해보험·카드·기타금융·창업투자,
//   전력=전기장비·전기유틸리티 업종 + 전력설비·전선·스마트그리드 테마, 로봇=로봇·휴머노이드 테마,
//   K뷰티=화장품 업종·테마 + 미용기기·보톡스 테마,
//   K컬쳐=방송과엔터테인먼트·호텔레스토랑레저 업종 + 엔터·음원·여행·카지노·면세점·호텔리조트 테마,
//   2026-10-19 새 탭 (네이버 업종, 기존 탭에 뽑힌 종목 제외 — scripts/members_new.mjs):
//   전자·부품=전자장비와기기·전자제품·디스플레이·통신장비·핸드셋·전기제품·컴퓨터, 화학·철강=석유와가스·화학·철강·비철금속·에너지장비·가스·포장재·종이,
//   물류·건설·기계=해운·물류·항공·운송인프라·철도·건설·기계·건축자재·무역, 소비재=식품·담배·음료·의류·생활용품·가구·유통·레저용품·교육,
//   통신·인터넷=인터넷·IT서비스·게임·소프트웨어·통신서비스·광고·출판)
//   탭 합치기: 2차전지·로봇, 전력·원자력, K뷰티컬쳐(K뷰티+K컬쳐), 조선·방산 = 원본 업종별 선정 종목의 합집합 (순위는 합친 탭 기준)
//   미국주식 64 (ETF 포함, ${usAsOf} 기준): 1~50위 한국예탁결제원(SEIBro) 국내 투자자 보관금액 TOP 50,
//     51~64위 예탁원 최근 1년 월말 보관금액 TOP 50 + 최근 1주~3개월 결제금액 TOP 50 목록 진입 횟수순 (예탁원은 TOP 50까지만 공개)
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
console.log(report.join('\n'), '\n총 고유 종목', all.size);
if (DRY) {  // 미리보기: 탭별 종목 목록만 JSON으로 (node scripts/build.mjs 날짜 --dry 저장경로)
  const preview = SECTORS.map(([key, name]) => ({ key, name, stocks: [...all.values()].filter(o => o.sectors[key]).sort((a, b) => a.sectors[key].order - b.sectors[key].order).map(o => ({ code: o.code, name: o.name, cap: o.cap })) }));
  fs.writeFileSync(process.argv[process.argv.indexOf('--dry') + 1], JSON.stringify(preview));
} else {
  fs.writeFileSync(fileURLToPath(new URL('../stocks.js', import.meta.url)), out);
  // 검색 노출용 파일(api/_stocks.js, sitemap.xml, 홈 종목 링크 목록) 갱신
  await import('./seo.mjs');
}
