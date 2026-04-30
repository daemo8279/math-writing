# 수학 문장제 읽기 훈련 앱 — 배포 가이드

## 파일 구조

```
/
├── index.html        ← 메인 앱 (프론트엔드)
├── api/
│   └── analyze.js    ← AI 분석 API (서버리스 함수)
├── vercel.json       ← Vercel 설정
├── package.json
└── .env.example      ← 환경변수 템플릿
```

---

## Vercel 배포 (권장)

### 1단계 — GitHub에 올리기

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/본인계정/math-reading-app.git
git push -u origin main
```

### 2단계 — Vercel 연결

1. [vercel.com](https://vercel.com) 로그인
2. **Add New Project** → GitHub 저장소 선택
3. **Framework Preset**: Other 선택
4. **Deploy** 클릭

### 3단계 — API 키 설정 ⚠️ 중요

Vercel 대시보드 → 해당 프로젝트 → **Settings** → **Environment Variables**

| 이름 | 값 |
|------|-----|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |

설정 후 **Redeploy** (Settings → Deployments → Redeploy) 필수!

---

## 로컬 테스트

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 환경변수 파일 생성
cp .env.example .env.local
# .env.local 에 실제 API 키 입력

# 로컬 서버 실행
vercel dev
# → http://localhost:3000
```

---

## 주요 기능

- 1~6학년 수학 문장제 30문제
- 5단계 풀이 과정 (읽기 → 핵심 찾기 → 연산 → 식 완성 → 피드백)
- 빈칸 위치 다양화 (앞·중간·끝)
- 4단계 직접 쓰기 입력
- 5단계 계산 연습장 (자유 필기 캔버스)
- ✨ **AI 풀이 분석**: 손글씨 풀이를 Claude Vision이 인식, 오류 단계 피드백

---

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Console에서 발급 |
