# 배우자등 이월과세 + 비교과세 (소득세법 §97조의2) — 엔진 설계

> **Feature**: `transfer-tax-carryover-taxation`
> **Tax**: 양도소득세 (transfer)
> **상태**: Design 완료 (Do 진입 가능, 2026-05-04 미결 5개 모두 해소)
> **작성일**: 2026-05-04
> **출처**: Plan `docs/00-pm/transfer-tax-carryover-taxation.plan.md`

---

## 1. Context

### 1.1 배경

배우자·직계존비속으로부터 증여받은 부동산을 일정 기간(5년/10년) 이내에 양도하면,
소득세법 §97조의2에 따라 **취득가액·취득일을 증여자 기준으로 환산**하여 양도소득세를 계산해야 한다(이월과세).
2017.7.1. 이후 양도분부터는 **비교과세**가 추가되어, 이월과세 적용·미적용 결정세액 중 **큰 금액**으로 신고해야 한다.

### 1.2 현재 한계

- `acquisitionCause: "gift"` 필드와 `donorAcquisitionDate`(단기보유 판정용)만 부분 지원
- 이월과세 본격 계산·비교과세·증여세 상당액 필요경비 가산 미구현

### 1.3 목표 (v1)

- 이월과세 적용 여부 자동 판정 + 환산 자동 (PHD/APD 로직 재사용)
- 비교과세 두 시나리오(A=적용, B=미적용) 결정세액 나란히 표시, 큰 쪽 자동 채택
- 증여자 취득가액 미확인 시 PHD/APD 환산 로직 재사용으로 입력 부담 최소화

---

## ★ 2. 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| C-01 | **PDF 사례 24** — 배우자 이월과세 + APD 환산, 5년 룰 이전 증여, A 64,684,518 > B 64,062,800 → A 채택 | §97조의2 ①·② 3호, §164⑤ | 양도코리아 캡처 (환산취득가 356,171,284 / A 64,684,518 / B 64,062,800) | `__tests__/tax-engine/transfer-tax/carryover-pdf-case24.test.ts` | ☐ TODO |
| C-02 | 2023.1.1 이후 증여 + 7년차 양도 → 10년 룰 적용 | 부칙(2022.12.31.) + §97조의2 ① | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-period-10yr.test.ts` | ☐ TODO |
| C-03 | 2018.6.19 증여 + 2024.7.1 양도 (5년 1일 경과) → 기간 초과, 이월과세 미적용 | §97조의2 ③ (등기부 소유기간) | 직접 구성 (경계 anchor) | `__tests__/tax-engine/transfer-tax/carryover-period-boundary.test.ts` | ☐ TODO |
| C-04 | 2023.6.1 증여 + 2033.7.1 양도 (10년 1일 경과) → 기간 초과, 이월과세 미적용 | §97조의2 ③, 부칙 | 직접 구성 (경계 anchor) | `__tests__/tax-engine/transfer-tax/carryover-period-boundary.test.ts` | ☐ TODO |
| C-05 | 비교과세 — A < B → §97조의2 ② 3호 자동 적용배제, B 채택 | §97조의2 ② 3호 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-comparison-exclusion.test.ts` | ☐ TODO |
| C-06 | 1세대1주택 비과세 사용자 체크 → 적용배제 ②2호, 일반 양도세 | §97조의2 ② 2호 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-exclusion-one-house.test.ts` | ☐ TODO |
| C-06b | **12억 초과 고가주택(1세대1주택) 사용자 체크 → 적용배제 ②2호 괄호** | §97조의2 ② 2호 (§89①3호 각 목, 고가주택 포함) | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-exclusion-high-price.test.ts` | ☐ TODO |
| C-07 | 사업인정고시일 2년 이전 증여 토지 수용, 사용자 체크 → 적용배제 ②1호 | §97조의2 ② 1호 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-exclusion-expropriation.test.ts` | ☐ TODO |
| C-08 | 배우자 사망 후 양도 (사망으로 혼인관계 소멸) → 관계 요건 불충족, 이월과세 미적용 | §97조의2 ① 단서 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-relation-invalid.test.ts` | ☐ TODO |
| C-09 | 증여자 취득가액 직접 입력(실거래가) → 환산 미사용, A·B 비교 | §97조의2 ①·② 3호 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-donor-actual-price.test.ts` | ☐ TODO |
| C-10 | 증여자 취득가액 미확인 → APD 환산 (C-01과 동일 흐름, 환산 통합 검증) | §97조의2 ① 1호, §164⑤ | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-donor-estimated.test.ts` | ☐ TODO |
| C-11 | 직계존속(부) 증여 + 증여세 상당액 가산 → 필요경비 §163의2 산식 | §97조의2 ① 2호 전단, 시행령 §163의2 | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-gift-tax-expense.test.ts` | ☐ TODO |
| C-12 | 분양권 증여 후 양도 (시행령 §163의2 ① 위임) → 이월과세 적용 (10년) | §97조의2 ①, 시행령 §163의2 ① | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-presale-right.test.ts` | ☐ TODO |
| C-13 | 증여자 자본적지출(리모델링 5천만) + 수증자 추가 지출 합산, **양도일 2024.6.1** → 양자 합산 + swap 비교 | §97조의2 ① 2호 후단 (2023.12.31. 신설, **2024.1.1. 이후 양도분 시행**) | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-donor-capex.test.ts` | ☐ TODO |
| C-13b | C-13과 동일 구성, **양도일 2023.12.20** → 증여자 capex 산입 ❌ (시행시기 경계) | §97조의2 ① 2호 후단 부칙 | 직접 구성 (시행시기 경계 anchor) | `__tests__/tax-engine/transfer-tax/carryover-donor-capex.test.ts` | ☐ TODO |
| C-14 | 증여자 장기보유(2010.1.1 취득) → 수증자 단기양도(2025.3.1) → A < B (단기 70%) → B 채택 | §97조의2 ② 3호 (비교과세 의의) | 직접 구성 (회피방지 anchor) | `__tests__/tax-engine/transfer-tax/carryover-reverse-comparison.test.ts` | ☐ TODO |
| C-15 | 가업상속공제 적용 자산 입력 → validation 차단, "v1 미지원" 안내 | §97조의2 ④ | 직접 구성 | `__tests__/tax-engine/transfer-tax/carryover-family-business-block.test.ts` | ☐ TODO |

**규칙**:
- 행 1개 이상 충족 → Do 진입 가능.
- "anchor 출처 미발견" 행은 ☐ 유지, 발견 즉시 anchor 추가.
- 사용자 추가 케이스 → 먼저 이 표에 행 추가 → 그 다음 코드.

---

## 3. 법령 근거

### 3.1 조문 일람

| 조문 | 내용 |
|---|---|
| 소득세법 §97조의2 ① | 이월과세 본문 — 배우자/직계존비속 증여 자산, 10년(주식 1년) 이내 양도 시 |
| 소득세법 §97조의2 ① 1호 | 취득가액 = 증여자의 취득 당시 §97①1호 금액 |
| 소득세법 §97조의2 ① 2호 (전단) | 증여세 상당액을 필요경비에 가산 |
| 소득세법 §97조의2 ① 2호 (후단, 2023.12.31. 신설) | 증여자가 보유 중 지출한 자본적지출액(§97①2호)을 수증자 필요경비에 포함. **시행: 2024.1.1. 이후 양도분** |
| 소득세법 §97조의2 ② 1호 | 적용배제 — 사업인정고시일 2년 이전 증여 토지·건물 협의매수·수용 |
| 소득세법 §97조의2 ② 2호 | 적용배제 — 이월과세 적용 시 §89①3호 각 목 주택(고가주택 포함) 비과세 해당 |
| 소득세법 §97조의2 ② 3호 | 적용배제 — 이월과세 적용 결정세액 < 미적용 결정세액 (비교과세) |
| 소득세법 §97조의2 ③ | 기간 계산은 등기부에 기재된 소유기간 기준 — 기산일 = 증여 등기접수일 |
| 소득세법 §97조의2 ④ | 가업상속공제 적용 자산 특례 (v1 미지원, validation 차단) |
| 부칙 (2022.12.31. 법률 제19196호) | 2023.1.1. 이후 증여분부터 10년, 이전 증여분은 종전 5년 |
| 소득세법 §95 ④ | 보유기간 기산점 (증여자 취득일) — 단기보유·장기보유특별공제 모두 |
| 소득세법 시행령 §163의2 ① | "그 밖에 대통령령으로 정하는 자산" 범위 = §94①2호 가목(분양권·입주권) + §94①4호 나목(시설물이용권·회원권) |
| 소득세법 시행령 §163의2 (산식) | 증여세 상당액 = 증여세 × (해당 자산가액 / 증여재산총액) |

### 3.2 legal-codes 상수 (`lib/tax-engine/legal-codes/transfer.ts` 에 추가)

```ts
TRANSFER.CARRYOVER_TAXATION          = "소득세법 §97조의2";
TRANSFER.CARRYOVER_DONOR_BASIS       = "소득세법 §97조의2 ① 1호";
TRANSFER.CARRYOVER_GIFT_TAX_EXPENSE  = "소득세법 §97조의2 ① 2호 (전단)";
TRANSFER.CARRYOVER_DONOR_CAPEX       = "소득세법 §97조의2 ① 2호 (후단, 2023.12.31. 신설)";
TRANSFER.CARRYOVER_EXCLUSION         = "소득세법 §97조의2 ②";
TRANSFER.CARRYOVER_EXCL_HIGH_PRICE_HOUSE = "소득세법 §97조의2 ② 2호 (고가주택 포함 §89①3호)";
TRANSFER.CARRYOVER_COMPARISON        = "소득세법 §97조의2 ② 3호 (비교과세)";
TRANSFER.CARRYOVER_PERIOD_REGISTRY   = "소득세법 §97조의2 ③ (등기부 소유기간 기준)";
TRANSFER.CARRYOVER_FAMILY_BUSINESS   = "소득세법 §97조의2 ④ (가업상속공제 자산 특례)";
TRANSFER.CARRYOVER_HOLDING_PERIOD    = "소득세법 §95 ④";
TRANSFER.CARRYOVER_GIFT_TAX_FORMULA  = "소득세법 시행령 §163의2";
```

`npm run verify:legal` 통과 계획: 11개 상수 모두 법제처 API `소득세법` 원문 대조 후 통과.

---

## 4. 타입 설계

### 4.1 `TransferTaxInput` 신규 필드

`lib/tax-engine/types/transfer.types.ts` 의 `TransferTaxInput` 인터페이스에 추가.

```ts
/**
 * 취득 원인 (매매·상속·증여·이월과세증여).
 * "carryover_gift" = 소득세법 §97조의2 이월과세 대상 증여.
 * 기존 "gift"는 이월과세 미적용 단순 증여 취득 (하위 호환 유지).
 */
acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";

/**
 * 이월과세(배우자등 증여) 관련 입력.
 * acquisitionCause === "carryover_gift" 일 때만 유효.
 */
carryoverTaxation?: {
  /** 증여 등기접수일 — §97조의2 ③ 등기부 소유기간 기산점. UI 라벨: "증여 등기접수일" */
  giftRegistryDate: Date;
  /** 증여자의 취득일 — 보유기간·장기보유특별공제 기산점 (§95 ④) */
  donorAcquisitionDate: Date;
  /** 증여자의 취득가액 — 직접 입력 시. useEstimatedAcquisition=false 이면 필수 */
  donorAcquisitionPrice?: number;
  /** 환산취득가액 사용 여부 — true이면 PHD/APD 입력 경로로 자동 환산 */
  useEstimatedAcquisition: boolean;
  /**
   * 증여세 상당액 (사용자 직접 입력).
   * §163의2 산식: 증여세 × (해당 자산가액 / 증여재산총액) — UI에서 안내.
   */
  giftTaxAmount: number;
  /**
   * 증여자가 보유 중 지출한 자본적지출액 (§97조의2 ① 2호 후단, 2023.12.31. 신설).
   * 리모델링·증축·발코니확장 등.
   * 시행시기 가드: 양도일 < 2024-01-01 이면 엔진에서 0 처리, 결과에 경고 표시.
   */
  donorCapitalExpenditure?: number;
  /**
   * 증여 당시 평가액 (보충적평가액·시가 등) — 비교과세 Scenario B의 취득가액.
   * 환산취득가액 사용 여부와 무관하게 필수 입력.
   */
  giftDateValuation: number;
  /** 적용배제 — 사용자 선언 */
  exclusionDeclared?: {
    /** ② 1호 — 사업인정고시일 2년 이전 증여받은 토지·건물의 협의매수·수용 */
    expropriationWithin2Years?: boolean;
    /** ② 2호 — 이월과세 적용 시 §89①3호 비과세 해당 (12억 초과 고가주택 포함) */
    oneHouseExemptionApplies?: boolean;
    /** ④항 — 가업상속공제 적용 자산 (v1 미지원, validation에서 진행 차단) */
    isFamilyBusinessInheritedAsset?: boolean;
  };
};
```

### 4.2 `TransferTaxResult` 신규 필드

`lib/tax-engine/types/transfer.types.ts` 의 `TransferTaxResult` 인터페이스에 추가.

```ts
carryoverTaxationDetail?: {
  /** 적용 가능 여부 (기간·관계·자산 요건 모두 통과) */
  isEligible: boolean;
  /** 적용기간 (5년 or 10년) */
  applicablePeriodYears: 5 | 10;
  /** 적용배제 사유 (있을 시) */
  exclusionReason?: "expropriation" | "one_house_exemption" | "tax_comparison" | "period_exceeded" | "relation_invalid" | "family_business";
  /** Scenario A — 이월과세 적용 */
  scenarioA: {
    acquisitionPrice: number;          // 증여자 취득가액 (직접 또는 환산)
    holdingPeriodYears: number;        // 증여자 취득일 기산 보유연수
    giftTaxAddedToExpense: number;     // 필요경비 가산 — 증여세 상당액 (한도 적용 후)
    giftTaxLimitApplied: boolean;      // 한도 발동 여부 (시행령 §163의2 ② 단서)
    giftTaxLimitCap: number;           // 한도 캡 = gain_beforeGiftTax
    donorCapexAddedToExpense: number;  // 필요경비 가산 — 증여자 자본적지출 (양도일 ≥ 2024.1.1 시만)
    donorCapexGuardApplied: boolean;   // 시행시기 가드 발동 여부 (양도일 < 2024.1.1)
    effectiveCapex: number;            // 실제 합산 적용된 capex (수증자 + 증여자)
    transferGain: number;              // 양도차익 (증여세 상당액 차감 후 최종)
    determinedTax: number;             // 결정세액 (산출 - 세액공제·감면. 지방소득세 제외)
  };
  /** Scenario B — 미적용 (비교용) */
  scenarioB: {
    acquisitionPrice: number;          // 증여 당시 평가액 (giftDateValuation)
    holdingPeriodYears: number;        // 증여 등기접수일 기산 보유연수
    transferGain: number;              // 양도차익
    determinedTax: number;             // 결정세액
  };
  /** 채택 시나리오 (A·B 중 결정세액 큰 쪽) */
  adoptedScenario: "A" | "B";
  /** ② 3호 비교과세 적용배제 여부 (B 채택 시 true) */
  comparisonExclusion: boolean;
  /** 시행시기 가드 발동 여부 (양도일 < 2024.1.1 으로 donorCapex 무시됨) */
  donorCapexGuardApplied?: boolean;
};
```

> **설계 결정**: 비교과세 비교 대상은 §97조의2 ② 3호 법문 그대로 **"양도소득 결정세액"** (산출세액 - 세액공제·감면).
> 지방소득세·신고불성실가산세는 비교에 포함하지 않는다. 양도코리아 64,684,518 / 64,062,800 비교값이 이를 확인.

---

## 5. 계산 흐름

### 5.1 Orchestrator 분기 위치

`calculateTransferTax()` (transfer-tax.ts) 의 **STEP 0.45 상속 취득가액 의제** 직후,
**STEP 0.5 다주택 중과세 판정** 직전에 이월과세 분기를 삽입.

```
STEP 0.4  : pre1990Land 환산 (기존)
STEP 0.45 : 상속 취득가액 의제 (기존)
[NEW] STEP 0.475: 이월과세 판정 및 비교과세 실행
  → carryoverTaxation 없거나 acquisitionCause !== "carryover_gift" 이면 skip
  → calcCarryoverScenarios() 호출
  → 결과를 TransferTaxResult.carryoverTaxationDetail 에 저장
  → adoptedScenario === "A" 이면 input을 증여자 기준으로 재바인딩 (effectiveInput 교체)
  → adoptedScenario === "B" 이면 input 그대로 (수증자 기준)
STEP 0.5  : 다주택 중과세 판정 (기존) — effectiveInput 기준으로 실행
...
```

**중요**: Orchestrator는 재바인딩 후 기존 STEP 2~11 파이프라인을 그대로 통과.
이월과세 전용 별도 계산 경로를 만들지 않는다 — 채택 시나리오의 `effectiveInput`이 곧 주 계산에 사용된다.
`carryoverTaxationDetail`에는 A·B 두 시나리오 계산 상세가 모두 보존된다.

### 5.2 `calcCarryoverScenarios()` 신규 헬퍼 (transfer-tax-helpers.ts 에 추가)

```
function calcCarryoverScenarios(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  parsedRates: ParsedRates,
): { detail: CarryoverTaxationDetail; adoptedInput: TransferTaxInput } | null

/** 반환값이 null이면 이월과세 적용 불가 — Orchestrator가 skip */
```

#### 내부 의사코드

```
1. 입력 존재 확인
   if (!rawInput.carryoverTaxation || rawInput.acquisitionCause !== "carryover_gift") return null;
   const ct = rawInput.carryoverTaxation;

2. 적용 판정 (isEligible 결정)
   2a. 가업상속공제 자산 체크 → isFamilyBusinessInheritedAsset === true → validation에서 이미 차단.
       엔진 방어코드: return { detail: { isEligible: false, exclusionReason: "family_business", ... } }
   2b. 기간 판정:
       applicablePeriodYears = ct.giftRegistryDate < new Date("2023-01-01") ? 5 : 10;
       elapsedMs = rawInput.transferDate.getTime() - ct.giftRegistryDate.getTime();
       elapsedDays = Math.floor(elapsedMs / 86_400_000);
       limitDays = applicablePeriodYears === 5
         ? calcExactDays(ct.giftRegistryDate, addYears(ct.giftRegistryDate, 5))
         : calcExactDays(ct.giftRegistryDate, addYears(ct.giftRegistryDate, 10));
       // 일수 기반 정밀 비교 — 연 단위 반올림 금지 (§97조의2 ③ "등기부 소유기간")
       if (elapsedDays > limitDays) return { isEligible: false, exclusionReason: "period_exceeded", ... }
   2c. 사용자 선언 적용배제:
       if (ct.exclusionDeclared?.expropriationWithin2Years) → exclusionReason: "expropriation"
       if (ct.exclusionDeclared?.oneHouseExemptionApplies) → exclusionReason: "one_house_exemption"
       (* 각각 return { isEligible: false, ... } )

3. 시행시기 가드 (donorCapex)
   DONOR_CAPEX_EFFECTIVE_DATE = new Date("2024-01-01");
   donorCapexGuardApplied = rawInput.transferDate < DONOR_CAPEX_EFFECTIVE_DATE;
   effectiveDonorCapex = donorCapexGuardApplied ? 0 : (ct.donorCapitalExpenditure ?? 0);

4. Scenario A — 이월과세 적용 시나리오
   4a. 취득가액 결정:
       if (ct.useEstimatedAcquisition) {
         donorAcqPrice = calcEstimatedAcqFromPHDOrAPD(rawInput);
         // rawInput.preHousingDisclosure 또는 rawInput.apartmentPreDisclosure 입력이 있으면
         // 해당 환산 모듈(calcPreHousingDisclosureGain / calcApartmentPreDisclosureGain)을 재사용
         // 없으면 단순 환산: transferPrice × (stdPriceAtDonorAcq / stdPriceAtTransfer)
       } else {
         donorAcqPrice = ct.donorAcquisitionPrice ?? 0;
       }
   4b. 필요경비 합산 (swap 통합 핵심):
       effectiveCapex = (rawInput.capitalExpenditure ?? 0) + effectiveDonorCapex;
       // ↑ 수증자 자본적지출 + 증여자 자본적지출 합산 — directSide 계산에 반영
       giftTaxAddedToExpense = ct.giftTaxAmount;
       // giftTaxAmount는 별도 필요경비 가산 (swap 비교 기준 밖)
   4c. Scenario A용 TransferTaxInput 구성 (inputA):
       {
         ...rawInput,
         acquisitionPrice: donorAcqPrice,
         acquisitionDate: ct.donorAcquisitionDate,  // §95 ④ 보유기간 기산
         capitalExpenditure: effectiveCapex,         // 합산된 capex
         expenses: rawInput.expenses + giftTaxAddedToExpense + effectiveDonorCapex,
         // 주: 실가 모드에서는 legacy expenses fallback이 동작하므로
         //     증여세 상당액은 아래 별도 가산 방식으로 처리
         carryoverTaxation: undefined,               // 재귀 방지
         acquisitionCause: "gift",                   // 하위 호환 (단순 증여로 처리)
       }
   4d. calculateTransferTax(inputA, rates) 호출 → resultA
   4e. determinedTaxA = resultA.determinedTax

5. Scenario B — 미적용 시나리오
   5a. inputB:
       {
         ...rawInput,
         acquisitionPrice: ct.giftDateValuation,     // 증여 당시 평가액
         acquisitionDate: ct.giftRegistryDate,        // 수증자 등기접수일
         useEstimatedAcquisition: false,              // 환산 없이 실가
         capitalExpenditure: rawInput.capitalExpenditure, // 수증자 capex만 (증여자 capex 제외)
         carryoverTaxation: undefined,               // 재귀 방지
         acquisitionCause: "purchase",               // B는 일반 취득으로 처리
       }
   5b. calculateTransferTax(inputB, rates) 호출 → resultB
   5c. determinedTaxB = resultB.determinedTax

6. 비교과세 (§97조의2 ② 3호)
   if (determinedTaxA >= determinedTaxB) {
     adoptedScenario = "A";
     comparisonExclusion = false;
   } else {
     adoptedScenario = "B";
     comparisonExclusion = true;   // 이월과세 미적용 (비교과세 ② 3호)
   }

7. 반환
   return {
     detail: {
       isEligible: true,
       applicablePeriodYears,
       scenarioA: { acquisitionPrice: donorAcqPrice, holdingPeriodYears, giftTaxAddedToExpense, donorCapexAddedToExpense: effectiveDonorCapex, effectiveCapex, transferGain: resultA.transferGain, determinedTax: determinedTaxA },
       scenarioB: { acquisitionPrice: ct.giftDateValuation, holdingPeriodYears: scenarioBHolding, transferGain: resultB.transferGain, determinedTax: determinedTaxB },
       adoptedScenario,
       comparisonExclusion,
       donorCapexGuardApplied,
     },
     adoptedInput: adoptedScenario === "A" ? inputA : inputB,
   };
```

---

## 6. swap 통합 의사코드 상세

### 6.1 배경

기존 `calcNecessaryExpense()` 는 `(환산취득가 + 개산공제)` vs `(capitalExpenditure + transferExpense)` 를 비교하여 큰 쪽을 필요경비로 swap한다 (§97② 2호 단서).

이월과세 적용(Scenario A)에서는 **증여자 자본적지출(donorCapitalExpenditure)을 수증자 자본적지출(capitalExpenditure)에 합산**하여 `directSide`를 구성해야 한다.

### 6.2 Scenario A에서 effectiveCapex 합산

```
// §97조의2 ① 2호 후단 (2024.1.1 이후 양도분)
effectiveDonorCapex = donorCapexGuardApplied ? 0 : (ct.donorCapitalExpenditure ?? 0);

// directSide = 수증자 자본적지출 + 증여자 자본적지출 + 양도비
effectiveCapex = (rawInput.capitalExpenditure ?? 0) + effectiveDonorCapex;
inputA.capitalExpenditure = effectiveCapex;

// calcNecessaryExpense()가 내부에서:
//   directSide = effectiveCapex + (rawInput.transferExpense ?? 0)
//   estimatedSide = estimatedBase + estimatedDeduction (APD 환산 모드 시)
//   swap 조건: directSide > estimatedSide
```

### 6.3 Scenario B에서 증여자 capex 제외

```
inputB.capitalExpenditure = rawInput.capitalExpenditure ?? undefined;
// donorCapitalExpenditure는 B에서 산입 안 함 (수증자 취득가액 기준)
```

### 6.4 swap 발동 예시 (C-13)

```
환산취득가 1.5억 + 개산공제 0.05억 = estimatedSide 1.55억
수증자 capex 0.08억 + 증여자 capex 0.1억 = effectiveCapex 0.18억
양도비 0.02억
directSide = 0.18억 + 0.02억 = 0.2억

0.2억 < 1.55억 → swap 미발동, 환산취득가 적용

(증여자 capex 5천만으로 증가 시)
effectiveCapex = 0.08억 + 0.5억 = 0.58억
directSide = 0.58억 + 0.02억 = 0.6억
1.55억 > 0.6억 → swap 미발동

(환산취득가가 낮고 directSide가 클 때 swap 발동)
```

### 6.5 증여세 상당액 처리 (M-4 결정, 2026-05-04)

**B안 — 별도 라인 차감 + 내부 합산** + **시행령 §163의2 ② 단서 한도 적용**.

#### 6.5.1 한도 산식 (시행령 §163의2 ② 단서)

```
giftTaxLimitCap = transferGain_beforeGiftTax
                = 양도가액 - (취득가액 + §97② 필요경비 + 증여자 자본적지출)
                  ※ 증여세 가산 직전 양도차익

giftTaxAddedToExpense = min(ct.giftTaxAmount, giftTaxLimitCap)
giftTaxLimitApplied   = (ct.giftTaxAmount > giftTaxLimitCap)
```

> **사용자 입력 의미**: `ct.giftTaxAmount`는 사용자가 시행령 §163의2 ② 산식 (`증여세산출세액 × 양도자산가액 / 전체증여세과세가액`)으로 **사전 계산한 값**. UI에서 `LawArticleModal`로 산식 안내. 한도(잔액 한도)는 엔진이 자동 적용.

#### 6.5.2 결과 객체 노출

```ts
scenarioA: {
  ...
  giftTaxAddedToExpense: number;      // 한도 적용 후 실제 가산 금액
  giftTaxLimitApplied: boolean;        // 한도 발동 여부
  giftTaxLimitCap: number;             // 한도 캡 (양도차익 잔액)
  donorCapexAddedToExpense: number;    // 증여자 capex (시행시기 가드 후)
}
```

결과 카드 표시 (UI 시니어 책임):
- "증여세 상당액 가산: ○○ (한도 ○○ 적용)" — 한도 발동 시
- "증여세 상당액 가산: ○○" — 한도 미발동 시

#### 6.5.3 swap 비교 기준에서 제외

증여세 상당액은 **§97② 2호 swap 비교 대상이 아님** (법문상 별도 가산 항목). 따라서:
- swap 비교의 `directSide` = 수증자 capex + 증여자 capex(시행시기 통과 시) + 양도비
- swap 비교의 `estimatedSide` = 환산취득가 + 개산공제
- swap 결정 후 `gain = transferPrice - acquisitionPrice - swappedExpenses - giftTaxAddedToExpense`

#### 6.5.4 구현 방식

`calcCarryoverScenarios()` 내부 Step (한도 적용 추가):
```
Step A-1: gain_beforeGiftTax 계산 (기존 calcTransferGain 호출, expenses에는 capex/양도비/증여자 capex만 합산)
Step A-2: giftTaxLimitCap = max(0, gain_beforeGiftTax)
Step A-3: giftTaxAddedToExpense = min(ct.giftTaxAmount, giftTaxLimitCap)
Step A-4: scenarioA.transferGain = gain_beforeGiftTax - giftTaxAddedToExpense
```

> **호출 패턴**: `calcNecessaryExpense()` 는 변경 없이 유지. `expenses` 필드에는 증여세 상당액을 합산하지 않고, gain 계산 후 별도 차감하는 방식으로 한도 산출 정확도 보장.

---

## 7. 적용 판정 로직 상세

### 7.1 판정 순서 (우선순위 높은 순)

```
Priority 1: ④항 가업상속공제 자산 → validation 차단 (엔진 진입 전)
Priority 2: carryoverTaxation 미입력 또는 acquisitionCause !== "carryover_gift" → skip (null 반환)
Priority 3: 기간 초과 판정 (§97조의2 ③, 일수 기반 정밀 비교)
Priority 4: 사용자 선언 배제 ②1호 (expropriationWithin2Years)
Priority 5: 사용자 선언 배제 ②2호 (oneHouseExemptionApplies)
Priority 6: 자동 비교과세 ②3호 (A < B → B 채택, comparisonExclusion = true)
```

Priority 3~5가 해당하면 `isEligible: false`로 반환, 이월과세 미적용.
Priority 6은 `isEligible: true`지만 `adoptedScenario: "B"` (비교과세 자동 적용).

### 7.2 기간 계산 정밀도

```ts
// 일수 기반 — 연 단위 반올림 금지 (C-03·C-04 anchor)
const CUTOFF_DATE = new Date("2023-01-01");  // 10년 룰 시작
const applicablePeriodYears: 5 | 10 = ct.giftRegistryDate < CUTOFF_DATE ? 5 : 10;

const limitDate = addYears(ct.giftRegistryDate, applicablePeriodYears);
// transferDate > limitDate이면 기간 초과
// date-fns addYears() 가 윤년 2/29 → 2/28 처리를 담당
const isPeriodExceeded = rawInput.transferDate > limitDate;
```

### 7.3 증여일 기준 적용기간 매트릭스

| 증여 등기접수일 | 적용기간 | 기준 |
|---|---|---|
| ~2022.12.31 | 5년 | 종전 §97조의2 |
| 2023.1.1~ | 10년 | 부칙 (2022.12.31. 법률 제19196호) |

### 7.4 자산 범위 (v1)

이월과세 적용 가능한 자산 (`TransferTaxInput.propertyType`):

| 자산 종류 | propertyType | 포함 여부 |
|---|---|---|
| 토지 | `"land"` | ☑ (§94①1호) |
| 건물 | `"building"` | ☑ (§94①1호) |
| 주택 | `"housing"` | ☑ (§94①1호) |
| 복합주택 | `"mixed-use-house"` | ☑ (§94①1호) |
| 분양권·입주권 | `"presale_right"`, `"right_to_move_in"` | ☑ (§94①2호 가목, 시행령 §163의2 ① 확정) |
| 시설물이용권 | (별도 propertyType 추가 시) | ☑ (§94①4호 나목, 시행령 §163의2 ① 확정) |
| 주식 | — | ❌ v2 |

---

## 8. PHD/APD 환산 재사용 방식

### 8.1 현재 환산 모듈

| 모듈 | 함수 | 적용 케이스 |
|---|---|---|
| `transfer-tax-pre-housing-disclosure.ts` | `calcPreHousingDisclosureGain()` | 개별주택가격 미공시 (PHD) |
| `transfer-tax-apartment-pre-disclosure.ts` | `calcApartmentPreDisclosureGain()` | 공동주택 최초고시 전 취득 (APD) |
| `transfer-tax-helpers.ts` | `calcNecessaryExpense()` → `calculateEstimatedAcquisitionPrice()` | 기준시가 직접 입력 + 환산공식 |

### 8.2 Scenario A에서 재사용 전략

```
if (ct.useEstimatedAcquisition) {
  if (rawInput.preHousingDisclosure) {
    // PHD 환산: calcPreHousingDisclosureGain 호출
    // → result.estimatedAcquisitionPrice 가 donorAcqPrice
  } else if (rawInput.apartmentPreDisclosure) {
    // APD 환산: calcApartmentPreDisclosureGain 호출
    // → result.totalEstAcq (or 해당 필드) 가 donorAcqPrice
  } else {
    // 기준시가 직접 입력 방식
    // donorAcqPrice = calculateEstimatedAcquisitionPrice(
    //   rawInput.transferPrice,
    //   ct.donorStandardPriceAtAcquisition,  // 신규 입력 필드 (증여자 취득시 기준시가)
    //   rawInput.standardPriceAtTransfer,
    // )
  }
}
```

> **C-01 anchor 주의**: 양도코리아 사례 24는 APD 환산을 사용한다. `calcApartmentPreDisclosureGain()` 재사용 시 입력 구조가 `rawInput.apartmentPreDisclosure`에 있어야 한다. 기존 환산 모듈과의 입력 경로 통일성을 Design 단계에서 확정한다.

### 8.3 기준시가 직접 입력 경로 (환산 모듈 없을 때)

`ct.useEstimatedAcquisition === true`이고 PHD/APD 입력이 없는 경우:

> **M-1 결정 (2026-05-04)**: **별도 필드 추가하지 않음**. `donorStandardPriceAtAcquisition` 같은 신규 필드 대신, **기존 PHD/APD 입력 폼을 그대로 재사용**한다.
> - API 변환 단계(`lib/calc/transfer-tax-api.ts`)에서 `acquisitionDate = ct.donorAcquisitionDate`로 자동 주입
> - PHD/APD 입력 폼의 "취득일" 의미가 carryover 모드에서는 "증여자 취득일"을 가리키도록 UI 라벨에 명확화 (UI 시니어 책임)
> - 장점: 기존 PHD/APD 환산 검증 로직 그대로 작동, 신규 필드 0개

---

## 9. 비교과세 알고리즘 상세

### 9.1 결정세액 정의 (비교 기준)

§97조의2 ② 3호 법문: "이월과세를 적용하여 계산한 **양도소득 결정세액**이 이월과세를 적용하지 않고 계산한 **양도소득 결정세액**보다 적은 경우"

```
결정세액 = 산출세액 - 세액공제·세액감면
         (농특세·지방소득세·신고불성실가산세 제외)
```

`calculateTransferTax()` 반환의 `determinedTax` 필드가 이에 해당.

### 9.2 채택 결정 규칙

```
if (determinedTaxA >= determinedTaxB) {
  // 이월과세 A가 크거나 같음 → A 적용 (법 취지: 회피 방지)
  adoptedScenario = "A";
  comparisonExclusion = false;
} else {
  // 이월과세 A가 더 작음 → §97조의2 ② 3호 적용배제 → B 채택
  adoptedScenario = "B";
  comparisonExclusion = true;
}
```

**동률(A === B) 처리**: A 채택 (단서 조건은 "적은 경우" — 동률은 적용 유지).

### 9.3 C-14 역전 패턴 (비교과세 의의)

```
증여자 취득일: 2010-01-01 (보유 15년)
증여일: 2024-06-01
수증자 양도일: 2025-03-01 (증여 후 9개월)

Scenario A (이월과세 적용):
  취득일 = 2010-01-01 (증여자 기준)
  보유기간 = 15년
  → 장기보유특별공제 적용 가능
  → 누진세율 적용
  → determinedTaxA (상대적 낮음)

Scenario B (미적용):
  취득일 = 2024-06-01 (등기접수일)
  보유기간 = 9개월 (1년 미만)
  → 단기보유 70% 단일세율 (§104①1호)
  → determinedTaxB (상대적 높음)

결과: A < B → §97조의2 ② 3호 → B 채택 → 단기 70% 적용
비교과세 의의: 단기 차익 실현 회피 방지
```

---

## 10. 회귀 영향 분석

### 10.1 기존 `acquisitionCause: "gift"` 분기

현재 `gift` 값은 `donorAcquisitionDate`와 조합하여 단기보유세율 판정(§104①1호) 시 증여자 취득일로 기산하는 데만 사용된다.

- `"gift"` 는 기존 동작 유지 (단순 증여, 이월과세 미적용)
- `"carryover_gift"` 신규 추가 → 이월과세 경로로 진입
- 기존 `"gift"` 입력을 사용 중인 코드는 수정 없이 하위 호환 유지

### 10.2 기존 `donorAcquisitionDate` 필드

```ts
// 기존 (transfer.types.ts ~L100)
/** 상속 시 피상속인 취득일 — 단기보유 단일세율 판정 보유기간 통산용 */
donorAcquisitionDate?: Date;
```

이월과세 Scenario A에서는 `carryoverTaxation.donorAcquisitionDate`를 사용한다.
Orchestrator가 `inputA` 구성 시 `acquisitionDate: ct.donorAcquisitionDate`로 교체하면
기존 `donorAcquisitionDate` 필드는 그대로 유지 (상속 케이스용).

### 10.3 보유기간 기산점 (§95 ④)

`calcLongTermHoldingDeduction()` 은 `input.acquisitionDate`를 기준으로 보유기간을 계산.
Scenario A에서 `inputA.acquisitionDate = ct.donorAcquisitionDate`로 교체하면
기존 함수 변경 없이 증여자 취득일 기산이 자동 적용된다.

### 10.4 중과세 (다주택·비사업용토지)

다주택 중과세와 조정대상지역 판정은 **수증자(양도자) 기준**으로 그대로 적용.
이월과세 Scenario A에서도 `houses[]`, `isRegulatedArea` 등은 변경 없이 유지.

> **판정 시점 구분 (M-3 결정, 2026-05-04)**:
> - 비과세(1세대1주택): 취득일 기준 조정대상지역 판단 (`wasRegulatedAtAcquisition`)
>   → **Scenario A에서는 증여자 취득일 기준** (§97조의2 ① 1호 — 취득가액·취득일 모두 증여자 기준이므로 "취득 당시" 의미 일관)
>   → Scenario B는 수증자 증여 등기접수일 기준 (당연)
> - 중과세(다주택): 양도일 기준 조정대상지역 (`isRegulatedArea`) — 양 시나리오 공통, 변경 없음

### 10.5 기존 코드 변경 범위 요약

| 파일 | 변경 종류 | 영향 |
|---|---|---|
| `types/transfer.types.ts` | `acquisitionCause` 유니온 확장 + `carryoverTaxation?` 추가 + `carryoverTaxationDetail?` 결과 필드 | optional 추가 — 기존 코드 컴파일 영향 없음 |
| `transfer-tax.ts` | STEP 0.475 분기 삽입 (~50줄) | Orchestrator 파일 800줄 초과 시 helpers 분리 필요 |
| `transfer-tax-helpers.ts` | `calcCarryoverScenarios()` 함수 추가 (~150줄) | 신규 함수, 기존 함수 영향 없음 |
| `legal-codes/transfer.ts` | 상수 11개 추가 | 기존 상수 변경 없음 |
| `lib/calc/transfer-tax-validate.ts` | `carryover_gift` 선택 시 필수 필드 validation + ④항 차단 | 기존 케이스 validation 영향 없음 |

---

## 11. 테스트 계획

### 11.1 파일 구성

```
__tests__/tax-engine/transfer-tax/
  carryover-pdf-case24.test.ts       ← C-01 (양도코리아 캡처 anchor)
  carryover-period-10yr.test.ts      ← C-02
  carryover-period-boundary.test.ts  ← C-03, C-04 (경계값)
  carryover-comparison-exclusion.test.ts  ← C-05 (A < B)
  carryover-exclusion-one-house.test.ts   ← C-06
  carryover-exclusion-high-price.test.ts  ← C-06b (고가주택)
  carryover-exclusion-expropriation.test.ts ← C-07
  carryover-relation-invalid.test.ts  ← C-08 (사망 후 양도)
  carryover-donor-actual-price.test.ts ← C-09
  carryover-donor-estimated.test.ts   ← C-10 (APD 환산 통합)
  carryover-gift-tax-expense.test.ts  ← C-11 (§163의2 산식)
  carryover-presale-right.test.ts     ← C-12 (분양권)
  carryover-donor-capex.test.ts       ← C-13, C-13b (시행시기 경계)
  carryover-reverse-comparison.test.ts ← C-14 (비교과세 역전)
  carryover-family-business-block.test.ts ← C-15 (validation 차단)
```

총 17개 시나리오 × 파일 (일부 통합 파일).

### 11.2 C-01 anchor 정확값 (양도코리아 캡처)

```ts
// C-01: PDF 사례 24 — 배우자 이월과세 + APD 환산
// 증여일 2018.06.19 (5년 룰) / 양도일 2023.02.16
expect(result.carryoverTaxationDetail?.scenarioA.acquisitionPrice)
  .toBe(356_171_284);                // 환산취득가

expect(result.carryoverTaxationDetail?.scenarioA.determinedTax)
  .toBe(64_684_518);                 // Scenario A 결정세액

expect(result.carryoverTaxationDetail?.scenarioB.determinedTax)
  .toBe(64_062_800);                 // Scenario B 결정세액

expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("A");  // A > B
expect(result.determinedTax).toBe(64_684_518);                       // 최종 결정세액
```

> **불일치 시 처리**: 우리 엔진과 양도코리아의 정수 연산 방식 차이(개산공제 적용 순서, LTHD 계산법 등)가 있을 경우, Design 단계에서 차이 원인을 명시하고 우리 엔진의 법령 준거 계산값을 anchor로 확정한 후 Do 진입.

### 11.3 C-13·C-13b 시행시기 경계 anchor

```ts
// C-13: 양도일 2024.6.1 — 증여자 capex 산입 ☑
expect(scenarioA.donorCapexAddedToExpense).toBe(50_000_000);  // 5천만 산입
expect(scenarioA.effectiveCapex).toBe(130_000_000);           // 수증자 8천만 + 증여자 5천만

// C-13b: 양도일 2023.12.20 — 증여자 capex 산입 ❌ (시행 전)
expect(result.carryoverTaxationDetail?.donorCapexGuardApplied).toBe(true);
expect(scenarioA.donorCapexAddedToExpense).toBe(0);           // 산입 없음
expect(scenarioA.effectiveCapex).toBe(80_000_000);            // 수증자 8천만만
```

### 11.4 PDF 예시값 원단위 anchor 원칙

`feedback_pdf_example_test_anchoring.md` 정책에 따라, 교재·집행기준·양도코리아 예제 수치는 모두 **원단위 `toBe()`**로 고정. `toBeCloseTo()` 사용 금지.

---

## 12. Silent fallback / 자동 안분 후보 식별

`feedback_no_silent_apportion_fallback.md` 정책에 따라 아래 필드는 빈 값 자동 채우기 금지.

| 필드 | 미입력 시 처리 |
|---|---|
| `carryoverTaxation.giftRegistryDate` | validation에서 필수 오류 차단 |
| `carryoverTaxation.donorAcquisitionDate` | validation에서 필수 오류 차단 |
| `carryoverTaxation.giftTaxAmount` | 0 허용 (실제 증여세 0원 케이스 가능). 0 입력 시 미가산 |
| `carryoverTaxation.giftDateValuation` | validation에서 필수 오류 차단 |
| `carryoverTaxation.donorAcquisitionPrice` | `useEstimatedAcquisition: false` 이면 필수. `true` 이면 환산으로 대체 (silent fallback 아님 — 명시적 환산 경로) |
| `carryoverTaxation.donorCapitalExpenditure` | 미입력 = 0 처리 (자본적지출 없는 케이스), validation 차단 불필요 |

---

## 13. 8개 동기화 지점 매핑 (UI 시니어 책임 — 엔진 참조용)

엔진이 변경하는 input/result 타입 변경에 대응하는 8개 동기화 지점 요약. 상세는 `transfer-tax-carryover-taxation.ui.design.md` 참조.

| # | 위치 | 변경 내용 |
|---|---|---|
| ① 폼 상태 타입 | `lib/stores/calc-wizard-asset-residence.ts` `AssetForm` | `acquisitionCause: "carryover_gift"` 추가 + `carryover` 서브객체 |
| ② initial value | 동일 파일 `defaultAssetForm` | `carryover: { giftRegistryDate: undefined, donorAcquisitionDate: undefined, ... }` |
| ③ normalize fallback | `normalizeAssetForm` | `carryover_gift` 외 케이스에서 carryover 객체 stripping |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | `carryover_gift` 분기 → `carryoverTaxation` 매핑 + `donorAcquisitionDate` 채움 |
| ⑤ UI 입력 위젯 | `components/calc/transfer/CarryoverGiftBlock.tsx` (신규) | 취득원인 "이월과세(증여)" 옵션 + 펼침 섹션 |
| ⑥ 사이드바 합계 | `components/calc/transfer/AcquisitionSummary.tsx` | 증여세 상당액·증여자 capex 표시 |
| ⑦ 결과 카드 산식 | `components/calc/results/transfer/CarryoverComparisonCard.tsx` (신규) | A·B 나란히 + 채택 ✓ |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` | (a) 필수 필드 체크 (b) ④항 차단 (c) donorCapex 음수 차단 |

---

## 14. 미결 사항 (Do 진입 전 확정 필요) — **모두 해소 (2026-05-04)**

| # | 사항 | 결정 |
|---|---|---|
| M-1 | 기준시가 직접 입력 환산 경로 | ✅ **별도 필드 불필요**. 기존 PHD/APD 입력 폼 재사용 + API 변환 어댑터에서 `acquisitionDate = ct.donorAcquisitionDate` 자동 주입 |
| M-2 | APD 환산 입력 경로 통일 | ✅ **`rawInput.apartmentPreDisclosure` 재사용**. carryover_gift 모드에서 `apartmentPreDisclosure.acquisitionDate`에 `ct.donorAcquisitionDate` 주입 어댑터 한 줄 추가. C-01 anchor가 정확히 이 케이스 |
| M-3 | Scenario A 조정대상지역 판정 시점 | ✅ **증여자 취득일 기준** (§97조의2 ① 1호 — 취득가액·취득일 모두 증여자 기준 일관). 양도시 조정지역 여부는 양도자=수증자 양도시점 기준 (불변) |
| M-4 | 증여세 상당액 가산 방식 + 한도 | ✅ **B안 — 별도 라인 차감 + 내부 합산**. <br>**한도 산식 (시행령 §163의2 ② 단서)**: <br>`giftTaxAddedToExpense = min(rawInput.carryoverTaxation.giftTaxAmount, scenarioA.transferGain_beforeGiftTax)` <br>여기서 `transferGain_beforeGiftTax = 양도가액 - (취득가액 + §97② 필요경비)` — 증여세 가산 직전 양도차익. <br>입력값으로 받는 `giftTaxAmount`는 사용자가 시행령 §163의2 ② 산식 (`증여세산출세액 × 양도자산가액 / 전체증여세과세가액`)으로 사전 계산한 값을 입력. <br>UI는 `LawArticleModal`로 산식 안내. <br>결과 객체에 `scenarioA.giftTaxLimitApplied: boolean` + `giftTaxLimitCap: number` 노출하여 한도 발동 시 결과 카드에 "한도 적용 (잔액 한도 ○○)" 라인 표시 |
| M-5 | C-01 정확값 불일치 처리 | ✅ **단계적 검증 + 임계값**: <br>① 차이 ≤ 100원 → 우리 값 anchor 채택 (정수 절사 차이 수용) <br>② 100원 < 차이 ≤ 1만원 → 차이 원인 분석(개산공제·LTHD·세율) 후 사유 명시 + 우리 값 anchor 채택 <br>③ 차이 > 1만원 → 사용자 확인 요청, Do 일시 중단 |

---

## UI 통합 위임

UI 측 명세는 `docs/02-design/features/transfer-tax-carryover-taxation.ui.design.md` 참조.
8개 동기화 지점은 UI 시니어(`transfer-tax-ui-senior`) 책임.
엔진 시니어는 §13에서 input/result 타입만 정의하고, UI 완성도 체크는 `ui-engine-sync-checker` 담당.
