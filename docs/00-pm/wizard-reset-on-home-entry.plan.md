# 홈 진입 시 마법사 입력값 초기화 (빈 폼 시작) 계획서

> 작성일: 2026-06-29 · 상태: Plan (구현 전)
> 한 줄 요약: 홈 화면 카드를 클릭해 마법사로 진입할 때는 **새 계산**으로 간주하여 입력값(formData)을 빈 폼으로 초기화한다. 단, **작업 중 새로고침**은 입력값을 보존한다(둘을 구분).

---

## 1. 배경 — 사용자 보고 문제

처음 입력하는 것처럼 보이는데 양도일(`2026-2-16`)·신고일(`2026-4-7`)이 이미 채워져 있다(사용자 스크린샷, 양도세 Step1 "기본정보").

---

## 2. 원인 (코드 실측)

- `defaultFormData.transferDate`·`filingDate`는 **빈 문자열**(`lib/stores/calc-wizard-store.ts:181-182`).
- `DateInput`은 빈 값일 때 `parseDateStr("")` → `{year:"",month:"",day:""}` → **placeholder만 표시**, 오늘 날짜 fallback 없음(`components/ui/date-input.tsx:37`).
- ⇒ 코드가 자동으로 날짜를 채우는 경로는 없음. 화면 값은 **이전에 같은 탭에서 입력한 formData가 sessionStorage(`transfer-tax-wizard`)에 persist되어 복원**된 것.
- 이는 직전 작업([[wizard-step-reset-on-reentry]])의 결정 D1("currentStep은 리셋하되 formData는 세션 내 보존")의 직접적 결과. currentStep 리셋으로 항상 첫 스텝(자산 목록)을 보게 되면서 잔존 입력이 드러났다.

**핵심 제약**: sessionStorage는 "홈 경유 재진입"과 "작업 중 새로고침"을 **구분하지 못한다**(같은 탭이면 동일). 따라서 둘을 구분하려면 **홈 카드 클릭에 명시적 신호**가 필요하다.

---

## 3. 사용자 결정 (2026-06-29 확정)

| # | 질문 | 결정 |
|---|---|---|
| D1 | 재진입 시 입력값 보존 | **홈 진입 시만 초기화** — 홈 카드 클릭 = 새 계산 = 빈 폼. 작업 중 새로고침은 입력값 보존. |
| D2 | 적용 범위 | **formData를 persist하는 마법사 전체(5개)** — 양도세·양도세(다건)·주식양도세·종부세·주식평가. |

> **범위 근거**: `grep "persist(" lib/stores/` 중 formData를 persist하는 store만 이 증상이 있다. 상속·증여·취득·재산세 store는 persist 미사용 → 매번 빈 폼이라 무관(`building-std-snapshot`은 스냅샷 도구로 formData 아님 → 제외).

---

## 4. 설계 — query param `?new=1` 신호 + mount 시 reset

### 4-1. 메커니즘

1. 홈 카드 `href`에 `?new=1`을 붙인다 (5개 카드).
2. 각 마법사 진입 컴포넌트가 **mount 시 1회** `?new=1`을 감지하면 `store.reset()` 호출 후 URL에서 param 제거(`history.replaceState`).
3. 이후 새로고침 시에는 URL에 `?new=1`이 없으므로(이미 제거됨) reset이 일어나지 않아 **입력값 보존**.

### 4-2. 공통 훅 — `useResetOnNewParam(onNew)`

5곳 반복이므로 작은 공통 훅으로 추출(단일 사용 아님 → 추상화 정당). **콜백 1개**를 받아 multi처럼 복수 store reset이 필요한 경우도 표현(STEP1 정정 #1·#3).

```ts
// lib/hooks/use-reset-on-new-param.ts (신규)
export function useResetOnNewParam(onNew: () => void) {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("new") === "1"
    ) {
      onNew();
      // URL에서 ?new=1 제거 — 새로고침·공유 시 재초기화 방지(리렌더 없이)
      window.history.replaceState(null, "", window.location.pathname);
    }
    // mount 1회만 — onNew는 호출 측에서 useCallback으로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- ⚠️ **`useSearchParams` 대신 `window.location.search` 직접 read** — Next.js `useSearchParams`는 Suspense 경계를 요구(빌드 경고). 클라이언트 컴포넌트 mount 후 `window` 직접 읽기로 회피. (진입 컴포넌트 5곳 전부 `"use client"` 실측 확인.)
- `onNew()`는 rehydrate 완료 후(mount useEffect 시점) 실행되므로 잔존 formData를 빈 폼으로 확실히 덮어쓴다.
- **정책(`feedback_useeffect_store_mirror_forbidden`) 비위반**: 이 useEffect는 cross-field 파생값의 **지속 동기화(미러링)**가 아니라 **mount 1회 명시적 초기화 액션**이다. deps `[]` + `?new=1` 1회 제거로 재실행/무한루프 없음.

---

## 5. 변경 파일별 작업

### 5-1. `lib/hooks/use-reset-on-new-param.ts` (신규)
- §4-2 공통 훅.

### 5-2. `app/page.tsx` — 홈 카드 href에 `?new=1` (5곳)
| line | href (현행) | 변경 |
|---|---|---|
| `:66` | `/calc/transfer-tax` | `/calc/transfer-tax?new=1` |
| `:73` | `/calc/transfer-tax/multi` | `/calc/transfer-tax/multi?new=1` |
| `:80` | `/calc/stock-transfer-tax` | `/calc/stock-transfer-tax?new=1` |
| `:122` | `/calc/comprehensive-tax` | `/calc/comprehensive-tax?new=1` |
| `:136` | `/tools/stock-valuation` | `/tools/stock-valuation?new=1` |

### 5-3. 진입 컴포넌트 5곳 — `useResetOnNewParam(onNew)` 호출
| 세목 | 컴포넌트 | `onNew` 콜백 |
|---|---|---|
| 양도세 | `app/calc/transfer-tax/TransferTaxCalculator.tsx` | `useCalcWizardStore` `reset`(`:299`) |
| 양도세(다건) | `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` | **`() => { resetMulti(); resetWizard(); }`** (2개 store) |
| 주식양도세 | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` | `useStockTransferStore` `reset`(`:720`) |
| 종부세 | `app/calc/comprehensive-tax/page.tsx` | `useComprehensiveWizardStore` `reset`(`:409`) |
| 주식평가 | `components/calc/tools/StockValuationTool.tsx` | `useStockValuationStore` `reset`(`:52`) |

- 단일 store 세목: `useResetOnNewParam(reset)` (reset은 zustand action이라 stable).
- ⚠️ **양도세(다건) — 2개 store 정정(STEP1 #1)**: `MultiTransferTaxCalculator`는 `useMultiTransferStore`(form=properties)와 `useCalcWizardStore`(단건 formData=자산 편집 작업영역)를 **둘 다** 사용(`:230-239, 306-369`). multi store만 reset하면 단건 store 잔존 formData 초기화가 mount useEffect(`:347-364`: `handleAddProperty`→`resetWizard` / `edit`→`syncToWizardStore`)에 **암묵 의존**한다. 명시적 확실성을 위해 `useResetOnNewParam(useCallback(() => { resetMulti(); resetWizard(); }, [resetMulti, resetWizard]))`로 둘 다 호출.
- ⚠️ **실행 순서(STEP3 #4)**: `useResetOnNewParam` 호출을 multi의 기존 mount useEffect(`:347-364`)보다 **앞에(컴포넌트 상단)** 둔다. React는 useEffect를 선언 순서로 실행 — reset이 먼저 실행되어야 `:347` effect가 빈 properties 기준으로 `handleAddProperty`(빈 자산 1건)를 동작시킨다(잔존 properties 1틱 노출 방지).
- ⚠️ 양도세 단건 `reset`(`:299-304`)은 `sessionStorage.removeItem` + `set(...)` 수행 — 안전. 나머지는 `set(초기값)`만이나 persist가 직후 빈 폼을 재저장하므로 결과 동일.

---

## 6. 엣지 케이스 · 함정

| 케이스 | 처리 | 근거 |
|---|---|---|
| 작업 중 새로고침(F5) | `?new=1` 없음 → reset 미발생 → **입력값 보존** | D1 |
| 홈 카드 재클릭 | `?new=1` 동반 → reset → 빈 폼 | D1 |
| `?new=1` URL 공유·북마크 | mount 시 reset 후 `history.replaceState`로 즉시 param 제거 → 재방문 시 깨끗 | §4-1 |
| 이력 "수정"(handleResume) 진입 | 영향 없음 — `?new=1` 없는 경로(이력 화면→마법사). `result`/editing 경로 별도 | — |
| 종부세→재산세 연동 등 내부 네비게이션 | `?new=1` 미부착 → 보존. 홈 카드에만 부착 | — |
| `currentStep` 리셋([[wizard-step-reset-on-reentry]])과 중복 | 보완적 — 홈 진입은 reset으로 formData+step 초기화, 새로고침은 currentStep만 0(formData 보존). 충돌 없음 | — |

---

## 7. 테스트 anchor (E2E, Playwright)

| ID | 시나리오 | 기대 |
|---|---|---|
**대표(양도세) 3-케이스 — 분기 직접 검증**
| ID | 시나리오 | 기대 |
|---|---|---|
| E1 | sessionStorage에 formData(transferDate 등) 주입 → `/calc/transfer-tax?new=1` 진입 | 양도일 **빈칸**(placeholder), URL에 `?new=1` 없음(제거됨) |
| E2 | sessionStorage에 formData 주입 → `/calc/transfer-tax`(param 없이) 진입 | 양도일 **값 보존**(새로고침 시나리오) |
| E3 | 홈(`/`)에서 양도세 카드 클릭 진입 | 빈 폼(양도일 placeholder) — 실제 사용자 경로 |

**5개 세목 전수 — `?new=1` 진입 시 초기화 확인 (D2 결정: 전수)**
| ID | 세목 | 진입 | 기대(빈 폼 식별자) |
|---|---|---|---|
| F1 | 양도세 | `/calc/transfer-tax?new=1` | 양도일 빈칸 (E1과 동일 — F는 전수 일관성 확인용, E1로 대체 가능) |
| F2 | 양도세(다건) | `/calc/transfer-tax/multi?new=1` | 입력 자산/금액 빈 상태. **두 키 주입 필수**: `multi-transfer-tax-wizard`(properties) + `transfer-tax-wizard`(단건 작업영역) 양쪽에 데이터 주입 후 진입 → 둘 다 빈 상태 확인(정정 #1 실효 검증) |
| F3 | 주식양도세 | `/calc/stock-transfer-tax?new=1` | 첫 스텝 빈 입력 |
| F4 | 종부세 | `/calc/comprehensive-tax?new=1` | 첫 스텝 빈 입력 |
| F5 | 주식평가 | `/tools/stock-valuation?new=1` | 빈 입력 |

- 각 F 케이스: 해당 sessionStorage 키에 formData 주입 → `?new=1` 진입 → 빈 폼 확인. 세목별 빈 폼 식별자(placeholder·빈 값)는 구현 시 실측으로 고정(추정 금지).
- E1·E2 대비가 "홈 진입만 초기화"의 핵심 회귀 가드. F1~F5는 5개 store reset 배선이 실제 동작함을 전수 확인.

---

## 8. 작업 순서 → 검증

```
1. lib/hooks/use-reset-on-new-param.ts 신규           → verify: tsc
2. app/page.tsx 5개 href에 ?new=1                     → verify: grep 5건
3. 진입 컴포넌트 5곳 useResetOnNewParam(reset) 호출    → verify: tsc 0건
4. E2E E1·E2·E3(대표) + F1~F5(전수) 작성·통과
5. npx tsc --noEmit 0건 · 회귀 npm test · 관련 세목 E2E 회귀
```

**완료 게이트**: tsc 0건 · E2E E1~E3 + F1~F5 통과 · 홈 href 5건 grep 확인 · 양도세/주식/종부세 기존 마법사 E2E 회귀 통과.

---

## 9. 미해결 / 확인 필요

- **`?new=1`이 페이지 분석/SEO에 영향?** 홈 카드는 내부 링크이고 mount 즉시 제거되므로 무영향. (확인 완료)
- ✅ **E2E 범위 확정**: 5개 세목 전수(F1~F5) + 대표 분기(E1~E3). (사용자 결정 2026-06-29)
- ✅ **브랜치 확정**: 직전 작업 브랜치 `feat/wizard-step-reset-on-reentry`에 이어서 작업 → 1회 ship. (사용자 결정 2026-06-29)

## 10. 자가 검토 이력 (plan-design-self-review-loop, 2026-06-29)

규모 "중"(엔진 input/result 미변경) → STEP 1~4 + 통합비교(10). 디자인 문서(STEP 5·12) N/A.

**STEP 0 policy-check**: `feedback_useeffect_store_mirror_forbidden`(미러링 금지)·`single-source-engine-helper`(store 자체 reset 재사용) 적용 — 위반 없음(mount 1회 초기화 ≠ 파생 동기화).

**STEP 1~4 정정(5건)**:
- 🔴 High #1: multi(다건)는 `useMultiTransferStore` + `useCalcWizardStore` 2개 store 사용(`:230-239, 306-369`) → multi store만 reset 시 단건 잔존이 mount useEffect에 암묵 의존. **`resetMulti()+resetWizard()` 둘 다** 호출로 정정(§5-3).
- 🟡 Medium #2: useEffect reset이 미러링 정책과 구분됨을 §4-2에 명시(1회 초기화·무한루프 없음).
- 🟢 Low #3: 공통 훅을 `useResetOnNewParam(onNew: ()=>void)` 콜백으로 일반화(multi 복합 reset 수용).
- 🟡 Medium #4: `useResetOnNewParam`을 multi 자체 mount effect(`:347-364`)보다 **앞에** 호출(실행 순서 — 잔존 properties 1틱 노출 방지, §5-3).
- 🟡 Medium #5: E2E F2가 multi 2개 sessionStorage 키 양쪽 주입·검증하도록 정정(§7).

**실측 확인(정정 불요)**: 진입 컴포넌트 5곳 전부 `"use client"`, 홈 href line(66·73·80·122·136)·store reset line(299·146·720·409·52) 정확, mount reset이 rehydrate 후 실행.

**통합비교**: 정합축 6/6 ✓, Critical/High 잔존 0.
