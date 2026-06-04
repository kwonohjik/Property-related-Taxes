# 영농상속공제 법령정합 보완 — 엔진 설계

> 짝 계획서: [`docs/00-pm/inheritance-farming-deduction-enhancement.plan.md`](../../00-pm/inheritance-farming-deduction-enhancement.plan.md)
> 설계 결정 확정 (사용자 2026-06-04): **D-1 연도별 한도 적용** · **D-2 담보채무 시행시기 게이트 적용**
> 정책: [[feedback_historical_tax_tables]] · [[feedback_api_date_serialize]] · [[mirror-pattern]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[pre-do-anchor-verification]]
> 법령: 상증법 §18의3 (mst 276123) · 상증령 §16 (mst 283637, 시행 20260227) — KoreanLaw 직접 조회 검증

## Context

영농상속공제는 기구현(자격판정·담보차감·법인 사업무관자산·사후관리·거주지 자동검증·상속인별 평가). 본 설계는 **법령정합 갭 8건(G1~G8)** 중 엔진 변경분만 명세한다. 핵심 2건:
- **G1 연도별 한도**: `calcFarmingDeduction`에 `deathDate?: string` 추가 → `resolveFarmingDeductionLimit`로 historical 한도.
- **G3 담보채무 시행시기**: `suggestFarmingAssetValue`에 `deathDate?: string` 추가 → `deathDate >= "2026-02-27"`일 때만 차감.

**string 비교 강제** ([[feedback_api_date_serialize]] · 기존 `cohabitShareRate(deductions.ts:89)` 패턴): `deathDate`는 `Date`가 아닌 `string`(YYYY-MM-DD). `new Date()`·`parseISO`·숫자 비교 금지.

**충실도 vs numeric 분리** ([[feedback_numeric_impact_verify_before_bug_claim]]): G2(총수입 라벨)·G5(자산 안내)는 numeric 무영향(boolean·텍스트) → 엔진 변경 없음, reason 문자열만. G1·G3·G4만 numeric.

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

> 행 1개 = anchor 1개 이상. 테스트 파일: `__tests__/tax-engine/inheritance/farming-deduction.test.ts`(확장) + 통합 `farming-limit-and-mortgage.test.ts`(신규).

| # | 시나리오 | 법령 근거 | anchor 출처 | 상태 |
|---|---|---|---|---|
| **FE-char** | characterization = **기존 FD-3 재사용**(`calcFarmingDeduction(5_000_000_000, personalOk())`→30억) — 현행 동결 확인 | 현행 동결 | farming-deduction.test.ts:73 (기존) | ☐ |
| FE-1 | deathDate 2024 + 50억 → cap **30억** | §18의3① | 자체 계산 | ☐ |
| FE-2 | deathDate 2020 + 50억 → cap **15억** | 부칙(★Phase A 확정) | 부칙 조회 | ☐ |
| FE-3 | deathDate 2014 + 10억 → cap **5억** | 부칙 | 부칙 조회 | ☐ |
| FE-4 | 경계 2023-01-01 → 30억 / 2022-12-31 → 15억(또는 20억) | 부칙 | 부칙 조회 | ☐ |
| FE-5 | deathDate=undefined(legacy) → 30억 + `appliedLimit=30억` | 하위호환 | 자체 | ☐ |
| **FM-char** | characterization: 현 2-param `suggestFarmingAssetValue([10억·저당2억])` → **8억** | 현행 동작 동결 | 현 구현 실측 | ☐ |
| FM-1 | deathDate 2026-03 + 10억·저당2억 → **8억**(차감) | §16⑤1호 | 자체 | ☐ |
| FM-2 | deathDate 2025-12(시행전) + 10억·저당2억 → **10억**(미차감) | 부칙5 | 자체 | ☐ |
| FM-3 | deathDate=undefined → 차감 8억(legacy 보존) | 하위호환 | 자체 | ☐ |
| FU-1 | farmingUsedTwoYears=false 자산 → suggest 합산 제외 | §16⑤1호 | 자체 | ☐ |
| FU-2 | farmingUsedTwoYears 미입력(default) → 합산 | 하위호환 | 자체 | ☐ |
| FG-1 | hasDisqualifyingIncome=true → 공제 0 + reason "§16⑭1호" | §16⑭1호 | reason 문자열 | ✅ |
| **FG-2** | hasDisqualifyingGrossReceipt=true 단독 (hasDisqualifyingIncome=false) → 공제 0 + reason "§16⑭2호" | §16⑭2호 (KoreanLaw 검증 2026-06-04) | farming-deduction.test.ts | ☐ |
| **FG-3** | hasDisqualifyingIncome=false + hasDisqualifyingGrossReceipt=false → 정상 공제 | §16⑭ 미해당 | farming-deduction.test.ts | ☐ |
| **FG-heir** | heirAssessment.hasDisqualifyingGrossReceipt=true → 해당 heir 결격 | §16⑭2호 heir 단위 | farming-deduction.test.ts | ☐ |
| **FU-자동충족** | farmingUseStartDate = deathDate 3년 전 → twoYearsBefore 충족 → suggest 합산 | §16⑤1호 (조심2014중4319) | farming-limit-and-mortgage.test.ts | ☐ |
| **FU-자동제외** | farmingUseStartDate = deathDate 1년 전 → twoYearsBefore 미충족 → suggest 제외 | §16⑤1호 | farming-limit-and-mortgage.test.ts | ☐ |
| **FU-fallback** | farmingUseStartDate 미입력 + farmingUsedTwoYears=false → 수동 fallback 제외 | §16⑤1호 하위호환 | farming-limit-and-mortgage.test.ts | ☐ |
| **FU-혼합** | 자산 2건: 1건 자동충족(3년전) + 1건 자동제외(1년전) → 1건만 합산 | §16⑤1호 복합 | farming-limit-and-mortgage.test.ts | ☐ |
| FD-회귀 | 기존 FD-1~21·FH-1~6·E-1~7 GREEN (deathDate 미전달 경로) | 회귀 | 기존 | ☐ |
| INT-1 | deathDate 2020 + 영농 18억(저당1억 미차감) + 일괄공제 → 한도 15억 적용 산출세액 원단위 | 파이프라인 | 자체 통합 | ☐ |

## 법령 근거 (KoreanLaw 직접 조회)

- **상증법 §18의3①**: 영농상속 재산가액(**30억 한도**) 과세가액 공제. 연도별 한도는 부칙 경과규정 (★Do Phase A 연혁법령 직접 조회로 2/5/15/30 경계·"20억" 구간 동결 — 현재 NOT_FOUND, 미동결).
- **상증령 §16⑤1호**(시행 20260227): 영농상속재산가액 = "피상속인이 **상속개시일 2년 전부터 영농에 사용한** 자산의 가액에서 해당 자산에 **담보된 채무액을 뺀** 가액". 담보채무 차감은 부칙5 — **2026.2.27 이후 상속분부터**.
- **상증령 §16⑭**: 영농 부정 — 1호 사업소득금액+총급여 3,700만 이상 / **2호 총수입금액 §208⑤2호 이상**(2026.2.27 신설).

## 엔진 input 타입 변경

```typescript
// lib/tax-engine/deductions/inheritance-farming-deduction.ts
//   4번째 param deathDate?: string 신규 (legacy: undefined → 30억)
export function calcFarmingDeduction(
  farmingAssetValue: number,
  farming?: FarmingInheritanceInput,
  estateItems?: EstateItem[],
  deathDate?: string,            // ★신규 — YYYY-MM-DD string (Date 변환 금지)
): { deduction: number; breakdown: CalculationStep[]; detail: FarmingDeductionDetail };

// lib/calc/inheritance-deduction-suggest.ts
//   3번째 param deathDate?: string 신규 (legacy: undefined → 차감)
export function suggestFarmingAssetValue(
  estateItems: EstateItem[],
  farming?: { qualifiedHeirIds?: string[] },
  deathDate?: string,            // ★신규 — 담보 시행시기 게이트
): DeductionSuggestion;

// lib/tax-engine/types/inheritance-gift.types.ts — EstateItem 확장
interface EstateItem {
  // ... 기존
  farmingUsedTwoYears?: boolean; // ★신규 §16⑤1호. undefined=충족 가정(legacy), false=제외
}
```

> **FarmingInheritanceInput 확장 없음**: G2 총수입금액은 boolean `hasDisqualifyingIncome` 재사용(라벨·reason만, D-3 1단계). numeric 무영향.

## 엔진 result 타입 변경

```typescript
// FarmingDeductionDetail (inheritance-farming.types.ts) — appliedLimit만 추가
interface FarmingDeductionDetail {
  // ... 기존 (eligible·evaluated·appliedAssetValue·cappedDeduction·qualifiedHeirCount·residence 등)
  appliedLimit?: number;         // ★신규(optional — Do deviation: legacy detail mock 호환). resolveFarmingDeductionLimit(deathDate). 엔진은 반환 3곳 항상 채움, 결과 카드 `|| 3_000_000_000` fallback. cappedDeduction = min(appliedAssetValue, appliedLimit)
  // ★securedDebtApplied 미추가 (R3) — 담보차감은 suggest 소관, 엔진은 net farmingAssetValue만 수신
}
// ★D1: detail 반환 3곳(미충족 line250·0자산 line267·정상 line291) 모두 appliedLimit 채움.
// ★D3: cappedDeduction 주석(line116) "min(appliedAssetValue, FARMING_MAX)" → "min(appliedAssetValue, appliedLimit)" 갱신.
```

## 계산 알고리즘 (단계별)

### A. 연도별 한도 (G1)

```typescript
// 신규 lib/tax-engine/data/farming-deduction-limit.ts (★Phase A 부칙 동결 후 상수화)
function resolveFarmingDeductionLimit(deathDate?: string): number {
  if (!deathDate) return FARMING_MAX;                   // 30억 (legacy)
  if (deathDate >= "2023-01-01") return 3_000_000_000;  // 30억
  if (deathDate >= "2016-01-01") return 1_500_000_000;  // 15억 (★20억 구간 Phase A 확정)
  if (deathDate >= "2012-01-01") return   500_000_000;  // 5억
  return 200_000_000;                                    // 2억
}
// calcFarmingDeduction 본문 — limit는 함수 상단 1회 산출 (반환 3곳 공유):
const limit = resolveFarmingDeductionLimit(deathDate);
const capped = Math.min(safeAssetValue, limit);         // line 280 교체 (floor 불필요)
// ★D1: detail.appliedLimit = limit 을 반환 3곳 모두에 추가:
//   미충족(line 250) appliedLimit: limit (cappedDeduction: 0 유지)
//   0자산(line 267)  appliedLimit: limit
//   정상(line 291)   appliedLimit: limit (cappedDeduction: capped)
```

### B. 담보채무 시행시기 게이트 (G3) — suggestFarmingAssetValue 내부

```typescript
// line 374 itemMortgage 결정에 게이트 추가:
const applyMortgage = deathDate === undefined || deathDate >= "2026-02-27";  // 부칙5
let itemMortgage = applyMortgage ? (item.mortgageAmount ?? 0) : 0;
// 미적용 시 notes.push("ℹ️ 2026.2.27 이전 상속 — 담보채무 차감 비적용(시행령 부칙5)")
```

### C. 2년 영농사용 필터 (G4) — suggestFarmingAssetValue eligible 필터

```typescript
// line 346 필터 확장:
const eligible = estateItems.filter((i) => {
  if (i.farmingCategory === undefined) return false;
  if (i.farmingCategory === "fishing_right" && i.fishingLicenseExcluded === true) return false;
  if (i.farmingUsedTwoYears === false) return false;    // ★§16⑤1호 (undefined=충족 가정)
  return true;
});
// 제외 시 notes.push("ℹ️ '2년 전부터 영농 사용' 미충족 N건 제외 (§16⑤1호)")
```

### D. 총수입금액 라벨 (G2) — evaluateFarmingEligibility reason 문자열

```typescript
// line 69 reason push 문자열 교체 (numeric 무영향):
reasons.push("§16⑭ — 사업소득금액+총급여 3,700만(1호) 또는 총수입금액 기준(2호) 초과 — 직접 종사 부정");
```

## Silent fallback / 자동 안분 후보 식별

| 후보 | 처리 | 근거 |
|---|---|---|
| `deathDate=undefined` → 30억·담보 차감 | **legacy 허용** (자동 안분 아님 — 하위호환) | FE-5·FM-3 anchor 보존 |
| `farmingUsedTwoYears=undefined` → 충족 가정(합산) | **legacy 허용** | FU-2. false 명시만 제외 |
| **직접 입력 우회 (R4)**: `farmingAssetValue` 직접 입력 시 담보게이트·2년필터 미적용 | suggest 미경유 — **사용자 책임**, validate(⑧) 안내. 자동 보정 금지([[feedback_no_silent_apportion_fallback]]) | steps.tsx:448 autoFill 아키텍처 |
| 한도 경계 미동결 | **Phase A 부칙 조회 전 상수화 금지** | NOT_FOUND 상태 |

## floor vs round

- 한도 cap = `Math.min(safeAssetValue, limit)` — floor/round 무관(정수 비교).
- 담보차감 = `Math.max(0, totalValue - totalMortgage)` — 정수 가감, round 없음.
- 자산별 담보 비율 차감(자격자 분배 시) = 기존 `Math.floor((mortgage)*(itemValue/totalAllocated))` 유지 (변경 없음).

## 테스트 약속

- 케이스 인벤토리 14행 전부 anchor (FE-char·FM-char characterization 우선 — Pre-Do).
- FE-2·FE-3 한도값은 **Phase A 부칙 동결 후** 확정 (현재 15억/5억 잠정 — 동결 전 `toBe` 고정 금지, `☐ 부칙대기` 표기).
- legacy 회귀: FD-1~21·FH-1~6·E-1~7·FP-1~10 + `deathDate` 미전달 경로 GREEN.
- `npm test` 전체 (영농 14건 기구현 — 광범 회귀).

## D-3 알고리즘 — §16⑭2호 hasDisqualifyingGrossReceipt (후속 구현 2026-06-04)

### 법령 근거 (KoreanLaw MCP 직접 확인)

- **상증령 §16⑭2호** (mst 283637, 시행 2026.2.27): "해당 피상속인 또는 상속인의 소득세법 §24①에 따른 사업소득 총수입금액(농업·임업·어업·부동산임대업·농어가부업소득 제외)이 소령 §208⑤2호 각 목 기준 이상인 과세기간"
  - 가목(농업·광업·도매업 등): 3억원 / 나목(제조업·음식점업 등): 1.5억원 / 다목(부동산임대업·교육서비스업 등): 7,500만원
- §16⑭1호와 **OR 결합** — 하나라도 해당 시 해당 과세기간 영농 미종사

### 타입 변경

```typescript
// FarmingInheritanceInput — hasDisqualifyingIncome 1호 전용, hasDisqualifyingGrossReceipt 2호 신규
hasDisqualifyingIncome?: boolean;       // §16⑭1호: 사업소득금액+총급여 3,700만 이상
hasDisqualifyingGrossReceipt?: boolean; // §16⑭2호: 사업소득 총수입금액 소령§208⑤2호 이상 (2026.2.27)

// FarmingHeirAssessment — 상속인 단위 동일 추가
hasDisqualifyingGrossReceipt?: boolean;
```

### reason 분기 (evaluateFarmingEligibility)

```
disq1 && disq2 → §16⑭1호 reason + §16⑭2호 reason (2건 push)
disq1 only    → §16⑭1호 reason (1건)
disq2 only    → §16⑭2호 reason (1건)
둘 다 false   → push 없음
```

### 14동기점 엔진측 처리

| 지점 | 처리 | 비고 |
|---|---|---|
| ①폼타입 | `FarmingInheritanceInput` 추가 | D3-T1 |
| ②initial | `undefined` (optional, 초기값 불필요) | UI 시니어 ⑤ |
| ③normalize | `undefined` → 미결격 가정 (legacy 호환) | UI 시니어 ⑤ |
| ④API변환 | `deductionInput.farming` 통째 전달 → 자동 포함 | callInheritanceTaxAPI 확인 |
| ⑤⑥⑦ | UI 시니어 인계 | ToggleCard/결과 카드 |
| ⑧validation | optional boolean — 미입력=false, 별도 검증 불필요 | Zod 통과 |
| ⑨Zod메인 | farmingInputSchema.hasDisqualifyingGrossReceipt 추가 | D3-T5 |
| ⑩Zod컴패니언 | heirAssessments 내부 객체 추가 | D3-T6 |
| ⑫Zod입력객체 | farmingInputSchema 변경으로 자동 반영 | - |
| ⑬body spread | `deductionInput` 통째 → farming 내부 필드 자동 도달 | 확인 완료 |
| ⑭route매핑 | `parsedData.deductionInput` cast → 자동 | - |

---

## D-4 알고리즘 — §16⑤1호 farmingUseStartDate 자동판정 (후속 구현 2026-06-04)

### 법령 근거 (KoreanLaw MCP 직접 확인)

- **상증령 §16⑤1호** (mst 283637): "피상속인이 **상속개시일 2년 전부터 영농에 사용한** 자산의 가액에서 해당 자산에 담보된 채무액을 뺀 가액"
- 판정 기준 = **취득일이 아닌 영농 사용 개시일** (조심2014중4319: 상속개시 2년 이내 취득·사용 농지는 대상 아님)

### twoYearsBefore 헬퍼

```typescript
// lib/calc/inheritance-deduction-suggest.ts
export function twoYearsBefore(deathDate: string): string {
  const [y, m, d] = deathDate.split("-");
  return `${Number(y) - 2}-${m}-${d}`;
  // 2/29 edge는 드물어 무시 — 수동 입력으로 보완
}
```

string 조작만 — Date·parseISO·new Date 금지 ([[feedback_api_date_serialize]])

### 자동판정 로직 (isFarmingTwoYearMet)

```
farmingUseStartDate !== undefined && deathDate !== undefined:
  → farmingUseStartDate <= twoYearsBefore(deathDate) ? 충족 : 제외 (자동)
farmingUseStartDate === undefined (fallback):
  → farmingUsedTwoYears !== false (수동 boolean, legacy)
```

우선순위: farmingUseStartDate(자동) > farmingUsedTwoYears(수동)

### Silent fallback 검토

| 후보 | 처리 |
|---|---|
| farmingUseStartDate 미입력 → farmingUsedTwoYears fallback | **허용** (자동 안분 아님 — 수동 플래그 그대로 사용) |
| deathDate 미입력 → 자동판정 비활성 | **허용** (twoYearsBeforeDate=undefined → fallback 경로) |

### 14동기점 엔진측 처리

| 지점 | 처리 | 비고 |
|---|---|---|
| ①폼타입 | `EstateItem.farmingUseStartDate?: string` 추가 | D4-T1 |
| ②initial | `undefined` (optional) | UI 시니어 ⑤ |
| ③normalize | `undefined` → 자동판정 비활성 → fallback | UI 시니어 ⑤ |
| ④API변환 | `estateItems` 통째 spread → 자동 포함 | 확인 완료 |
| ⑤⑥⑦ | UI 시니어 인계 | DateInput + 자동판정 표시 배지 |
| ⑧validation | YYYY-MM-DD regex 검증 (Zod) | D4-T4 |
| ⑨Zod메인 | baseItemSchema.farmingUseStartDate 추가 | D4-T4 |
| ⑫Zod입력객체 | baseItemSchema 변경으로 자동 반영 | - |
| ⑬body spread | `estateItems` 통째 → 자동 도달 | 확인 완료 |
| ⑭route매핑 | `parsedData.estateItems` cast → 자동 | - |

---

## UI 통합 위임 (inheritance-gift-tax-ui-senior — 상세 `.ui.design.md`)

- ⑤ `InheritanceTaxForm.tsx` `autos.farming` useMemo에서 `suggestFarmingAssetValue(estateItems, farming, form.deathDate)` **deathDate 전달**(R8 — steps.tsx는 autos prop 수신만).
- ⑤ `FarmingCategorySection.tsx`: 2년영농 ToggleCard(default ON) + 건폐율·5년조림 안내 강화.
- ⑤ `FarmingEligibilitySection.tsx`: §16⑭ 라벨 분리 — 1호 체크박스(hasDisqualifyingIncome) + 2호 체크박스(hasDisqualifyingGrossReceipt, 2026.2.27 신설 배지).
- ⑤ `FarmingCategorySection.tsx` 자산 카드: `farmingUseStartDate` DateInput + 자동판정 결과 표시 배지 (충족/미충족/deathDate 미입력 시 비활성).
- ⑦ `FarmingDeductionDetailCard.tsx`: `appliedLimit` echo("적용 한도 N억 — 상속개시 연도 기준") + 담보 시행시기는 Step4 suggest 배지 breakdown 안내.
- ⑧ validate: farming 음수·직접입력 안내(R4).
