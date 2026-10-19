// 2026-10-19 업종 탭 추가 (전자·부품, 화학·철강, 물류·건설·기계, 소비재, 통신·인터넷) — members.json에 원본 업종 추가
// 실행 순서: members.mjs → members_add.mjs → members_new.mjs → stats.mjs → build.mjs
// 네이버 증권 업종 번호 (https://m.stock.naver.com/api/stocks/industry)
import fs from 'fs';
const H = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async u => (await fetch(u, H)).json();
const SECTORS = {
  // 금융 (예전엔 저장소에 없는 임시 스크립트로 만들었음) — 은행·증권·생명보험·손해보험·카드·기타금융·창업투자
  finance:   [301, 321, 330, 315, 337, 319, 277],
  // 전자장비와기기·전자제품·디스플레이패널·디스플레이장비및부품·통신장비·핸드셋·전기제품·컴퓨터와주변기기·사무용전자제품
  elec:      [282, 307, 327, 269, 294, 292, 283, 293, 338],
  // 석유와가스·화학·철강·비철금속·에너지장비및서비스·가스유틸리티·포장재·종이와목재·복합유틸리티
  chem:      [313, 272, 304, 322, 295, 312, 311, 318, 331],
  // 해운사·항공화물운송과물류·항공사·운송인프라·도로와철도운송·건설·기계·건축자재·건축제품·무역회사와판매업체
  logistics: [323, 326, 305, 296, 329, 279, 299, 289, 320, 334],
  // 식품·담배·음료·섬유의류·가정용기기와용품·가정용품·가구·백화점과일반상점·식품과기본식료품소매·레저용장비와제품·다각화된소비자서비스·교육서비스·판매업체·인터넷과카탈로그소매·전문소매·문구류
  consumer:  [268, 275, 309, 274, 298, 297, 303, 264, 302, 271, 339, 290, 265, 308, 328, 332],
  // 양방향미디어와서비스·IT서비스·게임엔터테인먼트·소프트웨어·무선통신서비스·다각화된통신서비스·광고·출판
  telecom:   [300, 267, 263, 287, 333, 336, 310, 314],
};
// 반도체 기판·장비 회사: 네이버는 전자장비로 분류하지만 반도체 탭 후보에도 넣음 (전자·부품과 양쪽)
const SEMI_EXTRA = ['009150', '353200', '222800', '007810', '140860', '098460'];  // 삼성전기·대덕전자·심텍·코리아써키트·파크시스템스·고영
// 네이버가 2026-10 바이오 업종(제약·생물공학·생명과학도구) 밖으로 옮긴 바이오 대표 종목 → 바이오 후보에 그대로
const BIO_EXTRA = ['028300', '085660'];  // HLB(건강관리장비와용품)·차바이오텍(건강관리업체및서비스)
// 지주회사(네이버 업종 복합기업)는 따로 탭 없이 그룹 주력 사업 탭 후보에 넣음
const HOLDING_EXTRA = {
  logistics: ['028260'],                 // 삼성물산 (건설·상사)
  power: ['000150', '004800'],           // 두산 (두산에너빌리티), 효성 (효성중공업)
  elec: ['003550'],                      // LG (LG전자·LG디스플레이)
  consumer: ['001040', '005440', '004990'],  // CJ (CJ제일제당), 현대지에프홀딩스 (현대백화점), 롯데지주 (식품·유통)
};

const out = JSON.parse(fs.readFileSync(new URL('./data/members.json', import.meta.url)));  // 기존 업종은 그대로 두고 추가
const row = s => ({
  code: s.itemCode, name: s.stockName, market: s.sosok === '0' ? 'kospi' : 'kosdaq', endType: s.stockEndType,
  cap: Number(s.marketValueRaw), price: Number(s.closePriceRaw), change: Number(s.fluctuationsRatio), volume: Number(s.accumulatedTradingVolumeRaw),
});
const all = new Map();
for (const [sec, nos] of Object.entries(SECTORS)) {
  const m = new Map();
  for (const no of nos) {
    for (let p = 1; p < 10; p++) {
      const j = await get(`https://m.stock.naver.com/api/stocks/industry/${no}?page=${p}&pageSize=100`);
      for (const s of j.stocks) { m.set(s.itemCode, row(s)); all.set(s.itemCode, row(s)); }
      if (j.stocks.length < 100) break;
    }
  }
  out[sec] = [...m.values()].filter(s => s.endType === 'stock' && !/스팩|\d호$/.test(s.name)).sort((a, b) => b.cap - a.cap);
  console.log(sec, out[sec].length, out[sec].slice(0, 12).map(s => s.name).join(','));
}
// BIO_EXTRA·HOLDING_EXTRA가 속한 네이버 업종(건강관리장비와용품·건강관리업체및서비스·복합기업)도 받아 둠 (후보 추가용, 탭으로 쓰지는 않음)
for (const no of [281, 316, 276]) {
  for (let p = 1; p < 10; p++) {
    const j = await get(`https://m.stock.naver.com/api/stocks/industry/${no}?page=${p}&pageSize=100`);
    for (const s of j.stocks) all.set(s.itemCode, row(s));
    if (j.stocks.length < 100) break;
  }
}
for (const [key, extra] of [['semi', SEMI_EXTRA], ['bio', BIO_EXTRA], ...Object.entries(HOLDING_EXTRA)]) {
  const m = new Map(out[key].map(s => [s.code, s]));
  for (const c of extra) if (all.has(c) && !m.has(c)) m.set(c, all.get(c));
  out[key] = [...m.values()].sort((a, b) => b.cap - a.cap);
  console.log(key, '+', extra.filter(c => all.has(c)).map(c => all.get(c).name).join(','));
}
fs.writeFileSync(new URL('./data/members.json', import.meta.url), JSON.stringify(out));
