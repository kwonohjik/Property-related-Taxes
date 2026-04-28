# 상속 주택 환산취득가 — 개별주택 미공시 + 1990 이전 토지 통합 처리

## Context

### 요청 배경
사용자는 `/Users/mynote/Documents/상속주택 환산가액.xlsx` (13번 케이스: "취득가 환산, 개별주택 공시전 취득 상속취득(환산가액적용)")의 로직을 코드에 이식하기를 원한다. 이 케이스는 **자산이 주택**이고 **상속개시일이 개별주택가격 최초 공시일(2005-04-30) 이전**이어서 상속개시일 시점에 개별주택가격 자체가 존재하지 않을 때, **PHD(개별주택가격 미공시) 3-시점 환산식**을 **상속 case A의 환산취득가 산식**과 결합해야 하는 복합 케이스다. 동시에 주택부수토지가 1990.8.30. 이전이거나 이후냐에 따라 토지단가 산출 방식도 분기되어야 한다.

### 현재 구현 한계
- `inheritance-acquisition-price.ts` case A는 `transferPrice × (standardPriceAtDeemedDate / standardPriceAtTransfer)` 단일 환산만 수행 — 토지·주택을 분리한 합계 기준시가를 사용자가 알아서 산출해 입력해야 한다.
- 사용자가 의제취득일/상속개시일 시점에 개별주택가격을 모르면(미공시) 환산할 방법이 없다.
- `pre-1990-land-valuation.ts`는 토지 자산 전용으로 호출되며, 주택 자산의 부수토지 환산에는 연결돼 있지 않다.
- `transfer-tax-pre-housing-disclosure.ts`(PHD)는 매매(`acquisitionCause === "purchase"`) 모드에서만 호출 — 상속 케이스에 노출되지 않음.

### 기대 결과
- **자산 종류 = 주택, 상속개시일 < 2005-04-30** 케이스에서 사용자가 **토지(면적+공시지가)와 주택가격을 3시점(상속/양도/최초공시)별로 분리 입력**하면, 엔진이 합계 기준시가·취득시 주택 추정가격·환산취득가를 자동 산출한다.
- 주택부수토지의 상속개시일이 1990-08-30 이전이면 **기존 `pre-1990-land-valuation.ts`를 재사용**해 토지 단가를 등급가액 환산식으로 산출.
- Case A(의제취득일 이전, 환산취득가) + Case B(의제취득일 이후, 보충적평가 시 PHD 보조계산기) 모두 지원.
- Excel 13번 케이스(상속 1985-01-01, 양도 2023-02-19, 환산취득가 109,611,427원)를 원단위까지 재현하는 회귀 테스트 anchor.

---

## 핵심 알고리즘 (Excel C/D/E 열 + G/H/I 등급 환산 표 디코딩)

```
변수 정의
  area               = 토지 면적 (㎡)
  rateLandT          = 양도시 개별공시지가 (원/㎡)             — 사용자 입력
  rateLandF          = 최초고시 시점 개별공시지가 (원/㎡)        — 사용자 입력
  rateLandA          = 상속개시일 시점 개별공시지가 (원/㎡)
                       · 상속개시일 ≥ 1990-08-30: 사용자 입력
                       · 상속개시일 < 1990-08-30: pre-1990 등급가액 환산 → 자동 산출
  housePriceT        = 양도시 개별주택가격 (원)                  — 사용자 입력 (Hometax)
  housePriceF        = 최초고시(2005-04-30 등) 개별주택가격 (원) — 사용자 입력 (Hometax)
  housePriceA        = 상속개시일 시점 개별주택가격 — 미공시이므로 자동 추정 (P_A_est)

3-시점 합계 기준시가
  landStdT  = floor(rateLandT × area)
  landStdF  = floor(rateLandF × area)
  landStdA  = floor(rateLandA × area)
  sumT      = landStdT + housePriceT
  sumF      = landStdF + housePriceF

상속개시일 추정 주택가격 (PHD §164⑤ 변형)
  housePriceA = floor(housePriceF × (landStdA + housePriceA_seed) / sumF)
              ≈ floor(housePriceF × landStdA / landStdF)   ← 토지 비율로 단순화
  // 단순화 근거: 주택가격은 토지 변화와 비례한다고 가정하는 §164⑤의 핵심.
  // 엑셀은 housePriceA를 "직접 입력값"으로 두지만 — 미공시이므로 자동 추정으로 대체.
  // → 정확한 식: housePriceA = floor(housePriceF × landStdA / landStdF)
  sumA = landStdA + housePriceA

환산취득가 (case A)
  converted = floor(transferPrice × sumA / sumT)           ← 합산 환산

case A 최종
  acquisitionPrice = max(converted, decedentActualPrice × cpiRatio)
```

**Excel 검증 (13번 케이스, 양도가 920,000,000원)**:
- area = 184.2㎡, rateLandT = 6,750,000원/㎡, rateLandA(환산) = 598,517원/㎡, rateLandF = 1,560,000원/㎡
- housePriceT = 26,136,250원, housePriceF = 42,630,000원
- landStdT = 1,243,350,000, landStdA = 110,246,831, landStdF = 287,352,000
- 추정 housePriceA = floor(42,630,000 × 110,246,831 / 287,352,000) = 16,357,571 (Excel 38,135,580과 차이)

> **주의**: Excel은 housePriceA(취득시 주택가격)를 **직접 입력값** 38,135,580으로 두었고 별도 산출 근거를 시트에 남기지 않았다. 위 단순 PHD 식은 토지 비율만 사용하므로 Excel과 다르다. **Excel을 정확히 재현하려면 사용자가 housePriceA를 직접 입력하는 필드도 옵션으로 제공**하거나, **PHD 합계비율 식**(`housePriceA = housePriceF × sumA / sumF` 순환식 → numerical solver)이 필요. 1차 구현은 **단순 PHD(토지 비율)** + **선택적 직접 입력 override**로 한다. 회귀 테스트는 직접 입력 모드로 Excel 일치 확인.

---

## Phase 1 — 신규 Pure Engine 모듈

### 파일: `lib/tax-engine/inheritance-house-valuation.ts` (신규)

상속 주택의 의제취득일/상속개시일 시점 합계 기준시가 + 추정 주택가격을 산출.

```typescript
export interface InheritanceHouseValuationInput {
  inheritanceDate: Date;            // 상속개시일 (1990 분기 + Case 분기 기준)
  transferDate: Date;
  /** 토지 면적 (㎡) */
  landArea: number;

  /** 양도시 개별공시지가 (원/㎡) */
  landPricePerSqmAtTransfer: number;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  landPricePerSqmAtFirstDisclosure: number;
  /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후만 사용 */
  landPricePerSqmAtInheritance?: number;

  /** 양도시 개별주택가격 (원, Hometax) */
  housePriceAtTransfer: number;
  /** 최초고시 시점 개별주택가격 (원, Hometax) */
  housePriceAtFirstDisclosure: number;
  /** 사용자 직접 입력 override — 미입력 시 PHD 식으로 자동 추정 */
  housePriceAtInheritanceOverride?: number;

  /** 1990-08-30 이전 토지일 때 등급가액 환산 입력 (pre-1990-land-valuation.ts와 동일 시그니처) */
  pre1990?: {
    grade_1990_0830: LandGradeInput;
    gradePrev_1990_0830: LandGradeInput;
    gradeAtAcquisition: LandGradeInput;   // 상속개시일 시점 등급
    pricePerSqm_1990: number;             // 1990-01-01 개별공시지가 (원/㎡)
    forceRatioCap?: boolean;
  };
}

export interface InheritanceHouseValuationResult {
  /** 상속개시일 시점 합계 기준시가 (= 의제취득일 시점 환산취득가의 분자) */
  totalStdPriceAtInheritance: number;
  /** 양도시 합계 기준시가 (분모) */
  totalStdPriceAtTransfer: number;
  /** 최초고시 시점 합계 기준시가 (검증용) */
  totalStdPriceAtFirstDisclosure: number;

  landStdAtInheritance: number;
  landStdAtTransfer: number;
  landStdAtFirstDisclosure: number;

  housePriceAtInheritanceEstimated: number;  // PHD 추정값 (또는 override)
  estimationMethod: "estimated_phd" | "user_override";

  /** 1990 환산이 사용된 경우 breakdown */
  pre1990Result?: Pre1990LandValuationResult;

  formula: string;       // 한국어 산식 (UI 표시용)
  legalBasis: string;
  warnings: string[];
}

export function calculateInheritanceHouseValuation(
  input: InheritanceHouseValuationInput,
): InheritanceHouseValuationResult;
```

**구현 핵심**:
1. 상속개시일이 1990-08-30 이전이면 `pre1990` 필수 → `calculatePre1990LandValuation()` 호출하여 `landPricePerSqmAtInheritance` 자동 도출.
2. 1990-08-30 이후이면 `landPricePerSqmAtInheritance` 사용자 입력 사용.
3. `housePriceAtInheritanceOverride` 제공 시 그 값 그대로, 아니면 `floor(housePriceF × landStdA / landStdF)` PHD 추정.
4. 모든 곱셈은 `safeMultiply` + `Math.floor()` 적용 (정수 연산 원칙).
5. 800줄 미만 유지. 헬퍼는 같은 파일 내 `function` 선언으로 정리.

**산식 문자열** (한국어 풀어쓰기, `floor`/`P_A` 등 변수약어 금지):
```
양도시 합계 = 양도시 토지(184.2㎡ × 6,750,000원) + 양도시 주택가격(26,136,250원) = 1,269,486,250원
상속개시일 토지단가 환산 = 1,100,000 × 77,100 / ((185,000+98,400)/2) = 598,517원/㎡  [pre-1990 Case ④ 표시 시]
상속개시일 합계 = 토지(184.2㎡ × 598,517원) + 추정 주택가격(16,357,571원) = 126,604,402원
환산취득가 = 920,000,000원 × 126,604,402 ÷ 1,269,486,250 = 91,762,411원
```

### 파일: `lib/tax-engine/types/inheritance-house-valuation.types.ts` (신규)
위 타입을 분리(공개 타입 3개 이상 — types/ 디렉터리 정책 준수).

### 파일: `lib/tax-engine/legal-codes/transfer.ts` (편집)
법령 상수 추가:
```typescript
export const TRANSFER = {
  ...,
  HOUSE_FIRST_DISCLOSURE_DATE: "2005-04-30 (개별주택가격 최초 공시일)",
  INHERITED_HOUSE_PHD_VALUATION:
    "소득세법 시행령 §164⑤ · §176조의2④ · §163⑥ — 개별주택 미공시 상속취득 환산",
};
```

---

## Phase 2 — 기존 inheritance helper에 통합

### 파일: `lib/tax-engine/inheritance-acquisition-helpers.ts` (편집, ~50줄 추가)

`runInheritedAcquisitionStep()` 내부 `resolveInheritedAcquisitionInput()`에서:
1. `rawInput.inheritedAcquisition` 의 자산 종류가 주택(`house_individual`/`house_apart`)이고
2. **상속개시일 < 2005-04-30** 이고
3. `rawInput.inheritedHouseValuation` 입력(신규 필드)이 있으면

→ `calculateInheritanceHouseValuation()` 호출하여:
- `standardPriceAtDeemedDate` ← `result.totalStdPriceAtInheritance`
- `standardPriceAtTransfer` ← `result.totalStdPriceAtTransfer`
- 자동 주입(사용자가 직접 입력했으면 사용자 값 우선).

Case B (의제취득일 이후)에서도 `reportedMethod === "supplementary"` + 미공시 시 동일 헬퍼로 보충적평가액 자동 산출(보조 도구).

### 파일: `lib/tax-engine/types/transfer.types.ts` (편집)
`TransferTaxInput`에 optional 추가:
```typescript
inheritedHouseValuation?: InheritanceHouseValuationInput;
```
`TransferTaxResult`에 optional 추가:
```typescript
inheritedHouseValuationDetail?: InheritanceHouseValuationResult;
```

### 파일: `lib/tax-engine/transfer-tax.ts` (편집, ~10줄)
STEP 0.45 직전(또는 동시 실행)에 `inheritedHouseValuation` 결과를 산출해 `inheritedAcquisition.standardPriceAtDeemedDate / standardPriceAtTransfer`에 주입(사용자 명시 입력이 없는 경우만 — `applyResultToInput` 패턴 그대로 따름).

---

## Phase 3 — Zod 스키마

### 파일: `lib/api/transfer-tax-schema-sub.ts` (편집, ~40줄 추가)

```typescript
export const inheritanceHouseValuationSchema = z.object({
  inheritanceDate: z.string().date(),
  landArea: z.number().positive(),
  landPricePerSqmAtTransfer: z.number().int().positive(),
  landPricePerSqmAtFirstDisclosure: z.number().int().positive(),
  landPricePerSqmAtInheritance: z.number().int().positive().optional(),
  housePriceAtTransfer: z.number().int().nonnegative(),
  housePriceAtFirstDisclosure: z.number().int().positive(),
  housePriceAtInheritanceOverride: z.number().int().nonnegative().optional(),
  firstDisclosureDate: z.string().date().default("2005-04-30"),
  pre1990: z.object({
    grade_1990_0830: gradeInputSchema,
    gradePrev_1990_0830: gradeInputSchema,
    gradeAtAcquisition: gradeInputSchema,
    pricePerSqm_1990: z.number().int().positive(),
    forceRatioCap: z.boolean().optional(),
  }).optional(),
}).superRefine((v, ctx) => {
  // 1990-08-30 이전이면 pre1990 필수
  // 1990-08-30 이후면 landPricePerSqmAtInheritance 필수
  // 어느 한쪽만 충족해야 함 (XOR)
});
```

### 파일: `lib/api/transfer-tax-schema.ts` (편집)
`propertySchema`에 `inheritedHouseValuation: inheritanceHouseValuationSchema.optional()` 추가.

### 파일: `app/api/calc/transfer/route.ts` (편집)
입력 변환 시 `inheritedHouseValuation` 필드를 `TransferTaxInput`으로 그대로 전달.

---

## Phase 4 — UI 컴포넌트

### 파일: `components/calc/transfer/inheritance/HouseValuationSection.tsx` (신규)

`PreDeemedInputs.tsx`/`PostDeemedInputs.tsx`에서 자산 종류가 주택일 때만 노출되는 보조 입력 섹션.

**노출 조건** (UI 분기):
```
asset.assetKind ∈ {"house_individual", "house_apart"}
  AND asset.inheritanceStartDate < "2005-04-30"
```

**UI 순서 (엔진 계산 로직 순서 — `UI 순서 = 엔진 계산 로직 순서` 원칙)**:
1. 토지 면적 (m²) — 모든 후속 곱셈의 인자
2. 1990-08-30 분기 자동 안내 (배지: "1990 등급가액 환산" / "개별공시지가 직접 입력")
3. **양도시** 토지 공시지가 (원/m²) + 양도시 주택가격 (원) — Hometax 조회 버튼
4. **최초고시(2005-04-30)** 토지 공시지가 + 최초고시 주택가격 — Hometax 조회 버튼
5. **상속개시일 시점**:
   - 1990-08-30 이전: pre-1990 등급가액 환산 입력(`Pre1990LandValuationInput` 컴포넌트 그대로 재사용 — `acquisitionDate` prop을 `inheritanceStartDate`로 매핑)
   - 1990-08-30 이후: 상속개시일 시점 토지 공시지가 직접 입력
6. (선택) 상속개시일 시점 주택가격 직접 입력 override 토글 — 기본은 PHD 자동 추정
7. **결과 미리보기 카드** (`InheritanceValuationPreviewCard.tsx` 재사용):
   - 양도시 합계, 상속개시일 합계, 환산취득가, 추정 주택가격을 한국어 산식으로 표시.

**필수 컴포넌트 사용**:
- `FieldCard` + `CurrencyInput` (`hideUnit`) + `DateInput`
- 1990 환산: 기존 `Pre1990LandValuationInput` 재사용 (props: `form`/`onChange`/`acquisitionDate`/`transferDate`)
- Vworld 공시지가 조회 버튼: 기존 `/api/address/standard-price?propertyType=land` 엔드포인트 재사용 (PHD 섹션과 동일 패턴, `recommendLandPriceYear`로 자동 추천 연도 산출)
- 법조문 링크: `LawArticleModal` (`legalBasis="소득세법시행령 §164"`, `legalBasis="소득세법시행령 §176조의2"`)

### 파일: `components/calc/transfer/inheritance/PreDeemedInputs.tsx` (편집)

자산 종류가 주택이면 기존 "의제취득일 시점 기준시가" 단일 입력 대신 위 `HouseValuationSection`을 노출. 토지 자산은 기존 흐름 그대로.

### 파일: `components/calc/transfer/inheritance/PostDeemedInputs.tsx` (편집)

`reportedMethod === "supplementary"` + 자산이 주택 + 상속개시일 < 2005-04-30 일 때 `HouseValuationSection`을 보조계산기로 노출(결과의 `totalStdPriceAtInheritance`를 `reportedValue`에 자동 입력 옵션 제공).

### 파일: `lib/stores/calc-wizard-asset.ts` (편집, ~25줄)

`AssetForm`에 신규 필드 추가:
```typescript
// 상속 주택 환산 보조 입력
inhHouseValEnabled: boolean;
inhHouseValLandArea: string;
inhHouseValLandPricePerSqmAtTransfer: string;
inhHouseValLandPricePerSqmAtFirst: string;
inhHouseValLandPricePerSqmAtInheritance: string;
inhHouseValHousePriceAtTransfer: string;
inhHouseValHousePriceAtFirst: string;
inhHouseValHousePriceAtInheritanceOverride: string;  // 선택
inhHouseValUseHousePriceOverride: boolean;
inhHouseValFirstDisclosureDate: string;  // 기본 "2005-04-30"

// pre-1990은 기존 pre1990* 7필드 재사용
```

`INITIAL_ASSET_FORM` 기본값 추가 + migration normalizer에 `if (a.inhHouseVal* === undefined) ...` 추가.

### 파일: `components/calc/transfer/CompanionAssetCard.tsx` (편집)

기존 `<InheritedAcquisitionDeemedSection />` 호출 시 자산 종류 + 상속개시일을 prop으로 전달(이미 `asset` 전체 전달 중이므로 변경 불필요할 가능성). 이미지 첨부와 같이 "취득가액 의제 특례" 섹션 안에 신규 보조 섹션이 펼쳐지는 형태.

---

## Phase 5 — API 변환 + 사이드바

### 파일: `lib/calc/transfer-tax-api.ts` (편집)

`AssetForm.inhHouseVal*` 필드 → `TransferTaxInput.inheritedHouseValuation` 변환 함수 추가. 1990 분기는 `acquisitionDate`/`inheritanceStartDate`와 `pre1990Enabled` 플래그로 자동 결정.

### 파일: `lib/stores/calc-wizard-store.ts`의 `computeTransferSummary` (편집, 선택)

사이드바에 환산취득가 자동 추정 결과 표시(API 결과 도착 후만).

---

## Phase 6 — 결과 뷰

### 파일: `components/calc/transfer/InheritanceValuationPreviewCard.tsx` (편집 또는 신규 카드)

기존 카드를 확장해 `inheritedHouseValuationDetail` 표시:
- 양도시 합계 = 양도시 토지(면적 × 단가) + 양도시 주택가격 = X원
- 상속개시일 토지단가 (1990 환산 시 등급가액 산식 한 줄로 — `pre1990Result.breakdown.formula`)
- 상속개시일 합계 = 토지 + 추정 주택가격 = Y원
- 환산취득가 = 양도가 × Y ÷ X = Z원

**원칙**: 한국어 풀어쓰기, 변수약어(`P_F`, `Sum_A`) 금지, 중간 산술 결과 표시 금지. 결과값만 우측에 단일 표기.

---

## Phase 7 — 테스트

### 파일: `__tests__/tax-engine/_helpers/inheritance-fixture.ts` (편집)

Excel 13번 anchor 픽스처 추가:
```typescript
export const EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE = {
  inheritanceDate: new Date("1985-01-01"),
  transferDate: new Date("2023-02-19"),
  transferPrice: 920_000_000,
  area: 184.2,
  rateLandT: 6_750_000, rateLandF: 1_560_000,
  housePriceT: 26_136_250, housePriceF: 42_630_000,
  // 1990 등급가액
  pricePerSqm_1990: 1_100_000,
  grade_1990_0830_value: 185_000,
  gradePrev_1990_0830_value: 98_400,
  gradeAtAcquisition_value: 77_100,
  // 직접 입력 override (Excel 일치용)
  housePriceAtInheritanceOverride: 38_135_580,
  expected: {
    rateLandA: 598_517,
    landStdA: 110_246_831,
    totalStdAtInheritance: 148_382_411,  // ← Excel C37
    totalStdAtTransfer: 1_269_486_250,    // ← Excel C36
    convertedAcquisitionPrice: 109_611_427, // ← Excel C9 — 합계 검증
  },
};
```

### 파일: `__tests__/tax-engine/inheritance-house-valuation.test.ts` (신규)

테스트 시나리오:
1. **Excel 13번 anchor — override 모드**: 모든 expected 원단위까지 `toBe()` 일치.
2. **상속개시일 < 1990-08-30 + override 모드**: pre-1990 호출 검증.
3. **상속개시일 ∈ [1990-08-30, 2005-04-29) + 자동 추정 모드**: PHD 추정식 검증.
4. **상속개시일 < 1990-08-30 + 자동 추정 모드**: pre-1990 + PHD 통합.
5. **상속개시일 ≥ 2005-04-30**: 본 모듈 호출 안 됨(noop).
6. **경계: 토지 면적/주택가격 0**: 경고 발생.
7. **타입 검증**: 1990 분기 동시 입력 시 → schema reject.

### 파일: `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` (편집)
Excel 13번 풀 시나리오로 `calculateTransferTax()` 호출 → 양도소득금액·산출세액·지방소득세까지 Excel 일치 검증(C20=561,551,929 / C21=199,911,810 / C24=19,991,181).

---

## 변경 파일 요약

| 분류 | 경로 | 변경 |
|---|---|---|
| 신규 엔진 | `lib/tax-engine/inheritance-house-valuation.ts` | 신규 (~250줄) |
| 신규 타입 | `lib/tax-engine/types/inheritance-house-valuation.types.ts` | 신규 (~80줄) |
| 엔진 통합 | `lib/tax-engine/inheritance-acquisition-helpers.ts` | +50줄 |
| 엔진 통합 | `lib/tax-engine/transfer-tax.ts` | +10줄 |
| 타입 확장 | `lib/tax-engine/types/transfer.types.ts` | +5줄 |
| 법령 상수 | `lib/tax-engine/legal-codes/transfer.ts` | +5줄 |
| Zod 스키마 | `lib/api/transfer-tax-schema-sub.ts` | +40줄 |
| Zod 스키마 | `lib/api/transfer-tax-schema.ts` | +1줄 |
| API 변환 | `app/api/calc/transfer/route.ts` | +5줄 |
| Store | `lib/stores/calc-wizard-asset.ts` | +25줄 |
| API 변환 | `lib/calc/transfer-tax-api.ts` | +30줄 |
| 신규 UI | `components/calc/transfer/inheritance/HouseValuationSection.tsx` | 신규 (~300줄) |
| UI 편집 | `components/calc/transfer/inheritance/PreDeemedInputs.tsx` | +10줄 |
| UI 편집 | `components/calc/transfer/inheritance/PostDeemedInputs.tsx` | +15줄 |
| 결과 카드 | `components/calc/transfer/InheritanceValuationPreviewCard.tsx` | +50줄 |
| 픽스처 | `__tests__/tax-engine/_helpers/inheritance-fixture.ts` | +30줄 |
| 신규 테스트 | `__tests__/tax-engine/inheritance-house-valuation.test.ts` | 신규 (~250줄) |
| 통합 테스트 | `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` | +80줄 |

**모든 파일 800줄 미만 정책 준수 (큰 신규 파일은 helpers로 분리 가능).**

---

## 재사용할 기존 자산

| 위치 | 용도 |
|---|---|
| `lib/tax-engine/pre-1990-land-valuation.ts:224` `calculatePre1990LandValuation()` | 의제취득일/상속개시일 시점 토지단가 등급가액 환산 (5유형 분기 + CAP-1/CAP-2 그대로) |
| `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts:35` `calcPreHousingDisclosureGain()` | 알고리즘 참고 (호출하지 않고 식만 차용 — 합계 기반 환산이 별도 의미). 향후 공통화 검토 |
| `lib/tax-engine/tax-utils.ts` `safeMultiply()` `Math.floor()` | 정수 연산 — 184.2㎡ × 6,750,000원 같은 BigInt 영역 보호 |
| `lib/tax-engine/data/cpi-rates.ts` `getCpiRatio()` | 피상속인 실가 × 물가상승률 (case A의 두 번째 후보) — 기존 그대로 |
| `components/calc/inputs/Pre1990LandValuationInput.tsx` | 1990 환산 UI 컴포넌트 — `acquisitionDate` prop을 `inheritanceStartDate`로 매핑 |
| `app/api/address/standard-price/route.ts` | Vworld 공시지가 조회 — 3시점 자동 조회 버튼 |
| `lib/utils/land-price-year.ts` `recommendLandPriceYear()` | 시점별 추천 연도 (5월 31일 이하는 전년도) |
| `components/calc/inputs/FieldCard.tsx` / `CurrencyInput.tsx` / `DateInput` | 공용 입력 컴포넌트 — 절대 규칙 준수 |
| `components/ui/law-article-modal.tsx` `LawArticleModal` | 법조문 링크 — `소득세법시행령 §164` `§176조의2` |

---

## 검증

### 단위 테스트
```bash
npx vitest run __tests__/tax-engine/inheritance-house-valuation.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts
npx vitest run __tests__/tax-engine/inheritance-acquisition-price.test.ts  # 회귀
npx vitest run __tests__/tax-engine/pre-1990-land-valuation.test.ts        # 회귀
```

### 빌드/타입 체크
```bash
npm run lint
npm run build
```

### E2E (수동 — UI 검증)
1. `npm run dev` → http://localhost:3000/calc/transfer-tax
2. 자산 추가 → 자산 종류 = 개별주택, 취득원인 = 상속, 상속개시일 = 1985-01-01, 양도일 = 2023-02-19
3. "취득가액 의제 특례 (소령 §176조의2④·§163⑨)" 섹션이 "의제취득일 이전" 배지로 표시됨을 확인
4. 신규 `HouseValuationSection` 입력:
   - 토지 면적 184.2, 양도시 공시지가 6,750,000원/㎡
   - 양도시 주택가격 26,136,250원
   - 최초공시일 2005-04-30, 최초공시 공시지가 1,560,000원/㎡, 최초공시 주택가격 42,630,000원
   - 1990 등급가액: 1990.1.1. 공시지가 1,100,000 / 90.8.30. 등급가액 185,000 / 직전 98,400 / 취득(상속) 등급 77,100
   - 주택가격 override 38,135,580 입력
5. 결과 화면에서 환산취득가 109,611,427원, 양도소득금액 564,051,929원, 산출세액 199,911,810원 표시 확인 (Excel 일치)
6. **회귀**: 토지 단독 상속(자산 종류 = 토지) 시 신규 섹션이 노출되지 않고 기존 흐름 유지 확인.
7. **회귀**: 의제취득일 이후(1990-01-01) 상속 + 주택 자산 시 신규 섹션이 PostDeemedInputs 안의 보충적평가 보조계산기로 노출됨 확인.

### MCP 도구
- `mcp__claude-in-chrome__tabs_create_mcp` + `navigate` + `form_input` + `find` 으로 위 시나리오 자동화 가능 (선택).
- `mcp__plugin_bkit_bkit-pdca__bkit_pdca_status`로 PDCA 상태 진행 기록.

### 성공 기준
- Excel 13번 anchor 테스트가 원단위까지 `toBe()` 일치.
- 기존 1,484개 테스트 0 회귀.
- Match Rate ≥ 90% (gap-detector).
- 800줄 정책 준수, 정수 연산 원칙(`Math.floor()` + `safeMultiply()`) 위반 없음.

---

## TODO 체크리스트 (실행 순서)

### Phase 1 — Pure Engine (TDD) ✅
- [x] **T1.1** `__tests__/tax-engine/_helpers/inheritance-fixture.ts`에 `EXCEL_13_INHERITED_HOUSE_PRE_DISCLOSURE` 픽스처 추가
- [x] **T1.2** `lib/tax-engine/types/inheritance-house-valuation.types.ts` 신규
- [x] **T1.3** `lib/tax-engine/legal-codes/transfer.ts`에 `INHERITED_HOUSE` 상수 추가
- [x] **T1.4** `lib/tax-engine/inheritance-house-valuation.ts` 신규 모듈 작성
- [x] **T1.5** `__tests__/tax-engine/inheritance-house-valuation.test.ts` 신규 — 25개 통과

### Phase 2 — Engine 통합 ✅
- [x] **T2.1** `lib/tax-engine/types/transfer.types.ts` `inheritedHouseValuation`/`inheritedHouseValuationDetail` 추가
- [x] **T2.2** `lib/tax-engine/inheritance-acquisition-helpers.ts` 확장 — 주택 미공시 자동 주입
- [x] **T2.3** `lib/tax-engine/transfer-tax.ts` `inheritedHouseValuationDetail` 노출

### Phase 3 — Zod 스키마 + API ✅
- [x] **T3.1** `lib/api/transfer-tax-schema-sub.ts` `inheritanceHouseValuationSchema` + superRefine XOR 검증
- [x] **T3.2** `lib/api/transfer-tax-schema.ts` `inheritedHouseValuation` 필드 추가
- [x] **T3.3** `app/api/calc/transfer/route.ts` Date 변환 후 전달

### Phase 4 — UI 컴포넌트 ✅
- [x] **T4.1** `lib/stores/calc-wizard-asset.ts` `inhHouseVal*` 11개 필드 + 기본값 + migration normalizer
- [x] **T4.2** `components/calc/transfer/inheritance/HouseValuationSection.tsx` 신규
- [ ] **T4.3** Vworld 공시지가 조회 버튼 (HouseValuationSection 내 기존 패턴 확장 — 선택적 작업)
- [x] **T4.4** `PreDeemedInputs.tsx` — 주택 자산 시 HouseValuationSection 노출
- [x] **T4.5** `PostDeemedInputs.tsx` — 보충적평가 + 주택 + 미공시 시 보조계산기 노출
- [x] **T4.6** `lib/calc/transfer-tax-api.ts` `inhHouseVal*` → `inheritedHouseValuation` API 변환

### Phase 5 — 결과 뷰 ✅
- [x] **T5.1** `InheritanceValuationPreviewCard.tsx` — `houseValuationResult` 3-시점 상세 표시 추가

### Phase 6 — 통합 테스트 ✅
- [x] **T6.1** `__tests__/tax-engine/transfer-tax/inherited-acquisition.test.ts` — E-6a(자동 주입 흐름) / E-6b(Excel 109,611,427원 직접 anchor) / E-6c(미제공 시 기존 흐름 유지) — 11개 통과
- [x] **T6.2** 회귀 — 1,667개 전체 통과 확인

### Phase 7 — 검증
- [x] **T7.1** `npm run lint` 통과 (기존 에러 1건만, 신규 에러 0)
- [x] **T7.2** `npm test` 1,667개 통과
- [x] **T7.3** `npm run build` 성공
- [ ] **T7.4** `npm run dev` 수동 E2E
- [ ] **T7.5** 회귀 시나리오 수동
- [ ] **T7.6** Match Rate ≥ 90%
- [x] **T7.7** 800줄 정책 — inheritance-house-valuation.ts 186줄, HouseValuationSection.tsx 188줄

### 의존 그래프
```
T1.1 ─┐
T1.2 ─┼─→ T1.4 ─→ T1.5 ─┐
T1.3 ─┘                  ├─→ T2.1 ─→ T2.2 ─→ T2.3 ─→ T3.1 → T3.2 → T3.3
                         │                                        ↓
                         │           T4.1 ─→ T4.2 → T4.3 → T4.4   │
                         │                              ↓     ↓   │
                         │                              T4.5  T4.6┤
                         │                                        ↓
                         │                                       T5.1
                         │                                        ↓
                         └────────────────────────────→ T6.1 → T6.2
                                                            ↓
                                              T7.1 → T7.2 → T7.3 → T7.4 → T7.5 → T7.6 → T7.7
```
