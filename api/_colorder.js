// 운영자 칼럼 목록 순서 (사이트 칼럼 탭 action columnList · 검색용 /column 페이지 공통)
// Redis hash 'colorder' = 글 id → 순번(1, 2, 3…). 순번이 있는 글을 순번대로 먼저, 없는 글(새로 쓴 칼럼)은 그 뒤에 먼저 쓴 글부터.
// 작성 시각(ts)은 그대로 두므로 날짜 표시·RSS(최신순)는 바뀌지 않음. 순서를 바꾸려면 colorder 값만 고치면 됨.
export const COLUMN_ORDER_KEY = 'colorder';

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
