// 운영자 칼럼(주식 강의·주식 시황) 본문 → HTML (서버에서만: 사이트 칼럼 탭은 columnPost 응답의 html, 검색용 /column·/sihwang 페이지)
// 본문 문법 (그 밖의 글자는 모두 escape):
//   빈 줄                 문단 나눔 (문단 안 줄바꿈은 그대로)
//   [사진:/img/{id}.png]  사진 (관리자 사진 넣기·초안 사진 올리기)
//   [표:제목] … [/표]     한 줄에 한 행, 칸은 | 로 나눔, 첫 줄은 머리글. 제목은 생략 가능 ([표])
//   [막대:제목] … [/막대] 한 줄에 '이름 | 값' (예: 반도체 | +3.25%) → 가로 막대 그래프 (양수 빨강·음수 파랑)
//   [선:제목] … [/선]     한 줄에 '날짜 | 값' (예: 10/21 | 5,708.83) → 꺾은선 그래프
//   [봉:제목] … [/봉]     한 줄에 '날짜 | 시가 | 고가 | 저가 | 종가' → 일봉(캔들) 차트 + 5일·20일 이동평균선 (양봉 빨강·음봉 파랑)
const IMG_RE = /\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/g;
const BLOCK_RE = /^\[(표|막대|선|봉)(?::([^\]\n]{0,60}))?\]\n([\s\S]*?)\n\[\/\1\]$/gm;
const MAX_ROWS = 40, MAX_COLS = 8, MAX_CANDLES = 60;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const numOf = s => { const m = String(s).replace(/,/g, '').match(/[-+−]?\d+(?:\.\d+)?/); return m ? Number(m[0].replace('−', '-')) : null; };
const rowsOf = body => body.split('\n').map(l => l.trim()).filter(Boolean).slice(0, MAX_ROWS).map(l => l.split('|').map(c => c.trim()).slice(0, MAX_COLS));
const caption = (title, cls) => title ? `<figcaption class="${cls}">${esc(title)}</figcaption>` : '';

function tableHtml(title, body) {
  const rows = rowsOf(body);
  if (!rows.length) return '';
  const [head, ...rest] = rows;
  const n = Math.max(...rows.map(r => r.length));
  const cell = (c, tag) => { const v = numOf(c); const cls = /^[+]/.test(c) && v ? ' class="up"' : /^[-−]/.test(c) && v ? ' class="down"' : ''; return `<${tag}${tag === 'td' ? cls : ''}>${esc(c)}</${tag}>`; };
  const tr = (r, tag) => `<tr>${Array.from({ length: n }, (_, i) => cell(r[i] ?? '', i === 0 && tag === 'td' ? 'th' : tag)).join('')}</tr>`;
  return `<figure class="rich-fig">${caption(title, 'rich-cap')}<div class="rich-table-wrap"><table class="rich-table"><thead>${tr(head, 'th')}</thead><tbody>${rest.map(r => tr(r, 'td')).join('')}</tbody></table></div></figure>`;
}

function barHtml(title, body) {
  const items = rowsOf(body).map(([name, val = '']) => ({ name, val, v: numOf(val) })).filter(x => x.name && x.v != null);
  if (!items.length) return '';
  const max = Math.max(...items.map(x => Math.abs(x.v))) || 1;
  const mixed = items.some(x => x.v < 0) && items.some(x => x.v > 0);
  const rows = items.map(x => {
    const w = (Math.abs(x.v) / max * (mixed ? 50 : 100)).toFixed(1);
    const left = mixed ? (x.v < 0 ? 50 - Number(w) : 50) : 0;
    return `<div class="rich-bar-row"><span class="rich-bar-name">${esc(x.name)}</span><span class="rich-bar-track${mixed ? ' mixed' : ''}"><span class="rich-bar ${x.v < 0 ? 'down' : 'up'}" style="left:${left}%;width:${w}%"></span></span><span class="rich-bar-val ${x.v < 0 ? 'down' : x.v > 0 ? 'up' : ''}">${esc(x.val)}</span></div>`;
  }).join('');
  return `<figure class="rich-fig">${caption(title, 'rich-cap')}<div class="rich-bars">${rows}</div></figure>`;
}

function lineHtml(title, body) {
  const pts = rowsOf(body).map(([label, val = '']) => ({ label, v: numOf(val) })).filter(p => p.v != null);
  if (pts.length < 2) return '';
  const W = 600, H = 200, P = { l: 8, r: 8, t: 14, b: 22 };
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = i => P.l + i * (W - P.l - P.r) / (pts.length - 1);
  const y = v => P.t + (hi - v) / span * (H - P.t - P.b);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${H - P.b} ${line} ${x(pts.length - 1).toFixed(1)},${H - P.b}`;
  const fmt = v => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const up = pts.at(-1).v >= pts[0].v;
  const iHi = vs.indexOf(hi), iLo = vs.indexOf(lo);
  const svg = `<svg class="rich-line ${up ? 'up' : 'down'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '그래프')}" preserveAspectRatio="none">
<polygon class="rich-line-area" points="${area}"/><polyline class="rich-line-path" points="${line}" vector-effect="non-scaling-stroke"/>
<circle class="rich-line-dot" cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts.at(-1).v).toFixed(1)}" r="4"/></svg>`;
  return `<figure class="rich-fig">${caption(title, 'rich-cap')}<div class="rich-line-box">${svg}
<div class="rich-line-meta"><span>${esc(pts[0].label)}</span><span>최고 ${fmt(hi)} (${esc(pts[iHi].label)}) · 최저 ${fmt(lo)} (${esc(pts[iLo].label)})</span><span>${esc(pts.at(-1).label)} <b class="${up ? 'up' : 'down'}">${fmt(pts.at(-1).v)}</b></span></div></div></figure>`;
}

// 일봉 차트: 봉(몸통·꼬리) + 이동평균선(블록 안 종가로 계산, 5일 주황·20일 보라), 아래에 기간·최고·최저·마지막 종가
function candleHtml(title, body) {
  const rows = body.split('\n').map(l => l.trim()).filter(Boolean).slice(-MAX_CANDLES).map(l => l.split('|').map(c => c.trim()))
    .map(([label, o, h, l, c]) => ({ label, o: numOf(o), h: numOf(h), l: numOf(l), c: numOf(c) }))
    .filter(p => [p.o, p.h, p.l, p.c].every(v => v != null) && p.h >= Math.max(p.o, p.c) && p.l <= Math.min(p.o, p.c));
  if (rows.length < 2) return '';
  const W = 600, H = 230, P = { l: 6, r: 6, t: 12, b: 10 };
  const hi = Math.max(...rows.map(p => p.h)), lo = Math.min(...rows.map(p => p.l)), span = hi - lo || 1;
  const step = (W - P.l - P.r) / rows.length, bw = Math.max(2, Math.min(14, step * 0.62));
  const x = i => P.l + step * (i + 0.5), y = v => P.t + (hi - v) / span * (H - P.t - P.b);
  const candles = rows.map((p, i) => {
    const up = p.c >= p.o, top = y(Math.max(p.o, p.c)), h = Math.max(1, y(Math.min(p.o, p.c)) - top);
    return `<g class="${up ? 'up' : 'down'}"><line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${y(p.h).toFixed(1)}" y2="${y(p.l).toFixed(1)}"/><rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"/></g>`;
  }).join('');
  const maLine = (n, cls) => { const pts = rows.map((p, i) => i >= n - 1 ? `${x(i).toFixed(1)},${y(rows.slice(i - n + 1, i + 1).reduce((s, q) => s + q.c, 0) / n).toFixed(1)}` : null).filter(Boolean); return pts.length > 1 ? `<polyline class="${cls}" points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/>` : ''; };
  const fmt = v => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const last = rows.at(-1), up = last.c >= rows.at(-2).c;  // 마지막 종가 색: 전날 종가 대비
  const legend = `<span class="rich-candle-legend"><i class="ma5"></i>5일선 <i class="ma20"></i>20일선</span>`;
  const svg = `<svg class="rich-candle" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '일봉 차트')}" preserveAspectRatio="none">${candles}${maLine(5, 'ma5')}${maLine(20, 'ma20')}</svg>`;
  return `<figure class="rich-fig">${caption(title, 'rich-cap')}<div class="rich-line-box">${legend}${svg}
<div class="rich-line-meta"><span>${esc(rows[0].label)}</span><span>최고 ${fmt(hi)} · 최저 ${fmt(lo)}</span><span>${esc(last.label)} <b class="${up ? 'up' : 'down'}">${fmt(last.c)}</b></span></div></div></figure>`;
}

const BLOCKS = { 표: tableHtml, 막대: barHtml, 선: lineHtml, 봉: candleHtml };

// 본문 → HTML: 그림 블록은 따로 꺼내 두고 나머지 글을 escape한 뒤 제자리에 끼움
export function renderRich(text) {
  const figs = [];
  const src = String(text || '').replace(/\r\n/g, '\n').replace(BLOCK_RE, (_, kind, title, body) => {
    figs.push(BLOCKS[kind]((title || '').trim(), body));
    return `\n\n\u0000${figs.length - 1}\u0000\n\n`;
  });
  return src.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    const fig = p.match(/^\u0000(\d+)\u0000$/);
    if (fig) return figs[Number(fig[1])];
    const html = esc(p).replace(IMG_RE, '<img class="col-img" src="$1" alt="본문 사진" loading="lazy">').replace(/\n/g, '<br>');
    return /^<img class="col-img"[^>]*>$/.test(html) ? html : `<p>${html}</p>`;
  }).join('\n');
}

// 주식 시황 글자 수: 그림 블록(표·막대·선·봉)은 빼고 셈 (api/posts.js · functions/api/sihwang.js · app.js richLen)
export const richTextLength = text => String(text || '').replace(/\r\n/g, '\n').replace(BLOCK_RE, '').trim().length;

// 요약·RSS·설명용 글자만: 사진은 빼고 그림 블록은 [표: 제목]처럼 한 마디로
export const stripRich = text => String(text || '').replace(/\r\n/g, '\n')
  .replace(BLOCK_RE, (_, kind, title) => ` [${kind}${title ? `: ${title.trim()}` : ''}] `)
  .replace(IMG_RE, ' ');
