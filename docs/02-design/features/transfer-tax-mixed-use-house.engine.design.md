# Design: 검용주택 양도소득세 — Engine·API·Test (분할)

**Main Doc**: `transfer-tax-mixed-use-house.design.md`
**작성일**: 2026-04-29
**개정**: 2026-04-29 v2 — 젠스파크 검토 반영 (12억 안분/비사업용 이전 교차 처리 명문화, 신규 split 함수, 계산 경로 메타, 보유기간 규칙)
**범위**: 데이터 모델, 엔진 알고리즘 STEP 1~9, Orchestrator 분기, API Zod 스키마, 테스트 매트릭스, 법령 매핑, 에지 케이스

---

## 0. 개정 이력 (Change Log)

| 일자 | 변경 | 사유 |
|---|---|---|
| 2026-04-29 v1 | 초안 — calcSplitGain 재사용 가정 | — |
| 2026-04-29 v2 | calcSplitGain 미재사용 명시 (`propertyType` 가드 우회 불가) → 신규 `calcHousingGainSplit`/`calcCommercialGainSplit` 작성 | 코드-문서 일치 |
| 2026-04-29 v2 | `buildHousingPart` 4단계 알고리즘 박스 추가 (① 비사업용 이전 → ② 12억 안분 → ③ 장기보유공제 → ④ 양도소득금액) | 12억 비과세 + 비사업용 이전 교차 처리 모호성 제거 (젠스파크 #3) |
| 2026-04-29 v2 | 보유기간 산정 규칙 표 추가 | 명문화 (젠스파크 #5) |
| 2026-04-29 v2 | `MixedUseCalculationRoute` 메타 5필드 추가 — 결과 카드에 계산 경로 노출 | 학습·검증 가치 (젠스파크 #4) |

---

## 1. 데이터 모델

### 1-A. 입력 타입 — `MixedUseAssetInput`

```ts
// lib/tax-engine/types/transfer-mixed-use.types.ts
export interface MixedUseAssetInput {
  isMixedUseHouse: true;

  // ── 면적 (㎡, 건축물대장) ──
  residentialFloorArea: number;       // 주택 연면적
  nonResidentialFloorArea: number;    // 상가·사무·근린·주차장 합계
  buildingFootprintArea: number;      // 1층 면적 = 부수토지 안분 기준
  totalLandArea: number;              // 전체 토지 면적

  // ── 분리 취득일 ──
  landAcquisitionDate: Date;          // 사례14 = 1992-01-01
  buildingAcquisitionDate: Date;      // 사례14 = 1997-09-12

  // ── 양도시 기준시가 ──
  transferStandardPrice: {
    housingPrice: number;             // 개별주택공시가격 (주택건물+주택부수토지 일괄)
    commercialBuildingPrice: number;  // 상가건물 기준시가 (토지 제외)
    landPricePerSqm: number;          // 개별공시지가 (원/㎡)
  };

  // ── 취득시 기준시가 ──
  acquisitionStandardPrice: {
    housingPrice?: number;            // PHD 토글 시 자동 환산
    commercialBuildingPrice: number;  // 1997 신축 시점 기준시가
    landPricePerSqm: number;          // 1992 시점
  };

  usePreHousingDisclosure?: boolean;  // PHD 3-시점 자동 환산 옵션
  residencePeriodYears: number;       // 거주연수 (표2 판정)
}
```

### 1-B. 파생값 (엔진 자동 산출)

```ts
export interface MixedUseDerivedAreas {
  residentialRatio: number;          // = residential / (residential + nonResidential)
  residentialLandArea: number;       // = totalLandArea × ratio
  commercialLandArea: number;        // = totalLandArea × (1 − ratio)
  residentialFootprintArea: number;  // = buildingFootprintArea × ratio
}
```

### 1-C. 출력 타입 — `MixedUseGainBreakdown`

```ts
export interface MixedUseGainBreakdown {
  splitMode: "post-2022" | "pre-2022-rejected";

  apportionment: {
    housingStandardPrice: number;     // 주택부분 = housingPrice
    commercialStandardPrice: number;  // 상가부분 = (공시지가×상가부수토지) + 상가건물
    housingRatio: number;
    housingTransferPrice: number;
    commercialTransferPrice: number;
  };

  housingPart: {
    estimatedAcquisitionPrice: number;
    landAcquisitionPortion: number;
    buildingAcquisitionPortion: number;
    transferGain: number;
    landTransferGain: number;
    buildingTransferGain: number;
    isExempt: boolean;
    proratedTaxableGain: number;
    longTermDeductionTable: 1 | 2;
    longTermDeductionRate: number;
    longTermDeductionAmount: number;
    incomeAmount: number;
    nonBusinessTransferRatio: number;
  };

  commercialPart: {
    estimatedAcquisitionPrice: number;
    landAcquisitionPortion: number;
    buildingAcquisitionPortion: number;
    transferGain: number;
    landTransferGain: number;
    buildingTransferGain: number;
    longTermDeductionRate: number;
    longTermDeductionAmount: number;
    incomeAmount: number;
  };

  nonBusinessLandPart: {
    excessArea: number;
    appliedMultiplier: 3 | 5 | 10;
    transferGain: number;
    longTermDeductionRate: number;
    longTermDeductionAmount: number;
    incomeAmount: number;
    additionalRate: 0.10;
  } | null;

  total: {
    aggregateIncome: number;
    basicDeduction: number;          // 250만원
    taxBase: number;
    taxByBasicRate: number;
    nonBusinessSurcharge: number;
    transferTax: number;
    localTax: number;
    totalPayable: number;
  };

  steps: MixedUseStep[];
  calculationRoute: MixedUseCalculationRoute;  // ← v2 추가 (학습·검증용 메타)
  warnings: string[];
}

export interface MixedUseStep {
  id: string;
  title: string;
  legalBasis: string;
  values: Array<{ label: string; value: number | string; isResult?: boolean }>;
}

/** 계산 경로 메타 — 결과 카드 하단에 "왜 이 세액인지" 설명용 노출 */
export interface MixedUseCalculationRoute {
  housingAcqPriceSource: "direct_input" | "phd_auto" | "missing";
  acquisitionConversionRoute: "section97_direct" | "phd_corrected";
  housingDeductionTableReason: string;     // "거주 25년 ≥ 2년 → 표2 ..."
  landMultiplierReason: string;            // "수도권 residential → 3배 (시행령 §168의12)"
  highValueRule: "below_threshold_exempt" | "above_threshold_prorated";
}
```

### 1-D. AssetForm 신규 필드 (`calc-wizard-asset.ts`)

```ts
// 모두 optional + 빈 문자열/false/0 기본값 (마이그레이션 호환)
isMixedUseHouse?: boolean;
residentialFloorArea?: string;
nonResidentialFloorArea?: string;
buildingFootprintArea?: string;
totalLandArea?: string;
residencePeriodYears?: string;
landAcquisitionDate?: string;        // 기존 hasSeperateLandAcquisitionDate 패턴
buildingAcquisitionDate?: string;    // 기존 acquisitionDate 매핑

// 시점별 기준시가 (분리계산용)
mixedTransferHousingPrice?: string;
mixedTransferCommercialBuildingPrice?: string;
mixedTransferLandPricePerSqm?: string;
mixedAcqHousingPrice?: string;
mixedAcqCommercialBuildingPrice?: string;
mixedAcqLandPricePerSqm?: string;

usePreHousingDisclosure?: boolean;
```

---

## 2. 엔진 핵심 알고리즘

### 2-A. 전체 파이프라인

```ts
// lib/tax-engine/transfer-tax-mixed-use.ts
const MIXED_USE_EFFECTIVE_DATE = new Date("2022-01-01");

export function calcMixedUseTransferTax(
  input: TransferTaxInput,
  asset: MixedUseAssetInput,
  legalCodes: TaxRateMap,
): MixedUseGainBreakdown {
  // STEP 1: 양도시점 분기
  if (input.transferDate < MIXED_USE_EFFECTIVE_DATE) {
    return rejectPre2022(asset, input);
  }

  const derived = computeDerivedAreas(asset);

  // STEP 2: 양도가액 안분 (주택부분/상가부분 기준시가 비율)
  const apportionment = apportionTransferPrice(input.transferPrice, asset, derived);

  // STEP 3: 주택부분 환산취득가액 (§97)
  const housingAcq = asset.usePreHousingDisclosure
    ? calcViaPHD(mapMixedUseToPHD(asset, derived))
    : calculateEstimatedAcquisitionPrice({
        transferPrice: apportionment.housingTransferPrice,
        transferStandardPrice: asset.transferStandardPrice.housingPrice,
        acquisitionStandardPrice: asset.acquisitionStandardPrice.housingPrice!,
      });

  // STEP 4: 주택 양도차익 (토지/건물 분리, 시행령 §166⑥)
  const housingGain = calcSplitGain({
    transferPrice: apportionment.housingTransferPrice,
    acquisitionPrice: housingAcq.amount,
    landAcquisitionDate: asset.landAcquisitionDate,
    buildingAcquisitionDate: asset.buildingAcquisitionDate,
    landStandardPriceAtAcquisition:
      asset.acquisitionStandardPrice.landPricePerSqm * derived.residentialLandArea,
    buildingStandardPriceAtAcquisition: 0, // 주택부분은 개별주택가격에 건물 포함
    transferDate: input.transferDate,
  });

  // STEP 5+6: buildHousingPart 4단계 처리 — 2-E 표 참조
  //   ① 비사업용 이전 → ② 12억 안분 → ③ 장기보유공제 → ④ 양도소득금액
  //   주의: 비사업용토지는 1세대1주택 비과세 대상이 아니므로 비사업용 이전분에 12억 안분 미적용
  const excessResult = calcExcessLandRatio(asset, derived);
  const housingPart = buildHousingPart(
    apportionment, housingAcq, housingGainSplit, excessResult, asset.residencePeriodYears,
  );
  // (12억 안분 결과: housingPart.proratedTaxableGain)
  // (비사업용 이전분: housingPart.nonBusinessTransferredGain)

  // STEP 7: 상가부분 (별도 환산취득가액 + 양도차익)
  const commercialAcq = calculateEstimatedAcquisitionPrice({
    transferPrice: apportionment.commercialTransferPrice,
    transferStandardPrice: apportionment.commercialStandardPrice,
    acquisitionStandardPrice:
      (asset.acquisitionStandardPrice.landPricePerSqm * derived.commercialLandArea) +
      asset.acquisitionStandardPrice.commercialBuildingPrice,
  });
  const commercialGain = calcSplitGain({ /* 상가 토지/건물 분리 */ });

  // STEP 8: 부분별 장기보유공제
  const housingTable: 1 | 2 = asset.residencePeriodYears >= 2 ? 2 : 1;
  const housingDeduction = applyLongTermDeduction({ table: housingTable, ... });
  const commercialDeduction = applyLongTermDeduction({ table: 1, ... });
  const nonBizDeduction = applyLongTermDeduction({ table: 1, ... });

  // STEP 9: 합산 세액
  const housingIncome = Math.max(0, housingProratedGain - housingDeduction.amount);
  const commercialIncome = Math.max(0, commercialGain.totalGain - commercialDeduction.amount);
  const nonBizIncome = Math.max(0, transferredGain - nonBizDeduction.amount);
  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - 2_500_000);
  const taxByBasicRate = applyBasicRate(taxBase, holdingYears, legalCodes);
  const nonBizSurcharge = applyNonBusinessSurcharge(nonBizIncome, 0.10);
  const transferTax = taxByBasicRate + nonBizSurcharge;
  const localTax = applyRate(transferTax, 0.10);

  return { /* ... */ };
}
```

### 2-B. STEP 2 양도가액 안분 (산식)

```ts
function apportionTransferPrice(
  transferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
) {
  const housingStandardPrice = asset.transferStandardPrice.housingPrice;
  const commercialStandardPrice =
    asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea +
    asset.transferStandardPrice.commercialBuildingPrice;

  const totalStandard = housingStandardPrice + commercialStandardPrice;
  const housingRatio = housingStandardPrice / totalStandard;

  const housingTransferPrice = Math.floor(transferPrice * housingRatio);
  const commercialTransferPrice = transferPrice - housingTransferPrice; // 잔액 처리

  return {
    housingStandardPrice,
    commercialStandardPrice,
    housingRatio,
    housingTransferPrice,
    commercialTransferPrice,
  };
}
```

### 2-C. STEP 6 주택→비사업용 면적·양도차익 이전

```ts
const multiplier = getHousingMultiplier({ isMetropolitan, urbanZone });
const allowedAttachedArea = derived.residentialFootprintArea * multiplier;
const excessArea = Math.max(0, derived.residentialLandArea - allowedAttachedArea);
const nonBizRatio = derived.residentialLandArea > 0
  ? excessArea / derived.residentialLandArea
  : 0;
const transferredGain = Math.floor(housingGain.landGain * nonBizRatio);
```

**사례14 검증**: 정착면적 100㎡ × 주택비율(91.78/610.66≒0.1503) = 15.03㎡ → × 3배 = 45.09㎡. 주택부수토지 = 168.3 × 0.1503 ≒ 25.30㎡ < 45.09㎡ → **초과 없음** (`excessArea = 0`).

### 2-D. STEP 8 장기보유공제 분기

```ts
function selectHousingDeductionTable(asset: MixedUseAssetInput): 1 | 2 {
  // 시행령 §159의4: 거주 2년 이상 → 거주공제 40% 가능 → 표2 적용
  // 거주 2년 미만 → 표1 (보유만, 최대 30%)
  return asset.residencePeriodYears >= 2 ? 2 : 1;
}
```

### 2-E. ★ buildHousingPart 4단계 처리 순서 (12억 안분 ⊕ 비사업용 이전 교차)

**중요**: 비사업용토지는 1세대1주택 비과세 대상이 아니므로 비사업용 이전된 양도차익에는 12억 안분이 적용되지 않는다. 그러나 단순히 비사업용 이전 후 잔여 양도차익에만 안분하지 않고, 처리 순서를 잘못 잡으면 이중 계산 또는 비사업용에 12억 비과세가 잘못 적용됨.

#### 정확한 처리 순서

| STEP | 동작 | 산식 |
|---|---|---|
| ① 비사업용 이전 (안분 전) | 주택 토지차익 중 배율초과 비율만큼 분리 | `nonBusinessTransferredGain = floor(landGain × nonBizRatio)`<br>`housingLandGainAfterNB = landGain − nonBusinessTransferredGain` |
| ② 12억 안분 (비사업용 제외 양도차익에만) | 1세대1주택 잔여 양도차익에만 § 89 ① 3호 단서 적용 | `proratio = (housingTransferPrice − 1,200,000,000) / housingTransferPrice`<br>`proratedLandGain = floor(max(housingLandGainAfterNB, 0) × proratio)`<br>`proratedBuildingGain = floor(max(buildingGain, 0) × proratio)`<br>`proratedTaxableGain = proratedLandGain + proratedBuildingGain` |
| ③ 장기보유공제 (안분 후 양도차익에 표율) | 토지/건물 보유연수 별 표율 적용 (단일주택 분리계산 패턴 일치) | `landDed = applyRate(proratedLandGain, landRate)`<br>`buildingDed = applyRate(proratedBuildingGain, buildingRate)`<br>`longTermDeductionAmount = landDed + buildingDed` |
| ④ 양도소득금액 | 안분 후 양도차익 − 공제액 | `incomeAmount = max(0, proratedTaxableGain − longTermDeductionAmount)` |

#### 비사업용토지 부분 (별도 카드)

```ts
nonBusinessLandPart = {
  transferGain: nonBusinessTransferredGain,    // ① 단계에서 분리된 토지차익 (12억 안분 X)
  longTermDeductionAmount: applyRate(transferGain, 표1율),  // 표1 적용
  incomeAmount: max(0, transferGain - longTermDeductionAmount),
  additionalRate: 0.10,                         // 합산 세액 계산 시 +10%p 가산
};
```

#### 잘못된 패턴 (이전 v1 구현 — 회귀 방어 필요)

```ts
// ❌ 안분 전 양도차익 전체에 12억 안분 적용
const proratedTaxableGain = floor(gainSplit.totalGain × proratio);
// ❌ 안분 안 된 양도차익에 표율 적용
const taxableLandGain = floor(landGain × (1 - nonBizRatio));
const longTermDeductionAmount = applyRate(taxableLandGain, 표율) + applyRate(buildingGain, 표율);
```

**문제**: `proratedTaxableGain`은 비사업용 이전분도 포함된 양도차익에 12억 안분 적용 → 비사업용토지에 1세대1주택 비과세가 잘못 적용됨. 또한 `proratedTaxableGain`(안분 후) − `longTermDeductionAmount`(안분 안 된 표율 적용) 산식이 단위 불일치.

#### 회귀 테스트 (SC-3b)

`__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts:340~390`:
- 양도가액 100억 + 주택공시가격 50억 + 토지 1,000㎡ → 주택 양도가액 12억 초과 + 배율초과 동시 발생
- `nonBusinessLandPart.transferGain === housingPart.nonBusinessTransferredGain` (12억 안분 X)
- `proratedTaxableGain === floor((landGain−transferred) × proratio) + floor(buildingGain × proratio)`

### 2-F. 보유기간 산정 규칙

| 부분 | 시작일 | 종료일 | 비고 |
|---|---|---|---|
| 주택부분 토지차익 | `landAcquisitionDate` (사례14: 1992-01-01) | `transferDate` | `calcHousingGainSplit.landHoldingYears` |
| 주택부분 건물차익 | `buildingAcquisitionDate` (사례14: 1997-09-12) | `transferDate` | `calcHousingGainSplit.buildingHoldingYears` |
| 상가부분 토지차익 | `landAcquisitionDate` | `transferDate` | `calcCommercialGainSplit.landHoldingYears` |
| 상가부분 건물차익 | `buildingAcquisitionDate` | `transferDate` | `calcCommercialGainSplit.buildingHoldingYears` |
| 비사업용토지 (이전분) | `landAcquisitionDate` (= 주택 토지와 동일) | `transferDate` | 표1, `housingGainSplit.landHoldingYears` 재사용 |

**근거**: 소득세법 시행령 §166⑥ — 토지·건물 분리 취득 시 각자의 보유기간으로 양도소득세 계산. 검용주택의 비사업용 이전분은 원래 주택부수토지에서 분리된 것이므로 토지 보유기간을 그대로 적용.

### 2-G. ★ calcSplitGain 미재사용 결정 (v2 변경)

**v1 가정**: 기존 `transfer-tax-split-gain.ts:79~150` `calcSplitGain` 함수 재사용.

**v2 결정**: **재사용 불가, 신규 함수 작성**.

#### 사유

`calcSplitGain` 본체 첫 두 줄:
```ts
if (!input.landAcquisitionDate) return null;
if (input.propertyType !== "housing" && input.propertyType !== "building") return null;
```

검용주택은 `propertyType === "mixed-use-house"`이므로 두 번째 가드에서 `null` 반환. 또한 `calcSplitGain`은 `TransferTaxInput` 전체를 받아 내부에서 토지/건물 비율을 추출하므로, 검용주택 입력 구조(주택/상가 분리)와 매핑이 복잡.

#### 신규 함수

| 함수 | 위치 | 역할 |
|---|---|---|
| `calcHousingGainSplit` | `transfer-tax-mixed-use-helpers.ts:113~166` | 주택부분 환산취득가액을 취득시 토지/건물 기준시가 비율로 안분 후 토지·건물 양도차익 분리 산출 |
| `calcCommercialGainSplit` | `transfer-tax-mixed-use-helpers.ts:172~232` | 상가부분에 대해 동일 패턴 (취득시 상가부수토지 + 상가건물 기준시가 비율로 안분) |

두 함수 모두 `calcSplitGain`과 동일한 산술 패턴(개산공제 §163⑥ 자동, 보유연수 분리 산정)을 따르되, 입력으로 `MixedUseAssetInput` + `MixedUseDerivedAreas`를 받아 `propertyType` 가드를 우회한다.

#### 어댑터 스펙

| 검용주택 입력 | calcSplitGain 등가 입력 (개념적) |
|---|---|
| `housingPart.transferPrice` | `transferPrice` |
| `housingAcq` (§97 환산) | `acquisitionPrice` (환산취득가) |
| `landAcquisitionDate` | `landAcquisitionDate` |
| `buildingAcquisitionDate` | `acquisitionDate` |
| `acqLandStd = landPricePerSqm × residentialLandArea` | `landStdAtAcquisition` |
| `acqHousingTotal − acqLandStd` | `buildingStdAtAcquisition` |
| 자동 (`useEstimatedAcquisition=true` 가정) | 개산공제 ON |

### 2-E. STEP 1 22.1.1 이전 양도일 거부

```ts
function rejectPre2022(asset, input): MixedUseGainBreakdown {
  return {
    splitMode: "pre-2022-rejected",
    apportionment: { /* 0 채움 */ },
    housingPart: { /* 0 채움 */ },
    commercialPart: { /* 0 채움 */ },
    nonBusinessLandPart: null,
    total: { /* 0 채움 */ },
    steps: [],
    warnings: [
      "2022.1.1 이전 양도분은 본 엔진 범위 외입니다. 단일 자산 모드로 재계산하세요.",
    ],
  };
}
```

---

## 3. Orchestrator 분기 (`transfer-tax.ts`)

```ts
export function calculateTransferTax(input: TransferTaxInput, ...): TransferTaxResult {
  // ... 기존 STEP 0.1 ~ 0.6 ...

  // STEP 0.7: 검용주택 분기
  for (const asset of input.assets) {
    if (asset.assetType === "mixed-use-house" && asset.mixedUse?.isMixedUseHouse) {
      const breakdown = calcMixedUseTransferTax(input, asset.mixedUse, rates);
      result.assetResults.push(toMixedUseAssetResult(breakdown));
      result.steps.push(...breakdown.steps);
      continue; // 검용주택은 자체 분리계산 → STEP 1~ 스킵
    }
    // 기존 단일 자산 처리
  }
}
```

---

## 4. API 계층 (Zod 스키마)

```ts
// app/api/calc/transfer-tax/route.ts (수정)
const mixedUseAssetSchema = z.object({
  isMixedUseHouse: z.literal(true),
  residentialFloorArea: z.number().positive(),
  nonResidentialFloorArea: z.number().positive(),
  buildingFootprintArea: z.number().positive(),
  totalLandArea: z.number().positive(),
  landAcquisitionDate: z.coerce.date(),
  buildingAcquisitionDate: z.coerce.date(),
  transferStandardPrice: z.object({
    housingPrice: z.number().nonnegative(),
    commercialBuildingPrice: z.number().nonnegative(),
    landPricePerSqm: z.number().nonnegative(),
  }),
  acquisitionStandardPrice: z.object({
    housingPrice: z.number().nonnegative().optional(),
    commercialBuildingPrice: z.number().nonnegative(),
    landPricePerSqm: z.number().nonnegative(),
  }),
  usePreHousingDisclosure: z.boolean().optional(),
  residencePeriodYears: z.number().nonnegative(),
});

const assetSchema = z.discriminatedUnion("assetType", [
  // ... 기존 자산 타입들
  z.object({
    assetType: z.literal("mixed-use-house"),
    mixedUse: mixedUseAssetSchema,
    // ... 공통 필드
  }),
]);
```

---

## 5. 테스트 매트릭스

### 5-A. Anchor 테스트 (사례14 정확값)

```ts
describe("사례14 — 1세대 1주택 + 상가 검용주택 분리계산", () => {
  it("anchor: 양도코리아 23번 메뉴 출력값과 원단위 일치", () => {
    const input = mixedUseFixture.case14();
    const result = calcMixedUseTransferTax(input.transferInput, input.asset, MOCK_RATES);

    // 양도가액 안분
    expect(result.apportionment.housingTransferPrice).toBe(/* 양도코리아 정확값 */);
    expect(result.apportionment.commercialTransferPrice).toBe(/* ... */);

    // 주택부분 (12억 초과 안분)
    expect(result.housingPart.proratedTaxableGain).toBe(/* ... */);
    expect(result.housingPart.longTermDeductionRate).toBe(0.80); // 23년 보유·25년 거주 → 표2 80%
    expect(result.housingPart.incomeAmount).toBe(/* ... */);

    // 상가부분 (표1 30%)
    expect(result.commercialPart.longTermDeductionRate).toBe(0.30);
    expect(result.commercialPart.incomeAmount).toBe(/* ... */);

    // 부수토지 배율초과 = 0
    expect(result.nonBusinessLandPart).toBeNull();

    // 합산
    expect(result.total.transferTax).toBe(/* ... */);
    expect(result.total.totalPayable).toBe(/* ... */);
  });
});
```

### 5-B. 9개 시나리오

| # | 시나리오 | 입력 변경 | 검증 포인트 |
|---|---|---|---|
| 1 | 사례14 anchor | 픽스처 그대로 | 양도코리아 출력 원단위 일치 |
| 2 | 부수토지 배율초과 = 0 | 사례14 그대로 | `nonBusinessLandPart === null` |
| 3 | 부수토지 배율초과 > 0 | 토지 면적 1,000㎡ | `excessArea > 0`, +10%p 가산 |
| 4 | 12억 미만 주택부분 | 양도가액 5억 | `isExempt === true`, 양도소득금액 0 |
| 5 | 12억 초과 주택부분 | 양도가액 15억, 주택비율 0.5 | 안분율 = (15억-12억)/15억 검증 |
| 6 | 분리 취득일 | 토지 1992 + 건물 1997 | 토지·건물 보유기간 각자 산정 |
| 7 | PHD 토글 ON | 1992~2005 미공시 | `calcViaPHD` 호출 경로 검증 |
| 8 | 거주 2년 미만 | residencePeriodYears = 1 | `longTermDeductionTable === 1` |
| 9 | 22.1.1 이전 양도일 | transferDate = 2021-12-31 | `splitMode === "pre-2022-rejected"`, warnings 노출 |

### 5-C. 회귀 테스트

- 단독주택·상가·토지 단일 자산 케이스: 검용주택 분기 추가 후에도 동일 세액
- 기존 1,484개 모두 통과 → 1,493+ 로 확장, 회귀 0건

---

## 6. 법령 매핑 (legal-codes 상수)

```ts
// lib/tax-engine/legal-codes/transfer.ts (수정)
export const TRANSFER = {
  // ... 기존 상수
  MIXED_USE_RULE: "소득세법 시행령 §160 ① 단서",       // 22.1.1 이후 강제 분리
  MIXED_USE_APPORTIONMENT: "소득세법 §99 + 시행령 §164", // 양도가액 기준시가 안분
  MIXED_USE_LAND_RATIO: "소득세법 시행령 §168의12",      // 부수토지 배율
  MIXED_USE_HIGH_VALUE: "소득세법 §89 ① 3호 단서",       // 12억 초과 비과세 안분
};
```

UI 결과 카드의 `LawArticleModal` trigger에 위 상수 사용.

---

## 7. 에지 케이스 / 오류 처리

| 케이스 | 처리 |
|---|---|
| 주택연면적 = 0 (전체 상가) | `isMixedUseHouse=false`로 자동 변경 권유 + 단일 상가 모드 안내 |
| 상가연면적 = 0 (전체 주택) | `isMixedUseHouse=false`로 자동 변경 권유 + 단일 주택 모드 안내 |
| 정착면적 > 전체 토지면적 | Zod 검증 단계에서 reject |
| 양도가액 안분 분모 = 0 | 양도시 기준시가 모두 0 → "기준시가 입력 필수" 에러 |
| 환산취득가액 산정 시 양도시 기준시가 = 0 | §97 환산 불가 → 사용자 직접 취득가액 입력 권유 |
| `usePreHousingDisclosure=true` 인데 PHD 입력 누락 | 경고 + 단순 §97 환산으로 fallback |
| 거주기간 > 보유기간 | Zod 검증 단계에서 reject |

---

## 8. 마이그레이션 (`calc-wizard-migration.ts`)

```ts
function migrateLegacyMixedUse(asset: LegacyAsset): AssetForm {
  return {
    ...asset,
    assetType: asset.assetType,            // 사용자 명시적 선택
    isMixedUseHouse: false,                // 기본 false
    residentialFloorArea: "",
    nonResidentialFloorArea: "",
    buildingFootprintArea: "",
    // ... 모든 검용주택 필드 빈 값 초기화
  };
}
```
