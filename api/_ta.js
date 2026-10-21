// 지수 일봉 → 봉 차트용 최근 봉 + 기술적 지표 (시황 초안 데이터 api/_sihwangData.js · api/_usData.js 공통)
// 루틴이 숫자를 직접 계산하지 않도록 이동평균·RSI·고점/저점·거래량 비율·최근 교차를 미리 계산해 줌
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const r2 = x => x == null ? null : Math.round(x * 100) / 100;
const ma = (closes, n, end = closes.length) => end >= n ? avg(closes.slice(end - n, end)) : null;

// RSI(14): 와일더 방식
function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let up = 0, down = 0;
  for (let i = 1; i <= n; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) up += d; else down -= d; }
  up /= n; down /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    up = (up * (n - 1) + Math.max(d, 0)) / n;
    down = (down * (n - 1) + Math.max(-d, 0)) / n;
  }
  return down === 0 ? 100 : 100 - 100 / (1 + up / down);
}

// priceInfos(네이버 dayCandle) → { candles: 최근 count개 {date MM/DD, open, high, low, close, volume}, ta: 지표 }
export function candlesAndTa(priceInfos, count = 40) {
  const rows = (priceInfos || []).map(p => ({ date: p.localDate, open: p.openPrice, high: p.highPrice, low: p.lowPrice, close: p.closePrice, volume: p.accumulatedTradingVolume }))
    .filter(p => [p.open, p.high, p.low, p.close].every(Number.isFinite));
  if (rows.length < 2) return { candles: [], ta: null };
  const closes = rows.map(p => p.close), n = closes.length, last = rows[n - 1];
  const m5 = ma(closes, 5), m20 = ma(closes, 20), m60 = ma(closes, 60);
  // 최근 5거래일 안의 5일선·20일선 교차
  let cross = null;
  for (let i = n - 1; i >= Math.max(20, n - 5); i--) {
    const a = ma(closes, 5, i + 1) - ma(closes, 20, i + 1), b = ma(closes, 5, i) - ma(closes, 20, i);
    if (a > 0 && b <= 0) { cross = { type: '골든크로스(5일선이 20일선 위로)', date: rows[i].date }; break; }
    if (a < 0 && b >= 0) { cross = { type: '데드크로스(5일선이 20일선 아래로)', date: rows[i].date }; break; }
  }
  const hi = k => Math.max(...rows.slice(-k).map(p => p.high)), lo = k => Math.min(...rows.slice(-k).map(p => p.low));
  const vols = rows.map(p => p.volume).filter(Number.isFinite);
  const align = m5 && m20 && m60 ? (m5 > m20 && m20 > m60 ? '정배열(5일>20일>60일)' : m5 < m20 && m20 < m60 ? '역배열(5일<20일<60일)' : '혼조') : null;
  return {
    candles: rows.slice(-count).map(p => ({ ...p, date: `${p.date.slice(4, 6)}/${p.date.slice(6, 8)}` })),
    ta: {
      date: last.date, close: last.close,
      ma5: r2(m5), ma20: r2(m20), ma60: r2(m60), maAlign: align,
      vsMa: { ma5: m5 && r2((last.close / m5 - 1) * 100), ma20: m20 && r2((last.close / m20 - 1) * 100), ma60: m60 && r2((last.close / m60 - 1) * 100) },  // 이평선 대비 %
      rsi14: r2(rsi(closes)),
      high20: hi(20), low20: lo(20), high60: hi(60), low60: lo(60),
      fromHigh60: r2((last.close / hi(60) - 1) * 100), fromLow60: r2((last.close / lo(60) - 1) * 100),  // 60일 고점·저점 대비 %
      volRatio20: vols.length > 20 ? r2(vols.at(-1) / avg(vols.slice(-21, -1))) : null,  // 오늘 거래량 ÷ 직전 20일 평균
      lastCandle: { open: last.open, high: last.high, low: last.low, close: last.close, body: last.close >= last.open ? '양봉' : '음봉', upperWick: r2(last.high - Math.max(last.open, last.close)), lowerWick: r2(Math.min(last.open, last.close) - last.low) },
      recentCross: cross,
    },
  };
}
