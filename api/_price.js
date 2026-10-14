// 시세 고르기: 정규장 가격 또는 시간외(넥스트레이드 프리마켓·애프터마켓, 미국 프리·애프터마켓) 가격 중 더 최근 것
// 네이버 시세 데이터(polling realtime / basic)의 overMarketPriceInfo 를 사용 — 네이버 화면처럼 장 마감 후 시세까지 반영
// 정규장 중에는 아침 프리마켓 정보가 정규장보다 오래되어 정규장 가격을 씀
const toNum = v => {
  const n = Number(String(v ?? '0').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const SESSIONS = new Set(['PRE_MARKET', 'AFTER_MARKET']);

export function pickPrice(d) {
  const o = d?.overMarketPriceInfo;
  const regularAt = Date.parse(d?.localTradedAt || '') || 0;
  const overAt = Date.parse(o?.localTradedAt || '') || 0;
  const useOver = Boolean(o && SESSIONS.has(o.tradingSessionType) && toNum(o.overPrice) > 0 && overAt >= regularAt);
  const src = useOver
    ? { price: o.overPrice, diff: o.compareToPreviousClosePrice, ratio: o.fluctuationsRatio, time: o.localTradedAt }
    : { price: d?.closePrice, diff: d?.compareToPreviousClosePrice, ratio: d?.fluctuationsRatio, time: d?.localTradedAt };
  return {
    price: toNum(src.price),
    diff: toNum(src.diff),
    changeRate: toNum(src.ratio),
    time: src.time ?? null,
    session: useOver ? o.tradingSessionType : null,  // PRE_MARKET | AFTER_MARKET | null(정규장)
  };
}
