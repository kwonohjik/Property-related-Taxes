# Plan — 채무·공과·장례비 항목 카드 → 요약 테이블 + 편집 모달 전환

> 작성일: 2026-06-11
> worktree: `feat/debt-item-table-modal` (브랜치 `worktree-feat+debt-item-table-modal`)
> 범위: UI 전용 (엔진·타입·API·Validation 무변경)
> 선행 사례 2건:
>   1. 상속인·수유자 구성 테이블 전환 — `docs/02-design/features/inheritance-heir-table-view.plan.md`
>   2. 자산 카드 테이블 전환 (PR #74까지 머지 완료) — `docs/02-design/features/estate-asset-table-view.plan.md`
>
> 참조 파일 (실측 — file:line, 2026-06-11 worktree 기준):
> - `components/calc/inheritance/DebtAllocationInput.tsx` (372줄: CATEGORY_STYLES 44-85, add/update/remove 107-126, 합계·장례비 한도 128-146, 담보채무 read-only 카드 151-201, 안내 카드 204-209, **항목 카드 나열 219-332**, 카테고리별 추가 버튼 337-351, 합계 요약 354-369)
> - `components/calc/inheritance/HeirAllocationInput.tsx` (252줄: `hasDistributableHeir` 32, `buildInitialHeirAllocations` 42, `heirShortLabel` 68)
> - `components/calc/inheritance/steps.tsx` (228-243: 협의분할 ToggleCard + `DebtAllocationInput` 단일 사용처, 폐기확인 Dialog 핸들러 200-216)
> - `lib/tax-engine/types/inheritance-gift.types.ts:939-960` (`DebtItem`: id·category·name·amount·isBongan?·heirAllocations?·creditorAddress?·incurredDate?·isFinancialDebtForDeduction?)
> - 재사용 패턴 구현체: `components/calc/EstateItemTableView.tsx` (188줄) · `EstateItemEditor.tsx` (200줄) · `PropertyValuationForm.tsx` (321줄 — Dialog 오케스트레이션 196-237, 추가 직후 자동 선택 130-143, 삭제 시 모달 자동 닫힘 160-164)

---

## 1. 배경 및 목표

상속세 Step 2 협의분할 모드의 채무·공과·장례비 입력(`DebtAllocationInput`)은 **항목별 세로 카드 나열**이다 (첨부 스크린샷). 항목 1건의 카드가 카테고리 칩 + 채권자·내용 + 금액 + §22 토글 + Table C(채권자 주소·발생일) + 협의분할 분배 그리드까지 펼쳐져 있어, 항목이 3~4건만 되어도 전체 구성을 한눈에 파악할 수 없다. 자산 탭(상속재산 목록)은 이미 동일 문제를 **요약 테이블 + 행 클릭 Dialog 모달**로 해결했다 (PR #74까지 머지).

**목표**: 자산 탭과 동일한 이중 뷰 구조를 채무·공과·장례비에 적용.

- 전체 항목을 요약 테이블로 즉시 파악 (분류 · 채권자·내용 · 금액 · 분배·옵션 배지)
- 행 클릭 → Dialog 모달 → 기존 카드 본체(이름·금액·봉안·§22·Table C·협의분할) 그대로 편집
- 추가 버튼 클릭 → 항목 생성 + 모달 자동 오픈 (자산 탭 E-1 패턴)

**전환 대상은 항목 카드 나열(219-332)만**이다. 다음 3개 비-항목 영역은 본체에 그대로 유지한다 (무변경):

| 영역 | 위치 | 유지 이유 |
|---|---|---|
| 담보채무 §14 자동노출 read-only 카드 | DebtAllocationInput.tsx:151-201 | derive-only 표시 전용. E2E 2개가 텍스트 의존 (§8) |
| 혼합 시나리오 옵션 1 강제 안내 카드 (sky) | :204-209 | 모드 정책 안내 — 항목과 무관 |
| 카테고리별 합계·장례비 한도 요약 | :354-369 | 테이블 하단 그대로 (테이블의 합계 행 역할) |

---

## 2. 자산 탭 대비 차이 — 설계 결정의 근거

자산 카드 전환(D-1~D-6)보다 **훨씬 단순**하다. 차이 요약:

| # | 항목 | 자산 카드 | 채무 항목 | 처리 |
|---|---|---|---|---|
| C-1 | 본체 분기 | 카테고리별 VariantBody 3종 | **분기 없음** — 단일 폼 (funeral만 봉안 토글 추가) | 단일 `DebtItemEditor` (§5) |
| C-2 | 인터랙티브 헤더 칩 | resolveChips 칩 클릭 인라인 펼침 | **없음** — 카테고리 칩은 표시 전용 | 행 배지 derive 헬퍼 신설 (§4) — dual-truth 없음 |
| C-3 | 고급옵션·카테고리 변경 Dialog | AdvancedPanel + CategoryChangeDialog 중첩 | **없음** — 카테고리는 생성 시 고정 | 중첩 Dialog 리스크 자체가 없음 |
| C-4 | 상속·증여 공유 | mode prop 공유 (증여 자동 따라감) | **상속세 전용** (steps.tsx:237 단일 사용처) | 증여 고려 불필요 |
| C-5 | 기존 E2E 의존 | estate-card-* testid 직접 의존 8개 (최대 리스크) | **항목 카드 내부에 의존하는 spec 0건** (§8 실측) | E2E 회귀 부담 최소 |
| C-6 | 분배 검증 시각화 | 없음 | `HeirAllocationInput`이 합계≠분배 불일치 검증 보유 | 행에 분배 상태 배지 (✓ 일치 / △ 불일치) — 상속인 테이블의 "미입력 amber 경고" 패턴 (§4) |

결론: 이번 전환은 **자산 카드 전환의 축소판**이며, 신규 난제는 C-6(분배 상태 배지) 하나다.

---

## 3. 범위 — 엔진 무변경 명시

순수 UI 표시 레이어 작업. 8개 동기화 지점 중 **⑤(UI 위젯)만** 해당.

| 구분 | 변경 여부 | 근거 |
|---|---|---|
| `lib/tax-engine/types/inheritance-gift.types.ts` (`DebtItem`) | **무변경** | 기존 필드로 모든 표시값 파생 |
| `lib/tax-engine/inheritance-tax.ts` STEP 3 (debtItems 우선·장례비 한도) | **무변경** | IDA-1~13 anchor 보존 |
| `lib/calc/inheritance-tax-api.ts` · `inheritance-validate.ts` | **무변경** | 입력 데이터 구조 동일 |
| `components/calc/inheritance/steps.tsx` | **무변경** | `DebtAllocationInput` public props(items·heirs·onChange·derivedCollateralDebts) 유지 → 호출부 그대로 |
| `components/calc/inheritance/HeirAllocationInput.tsx` | **무변경** | 모달 안에서 그대로 재사용. `heirShortLabel` 행 배지에서도 import (단일 출처) |
| 3-state 토글·폐기확인 Dialog (steps.tsx:200-216) | **무변경** | 모드 진입/이탈 정책 불변 |

**변경/신설 대상**:

| 파일 | 변경 | 내용 |
|---|---|---|
| `components/calc/inheritance/DebtAllocationInput.tsx` | 내부 리팩터 | 항목 카드 나열 → 테이블 + Dialog 모달 오케스트레이션. public props 유지. CATEGORY_STYLES·합계 계산·담보카드·안내카드·추가버튼 보존 |
| `components/calc/inheritance/DebtItemTableView.tsx` | **신설** | 요약 테이블 — 행 렌더 + 분배·옵션 배지 derive |
| `components/calc/inheritance/DebtItemEditor.tsx` | **신설(분리)** | 기존 항목 카드 body(이름·금액·봉안 ToggleCard·§22 ToggleCard·Table C 2필드·HeirAllocationInput) 추출 — 모달 내용물 |

> **분할은 필수** (선행 함정 — [[feedback_800line_split_export_preservation]] "분할 추정 낙관 금지"): 테이블을 추가해도 본체 줄수는 줄지 않고 Dialog 오케스트레이션·핸들러가 **추가**된다. 372줄 + 테이블 + 모달을 한 파일에 넣으면 600줄+ 단일 파일 — 자산 탭과 동일하게 3파일 구조로 시작한다.

---

## 4. 테이블 설계 (DebtItemTableView)

`EstateItemTableView.tsx`(188줄)를 원형으로 한다. 컬럼:

| 컬럼 | 내용 | 출처 (단일 진실) |
|---|---|---|
| 분류 | CATEGORY_STYLES[category].label 칩 (금융채무 rose / 공과금 amber / 사적채무 violet / 장례비 emerald — 기존 chipClass 재사용) | DebtAllocationInput.tsx:44-85 `CATEGORY_STYLES` (export로 승격해 양쪽 import) |
| 채권자·내용 | `name.trim() \|\| CATEGORY_STYLES[category].label` ([[feedback_no_internal_id_in_result]] — id 비노출) | DebtItem.name |
| 금액 | 우정렬 `text-right font-mono tabular-nums` (amount-column-align). 0이면 "미입력" gray | DebtItem.amount |
| 분배·옵션 | read-only 배지 나열 (아래) | derive 헬퍼 |
| 편집 | ✎ 힌트 | — |

**분배·옵션 배지 (read-only)** — 실제 입력된 비기본 옵션만 표시 (자산 탭 `isActiveData` 정책 동형):

| 배지 | 노출 조건 | tone |
|---|---|---|
| `배우자 외 1명` 등 분배 요약 + 합계 상태 | `heirAllocations?.length > 0` — 첫 분배자 `heirShortLabel` + 나머지 인원수. 분배 합계 === amount면 ✓ emerald, 불일치면 △ amber (C-6) | emerald / amber |
| `봉안` | category === "funeral" && isBongan === true | emerald |
| `§22 차감` | category === "financial" && (isFinancialDebtForDeduction ?? true) === true — **financial 기본 true는 비기본 옵션이 아니므로, 명시 false일 때만 `§22 제외` 배지를 표시하는 안을 채택** (기본값 표시는 노이즈) | rose |
| `Table C` | creditorAddress 또는 incurredDate 입력됨 | slate |

배지 derive는 `DebtItemTableView` 내 순수 함수 `resolveDebtChips(item, heirs)`로 두되, 분배 합계 일치 판정은 `HeirAllocationInput`이 쓰는 동일 술어(`allocations.reduce(sum) === expectedTotal`)를 따른다. 별도 판정 로직 재정의 금지 ([[feedback_ui_engine_dual_truth_avoidance]]).

**행 인터랙션** (선행 사례 그대로):
- `<tr role="button" tabIndex={0}>` + Enter/Space — 라디오 컬럼 없음
- `data-testid={`debt-table-row-${item.id}`}` (동적) — E2E는 `locator('tr[role="button"]')` 또는 정규식으로 조회 ([[project_heir_composition_table_modal_view]] TV-1 함정)
- items.length === 0이면 테이블 미렌더 → 기존 빈 상태 안내 문구(:212-216) 유지

---

## 5. 편집 모달 (DebtItemEditor + Dialog)

`PropertyValuationForm.tsx:196-237`의 Dialog 오케스트레이션을 그대로 차용.

- **모달 내용물** = 기존 항목 카드 body(:226-330) 이동: 카테고리 칩 + name input + CurrencyInput(amount) + (funeral) 봉안 ToggleCard + §22 ToggleCard + Table C 그리드 + `HeirAllocationInput`. **입력 위젯 변경 0** — 위치만 카드→모달.
- **DialogTitle**: `{CATEGORY_STYLES[category].label} 편집` (예: "공과금 편집"). 모달 안 카테고리 칩은 타이틀과 중복되므로 제거 (자산 탭 `hideTitle` 결정 동형 — 단 여기는 칩 1개뿐이라 그냥 미렌더).
- **모달은 "닫기"만**: 실시간 `onUpdate` 반영 — 저장/취소·폐기확인 불필요. `max-h-[80vh] overflow-y-auto`.
- **삭제**: 모달 푸터에 삭제 버튼(rose-600) — 기존 카드의 ✕(:248-255)이 모달로 이동. 삭제 시 `setSelectedItemId(null)` → 모달 자동 닫힘 (E-2).
- **추가 직후 자동 선택** (E-1): 카테고리별 추가 버튼 4개(:337-351)는 본체 하단에 유지하되, `add(category)`가 `setSelectedItemId(newItem.id)`까지 수행 → 모달 자동 오픈.
- **선택 상태는 로컬 useState** — zustand 금지 (UI ephemeral, [[feedback_zustand_selector]]).
- 중첩 Dialog 없음 (C-3) → 자산 탭의 R-4 리스크 해당 없음.

---

## 6. 구현 순서

1. **`DebtItemEditor.tsx` 분리** — 기존 카드 body 추출 (로직 무변경). `CATEGORY_STYLES` export 승격.
2. **`DebtItemTableView.tsx` 신설** — 행·배지·키보드 인터랙션.
3. **`DebtAllocationInput.tsx` 리팩터** — 카드 map(:219-332) 제거 → 테이블 + Dialog. add에 자동 선택 추가. 담보카드·안내카드·추가버튼·합계 요약 보존.
4. **vitest 컴포넌트 anchor** — `__tests__/components/debt-item-table-view.test.tsx` 신설: 배지 derive(분배 ✓/△·봉안·§22 제외·Table C) 케이스 매트릭스 + 빈 상태.
5. **E2E 신규 spec** — `e2e/debt-item-table-view.spec.ts`: 토글 ON → 공과금 추가 → 모달 자동 오픈 확인 → 이름·금액·분배 입력 → 닫기 → 행 요약(이름·금액·✓ 배지) → 행 클릭 재편집 → 모달 내 삭제 → 행 소멸.
6. **회귀**: `npx playwright test inheritance-collateral-debt inheritance-collateral-debt-buppyo3` + `npm test` (IDA anchor 22건 포함 — 엔진 무변경이므로 전건 통과 기대이나 [[pre-do-anchor-verification]]에 따라 실행으로 확인).

검증 게이트: `npx tsc --noEmit` 0건 · lint 0건 · 신규 E2E 직접 실행 (UI 시니어 "spec 통과" 보고 신뢰 금지 — [[feedback_browser_verify_with_playwright]]).

---

## 7. 케이스 매트릭스 (테이블 행 표시)

| # | 입력 상태 | 분류 칩 | 이름 컬럼 | 금액 | 배지 |
|---|---|---|---|---|---|
| M-1 | 공과금, name="주택분 재산세", 2.5M, 배우자 2.5M 분배 | 공과금(amber) | 주택분 재산세 | 2,500,000 | `배우자 ✓`(emerald) |
| M-2 | 금융채무, name 빈값, 400M, 분배 없음 | 금융채무(rose) | 금융채무 (fallback) | 400,000,000 | 없음 (§22 기본 true는 미표시) |
| M-3 | 금융채무, §22 명시 false | 〃 | 〃 | 〃 | `§22 제외`(rose) |
| M-4 | 장례비, isBongan=true, 15M | 장례비(emerald) | (이름 or fallback) | 15,000,000 | `봉안`(emerald) |
| M-5 | 사적채무, 분배 합계 ≠ 금액 (100 중 70만 분배) | 사적채무(violet) | 〃 | 100 | `… △`(amber) |
| M-6 | 공과금, creditorAddress="시청"만 입력 | 공과금 | 〃 | 〃 | `Table C`(slate) |
| M-7 | amount=0 | 〃 | 〃 | 미입력(gray) | — |
| M-8 | items=[] (ON 모드 빈 상태) | 테이블 미렌더 — 기존 안내 문구만 | | | |

vitest anchor는 M-1~M-8 전건.

---

## 8. E2E 영향 실측 (2026-06-11)

`grep -rln "금융채무 추가|공과금 추가|사적채무 추가|장례비 추가|채권자·내용" e2e/` → **0건**. 채무 항목 카드 내부 구조에 의존하는 기존 spec이 없다.

채무 UI를 건드리는 spec은 2개뿐이며, 둘 다 **보존 영역**(협의분할 토글 텍스트 + 담보채무 read-only 카드 텍스트)만 사용:

| spec | 의존 셀렉터 | 영향 |
|---|---|---|
| `e2e/inheritance-collateral-debt.spec.ts` | `getByText("채무·공과·장례비 협의분할 입력")` 토글(:55,:80) + `getByText("자산 평가에서 반영된 담보채무 (§14 자동 공제)")`(:59,:84) | **무영향** — 토글은 steps.tsx, 담보카드는 본체 유지 |
| `e2e/inheritance-collateral-debt-buppyo3.spec.ts` | §14 토글 + 결과 화면 텍스트(:57,:66) | **무영향** — 입력 항목 미사용 |

vitest도 `DebtAllocationInput` 직접 렌더 테스트 0건 (grep 실측). `deduction-besshi-data.test.ts` 등은 DebtItem **데이터** 단위 — UI 무관.

---

## 9. 리스크

| # | 리스크 | 완화 |
|---|---|---|
| R-1 | 분배 상태 배지(C-6)가 HeirAllocationInput 검증과 다른 판정으로 drift | 합계 비교 술어를 한 곳(순수 함수)으로 두고 양쪽 import. anchor M-1·M-5로 고정 |
| R-2 | 모달 이동 후 SelectOnFocusProvider·EnterKeyNavigationProvider 동작 | Dialog 내부도 동일 Provider 트리 하위 — 자산 탭 모달에서 이미 검증됨. E2E에서 입력 동작으로 재확인 |
| R-3 | `CATEGORY_STYLES` export 승격 시 lint-staged `--fix` 미사용 import 동반 제거 함정 | 신규 import는 한 라인 한 named ([[CLAUDE.md ESLint --fix 함정]]) |
| R-4 | 추가 직후 자동 모달이 기존 사용 흐름(연속 추가) 저해 | 자산 탭·상속인에서 이미 채택된 UX — 모달 닫기 후 추가 버튼이 본체 하단에 그대로 있어 연속 추가 동선 유지 |

---

## 10. 완료 기준 (Definition of Done)

- [ ] 3파일 구조 (오케스트레이터 + TableView + Editor), 각 800줄 이하
- [ ] public props 무변경 (steps.tsx diff 0)
- [ ] 케이스 매트릭스 M-1~M-8 vitest anchor 통과
- [ ] 신규 E2E `debt-item-table-view.spec.ts` 직접 실행 통과
- [ ] 회귀: collateral 2 spec + `npm test` (IDA 22 anchor 포함) 통과
- [ ] `npx tsc --noEmit` 0건 · `npm run lint` 0건
- [ ] grep 자가점검: 행에 `debt_` 내부 id 미노출 · native checkbox/radio 신규 0건
