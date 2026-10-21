// 운영자 칼럼(주식 강의·주식 시황) 본문 → HTML (서버에서만: 사이트 칼럼 탭은 columnPost 응답의 html, 검색용 /column·/sihwang 페이지)
// 본문 문법 (그 밖의 글자는 모두 escape):
//   빈 줄                 문단 나눔 (문단 안 줄바꿈은 그대로)
//   [사진:/img/{id}.png]  사진 (관리자 사진 넣기·초안 사진 올리기)
//   [표:제목] … [/표]     한 줄에 한 행, 칸은 | 로 나눔, 첫 줄은 머리글. 제목은 생략 가능 ([표])
//   [막대:제목] … [/막대] 한 줄에 '이름 | 값' (예: 반도체 | +3.25%) → 가로 막대 그래프 (양수 빨강·음수 파랑)
//   [선:제목] … [/선]     한 줄에 '날짜 | 값' (예: 10/21 | 5,708.83) → 꺾은선 그래프
const IMG_RE = /\[사진:(\/img\/[0-9a-f]{24}\.(?:webp|jpg|png|gif))\]/g;
const BLOCK_RE = /^\[(표|막대|선)(?::([^\]\n]{0,60}))?\]\n([\s\S]*?)\n\[\/\1\]$/gm;
const MAX_ROWS = 40, MAX_COLS = 8;

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

const BLOCKS = { 표: tableHtml, 막대: barHtml, 선: lineHtml };

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

// 요약·RSS·설명용 글자만: 사진은 빼고 그림 블록은 [표: 제목]처럼 한 마디로
export const stripRich = text => String(text || '').replace(/\r\n/g, '\n')
  .replace(BLOCK_RE, (_, kind, title) => ` [${kind}${title ? `: ${title.trim()}` : ''}] `)
  .replace(IMG_RE, ' ');
