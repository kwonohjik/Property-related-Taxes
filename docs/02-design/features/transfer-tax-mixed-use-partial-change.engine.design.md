# Design: 겸용주택 — 보유 중 일부 용도변경 (Engine·API·Test)

**Main Doc**: `transfer-tax-mixed-use-partial-change.design.md`
**작성일**: 2026-04-30
**범위**: 데이터 모델, 엔진 알고리즘 분기, Orchestrator 배선, API Zod 스키마, 검증, 테스트 매트릭스, 법령 매핑

---

## 0. 개정 이력 (Change Log)

| 일자 | 변경 | 사유 |
|---|---|---|
| 2026-04-30 v1 | 초안 — 1·2차 젠스파크 검토 22개 이슈 반영 | Plan 승인 후 |
| 2026-04-30 v1 | `calcCommercialGainSplit` 시그니처에 `acqDerived`·`housingAcqResult` 추가 명시 (이슈 17) | PHD 결합 필수 |
| 2026-04-30 v1 | `acqLandStd=0` 버그 회귀 방지 — 양도시 비율 fallback 산식 추가 (이슈 2·16) | 토지 환산취득가 0 방지 |
| 2026-05-01 v2 | **`fallback_apportion` 자동 안분 분기 전면 제거**. 취득시 상가건물 기준시가·개별공시지가는 사용자 직접 입력 필수. 미입력 시 검증 단계에서 명확한 한국어 오류로 차단. `acqStandardSource` 리터럴을 `"user_input"` 단일로 축소. `mixedUsePdfGap` 픽스처 default가 `commercialBuildingPrice`·`landPricePerSqm`을 양수로 채우도록 갱신, anchor 결과값(상가 환산취득가·세액 등) 8개 재산출. | 사용자 시정 지시: 개별주택공시가격을 면적비율로 자동 안분하면 취득시점의 토지/건물 비율과 무관한 임의값이 산출되어 세법상 부정확. 집행기준 99-164-10 원문도 자동 fallback을 보장하지 않음. 직접 조회·입력이 정확성의 유일한 경로. |
| 2026-05-01 v3 | **PHD §164⑤ 환산 Case A/B 분기 도입**. `firstDisclosureDate < usageChangeDate` 인 경우(Case A) Sum_A·Sum_F 분모/분자에 **전체 토지면적 + 전체 건물 기준시가** 사용. 그 외(Case B)는 기존 산식 유지. `MixedUseGainBreakdown.partialUsageChange.phdScopeBranch` 메타 추가 (`"case_a_whole_building"` / `"case_b_housing_only"`). `validateAssetAcquisition` 에서 `usePreHousingDisclosure + hasPartialUsageChange` 조합 시 `partialChangeDate` 필수 검증. UI: `MixedUsePreHousingDisclosureSection` 에 Case A 진입 안내 박스 + `MixedUseResultCard` 에 분기 배지·산식 노출. `mixedUsePdfGap` 픽스처 `usageChangeDate=2011-08-05` 추가 + 1985/2005 시점 건물 기준시가 추정값 채움 → anchor 10개 재산출. SC-A(분기 비교)·SC-C(시점별 면적 override) 테스트 신규. | 이미지 3~5 사례 사용자 보고: 1985 의제취득 + 2005 최초공시 + 2011 용도변경 케이스에서 P_F = 150,000,000원이 "건물 전체(미래 상가 부분 포함)" 가격인데 현재 알고리즘은 분모/분자를 모두 "주택분만"으로 잡아 P_A_est 가 부정확. P_F 가 가리키는 영역에 맞춰 시점별 면적·건물 기준시가 의미를 분기. |

---

## 1. 데이터 모델

### 1-A. 입력 타입 — `MixedUseAssetInput.partialUsageChange`

**파일**: `lib/tax-engine/types/transfer-mixed-use.types.ts` (L75 직전)

```ts
export interface MixedUseAssetInput {
  // ... 기존 13필드 (겸용주택 본체)

  /** 보유 중 일부 용도변경 옵션 — 양도시 겸용이지만 취득시 단일 용도였던 경우 */
  partialUsageChange?: {
    /** house_to_commercial: 취득시 전체 주택 → 양도시 일부 상가화 (PDF 갑氏)
     *  commercial_to_house: 취득시 전체 상가 → 양도시 일부 주택화 (미러) */
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqResidentialArea?: number;
    /** 취득시 상가연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqCommercialArea?: number;
  };
}
```

### 1-B. 파생값 — `computeAcqDerivedAreas` 신규 헬퍼

**파일**: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` (L54 이후 신설)

```ts
/**
 * 취득시 면적 파생값 산출.
 * `partialUsageChange === undefined`이면 양도시 derived 그대로 반환 (backward compat).
 *
 * direction별 처리:
 *   - house_to_commercial: 취득시 전체가 주택. acqResidentialArea = acqRes ?? (양도시 합계),
 *                          acqCommercialArea = 0
 *   - commercial_to_house: 반대. acqResidentialArea = 0, acqCommercialArea = acqComm ?? 합계
 *
 * 부수토지·정착면적도 동일 비율로 재계산.
 */
export function computeAcqDerivedAreas(
  asset: MixedUseAssetInput,
  transferDerived: MixedUseDerivedAreas,
): MixedUseDerivedAreas {
  if (!asset.partialUsageChange) return transferDerived;

  const { direction, acqResidentialArea, acqCommercialArea } = asset.partialUsageChange;
  const transferTotal = asset.residentialFloorArea + asset.nonResidentialFloorArea;

  const acqRes = direction === "house_to_commercial"
    ? (acqResidentialArea ?? transferTotal)
    : (acqResidentialArea ?? 0);
  const acqComm = direction === "house_to_commercial"
    ? (acqCommercialArea ?? 0)
    : (acqCommercialArea ?? transferTotal);

  const acqTotalFloor = acqRes + acqComm;
  if (acqTotalFloor <= 0) {
    return {
      residentialRatio: 0,
      residentialLandArea: 0,
      commercialLandArea: round2(asset.totalLandArea),
      residentialFootprintArea: 0,
    };
  }
  const acqResRatio = acqRes / acqTotalFloor;
  const acqResLand = round2(asset.totalLandArea * acqResRatio);
  return {
    residentialRatio: acqResRatio,
    residentialLandArea: acqResLand,
    commercialLandArea: round2(asset.totalLandArea - acqResLand),
    residentialFootprintArea: round2(asset.buildingFootprintArea * acqResRatio),
  };
}
```

### 1-C. 출력 타입 — `MixedUseGainBreakdown.partialUsageChange` 메타

**파일**: `lib/tax-engine/types/transfer-mixed-use.types.ts`

```ts
export interface MixedUseGainBreakdown {
  // ... 기존 필드

  /** 용도변경 메타 — 결과 카드 표시용 */
  partialUsageChange?: {
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 (자동 또는 사용자 수정값) */
    acqResidentialArea: number;
    /** 취득시 상가연면적 */
    acqCommercialArea: number;
    /** 사용자가 면적을 수정했는지 여부 */
    isAreaCustomized: boolean;
  };
}

export interface MixedUseCalculationRoute {
  // ... 기존 5필드
  /** 용도변경 분기 사유 (사전 정의 템플릿) */
  partialUsageChangeReason?: string;
}
```

---

## 2. 엔진 알고리즘 분기

### 2-A. `calcCommercialGainSplit` — house_to_commercial 분기 (PDF 갑氏 케이스)

**파일**: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts`

**v2 (2026-05-01) — 자동 안분 fallback 폐지**: 모든 direction에서 사용자 직접 입력만 허용. 미입력 시 명시적 throw.

**시그니처 (v2 기준 — `housingAcqResult` 인자는 deprecated, 제거 예정)**:
```ts
export function calcCommercialGainSplit(
  commercialTransferPrice: number,
  asset: MixedUseAssetInput,
  derived: MixedUseDerivedAreas,
  transferDate: Date,
  acqDerived?: MixedUseDerivedAreas,
  _housingAcqResult?: HousingEstimatedAcqResult,  // v2: 사용 안 함 (PHD 분기 제거)
): CommercialGainSplit
```

**알고리즘 (단일 직접 입력 경로)**:

```ts
// 양도시 상가부분 기준시가
const transferLandStd =
  asset.transferStandardPrice.landPricePerSqm * derived.commercialLandArea;
const transferTotalStd =
  transferLandStd + asset.transferStandardPrice.commercialBuildingPrice;

// 취득시 상가부분 기준시가 — 사용자 직접 입력 필수
const userBuildingStd = asset.acquisitionStandardPrice.commercialBuildingPrice;
const userLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;

if (userBuildingStd <= 0 || userLandPerSqm <= 0) {
  if (asset.partialUsageChange?.direction === "house_to_commercial") {
    throw new Error(
      "보유 중 일부 용도변경(주택→상가): 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요. " +
      "취득 당시 동일 건물의 국세청 고시 기준시가를 직접 조회·입력해야 합니다.",
    );
  }
  throw new Error("겸용주택: 취득시 상가건물 기준시가와 개별공시지가를 모두 입력하세요.");
}

// house_to_commercial은 acqDerived.commercialLandArea = 0이므로 양도시 면적 사용
const landAreaForUserInput =
  asset.partialUsageChange?.direction === "house_to_commercial"
    ? derived.commercialLandArea
    : (acqDerived ?? derived).commercialLandArea;

const acqLandStd = userLandPerSqm * landAreaForUserInput;
const acqBuildingStd = userBuildingStd;
const acqStandardSource = "user_input" as const;

const acqTotalStd = acqLandStd + acqBuildingStd;
// 이하 §97 환산취득가 산정
```

**산식 근거 (집행기준 99-164-10 + 사용자 직접 입력 원칙)**:
- 환산취득가(상가) = 양도가액(상가) × (취득시 상가 기준시가 / 양도시 상가 기준시가) — §97 그대로
- **취득시 상가 기준시가 = 사용자가 직접 입력한 상가건물 기준시가 + (개별공시지가 × 양도시 상가부수토지 면적)**
- 양도시 상가 기준시가 = 양도시 (상가건물 기준시가 + 공시지가 × 상가부수토지면적)
- v1 기준이었던 "취득시 개별주택공시가격 × 양도시 상가연면적 비율" 자동 안분 산식은 폐지
  - 이유: 개별주택공시가격은 토지+건물 일괄가액이라 면적비율로 가르면 취득시점 토지/건물 비율과 무관한 임의값 → 세법상 부정확

### 2-B. `calcHousingGainSplit` — commercial_to_house 미러 분기

**파일**: `lib/tax-engine/transfer-tax-mixed-use-helpers.ts` (L168~264)

**시그니처 변경**: `acqDerived: MixedUseDerivedAreas` 추가.

**알고리즘 (L209~213 분기 삽입)**:

```ts
let acqLandStd: number;
let acqBuildingStd: number;

if (asset.partialUsageChange?.direction === "commercial_to_house") {
  // 취득시 주택이 없었음 → 취득시 상가 기준시가(건물+토지)를 면적비율로 안분
  // ※ MixedUseAssetInput.totalLandArea는 types L46에 명시 정의됨 (필드 존재 확인)
  const acqCommBuilding = asset.acquisitionStandardPrice.commercialBuildingPrice;
  const acqLandPerSqm = asset.acquisitionStandardPrice.landPricePerSqm;

  // 가정: 취득시 토지면적 = 양도시 토지면적 (단순 용도변경 케이스)
  // 분필·합필·도로편입 시에는 사용자가 partialChangeAcqResidentialArea로 보정
  const acqCommTotal = acqCommBuilding + Math.floor(acqLandPerSqm * asset.totalLandArea);
  const totalFloor = asset.residentialFloorArea + asset.nonResidentialFloorArea;
  const housRatio = totalFloor > 0 ? asset.residentialFloorArea / totalFloor : 0;
  const acqHousingTotal = Math.floor(acqCommTotal * housRatio);

  if (acqHousingTotal === 0) {
    throw new Error(
      "용도변경(상가→주택): 취득시 상가 기준시가(건물+토지)가 0이거나 미입력. " +
      "취득시 상가건물 기준시가와 공시지가를 입력하세요.",
    );
  }

  // 토지/건물 내부 분리 — 양도시 토지/건물 비율 차용
  const transferLandRatio = transferTotal > 0 ? transferLandStd / transferTotal : 0.5;
  acqLandStd = Math.floor(acqHousingTotal * transferLandRatio);
  acqBuildingStd = acqHousingTotal - acqLandStd;
} else {
  // 기존 일반 분기 (L209~213)
  acqLandStd = asset.acquisitionStandardPrice.landPricePerSqm * acqDerived.residentialLandArea;
  const acqHousingTotal = asset.acquisitionStandardPrice.housingPrice ?? 0;
  acqBuildingStd = Math.max(acqHousingTotal - acqLandStd, 0);
}
```

**한계 명시**: PDF 직접 사례 부재. 결과 카드에 "법령 적용에 보수 검토 필요" 배지 + 사용자 안내. 분필·합필 시 산식 가정 위반 가능 → Phase 2에서 `partialChangeAcqLandArea` 필드 추가 검토.

### 2-C. `apportionTransferPrice` — 변경 없음

L62~97의 양도가액 안분 산식은 그대로 유지. 양도시 비율은 변동 없음.

### 2-D. 오케스트레이터 배선 — `transfer-tax-mixed-use.ts`

**파일**: `lib/tax-engine/transfer-tax-mixed-use.ts` (L70~110)

```ts
// STEP 1: 면적 파생값
const derived = computeDerivedAreas(asset);
const acqDerived = computeAcqDerivedAreas(asset, derived);  // 신규

// STEP 2: 양도가액 안분
const apportionment = apportionTransferPrice(transferPrice, asset, derived);

// STEP 3: 주택부분 환산취득가 (PHD 또는 §97)
const housingAcqResult = calcHousingEstimatedAcq(
  apportionment.housingTransferPrice,
  asset,
  derived,
);

// STEP 4: 주택 양도차익 (acqDerived 추가)
const housingGainSplit = calcHousingGainSplit(
  apportionment.housingTransferPrice,
  housingAcqResult,
  asset,
  derived,
  acqDerived,        // 신규
  transferDate,
);

// ...

// STEP 7: 상가 양도차익 (acqDerived + housingAcqResult 추가)
const commercialGainSplit = calcCommercialGainSplit(
  apportionment.commercialTransferPrice,
  asset,
  derived,
  acqDerived,        // 신규
  housingAcqResult,  // 신규 (PHD 결합)
  transferDate,
);
```

**Backward compat**: `partialUsageChange === undefined`이면 `acqDerived === derived`이고 두 헬퍼 모두 기존 `else` 분기로 동작 → 기존 겸용주택 회귀 0건.

---

## 3. API · Zod 스키마 · 검증

### 3-A. Zod 스키마

**파일**: `lib/api/transfer-tax-schema-sub.ts` 또는 `app/api/calc/transfer/route.ts` 내부

```ts
const partialUsageChangeSchema = z.object({
  direction: z.enum(["house_to_commercial", "commercial_to_house"]),
  acqResidentialArea: z.number().nonnegative().optional(),
  acqCommercialArea: z.number().nonnegative().optional(),
}).optional();

const mixedUseSchema = z.object({
  // ... 기존 필드
  partialUsageChange: partialUsageChangeSchema,
});
```

### 3-B. API 매핑

**파일**: `lib/calc/transfer-tax-api.ts` (L237~289 mixedUsePayload)

```ts
// ─── 이슈 8: silent skip 방지 명시적 throw ───
if (primary.hasPartialUsageChange && !primary.partialChangeDirection) {
  throw new Error("보유 중 일부 용도변경: 취득시 자산 구성을 선택하세요.");
}

const mixedUsePayload: MixedUseAssetInput = {
  // ... 기존 13필드
  partialUsageChange: primary.hasPartialUsageChange && primary.partialChangeDirection
    ? {
        direction: primary.partialChangeDirection,
        acqResidentialArea: parseFloat(primary.partialChangeAcqResidentialArea) || undefined,
        acqCommercialArea: parseFloat(primary.partialChangeAcqCommercialArea) || undefined,
      }
    : undefined,
};
```

### 3-C. 검증

**파일**: `lib/calc/transfer-tax-validate.ts` (L63~87 겸용주택 분기)

```ts
if (asset.isMixedUseHouse === true) {
  // ... 기존 검증

  if (asset.hasPartialUsageChange) {
    if (!asset.partialChangeDirection) {
      return `${label}: 취득시 자산 구성을 선택하세요.`;
    }
    const acqRes = parseFloat(asset.partialChangeAcqResidentialArea);
    const acqComm = parseFloat(asset.partialChangeAcqCommercialArea);
    if (asset.partialChangeAcqResidentialArea && (isNaN(acqRes) || acqRes < 0)) {
      return `${label}: 취득시 주택연면적이 잘못되었습니다.`;
    }
    if (asset.partialChangeAcqCommercialArea && (isNaN(acqComm) || acqComm < 0)) {
      return `${label}: 취득시 상가연면적이 잘못되었습니다.`;
    }
    // 이슈 5: PHD 강제 변경 금지 — 경고만 추가 (false 변경 안 함)
    // direction === "commercial_to_house" + usePreHousingDisclosure === true 시 UI에서 경고 표시
  }
}
```

---

## 4. 테스트 매트릭스

### 4-A. 신규 테스트 파일

**파일**: `__tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts`

### 4-B. 시나리오 매트릭스

| # | 시나리오 | direction | PHD | 면적 입력 | 검증 포인트 |
|---|---|---|---|---|---|
| 1 | PDF 갑氏 (anchor) | house_to_commercial | ON | 자동 | 양도세·지방세·총납부세액 원단위 toBe |
| 2 | 역방향 미러 | commercial_to_house | OFF | 자동 | 합산 양도소득금액 대칭성 |
| 3 | acqResidential만 입력 | house_to_commercial | OFF | 일부 수동 | 사용자 수정값 우선 적용 |
| 4 | 둘 다 입력 (증축 시뮬) | house_to_commercial | OFF | 둘 다 수동 | 취득시 합계 ≠ 양도시 합계 처리 |
| 5 | 토글 ON & direction "" | — | — | — | API 매핑에서 명시적 Error throw |
| 6 | 부동소수점 누적 오차 | house_to_commercial | OFF | 80.23·134.8·63.5㎡ | 토지+건물 합계 = 양도가액 정확 일치 |
| 7 | 토지 환산취득가 0 회귀 방지 | house_to_commercial | OFF | 자동 | acqLandRatio fallback 검증 (acqLandStd > 0) |
| 8 | PHD 결합 (1985 의제취득) | house_to_commercial | ON | 자동 | phdAcqHousingPrice가 면적비율 안분 기준값으로 사용됨 |
| 9 | 회귀: 토글 OFF | — (undefined) | — | — | 기존 겸용주택 anchor 동일 결과 |
| 10 | 회귀: mixed-use-house.test.ts 전체 | — | — | — | npm test 1,714+ 그린 |

### 4-C. 픽스처

**파일**: `__tests__/tax-engine/_helpers/mixed-use-fixture.ts`

```ts
/**
 * PDF 갑氏 anchor — Plan H절 단계 1.5에서 손계산으로 산출한 결과값
 * (PDF 본문에 결과값이 없으므로 수기 산출 후 고정)
 */
export const PARTIAL_USAGE_CHANGE_ANCHORS = {
  pdf_gap_2023: {
    transferPrice: 1_300_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("1985-01-01"),  // 의제취득
    // ... 입력 데이터
    expected: {
      housingTransferPrice: 0,        // 손계산 후 채움
      commercialTransferPrice: 0,
      housingEstimatedAcq: 0,
      commercialEstimatedAcq: 0,
      housingIncomeAmount: 0,
      commercialIncomeAmount: 0,
      transferTax: 0,
      localTax: 0,
      totalPayable: 0,
    },
  },
} as const;

export function partialUsageChangeFixture(
  direction: "house_to_commercial" | "commercial_to_house",
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  // ... factory 구현
}
```

---

## 5. 법령 매핑

| 조문 | 적용 범위 | 엔진 매핑 |
|---|---|---|
| 시행령 §166⑥ | 양도가액 안분비율 ≠ 취득가액 안분비율 | `apportionTransferPrice` (양도시 비율) vs `calcCommercial/HousingGainSplit` (취득시 비율) |
| 집행기준 99-164-10 (재산-1384, 2009.7.8.) | 용도변경 시 취득가액 안분 = 개별주택가격 기준 | `calcCommercialGainSplit` house_to_commercial 분기 |
| §97 | 환산취득가액 산식 | `calculateEstimatedAcquisitionPrice` (그대로 사용) |
| §164⑤ | 개별주택공시가격 미공시 시 PHD 3-시점 | `calcPreHousingDisclosureGain` → `housingAcqResult.phdAcqHousingPrice` |
| 시행령 §163⑥ | 환산취득가 사용 시 개산공제 (취득시 토지/건물 기준시가 × 3%) | `applyRate(acqLandStd, 0.03)` / `applyRate(acqBuildingStd, 0.03)` |

---

## 6. 에지 케이스 처리

| 케이스 | 처리 |
|---|---|
| `partialUsageChange === undefined` | 기존 겸용주택 분기 (backward compat) |
| `direction === ""` (토글 ON, 미선택) | API 매핑에서 명시적 throw |
| 취득시 면적 미입력 | 양도시 합계로 자동 도출 |
| 취득시 면적 음수 | Zod `nonnegative()` + 검증 함수 reject |
| **`commercialBuildingPrice <= 0` 또는 `landPricePerSqm <= 0` (v2 신규)** | **검증 단계(`validateAssetAcquisition`)에서 사전 차단 → 우회 시 엔진에서 명시적 throw** |
| `housingPrice === 0` & `usePreHousingDisclosure === false` | 검증 단계에서 사전 차단 (PHD 토글 또는 개별주택공시가격 입력 유도) |
| 1985 의제취득 + PHD ON | `phdAcqHousingPrice`를 주택부분 환산에 사용. **상가부분은 별도로 사용자 직접 입력 필수 (v2)** |
| **PHD ON + partialUsageChange ON 조합 (v3 신규)** | **`partialChangeDate` 필수 검증. 미입력 시 검증 단계에서 한국어 오류 반환** |
| **`firstDisclosureDate < usageChangeDate` (Case A, v3 신규)** | **`landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea` 자동 적용. 사용자 입력란의 "주택 건물기준시가"는 "전체 건물 기준시가" 의미로 해석. 결과 카드에 분기 배지 노출** |
| **`firstDisclosureDate ≥ usageChangeDate` (Case B, v3 신규)** | 기존 산식 유지 (시점별 주택부수토지·주택분 건물기준시가). 결과 카드에 Case B 배지 노출 |
| 토지/건물 비율 분모 0 | 양도시 토지/건물 비율 fallback (0.5 임의값 회피) |
| 분필·합필·도로편입 (취득시 토지면적 ≠ 양도시) | Phase 2에서 `partialChangeAcqLandArea` 추가. 1차 PR은 가정 + 결과 카드 안내 |
| 2회 이상 용도변경 | 본 분기 범위 외. 사용자가 최초·최종 시점만 선택 |
| 겸용주택 토글 OFF & partial 토글 ON | UI에서 disabled 가드. API에서 무시 |

---

## 7. 입력 데이터 추적표 — PDF 갑氏 케이스

PDF 본문의 모든 데이터를 엔진 입력에 매핑해 누락 검증.

| PDF 데이터 | 엔진 필드 | 상태 |
|---|---|---|
| 양도일 2023.02.16 | `transferDate` | ✓ 폼-전역 |
| 양도가액 1,300,000,000 | `transferPrice` (=총 양도가액) | ✓ 폼-전역 |
| 의제취득일 1985.1.1 | `landAcquisitionDate` / `buildingAcquisitionDate` | ✓ 자산-수준 |
| 양도시 주택 건물 37.79㎡ (산정) | `residentialFloorArea` | ✓ |
| 양도시 상가 건물 80.23㎡ | `nonResidentialFloorArea` | ✓ |
| 전체 토지 198.3㎡ | `totalLandArea` | ✓ |
| 양도시 개별주택가격 380,000,000 | `transferStandardPrice.housingPrice` | ✓ |
| 양도시 공시지가 3,300,000원/㎡ (2022) | `transferStandardPrice.landPricePerSqm` | ✓ |
| 최초공시 2005.1.1 개별주택가격 150,000,000 | `phdFirstDisclosureHousingPrice` | ✓ PHD |
| 1990 공시지가 840,000원/㎡ | `phdLandPricePerSqmAtAcq` (취득시) | ⚠ 안내 부족 |
| 1층 단독주택 사용승인 1974.2.7 | (계산 미사용 — 메모용) | ⚠ 혼동 가능 |
| 갑氏 = 2주택자 (B주택 보유) | **겸용주택 엔진에 미전달 — Critical 누락** | 🚨 누락 |
| 임대등록 안함 (다주택 중과 판단) | 폼-전역 다른 필드 | △ 본 PR 외 |
| 양도시 상가건물 기준시가 | `transferStandardPrice.commercialBuildingPrice` | ⚠ PDF 미명시 — 조회 안내 필요 |
| 양도시 상가건물 기준시가 (취득시) | `acquisitionStandardPrice.commercialBuildingPrice` | ⚠ 1985 시점 — 추정 필요 |
| 건물 정착면적 | `buildingFootprintArea` | ⚠ 정의 모호 |
| 거주기간 | `mixedUseResidencePeriodYears` | ✓ — 단, 1세대1주택 조건 미충족 시 표1 |

---

## 8. 누락 항목 분석 (UI·엔진·데이터 흐름)

### 8-A. 🚨 Critical — 1세대 1주택 비과세 자동 적용 (다주택자 처리 부재)

**현재 엔진 동작** (`transfer-tax-mixed-use-helpers.ts` L426~427):
```ts
const HIGH_VALUE_THRESHOLD = 1_200_000_000;
const isExempt = apportionment.housingTransferPrice <= HIGH_VALUE_THRESHOLD;
```

→ 주택분 양도가액이 12억 이하면 **무조건 비과세** 처리. 다주택자(PDF 갑氏 같은 케이스)에게 잘못된 결과.

**확인 사항**: 양도세 시스템에 `AssetForm.isOneHousehold: boolean`(L235) 필드는 이미 존재하나, **겸용주택 엔진(`MixedUseAssetInput`) 인자에 미포함**.

**해결 방안** (본 PR에 포함 필수 — PDF anchor 통과 조건):

1. **타입 확장** (`types/transfer-mixed-use.types.ts`):
   ```ts
   export interface MixedUseAssetInput {
     // ... 기존
     /** 1세대 1주택 비과세 요건 충족 여부. false 시 12억 비과세·표2 거주공제 미적용 */
     isOneHouseExempt: boolean;
   }
   ```

2. **엔진 분기** (`transfer-tax-mixed-use-helpers.ts` `buildHousingPart` L426~427):
   ```ts
   const isExempt = asset.isOneHouseExempt
     ? apportionment.housingTransferPrice <= HIGH_VALUE_THRESHOLD
     : false;  // 다주택자: 12억 비과세 미적용
   ```

3. **장기보유공제 표 분기** (L446):
   ```ts
   const useTable2 = asset.isOneHouseExempt && residenceYears >= 2;
   // 다주택자는 거주 2년+ 이어도 표1 적용
   ```

4. **API 매핑** (`transfer-tax-api.ts` mixedUsePayload):
   ```ts
   isOneHouseExempt: primary.isOneHousehold,  // AssetForm 필드에서 전달
   ```

5. **결과 카드 표시** — `MixedUseCalculationRoute.highValueRule`에 `"non_one_house_full_taxation"` 추가.

### 8-B. Major 누락 — UI/안내 보강

| # | 항목 | 영향 | 처리 |
|---|---|---|---|
| 8-B-1 | 양도시 상가건물 기준시가 안내 | 사용자가 PDF에 없는 값을 어디서 가져오는지 모름 | UI hint에 "국세청 홈택스 > 기준시가 조회" 명시 (이미 PHD 섹션엔 있음 — 겸용주택 표준 카드에도 추가) |
| 8-B-2 | 1985 의제취득 + 1990 공시지가 사용 안내 | PHD `phdLandPricePerSqmAtAcq` 입력 시점이 1990인지 1985인지 모호 | UI 안내: "취득시점이 1990 이전이면 1990년 공시지가 사용 권장 (의제취득 처리)" |
| 8-B-3 | 산정면적 vs 전체면적 라벨 명확화 | "주택 연면적" 라벨이 산정면적인지 전체면적인지 모호 | 라벨 변경: "주택 연면적 (산정면적, ㎡)" + hint "개별주택가격확인서 산정면적" |
| 8-B-4 | 의제취득일 옵션 | 1985.1.1.이 의제취득일임을 사용자가 알아야 함 | DateInput hint에 "1985.1.1 이전 취득은 모두 1985.1.1로 입력 (의제취득, §98)" |
| 8-B-5 | 토지·건물 취득일 동일 입력 안내 | 의제취득은 토지·건물 모두 1985.1.1 | "토지·건물 취득일 다름" 토글 OFF + 동일값 안내 |
| 8-B-6 | 건물 정착면적 정의 | 1층 바닥면적 vs 전체 외곽 투영면적 모호 | 라벨 보강: "건물 정착면적 (1층 바닥면적, ㎡)" + hint "건축물대장의 1층 면적" |

### 8-C. Minor 누락 — 본 PR 범위 외 (안내만 추가)

| # | 항목 | 처리 |
|---|---|---|
| 8-C-1 | 사용승인일 vs 취득일 구분 | 별도 필드 불요. 사용자 안내로 충분 |
| 8-C-2 | 임대등록 여부 | 다주택 중과세 모듈에서 처리. 겸용주택 분기에서는 미사용 |
| 8-C-3 | 2주택자 정보(B주택)의 입력 경로 | 양도세 폼-전역 `isOneHousehold=false` 입력으로 충분 (8-A에서 활용) |
| 8-C-4 | 1990 이전 토지등급가액 결합 | 겸용주택은 토지자산이 아니므로 `pre-1990-land-valuation.ts` 미적용. PHD 3-시점으로 처리 |

---

## 9. 보강된 작업 의존 그래프

```
[0] 사전 검증 (apportionTransferPrice·isOneHousehold 흐름)
[1] 타입 확장: MixedUseAssetInput.isOneHouseExempt 추가 (8-A)
    types/transfer-mixed-use.types.ts: partialUsageChange + isOneHouseExempt
[2] legal-codes/transfer.ts 상수
[3] AssetForm 5필드 (calc-wizard-asset.ts)
[4] migration 가드 + 영속화 경로 전수조사
[1.5] PDF 갑氏 손계산 + anchor 산출 (다주택자 분기 적용 후)
[5] computeAcqDerivedAreas 신설
[6] calcCommercialGainSplit 시그니처 변경 + house_to_commercial 분기 + PHD 결합
[7] calcHousingGainSplit 시그니처 변경 + commercial_to_house 분기
[7.5] 🚨 buildHousingPart isExempt 분기 (8-A) — Critical
[8] 오케스트레이터 배선 (asset.isOneHouseExempt 전달 포함)
[9] mixed-use-partial-usage-change.test.ts (anchor + 경계 + PHD + 다주택 분기)
[10] API · Zod · 검증 (isOneHousehold → isOneHouseExempt 매핑)
[11] MixedUseSection.tsx 토글 그리드화
[12] PartialUsageChangeInputs.tsx 신규
[13] MixedUseStandardPriceInputs.tsx 조건 hidden + 안내 보강 (8-B-1, 8-B-2)
[13.5] MixedUseAreaInputs.tsx 라벨 명확화 (8-B-3, 8-B-6)
[13.7] 의제취득일 안내 (8-B-4, 8-B-5)
[14] MixedUseResultCard.tsx direction별 캡션 + 1세대1주택 미적용 표시
[15] E2E (PDF 갑氏 + 다주택자 입력)
[16] 회귀
```

핵심 신규 마일스톤: **[1] 타입 isOneHouseExempt + [7.5] buildHousingPart 분기 + [10] API 매핑 보강** — 이 3개가 PDF anchor 통과의 종속 체인.
