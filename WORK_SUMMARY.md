# 주식 업종 종목 토론방 — 작업 정리 (2026-10-12)

- **운영 주소**: https://upjong.com (2026-10-13 이전. www.upjong.com · stock-forum.pages.dev · 옛 Vercel 주소는 모두 301/308로 upjong.com 이동)
- **배포**: Cloudflare Pages 프로젝트 `stock-forum` (계정 pyourang@naver.com). 이 폴더에서 `node scripts/cf-build.mjs && npx wrangler pages deploy dist --project-name stock-forum --branch main` (MANUAL.md 5-4)
- **도메인**: upjong.com (Cloudflare Registrar, DNS CNAME @·www → stock-forum.pages.dev)
- **옛 Vercel 프로젝트** `homepage` (팀 jimmy-eadd): `vercel.json`이 전체를 upjong.com으로 리다이렉트 + **Google 뉴스 중계 `/api/gnews`** (Google이 Cloudflare IP를 503으로 막아서). 인증 키 GNEWS_PROXY_KEY는 Vercel 환경변수·Cloudflare 시크릿에 같은 값. Vercel 배포는 `vercel --prod --yes` (.vercelignore로 gnews.js만 올라감). 중계가 죽어도 네이버 기사만으로 동작
- **DB**: Upstash Redis `upjong-db` (2026-10-13 Vercel 마켓플레이스 DB `bio-forum-db`에서 이관, Upstash에 구글 계정으로 직접 가입한 계정, 도쿄 리전). Cloudflare Pages 시크릿 `KV_REST_API_URL` / `KV_REST_API_TOKEN`. 옛 DB는 백업용으로 한 달 정도 보관 후 삭제
- **관리자 비밀번호**: Cloudflare Pages 시크릿 `ADMIN_PASSWORD` (코드·문서에 값 없음)
- **운영자**: 김유랑 · tpsdurang@naver.com

---

## 1. 사이트 구성

| 화면 | 내용 |
|---|---|
| 홈 (`/`) | 상단 제목 "업종별 주식 종목 토론방" + 오늘·누적 조회수, 지수 6개, 업종 탭 10개, 업종 뉴스·게시판 카드 + 종목 카드 |
| 종목 토론 창 | 종목 카드를 누르면 전체 화면으로 열림 — 토론 · 실시간 종목 뉴스 · 종목 정보 · 분석 보고서 · 공시 |
| 종목 페이지 (`/stock/{코드}`) | 검색 노출용 서버 렌더링 페이지 440개 — 시세, 종목 정보, 최근 토론글, 뉴스, 같은 업종 링크 |
| 정책 페이지 | `about.html` 사이트 소개 · `terms.html` 이용약관(운영정책 `#policy`) · `privacy.html` 개인정보처리방침 · `contact.html` 연락처(문의 양식) |
| 검색용 파일 | `robots.txt` · `sitemap.xml`(445개 주소) · `/rss.xml`(최근 토론글 + 종목 페이지 100건) |

### 상단 지수 (6개)
KOSPI · KOSDAQ · USD/KRW · 다우존스 · 나스닥 · S&P 500 (WTI 원유·필라델피아 반도체는 삭제). PC 6열, 모바일 3열.

### 업종 탭 (10개)
관심 종목 · 바이오 · 반도체 · 2차전지·로봇 · 전력·원자력 · K뷰티·컬쳐 · 조선·방산 · 자동차 · 금융 · 미국 주식

- PC: 10개 한 줄, 같은 크기, 양끝을 종목 카드 줄에 맞춤 (1060px 이하는 5개씩 두 줄)
- 모바일: 5개씩 두 줄, 두 단어 탭은 두 줄 표시 (전력/원자력 등)

| 탭 | 종목 수 | 선정 기준 |
|---|---|---|
| 바이오 | 50 | 시총·토론글·거래대금 기준을 넓혀 50개 채움 |
| 반도체 | 50 | 〃 |
| 2차전지·로봇 | 52 | 2차전지·로봇 각각의 기준 합집합 |
| 전력·원자력 | 42 | 〃 |
| K뷰티·컬쳐 | 53 | 〃 (화장품·미용기기·보톡스 + 엔터·여행·카지노·면세점·호텔) |
| 조선·방산 | 46 | 〃 |
| 자동차 | 31 | 기본 기준 |
| 금융 | 33 | 기본 기준 |
| 미국 주식 | 100 | 한국예탁결제원 보관금액 TOP 50 + 관심 TOP 50, 시총순 (ETF 36개 포함) |
| 관심 종목 | 회원별 | 회원이 ☆로 추가한 종목 |

- **기본 기준**: 업종별 시가총액 TOP 20 + 네이버 종목토론방 최근 1년 글 수 TOP 20 + 최근 6개월 거래대금 TOP 10의 합집합(중복 제거), 탭 안은 시총순
- 로봇·K뷰티·K컬쳐는 테마에만 걸친 비본업 종목(대기업·제약사 등)을 제외 (`scripts/build.mjs`의 `EXCLUDE`)
- 미국 51~100위: 예탁원은 TOP 50만 공개하므로, 최근 1년 월말 보관 TOP 50과 최근 1주~3개월 결제금액 TOP 50 목록에 오른 횟수가 많은 순으로 채움

### 종목 카드 (가로 4 : 세로 3)
로고 + 주가·등락률 / 종목명 + 코드·시장 / 시총(ETF는 규모) · 댓글 수, 오른쪽 위 ☆ 관심 종목. 세 묶음을 카드 높이에 고르게 배치.
(LIVE 표시, 🔥 토론 TOP 표시, 순위 줄은 삭제)

### 업종 카드 (각 탭 맨 앞 2칸)
- **업종 실시간 뉴스 보기**: 업종 시총 상위 12종목의 네이버 종목 뉴스 + Google 뉴스 업종 키워드 검색(최근 1일), 1분마다 갱신
- **업종 게시판 보기**: 업종 전체 토론 (가상 코드 `SECBIO`, `SECUSA` 등으로 종목 게시판과 같은 DB 사용)

### 화면
- 다크(기본) / 화이트 전환: 헤더 "홈" 옆 🌙 다크 / ☀️ 화이트 버튼, 브라우저에 기억 (`theme.js`)
- 모바일 헤더: 1줄 로고·홈·다크 버튼, 2줄 검색·팔로잉·로그인·회원가입
- 토론 창·작성자 창은 휴대폰 뒤로가기(브라우저 뒤로가기)로 닫힘
- 주가는 화면에 보이는 종목만 10초마다, 지수도 10초마다 갱신

---

## 2. 회원 · 게시판

### 회원
- 회원가입: 아이디(영문 또는 영문+숫자 4~20자, 대소문자 무시 중복 불가) · 닉네임(한글 2~10자, 중복 불가) · 비밀번호(6~30자, scrypt 해시 저장)
- 로그인 30일 유지, 비밀번호 10분 내 5회 실패 시 잠금
- 회원정보: 아이디·닉네임·가입일·작성글·팔로워·팔로잉·관심 종목 수, 비밀번호 변경(다른 기기 로그아웃), 회원 탈퇴
- 탈퇴 시 계정·관심 종목·팔로우 삭제, 작성 글은 남고 닉네임은 사칭 방지를 위해 예약
- "운영자·관리자" 포함 닉네임, 금칙어 닉네임 가입 불가

### 글쓰기
- 회원: 닉네임·비밀번호 없이 작성, 본인 글은 로그인 정보로 수정·삭제 ("회원" 표시)
- 비회원: 닉네임(한글) + 비밀번호로 작성·수정·삭제, 회원 닉네임은 사용 불가
- 매수·매도·중립 의견, 최대 1000자(500자 넘으면 "더 보기"), 같은 브라우저 5초에 1건

### 팔로우 · 관심 종목 (회원 전용)
- 회원 글에만 [팔로우], 팔로잉 피드는 팔로우한 회원 글 모음
- 관심 종목은 종목 카드 ☆ → ★, 회원 계정에 저장

### 게시판 관리 (애드센스 대비)
- **금칙어 필터**: 욕설·광고·외부 유도(리딩방, 오픈채팅, 텔레그램, 수익보장 등) 글·닉네임 차단. 기호를 넣은 회피는 막고, "하락 시 발생"·"시발점" 같은 정상 문장은 통과
- **신고**: 모든 글에 [신고] (사유 5가지), 서로 다른 이용자 5건 누적 시 자동 블라인드
- **관리자 모드**: 하단 [관리자] → 비밀번호 → 모든 글 [관리자 삭제], 🚨 신고된 글(원문·사유·삭제·신고 초기화), ✉️ 문의 내역

### 조회수
- 사이트: 홈·종목 페이지 방문, 같은 브라우저 30분에 1회 → 홈 상단 "오늘 N · 누적 N"
- 토론글: 토론 창을 열면 보이는 글 +1, 같은 브라우저·게시판 1시간에 1회 → 글 머리줄 👁 N

---

## 3. 검색 노출 (네이버 · 구글)

- 사이트 등록·소유 확인 완료 (`naver-site-verification`, `google-site-verification` 메타)
- 제목: "주식 업종 종목 토론방 - 업종별 주식 종목 토론방 · 종목토론방", 설명·키워드·H1에 "주식 종목 토론방"
- 종목 페이지 440개(`/stock/{코드}`)를 서버에서 글자로 렌더링 → "○○ 종목 토론방" 검색 대응
- 홈 하단 "전체 주식 종목 토론방 보기"(접힘)에 종목 페이지 링크 전체
- `sitemap.xml` 445개 주소, `/rss.xml` RSS

**운영자가 할 일**
- 구글 Search Console: `sitemap.xml` 재제출, 주요 페이지 URL 검사 → 색인 생성 요청
- 네이버 서치어드바이저: 요청 → 사이트맵 제출(`sitemap.xml`), RSS 제출(`https://upjong.com/rss.xml`), 웹 페이지 수집(홈·주요 종목 페이지)
- 신뢰도 높이기: 네이버 블로그·카페 등에서의 링크, 꾸준한 글 활동
- 애드센스 신청 후 광고 코드·`ads.txt` 반영

---

## 4. 파일 구조

```
index.html        홈 (업종 탭·카드·토론 창·로그인/회원가입 창)
app.js            화면 동작 전체 (탭, 카드, 토론, 회원, 관심 종목, 팔로우, 신고, 관리자, 조회수, 뒤로가기)
stocks.js         종목·업종 데이터 (scripts/build.mjs 로 생성)
styles.css        스타일 (다크 기본 + 화이트 모드 변수)
theme.js          다크/화이트 전환
about.html · terms.html · privacy.html · contact.html   필수 페이지 (scripts/pages.mjs 로 생성)
robots.txt · sitemap.xml                                검색 로봇용 (sitemap은 scripts/seo.mjs 로 생성)
vercel.json       /stock/{코드} → api/page, /rss.xml → api/rss
api/
  posts.js        게시글·좋아요·신고·회원·세션·팔로우·관심 종목·조회수·문의·관리자
  stock.js        실시간 시세 (국내 + 미국, 네이버 polling)
  market.js       상단 지수 6개
  detail.js       종목 뉴스·정보·보고서·공시 (국내 네이버/WISEfn, 미국 네이버 해외주식)
  news.js         업종 뉴스 (네이버 종목 뉴스 + Google 뉴스 RSS)
  page.js         종목 페이지 서버 렌더링
  rss.js          RSS
  _redis.js       Upstash Redis 클라이언트
  _stocks.js      종목 페이지·RSS용 데이터 (scripts/seo.mjs 로 생성)
scripts/          데이터 생성 스크립트 (아래)
scripts/data/     스크립트 입력·중간 데이터 (members, stats, us, seibro 등)
```

### Redis 주요 키
`post:{id}`, `posts:{코드}`, `author:{닉네임}`, `likes:{id}`, `pw:{id}`, `postcount`, `postviews`,
`user:{아이디}`, `nickowner:{닉네임}`, `sess:{token}`, `usess:{아이디}`, `fav:{아이디}`,
`mfollowing:{아이디}`, `mfollowers:{닉네임}`, `reports:{id}`, `reported`, `contacts`, `views:total`, `views:{YYYYMMDD}`

---

## 5. 종목 데이터 갱신 방법 (`scripts/`)

```bash
cd scripts
node members.mjs                 # 업종·테마 구성 종목 수집 → data/members.json
node stats.mjs                   # 토론글 1년 글 수·6개월 거래대금 → data/stats.json (시간 오래 걸림, 중간 저장)
node us.mjs 20261008             # 예탁원 미국주식 보관금액 TOP 50 → data/us.json (기준일: 2영업일 전까지)
#   (data/seibro-more.json: 예탁원 결제금액·과거 월말 순위 — 세션이 필요해 브라우저에서 수집)
node us_extra.mjs                # 51~100위 후보 → data/us_extra.json
node us_merge.mjs                # 미국 100종목 → data/us100.json
node build.mjs 2026-10-12        # stocks.js 생성 + seo.mjs 자동 실행 (api/_stocks.js, sitemap.xml, 홈 종목 링크)
node pages.mjs                   # 사이트 소개·약관·개인정보처리방침·연락처 페이지
cd .. && vercel --prod --yes     # 배포
```

- 데이터 출처: 네이버 증권(`m.stock.naver.com/api/...`, `polling.finance.naver.com`, `api.stock.naver.com`), WISEfn, 한국예탁결제원 SEIBro, Google 뉴스 RSS
- Google 뉴스 RSS는 약관상 개인·비상업 용도 전제임을 알고 사용 중
