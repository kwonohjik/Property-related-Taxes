# law-article-popup Planning Document

> **Summary**: 법령 리서치(`/law`) 통합 검색창에 "소득세법 77조"처럼 **"제" 없는 조문 표기**를 입력해도 조문 직접 조회로 라우팅하고, 조회 결과를 탭 하단 인라인이 아닌 **팝업(ArticleModal)** 으로 표시하는 기능
>
> **Project**: korean-tax-calc
> **Version**: 0.1.0
> **Author**: kwonohjik
> **Date**: 2026-06-12
> **Status**: Draft
> **선행 문서**: `docs/01-plan/features/law-research-v2.plan.md` (Query Router·ArticleModal 도입 이력)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | ① "소득세법 77조"(제 생략) 입력 시 `specific_article` 패턴이 "제"를 필수로 요구해 `fallback_search_law`로 빠지고, 조문 대신 법령 목록(소득세법·시행령·시행규칙)만 표시됨. ② "소득세법 제77조"처럼 매칭에 성공해도 조문이 팝업이 아니라 법령·조문 탭 **하단 인라인**에 렌더되어 스크롤해야 보임 |
| **Solution** | ① 라우터에 "제" 생략 허용 패턴 추가(법령명 접미사 가드로 오탐 차단). ② `tool === "get_law_text"` 라우팅 시 기존 `ArticleModal`(팝업)을 `LawResearchClient` 레벨에서 오픈 |
| **Function/UX Effect** | 통합 검색창에 "소득세법 77조" 입력 + 검색 클릭 → 법제처에서 제77조 본문을 읽어와 즉시 팝업으로 표시. 닫으면 법령·조문 탭에 법령명·조문번호가 채워져 있어 후속 탐색 가능 |
| **Core Value** | 가장 빈번한 리서치 동작(특정 조문 1건 확인)을 입력 1회 + 클릭 1회로 단축 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 스크린샷 실증: "소득세법 77조" 검색 → `[⚠] fallback_search_law · 특정 패턴 미매칭 → 일반 법령 검색으로 폴백` 배너 + 법령 목록만 표시. 사용자 기대는 제77조 본문 팝업 |
| **WHO** | 세금 계산 중 특정 조문을 빠르게 확인하려는 사용자 (법조문 표기 관습상 "제"를 생략하는 경우가 많음) |
| **RISK** | "제" 생략 패턴의 오탐(예: "예산 100조" 같은 비법령 문구) → 법령명 접미사 가드 필수. 기존 "제N조" 경로의 표시 방식이 인라인→팝업으로 바뀌는 동작 변경 포함 |
| **SUCCESS** | "소득세법 77조" / "소득세법 제77조" / "상증법 22조" / "소득세법 77조의2" 모두 → confidence high 라우팅 + 팝업에 조문 본문 표시. 기존 라우터 단위 테스트 전부 통과 |
| **SCOPE** | 라우터 패턴 1종 추가 + 팝업 연결 + 인라인 자동조회 억제. 단일 PR 규모. 엔진(`lib/tax-engine/`) 무관 — 14 동기화 지점 비대상 |

---

## 1. 현행 동작 (코드 실측 — 전 인용 검증 완료)

### 1.1 통합 검색 → 라우팅 흐름

```
UnifiedSearchBar (app/law/_components/UnifiedSearchBar.tsx:46-50)
  └ POST /api/law/route-router { query }
      └ routeQuery() (lib/korean-law/router/query-router.ts:228-256)
          └ normalizeLawSearchText() 정규화 후 12개 패턴 priority 순 평가
  └ onRoute(RouteResult) → LawResearchClient.handleRoute (LawResearchClient.tsx:18-22)
      └ setActiveTab(targetTab) + routeNonce 증가
  └ LawSearchTab autoSearch useEffect (LawSearchTab.tsx:54-64)
      └ initialArticleNo 있으면 openArticleWith() → GET /api/law/law-text
      └ 결과를 탭 하단 인라인 <article>로 렌더 (LawSearchTab.tsx:232-246)  ← 팝업 아님
```

### 1.2 "소득세법 77조"가 폴백으로 빠지는 정확한 원인

`specific_article` 패턴 (query-router.ts:44):

```typescript
patterns: [/^(.+?)\s*제\s*(\d+)\s*조(?:의(\d+))?/],
```

- `제`가 정규식에 **필수 리터럴**로 포함 → "소득세법 77조" 미매칭.
- `law_name_only` 패턴(query-router.ts:210, `/^[가-힣·\s]{1,28}(?:법|…|규정)$/`)도 끝이 "77조"라 미매칭.
- 12패턴 전부 실패 → `makeFallback()` (query-router.ts:258-271) → `search_law` + confidence low. 스크린샷의 노란 배너와 일치.
- 참고: `normalizeLawSearchText`(lib/korean-law/search-normalizer.ts:52-69)는 `§` → `" 제"` 치환은 하지만 "77조" → "제77조" 보정은 없음.

### 1.3 팝업 컴포넌트는 이미 존재 — 재사용 대상

`ArticleModal` (app/law/_components/ArticleModal.tsx:14-122):

- Props: `{ lawName: string; articleNo: string; onClose: () => void }` — 완전 독립, 자체적으로 `GET /api/law/law-text` 호출(:33).
- `role="dialog"` + `aria-modal` + ESC 닫기 + 배경 클릭 닫기(:50-64) 기 구현.
- 조문 미존재 시 안내 메시지(:114-118), API 실패 시 에러 + 원문 링크 폴백(:91-96) 기 구현.
- 현재 사용처: `RefLawChip.tsx`(판례 탭 참조조문 칩) 1곳뿐.
- ⚠ 혼동 주의: `components/ui/law-article-modal.tsx`는 **계산기 마법사용** 별개 컴포넌트(`/api/law/article` 사용). 본 기능의 재사용 대상은 `/law` 전용 `app/law/_components/ArticleModal.tsx`다.

---

## 2. Scope

### 2.1 In Scope

- [ ] **FR-1** 라우터 패턴 추가: "제" 생략 조문 표기 인식 (`specific_article_no_je`, priority 2)
- [ ] **FR-2** `tool === "get_law_text"` 라우팅 시 `LawResearchClient`에서 `ArticleModal` 팝업 오픈 (제 포함/생략 경로 공통)
- [ ] **FR-3** 팝업 오픈 시 `LawSearchTab` 인라인 자동 조회 억제 (이중 fetch·이중 표시 방지) — 단, 법령명·조문번호 입력칸 prefill은 유지
- [ ] **FR-4** 라우팅 배너 reason 문구: "법령명+조문번호 패턴 매칭 → 해당 조문 팝업 조회"
- [ ] **FR-5** 단위 테스트(`__tests__/korean-law/query-router.test.ts`) + 신규 E2E(`e2e/law-article-popup.spec.ts`)
- [ ] **FR-6** (소규모 UX) 예시 칩에 "소득세법 77조" 추가 (UnifiedSearchBar.tsx:63 `examples` 배열)

### 2.2 Out of Scope

- 법령·조문 탭의 "조문 본문 보기" 버튼(LawSearchTab.tsx:135-141) 인라인 표시 → 팝업 통일 여부 (후속 결정. 본 PR에서는 기존 인라인 유지)
- 항·호 딥링크 ("소득세법 77조 1항" 입력 시 ①항 하이라이트)
- `/api/law/route-router` API 계약(RouteResult 타입) 변경 — 라우터 순수 함수 내부만 수정
- 판례·체인 등 다른 탭 라우팅 변경

---

## 3. 기능 요구사항 상세

### FR-1. "제" 생략 패턴 — `specific_article_no_je`

`lib/korean-law/router/query-router.ts`의 `ROUTER_PATTERNS`에 priority 2로 삽입 (기존 priority 1 `specific_article`은 무변경 유지):

```typescript
// 1-b. 특정 조문 조회 (제 생략) — "소득세법 77조", "상증법 22조의2"
{
  name: "specific_article_no_je",
  priority: 2,
  patterns: [/^([가-힣·\s]{1,28}?(?:법|법률|령|규칙|시행령|시행규칙|조례|규정))\s*(\d{1,4})\s*조(?:의\s*(\d+))?/],
  extract: /* specific_article과 동일: resolveLawAlias + 제N조[의M] 조립, tool: get_law_text, confidence: high */
},
```

설계 결정 사항:

| 결정 | 근거 |
|---|---|
| 법령명부 `(.+?)` 대신 **법령명 접미사 필수** (`법\|법률\|령\|규칙\|…`) | "제"라는 강한 신호가 없으므로 좌측이 법령명 형태일 때만 매칭 → "예산 100조"·"1가구 2주택 조정" 류 오탐 차단. 별칭 52종(`lib/korean-law/aliases.ts:13-84`)은 전부 법/령/규칙 계열 접미사로 끝나는지 Do 단계에서 grep 확인 후, 예외 별칭이 있으면 alternation에 추가 |
| 기존 `specific_article` 정규식을 `(?:제\s*)?`로 합치지 않고 **별도 패턴** | 기존 패턴·테스트 무변경 보존. "제" 포함 입력(`민법 제750조`)은 기존 priority 1 경로 그대로, 신규 패턴은 독립 테스트 가능 |
| 끝 anchor(`$`) 미사용 | 기존 `specific_article`도 미사용 — "지방세법 제3조 개정"이 현재도 조문 조회로 가는 것과 거동 일관. "지방세법 3조 개정"도 동일하게 조문 조회 |
| 조문번호 `\d{1,4}` 상한 | 4자리 초과 숫자(연도·금액 오인) 배제 |
| `routeQuery`는 정규화 후 매칭(query-router.ts:229) | 테스트 입력도 normalize 경유 전제 — "소득세법77조"(무공백)·"§77" 변형도 케이스에 포함 |

### FR-2. 팝업 오픈 — `LawResearchClient` 레벨

`app/law/_components/LawResearchClient.tsx`:

```typescript
const [articleModal, setArticleModal] = useState<{ lawName: string; articleNo: string } | null>(null);

function handleRoute(route: RouteResult) {
  setRouted(route);
  setActiveTab(route.targetTab ?? "law");
  setRouteNonce((n) => n + 1);
  if (route.tool === "get_law_text" && route.params.lawName && route.params.articleNo) {
    setArticleModal({ lawName: String(route.params.lawName), articleNo: String(route.params.articleNo) });
  }
}
// 렌더: {articleModal && <ArticleModal {...articleModal} onClose={() => setArticleModal(null)} />}
```

- `ArticleModal`이 자체 fetch하므로 데이터 로딩 코드 추가 불필요.
- 동작 변경 명시: 기존 "민법 제750조"(예시 칩) 경로도 인라인 → **팝업**으로 바뀜. 의도된 통일.

### FR-3. 인라인 자동 조회 억제

현행 `LawSearchTab.tsx:54-64` useEffect는 `autoSearch` nonce 변경 시 `initialArticleNo`가 있으면 `openArticleWith()`(인라인 표시)를 자동 실행한다. FR-2 팝업과 중복되므로:

- `LawSearchTab`에 `inlineArticleAutoLoad?: boolean` prop 추가(기본 true — 기존 거동 보존).
- `LawResearchClient`가 `get_law_text` 라우팅 시 `false`로 전달 → useEffect에서 입력칸 prefill(`setQuery`·`setArticleNo`)만 수행하고 `openArticleWith` 호출 생략.
- 팝업을 닫은 뒤 사용자가 "조문 본문 보기"를 누르면 기존 인라인 경로로 재조회 가능 (탭 입력칸은 채워져 있음).
- ❗ `useEffect → store 미러링 금지` 정책 비저촉: 본 useEffect는 라우팅 이벤트(1회성 nonce) 반응이며 cross-field 동기화가 아님 — 기존 구조 유지, 분기만 추가.

### FR-5. 테스트

**단위 (query-router.test.ts 추가 케이스)** — 케이스 매트릭스:

| # | 입력 | 기대 패턴 | 기대 params / 탭 |
|---|---|---|---|
| 1 | `소득세법 77조` | `specific_article_no_je` | lawName 소득세법, articleNo 제77조, law |
| 2 | `소득세법 제77조` | `specific_article` (기존, 회귀 확인) | 동일 |
| 3 | `소득세법 77조의2` | `specific_article_no_je` | articleNo 제77조의2 |
| 4 | `상증법 22조` | `specific_article_no_je` | lawName 상속세및증여세법 (alias 해석) |
| 5 | `소득세법77조` (무공백) | `specific_article_no_je` | lawName 소득세법 |
| 6 | `소득세법` | `law_name_only` (불변) | search_law |
| 7 | `예산 100조` | `fallback_search_law` (오탐 가드) | search_law |
| 8 | `양도소득세 개정 이력` | `amendment_track` (불변) | chain |
| 9 | `1가구 2주택 조정` | fallback (숫자+비조문) | search_law |
| 10 | `지방세법 3조 개정` | `specific_article_no_je` (제 포함 입력과 거동 일관) | get_law_text |

`ROUTER_PATTERN_COUNT`(query-router.ts:289) 13으로 증가 — 기존 "패턴 수 ≥ 10" 테스트 통과 유지 확인.

**E2E (`e2e/law-article-popup.spec.ts` 신규)**:

- 시나리오: `/law` 진입 → 통합 검색창에 "소득세법 77조" 입력 → 검색 클릭 → ① 라우팅 배너에 `specific_article_no_je` 표기 ② `role="dialog"` 팝업 노출 ③ 팝업 헤더 "소득세법 제77조" 확인.
- 법제처 API 실호출 의존 구간(본문 로딩)은 기존 `e2e/inheritance-law-article-badges.spec.ts` LAW-2의 관대한 assertion 패턴(모달 열림 + 제목/링크 폴백) 차용 — 본문 텍스트 자체는 단정하지 않음.
- 정책: 브라우저 확인은 Playwright E2E로 충족 (memory `feedback_browser_verify_with_playwright`).

---

## 4. 변경 파일 목록 (예상 규모)

| 파일 | 변경 | 규모 |
|---|---|---|
| `lib/korean-law/router/query-router.ts` | 패턴 1종 추가 | +~25줄 |
| `app/law/_components/LawResearchClient.tsx` | articleModal state + ArticleModal 렌더 + handleRoute 분기 + LawSearchTab prop | +~15줄 |
| `app/law/_components/LawSearchTab.tsx` | `inlineArticleAutoLoad` prop + useEffect 분기 | +~8줄 |
| `app/law/_components/UnifiedSearchBar.tsx` | 예시 칩 1개 추가 | +1줄 |
| `__tests__/korean-law/query-router.test.ts` | 케이스 10종 | +~60줄 |
| `e2e/law-article-popup.spec.ts` | 신규 | +~50줄 |

신규 API·DB·엔진 변경 없음. 전 파일 800줄 정책 여유 충분 (LawSearchTab 249줄 → ~257줄).

---

## 5. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| "제" 생략 패턴 오탐으로 의도치 않은 조문 조회 | 법령명 접미사 가드 + 단위 케이스 #7·#9. 오탐이어도 ArticleModal이 "해당 조문을 찾을 수 없습니다" 안내(ArticleModal.tsx:114-118)로 graceful — 파괴적 결과 없음 |
| 기존 "제N조" 경로 인라인→팝업 동작 변경 | 의도된 UX 통일로 본 문서에 명시. `/law` 페이지 전용 기존 E2E 없음(`e2e/` 실측 — `inheritance-law-article-badges.spec.ts`는 계산기 쪽 별개 모달) → 회귀 영향 없음 |
| 팝업+인라인 이중 fetch | FR-3 억제 prop. 만약 누락돼도 서버 `.legal-cache` 7일 TTL로 2회차는 캐시 히트 (성능 한정 영향) |
| 별칭 중 법/령/규칙 계열 접미사가 아닌 항목 존재 가능성 | Do 단계에서 `aliases.ts` 52종 grep 전수 확인 → 예외 발견 시 패턴 alternation 보강 (확인 필요) |

---

## 6. Success Criteria

1. 통합 검색창 "소득세법 77조" + 검색 → 초록(high) 배너 + 소득세법 제77조 본문 팝업.
2. "소득세법 제77조"·"상증법 22조"·"소득세법 77조의2" 동일 거동.
3. `npx vitest run __tests__/korean-law/` 전체 통과 (기존 케이스 회귀 0).
4. `npx playwright test e2e/law-article-popup.spec.ts` 통과.
5. `npm run check:pre-pr` (typecheck + lint + test) 통과.

---

## 7. 다음 단계 (PDCA)

- **Design**: 본 계획 §3의 코드 스케치를 그대로 설계 확정 (소규모 — 별도 design 문서 생략 가능, 필요 시 `docs/02-design/features/law-article-popup.design.md`).
- **Pre-Do anchor**: 단위 케이스 #1("소득세법 77조" → get_law_text)을 먼저 작성·실행해 **실패 확인** 후 구현 착수 (memory `feedback_pre_anchor_verification`).
- **Do**: 라우터 → 팝업 연결 → 억제 prop → 테스트 순. 단일 브랜치 1 PR (`scripts/ship.sh`).
