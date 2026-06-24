# 주택 재산세 세부담상한 경과조치(부칙 제15조) — 엔진 설계

작성일: 2026-06-24
계획서: `docs/00-pm/property-housing-transitional-cap.plan.md`
scope: v1 본세 (도시지역분·법인주택·§118 4호 = v2)

---

## 1. 케이스 인벤토리

부칙 제15조 적용 게이트 4-AND: `housing` ∧ `2024 ≤ taxYear ≤ 2028` ∧ `previousYearHousingBaseTax 입력` ∧ (2024 전 과세이력=직전세액 존재).

| # | objectType | taxYear | 직전본세 입력 | 결과 | determinedTax |
|---|---|---|---|---|---|
| K-1 | housing | 2025 | 215,300 | 상한 적용(110%) | min(266072, floor(215300×1.1))=236,830 |
| K-2 | housing | 2024 | 195,700 | 상한 적용(110%) | min(216924, 215270)=215,270 |
| K-3 | housing | 2025 | 미입력 | 미적용+warning | 266,072 (산출세액) |
| K-4 | housing | 2029 | 215,300 | 미적용(만료)+warning | 266,072 |
| K-5 | housing | 2023 | — | pass-through(범위밖) | 산출세액 |
| K-6 | housing 공시 3억↓ | 2025 | 입력 | 105% | min(산출, floor(직전×1.05)) |
| K-7 | housing 공시 6억↑ | 2025 | 입력 | 130% | min(산출, floor(직전×1.30)) |
| K-8 | land/building 등 | - | - | 비주택 기존 150% | applyTaxCap 기존 |
| **K-9** | **housing(종부세 내부호출)** | 2025 | **미전달** | **미적용** | **266,072 (회귀 0, C2)** |

> K-9: `comprehensive-tax.ts`가 `calculatePropertyTax`를 호출할 때 `previousYearHousingBaseTax`를 넘기지 않음 → G3 미충족 → 상한 미적용 → 종부세 ⓐ 불변. **종부세 회귀 차단의 핵심.**

---

## 2. input / result 타입

### PropertyTaxInput (신규 1필드)
```typescript
// types/property.types.ts
/** [부칙 제15조] 직전연도 주택 재산세 본세(§112①1호, 고지서 '재산세'). housing 전용. */
previousYearHousingBaseTax?: number;
```
- 기존 `previousYearTax`(비주택 direct)·`previousYearTaxBase`(비주택 recompute)·`taxCapMode`와 **독립**. 주택은 v1에서 직접입력만(§118 단서).

### PropertyTaxResult (신규 1필드)
```typescript
housingTransitionalCap?: {
  applied: boolean;
  capRate: number;              // 1.05 / 1.10 / 1.30
  previousYearBaseTax: number;
  baseCapLimit: number;         // floor(직전 × capRate)
  baseCalculatedTax: number;    // 상한 전 산출세액
  baseDeterminedTax: number;    // = determinedTax
  legalBasis: string;           // PROPERTY.TAX_CAP_TRANSITIONAL
};
```
- 기존 `calculatedTaxBeforeCap`·`taxCapRate`·`determinedTax` 재사용(주택 적용 시 동일값 echo).

---

## 3. 알고리즘

### 신규 파일 `property-tax-housing-cap.ts`
```typescript
import { applyRate } from "./tax-utils";
import { PROPERTY, PROPERTY_CONST } from "./legal-codes";

export interface HousingCapResult {
  applied: boolean;
  determinedTax: number;
  capRate?: number;
  capLimit?: number;
  warnings: string[];
}

export function applyHousingTransitionalCap(
  calculatedTax: number,
  publishedPrice: number,
  taxYear: number,
  previousYearHousingBaseTax?: number,
): HousingCapResult {
  // G2: 만료(2029~)
  if (taxYear > PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR) {
    return { applied: false, determinedTax: calculatedTax,
      warnings: [`주택 세부담상한 경과조치(${PROPERTY.TAX_CAP_TRANSITIONAL})는 ${PROPERTY_CONST.HOUSING_TAX_CAP_EXPIRY_YEAR}년까지만 적용됩니다.`] };
  }
  // G3: 직전본세 미입력
  if (previousYearHousingBaseTax == null || previousYearHousingBaseTax <= 0) {
    return { applied: false, determinedTax: calculatedTax,
      warnings: ["직전연도 본세 미입력으로 세부담상한(부칙 제15조)을 적용하지 않습니다. 전년도 고지서 '재산세' 금액을 입력하세요."] };
  }
  const capRate = resolveHousingCapRate(publishedPrice);
  const capLimit = applyRate(previousYearHousingBaseTax, capRate);   // floor
  return { applied: true, determinedTax: Math.min(calculatedTax, capLimit), capRate, capLimit, warnings: [] };
}

function resolveHousingCapRate(publishedPrice: number): number {
  if (publishedPrice <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_1) return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_1 / 100; // 1.05
  if (publishedPrice <= PROPERTY_CONST.HOUSING_TAX_CAP_BRACKET_2) return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_2 / 100; // 1.10
  return PROPERTY_CONST.HOUSING_TAX_CAP_PCT_3 / 100; // 1.30
}
```
> **single-source(H2)**: `HOUSING_TAX_CAP_BRACKET_1/2`·`PCT_1/2/3` 상수는 종부세 `getHousingTaxCapPct`와 공유. `getHousingTaxCapPct`는 2024+ null(부칙 미반영)이라 v1에서 직접 재사용 불가 → 상수만 공유, 함수는 분리. **종부세 코드·`getHousingTaxCapPct` 무변경**(C2 회귀 차단).

### `calculatePropertyTax()` Step 3 분기 (property-tax.ts:726~)
```typescript
let determinedTax: number;
let housingCap: HousingCapResult | undefined;
const HOUSING_START = PROPERTY_CONST.HOUSING_TAX_CAP_ABOLISHED_YEAR; // 2024
if (input.objectType === "housing" && taxYear >= HOUSING_START) {
  housingCap = applyHousingTransitionalCap(calculatedTax, input.publishedPrice, taxYear, input.previousYearHousingBaseTax);
  determinedTax = housingCap.determinedTax;
  warnings.push(...housingCap.warnings);
  if (housingCap.applied) legalBasis.push(PROPERTY.TAX_CAP_TRANSITIONAL);
} else {
  const basisMain = resolveBasisTax(input, taxYear - 1);
  const capResult = applyTaxCap(calculatedTax, input.objectType, basisMain); // 기존(주택 2023↓ pass-through·비주택 150%)
  determinedTax = capResult.determinedTax;
  warnings.push(...capResult.warnings);
  legalBasis.push(capResult.legalBasis);
}
// housingTransitionalCap 결과 필드 조립 (housingCap?.applied 시)
```
- 지방교육세 = `calcSurtax(determinedTax, ...)` 자동 연동(무변경).
- 도시지역분은 v1 현행 유지(`taxBase × 0.14%`, 상한 미적용).

### 신규 상수 (legal-codes/property.ts)
```typescript
// PROPERTY
TAX_CAP_TRANSITIONAL: "지방세법 법률 제19230호 부칙 제15조",
// PROPERTY_CONST
HOUSING_TAX_CAP_EXPIRY_YEAR: 2028,
// (HOUSING_TAX_CAP_PCT_1/2/3=105/110/130, BRACKET_1/2=3억/6억, ABOLISHED_YEAR=2024 기존)
```

---

## 4. 14 동기화 지점 (엔진/API측)

| 지점 | 파일 | 변경 |
|---|---|---|
| ① input 타입 | types/property.types.ts | `previousYearHousingBaseTax?` |
| result 타입 | types/property.types.ts | `housingTransitionalCap?` |
| ⑨⑫ Zod | validators/property-input.ts | `previousYearHousingBaseTax: z.number().int().nonnegative().optional()` + superRefine: housing 아닐 때 입력 차단 |
| ⑭ Route | app/api/calc/property/route.ts | `parsed.data as PropertyTaxInput` 자동(타입 일치, 추가 매핑 불필요) |
| 엔진 분기 | property-tax.ts Step3 | 위 §3 |
| 신규 함수 | property-tax-housing-cap.ts | applyHousingTransitionalCap (800줄 정책 분리) |
| **무변경(회귀가드)** | comprehensive-tax.ts·comprehensive-housing-tax-cap.ts·getHousingTaxCapPct | **손대지 않음(C2)** |

---

## 5. anchor 테스트 (`__tests__/tax-engine/property/housing-transitional-cap.test.ts`)

| TC | 입력 | 기대 |
|---|---|---|
| TC-1 | 2025·과표223,036,000·공시518M·직전215,300 | determinedTax `236_830`, capRate `1.10`, baseCalculatedTax `266_072` |
| TC-2 | 2024·직전195,700 | `215_270` |
| TC-3 | 직전 미입력 | `266_072`, housingTransitionalCap `undefined`, warning |
| TC-4 | 공시 3억↓ | capRate `1.05` |
| TC-5 | 공시 6억↑ | capRate `1.30` |
| TC-6 | 2029 | 미적용+warning |
| TC-7 | 2023 | pass-through |
| TC-8 | 비주택 | 기존 150% 회귀 |
| **TC-9** | **종부세 호출(직전 미전달)** | **determinedTax `266_072`, housingTransitionalCap `undefined`** (회귀 가드) |

> anchor 채택 = 법령 산식 `Math.floor`. 실제 고지(236,800)와 30원 차 = 역산·절사 누적오차(주석).

---

## 6. 리스크

| # | 항목 | 처리 |
|---|---|---|
| R-1 | 본세 30원(236,830 vs 236,800) | floor 기준 anchor + 주석 ([[feedback_anchor_correction_legal_priority]]) |
| C2 | 종부세 회귀 | 게이트=입력 시에만 → 종부세 호출 불변. TC-9 가드 |
| H2 | dual-truth(종부세 getHousingTaxCapPct) | 상수 공유·함수 분리. v2 통합 |
| R-4 | 1세대1주택 특례 교차 | capRate=공시구간 기준이라 특례 무관 |
