// 애드센스 필수 페이지 생성: about.html, terms.html, privacy.html, contact.html (D:\claude\homepage)
import fs from 'fs';
import { fileURLToPath } from 'url';
const DIR = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://upjong.com/';
const NAME = '주식 업종 종목 토론방';
const EFFECTIVE = '2026년 10월 12일';
const PRIVACY_EFFECTIVE = '2026년 10월 14일';  // 개인정보처리방침만 개정 (호스팅 이전·접속 IP 이용 반영)
const OWNER = '김업종';
const EMAIL = 'tpsdurang@naver.com';
const mail = `<a href="mailto:${EMAIL}">${EMAIL}</a>`;

const PAGES = [
  { file: 'about.html', title: '사이트 소개', desc: `${NAME}은 업종별 주요 종목과 국내 투자자가 많이 보유한 미국주식의 시세·뉴스·공시와 투자자 토론을 한곳에 모은 커뮤니티입니다.` },
  { file: 'terms.html', title: '이용약관', desc: `${NAME} 이용약관과 게시판 운영정책(금칙어, 신고, 게시물 삭제 기준)입니다.` },
  { file: 'privacy.html', title: '개인정보처리방침', desc: `${NAME}이 수집하는 개인정보 항목, 이용 목적, 보관 기간과 광고 쿠키 안내입니다.` },
  { file: 'contact.html', title: '연락처', desc: `${NAME} 운영자에게 문의·신고·제휴를 남기는 페이지입니다.` },
];

const footerLinks = () => `<nav class="policy-links">
      <a class="footer-about-link" href="about.html">사이트 소개</a><a href="terms.html">이용약관</a><a href="privacy.html"><b>개인정보처리방침</b></a><a href="contact.html">연락처</a>
    </nav>`;

const page = (p, body, extraScript = '') => `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${p.title} | ${NAME}</title>
  <meta name="description" content="${p.desc}" />
  <link rel="canonical" href="${SITE}${p.file.replace(/\.html$/, '')}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${NAME}" />
  <meta property="og:title" content="${p.title} | ${NAME}" />
  <meta property="og:description" content="${p.desc}" />
  <meta property="og:url" content="${SITE}${p.file.replace(/\.html$/, '')}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:image" content="${SITE}og-image.png?v=6" />
  <meta property="og:image:width" content="2400" />
  <meta property="og:image:height" content="1260" />
  <script src="/theme.js"></script>
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="apple-mobile-web-app-title" content="업종닷컴" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="styles.css" />
  <!-- 구글 애드센스 (게시자 pub-5199893565082802) — 허용 주소는 functions/_middleware.js HTML_CSP -->
  <meta name="google-adsense-account" content="ca-pub-5199893565082802" />
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5199893565082802" crossorigin="anonymous"></script>
</head>
<body>

<header class="site-header">
  <div class="container header-inner">
    <a class="logo" href="./">
      <span class="logo-icon"><svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true"><defs><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a5c"/><stop offset="1" stop-color="#e02f4b"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#logoGrad)"/><path d="M9 14v12M16 10v12M23 6v12" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><g fill="#fff"><rect x="7" y="17" width="4" height="6" rx="1"/><rect x="14" y="13" width="4" height="6" rx="1"/><rect x="21" y="9" width="4" height="6" rx="1"/></g></svg></span>
      <span class="logo-text">${NAME} 커뮤니티</span>
    </a>
  </div>
</header>

<main class="container policy-page">
  <div class="policy-head">
    <h1>${p.title}</h1>
    <button type="button" class="modal-close" data-close-page title="닫기 — 이전 화면으로 돌아가요" aria-label="닫기"><span class="x" aria-hidden="true">✕</span>닫기</button>
  </div>
${body}
</main>

<footer class="site-footer">
  <div class="container">
    ${footerLinks()}
    <p>⚠️ 본 사이트 정보는 투자 권유가 아닙니다. 투자 결정은 본인 책임입니다.</p>
    <p>© 2026 ${NAME}</p>
  </div>
</footer>
${extraScript}

<nav class="bottom-nav" aria-label="하단 메뉴">
  <button class="view-toggle" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg><span>카드 보기</span></button>
  <a class="nav-sihwang" href="/?sihwang=list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/></svg><span>주식 시황</span></a>
  <a class="nav-hot" href="/hot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg><span>Hot 종목</span></a>
  <a class="nav-lecture" href="/?column=list"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z"/><path d="M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"/></svg><span>주식 강의</span></a>
  <button class="theme-toggle" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg><span class="nav-label">Dark</span></button>
  <a class="nav-app" href="/?app=1" title="홈 화면에 바로가기 추가"><span class="nav-app-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11"/><path d="M6.5 9.5 12 15l5.5-5.5"/><path d="M4.5 20h15"/></svg></span><span>앱 다운</span></a>
</nav>
</body>
</html>
`;

const about = `
  <p class="policy-lead">주식 실시간 뉴스, 무료 증권사 리포트, 종목 토론방… 아직도 여기저기 찾아다니세요?<br>업종닷컴은 <b>실시간 뉴스부터 무료 증권사 리포트, 업종별·종목별 토론방, 주식 강의까지</b> 한곳에 모은 주식 투자 정보 플랫폼이자 커뮤니티입니다.</p>

  <h2>무엇을 볼 수 있나요</h2>
  <ul>
    <li><b>실시간 종목·업종 뉴스</b> — 종목·업종·시장 뉴스는 1분마다, 화면에 보이는 종목의 주가는 10초마다 갱신됩니다.</li>
    <li><b>무료 증권사 리포트·공시</b> — 종목·산업·투자전략 리포트와 공시를 종목·업종·시장별로 모아 원문까지 무료로 볼 수 있습니다.</li>
    <li><b>업종별 주요 종목·미국주식 64</b> — 반도체, 전자·부품, 바이오, 2차전지·로봇, 전력·원자력, 조선·방산, 화학·철강, 자동차, 물류·건설·기계, 소비재, K뷰티·컬쳐, 금융, 통신·인터넷 13개 업종의 주요 종목과 국내 투자자가 가장 많이 보유한 미국주식(ETF 포함, 한국예탁결제원 기준)을 모았습니다.</li>
    <li><b>운영자 주식 강의</b> — 기업 분석과 투자 지표 읽는 법, 차트 보는 법 등을 주식 강의로 쉽게 정리합니다. 하단 「주식 강의」 메뉴에서 볼 수 있습니다.</li>
  </ul>

  <h2>토론 게시판</h2>
  <ul>
    <li>네이버·토스 등 주요 종목토론방의 장점을 참고해, 뉴스·리포트를 보며 바로 의견을 나누도록 시장·업종·종목 토론 게시판을 두었습니다.</li>
    <li>회원은 닉네임·비밀번호 입력 없이 바로 글을 쓰고, 관심 종목을 저장할 수 있습니다. 비회원도 닉네임과 비밀번호를 정해 글을 쓸 수 있습니다.</li>
    <li>깨끗한 토론 환경을 위해 <b>금칙어 필터</b>, <b>이용자 신고</b>(5건 누적 시 자동 블라인드), <b>운영자 삭제</b>로 게시판을 관리합니다. 자세한 기준은 <a href="terms.html#policy">게시판 운영정책</a>을 확인하세요.</li>
  </ul>

  <h2>데이터 출처</h2>
  <ul>
    <li>시세·뉴스·공시·증권사 리포트: 네이버 증권</li>
    <li>기업 개요(최대주주·외국인지분율): WISEfn</li>
    <li>업종·종목 뉴스: 네이버 증권, Google 뉴스</li>
    <li>미국주식 보유 순위: 한국예탁결제원 증권정보포털(SEIBro)</li>
  </ul>
  <p>시세와 데이터는 제공처 사정에 따라 지연되거나 다를 수 있습니다. 중요한 투자 판단 전에는 원 출처와 증권사 정보를 함께 확인하세요.</p>

  <h2>투자 유의사항</h2>
  <p>이 사이트의 정보와 게시글은 투자 권유가 아니며, 특정 종목의 매수·매도를 추천하지 않습니다. 게시글은 작성자 개인의 의견이며 사실과 다를 수 있습니다. 투자 결정과 그 결과에 대한 책임은 투자자 본인에게 있습니다.</p>

  <h2>문의</h2>
  <p>운영 주체: 개인 · 운영자: ${OWNER} · 이메일: ${mail}</p>
  <p>오류 제보, 게시물 신고, 제휴 문의는 이메일 또는 <a href="contact.html">연락처</a> 페이지의 문의 양식으로 남겨주세요.</p>
`;

const terms = `
  <p class="policy-meta">시행일: ${EFFECTIVE}</p>

  <h2>제1조 (목적)</h2>
  <p>이 약관은 ${NAME}(이하 "사이트")이 제공하는 시세·뉴스 정보 서비스와 토론 게시판(이하 "서비스")의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.</p>

  <h2>제2조 (용어)</h2>
  <ul>
    <li>"이용자"란 사이트에 접속해 서비스를 이용하는 모든 사람을 말합니다.</li>
    <li>"회원"이란 아이디·닉네임·비밀번호를 등록해 가입한 이용자를, "비회원"이란 가입하지 않고 이용하는 이용자를 말합니다.</li>
    <li>"게시물"이란 이용자가 게시판에 올린 글과 의견을 말합니다.</li>
  </ul>

  <h2>제3조 (약관의 효력과 변경)</h2>
  <p>이 약관은 사이트에 게시함으로써 효력이 생깁니다. 운영자는 관련 법령을 위반하지 않는 범위에서 약관을 바꿀 수 있으며, 바꾼 내용은 시행 7일 전부터 이 페이지에 알립니다.</p>

  <h2>제4조 (회원가입과 계정 관리)</h2>
  <ul>
    <li>아이디는 영문 또는 영문+숫자, 닉네임은 한글로 정하며 다른 회원과 중복될 수 없습니다.</li>
    <li>회원은 자신의 비밀번호를 안전하게 관리해야 하며, 계정을 다른 사람에게 빌려주거나 넘길 수 없습니다.</li>
    <li>다른 사람을 사칭하거나 운영자·특정 기관으로 오인될 수 있는 닉네임은 사용할 수 없으며, 운영자가 변경 또는 이용 제한할 수 있습니다.</li>
  </ul>

  <h2>제5조 (서비스의 내용과 변경)</h2>
  <p>사이트는 종목 시세, 뉴스, 공시, 종목 정보, 토론 게시판, 관심 종목 기능을 무료로 제공합니다. 시세와 데이터는 외부 제공처(네이버 증권, 한국예탁결제원 등)의 정보로, 지연·누락·오류가 있을 수 있습니다. 운영자는 서비스 내용을 바꾸거나 점검·장애 시 일시 중단할 수 있습니다.</p>

  <h2>제6조 (투자 책임)</h2>
  <p>사이트의 정보와 게시물은 투자 권유가 아닙니다. 이용자는 자신의 판단과 책임으로 투자하며, 사이트의 정보나 게시물을 근거로 한 투자 결과에 대해 운영자는 책임지지 않습니다.</p>

  <h2>제7조 (게시물의 권리와 책임)</h2>
  <ul>
    <li>게시물의 저작권은 작성자에게 있으며, 작성자는 사이트가 서비스 화면에 게시물을 표시하는 데 동의합니다.</li>
    <li>게시물로 생기는 법적 책임은 작성자에게 있습니다.</li>
    <li>회원은 자신의 글을, 비회원은 작성 시 정한 비밀번호로 자신의 글을 수정·삭제할 수 있습니다.</li>
  </ul>

  <h2 id="policy">제8조 (게시판 운영정책)</h2>
  <p>운영자는 건전한 토론 환경을 위해 아래 기준으로 게시판을 관리합니다.</p>
  <h3>금지되는 게시물</h3>
  <ul>
    <li>욕설, 비속어, 특정인·집단에 대한 비방과 혐오 표현</li>
    <li>광고·홍보, 유료 리딩방·오픈채팅·텔레그램 등 외부 유도, 수익·원금 보장 문구</li>
    <li>시세조종을 목적으로 하거나 근거 없는 허위사실·루머 유포</li>
    <li>음란물, 도박, 불법 금융 등 법령에 어긋나는 내용</li>
    <li>타인의 개인정보 노출, 저작권 침해, 같은 내용의 반복 게시(도배)</li>
  </ul>
  <h3>관리 방법</h3>
  <ul>
    <li><b>금칙어 필터</b>: 욕설·광고·외부 유도 표현이 들어간 글과 닉네임은 등록되지 않습니다.</li>
    <li><b>도배 방지</b>: 같은 브라우저에서는 5초에 1건까지 글을 올릴 수 있습니다.</li>
    <li><b>이용자 신고</b>: 모든 글에 [신고] 버튼이 있습니다. 서로 다른 이용자의 신고가 5건 쌓이면 글이 자동으로 블라인드 처리되고 운영자가 검토합니다.</li>
    <li><b>운영자 조치</b>: 운영자는 신고된 글과 운영정책에 어긋나는 글을 사전 통지 없이 삭제하거나 블라인드할 수 있고, 반복 위반 회원의 이용을 제한할 수 있습니다.</li>
    <li>조치에 이의가 있으면 <a href="contact.html">연락처</a>로 문의해 주세요.</li>
  </ul>

  <h2>제9조 (광고)</h2>
  <p>사이트는 서비스 운영을 위해 Google AdSense 등 제3자 광고를 게재할 수 있습니다. 광고 내용과 광고주의 상품·서비스에 대한 책임은 해당 광고주에게 있습니다.</p>

  <h2>제10조 (이용 제한과 탈퇴)</h2>
  <p>이 약관이나 운영정책을 어긴 이용자는 게시물 삭제, 글쓰기 제한, 회원 자격 제한을 받을 수 있습니다. 회원은 회원정보 화면에서 직접 탈퇴하거나 <a href="contact.html">연락처</a>로 탈퇴(계정 삭제)를 요청할 수 있습니다.</p>

  <h2>제11조 (면책)</h2>
  <p>운영자는 천재지변, 외부 데이터 제공처의 장애, 이용자의 귀책 사유로 생긴 손해에 대해 책임지지 않습니다. 무료로 제공되는 서비스와 관련해 운영자의 고의 또는 중대한 과실이 없는 한 손해를 배상하지 않습니다.</p>

  <h2>부칙</h2>
  <p>이 약관은 ${EFFECTIVE}부터 시행합니다.</p>
  <p>운영자: ${OWNER} · 문의: ${mail}</p>
`;

const privacy = `
  <p class="policy-meta">시행일: ${PRIVACY_EFFECTIVE}</p>
  <p>${NAME}(이하 "사이트")은 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고, 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 둡니다.</p>

  <h2>1. 수집하는 개인정보 항목과 방법</h2>
  <table class="policy-table">
    <thead><tr><th>구분</th><th>항목</th><th>수집 방법</th></tr></thead>
    <tbody>
      <tr><td>회원가입</td><td>아이디, 닉네임, 비밀번호(암호화 저장)</td><td>회원가입 양식</td></tr>
      <tr><td>비회원 글쓰기</td><td>닉네임, 게시글 비밀번호(암호화 저장)</td><td>글쓰기 양식</td></tr>
      <tr><td>서비스 이용</td><td>게시글 내용, 작성 시각, 좋아요·신고 기록, 회원 간 팔로우, 관심 종목</td><td>서비스 이용 과정</td></tr>
      <tr><td>자동 생성</td><td>브라우저 식별용 임의 값(기기 정보와 무관한 난수), 로그인 유지용 세션 값, 접속 IP 주소, 접속 기록(서버 로그)</td><td>브라우저 저장소(localStorage)·서비스 접속 과정</td></tr>
      <tr><td>문의</td><td>이름 또는 닉네임(선택), 회신받을 이메일(선택), 문의 내용</td><td>연락처 문의 양식</td></tr>
    </tbody>
  </table>
  <p>사이트는 주민등록번호, 휴대전화번호, 실명, 결제 정보를 수집하지 않습니다.</p>

  <h2>2. 개인정보의 이용 목적</h2>
  <ul>
    <li>회원 식별, 로그인 유지, 회원 글쓰기와 관심 종목 저장</li>
    <li>게시물 작성자 확인(수정·삭제), 도배·부정 이용 방지, 신고 처리와 게시판 운영</li>
    <li>접속 IP 주소: 짧은 시간 반복 글쓰기·가입·문의 제한, 비밀번호 반복 입력 차단, 같은 글 중복 신고 방지</li>
    <li>문의 응대와 공지</li>
    <li>서비스 개선을 위한 이용 통계(개인을 식별하지 않는 형태)</li>
  </ul>

  <h2>3. 보유 및 이용 기간</h2>
  <ul>
    <li>회원 정보: 탈퇴 시까지. 회원정보 화면에서 탈퇴하면 계정·관심 종목·팔로우 정보가 즉시 삭제됩니다. 단, 탈퇴한 닉네임은 다른 사람의 사칭을 막기 위해 다시 쓸 수 없도록 닉네임만 보관하며, 작성한 게시글은 작성자가 삭제하지 않는 한 남습니다.</li>
    <li>로그인 세션: 마지막 로그인부터 30일 (로그아웃 시 즉시 삭제)</li>
    <li>게시물: 작성자 또는 운영자가 삭제할 때까지</li>
    <li>문의 내역: 처리 완료 후 1년</li>
    <li>접속 IP 주소: 도배 방지·비밀번호 차단 용도는 최대 10분 뒤 자동 삭제. 중복 신고 확인 용도는 IP를 그대로 저장하지 않고 되돌릴 수 없는 값(해시)으로 바꿔, 해당 게시글이 삭제되거나 신고가 처리될 때까지 보관</li>
    <li>관련 법령에서 보관을 요구하는 경우 그 기간 동안 보관합니다.</li>
  </ul>

  <h2>4. 개인정보의 제3자 제공과 처리 위탁</h2>
  <p>사이트는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해 아래와 같이 처리를 위탁합니다.</p>
  <table class="policy-table">
    <thead><tr><th>수탁자</th><th>위탁 업무</th></tr></thead>
    <tbody>
      <tr><td>Cloudflare, Inc.</td><td>웹사이트 호스팅·전송(CDN), 서버 기능 실행, 접속 기록 처리, 보안(공격 차단)</td></tr>
      <tr><td>Upstash, Inc.</td><td>회원·게시물·문의 데이터 저장(데이터베이스)</td></tr>
    </tbody>
  </table>
  <p>뉴스 수집을 위해 Vercel Inc.의 서버를 사용하지만, 이 서버는 사이트 서버가 정해 둔 뉴스 검색어만 처리하며 이용자의 개인정보는 전달되지 않습니다.</p>

  <h3>개인정보의 국외 이전</h3>
  <p>사이트는 서비스 제공(계약 이행)을 위해 아래와 같이 개인정보를 국외에서 처리합니다. 이용자가 사이트에 접속하거나 글쓰기·회원가입을 할 때 네트워크를 통해 전송됩니다.</p>
  <table class="policy-table">
    <thead><tr><th>이전받는 자 (연락처)</th><th>이전 국가</th><th>이전 항목</th><th>이용 목적</th><th>보유 기간</th></tr></thead>
    <tbody>
      <tr><td>Cloudflare, Inc.<br>(privacyquestions@cloudflare.com)</td><td>미국 및 Cloudflare 전 세계 데이터센터(이용자와 가까운 곳)</td><td>접속 IP 주소, 접속 기록, 요청 내용</td><td>웹사이트 호스팅·전송, 보안</td><td>처리 즉시 또는 Cloudflare 정책에 따른 로그 보관 기간</td></tr>
      <tr><td>Upstash, Inc.<br>(support@upstash.com)</td><td>일본(도쿄 데이터센터)</td><td>회원 정보, 게시물, 문의 내용, 로그인 세션, 도배 방지용 접속 IP</td><td>데이터베이스 저장</td><td>위 3항의 보유 기간</td></tr>
    </tbody>
  </table>
  <p>국외 이전을 원하지 않으면 회원가입·글쓰기·문의를 하지 않거나 회원 탈퇴를 할 수 있습니다. 다만 이 경우 해당 서비스를 이용할 수 없습니다. 사이트 접속 자체는 Cloudflare를 거치므로 접속 기록의 국외 처리는 거부할 수 없습니다.</p>

  <h2>5. 쿠키와 광고</h2>
  <ul>
    <li>사이트는 로그인 유지와 브라우저 식별을 위해 브라우저 저장소(localStorage)를 사용합니다. 브라우저 설정에서 사이트 데이터를 삭제하면 로그인이 해제됩니다.</li>
    <li>사이트는 Google AdSense 광고를 게재할 수 있습니다. Google을 포함한 제3자 광고 사업자는 쿠키를 사용해 이용자의 이 사이트 및 다른 사이트 방문 기록을 바탕으로 광고를 게재할 수 있습니다.</li>
    <li>Google의 광고 쿠키 사용으로 Google과 파트너는 이 사이트와 인터넷의 다른 사이트 방문 기록을 바탕으로 맞춤 광고를 보여줄 수 있습니다.</li>
    <li>이용자는 <a href="https://adssettings.google.com/" target="_blank" rel="noopener">Google 광고 설정</a>에서 맞춤 광고를 끌 수 있으며, <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener">www.aboutads.info</a>에서 제3자 광고 사업자의 맞춤 광고 쿠키를 거부할 수 있습니다.</li>
    <li>자세한 내용은 <a href="https://policies.google.com/technologies/ads?hl=ko" target="_blank" rel="noopener">Google 광고 정책</a>을 참고하세요.</li>
  </ul>

  <h2>6. 개인정보의 파기</h2>
  <p>보유 기간이 끝나거나 처리 목적을 달성한 개인정보는 데이터베이스에서 복구할 수 없는 방법으로 지체 없이 삭제합니다.</p>

  <h2>7. 이용자의 권리</h2>
  <p>이용자는 언제든지 자신의 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. <a href="contact.html">연락처</a>의 문의 양식으로 요청하면 지체 없이 조치합니다.</p>

  <h2>8. 개인정보의 안전성 확보 조치</h2>
  <ul>
    <li>회원·게시글 비밀번호는 복호화할 수 없는 방식(scrypt 해시)으로 암호화해 저장합니다.</li>
    <li>모든 통신은 HTTPS로 암호화됩니다.</li>
    <li>비밀번호를 연속으로 틀리면 일정 시간 로그인·수정을 막아 무단 접근을 방지합니다.</li>
    <li>데이터베이스 접근 권한은 운영자로 제한하고, 관리 기능은 일정 시간 뒤 만료되는 관리자 인증으로만 사용할 수 있습니다.</li>
  </ul>

  <h2>9. 만 14세 미만 아동</h2>
  <p>사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 만 14세 미만 아동의 회원가입을 받지 않습니다.</p>

  <h2>10. 개인정보 보호책임자와 고충 처리</h2>
  <p>개인정보 보호책임자: 운영자 ${OWNER} (개인 운영)<br>이메일: ${mail}<br>문의 양식: <a href="contact.html">연락처</a></p>
  <p>개인정보 침해에 대한 신고·상담은 아래 기관에도 할 수 있습니다.</p>
  <ul>
    <li>개인정보침해신고센터 (privacy.kisa.or.kr / 국번 없이 118)</li>
    <li>개인정보분쟁조정위원회 (www.kopico.go.kr / 1833-6972)</li>
    <li>대검찰청 사이버수사과 (www.spo.go.kr / 1301), 경찰청 사이버수사국 (ecrm.police.go.kr / 182)</li>
  </ul>

  <h2>11. 처리방침의 변경</h2>
  <p>이 개인정보처리방침은 ${PRIVACY_EFFECTIVE}부터 적용되며, 내용이 바뀌면 시행 7일 전부터 이 페이지에 알립니다. 다만 이용자에게 불리하지 않은 변경이나 실제 처리 방식을 반영하는 변경은 즉시 적용될 수 있습니다.</p>
  <p>변경 이력: 2026년 10월 12일 제정 · 2026년 10월 14일 개정(호스팅을 Cloudflare로 이전, 데이터베이스 위치 명시, 접속 IP 주소 이용과 국외 이전 사항 추가)</p>
`;

const contact = `
  <p class="policy-lead">사이트 이용 문의, 오류 제보, 게시물 신고, 개인정보 열람·삭제 요청, 제휴 문의를 남겨주세요. 운영자가 확인 후 답변이 필요한 경우 남겨주신 이메일로 회신합니다.</p>

  <table class="policy-table contact-info">
    <tr><th>운영 주체</th><td>개인</td></tr>
    <tr><th>운영자</th><td>${OWNER}</td></tr>
    <tr><th>이메일</th><td>${mail}</td></tr>
  </table>
  <p>이메일로 직접 보내셔도 되고, 아래 문의 양식을 이용하셔도 됩니다.</p>

  <div class="contact-form">
    <label>문의 유형
      <select id="cType">
        <option>이용 문의</option>
        <option>오류 제보</option>
        <option>게시물 신고</option>
        <option>개인정보 요청(열람·삭제·탈퇴)</option>
        <option>제휴·광고</option>
        <option>기타</option>
      </select>
    </label>
    <label>이름 또는 닉네임 <span class="opt">(선택)</span>
      <input id="cName" type="text" maxlength="30" />
    </label>
    <label>회신받을 이메일 <span class="opt">(선택, 답변이 필요하면 입력)</span>
      <input id="cEmail" type="email" maxlength="100" placeholder="you@example.com" />
    </label>
    <label>문의 내용
      <textarea id="cMessage" rows="7" maxlength="2000" placeholder="게시물 신고는 종목명과 글 내용(또는 작성자 닉네임)을 함께 적어주세요."></textarea>
    </label>
    <button class="btn-submit" id="cSubmit" type="button">문의 보내기</button>
    <p class="contact-result" id="cResult"></p>
  </div>

  <h2>처리 안내</h2>
  <ul>
    <li>게시판의 부적절한 글은 각 글의 [신고] 버튼으로도 신고할 수 있습니다. 신고 5건이 쌓이면 자동으로 블라인드됩니다.</li>
    <li>개인정보 열람·정정·삭제와 회원 탈퇴 요청은 확인 후 지체 없이 처리합니다.</li>
    <li>문의 내역은 처리 완료 후 1년간 보관 후 삭제합니다. 자세한 내용은 <a href="privacy.html">개인정보처리방침</a>을 확인하세요.</li>
  </ul>
`;

// 문의 보내기 스크립트는 /contact.js (CSP script-src 'self' — 인라인 스크립트 금지)
const contactScript = '<script src="/contact.js"></script>';

const bodies = { 'about.html': about, 'terms.html': terms, 'privacy.html': privacy, 'contact.html': contact };
for (const p of PAGES) fs.writeFileSync(DIR + p.file, page(p, bodies[p.file], p.file === 'contact.html' ? contactScript : ''));
console.log('pages:', PAGES.map(p => p.file).join(', '));
