# 양도소득세 다건 동시 양도 지원 리팩터링

## Context

현재 `calculateTransferTax()`(`lib/tax-engine/transfer-tax.ts:1049`)는 **단건 양도만** 계산한다. 실제 과세 단위는 **과세기간별 납세자** — 같은 해에 자산 여러 건을 양도하면 아래 네 가지 세법 규정이 모두 반영되어야 한다.

- **소득세법 §92**: 과세기간 내 자산별 양도소득금액을 합산하여 통합 과세표준 산정
- **소득세법 §102 ② + 시행령 §167의2**: **양도차손 통산** — 같은 세율군(§102 ① 각 호 구분) 내에서 먼저 통산, 남은 차손은 시행령 §167의2에 따라 다른 세율군 양수 소득금액에 금액 비례 안분 차감. 남은 잔여 차손의 차년도 이월 **불인정**
- **소득세법 §103**: 양도소득 기본공제 **연 1회 250만원** (자산 간 공유). 미등기 양도 배제
- **소득세법 §104의2**: **비교과세** — 다주택 중과·비사업용 토지·미등기·단기보유 자산 등 "중과 그룹"을 **포함한 경우에 한하여** `MAX(세율군별 분리산출세액 합, 전체 일반 누진세율 산출세액)` 적용. 모두 일반 누진 자산이면 비교 불필요

현 엔진은 건별 산출세액만 반환하므로 다건 합산 시 정확한 세액을 도출할 수 없다. 본 계획은 **기존 단건 엔진의 헬퍼 함수를 export 전환**하고 **상위 aggregate 엔진**을 신설하여 건별 전처리 → 합산 로직을 수행하는 **2-layer orchestrator** 구조로 확장한다. 1차 출시 범위는 **엔진·API·UI·이력·PDF 전체**이며, 자산 입력 UI는 **건 리스트(카드 탭바) + 건별 6단계 마법사 재사용**으로 구성한다.

---

## 설계 원칙

1. **단건 엔진 동작 불변**: `calculateTransferTax()`의 외부 동작은 완전히 유지. 내부 헬퍼를 `export function`으로 전환하여 aggregate 엔진에서 재사용.
2. **단건 API·UI·이력 하위 호환**: `/api/calc/transfer`, `/calc/transfer-tax`, `TaxType="transfer"` 이력은 모두 유지. 멀티는 **신규 경로·신규 TaxType**으로 분리.
3. **이력/PDF**: `TaxType` union에 `"transfer_multi"` 추가. Single과 Multi 결과 뷰·PDF 분기 명확.
4. **UI**: 신규 `/calc/transfer-tax/multi` 4단계 플로우(A 건 리스트 → B 건별 편집 → C 공통 입력 → D 결과). Step B 내부에서 **자산 탭바**로 기존 6단계 마법사 재사용.

---

## 단건 엔진 헬퍼 export 전환 (동작 불변)

파일: `lib/tax-engine/transfer-tax.ts`

다음 내부 함수에 `export` 키워드만 추가 (로직은 건드리지 않음). 단건 `calculateTransferTax()`는 그대로 이들을 호출.

| 함수 | 현재 위치 | 역할 |
|---|---|---|
| `checkExemption` | L~ | 1세대1주택·일시적 2주택 비과세 판정 |
| `calcTransferGain` | L549 | 양도차익 (환산·개산공제 포함) |
| `calcOneHouseProration` | L585 | 12억 초과분 안분 |
| `calcLongTermHoldingDeduction` | L596~ | 자산별 장기보유특별공제 |
| `calcTax` | L781 | 세율 적용 (누진·단일·중과) |
| `calcReductions` | L~ | 감면 (자경·장기임대·신축 등) |
| `calcBasicDeduction` | L701 | 기본공제 (연 250만 한도) |
| `calculateBuildingPenalty` | L~ | §114조의2 환산취득 가산세 |
| `parseRatesFromMap` | L334 | 세율 맵 파싱 |

**신규 옵션 2개** (default false, 기존 경로 영향 0):
- `TransferTaxInput.skipBasicDeduction?: boolean` — aggregate에서 호출 시 기본공제 스킵
- `TransferTaxInput.skipLossFloor?: boolean` — `calcTransferGain()` 내 `Math.max(0, gain)`(L573) 바닥 처리 생략 → 음수 차익 반환 허용

---

## 신규 aggregate 엔진 (`lib/tax-engine/transfer-tax-aggregate.ts`)

### 핵심 타입

```ts
export type RateGroup =
  | "progressive"              // 일반 누진 6~45% (보유 2년+ 중과 해당 없음)
  | "short_term"               // 단기보유 단일세율 (1년 미만 / 1~2년 미만 주택·입주권·분양권 포함, 세부 세율은 건별 결과에서 이미 결정됨)
  | "multi_house_surcharge"    // 다주택 중과 (2주택 +20%p / 3주택+ +30%p)
  | "non_business_land"        // 비사업용 토지 (+10%p)
  | "unregistered";            // 미등기 70% 단일

export interface AggregateTransferInput {
  taxYear: number;
  properties: TransferTaxItemInput[];        // 1..20건
  annualBasicDeductionUsed: number;
  basicDeductionAllocation?: "MAX_BENEFIT" | "FIRST" | "EARLIEST_TRANSFER";
  filingPenaltyDetails?: FilingPenaltyInput;
  delayedPaymentDetails?: DelayedPaymentInput;
}

export type TransferTaxItemInput = Omit<TransferTaxInput,
  "annualBasicDeductionUsed" | "filingPenaltyDetails" | "delayedPaymentDetails"
> & { propertyId: string; propertyLabel: string };

export interface PerPropertyBreakdown {
  propertyId: string;
  propertyLabel: string;
  isExempt: boolean;
  exemptReason?: string;
  transferGain: number;                      // 음수 가능
  longTermHoldingDeduction: number;
  income: number;                            // 차익 - 장특공제 (음수 가능)
  rateGroup: RateGroup;
  lossOffsetFromSameGroup: number;           // 같은 그룹에서 받은 차손 공제
  lossOffsetFromOtherGroup: number;          // 타군에서 안분 받은 차손 공제
  incomeAfterOffset: number;                 // ≥ 0
  allocatedBasicDeduction: number;
  taxBaseShare: number;                      // 그룹 과세표준 내 기여분
  calculatedTaxByGroupRate: number;          // 방법 B (세율군별) 기여분
  calculatedTaxByGeneralRate: number;        // 방법 A (일반 누진) 기여분 (안분)
  appliedRate: number;
  surchargeRate?: number;
  surchargeType?: string;
  reductionAmount: number;                   // 건별 감면 (조특법 §127 ② 중복배제 적용)
  penaltyTax: number;                        // §114조의2 건별
  steps: CalculationStep[];
}

export interface AggregateTransferResult {
  properties: PerPropertyBreakdown[];
  totalTransferGain: number;
  totalLongTermHoldingDeduction: number;
  totalIncomeBeforeOffset: number;
  totalLoss: number;                         // 차손 자산 합 (음수 절댓값)
  lossOffsetTable: Array<{
    fromPropertyId: string; toPropertyId: string;
    amount: number; scope: "same_group" | "other_group";
  }>;
  unusedLoss: number;                        // 이월 불가 소멸
  totalIncomeAfterOffset: number;
  basicDeduction: number;                    // 실제 사용액 (≤ 2,500,000)
  taxBase: number;
  groupTaxes: Array<{ group: RateGroup; taxBase: number; calculatedTax: number }>;
  calculatedTaxByGroups: number;             // 방법 B 합계
  calculatedTaxByGeneral: number;            // 방법 A (전체 누진)
  comparedTaxApplied: "groups" | "general" | "none";  // §104의2 결과
  calculatedTax: number;                     // MAX 결과
  reductionAmount: number;                   // 건별 합
  determinedTax: number;                     // 산출 - 감면
  penaltyTax: number;                        // §114조의2 건별 합 + filing/delayed
  penaltyDetail?: TransferTaxPenaltyResult;
  localIncomeTax: number;                    // (결정+가산) × 10%, 천원 절사
  totalTax: number;
  steps: CalculationStep[];
}

export function calculateTransferTaxAggregate(
  input: AggregateTransferInput,
  rates: TaxRatesMap,
): AggregateTransferResult
```

### 처리 파이프라인

```
M-0 validateInput         : taxYear 일관성, propertyId unique, 1~20건
M-1 preProcessPerProperty : 건별 calculateTransferTax({...item, skipBasicDeduction:true, skipLossFloor:true})
                            → {transferGain, longTermHoldingDeduction, income(음수 가능), rateGroup, reductionAmount, penaltyTax}
M-2 classifyRateGroup     : 건별 결과의 surchargeType·isUnregistered·보유기간·propertyType으로 5개 그룹 매핑
                            - isUnregistered → "unregistered"
                            - 보유기간 < 24개월 (주택·입주권·분양권) 또는 <24개월 일반 → "short_term"
                            - surchargeType === "non_business_land" → "non_business_land"
                            - surchargeType in {multi_house_2, multi_house_3plus} && !isSurchargeSuspended → "multi_house_surcharge"
                            - 나머지 → "progressive"
M-3 offsetLosses          : §102② + 시행령 §167의2 차손 통산 (아래 상세)
M-4 allocateBasicDeduction: 연 1회 250만, 미등기 배제, 전략별 배분 (MAX_BENEFIT 기본)
M-5 computeByGroups       : 그룹별 taxBase = max(0, groupIncomeAfterOffset - groupBasicDeduction)
                            → applyTaxRateByGroup(taxBase, group, parsedRates, ctx) → groupTaxes[]
                            → calculatedTaxByGroups = Σ groupTaxes
M-6 computeByGeneral      : 전체 income 합 - 전체 기본공제 = generalTaxBase
                            → 일반 누진세율 적용 → calculatedTaxByGeneral
M-7 applyComparative      : if (그룹 중 multi_house_surcharge·non_business_land·unregistered·short_term 중 하나라도 있음)
                              calculatedTax = MAX(byGroups, byGeneral); comparedTaxApplied = (byGroups >= byGeneral ? "groups" : "general")
                            else
                              calculatedTax = byGroups; comparedTaxApplied = "none"
M-8 aggregateReductions   : 건별 reductionAmount 합산 (조특법 §127 ② 건별 독립 적용됨)
                            determinedTax = max(0, calculatedTax - reductionAmount)
M-9 computePenalty        : penaltyTax = Σ건별 §114조의2 + filingPenalty(합산 결정세액 기준) + delayedPayment(합산)
M-10 computeLocal         : localIncomeTax = truncateToThousand((determinedTax + penaltyTax) × 10%)
                            totalTax = determinedTax + penaltyTax + localIncomeTax
```

### M-3 차손 통산 알고리즘 (§102 ② + 시행령 §167의2)

```
Step 1: 그룹별 same-group 통산
  for each group g:
    gains_g = items with income_i > 0 in g
    losses_g = items with income_i < 0 in g
    offsetPool_g = min(Σ|losses_g|, Σ gains_g)
    # 차익 자산에 금액 비례 안분
    for gain_i in gains_g:
      offset_i = floor(gain_i × offsetPool_g / Σ gains_g)
    lossOffsetFromSameGroup[i] += offset_i
    remainingLoss_g = Σ|losses_g| - offsetPool_g

Step 2: 타군 안분 (시행령 §167의2)
  totalRemainingLoss = Σ remainingLoss_g
  remainingGainByGroup = { g: max(0, Σ gains_g - Σ|losses_g|) for each g }
  totalRemainingGain = Σ remainingGainByGroup
  if totalRemainingLoss > 0 and totalRemainingGain > 0:
    offsetPool2 = min(totalRemainingLoss, totalRemainingGain)
    for each gain_i in 타군 양수 자산:
      offset2_i = floor(gain_i × offsetPool2 / totalRemainingGain)
      lossOffsetFromOtherGroup[i] += offset2_i

Step 3: unusedLoss = totalRemainingLoss - offsetPool2   # 소멸, 이월 불가
Step 4: incomeAfterOffset[i] = max(0, income_i - lossOffsetFromSameGroup[i] - lossOffsetFromOtherGroup[i])
Step 5: 원 단위 잔차는 마지막 차익 자산에 보정
```

**근거 주석 필수**: §102 ② 및 시행령 §167의2 원문을 JSDoc에 인용. 타군 안분 시 **금액 비례(pro-rata)**는 국세청 실무·판례 다수 해석.

### 세율 적용 헬퍼

```ts
// 신규 export (transfer-tax.ts 또는 aggregate.ts 내부)
export function applyTaxRateByGroup(
  taxBase: number,
  group: RateGroup,
  parsedRates: ParsedRates,
  ctx: { propertyType: string; holdingMonths: number; multiHouseSurchargeType?: string; ... }
): { calculatedTax: number; appliedRate: number; surchargeRate?: number; progressiveDeduction: number }
```

단건 `calcTax()` (L781) 로직을 그룹별로 분리 추출하거나, `calcTax`를 export하여 `ctx` 재구성 후 호출.

---

## API 설계

### 신규 엔드포인트: `POST /api/calc/transfer/multi`

신규 파일: `app/api/calc/transfer/multi/route.ts`

### 스키마 공유
신규: `lib/api/transfer-tax-schema.ts`
- 기존 `inputSchema` (`app/api/calc/transfer/route.ts:165`)를 이 파일로 추출하여 **export** (이름: `propertySchema`)
- 단건 route는 `import { propertySchema as inputSchema }`로 변경 (동작 불변)
- `multiInputSchema = z.object({ taxYear, annualBasicDeductionUsed, properties: z.array(propertySchema).min(1).max(20), basicDeductionAllocation, filingPenaltyDetails?, delayedPaymentDetails? }).superRefine(...)` — taxYear 일관성·propertyId unique 검증

### Rate Limiting
`checkRateLimit(ip, "transfer-multi", 15, 60_000)` — 분당 15회 (단건 30회의 절반)

### 세율 테이블 시점
`preloadTaxRates(["transfer"], new Date(taxYear, 11, 31))` — 과세기간 말일 기준 1회 로드

### 2-pass 가산세
단건 route L551-564 패턴 재사용 — 1차: determinedTax 산출 → 2차: filingPenalty·delayedPayment 재계산

---

## UI 변경

### 신규 라우트
- `/calc/transfer-tax/multi` — 신규 `app/calc/transfer-tax/multi/page.tsx` + `MultiTransferTaxCalculator.tsx`
- `/calc/transfer-tax` (기존 단건) — 그대로 유지, 하단에 "여러 건 동시 양도 →" 링크 추가
- 홈(`app/page.tsx`) — "단건 계산" / "다건 동시 양도" 2옵션 카드

### 4단계 플로우

| Step | 내용 | 재사용 |
|---|---|---|
| **A. 건 리스트** | 카드 리스트(자산 요약·완성도) + [+ 양도 건 추가] + 건별 [수정·복제·삭제] | 신규 |
| **B. 건별 편집** | 선택된 자산에 대해 기존 6단계 마법사 실행 (자산 탭바 상단 표시로 건 전환 가능) | 기존 `TransferTaxCalculator.tsx` 재사용 (props로 activeProperty 주입) |
| **C. 공통 입력** | 연간 기사용 기본공제·배분 전략·가산세 옵션 | 기존 Step5/6 부분 재사용 |
| **D. 결과** | 합산 카드 + 비교과세 뱃지(§104의2) + 차손 통산 표 + 건별 breakdown 아코디언 + 계산 과정 토글 | `MultiTransferTaxResultView.tsx` 신규 (Row 컴포넌트 재사용) |

### 신규 파일
- `app/calc/transfer-tax/multi/page.tsx`
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` (~800줄)
- `components/calc/results/MultiTransferTaxResultView.tsx`
- `components/calc/transfer/AssetTabBar.tsx`
- `components/calc/transfer/AggregateSettingsPanel.tsx`
- `lib/stores/multi-transfer-tax-store.ts` — 기존 `calc-wizard-store`와 격리된 별도 zustand
- `lib/calc/multi-transfer-tax-api.ts` — `callMultiTransferTaxAPI(properties, common)`
- `lib/calc/multi-transfer-tax-validate.ts` — 건별·공통 검증 (단건의 `validateStep` 재사용)

### 결과 뷰 핵심 요소
- **비교과세 뱃지**: `comparedTaxApplied === "groups"` → "세율군별 산출(방법 B) 적용, 일반 누진 대비 XX원 많음", `"general"` → "전체 누진 적용", `"none"` → 비교과세 미적용
- **차손 통산 표**: `lossOffsetTable` 순회, "[토지A] → [주택B]: -10,000,000원 (동일그룹/타군)" 형식
- **건별 breakdown**: 아코디언 각 자산, 건별 steps 배열 렌더

---

## 이력·PDF 수정

- `actions/calculations.ts`: `TaxType` union에 `"transfer_multi"` 추가
- `app/history/HistoryClient.tsx`: 레이블 매핑에 `"transfer_multi": "양도소득세 (다건)"` 추가, 배지 UI
- `app/result/[id]/ResultDetailClient.tsx`: `taxType === "transfer_multi"` 분기로 `MultiTransferTaxResultView` read-only 렌더
- `lib/pdf/ResultPdfDocument.tsx`: `transfer_multi` 분기 — 건별 섹션 반복 + 합산 섹션 + 비교과세·차손 통산 표
- `app/api/pdf/result/[id]/route.ts`: `TAX_TYPE_LABELS`에 `transfer_multi: "양도소득세 (다건)"` 추가
- Supabase 스키마 변경 **없음** (`calculations.tax_type` TEXT 컬럼에 새 값 저장)

---

## 법령 상수 (`lib/tax-engine/legal-codes.ts` TRANSFER 추가)

```ts
TRANSFER_GAIN_AGGREGATION:  "소득세법 §92",
LOSS_OFFSET:                 "소득세법 §102 ② + 시행령 §167의2",
COMPARATIVE_TAXATION:        "소득세법 §104의2",
```

---

## 테스트 시나리오 (`__tests__/tax-engine/transfer-tax-aggregate.test.ts`)

Mock 세율은 기존 `transfer-tax.test.ts`의 `makeMockRates()`를 `__tests__/tax-engine/_helpers/mock-rates.ts`로 추출하여 공유.

| # | 시나리오 | 검증 포인트 |
|---|---|---|
| T-M01 | 누진 그룹 2건 합산 (5천만+1억) | `comparedTaxApplied="none"`, 합산 누진 구간 이동 |
| T-M02 | **§102② 동일그룹 통산** — 토지A 차익 5억 + 토지B 차손 -2억 | `lossOffsetFromSameGroup[A]=2억`, `incomeAfterOffset[A]=3억`, `unusedLoss=0` |
| T-M03 | **§167의2 타군 안분** — 누진 토지 차익 6억 + 중과 주택 차손 -3억 | `lossOffsetFromOtherGroup[토지]=3억`, 그룹 간 통산 기록 |
| T-M04 | **§104의2 비교과세** — 다주택 중과 1건 + 일반 1건 | `MAX(byGroups, byGeneral)`, `comparedTaxApplied` 기록 |
| T-M05 | 단기 단일세율 + 누진 혼합 | 그룹 2개, 비교과세 MAX 확인 |
| T-M06 | 기본공제 연 1회 (MAX_BENEFIT) — 주택(35%) + 토지(6%) | 주택 전액 배분, 토지 0 |
| T-M07 | **전체 차손 초과** — 차익 2억 + 차손 -5억 | `calculatedTax=0`, `unusedLoss=3억` (이월 불인정 안내 step) |
| T-M08 | 감면 독립 (자경 50% + 신축 100%) | 건별 `reductionAmount` 독립 계산 후 합산 |
| T-M09 | 1세대1주택 비과세 1건 + 과세 1건 | 비과세 건은 `income=0`으로 통산·합산 제외 |
| T-M10 | 3건 모두 누진 + 구간 경계 이동 | 누진공제 정확성, `comparedTaxApplied="none"` |
| T-M11 | 가산세 혼합 — 1건만 환산취득(§114의2) + 신고불성실 | 건별 penaltyTax + 합산 결정세액 기반 filing penalty |
| T-M12 | 미등기 자산 기본공제 배제 | `allocatedBasicDeduction[unreg]=0` |
| T-M13 | 동일 과세연도 검증 실패 — properties[0]=2024-12, [1]=2025-01 | Zod 400 응답 |
| T-M14 | 주택(누진) + 분양권(60%) + 비사업용토지 3그룹 | 3그룹 분리 계산, 비교과세 MAX |
| T-M15 | 안분 잔차 보정 — 3개 차익 자산에 차손 pro-rata | 원 단위 합계가 offsetPool과 일치 |

기존 단건 테스트 (339건) 영향 없음 — 헬퍼 `export` 추가와 `skipBasicDeduction`·`skipLossFloor` 옵션은 default false로 기존 동작 불변.

---

## 파일별 변경 목록

### 신규 (11)
- `lib/tax-engine/transfer-tax-aggregate.ts`
- `lib/api/transfer-tax-schema.ts`
- `app/api/calc/transfer/multi/route.ts`
- `app/calc/transfer-tax/multi/page.tsx`
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx`
- `components/calc/results/MultiTransferTaxResultView.tsx`
- `components/calc/transfer/AssetTabBar.tsx`
- `components/calc/transfer/AggregateSettingsPanel.tsx`
- `lib/stores/multi-transfer-tax-store.ts`
- `lib/calc/multi-transfer-tax-api.ts`
- `lib/calc/multi-transfer-tax-validate.ts`
- `__tests__/tax-engine/transfer-tax-aggregate.test.ts`
- `__tests__/tax-engine/_helpers/mock-rates.ts`

### 수정 (10)
- `lib/tax-engine/transfer-tax.ts` — 내부 헬퍼 `export` 전환, `skipBasicDeduction`·`skipLossFloor` 옵션 추가, `applyTaxRateByGroup` export
- `lib/tax-engine/legal-codes.ts` — TRANSFER 상수 3개 추가
- `app/api/calc/transfer/route.ts` — `propertySchema` import로 전환 (동작 불변)
- `actions/calculations.ts` — `TaxType` union에 `"transfer_multi"` 추가
- `app/history/HistoryClient.tsx` — 레이블·배지 추가
- `app/result/[id]/ResultDetailClient.tsx` — `transfer_multi` 분기
- `lib/pdf/ResultPdfDocument.tsx` — `transfer_multi` 섹션 추가
- `app/api/pdf/result/[id]/route.ts` — 레이블 매핑
- `app/page.tsx` — 홈 카드에 "다건 동시 양도" 추가
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` — 단건 하단에 "여러 건" 링크

---

## 리스크 완화

| ID | 리스크 | 완화책 |
|---|---|---|
| R1 | 원 단위 절사 오차 누적 (건별 → 합산) | 합산 레벨 과세표준·세액 재계산, `applyRate`·`truncateToWon` 일관 사용. 차손 안분 잔차는 마지막 차익 자산에 보정 |
| R2 | 단건 엔진 기본공제 자동 소진 | `skipBasicDeduction` 옵션 (default false) — 기존 경로 영향 0 |
| R3 | 단건 엔진 `gain=max(0,...)` 바닥 처리 (L573) | `skipLossFloor` 옵션 (default false) — aggregate 호출 시만 true |
| R4 | 다주택 중과 판정 재실행 및 정합성 | aggregate 진입 시 `determineMultiHouseSurcharge` 1회 실행 후 건별 공유, 건별 재호출 금지 |
| R5 | UI 복잡도 (건 추가·편집·삭제) | 건별 진행률 표시, 자산 복제 버튼, 단건 UI는 명시적 진입으로 유지 |
| R6 | 이력 호환성 | `TaxType="transfer_multi"` 신규 값으로 완전 분리 — 기존 `transfer` 이력은 단건 뷰로 렌더 |
| R7 | 가산세 적용 단위 혼동 | §114의2는 건별 합산, 신고불성실·납부지연은 합산 결정세액 기준으로 계산 (route 2-pass) |
| R8 | 자산별 양도일 다름 시 세율 시점 | `preloadTaxRates`는 과세기간 말일 1회, 건별 `transferDate`는 단건 엔진 내부(보유기간·조정지역 이력) 판정용 |
| R9 | 비교과세(§104의2) 해석 — 단건만인 경우 | 그룹 중 중과·단기·비사업용·미등기 미포함이면 `comparedTaxApplied="none"` (일반 누진만 적용, MAX 계산 생략) |
| R10 | 차손 통산 타군 안분 근거 논쟁 | JSDoc에 §102②·시행령 §167의2 원문 인용, `lossOffsetTable`로 과정 투명화. 실무·국세청 해석에 기반함을 주석 명시 |
| R11 | 기본공제 배분 전략 법적 근거 모호 | 기본값 `MAX_BENEFIT`(납세자 권리), `FIRST`·`EARLIEST_TRANSFER` 옵션 제공, UI 토글 |
| R12 | 조특법 §127② 감면 중복배제 건별 vs 합산 | 건별 계산 후 합산 방식 채택 (Ultraplan·실무 해석 일치) — 각 건 내부에서는 이미 단건 엔진이 중복배제 수행 |
| R13 | 공동명의 지분 안분 | 현재 단건도 미지원. 본 task에서 추가하지 않음 (Out of Scope 명시) |
| R14 | 예정신고 건별 차액 정산 | 본 task에서 추가하지 않음. 현재 엔진은 확정신고 기준. 별도 task로 분리 |

---

## 구현 로드맵

| Phase | 작업 | 산출물 |
|---|---|---|
| **P1 엔진** | 단건 엔진 헬퍼 `export` 전환 + `skipBasicDeduction`·`skipLossFloor` 추가 + `applyTaxRateByGroup` 추출 → `transfer-tax-aggregate.ts` 작성 (M-0~M-10) → T-M01~T-M15 PASS + 기존 339개 회귀 PASS | 순수 엔진 완성 |
| **P2 API** | `lib/api/transfer-tax-schema.ts` 추출 → `/api/calc/transfer/multi/route.ts` 작성 → 단건 route는 schema import만 교체(동작 불변) → curl 수동 검증 | 백엔드 완성 |
| **P3 UI** | `multi-transfer-tax-store` → `AssetTabBar`·`AggregateSettingsPanel` → `MultiTransferTaxCalculator` 4단계 플로우 → `MultiTransferTaxResultView` | 프론트엔드 완성 |
| **P4 이력·PDF** | `TaxType` 확장 → 이력 UI 배지·뷰 분기 → PDF 렌더러 분기 → 홈 카드 2옵션 | 영속화·출력 완성 |
| **P5 E2E·QA** | 토지 2건 / 토지+건물 / 주택+분양권 / 중과+일반(비교과세) / 차손+차익 / 3건 혼합 / PDF 출력 | 출시 준비 |

---

## 검증 방법 (end-to-end)

1. **단위 테스트**: `npm test -- __tests__/tax-engine/transfer-tax-aggregate.test.ts` — 15개 시나리오 PASS
2. **회귀 테스트**: `npm test -- --run` — 기존 단건 테스트 포함 전체 PASS (`skipBasicDeduction`·`skipLossFloor` 기본값 false로 기존 동작 불변 증명)
3. **타입체크**: `npx tsc --noEmit` 통과
4. **API 수동 검증**:
   ```bash
   curl -X POST http://localhost:3000/api/calc/transfer/multi \
     -H 'Content-Type: application/json' \
     -d @docs/examples/transfer-multi-sample.json | jq '.data | {comparedTaxApplied, calculatedTax, lossOffsetTable, unusedLoss}'
   ```
5. **UI 수동 시나리오** (`npm run dev`):
   - 홈 → "다건 동시 양도" → 건 2개 추가 (주택 중과 + 토지) → 결과 카드·비교과세 뱃지·건별 아코디언 확인
   - 차손+차익 동일그룹 → 차손 통산 표에 "same_group" 레코드
   - 차손+차익 타군 → "other_group" 레코드 및 비례 안분 확인
   - 미등기 포함 → 기본공제 0 배분 확인
   - 자산 복제·삭제 → 상태 일관성
   - 기본공제 전략 토글 → 결과 재계산
6. **이력 저장·로드·PDF**: 멀티 계산 → 저장 → 이력 목록 "(다건)" 배지 → 상세 페이지 read-only 뷰 → PDF 다운로드 → 건별 섹션 + 합산 섹션 모두 렌더
7. **법령 근거 표시**: 결과 스텝의 `legalBasis`에 §102②·§103·§104의2·시행령 §167의2 표시, 법제처 조문 모달에서 원문 조회 가능

---

## 상세 구현 체크리스트 (Todo List)

각 단계 완료 시 **계획서와 구현 내용을 비교하여 100% 일치하면 체크**하고 다음 단계로 진행한다.
실행 중에 이 체크리스트에 체크(`[x]`) 표시하여 진행 상태를 추적한다.

### P1 엔진 (Pure Engine)

- [x] **P1-1** `lib/tax-engine/transfer-tax.ts` 헬퍼 함수 `export` 전환
  - `checkExemption`, `calcTransferGain`, `calcOneHouseProration`, `calcLongTermHoldingDeduction`, `calcTax`, `calcReductions`, `calcBasicDeduction`, `calculateBuildingPenalty`, `parseRatesFromMap`
  - 기존 `calculateTransferTax()` 동작 불변 검증: `npm test -- transfer-tax.test.ts` 전체 PASS
- [x] **P1-2** `TransferTaxInput`에 옵션 필드 추가
  - `skipBasicDeduction?: boolean` (default false) — `calcBasicDeduction` 스킵
  - `skipLossFloor?: boolean` (default false) — `calcTransferGain` 내 `Math.max(0, gain)` 생략
  - 기본값 false 시 기존 동작과 완전 동일 확인
- [x] **P1-3** `applyTaxRateByGroup(taxBase, group, parsedRates, ctx)` 헬퍼 추출/export
  - `calcTax` 내부 분기를 `RateGroup`별로 호출 가능한 형태로 래핑
- [x] **P1-4** `__tests__/tax-engine/_helpers/mock-rates.ts` 추출
  - 기존 `transfer-tax.test.ts`의 `makeMockRates()` 이동, 두 테스트 파일에서 import
- [x] **P1-5** `lib/tax-engine/legal-codes.ts` TRANSFER 상수 3개 추가
  - `TRANSFER_GAIN_AGGREGATION`, `LOSS_OFFSET`, `COMPARATIVE_TAXATION`
- [x] **P1-6** `lib/tax-engine/transfer-tax-aggregate.ts` 신규 작성
  - 타입: `RateGroup`, `AggregateTransferInput`, `TransferTaxItemInput`, `PerPropertyBreakdown`, `AggregateTransferResult`
  - 함수: `calculateTransferTaxAggregate(input, rates)`
  - 파이프라인 M-0 ~ M-10 (validate → preProcess → classify → offsetLosses → allocateBasic → byGroups → byGeneral → comparative → reductions → penalty → local)
- [x] **P1-7** 차손 통산 로직 (`offsetLosses`) 구현 + `lossOffsetTable` 기록
  - Step1 그룹 내 통산 + Step2 시행령 §167의2 타군 pro-rata 안분 + Step3 잔차 보정
- [x] **P1-8** `__tests__/tax-engine/transfer-tax-aggregate.test.ts` 작성 (T-M01 ~ T-M15)
- [x] **P1-9** 전체 회귀 테스트: `npm test -- --run` → 기존 339+ 신규 15 모두 PASS
- [x] **P1-10** 타입체크: `npx tsc --noEmit` 통과

### P2 API

- [ ] **P2-1** `lib/api/transfer-tax-schema.ts` 신규 추출
  - `app/api/calc/transfer/route.ts`의 `inputSchema` → `propertySchema`로 이름 변경하여 export
  - `multiInputSchema` 신규 추가 (`properties: z.array(propertySchema).min(1).max(20)` + 공통 필드 + superRefine)
- [ ] **P2-2** 단건 route(`app/api/calc/transfer/route.ts`) 리팩터
  - `propertySchema` import로 교체, 나머지 로직 불변
  - 단건 엔드포인트 curl 검증으로 동작 불변 확인
- [ ] **P2-3** `app/api/calc/transfer/multi/route.ts` 신규 작성
  - Rate limiting (분당 15회), Zod 검증, 날짜 변환, `preloadTaxRates` (taxYear 말일), `calculateTransferTaxAggregate` 호출, 2-pass 가산세
- [ ] **P2-4** curl 수동 검증
  - 2건 누진 합산, 2건 중과+일반 비교과세, 차손+차익 동일그룹, 차손+차익 타군 시나리오

### P3 UI

- [ ] **P3-1** `lib/stores/multi-transfer-tax-store.ts` zustand 스토어
  - `MultiTransferFormData { taxYear, properties[], activePropertyIndex, annualBasicDeductionUsed, basicDeductionAllocation, filingPenalty 필드 }`
  - persist (sessionStorage key: `"multi-transfer-tax-wizard"`)
- [ ] **P3-2** `lib/calc/multi-transfer-tax-api.ts` + `multi-transfer-tax-validate.ts`
  - `buildPropertyPayload(asset)` 추출, `callMultiTransferTaxAPI(form)`, `validateMultiForm`
- [ ] **P3-3** `components/calc/transfer/AssetTabBar.tsx` 컴포넌트
  - 자산 탭 리스트 (완성도·삭제), "+ 양도 건 추가" 버튼
- [ ] **P3-4** `components/calc/transfer/AggregateSettingsPanel.tsx`
  - 연간 기사용 기본공제 입력, 배분 전략 라디오, 가산세 옵션
- [ ] **P3-5** `app/calc/transfer-tax/multi/page.tsx` + `MultiTransferTaxCalculator.tsx`
  - 4단계 플로우 (A 건 리스트 → B 건별 편집 → C 공통 입력 → D 결과)
  - Step B 내부에서 기존 6단계 마법사 재사용 (props로 activeProperty 주입)
- [ ] **P3-6** `components/calc/results/MultiTransferTaxResultView.tsx`
  - 합산 결과 카드, 비교과세 뱃지, 차손 통산 표, 건별 아코디언, 전체 steps 토글
- [ ] **P3-7** UI 빌드: `npm run build` 에러 없음

### P4 이력·PDF

- [ ] **P4-1** `actions/calculations.ts` `TaxType` union에 `"transfer_multi"` 추가
- [ ] **P4-2** `app/history/HistoryClient.tsx` 레이블 매핑 + "(다건)" 배지
- [ ] **P4-3** `app/result/[id]/ResultDetailClient.tsx` `taxType === "transfer_multi"` 분기
- [ ] **P4-4** `lib/pdf/ResultPdfDocument.tsx` 다건 분기 (건별 섹션 + 합산 섹션)
- [ ] **P4-5** `app/api/pdf/result/[id]/route.ts` `TAX_TYPE_LABELS` 추가
- [ ] **P4-6** `app/page.tsx` 홈 카드에 "다건 동시 양도" 옵션 추가
- [ ] **P4-7** `app/calc/transfer-tax/TransferTaxCalculator.tsx` 하단 "여러 건 →" 링크 추가

### P5 E2E·QA

- [ ] **P5-1** UI 수동 시나리오 — 토지 2건 누진 합산 (비교과세=none)
- [ ] **P5-2** UI 수동 — 주택 중과 + 토지 혼합 (비교과세 MAX)
- [ ] **P5-3** UI 수동 — 차손+차익 동일그룹 통산
- [ ] **P5-4** UI 수동 — 차손+차익 타군 안분 통산
- [ ] **P5-5** UI 수동 — 미등기 포함 기본공제 0 배분
- [ ] **P5-6** 이력 저장 → 다건 배지 표시 → 상세 read-only 뷰 → PDF 다운로드
- [ ] **P5-7** 법령 조문 모달에서 §102②·§104의2·§167의2 원문 조회
- [ ] **P5-8** 최종 회귀 테스트: `npm test -- --run` 전체 PASS + `npx tsc --noEmit` 통과

---

## Out of Scope (본 task 제외)

- 예정신고 vs 확정신고 차액 정산 안내 (현 엔진 확정 기준 유지)
- 공동명의 지분 안분 (단건·다건 공통 미지원, 별도 task)
- 해외 양도자산 합산 (조특법 §118)
- 양도차손 차년도 이월 (현행 세법상 이월 불인정)
- 대주주 주식 양도소득 (양도자산 카테고리 외 — 별도 엔진)

---

## 참고 파일 (critical paths)

- `lib/tax-engine/transfer-tax.ts:83` `TransferTaxInput`
- `lib/tax-engine/transfer-tax.ts:227` `TransferTaxResult`
- `lib/tax-engine/transfer-tax.ts:549` `calcTransferGain` (skipLossFloor 주입 지점)
- `lib/tax-engine/transfer-tax.ts:701` `calcBasicDeduction` (skipBasicDeduction 주입 지점)
- `lib/tax-engine/transfer-tax.ts:781` `calcTax` (export 대상, applyTaxRateByGroup 추출 원본)
- `lib/tax-engine/transfer-tax.ts:1049` `calculateTransferTax` 진입점
- `lib/tax-engine/multi-house-surcharge.ts` `determineMultiHouseSurcharge` (aggregate 진입 시 1회 실행)
- `lib/tax-engine/transfer-tax-penalty.ts` `calculateTransferTaxPenalty` (합산 결정세액 기준 재계산)
- `lib/tax-engine/legal-codes.ts` TRANSFER 상수 (§102·§103·§104의2·§167의2 추가 지점)
- `app/api/calc/transfer/route.ts:165` `inputSchema` (propertySchema 추출 원본)
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` 6단계 마법사 (Step B 내부 재사용)
- `lib/stores/calc-wizard-store.ts` 단건 zustand (멀티 스토어와 격리)
- `components/calc/results/TransferTaxResultView.tsx` Row 컴포넌트 재사용
- `actions/calculations.ts` `TaxType` 확장 지점
- `app/result/[id]/ResultDetailClient.tsx` · `lib/pdf/ResultPdfDocument.tsx` · `app/api/pdf/result/[id]/route.ts` 이력·PDF 분기 지점
- `docs/00-pm/korean-tax-calc.prd.md` M1-4 요구사항 근거
