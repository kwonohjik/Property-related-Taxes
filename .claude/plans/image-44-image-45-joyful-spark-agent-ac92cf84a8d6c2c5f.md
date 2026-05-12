# 주택 부수토지 명시 입력 전환 — 엔진/Zod/API/Route/LTHD/anchor 구현 계획

## 1. 현황 분석

### 핵심 문제점
현재 `appurtenant-land-rate.ts`의 `resolveCompanionLandRate()`는 `isPrimaryShortTerm` (주택 보유 1년 미만) 조건이 있어야 부수토지 일체과세 분기로 진입한다. 이는 법령상 근거 없는 잘못된 결합이다:
- 영 §154⑦ 면적 한도는 보유기간과 무관하게 판정
- 부수토지 판정 = 사실 판정 + 면적 한도
- 단기보유 70% = 세율 결정에만 영향

현재 `resolveCompanionLandRate()` 진입 조건:
```ts
if (isPrimaryHousing && isCompanionLand && isBundled && isPrimaryShortTerm) { ... }
// isPrimaryShortTerm = primary.holdingMonths < 12  ← 제거 대상
```

결과적으로:
- 주택 보유 12개월 이상 + 부수토지 일괄양도 → 70% 또는 누진세율 적용 불가 (항상 applied=false)
- 사용자가 폼-수준 `appurtenantLandRateMode` 라디오로 "간접 제어"하는 구조 (모호)

### 전환 목표
토지 자산에 `landNature: "appurtenant_to_housing" | "non_business_land"` 명시 입력을 추가하고, 자동 분기 조건에서 `isPrimaryShortTerm`을 제거한 뒤 `landNature === "appurtenant_to_housing"` 조건으로 대체한다.

---

## 2. 변경 파일 목록 및 변경 내용

### 파일 1: `lib/tax-engine/legal-codes/transfer.ts`
**변경**: `LAND_NATURE_APPURTENANT`, `LAND_NATURE_NON_BUSINESS` 상수 추가

```ts
// 부수토지 성격 구분 (주택 자산 카드 명시 입력)
LAND_NATURE_APPURTENANT: "소득세법 §89①3호·시행령 §154⑦",  // 주택 부수토지
LAND_NATURE_NON_BUSINESS: "소득세법 §104조의3",               // 독립 비사업용 토지
```

위치: 파일 내 `APPURTENANT_LAND_LIMIT` 상수 근처에 추가. 파일 현재 약 320줄.

---

### 파일 2: `lib/tax-engine/appurtenant-land-rate.ts`
**핵심 변경**: `CompanionLandRateInput`에 `landNature` 필드 추가, 자동 분기 조건 재설계

#### 2-A: `CompanionLandRateInput` 타입 확장
```ts
export interface CompanionLandRateInput {
  assetKind: string;
  area?: number;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /** 부수토지 성격 명시 입력 (사용자 선택). "appurtenant_to_housing" 시 주택 일체과세 분기 활성. */
  landNature?: "appurtenant_to_housing" | "non_business_land";
}
```

#### 2-B: `PrimaryContextForCompanionRate` 타입 확장 (선택적)
```ts
// companion 토지의 landNature를 housingCtx에 전달하는 양방향 시나리오 대응
landNature?: "appurtenant_to_housing" | "non_business_land";
```

#### 2-C: `resolveCompanionLandRate()` 자동 분기 조건 변경
**Before**:
```ts
if (isPrimaryHousing && isCompanionLand && isBundled && isPrimaryShortTerm) {
  // 70% 고정 적용
}
```

**After** (핵심 로직):
```ts
// 1) 부수토지 명시 입력 우선 확인 — "appurtenant_to_housing"이 아니면 즉시 반환
if (companion.landNature !== "appurtenant_to_housing") {
  return { applied: false };
}

// 2) primary가 housing 계열이고 companion이 토지여야 함
if (!isPrimaryHousing || !isCompanionLand) {
  return { applied: false };
}

// 3) 보유기간별 동적 세율 결정 (포괄적 일체과세)
//    주택 < 12개월 → 70%
//    주택 12~24개월 → 60%
//    주택 >= 24개월 → undefined (누진세율 시그널 — manualProgressive: true와 동일 처리)
const rate = housingRateForHoldingPeriod(primary.holdingMonths);

// 4) 면적 한도 검증 (정착면적 입력된 경우)
if (hasFootprintArea) {
  // 기존 한도 초과 분리 로직 유지
  // excessRate: 토지 본래 보유기간 기준 (40%/60%/누진 — 토지 본래)
}

// unifiedRate === undefined → 누진세율 시그널
return { applied: true, unifiedRate: rate, ... };
```

#### 2-D: 내부 헬퍼 함수 추가
```ts
/** 주택 보유기간별 부수토지 적용 세율 (§89①3호·영§154⑦ 포괄적 일체과세) */
function housingRateForHoldingPeriod(months: number): number | undefined {
  if (months < 12) return 0.70;       // 1년 미만
  if (months < 24) return 0.60;       // 1~2년
  return undefined;                   // 2년 이상 → 누진세율 (undefined 시그널)
}
```

#### 2-E: `CompanionLandRateResolution` 타입 — `manualProgressive` 재사용
- `unifiedRate === undefined` + `applied === true` 시 누진세율 적용 (기존 `manualProgressive: true`와 동일 처리 경로)
- 실제 구현: `unifiedRate: undefined` + `manualProgressive: true`로 반환 (일관성 유지)

---

### 파일 3: `lib/tax-engine/transfer-tax-rate-calc.ts`
**변경**: T-1.5 분기에서 `resolution.unifiedRate === undefined` (누진세율 시그널) 처리

현재 코드 (L196~L209)에서:
```ts
if (resolution.unifiedRate !== undefined) {
  // 자동 분기: 70%
  return { ... };
}
// 그 외 applied=true인데 unifiedRate도 manualRate도 없으면 낙하
```

**변경**: `resolution.manualProgressive === true` OR `resolution.unifiedRate === undefined && resolution.applied` 케이스를 명확히 처리 (기존 `manualProgressive` 경로가 이미 처리하므로 `resolveCompanionLandRate`에서 `manualProgressive: true`로 반환하면 기존 코드 재사용 가능)

실제 변경: `resolveCompanionLandRate`가 2년 이상 보유 시 `{ applied: true, manualProgressive: true }` 반환하면 T-1.5 기존 코드 (L172~L184)가 그대로 처리. 신규 코드 불필요.

---

### 파일 4: `lib/tax-engine/transfer-tax-helpers.ts`
**변경**: `calcLongTermHoldingDeduction()` — 부수토지=Yes 시 주택 기준 표 적용

현재 L465~L480의 `rateForYears()` 내부 로직:
```ts
const isOneHouseSingle = input.isOneHousehold && input.householdHousingCount === 1;
```

**추가**: `primaryContextForCompanionRate?.propertyType === "housing"` + `input.landNature === "appurtenant_to_housing"` 조합 감지 시 isOneHouseSingle·residenceYears를 primary의 값으로 override

구체적 구현 위치: `rateForYears()` 호출 전 `isOneHouseSingle` 판정 로직 직후:
```ts
// 부수토지 일체과세: primary 주택 기준으로 LTHD 적용
const primaryCtx = input.primaryContextForCompanionRate;
const isAppurtenantLand =
  input.propertyType === "land" &&
  input.landNature === "appurtenant_to_housing" &&    // ← 신규 필드
  primaryCtx?.propertyType === "housing";

// isAppurtenantLand인 경우 isOneHouseSingle / residenceYears를 primary 기준으로 교체
// ※ primaryCtx는 holdingMonths만 있고 residencePeriodMonths가 없음
//   → 부수토지 LTHD는 "일반 주택 표 1" (보유 × 2%, 최대 30%)로 적용
//   → 1세대1주택 표 2 (80%) 적용 여부는 primary의 isOneHousehold + residencePeriodMonths 필요
//      이를 primaryCtx에 포함시키려면 타입 확장이 필요
```

**타입 확장 검토**: `PrimaryContextForCompanionRate`에 `isOneHousehold?: boolean` + `residencePeriodMonths?: number` 추가 필요

**최소 구현 (Phase 1)**: `primaryCtx`에 `holdingMonths`만 있으므로 부수토지 LTHD는 **일반 보유기간 × 2% (표 1)** 만 적용. 1세대1주택 표 2(80%)는 primaryCtx에 `isOneHousehold`/`residencePeriodMonths`가 전달될 때 활성화.

실제 변경 코드:
```ts
// L421 calcLongTermHoldingDeduction() 내부
const isAppurtenantLand =
  input.propertyType === "land" &&
  (input as any).landNature === "appurtenant_to_housing" &&
  primaryCtx?.propertyType === "housing";

// L465~480 rateForYears 재정의 (appurtenantLand 케이스 분기 추가)
const effectiveIsOneHouseSingle = isAppurtenantLand
  ? (primaryCtx?.isOneHousehold ?? false) && input.householdHousingCount === 1
  : isOneHouseSingle;
const effectiveResidenceYears = isAppurtenantLand
  ? Math.floor((primaryCtx?.residencePeriodMonths ?? 0) / 12)
  : residenceYears;
```

단, `primaryContextForCompanionRate` 타입에 `isOneHousehold?: boolean` + `residencePeriodMonths?: number` 추가 필요.

---

### 파일 5: `lib/tax-engine/types/transfer.types.ts`
**변경 1**: `TransferTaxInput`에 `landNature` 필드 추가
```ts
/**
 * 토지 성격 명시 입력 — propertyType === "land" 시 의미 있음.
 * "appurtenant_to_housing": 주택 부수토지 (§89①3호·영§154⑦ 일체과세 대상)
 * "non_business_land": 독립 비사업용 토지 (§104조의3 중과 대상)
 * 미입력 시 자동 분기 비활성화 (validate에서 토지+주택 일괄양도 시 차단).
 */
landNature?: "appurtenant_to_housing" | "non_business_land";
```

**변경 2**: `primaryContextForCompanionRate` 타입 내 필드 추가
```ts
primaryContextForCompanionRate?: {
  propertyType: TransferTaxInput["propertyType"];
  holdingMonths: number;
  buildingFootprintArea?: number;
  isUrbanArea?: boolean;
  appurtenantLandZone?: AppurtenantLandZone;
  bundledSaleMode?: "actual" | "apportioned";
  /** 부수토지 LTHD 적용 시 primary 주택의 1세대1주택 여부 전달용 */
  isOneHousehold?: boolean;
  /** 부수토지 LTHD 적용 시 primary 주택의 거주기간(월) 전달용 */
  residencePeriodMonths?: number;
};
```

**변경 3**: `manualHoldingPeriodOverride` deprecated 표기 (JSDoc에 @deprecated 추가, 필드는 유지)
- T-13/T-14 anchor 유지 목적

---

### 파일 6: `lib/api/transfer-tax-schema.ts`
**변경 1**: `landNature` enum 추가
```ts
/**
 * ⑨⑫ 토지 성격 명시 입력 (landNature).
 * propertyType === "land" 시 유효. 토지+주택 일괄양도 시 validate에서 필수.
 */
landNature: z.enum(["appurtenant_to_housing", "non_business_land"]).optional(),
```

위치: `appurtenantLandRateMode` 바로 앞 또는 뒤.

**변경 2**: `appurtenantLandRateMode` 필드 제거
```ts
// 제거 대상:
// appurtenantLandRateMode: z.enum(["auto", "unified_short_term_housing", "individual", "progressive"]).optional(),
```

---

### 파일 7: `lib/api/transfer-tax-schema-sub.ts`
**변경**: companion 스키마에 `landNature` enum 추가
```ts
/**
 * ⑩⑫ companion 자산 토지 성격 명시 입력.
 * assetKind === "land"인 companion 자산에서 부수토지 여부 명시.
 */
landNature: z.enum(["appurtenant_to_housing", "non_business_land"]).optional(),
```

위치: `manualHoldingPeriodOverride` 바로 위 (L394 근처).

---

### 파일 8: `lib/calc/transfer-tax-api.ts`
**변경 1**: primary spread에 `landNature` 추가 (L554 근처)
```ts
landNature: form.????.landNature ?? undefined,  // primary 자산의 landNature
```

실제 위치: `appurtenantLandRateMode` 전송 라인(L551) 제거 후 아래에 primary 자산 `landNature` 추가.

**변경 2**: `appurtenantLandRateMode` 전송 라인 제거
```ts
// 제거:
// appurtenantLandRateMode: form.appurtenantLandRateMode !== "auto" ? form.appurtenantLandRateMode : undefined,
```

**주의**: `transfer-tax-api.ts`에서 primary 자산 필드는 `primary` 변수(폼 상태)에서 가져온다. `landNature`가 AssetForm에 추가되어 있어야 한다 (UI 시니어 담당).

---

### 파일 9: `lib/calc/transfer-tax-api-helpers.ts`
**변경**: `buildAssetPayload`에 `landNature` spread 추가
```ts
// L327 근처 (manualHoldingPeriodOverride 라인 직후):
landNature: asset.landNature ?? undefined,
```

이 변경은 `acquisitionCause` 종류에 무관하게 모든 자산에 적용. 현재 buildAssetPayload는 `newConstruction` 케이스 한정 조건 블록으로 특수 필드를 전송하나, `landNature`는 조건 없이 spread.

---

### 파일 10: `app/api/calc/transfer/route.ts`
**변경 1**: `resolveUserModeOverride` 관련 코드 제거/단순화
- L584: `const userModeOverride = resolveUserModeOverride(data.appurtenantLandRateMode);` 제거
- L598~601: `userModeOverride` 적용 블록 제거
- L620: `buildCompanionEngineInputs` 호출 시 `userModeOverride` 인수 제거

**변경 2**: primary land patch에서 `landNature` 전파
```ts
// primary land인 경우 engineInput에 landNature 주입
if (engineInput.propertyType === "land" && data.landNature) {
  engineInput.landNature = data.landNature;
}
```

**변경 3**: `housingCtxFromCompanion` 빌드 시 `residencePeriodMonths` + `isOneHousehold` 전달
`resolveHousingContextFromCompanion()` 반환 타입에 이미 housing companion의 정보가 있어야 하나, 현재 `acquisitionDate` + `buildingFootprintArea` 수준. `residencePeriodMonths`/`isOneHousehold`는 companion Zod 스키마에 없으므로 지금은 생략 (LTHD 일반 표 적용).

**변경 4**: `buildCompanionEngineInputs` 호출 시 `landNature` companion에 forwarding
```ts
// bundled-split-helpers.ts의 CompanionRawAsset에 landNature 추가 후
// buildCompanionEngineInputs 내부에서 companionEngine.landNature = c.landNature 로 전달
```

**변경 5**: `⑭ Route handler 엔진 매핑` — engineInput에 `landNature` 추가
```ts
// L388 근처 engineInput 빌드:
landNature: data.landNature,
```

---

### 파일 11: `app/api/calc/transfer/bundled-split-helpers.ts`
**변경 1**: `CompanionRawAsset` 인터페이스에 `landNature` 필드 추가
```ts
landNature?: "appurtenant_to_housing" | "non_business_land";
```

**변경 2**: `CompanionBuildContext` 인터페이스 — `userModeOverride` 제거
```ts
// 제거:
// userModeOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
```

**변경 3**: `buildCompanionEngineInputs()` 내부
```ts
// userModeOverride 관련 코드 제거:
// const effectiveOverride = c.manualHoldingPeriodOverride ?? (c.assetKind === "land" ? ctx.userModeOverride : undefined);
// → 단순화:
const effectiveOverride = c.manualHoldingPeriodOverride;  // companion 자체 override만

// companionEngine에 landNature 추가:
landNature: c.landNature,
```

**변경 4**: `resolveCompanionSplit()` — split 진입 조건에 `landNature` 반영
```ts
// 기존: primary.acquisitionCause !== "newConstruction" 조건
// 변경 후: newConstruction 조건 제거 또는 landNature로 대체
// → landNature === "appurtenant_to_housing"이면 split 대상
if (
  companion.assetKind !== "land" ||
  companion.landNature !== "appurtenant_to_housing" ||   // ← 신규
  !companion.areaM2 ||
  companion.areaM2 <= 0 ||
  companion.manualHoldingPeriodOverride !== undefined
) {
  return { applied: false };
}
// acquisitionCause === "newConstruction" 조건 제거
```

---

### 파일 12: `app/api/calc/transfer/bundled-split-helpers.ts` — `resolveUserModeOverride` 함수
**변경**: 함수 자체를 제거하거나 deprecated 처리. route.ts에서 호출 제거했으므로 삭제 가능.
단, 800줄 내 공간이 충분하면 JSDoc @deprecated 추가 후 유지 (하위 호환 보험).

---

### 파일 13: anchor 파일들
**13-A**: `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts`
- 모든 `makeLandInput()`, `makeAppurtenantInput()` 호출에 `landNature: "appurtenant_to_housing"` 추가
- T-16 의미 변경: `holdingMonths: 12` → 기존 "applied=false" → 신규 "60% 적용 (applied=true, unifiedRate=0.60)"
- T-17 유지: primary가 "land" → applied=false (landNature 조건 먼저 차단됨에 유의)
  - 수정: T-17 companion에도 `landNature: "appurtenant_to_housing"` 추가하되, primary가 "land" → 여전히 applied=false
- T-18/T-19 유지: 면적 한도 초과 케이스 → `landNature: "appurtenant_to_housing"` 명시 추가

**13-B**: `_helpers/case-28-fixtures.ts`
- `makeLandInput()`: `landNature: "appurtenant_to_housing"` 추가
- `makeAppurtenantInput()`: `landNature: "appurtenant_to_housing"` 추가
- `makeExcessInput()`: `primaryContextForCompanionRate: undefined` 이미 설정 + `landNature` 미추가 (한도 초과분은 부수토지 아님)

**13-C**: `new-construction-bundled-case-28-g3.test.ts` / `new-construction-bundled-case-28-g4.test.ts`
- fixture 공유하므로 자동 반영

**신규 anchor 파일**: 기존 파일에 Group F (T-33~T-37) 추가 또는 별도 파일

---

### 파일 14: 신규 anchor (T-33~T-37)
추가 위치: `new-construction-bundled-case-28.test.ts`에 Group F describe 블록 추가

#### T-33: 부수토지=Yes + 주택 24개월 이상 → 누진세율 + LTHD(주택 기준)
```ts
it("T-33 부수토지=Yes + 주택 24개월 이상 → 누진세율 + 장기보유특별공제(주택 일반 표)", () => {
  const input = makeLandInput({
    landNature: "appurtenant_to_housing",
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 24,   // 2년 이상
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
  });
  const result = calculateTransferTax(input, makeMockRates());
  // 누진세율 적용: 67,542,381 과세표준 → 35% 구간 (8,800만~1.5억)
  expect(result.appliedRate).toBeLessThan(0.60);
  expect(result.appliedRate).toBeGreaterThan(0);
  // LTHD: 2년 보유 → 0% (3년 미만)
  expect(result.longTermDeduction).toBe(0);
});
```

#### T-34: 부수토지=Yes + 주택 12~24개월 → 60%
```ts
it("T-34 부수토지=Yes + 주택 12개월 이상 24개월 미만 → 60%", () => {
  const input = makeLandInput({
    landNature: "appurtenant_to_housing",
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 18,   // 1~2년
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
  });
  const result = calculateTransferTax(input, makeMockRates());
  expect(result.appliedRate).toBe(0.60);
});
```

#### T-35: 부수토지=No (독립 나대지) + 주택 단기 → 자동 분기 미진입 (토지 본래 세율)
```ts
it("T-35 부수토지=No(landNature 미설정) + 주택 단기 → 자동 분기 미적용(applied=false)", () => {
  const resolution = resolveCompanionLandRate(
    {
      assetKind: "land",
      area: LAND_AREA,
      // landNature 미설정
    },
    {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
  );
  expect(resolution.applied).toBe(false);
});
```

```ts
it("T-35b 부수토지=non_business_land + 주택 단기 → 자동 분기 미적용(applied=false)", () => {
  const resolution = resolveCompanionLandRate(
    {
      assetKind: "land",
      area: LAND_AREA,
      landNature: "non_business_land",
    },
    {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
  );
  expect(resolution.applied).toBe(false);
});
```

#### T-37: 한도 초과 + 부수토지=Yes + 주택 24개월 이상 → 한도 내 누진/LTHD, 한도 초과 토지 본래
```ts
it("T-37 한도 초과 + 부수토지=Yes + 주택 2년 이상 → 한도 내 누진+LTHD/한도 초과 토지 본래", () => {
  const resolution = resolveCompanionLandRate(
    {
      assetKind: "land",
      area: EXCESS_LAND_AREA,       // 700㎡
      landNature: "appurtenant_to_housing",
    },
    {
      propertyType: "housing",
      holdingMonths: 24,             // 2년 이상 → 누진 시그널
      buildingFootprintArea: EXCESS_BUILDING_FOOTPRINT,  // 100㎡
      isUrbanArea: true,             // 한도 = 500㎡
    },
  );
  expect(resolution.applied).toBe(true);
  expect(resolution.unifiedRate).toBeUndefined();   // 누진세율 시그널
  expect(resolution.manualProgressive).toBe(true);
  expect(resolution.excessArea).toBe(200);
  expect(resolution.limitArea).toBe(500);
  expect(resolution.excessRate).toBe(0.40);        // 한도 초과 → 토지 1~2년 본래 세율
});
```

---

## 3. 순서별 구현 계획

### Step 1: 타입 + legal-codes (기반)
1. `lib/tax-engine/legal-codes/transfer.ts` — LAND_NATURE 상수 추가
2. `lib/tax-engine/types/transfer.types.ts` — `landNature` + `primaryContextForCompanionRate` 확장
3. `lib/tax-engine/appurtenant-land-rate.ts` — `CompanionLandRateInput.landNature` + `housingRateForHoldingPeriod()` + 자동 분기 조건 재설계

### Step 2: 세율/LTHD 엔진
4. `lib/tax-engine/transfer-tax-rate-calc.ts` — T-1.5 분기 `manualProgressive` 경로 재확인 (기존 코드 재사용)
5. `lib/tax-engine/transfer-tax-helpers.ts` — `calcLongTermHoldingDeduction()` 부수토지 LTHD 분기 추가

### Step 3: Zod / API
6. `lib/api/transfer-tax-schema.ts` — `landNature` enum 추가, `appurtenantLandRateMode` 제거
7. `lib/api/transfer-tax-schema-sub.ts` — companion `landNature` enum 추가
8. `lib/calc/transfer-tax-api-helpers.ts` — `buildAssetPayload`에 `landNature` spread
9. `lib/calc/transfer-tax-api.ts` — primary spread에 `landNature`, `appurtenantLandRateMode` 제거

### Step 4: Route
10. `app/api/calc/transfer/bundled-split-helpers.ts` — `CompanionRawAsset`에 `landNature`, `userModeOverride` 제거, `resolveCompanionSplit()` 조건 변경
11. `app/api/calc/transfer/route.ts` — `resolveUserModeOverride` 제거, `landNature` engineInput 매핑

### Step 5: anchor 마이그레이션 + 신규
12. `_helpers/case-28-fixtures.ts` — `landNature: "appurtenant_to_housing"` 추가
13. `new-construction-bundled-case-28.test.ts` — T-16 의미 변경 + Group F 신규 anchor
14. g3/g4 테스트는 fixture 공유로 자동 반영

---

## 4. 특이 사항 / 위험 관리

### 4-A: T-16 의미 변경
- **Before**: holdingMonths=12 → `isPrimaryShortTerm=false` → applied=false
- **After**: holdingMonths=12 → `landNature === "appurtenant_to_housing"` + 12개월 → 60% 적용 (applied=true)
- 테스트를 `expect(resolution.applied).toBe(false)` → `expect(resolution.unifiedRate).toBe(0.60)` 로 변경

### 4-B: `resolveCompanionSplit()` split 진입 조건
현재 조건: `primary.acquisitionCause !== "newConstruction"` → applied=false
변경 후: `companion.landNature !== "appurtenant_to_housing"` → applied=false

이 변경으로 `acquisitionCause === "newConstruction"` 제약이 풀린다. 모든 일괄양도에서 `landNature: "appurtenant_to_housing"` + 면적 한도 초과 시 split 적용.

### 4-C: `appurtenantLandRateMode` 잔존 확인
schema에서 제거 후 아래 파일들에서 잔존 참조 0건 확인:
- `lib/stores/calc-wizard-store.ts` (UI 시니어 담당이나 엔진 시니어가 schema에서 제거하면 영향)
- `lib/calc/transfer-tax-api.ts` (전송 라인 제거)
- `app/api/calc/transfer/route.ts` (`data.appurtenantLandRateMode` 참조 제거)

### 4-D: `manualHoldingPeriodOverride` 유지
- T-13/T-14 anchor가 여전히 `manualHoldingPeriodOverride` 사용
- `resolveCompanionLandRate()` 최우선 처리(L139~L152) 유지
- 단, 새 `landNature` 조건이 L139 바로 앞에 추가되므로 수동 오버라이드가 `landNature` 체크보다 **우선**

### 4-E: LTHD 부수토지 주택 기준 적용 범위
- `primaryContextForCompanionRate`에 `isOneHousehold`/`residencePeriodMonths`가 없으면 "일반 보유기간 × 2% 표" 적용 (최대 30%)
- 1세대1주택 표 2(80%) 적용은 해당 필드가 전달될 때만 — T-33에서는 2년 보유이므로 3년 미만 → LTHD=0 (두 표 모두 3년 미만은 0%이므로 결과 동일)

### 4-F: 800줄 정책
현재 파일별 예상 변경량:
- `appurtenant-land-rate.ts`: 238줄 → +50줄 = 288줄 (OK)
- `transfer-tax-helpers.ts`: 560줄 → +20줄 = 580줄 (OK)
- `bundled-split-helpers.ts`: 434줄 → ±0 ~ +10줄 (OK)
- `route.ts`: 약 720줄 → -30줄 (OK)

---

## 5. 14개 동기화 지점 자가 점검

| # | 지점 | 변경 | 담당 |
|---|---|---|---|
| ① 폼 상태 타입 | `AssetForm.landNature` 추가 | UI 시니어 |
| ② initial value | `landNature: undefined` | UI 시니어 |
| ③ normalize fallback | undefined 보존 | UI 시니어 |
| ④ API 변환 | `transfer-tax-api.ts` / `-api-helpers.ts` `landNature` spread | **엔진 시니어 (이 파일)** |
| ⑤ UI 입력 위젯 | CompanionAssetCard 토지 블록 RadioCardGroup | UI 시니어 |
| ⑥ 사이드바 합계 | 영향 없음 | - |
| ⑦ 결과 카드 산식 | FilingFormTable 토지 라벨 | UI 시니어 |
| ⑧ validation | 토지+주택 일괄양도 시 `landNature` 필수 차단 | UI 시니어 |
| ⑨ Zod enum 메인 | `transfer-tax-schema.ts` `landNature` enum, `appurtenantLandRateMode` 제거 | **엔진 시니어** |
| ⑩ Zod enum 서브 | `transfer-tax-schema-sub.ts` companion `landNature` enum | **엔진 시니어** |
| ⑪ acquisitionDate fallback | 영향 없음 | - |
| ⑫ Zod 입력 객체 | `landNature` Zod 정의 명시 | **엔진 시니어** |
| ⑬ callTransferTaxAPI body spread | primary + companion `landNature` 포함 | **엔진 시니어** |
| ⑭ Route handler 엔진 매핑 | engineInput.landNature 매핑 | **엔진 시니어** |

엔진 시니어 담당: ④⑨⑩⑫⑬⑭ + 엔진 내부 (appurtenant-land-rate.ts, transfer-tax-helpers.ts, types)

---

## 6. 완료 조건 (DoD)

- [ ] `lib/tax-engine/legal-codes/transfer.ts` — LAND_NATURE 상수 추가
- [ ] `lib/tax-engine/types/transfer.types.ts` — `landNature` + primaryCtx 확장
- [ ] `lib/tax-engine/appurtenant-land-rate.ts` — `landNature` 조건 + `housingRateForHoldingPeriod()` + 단기보유 조건 제거
- [ ] `lib/tax-engine/transfer-tax-helpers.ts` — LTHD 부수토지 주택 기준 분기
- [ ] `lib/api/transfer-tax-schema.ts` — `landNature` 추가, `appurtenantLandRateMode` 제거
- [ ] `lib/api/transfer-tax-schema-sub.ts` — companion `landNature` 추가
- [ ] `lib/calc/transfer-tax-api-helpers.ts` — `buildAssetPayload` `landNature` spread
- [ ] `lib/calc/transfer-tax-api.ts` — primary `landNature` spread, `appurtenantLandRateMode` 제거
- [ ] `app/api/calc/transfer/bundled-split-helpers.ts` — `landNature` 필드, `userModeOverride` 제거, `resolveCompanionSplit` 조건 변경
- [ ] `app/api/calc/transfer/route.ts` — `resolveUserModeOverride` 제거, `landNature` 매핑
- [ ] `_helpers/case-28-fixtures.ts` — `landNature: "appurtenant_to_housing"` 명시
- [ ] T-16 의미 변경 (applied=false → 60% 적용)
- [ ] Group F 신규 anchor (T-33~T-37) 작성
- [ ] `appurtenantLandRateMode` 잔존 0건 grep 확인
- [ ] `landNature` 7개 파일 모두 등장 grep 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts` 통과
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/` 회귀 0건
