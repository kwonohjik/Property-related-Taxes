# 수정 계획서 — 협의분할 직접 입력 3건 (비영리법인 노출·기본값 제거·2열 배치)

> 대상 화면: 자산/채무 카드 "협의분할 직접 입력" 모달 (`HeirAllocationInput`)
> 인터뷰 확정(2026-06-09): 이슈1=**최소 엔진 수정 포함**, 이슈2=ON 시 미선택·선택 시 전액, 이슈3=**2열 그리드+선택칸 칩 아래**.

## 1. 목표 / 비목표

**목표** — 협의분할 직접 입력 모달의 3개 결함 수정:
1. **비영리법인 수유자 누락** — 현재 필터가 전체 `corporate`를 제외해 비영리법인(상속세 납세의무자)까지 안 보임 → 영리법인만 제외하도록 정정 + 엔진 per-heir 배부가 비영리법인을 수유자처럼 과세하도록 최소 수정.
2. **기본 자동 배정 제거** — 토글 ON 시 첫 상속인에게 전액 자동 배정되는 동작 제거. ON 시 아무도 미선택, 사용자가 1명 선택하면 그 사람에게 평가액 전액 자동 입력(기존 잔여금액 로직), 다수 선택·금액 수정 가능.
3. **1행 2명 배치** — 1행 1명 → 2열 그리드. 선택된 항목은 금액 입력칸을 칩 **아래**에 표시(폭 압박 없음).

**비목표**:
- §16 공익법인 출연재산 불산입 로직 변경(이미 별도 비과세 체크리스트 `inh_public_interest`로 구현·독립 동작 — 본 작업과 무관).
- 영리법인 면제(§3의2②)·perCorporate 배부·corporateGiftTaxBase 경로 변경.
- 법정상속분·세대생략·인적공제·가업상속의 corporate 제외(비영리법인도 해당 없음 — §3 참조).

## 2. 핵심 사실 (실측 — 추정 금지)

### 2.1 영리/비영리 구분은 이미 존재
`HeirComposition.tsx:484-487`:
- `relation === "corporate"` + `isForProfit !== false`(undefined/true) = **영리법인** (기본 ON)
- `relation === "corporate"` + `isForProfit === false` = **비영리법인**

### 2.2 현행 협의분할 필터는 전체 corporate 제외 (버그)
- `HeirAllocationInput.tsx:32` `hasDistributableHeir`: `heirs.some((h) => h.relation !== "corporate")`
- `HeirAllocationInput.tsx:96` `distributableHeirs = heirs.filter((h) => h.relation !== "corporate")`
→ 비영리법인까지 제외 = 이슈1 버그.

### 2.3 엔진은 모든 corporate를 영리법인으로 취급 (per-heir 오류)
`inheritance-allocation.ts`:
- `:466` `if (heir.relation === "corporate") continue;` — 직접배부 과세표준 집계 제외
- `:483` `const isCorporate = heir.relation === "corporate";` → 분기에서 `directEstateAmount:0`, `taxableValueShare:giftAmount`(사전증여만), **`finalTax:0`**
- `:626` `nonCorp = heirs.filter((h) => h.relation !== "corporate" && perHeir[h.id])` — floor 잔액 흡수자 후보
- `:664` `if (heir.relation === "corporate") continue;` — categoryBreakdown·grossInheritance 후입력 제외

→ 비영리법인을 협의분할에 넣고 금액 배정해도 엔진이 무시(finalTax=0)하고, 그 portion이 간접배부로 자연인에게 잘못 분산됨. **UI만 고치면 숫자가 틀림** → 엔진 최소 수정 필수(인터뷰 확정).

### 2.4 `isForProfit`은 엔진 계산에서 미사용
`grep` 결과 엔진 내 `isForProfit` 사용처는 타입 정의 1곳뿐(`inheritance-gift.types.ts:712`). → 비영리법인은 자동 면제 경로에 없음(corporateGiftTaxBase/corporateExemption는 영리법인 사전증여·유증 입력에서만 채워짐). 따라서 allocation.ts 분기만 게이팅하면 비영리법인이 정상 과세됨.

## 3. corporate 분기 분류 (엔진 전체 enumerate)

| 위치 | 현행 | 처리 | 사유 |
|---|---|---|---|
| `inheritance-allocation.ts:466` | 전체 corporate 제외 | **`isForProfitCorporate` 게이팅** | 비영리법인 직접배부 과세표준 집계 포함 |
| `inheritance-allocation.ts:483` | 전체 corporate 영리분기 | **`isForProfitCorporate` 게이팅** | 비영리법인 → 자연인(수유자) 분기로 정상 과세 |
| `inheritance-allocation.ts:626` | `relation !== "corporate"` | **`!isForProfitCorporate`** | 비영리법인도 흡수자 후보(과세되므로) |
| `inheritance-allocation.ts:664` | 전체 corporate 제외 | **`isForProfitCorporate` 게이팅** | 비영리법인 categoryBreakdown·grossInheritance 후입력. ★실측: 자연인 분기 perHeir(597-618)는 두 필드 **미포함**(optional) → 664 loop 후입력에 의존. 비영리법인이 자연인 분기로 가면 664 ungate 없이는 두 필드 undefined(크래시는 없으나 결과표 누락). ungate 필수 |
| `inheritance-legal-share.ts:37` | 전체 corporate 제외 | **유지** | 법인은 법정상속인 아님(민법) — 영리·비영리 무관, 유증만 받음 |
| `inheritance-generation-skip.ts:108` | 전체 corporate 제외 | **유지** | 법인은 세대 개념 없음 |
| `inheritance-tax.ts:643` | corporateId 매칭 | **유지** | 영리법인 전용 배부 입력 경로(perCorporate) — 비영리법인 미진입 |
| `deductions/inheritance-deductions.ts:457` | legatee·corporate 제외 | **유지** | 인적공제는 자연인 상속인 전용 |
| `deductions/personal-deduction-calc.ts:341` | legatee·corporate 제외 | **유지** | 동상 |
| `deductions/family-business-autoderive.ts:198,211` | corporate 제외 | **유지** | 가업상속 자동선택 자연인 전용 |

→ 실제 엔진 변경은 **`inheritance-allocation.ts` 4곳에 집중**(단일 파일).

## 4. 단일 진실 predicate 설계 (dual-truth 방지)

UI·엔진이 같은 "영리법인" 판정을 공유해야 함([[feedback_ui_engine_dual_truth_avoidance]] · [[feedback_enum_substring_match_forbidden]]).

**신규 헬퍼** — `lib/tax-engine/inheritance-gift-common.ts`(순수 엔진, UI import 허용·역방향 금지):
```ts
/** 영리법인 수유자 판정 — relation === "corporate" AND isForProfit !== false(기본 영리).
 *  비영리법인(isForProfit === false)은 false → 협의분할 대상·수유자 과세. */
export function isForProfitCorporate(h: Pick<Heir, "relation" | "isForProfit">): boolean {
  return h.relation === "corporate" && h.isForProfit !== false;
}
```
- UI(`HeirAllocationInput.tsx`)·엔진(`inheritance-allocation.ts`) 양쪽 import → 판정 단일화.
- `HeirComposition.tsx:486` `checked={heir.isForProfit !== false}`와 동일 기준(영리 기본).

## 5. 변경 파일

### 5.1 엔진 (시퀀셜 선처리)
| 파일 | 변경 |
|---|---|
| `lib/tax-engine/inheritance-gift-common.ts` | `isForProfitCorporate` 신규 export |
| `lib/tax-engine/inheritance-allocation.ts` | `:466 :483 :664` → `isForProfitCorporate(heir)`, `:626` → `!isForProfitCorporate(h)` |

### 5.2 UI
| 파일 | 변경 | 이슈 |
|---|---|---|
| `HeirAllocationInput.tsx:31-33` `hasDistributableHeir` | `!isForProfitCorporate(h)` | 1 |
| `HeirAllocationInput.tsx:96` `distributableHeirs` | `heirs.filter((h) => !isForProfitCorporate(h))` | 1 |
| `HeirAllocationInput.tsx:40-48` `buildInitialHeirAllocations` | **Option X**: 시그니처 `(heirs, _effectiveValuation?)` **유지**, body만 `return []`(전액 자동배정 제거). param `_` prefix로 unused-lint 회피 | 2 |
| `HeirAllocationInput.tsx:195-245` 행 컨테이너 | `space-y-1.5` → `grid grid-cols-1 sm:grid-cols-2 gap-2`. 각 셀: 칩(상단) + 선택 시 금액·면적 입력(칩 아래, `mt-1.5`) | 3 |
| `HeirAllocationToggleSection.tsx:58` | **무변경** — `buildInitialHeirAllocations(heirs, effectiveValuation)` 그대로(body가 []반환) | 2 |
| `estate-card/handleChipClick.ts:88` | **call 무변경**(`buildInitialHeirAllocations(heirs, eff)` 유지 → eff 계속 사용·cascade 없음). stale 주석 "첫 자연인 amount:0 1행으로 시작" → "빈 배열로 시작"으로 갱신 | 2 |

> **Option X 채택 사유(STEP3 모순 #6)**: `eff`(handleChipClick:90)는 `createChipClickHandler` **config 인자 `effectiveValuation`(:48 destructure) 단독 사용**(실측 `grep`). eff 제거 시 그 config 인자까지 미사용화 → 팩토리 인터페이스 + 호출처 cascade. → `buildInitialHeirAllocations` 시그니처를 **유지**하고 body만 `[]` 반환하면 두 호출처(ToggleSection·handleChipClick) **모두 무변경**, eff 계속 사용. blast radius 최소.
>
> **blast radius (의도된 전파 — 실측 확정)**: `HeirAllocationInput`은 5곳 재사용. 모두 `heirs` **전체**를 전달함을 실측:
> - 자산 `HeirAllocationToggleSection.tsx:67` `heirs={heirs}`
> - 채무 `DebtAllocationInput.tsx:324` `heirs={heirs}`
> - 추정상속 `PresumedInheritanceInput.tsx:247` `heirs={heirs}`
> - 인라인 `EstateChipInlineExpand`(→ ToggleSection 경유)
>
> → 내부 `distributableHeirs` 필터 변경이 5곳 모두에 **일관 전파**. 비영리법인 포함·2열·기본값 제거가 자산·채무·추정상속 분배에 동일 적용(정합).

## 6. 케이스 매트릭스

| 상속인 종류 | 협의분할 목록 노출 | 협의분할 배정 시 per-heir |
|---|---|---|
| 자연인(배우자·자녀 등) | ✓ | 정상 과세(기존) |
| 수유자(legatee) | ✓ | 정상 과세(기존) |
| **비영리법인**(corporate+isForProfit=false) | **✓ 정정** | **수유자처럼 정상 과세(정정)** |
| 영리법인(corporate+isForProfit≠false) | ✗ 제외(유지) | finalTax=0·별도 면제(유지) |

이슈2 동작:
| 단계 | 동작 |
|---|---|
| 토글 ON | `heirAllocations: []` (아무도 미선택·금액칸 없음) |
| 1명 선택 | `toggleHeir` → `remaining = max(0, expectedTotal − 0) = expectedTotal` 전액 자동입력 |
| 추가 선택 | `remaining = expectedTotal − currentSum` 잔여 자동입력(기존 로직) |
| 금액 수정 | `updateAmount` 자유 편집(기존) |
| 전체 해제 | 마지막 해제 시 `onChange(undefined)` → 토글 OFF (R-1 결정: 기존 `toggleHeir` 유지. §10 R-1) |

## 7. Pre-Do probe (Do 전 실측 — 강제)

**엔진 probe** (= 엔진 설계 §6 P-1~P-4, 번호 정합):
- **P-1 (RED→GREEN)**: 비영리법인(corporate, isForProfit=false) 1명 + 자연인 1명, 자산에 비영리법인 협의분할 배정. 수정 **전** `perHeir[비영리id].finalTax === 0`(버그) 확인 → 수정 **후** `finalTax > 0` + `directEstateAmount === 배정액`.
- **P-2 (회귀)**: 영리법인(isForProfit≠false) 동일 시나리오 → 수정 후에도 `finalTax === 0` 불변·면제 echo 불변.
- **P-3 (총액 보존)**: Σ perHeir.finalTax + 영리법인 면제 = 총 산출세액 정합(잔액 흡수 `:626` 포함).
- **P-4 (categoryBreakdown)**: 비영리법인 `categoryBreakdown` 비-empty·`grossInheritance > 0`(`:664` ungate 효과).

**UI probe**:
- **PU-1 (UI 노출)**: 비영리법인이 `distributableHeirs`에 포함, 영리법인은 제외.
- **PU-2 (기본값)**: `buildInitialHeirAllocations(heirs, _eff)` body → `[]`. 토글 ON 직후 `heirAllocations === []`, 칩 1개 클릭 시 전액. **칩-자동-ON(handleChipClick)도 빈 배열 시작**(동작 변경 — 기존 "첫 자연인 1행"에서 변경).

## 8. 동기화 지점 (UI 8개 중 해당)

| # | 지점 | 변경 |
|---|---|---|
| ⑤ UI 위젯 | `HeirAllocationInput` 필터·레이아웃·초기값 | **본 작업** |
| ⑥ 사이드바 합계 | `computeInheritanceSummary`(평가 합산) | 무변경(분배는 합계 불변) |
| ⑦ 결과 카드 | `EstateAllocationTable`·per-heir 결과뷰 | 비영리법인 행 표시 확인(엔진 finalTax 반영 — 추가 코드 불요, 데이터 흐름 검증) |
| ⑧ Validation | `inheritance-validate.ts:140` `validateEstateItemAllocations` + `:160` `validateDebtItemAllocations` + `:175` `validatePresumedItem` | 무변경(heirId 무관 합계 검증) — `[]`(ON 빈)은 `:141` `length === 0 → return null` 통과(실측) |

> 엔진 input/result 타입 **무변경**(새 필드 없음) → ①②③④⑨~⑭ 해당 없음. `isForProfit`은 기존 필드.

## 9. 테스트 설계 (anchor)

**엔진 anchor** `__tests__/tax-engine/inheritance/nonprofit-heir-allocation.test.ts`(엔진 설계 §7 단일 체계 A-1~A-5):
- A-1: `isForProfitCorporate` — 영리(true)·비영리(false)·자연인(false)·legatee(false).
- A-2 (P-1): 비영리법인 협의분할 배정 → `finalTax > 0` + `directEstateAmount === 배정액`(원단위 anchor).
- A-3 (P-2): 영리법인 동일 시나리오 → `finalTax === 0` 불변(회귀 가드).
- A-4 (P-3): 총액 보존 Σ perHeir.finalTax + 영리법인 면제 = 총 산출세액 정합.
- A-5 (P-4): 비영리법인 `categoryBreakdown` 비-empty·`grossInheritance > 0`.

**UI anchor** `__tests__/components/calc/inheritance/heir-allocation-*.test.tsx`(기존 보강 — 엔진과 번호 분리):
- U-1: `distributableHeirs`에 비영리법인 포함·영리법인 제외.
- U-2: 토글 ON → `heirAllocations === []`(빈), 칩 클릭 → 전액. 칩-자동-ON(handleChipClick)도 빈 시작.
- U-3: 2열 그리드 렌더(`grid-cols` className 또는 testid 구조) — 기존 `heir-allocation-unified-row.test.tsx` 갱신.

회귀: 기존 협의분할·DebtAllocation·Presumed 테스트 전부 통과. 전체 `npm test` + E2E 상속세 협의분할 경로.

## 10. 리스크 / Out of scope

- **R-1 (전체 해제 동작) — 결정**: `toggleHeir`(`:99-102`) 마지막 해제 시 `onChange(next.length > 0 ? next : undefined)` → `undefined`(OFF). 이슈2 초기상태(ON 빈 `[]`)와는 별개 경로. **결정: 기존 `undefined`(OFF) 유지** — 사용자가 마지막 1명까지 명시 해제 = 협의분할 OFF 의도로 해석. 초기 ON 빈([])과 deselect-all→OFF는 모순 아님(전자=진입, 후자=명시 해제). `toggleHeir` 미변경.
- **R-2 (3-state 정합)**: `heirAllocations: undefined`(OFF)/`[]`(ON 빈=법정상속분)/`[...]`(ON 데이터). ToggleCard `checked={!!item.heirAllocations}` → `!![]===true` ON 유지([[feedback_three_state_optional_mode_toggle]]).
- **R-3 (결과뷰 비영리법인 행)**: per-heir 결과 테이블이 corporate 행을 별도 렌더하는지(영리법인 면제 표시) 확인 — 비영리법인이 자연인 행으로 정상 표시되는지 Do 시 검증.
- **OOS**: §16 불산입 연동, 영리법인 면제 로직, 비영리법인 §48 사후관리.

## 11. DoD
- [ ] `isForProfitCorporate` 단일 진실(UI·엔진 공용 import).
- [ ] allocation.ts 4곳 게이팅, 그 외 corporate 분기 6곳 무변경(§3 표).
- [ ] P-1~P-4 probe 실측(비영리 finalTax>0·영리 0 불변).
- [ ] 이슈2 ON 빈 배열·선택 시 전액·다수 편집.
- [ ] 이슈3 2열 그리드·선택칸 칩 아래.
- [ ] `tsc` 0 + 신규 anchor + 전체 `npm test` + E2E.
- [ ] 브라우저/E2E 수동 확인(토글 ON→미선택→선택→전액, 비영리법인 노출).
