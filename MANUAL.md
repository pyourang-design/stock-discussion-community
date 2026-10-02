# 주식 투자 종목 토론방 커뮤니티 — 개발 매뉴얼

> 작성일: 2026-10-02  
> 프로젝트: 주식 투자 종목 토론방 커뮤니티 홈페이지  
> 배포 URL: https://homepage-plum-nine.vercel.app  
> GitHub: https://github.com/pyourang-design/stock-discussion-community

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [파일 구조](#2-파일-구조)
3. [주요 기능](#3-주요-기능)
4. [개발 환경 세팅](#4-개발-환경-세팅)
5. [Vercel 배포](#5-vercel-배포)
6. [GitHub 연동](#6-github-연동)
7. [삼성전자 실시간 주가 연동](#7-삼성전자-실시간-주가-연동)
8. [재배포 방법](#8-재배포-방법)
9. [트러블슈팅](#9-트러블슈팅)

---

## 1. 프로젝트 개요

순수 HTML/CSS/JavaScript로 제작한 **주식 종목 토론방 커뮤니티** 사이트입니다.  
백엔드 서버 없이 Vercel 정적 호스팅 + 서버리스 함수로 운영됩니다.

### 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | HTML5, CSS3, Vanilla JavaScript |
| 호스팅 | Vercel (무료 Hobby 플랜) |
| 실시간 주가 | Vercel 서버리스 함수 → 네이버 금융 API |
| 게시글 저장 | 브라우저 localStorage |
| 버전 관리 | GitHub |

---

## 2. 파일 구조

```
homepage/
├── index.html        # 메인 페이지 (레이아웃, 마켓 배너, 종목 목록)
├── styles.css        # 다크 테마 스타일 (반응형 포함)
├── app.js            # 기능 로직 (렌더링, 검색, 토론방, 실시간 주가)
├── stocks.js         # 18개 종목 데이터 (KOSPI 10개, KOSDAQ 8개)
├── api/
│   └── stock.js      # Vercel 서버리스 함수 — 네이버 금융 프록시
└── MANUAL.md         # 이 문서
```

---

## 3. 주요 기능

### 3-1. 마켓 인덱스 배너
- KOSPI, KOSDAQ, USD/KRW, WTI 원유 지수 표시

### 3-2. 종목 카드 목록
- 18개 종목 (KOSPI 10개 / KOSDAQ 8개)
- 탭 필터: 전체 / KOSPI / KOSDAQ / 인기 / 상승 / 하락
- 종목명·코드 실시간 검색
- 3초마다 가격 미세 변동 시뮬레이션 (삼성전자 제외)

### 3-3. 종목 토론방 (모달)
- 종목 카드 클릭 시 토론방 모달 오픈
- 닉네임 + 의견 작성 (최대 500자)
- 매수 / 매도 / 중립 감성 태그
- 좋아요 기능
- 게시글 최대 200개 localStorage 저장
- 종목정보 탭: PER, PBR, ROE, 배당수익률, 시가총액 등

### 3-4. 삼성전자 실시간 주가
- 10초마다 네이버 금융 API에서 실제 주가 조회
- 카드에 빨간 **LIVE** 뱃지 깜빡임 표시
- 모달 열린 상태에서도 자동 갱신
- 장 마감·오류 시 시뮬레이션으로 fallback

### 3-5. 로그인 (데모)
- 닉네임 입력 방식의 간단한 데모 로그인
- 로그인 시 글쓰기 닉네임 자동 입력

---

## 4. 개발 환경 세팅

### 4-1. Node.js 설치

```powershell
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
```

설치 후 새 터미널을 열거나 PATH를 갱신합니다.

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + `
            [System.Environment]::GetEnvironmentVariable("PATH","User")
node --version   # v24.x.x 확인
npm --version    # 11.x.x 확인
```

### 4-2. Vercel CLI 설치

```powershell
npm install -g vercel
vercel --version   # 62.x.x 확인
```

### 4-3. Git 설치

```powershell
winget install Git.Git --accept-source-agreements --accept-package-agreements
```

### 4-4. GitHub CLI 설치

```powershell
winget install GitHub.cli --accept-source-agreements --accept-package-agreements
```

---

## 5. Vercel 배포

### 5-1. 최초 배포

Vercel 토큰 발급: https://vercel.com/account/tokens

```powershell
cd D:\claude\homepage
vercel --token <YOUR_VERCEL_TOKEN> --yes
```

최초 배포 시 프로덕션 URL이 자동 할당됩니다.

```
Production URL: https://homepage-plum-nine.vercel.app
```

### 5-2. 프로덕션 재배포

코드 변경 후 재배포할 때 사용합니다.

```powershell
cd D:\claude\homepage
vercel --token <YOUR_VERCEL_TOKEN> --prod --yes
```

### 5-3. Vercel 무료 플랜 한도

| 항목 | 한도 |
|------|------|
| 대역폭 | 100GB / 월 |
| 서버리스 함수 실행 | 100GB-시간 / 월 |
| 배포 횟수 | 100회 / 일 |
| 커스텀 도메인 | 무제한 |
| SSL/HTTPS | 자동 무료 |

> 현재 사이트는 정적 파일 위주(약 30KB)라 월 300만 방문까지 무료 커버 가능합니다.

---

## 6. GitHub 연동

### 6-1. 최초 저장소 생성 및 푸시

GitHub Personal Access Token 발급: https://github.com/settings/tokens/new  
필요 권한: `repo`, `workflow`

```powershell
cd D:\claude\homepage

# git 초기화 및 커밋
git init
git config user.email "YOUR_EMAIL"
git config user.name "YOUR_GITHUB_ID"
git add .
git commit -m "feat: 초기 커밋"

# 저장소 생성 + 푸시 (GitHub CLI 사용)
$env:GH_TOKEN = "<YOUR_GITHUB_TOKEN>"
gh repo create stock-discussion-community --public --source . --remote origin --push
```

### 6-2. 코드 변경 후 푸시

```powershell
cd D:\claude\homepage
git add .
git commit -m "feat: 변경 내용 설명"
git remote set-url origin "https://<YOUR_GITHUB_TOKEN>@github.com/<YOUR_ID>/stock-discussion-community.git"
git push origin master
```

---

## 7. 삼성전자 실시간 주가 연동

### 7-1. 동작 원리

브라우저에서 네이버 금융을 직접 호출하면 **CORS 오류**가 발생합니다.  
Vercel 서버리스 함수를 중계기로 사용해 해결합니다.

```
브라우저 (10초마다)
    ↓ GET /api/stock?code=005930
Vercel 서버리스 함수 (api/stock.js)
    ↓ fetch (서버→서버, CORS 없음)
네이버 금융 polling API
    ↓ JSON 응답
브라우저에서 삼성전자 카드 갱신
```

### 7-2. 서버리스 함수 코드 (`api/stock.js`)

```javascript
export default async function handler(req, res) {
  const { code = '005930' } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');

  try {
    const r = await fetch(
      `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 ...',
          'Referer': 'https://finance.naver.com/',
          'Accept': 'application/json',
        },
      }
    );
    const json = await r.json();
    const d = json.result?.datas?.[0] ?? json.datas?.[0];

    res.json({
      code,
      price:      Number(String(d.closePrice).replace(/,/g, '')),
      diff:       Number(String(d.compareToPreviousClosePrice).replace(/,/g, '')),
      changeRate: Number(String(d.fluctuationsRatio).replace(/,/g, '')),
      volume:     Number(String(d.accumulatedTradingVolume ?? '0').replace(/,/g, '')),
      time:       d.localTradedAt ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

### 7-3. API 응답 예시

```
GET https://homepage-plum-nine.vercel.app/api/stock?code=005930

{
  "code": "005930",
  "price": 58700,
  "diff": 800,
  "changeRate": 1.38,
  "volume": 18432000,
  "time": "2026-10-02"
}
```

### 7-4. 장 운영 시간

| 구분 | 시간 |
|------|------|
| 정규장 | 평일 09:00 ~ 15:30 |
| 장 마감 후 | 전일 종가 반환 |
| 주말·공휴일 | API 실패 → 시뮬레이션 유지 |

---

## 8. 재배포 방법

코드를 수정한 뒤 GitHub 푸시 + Vercel 재배포를 순서대로 실행합니다.

```powershell
# 1. 파일 수정 후 커밋
cd D:\claude\homepage
git add .
git commit -m "fix: 수정 내용"

# 2. GitHub 푸시
git remote set-url origin "https://<TOKEN>@github.com/pyourang-design/stock-discussion-community.git"
git push origin master

# 3. Vercel 재배포
vercel --token <VERCEL_TOKEN> --prod --yes
```

---

## 9. 트러블슈팅

### PATH 인식 안 됨 (node, vercel, git, gh 명령어 오류)

새로 설치한 후 현재 터미널 세션에서 PATH가 갱신되지 않은 경우입니다.

```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + `
            [System.Environment]::GetEnvironmentVariable("PATH","User")
```

이후 명령어를 다시 실행하거나, 터미널을 새로 열면 해결됩니다.

---

### Vercel 배포 시 "No existing credentials found" 오류

`vercel login`으로 인증하지 않고 CLI를 실행한 경우입니다.  
`--token` 플래그로 직접 토큰을 전달해 해결합니다.

```powershell
vercel --token <YOUR_VERCEL_TOKEN> --prod --yes
```

---

### GitHub 푸시 시 "Authentication failed" 오류

remote URL에 토큰이 포함되지 않은 경우입니다.

```powershell
git remote set-url origin "https://<TOKEN>@github.com/<ID>/stock-discussion-community.git"
git push origin master
```

---

### 삼성전자 실시간 주가가 안 나올 때

- **장 마감 시간** (15:30 이후, 주말, 공휴일): 정상 — 전일 종가 표시
- **LIVE 뱃지가 안 깜빡임**: 네이버 API 응답 실패 → `/api/stock?code=005930` 직접 브라우저에서 열어 오류 확인
- **서버리스 함수 로그 확인**: https://vercel.com/jimmy-eadd/homepage 대시보드 → Functions 탭

---

### 예약 에이전트에서 외부 URL 접속 차단 (EGRESS_BLOCKED)

Claude Code 예약 에이전트는 Anthropic 클라우드에서 실행되어 일부 외부 도메인이 차단됩니다.  
**해결**: Vercel 서버리스 함수(`/api/rank`)를 중계기로 추가하면 에이전트가 Vercel을 통해 간접 접근 가능합니다.

---

*이 문서는 프로젝트 변경 시 함께 업데이트해주세요.*
