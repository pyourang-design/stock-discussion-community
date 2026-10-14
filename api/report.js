// GET /api/report?kind=company|industry|invest&id=96634 → 증권사 리포트 원문 PDF를 바로 보여줌
// 네이버 리서치 상세에서 원문(attachUrl)을 찾아 PDF로 전달 (원본은 application/octet-stream이라 그대로 열면 다운로드됨)
// 원문이 없으면 네이버 리서치 상세 화면으로 이동
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const KINDS = new Set(['company', 'industry', 'invest']);
const PDF_RE = /^https:\/\/stock\.pstatic\.net\/stock-research\/[\w/.-]+\.pdf$/;

export default async function handler(req, res) {
  const kind = String(req.query.kind || ''), id = String(req.query.id || '');
  if (!KINDS.has(kind) || !/^\d{1,10}$/.test(id)) return res.status(400).json({ error: 'kind 또는 id가 올바르지 않습니다' });
  const naverPage = `https://m.stock.naver.com/research/${kind}/${id}`;
  try {
    const r = await fetch(`https://m.stock.naver.com/api/research/${kind}/${id}`, {
      headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/', 'Accept': 'application/json' },
    });
    const c = r.ok ? (await r.json()).researchContent : null;
    if (!c || !PDF_RE.test(c.attachUrl || '')) throw new Error('no pdf');
    const pdf = await fetch(c.attachUrl, { headers: { 'User-Agent': UA, 'Referer': 'https://m.stock.naver.com/' } });
    if (!pdf.ok) throw new Error(`HTTP ${pdf.status}`);
    const name = `${c.brokerName || ''} ${c.title || id}`.trim().replace(/[\/:*?"<>|]/g, ' ').slice(0, 100);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}.pdf`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');  // 리포트 원문은 바뀌지 않음
    res.send(pdf.body);
  } catch {
    res.setHeader('Location', naverPage);
    res.status(302).end();
  }
}
