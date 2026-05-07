# 사례 28 — 나대지 취득 후 주택 신축 일괄양도 (엔진 설계)

> 계획서 원본: `.claude/plans/image-44-image-45-joyful-spark.md`
> UI 측 설계: `transfer-tax-new-construction-bundled-case-28.ui.design.md` (별도 작성)

---

## Context

**배경 및 한계**

현재 다자산 일괄양도 인프라(사례 27 등)는 이미 구현 완료됐으나,
나대지를 취득 후 그 위에 주택을 신축하여 함께 양도하는 케이스에서
**부수토지에 주택의 단기보유세율(70%)을 자동 적용하는 분기가 미구현**이다.

**사례 28 시나리오**

- 갑氏: 2022.1.8. 나대지 취득(1.5억) → 2022.8.29. 주택 신축(사용승인, 신축비용 1억) → 2023.3.6. 주택+부수토지 일괄양도(4억)
- 건물 123.12㎡, 토지 206.6㎡, 양도 당시 개별공시지가 540,000원/㎡
- 토지 보유기간: 2022.1.8. ~ 2023.3.6. (약 1년 2개월, 1년 이상 2년 미만)
- 건물 보유기간: 2022.8.29. ~ 2023.3.6. (약 6개월 7일, **1년 미만**)

**핵심 쟁점**

외형으로는 토지가 §104①3호(1년≤보유<2년, 40%), 건물이 §104①3호 단서(주택 1년 미만, 70%)로 각각 다른 세율이지만,
**1차 근거인 주택·부수토지 일체과세 원리**에 따라 토지에도 건물의 세율(70%)을 적용한다.

---

## 법령 근거

### 1차 근거 — 주택·부수토지 일체과세 원리 (주된 근거)

```
소득세법 §89①3호 (1세대1주택 비과세): 주택 및 이에 부수되는 토지를 일체로 취급
시행령 §154⑦ (부수토지 한도): 주택의 정착면적에 일정 배수까지 부수토지로 인정
  → 도시지역: 건물 정착면적 × 5배
  → 도시지역 외: 건물 정착면적 × 10배
```

유권해석:
- **기재부 재산-53(2015.1.15)**: 나대지 위에 신축한 주택을 부수토지와 함께 양도 시, 부수토지도 주택과 일체로 보아 주택의 보유기간·세율 적용
- **기재부 재산-1354(2022.10.27)**: 동일 취지 재확인 — 주택 부수토지는 주택의 세율을 따름

법령코드 상수: `TRANSFER.ONE_HOUSE_EXEMPTION` (§89①3호), `TRANSFER.APPURTENANT_LAND_LIMIT` (영 §154⑦)

### 2차 근거 — 보충적 근거 (1차 근거와 동일 결론 지지)

```
소득세법 §104①후단: 하나의 자산이 둘 이상의 세율에 해당 시 큰 산출세액 적용
```

법령코드 상수: `TRANSFER.HIGHER_TAX_RULE` (§104①후단)

### 신축주택 취득일 — 영 §162①4호

```
자가건축(자가신축) 주택의 취득일:
  → 사용승인일
  → 사용검사필증 교부일
  → 임시사용승인일
  → 사실상 사용일
  위 4가지 중 빠른 날을 취득일로 봄
```

법령코드 상수: `TRANSFER.SELF_BUILT_ACQUISITION_DATE` (영 §162①4호)

사례 28: 사용승인 2022.8.29. → 양도 2023.3.6. = 약 6개월 7일 → 1년 미만 명확

### 부수토지 한도 산정 — 영 §154⑦

```
한도 내 면적 = 건물 정착면적(buildingFootprintArea) × 배율
  도시지역(isUrbanArea=true):  배율 = 5
  도시지역 외(isUrbanArea=false): 배율 = 10

사례 28 검산: 123.12㎡ × 5 = 615.6㎡ ≥ 토지 206.6㎡ → 전량 부수토지 인정 ✅
```

### §103 기본공제 단일 적용 원칙

```
소득세법 §103: 양도소득기본공제 2,500,000원은 해당 연도 전체 양도소득에서 1회만 공제
  → 자산이 2건(주택+토지)이어도 합산 후 1회만 차감 (자산별 × 2 적용 금지)
```

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

사용자가 새 케이스를 던질 때마다 코드를 고치기 전에 먼저 이 표에 행을 추가한다.

| # | 시나리오 | 자동분기 | 법령 근거 | anchor 출처 | 테스트 ID | 상태 |
|---|---------|---------|----------|-------------|----------|------|
| 1 | 신축주택(1년미만) + 부수토지, 한도 내, 자동 분기 → 토지 70% | O | §89①3호·영 §154⑦·재산-53/1354 | 양도코리아 PDF 사례 28 | T-01~T-12 | ☐ TODO |
| 2 | 신축주택(1년미만) + 부수토지, 한도 초과(도시지역 5배), 초과분 분리 → 초과분 40% | 부분 O | §89①3호·영 §154⑦·§104①3호 | 경계값 자체 설계 | T-18 | ☐ TODO |
| 3 | 신축주택(1년미만) + 부수토지, 한도 초과(도시지역 외 10배), 초과분 분리 → 초과분 40% | 부분 O | §89①3호·영 §154⑦·§104①3호 | 경계값 자체 설계 | T-19 | ☐ TODO |
| 4 | 사용자 수동 오버라이드: shortTermHousing70 강제 → 토지 70% | X(수동) | 사용자 명시 지정 | 수동 케이스 | T-08(오버라이드) | ☐ TODO |
| 5 | 사용자 수동 오버라이드: shortTerm60 강제 → 토지 60% | X(수동) | 사용자 명시 지정 | — | T-13 | ☐ TODO |
| 6 | 사용자 수동 오버라이드: progressive 강제 → 토지 누진세율 | X(수동) | 사용자 명시 지정 | — | T-14 | ☐ TODO |
| 7 | 건물 보유 12개월 정확히 — 자동 분기 미적용 (1년 미만 아님, 경계) | X | §104①3호 단서 (1년 이상 = 단기 70% 제외) | 경계값 자체 설계 | T-16 | ☐ TODO |
| 8 | 신축주택 취득일 = 사실상 사용일이 사용승인일보다 빠름 → 더 이른 날 기준 | O | 영 §162①4호 | 경계값 자체 설계 | T-16 파생 | ☐ TODO |
| 9 | 신축주택 취득일 = 임시사용승인일이 사용승인일보다 빠름 → 더 이른 날 기준 | O | 영 §162①4호 | 경계값 자체 설계 | T-16 파생 | ☐ TODO |
| 10 | companion이 housing(아닌 일반 토지 단독 양도) — primary도 non-housing → 분기 무관 | X | (분기 조건 미충족) | — | T-17 | ☐ TODO |
| 11 | §103 기본공제 단일 적용 — 2자산이어도 합산 후 250만 1회만 공제 | O | §103 | 사례 28 합산 결과 | T-20 | ☐ TODO |
| 12 | 자동 분기 적용 메타데이터(`appliedReason`) 노출 — "재산-1354 기재부 유권해석" | O | (메타데이터) | — | T-15 | ☐ TODO |

**규칙**:
- 행≥1 없으면 Do 단계 진입 금지.
- "anchor 출처 미발견" 행은 허용하되 상태 ☐로 표시. 발견 즉시 anchor 추가.
- 사용자가 추가 케이스 제시 → 먼저 이 표에 행 추가 → 그 다음 코드.

---

## 엔진 input 타입 — 신규 필드 정의

### 기존 `TransferTaxInput` 확장 (primary 자산)

```ts
// lib/tax-engine/types/transfer-tax.types.ts 에 추가
export type TransferTaxInput = {
  // ... 기존 필드 ...

  /**
   * 건물 정착면적(㎡) — 부수토지 한도 산정용 (영 §154⑦)
   * newConstruction 케이스에서 companion 토지의 부수토지 인정 한도를 계산할 때 사용.
   * undefined이면 부수토지 일체과세 자동 분기 비활성.
   */
  buildingFootprintArea?: number;

  /**
   * 도시지역 여부 — 부수토지 배율 결정 (영 §154⑦)
   * true: 도시지역 → 5배, false: 도시지역 외 → 10배
   * buildingFootprintArea가 있을 때만 유효.
   */
  isUrbanArea?: boolean;
};
```

| 필드 | 타입 | 위치 | 용도 |
|------|------|------|------|
| `buildingFootprintArea` | `number \| undefined` (㎡) | `TransferTaxInput` (primary) | 영 §154⑦ 한도 면적 산정 |
| `isUrbanArea` | `boolean \| undefined` | `TransferTaxInput` (primary) | 도시지역 5배/도시지역 외 10배 분기 |

### 기존 `companionAssetSchema` 확장 (companion 자산)

```ts
// lib/api/transfer-tax-schema-sub.ts — companionAssetSchema에 추가
manualHoldingPeriodOverride: z
  .enum(["shortTermHousing70", "shortTerm60", "progressive"])
  .optional(),
```

| 필드 | 타입 | 위치 | 용도 |
|------|------|------|------|
| `manualHoldingPeriodOverride` | `"shortTermHousing70" \| "shortTerm60" \| "progressive" \| undefined` | `companionAssetSchema` | 사용자가 자동 분기를 수동으로 오버라이드 |

### `acquisitionCause` 활용 (기존 필드 — 신규 옵션 없음)

```
primary.acquisitionCause === "newConstruction" 또는 "purchase"
  → 신축주택 케이스 표시 + 사용승인일 helper-text 노출 (UI)
  → 엔진에서는 건물 보유기간이 1년 미만인지 여부가 핵심 조건
```

> 주의: `newConstruction`은 UI 표시용 hint를 위해 사용하되, 엔진 자동 분기의 실제 조건은 `buildingFootprintArea` 유무 + 건물 보유기간 < 12개월로 판정한다.

---

## 엔진 result 타입 — 신규 필드

```ts
// 부수토지 일체과세 자동 분기 결과 메타데이터 (선택 반환)
appurtenant_land_unified_rate?: {
  /** 자동 분기 적용 여부 */
  applied: boolean;
  /** 적용 근거 (법령+유권해석) */
  appliedReason: string;         // "주택·부수토지 일체과세(§89①3호·영§154⑦, 재산-53/1354)"
  /** 부수토지 인정 한도 면적 (㎡) */
  limitArea: number;
  /** 한도 초과 면적 (㎡, 0이면 전량 부수토지 인정) */
  excessArea: number;
  /** 한도 초과분 적용 세율 */
  excessRate?: number;           // 0.40 (§104①3호 1~2년)
};
```

---

## 자동 분기 조건 의사코드

### 핵심 분기 위치: `lib/tax-engine/transfer-tax-rate-calc.ts`

```ts
// [부수토지 일체과세 원리 — 주택과 함께 양도되는 부수토지의 세율]
// 1차 근거: 소득세법 §89①3호 / 시행령 §154⑦의 입법 취지에 따라
//          주택의 부수토지는 주택과 일체로 보아 주택의 보유기간·세율을 적용한다.
//          (기재부 재산-53(2015.1.15), 재산-1354(2022.10.27))
// 2차 근거: §104① 후단 "하나의 자산이 둘 이상 세율에 해당 시 큰 산출세액 적용"도 같은 결론을 지지.
//
// 면적 한도 (영 §154⑦):
//   부수토지 인정 면적 = 건물 정착면적 × 5(도시지역) 또는 10(도시지역 외)
//   한도 초과분은 일반 나대지로 분리되어 토지 본래 보유기간 기준 §104① 적용.
//
// 신축주택 취득일 (영 §162①4호):
//   자가건축 주택은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 빠른 날.
//
// 사용자가 manualHoldingPeriodOverride 로 수동 지정한 경우 위 자동 분기를 무시한다.

function resolveCompanionLandRate(
  companion: CompanionAssetInput,
  primary: TransferTaxInput,
  primaryHoldingMonths: number,
): CompanionRateResolution {

  // 수동 오버라이드 우선 처리
  if (companion.manualHoldingPeriodOverride !== undefined) {
    return resolveManualOverride(companion.manualHoldingPeriodOverride);
  }

  // 자동 분기 조건 전체 충족 여부 확인
  const isPrimaryHousing =
    primary.propertyType === "housing" ||
    primary.propertyType === "right_to_move_in" ||
    primary.propertyType === "presale_right";

  const isCompanionLand = companion.assetKind === "land";

  const isBundled =
    primary.bundledSaleMode === "apportioned" || primary.bundledSaleMode === "actual";

  const isPrimaryShortTerm = primaryHoldingMonths < 12;  // 1년 미만

  const hasFootprintArea =
    primary.buildingFootprintArea !== undefined && primary.buildingFootprintArea > 0;

  if (
    isPrimaryHousing &&
    isCompanionLand &&
    isBundled &&
    isPrimaryShortTerm &&
    hasFootprintArea
  ) {
    // 영 §154⑦ 부수토지 한도 계산
    const multiplier = (primary.isUrbanArea ?? true) ? 5 : 10;
    const limitArea = primary.buildingFootprintArea! * multiplier;
    const companionArea = companion.area ?? 0;
    const excessArea = Math.max(0, companionArea - limitArea);

    if (excessArea > 0) {
      // 한도 초과분 존재 → 분리 처리 필요
      return {
        applied: true,
        unifiedRate: 0.70,            // 한도 내 면적: 주택 70%
        excessRate: 0.40,             // 한도 초과: 토지 1~2년 보유 §104①3호 40%
        limitArea,
        excessArea,
        appliedReason: "주택·부수토지 일체과세(§89①3호·영§154⑦, 재산-53/1354)",
      };
    }

    // 전량 부수토지 인정 → 토지 전체에 주택 70% 적용
    return {
      applied: true,
      unifiedRate: 0.70,
      excessRate: undefined,
      limitArea,
      excessArea: 0,
      appliedReason: "주택·부수토지 일체과세(§89①3호·영§154⑦, 재산-53/1354)",
    };
  }

  // 자동 분기 미해당 → companion 자산 본래 보유기간 기준 세율 적용
  return { applied: false };
}
```

---

## 수동 오버라이드 분기 표

| `manualHoldingPeriodOverride` 값 | 적용 세율 | 설명 |
|----------------------------------|-----------|------|
| `"shortTermHousing70"` | 70% 단일세율 | 사용자가 주택 단기 70% 강제 지정 |
| `"shortTerm60"` | 60% 단일세율 | 사용자가 1~2년 단기 60% 강제 지정 |
| `"progressive"` | 누진세율(6~45%) | 사용자가 일반 누진세율 강제 지정 |
| `undefined` | 자동 분기 | 엔진이 조건 판단하여 자동 결정 |

---

## 한도 초과분 처리 의사코드

```ts
// companion 토지 면적이 한도를 초과하는 경우
// → 한도 내 면적: 주택 일체과세 → 70%
// → 한도 초과 면적: 일반 나대지 → 토지 본래 보유기간 기준 §104①3호 적용

if (resolution.excessArea > 0 && companionArea > 0) {
  const inLimitRatio  = resolution.limitArea / companionArea;   // 한도 내 비율
  const excessRatio   = resolution.excessArea / companionArea;  // 초과 비율

  // 취득가액·양도가액·양도차익을 비율로 분리
  const inLimitGain  = Math.floor(companionGain * inLimitRatio);
  const excessGain   = companionGain - inLimitGain;

  // 과세표준도 비율 분리
  const inLimitTaxBase = Math.floor(companionTaxBase * inLimitRatio);
  const excessTaxBase  = companionTaxBase - inLimitTaxBase;

  // 한도 내: 70% 단일세율
  const inLimitTax = applyRate(inLimitTaxBase, 0.70);

  // 한도 초과: 토지 보유기간 기준 §104①3호
  // 사례 28 토지 보유 1년 2개월 → 40%
  const excessHoldingMonths = calcCompanionHoldingMonths(companion);
  const excessRate =
    excessHoldingMonths < 12 ? 0.50 :   // 1년 미만 토지
    excessHoldingMonths < 24 ? 0.40 :   // 1~2년 토지
    null;                                // 2년 이상: 누진세율
  const excessTax = excessRate !== null
    ? applyRate(excessTaxBase, excessRate)
    : calculateProgressiveTax(excessTaxBase, brackets);

  const companionTotalTax = inLimitTax + excessTax;
}
```

---

## 계산 알고리즘 (단계별 — 사례 28 기준)

### Step 1: 기준시가 비율 안분 (기존 `bundled-sale-apportionment.ts` 재사용)

```
토지 기준시가 = 540,000원/㎡ × 206.6㎡ = 111,564,000
건물 기준시가 = 건물 공시가격 (사용자 입력 또는 별도 산정)

총 기준시가 합계 → 각 자산의 양도가액 안분
  → 토지 양도가액 = 4억 × (토지기준시가 / 합계기준시가) = 217,542,381
  → 건물 양도가액 = 4억 × (건물기준시가 / 합계기준시가) = 182,457,619
```

### Step 2: 각 자산 양도차익 계산

```
토지 양도차익 = 217,542,381 - 150,000,000 = 67,542,381
건물 양도차익 = 182,457,619 - 100,000,000 = 82,457,619
양도차익 합계 = 150,000,000
```

### Step 3: 부수토지 자동 분기

```
primary(건물) 보유기간: 2022.8.29. ~ 2023.3.6. = 6개월 7일 < 12개월 → 1년 미만
companion(토지) assetKind: "land"
buildingFootprintArea: 123.12㎡, isUrbanArea: true → 한도 = 615.6㎡
companion.area: 206.6㎡ ≤ 615.6㎡ → 전량 부수토지 인정

→ companion 토지 세율 = 70% (주택 단기 일체과세)
```

### Step 4: 장기보유특별공제

```
1년 미만 보유 중과 케이스 → 장기보유특별공제 배제 (§95②)
→ 공제액 = 0
```

### Step 5: 양도소득금액 및 과세표준

```
양도소득금액 = 양도차익 합계 - 장기보유특별공제
            = 150,000,000 - 0 = 150,000,000

기본공제(§103): 2,500,000 (2자산이어도 1회만)

과세표준 = 150,000,000 - 2,500,000 = 147,500,000
         → 천원 미만 절사 → 147,500,000 (이미 정수)
```

### Step 6: 세율 적용

```
70% 단일세율 (주택·부수토지 일체과세)
산출세액 = floor(147,500,000 × 0.70) = 103,250,000
```

### Step 7: 지방소득세·합산

```
지방소득세 = floor(103,250,000 × 0.10) = 10,325,000
총 납부세액 = 103,250,000 + 10,325,000 = 113,575,000
```

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 처리 방침 |
|------|-----------|
| `buildingFootprintArea` | 미입력 시 자동 분기 비활성 (자동 안분 금지) — validation 오류로 차단 |
| `isUrbanArea` | 미입력 시 기본값 `true` (도시지역) 허용 — 가장 보수적인 배율(5배) 적용 |
| `companion.area` | 한도 초과 판정 필수 — 미입력 시 validation 오류 |
| `manualHoldingPeriodOverride` | `undefined`면 자동 분기. 빈 값 ≠ `undefined` — 정규화 시 빈 문자열 → `undefined` 변환 |

---

## 수정 대상 파일 목록

### 1. 엔진 (Pure Layer)

| 파일 | 변경 내용 |
|------|-----------|
| `lib/tax-engine/transfer-tax-rate-calc.ts` | 부수토지 70% 자동 분기 + 수동 오버라이드 + 한도 초과분 분리 로직 추가 |
| `lib/tax-engine/transfer-tax.ts` | companion 세율 결정 호출 시 신축주택 분기 컨텍스트 전달 |
| `lib/tax-engine/bundled-sale-apportionment.ts` | 변경 없음 (기존 안분 엔진 재사용) |

### 2. 타입 / Zod 스키마

| 파일 | 변경 내용 |
|------|-----------|
| `lib/tax-engine/types/transfer-tax.types.ts` | `buildingFootprintArea?`, `isUrbanArea?` 신규 필드 추가 |
| `lib/api/transfer-tax-schema-sub.ts` | `companionAssetSchema`에 `manualHoldingPeriodOverride` enum 추가 |
| `lib/api/transfer-tax-schema.ts` | 메인 input에 `buildingFootprintArea`, `isUrbanArea` 필드 추가 |

### 3. API 변환·Route

| 파일 | 변경 내용 |
|------|-----------|
| `lib/calc/transfer-tax-api.ts` | companion 빌드 시 `manualHoldingPeriodOverride` 페이로드 매핑; primary에 `buildingFootprintArea`, `isUrbanArea` 매핑 |
| `app/api/calc/transfer-tax/route.ts` | Zod 통과 후 엔진 input으로 신규 필드 forwarding |

### 4. 폼 상태·정규화·검증

| 파일 | 변경 내용 |
|------|-----------|
| `lib/stores/calc-wizard-asset.ts` | `AssetForm`에 `buildingFootprintArea?`, `isUrbanArea?`, companion에 `manualHoldingPeriodOverride?` 추가 |
| `lib/stores/calc-wizard-asset-factory.ts` | initial 기본값(undefined) + normalize fallback |
| `lib/calc/transfer-tax-validate.ts` | 신축+1년미만+토지 케이스 전용 검증 분기 추가 |

### 5. UI

| 파일 | 변경 내용 |
|------|-----------|
| `components/calc/transfer/AssetCard*.tsx` | 취득원인 "신축" 옵션 + 정착면적·도시지역 입력 + 일체과세 안내 배지 + 수동 오버라이드 토글 |
| `components/calc/results/transfer/FilingFormTable.tsx` | 세율 셀에 법령 근거 주석 노출 |

### 6. 테스트

| 파일 | 변경 내용 |
|------|-----------|
| `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts` | 신규 — anchor 20개 |

---

## anchor 인벤토리 (20개)

테스트 파일: `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts`

모든 anchor는 **원단위 정수 `toBe()`** 로 작성 (`toBeCloseTo` 금지).
주석에는 `legal-codes.ts` 상수(`TRANSFER.*`) 사용 의무화.

### Group A — 합산 모드 (자동 분기 ON, 사례 28 PDF 일치)

| ID | 검증 항목 | 기대값 | 출처 |
|----|----------|--------|------|
| T-01 | 토지 안분 양도가액 | 217,542,381 | PDF 사례 28 |
| T-02 | 건물 안분 양도가액 | 182,457,619 | PDF 사례 28 |
| T-03 | 토지 양도차익 | 67,542,381 | PDF 사례 28 |
| T-04 | 건물 양도차익 | 82,457,619 | PDF 사례 28 |
| T-05 | 양도차익 합계 | 150,000,000 | PDF 사례 28 |
| T-06 | 양도소득기본공제 | 2,500,000 | §103 |
| T-07 | 과세표준 | 147,500,000 | PDF 사례 28 |
| T-08 | 적용 세율 (자동 분기 결과) | 0.70 | 재산-1354 |
| T-09 | 산출세액 | 103,250,000 | PDF 사례 28 |
| T-10 | 농어촌특별세 | 0 | PDF 사례 28 |
| T-11 | 지방소득세 | 10,325,000 | PDF 사례 28 |
| T-12 | 총 납부세액 | 113,575,000 | PDF 사례 28 |

### Group B — 수동 오버라이드

| ID | 검증 항목 | 조건 | 기대값 |
|----|----------|------|--------|
| T-13 | `manualHoldingPeriodOverride="shortTerm60"` 시 토지 세율 | 60% 강제 | `rate === 0.60` |
| T-14 | `manualHoldingPeriodOverride="progressive"` 시 토지 세율 | 누진세율 강제 | `rate < 0.60` (과세표준에 따라) |
| T-15 | 자동 분기 시 `appliedReason` 노출 | 자동 분기 ON | `"주택·부수토지 일체과세"` 포함 |

### Group C — 경계 / 면적 한도

| ID | 검증 항목 | 조건 | 기대값 |
|----|----------|------|--------|
| T-16 | 건물 보유 12개월 정확히 → 자동 분기 미적용 | `holdingMonths === 12` | `applied === false` |
| T-17 | primary가 land(비주택) + companion이 land → 분기 무관 | `primary.propertyType === "land"` | `applied === false` |
| T-18 | 토지 면적이 정착면적 × 5 초과(도시지역) → 초과분 40% 분리 | `area > footprint × 5` | 초과분 `rate === 0.40` |
| T-19 | 도시지역 외, 정착면적 × 10 한도 적용 | `isUrbanArea === false` | 한도 = `footprint × 10` |

### Group D — §103 기본공제 단일 적용

| ID | 검증 항목 | 조건 | 기대값 |
|----|----------|------|--------|
| T-20 | 2자산이어도 기본공제 250만 × 1회만 → 과세표준 = 150,000,000 - 2,500,000 | 합산 결과 | `taxBase === 147,500,000` |

---

## 코드 주석 템플릿

엔진 분기 위치(`transfer-tax-rate-calc.ts`)에 반드시 아래 주석을 삽입:

```ts
// [부수토지 일체과세 원리 — 주택과 함께 양도되는 부수토지의 세율]
// 1차 근거: 소득세법 §89①3호 / 시행령 §154⑦의 입법 취지에 따라
//          주택의 부수토지는 주택과 일체로 보아 주택의 보유기간·세율을 적용한다.
//          (기재부 재산-53(2015.1.15), 재산-1354(2022.10.27))
// 2차 근거: §104① 후단 "하나의 자산이 둘 이상 세율에 해당 시 큰 산출세액 적용"도 같은 결론을 지지.
//
// 면적 한도 (영 §154⑦):
//   부수토지 인정 면적 = 건물 정착면적 × 5(도시지역) 또는 10(도시지역 외)
//   한도 초과분은 일반 나대지로 분리되어 토지 본래 보유기간 기준 §104① 적용.
//
// 신축주택 취득일 (영 §162①4호):
//   자가건축 주택은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 빠른 날.
//
// 사용자가 manualHoldingPeriodOverride 로 수동 지정한 경우 위 자동 분기를 무시한다.
//
// 법령코드 상수 (legal-codes.ts):
//   TRANSFER.ONE_HOUSE_EXEMPTION    — §89①3호
//   TRANSFER.APPURTENANT_LAND_LIMIT — 영 §154⑦
//   TRANSFER.HIGHER_TAX_RULE        — §104①후단
//   TRANSFER.SELF_BUILT_ACQUISITION_DATE — 영 §162①4호
```

---

## 14개 동기화 지점 점검 (DoD)

| # | 지점 | 본 작업 영향 내용 |
|---|------|-----------------|
| ① 폼 상태 타입 | `AssetForm`에 `buildingFootprintArea?`, `isUrbanArea?`; companion에 `manualHoldingPeriodOverride?` 추가 |
| ② initial value | factory에 `buildingFootprintArea: undefined`, `isUrbanArea: undefined`, `manualHoldingPeriodOverride: undefined` 기본값 |
| ③ normalize fallback | `buildingFootprintArea`, `isUrbanArea` — undefined 보존; `manualHoldingPeriodOverride` 빈 문자열 → undefined 변환 |
| ④ API 변환 | `transfer-tax-api.ts` — primary payload에 `buildingFootprintArea`, `isUrbanArea`; companion payload에 `manualHoldingPeriodOverride` 매핑 |
| ⑤ UI 입력 위젯 | 자산 카드에 정착면적 입력(DecimalInput) + 도시지역 토글(ToggleCard) + 수동 오버라이드 라디오(RadioCardGroup) |
| ⑥ 사이드바 합계 | 영향 없음 (신규 필드는 세율 결정용, 합계 표시에 미영향) |
| ⑦ 결과 카드 산식 | `FilingFormTable` 세율 셀에 "주택·부수토지 일체과세(§89·영§154⑦, 재산-53/1354)" 주석 노출 |
| ⑧ validation | 신축+1년미만+companion 토지 케이스에서 `buildingFootprintArea` 미입력 시 validation 오류 추가 |
| ⑨ Zod enum (메인) | `transfer-tax-schema.ts` — `buildingFootprintArea?: z.number().positive()`, `isUrbanArea?: z.boolean()` |
| ⑩ Zod enum (서브) | `transfer-tax-schema-sub.ts` — `companionAssetSchema`에 `manualHoldingPeriodOverride?: z.enum([...])` |
| ⑪ acquisitionDate fallback | 신축주택 케이스: 영 §162①4호 사용승인일 안내 helper-text를 자산 카드에 노출 (Date 변환 로직 기존과 동일) |
| ⑫ Zod 입력 객체 정의 | `companionAssetSchema`에 `manualHoldingPeriodOverride` 필드 **명시적으로** 추가 (미정의 시 침묵 stripping 발생) |
| ⑬ callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` companion 빌드 시 `manualHoldingPeriodOverride` 누락 없이 spread 확인 (grep 자가 점검) |
| ⑭ Route handler 엔진 매핑 | `route.ts` — `buildingFootprintArea`, `isUrbanArea`, `manualHoldingPeriodOverride` 엔진 input forwarding 포함 |

---

## 회귀 영향 분석

### 기존 anchor와의 관계

| 기존 테스트 | 영향 여부 | 근거 |
|------------|----------|------|
| 사례 27 (동일 아파트 지분취득 합산신고) | 없음 | `manualHoldingPeriodOverride`, `buildingFootprintArea` 미사용 — 기존 경로 그대로 |
| 이월과세 + 비교과세 (§97조의2) | 없음 | companion 세율 분기와 무관한 독립 경로 |
| PHD 3-시점 (§164⑤) | 없음 | 환산취득가 경로, companion 세율 분기와 독립 |
| 장기임대주택 거주주택 양도 (§155⑳) | 없음 | PHRP 안분 경로, companion 세율 분기와 독립 |
| 다주택 중과세 (multi-house-surcharge) | 없음 | 중과세 분기는 별도 경로 (`isSurchargeCase` 플래그), companion 자동 분기와 상호 독립 |
| 비사업용토지 중과 | 없음 | `isNonBusinessLand` 플래그 기반, companion 자동 분기와 독립 |

### 회귀 방지 확인 절차

```bash
# 1. 신규 anchor 단독 실행
npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts

# 2. 기존 양도세 전체 회귀
npx vitest run __tests__/tax-engine/transfer-tax/

# 3. 통합 게이트
npm run check:pre-pr
```

---

## UI 통합 위임

UI 측 명세는 `transfer-tax-new-construction-bundled-case-28.ui.design.md` 참조.

엔진 시니어 책임:
- `TransferTaxInput` 타입 정의 (`buildingFootprintArea?`, `isUrbanArea?`)
- companion 자산 세율 결정 로직 (`resolveCompanionLandRate`)
- 한도 초과분 분리 처리 알고리즘
- anchor 테스트 20개 (`new-construction-bundled-case-28.test.ts`)

UI 시니어 책임 (14개 동기화 지점 ⑤⑥⑦ 포함):
- 자산 카드 신규 입력 위젯 (정착면적, 도시지역, 수동 오버라이드)
- 일체과세 안내 배지 + 한도 초과 경고 표시
- `FilingFormTable` 세율 주석 노출

---

## 완료 정의 (DoD)

- [ ] 부수토지 자동 70% 분기 엔진 구현 + 코드 주석(법령 근거 포함, `TRANSFER.*` 상수 사용)
- [ ] 한도 초과분 분리 처리 구현
- [ ] 수동 오버라이드 (`manualHoldingPeriodOverride`) 필드 + 14개 동기화 지점 전부
- [ ] anchor 테스트 20개 100% 통과 (PDF 원단위 일치)
- [ ] `npx tsc --noEmit` 0건
- [ ] 회귀 테스트(`transfer-tax/` 전체) 통과
- [ ] 브라우저 수동 확인 (Network 탭에서 `manualHoldingPeriodOverride`, `buildingFootprintArea` body 포함 확인)
- [ ] 케이스 매트릭스 표 12행 모두 TODO → DONE 전환
