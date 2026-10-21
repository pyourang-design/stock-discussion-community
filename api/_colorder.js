// 운영자 칼럼 목록 순서 (사이트 칼럼 탭 action columnList · 검색용 /column 페이지 공통)
// Redis hash 'colorder' = 글 id → 순번(1, 2, 3…). 순번이 있는 글을 순번대로 먼저, 없는 글(새로 쓴 칼럼)은 그 뒤에 먼저 쓴 글부터.
// 작성 시각(ts)은 그대로 두므로 날짜 표시·RSS(최신순)는 바뀌지 않음. 순서를 바꾸려면 colorder 값만 고치면 됨.
export const COLUMN_ORDER_KEY = 'colorder';

// 강의 시리즈: 연재 순서로 10편씩 한 시리즈 (목록 한 페이지 = 한 시리즈), 띠에 '주식 초보 탈출 N편 · 이름'
// 새 시리즈를 연재하면 여기에 이름을 덧붙이면 됨 (사이트 강의 탭·검색용 /column 페이지 공통)
export const SERIES_SIZE = 10;
export const COLUMN_SERIES = [
  '투자 원칙과 리스크 관리',
  '기본적 분석 (기업 분석)',
  '기술적 분석 (차트 읽기)',
  '주식시장 구조와 수급 읽기',
  '거시경제와 주식 (금리·환율·경기)',
  '업종별 투자 가이드',
  'ETF 투자',
  '실전 종목 발굴',
  '해외 주식 기초',
  '투자 대가에게 배우는 원칙과 위기의 교훈',
];
// 연재 순서 i번째(0부터) 글의 시리즈 → { n: 1부터, name } 또는 null
export const seriesOf = i => (i >= 0 && COLUMN_SERIES[Math.floor(i / SERIES_SIZE)] ? { n: Math.floor(i / SERIES_SIZE) + 1, name: COLUMN_SERIES[Math.floor(i / SERIES_SIZE)] } : null);

// orderFlat: HGETALL 결과 [id, 순번, id, 순번, …]
export function sortColumns(posts, orderFlat) {
  const rank = new Map();
  for (let i = 0; i + 1 < (orderFlat || []).length; i += 2) {
    const n = Number(orderFlat[i + 1]);
    if (Number.isFinite(n)) rank.set(orderFlat[i], n);
  }
  return posts.sort((a, b) => {
    const ra = rank.get(a.id), rb = rank.get(b.id);
    if (ra != null && rb != null) return ra - rb || a.ts - b.ts;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.ts - b.ts;
  });
}
