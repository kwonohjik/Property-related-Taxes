# 계획서 — 협의분할(상속인·수유자별) 입력 UI 높이·라벨 중복 압축

> 상태: Plan · 작성일 2026-06-09 · 대상: 상속세 부동산/주식/채무/추정상속 협의분할 입력
> 사용자 확정: **통합 행**(체크박스+이름+금액 한 줄) + **적극 압축**(제목 3중복·설명·중첩 카드 정리)

## 1. 배경 / 문제

협의분할 입력 패널이 세로로 너무 길어 스크롤 부담이 크다. 원인은 **컨테이너 3겹 중첩 + "협의분할" 제목 3중복 + 상속인 이름 중복 표시**:

| 겹 | 컨테이너 | 제목/요소 | 위치 |
|---|---|---|---|
| 1 | 인라인 패널 (sky, p-3) | `상속인·수유자별 협의분할` + X | `estate-card/EstateChipInlineExpand.tsx:88-110` |
| 2 | ToggleCard (violet) | `상속인·수유자별 협의분할 입력` + **2줄 설명** + Switch | `HeirAllocationToggleSection.tsx:48-64` |
| 3 | 내부 카드 (sky border, p-3) | `협의분할 (상속인별 분배)` + 합계 chip | `HeirAllocationInput.tsx:131-165` |

- 제목 3개 모두 "협의분할"을 반복(겹1·2·3).
- 설명(겹2)이 2줄 차지.
- 상속인 **이름 2회 표시**: 선택 칩 `✓ 배우자 (한배우자)`(`HeirAllocationInput.tsx:190`) ↔ 입력행 라벨 `배우자 (한배우자)`(`:208`). 이미지의 중복.
- 칩 row(`:174-194`)와 금액 입력 row(`:197-240`)가 **분리**되어 세로 길이 증가.

### 1.1 비목표 (범위 제외)

- **칩 상태 라벨**(`chip-config.ts:169-197`의 `법정분할`/`협의분할 (미입력)`/`협의분할`)은 **카드 헤더의 접힘 칩**으로, 펼침 패널과 별개 → 변경 없음.
- 엔진 input(`heirAllocations`)·result·API·validation·결과 화면 배부 표 — **무변경**(순수 입력 UI 압축).
- `toggleHeir`/`updateAmount`/`updateArea`/`buildInitialHeirAllocations`/합계 검증 로직 — 동작 보존(레이아웃만 변경).

## 2. 대상 코드 (실측 file:line)

- `components/calc/inheritance/HeirAllocationInput.tsx` (243줄) — **본체**. 내부 카드·헤더·합계 chip·칩 row·금액 입력 row + `heirShortLabel`(`:59-71` export).
- `components/calc/inheritance/HeirAllocationToggleSection.tsx` (73줄) — ToggleCard 래퍼(title `:50`·description `:51`).
- `components/calc/inheritance/estate-card/EstateChipInlineExpand.tsx` (136줄) — 인라인 패널 헤더(`PANEL_TITLE["heir-allocation"]` `:47`).

## 3. ⚠️ 공유 컴포넌트 영향 맵 (필독 — 변경 전파)

이 변경은 단일 화면이 아니라 **여러 렌더 사이트로 전파**된다. (실측 grep)

### 3.1 `HeirAllocationInput` (본체) 렌더 사이트 — 3곳

| # | 호출자 | 맥락 | 외부 헤더 |
|---|---|---|---|
| 1 | `HeirAllocationToggleSection.tsx:65` | 부동산/주식 협의분할 (이미지) | 패널+ToggleCard 헤더 있음 |
| 2 | `PresumedInheritanceInput.tsx:247` | 추정상속재산 §15 협의분할 (`addedAmount>0`) | 자체 `{/* 협의분할 */}` 맥락 |
| 3 | `DebtAllocationInput.tsx:322` | 채무 협의분할 | 자체 `{/* 협의분할 */}` 맥락 |

→ **통합 행 레이아웃(이름 중복 제거)은 3곳 모두에 적용**(순수 개선, 일관성↑). 단 **내부 헤더·카드 제거는 1번에서만** 필요(2·3은 자체 맥락 의존 가능) → §4.3 prop 게이트로 분리.

### 3.2 `HeirAllocationToggleSection` (ToggleCard) 렌더 사이트 — 2곳

| # | 호출자 | 패널 헤더 |
|---|---|---|
| 1 | `EstateChipInlineExpand.tsx:120` | 패널 헤더 `상속인·수유자별 협의분할` 있음 |
| 2 | `EstateCommonAttributesSection.tsx:224` | **헤더 없음** (ToggleCard title이 유일 식별자) |

→ ⚠️ **D-O1 모순 확인 필요**: `EstateChipInlineExpand` 주석은 "분류·분할…입력 컴포넌트 **유일한 렌더 위치** (⚙️ 패널 미노출)"라고 명시하나, `EstateCommonAttributesSection.tsx:224`도 여전히 `HeirAllocationToggleSection`을 렌더한다. **Do 진입 전 이 경로가 실제 활성(화면 노출)인지 probe로 확인**. 활성이면 ToggleCard title을 완전 제거하지 말고 자기식별 가능한 짧은 제목 유지(§4.2). 비활성(dead)이면 별도 정리 후보.

### 3.3 `heirShortLabel` export 사용처 — 보존 필수

`DebtAllocationInput.tsx:170`·`HeirAssessmentCard.tsx:57`·`FarmingEligibilitySection.tsx:528`이 import. **시그니처·export 유지**(통합 행에서도 그대로 사용).

## 4. 설계

### 4.1 통합 행 — `HeirAllocationInput` 본체 재구성 (3곳 공통)

현재 분리된 **칩 row(`:174-194`) + 금액 입력 row(`:197-240`)를 단일 리스트로 통합**.

**iterate 대상**: 현행 분리 구조는 칩 row가 `distributableHeirs.map`(항상)·금액 row가 `allocs.map`(`hasInput` 게이트). 통합 행은 **`distributableHeirs.map`(항상 전원 렌더)** 1개로 합치고, 금액 input은 **per-heir 선택(`allocs.find(heirId)`) 시에만** 인라인 노출(전역 `hasInput` 게이트 아님).

각 `distributableHeir` → 한 줄:
- 좌측: 클릭 가능한 토글(체크박스/pill) — `toggleHeir(heir)` 유지. `✓/+` 표시 + `heirShortLabel(heir)` (이름 **1회만**). a11y: `<button aria-pressed={selected}>`로 선택 상태 노출(role=button 유지 — 기존 `getByRole("button")` 단언 호환).
- 우측: **선택된 경우에만** 인라인 `CurrencyInput`(금액, placeholder `분배 금액` 유지) + (해당 시) 면적 input(`showAreaInput`).
- 미선택: 토글만(금액 칸 미표시 → 세로 압축).

**보존 필수 요소** (현행 동작 — 통합 행에서도 유지):
- `미입력 시 법정상속분 자동 배분 안내`(`:168-172`, `!hasInput` 시 표시) — 자동 안분 fallback 금지 정책의 사용자 고지. 통합 행 하단/상단에 유지.
- `단독 상속 자동 입력` 버튼(`:156-164`, `!hasInput && distributableHeirs.length===1 && expectedTotal>0`) → 합계 chip 줄 우측에 유지.

```
협의분할   합계 1,500,000,000 ✓
─────────────────────────────
☑ 배우자(한배우자)   [1,500,000,000]
☐ 자녀(김첫째)       [           ]
☐ 자녀(김둘째)
☐ 수유자(김손자)
☐ 기타(윤며느리)
```

- **이름 중복 제거**: 기존 `:207-209` 입력행 라벨 삭제 — 이름은 토글에만.
- 합계 chip(`:138-154`)은 **유지**(검증 핵심) — 상단 헤더 줄로 이동.
- `toggleHeir`·`updateAmount`·`updateArea`·`handleAutoFillSingle`·합계 색 검증(emerald/rose/gray) 로직 **그대로 보존**.
- 정책 준수: 자동 안분 fallback 금지(미선택=금액 0), `useEffect→store` 미러링 없음.

### 4.2 적극 압축 — 헤더·설명·카드 정리

- **겹3 내부 헤더 `협의분할 (상속인별 분배)`(`:135-137`) 제거** → 패널/ToggleCard가 이미 맥락 제공.
  - 상단 행 구성(조건부): `heading`이 있으면 `{heading} + 합계chip + autofill버튼`, `heading={null}`(인라인 패널)이면 `합계chip + autofill버튼`만(헤딩 텍스트 없음). 합계 chip은 항상 유지.
- **겹3 내부 카드 테두리·배경·패딩 평탄화**: `rounded-md border border-sky-200 bg-sky-50/40 p-3`(`:132`) → 게이트(§4.3)로 제거 또는 약화. ToggleCard children 들여쓰기로 충분.
- **ToggleCard 설명(`:51`) 1줄 압축**: 법령 인용 유지하되 1줄로. 예: `법정상속분(§1009) 대신 직접 분배(§1013·§1073) · 영리법인 제외`. (법령 정확성 정책 — 조문 보존)
- **ToggleCard 제목(`:50`)**: §3.2 확인 결과에 따라 — `EstateCommonAttributesSection` 경로 활성이면 짧고 자기식별 가능한 제목 유지(예: `협의분할 직접 입력`), 비활성이면 더 축약 가능. 패널 헤더와의 완전 중복(`상속인·수유자별 협의분할 입력`)만 해소.

### 4.3 공유 안전장치 — prop 게이트 (2·3 render site 무영향)

`HeirAllocationInput`에 optional prop 추가로 **헤더·카드 제거를 호출자별 선택**:
- `heading?: ReactNode`(기본값 현행 `협의분할 (상속인별 분배)`) — ToggleSection은 `null` 전달(헤더 숨김).
- `flush?: boolean`(기본 false=현행 카드 유지) — ToggleSection은 `true`(카드 평탄화).
- → `PresumedInheritanceInput`·`DebtAllocationInput`은 **기본값으로 현행 유지**(회귀 0), 통합 행만 자동 적용.

## 5. 리스크 & 대응

| ID | 리스크 | 대응 |
|---|---|---|
| R-1 | 통합 행이 3 render site에 전파 — Debt·Presumed 시각 변화 | 통합 행은 순수 개선(이름 중복 제거)·일관성↑. 3곳 모두 수동/E2E 확인 |
| R-2 | 내부 헤더·카드 제거가 Debt·Presumed 맥락 깨뜨림 | §4.3 `heading`/`flush` 기본값으로 2·3 현행 유지. ToggleSection만 압축 |
| R-3 | `EstateCommonAttributesSection:224` 경로 활성 시 ToggleCard title 과축약 → 식별 불가 (D-O1 모순) | §3.2 Do 전 probe 확인. 활성이면 자기식별 제목 유지 |
| R-4 | `heirShortLabel` 시그니처 변경 시 3개 외부 사용처 깨짐 | export·시그니처 불변. 통합 행 내부에서 동일 호출 |
| R-5 | 합계 검증 chip(emerald/rose/gray) 누락 시 협의분할≠평가액 침묵 | chip 로직 그대로 이동, anchor로 색 전이 검증 |
| R-6 | `showAreaInput`(면적 입력) 경로 회귀 | 통합 행에서도 선택 시 면적 input 인라인 유지. 영농 면적 케이스 확인 |
| R-7 | 토글 OFF→ON 시 buildInitialHeirAllocations 동작 변화 | ToggleSection onCheckedChange 무변경. 본체 레이아웃만 변경 |

## 6. 테스트 영향 (실측 — 텍스트·구조 단언)

협의분할 입력 UI 텍스트를 단언하는 테스트/E2E (변경 시 갱신 필요):

- `__tests__/components/calc/property-valuation-form-heir-allocation.test.tsx` — 입력 폼 렌더(통합 행 구조 영향, Do 시 단언 정밀 확인).
- `__tests__/inheritance/estate-card-compaction.test.tsx` — 칩/패널 컴팩션.
- `__tests__/components/calc/inheritance/heir-allocation-zero-valuation.test.tsx` — 평가액 0 합계 chip 경로.
- **`e2e/estate-chip-ux-fixes.spec.ts` — ⚠️ 직접 깨짐**: `:85` `getByText("협의분할 (상속인별 분배)")` + `:91` `getByPlaceholder("분배 금액").first()`. 이건 **인라인 패널 맥락**(칩 클릭→펼침)이라 `heading={null}`로 내부 헤더 제거 시 `:85` 실패. 인라인 패널엔 교체할 내부 헤딩 텍스트가 없으므로(§4.2) → **패널 헤더 `상속인·수유자별 협의분할`(`EstateChipInlineExpand`) 가시성 또는 합계 chip 존재로 단언 교체**. `분배 금액` placeholder는 §4.1대로 유지하므로 `:91`은 통과.
- (Do 시 추가 grep): Debt/Presumed 협의분할 단언 — `DebtAllocationInput`·`PresumedInheritanceInput` 관련 테스트(`debt-allocation-*`, presumed 계열). prop 기본값으로 현행 유지 시 통과 예상이나 통합 행 구조 변경분 확인.

**영향 아님 (입력 무관 — §6 제외)**: `e2e/inheritance-heir-allocation-table.spec.ts`는 `heir-allocation-summary-table` testid = **결과 화면 상속인별 배부 표**(엔진 result 기반)로, 입력 레이아웃과 무관. 본 변경 영향 없음. (`AllocationBreakdownSection.test.tsx`·`HeirAllocationSummaryTableUiFix.test.tsx`도 결과뷰 계열 — 무관.)

**갱신 포인트**: `협의분할 (상속인별 분배)` 헤더 단언 제거/교체, 칩 라벨↔입력행 라벨 분리 가정 제거(이제 단일), 통합 행 구조(role/testid). anchor: 선택 시 금액 input 노출·미선택 시 미노출·합계 색(emerald/rose/gray) 전이·이름 1회.

## 7. 작업 단계 (Do)

1. **Pre-Do probe**: `EstateCommonAttributesSection:224` 협의분할 렌더가 화면에 실제 노출되는지 확인(D-O1 모순 해소, R-3).
2. `HeirAllocationInput.tsx` 본체 재구성: 칩 row+입력 row → 통합 행. `heading`/`flush` prop 추가. 합계 chip 상단 이동. 이름 중복 라벨 제거.
3. `HeirAllocationToggleSection.tsx`: `heading={null} flush` 전달. 제목·설명 압축(§4.2, R-3 결과 반영).
4. `PresumedInheritanceInput`·`DebtAllocationInput`: prop 미전달(기본값) 확인 — 회귀 0.
5. 영향 테스트 갱신(§6) + anchor(선택/미선택 금액 노출·합계 색·이름 1회).
6. `npx tsc --noEmit` 0 + 관련 vitest → 전체 `npm test`.
7. E2E: heir-allocation-table·estate-chip-ux-fixes + Debt/Presumed 경로 스펙 실행.
8. 브라우저/E2E로 3 render site(부동산·추정상속·채무) 시각 확인 또는 미수행 명시.

## 8. 완료 기준 (DoD)

- [ ] 통합 행: 선택 상속인 이름 **1회만** 표시(칩↔라벨 중복 제거).
- [ ] 미선택 상속인은 금액 칸 미표시(세로 압축).
- [ ] 제목 3중복 해소(패널 헤더 유지, 내부 헤더 제거, ToggleCard 제목·설명 압축).
- [ ] `heading`/`flush` 기본값으로 Presumed·Debt **회귀 0**.
- [ ] `heirShortLabel` export·시그니처 불변.
- [ ] 합계 검증 chip(emerald/rose/gray)·`toggleHeir`·`updateAmount`·`showAreaInput`·autoFill 보존.
- [ ] `미입력 시 법정상속분 자동 배분 안내`·`단독 상속 자동 입력` 버튼 보존(통합 행에서).
- [ ] 토글 a11y(`aria-pressed`) 노출.
- [ ] `useEffect→store` 미러링 0 · 자동 안분 fallback 0.
- [ ] `tsc` 0 + 관련 vitest + 전체 `npm test` 통과.
- [ ] 영향 테스트 갱신 + anchor 통과.
- [ ] 3 render site 브라우저/E2E 확인 또는 미수행 명시.
