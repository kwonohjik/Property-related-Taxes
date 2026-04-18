# 홈 화면 "법령 리서치" 메뉴 추가 — korean-law-mcp 기능 통합 플랜

## Context

KoreanTaxCalc 사용자가 세금 계산 중 관련 법령·판례를 바로 찾아볼 수 있도록, `chrisryugj/korean-law-mcp`가 제공하는 15개 도구(법령 검색·조문·판례·체인 리서치)의 기능을 웹 UI로 이식한다.

- **선택된 범위**: 풀 MCP — 기본 3개 도구 + 판례 2개 + 체인 워크플로 8개
- **선택된 연결 방식**: 법제처 Open API 직접 호출 (korean-law-mcp npm 의존 없음)
- **재사용 자산**:
  - `lib/legal-verification/korean-law-client.ts` — 법령 검색·조문 조회·7일 파일 캐시가 이미 구현됨 (확장 기반)
  - `lib/legal-verification/citation-parser.ts` — 조문 번호 파서
  - `lib/law/law-meta.ts`, `lib/law/citation-link.ts` — 메타·링크 유틸
  - `KOREAN_LAW_OC` 환경변수 이미 도입
  - `lib/api/rate-limit.ts` — IP당 분당 30회 제한
- **비목표**: LLM 연동(체인은 서버 사이드 다단계 API 오케스트레이션으로 구현, 요약은 raw 결과 구조화 반환까지만). 추후 필요 시 별도 확장.

## 전체 아키텍처

```
[홈 /page.tsx]
  └─ "법령 리서치" 카드 (신규 섹션)
       ↓
[/law/page.tsx]  탭 UI 4개: 법령 / 판례 / 별표 / 리서치 체인
       ↓
[/api/law/*]  6개 Route Handler (2-Layer: orchestrator + pure client)
       ↓
[lib/korean-law/*]  API 클라이언트·체인 오케스트레이터 (신규 모듈)
       ↓
[법제처 Open API]  www.law.go.kr/DRF/*
```

## 구현 작업 (단계별)

### Step 1. 라이브러리 계층 확장 `lib/korean-law/`

**새 디렉토리 신설** (기존 `lib/legal-verification/` 은 검증 전용으로 유지, 범용 클라이언트는 승격).

| 파일 | 역할 | 비고 |
|---|---|---|
| `lib/korean-law/client.ts` | `lib/legal-verification/korean-law-client.ts`를 이관·확장. `searchLaw`, `getLawText`, `getAnnexes`, `searchDecisions`(17 도메인 enum), `getDecisionText` 제공 | 기존 코드 보존을 위해 이관 대신 **re-export + 신규 함수 추가** 방식 권장 |
| `lib/korean-law/aliases.ts` | 법령 별칭 사전(화관법→화학물질관리법 등) | MCP v3.3.1 52개 초기화, 세법 중심 우선 (소득세법·상증법·지방세법·종부세법) |
| `lib/korean-law/article-parser.ts` | `citation-parser.ts` 재export + 한글수사 숫자 변환 | v3.5.3 방식 |
| `lib/korean-law/compact.ts` | 판례 응답 축약 (판시사항 유지·이유 절사) | v3.4.0 아이디어 차용. 토큰이 아닌 UI 표시 용량 최적화 |
| `lib/korean-law/chains.ts` | 8개 체인 오케스트레이터 | 아래 표 참조 |
| `lib/korean-law/types.ts` | Zod 스키마 + TS 타입 | API Route에서 재사용 |

**체인 8종 (LLM 없이 다단계 API 호출로 재구현)**:

| Chain | 조합 |
|---|---|
| `full_research` | searchLaw → getLawText + searchDecisions 병렬 |
| `law_system` | searchLaw → 상·하위 3단계 위임구조 트리 |
| `action_basis` | 키워드→searchLaw + searchDecisions + 행정규칙 |
| `dispute_prep` | searchLaw + searchDecisions(헌재·조세심판) + 행정심판 |
| `amendment_track` | 법령 개정 이력 + 관련 판례 타임라인 |
| `ordinance_compare` | 자치법규 다중 비교 |
| `procedure_detail` | 행정절차 + 관련 서식(`getAnnexes`) |
| `document_review` | 사용자 텍스트 → citation-parser → searchLaw로 실존 검증 (verify_citations 경량판) |

### Step 2. 백엔드 API 계층 `app/api/law/`

| 경로 | Method | 설명 |
|---|---|---|
| `/api/law/search-law` | GET | `?q=소득세법` — 법령 검색 |
| `/api/law/law-text` | GET | `?lawName=소득세법&articleNo=89` — 조문 본문 |
| `/api/law/annexes` | GET | `?lawName=...` — 별표·서식 목록 (`kordoc`은 브라우저 불가 → Node 측 처리) |
| `/api/law/search-decisions` | GET | `?q=양도소득세&domain=precedent\|constitutional\|tax_tribunal\|...` |
| `/api/law/decision-text` | GET | `?id=...&domain=...` |
| `/api/law/chain` | POST | `{ type: "full_research" \| ..., params: {...} }` — 체인 실행 |

**공통 패턴** (기존 `/api/calc/*` 동일):
- Rate limit: `lib/api/rate-limit.ts` (IP당 분당 30회)
- Zod 입력 검증 (`lib/korean-law/types.ts`의 스키마 재사용)
- `KOREAN_LAW_OC` 미설정 시 503 + 친절한 에러 메시지 (기존 `/api/admin/verify-legal` 패턴)
- 결과 캐시: 기존 `.legal-cache/` 파일 캐시 + 검색은 1시간 TTL / 조문은 24시간 TTL
- Error envelope: `{ error: string, code?: string }`

### Step 3. 프론트엔드 페이지 `app/law/`

```
app/law/
├── layout.tsx         # /calc/layout.tsx 동일 구조 (DisclaimerBanner 포함)
├── page.tsx           # 탭 컨테이너
└── _components/
    ├── LawSearchTab.tsx        # 법령 검색 + 조문 열람
    ├── DecisionSearchTab.tsx   # 판례 검색 (domain 드롭다운)
    ├── AnnexTab.tsx            # 별표·서식
    └── ChainResearchTab.tsx    # 체인 워크플로 UI
```

**UI 설계 원칙**:
- shadcn/ui `Tabs` (없으면 `npx shadcn@latest add tabs`)
- 입력: 기존 `SelectOnFocusProvider` 자동 적용 (추가 `onFocus` 불필요)
- 검색 결과 카드: `/app/history` 리스트 스타일 재사용 (라운드 보더 + hover)
- 조문 본문 표시: `Accordion`으로 조문별 접기/펼치기, "이 조문으로 세금 계산하기" CTA로 `/calc/*` 딥링크
- 체인 결과: 단계별 소스 섹션(법령/판례/별표) 분리 표시, 원문 링크 뱃지

### Step 4. 홈 화면 메뉴 추가 `app/page.tsx`

기존 `TAX_TYPES` 배열 아래에 **별도 섹션** 추가 (세금 계산 vs 법령 리서치 구분):

```tsx
const RESEARCH_TOOLS = [
  {
    slug: "law",
    title: "법령 리서치",
    description: "부동산 세법 조문·판례·별표를 통합 검색",
    icon: "📚",
    href: "/law",
  },
] as const;
```

- 기존 6개 카드 그리드 아래 `<h2 className="mt-16 ...">법령 리서치</h2>` 섹션 + 1개 카드
- 향후 "세법 가이드", "세액 시뮬레이터" 등 추가 시 같은 배열에 push 하도록 구조화
- 카드 스타일·hover 동작은 기존 TAX_TYPES와 동일 컴포넌트 패턴 유지

### Step 5. 환경·문서 업데이트

| 항목 | 작업 |
|---|---|
| `.env.local` | `KOREAN_LAW_OC=` 가이드 (이미 LegalVerifyPanel 용도로 존재 — 재사용) |
| `CLAUDE.md` | Architecture 섹션에 `lib/korean-law/` 추가, "법령 리서치" 기능 언급 |
| `middleware.ts` | `/api/law/*`는 **비로그인 허용** (`/api/calc/*`와 동일 정책) |

## 수정/신설 파일 목록

**신설** (13):
- `lib/korean-law/{client.ts, aliases.ts, article-parser.ts, compact.ts, chains.ts, types.ts}` (6)
- `app/api/law/{search-law, law-text, annexes, search-decisions, decision-text, chain}/route.ts` (6)
- `app/law/{layout.tsx, page.tsx}` + `app/law/_components/{LawSearchTab, DecisionSearchTab, AnnexTab, ChainResearchTab}.tsx` (6)

**수정** (3):
- `app/page.tsx` — RESEARCH_TOOLS 섹션 추가
- `middleware.ts` — `/api/law/*` 공개 라우트 목록에 추가 (존재 시)
- `CLAUDE.md` — 아키텍처·디렉토리 섹션 갱신

**재사용** (수정 없음):
- `lib/legal-verification/korean-law-client.ts` (client.ts에서 re-export)
- `lib/legal-verification/citation-parser.ts`
- `lib/law/{law-meta.ts, citation-link.ts}`, `lib/utils/law-url.ts`
- `lib/api/rate-limit.ts`
- `components/providers/SelectOnFocusProvider.tsx`

## 위험·대응

| 위험 | 대응 |
|---|---|
| 법제처 API 호출 한도(일일 쿼터) 초과 | 기존 7일 파일 캐시 + 검색 1h / 조문 24h TTL로 완화 |
| `KOREAN_LAW_OC` 미설정 배포 환경에서 UI 깨짐 | 페이지 서버 컴포넌트에서 키 존재 확인 → 미설정 시 "관리자 설정 필요" 안내 카드 표시 |
| 별표/첨부 파서(`kordoc`) 의존성 추가 고민 | **Step 1 MVP에서는 첨부 파일명·링크만 노출** (`kordoc` 미도입), 본문 추출은 Phase 2로 유보 |
| 체인이 여러 API 병렬 호출해 응답 지연 | `Promise.all` + Next.js `maxDuration = 30`, 단계별 스트리밍은 Phase 2 |
| 판례 17 도메인 URL 차이 | `types.ts`에서 도메인별 엔드포인트 매핑 상수화 |

## 검증 방법 (end-to-end)

1. **환경**: `.env.local`에 `KOREAN_LAW_OC=<발급받은 ID>` 설정
2. **타입체크·린트**: `npm run lint`
3. **단위 테스트** (신규): `__tests__/korean-law/client.test.ts`
   - `searchLaw("소득세법")` → 정확히 매칭
   - 별칭: `searchLaw("화관법")` → "화학물질관리법" 자동 치환
   - `getLawText("소득세법", "89")` → "양도소득세의 비과세" 포함
   - API 키 미설정 시 503
4. **브라우저 E2E** (수동):
   - `npm run dev` → http://localhost:3000
   - 홈에 "법령 리서치" 카드 노출 확인
   - 카드 클릭 → `/law` 진입, 4개 탭 렌더
   - `법령` 탭에서 "소득세법 제89조" 검색 → 조문 본문 + "계산하기" CTA 클릭 → `/calc/transfer-tax` 이동
   - `판례` 탭에서 `양도소득세` 검색 → 도메인별 결과 카운트 확인
   - `체인` 탭에서 `full_research("양도소득세")` 실행 → 법령 + 판례 섹션 모두 채워짐
   - 동일 쿼리 재실행 시 캐시 히트(네트워크 탭에 재호출 없음) 확인
5. **회귀**: 기존 `/api/calc/*`, `/api/admin/verify-legal`, `/history` 정상 동작 — 특히 `LegalVerifyPanel` 깨지지 않는지 확인 (client.ts re-export 체계)

## 단계적 릴리스 권장

- **MVP (Phase 1)**: Step 1 client.ts 확장 + 법령/판례/체인 중 `full_research` 1개 + 홈 메뉴 + `/law` 페이지 법령 탭
- **Phase 2**: 나머지 체인 7종 + 별표·서식 + 판례 도메인 17종 전체
- **Phase 3**: LLM 요약(Claude API) 연계 — 체인 결과를 사용자 질문에 맞춘 자연어 답변으로 재구성
