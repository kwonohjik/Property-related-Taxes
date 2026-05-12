# landNature 명시 입력 + appurtenantLandRateMode 제거 — 실행 계획

## 목적

현재 설계 문제:
- `appurtenantLandRateMode`는 폼-전역 라디오(Step1.tsx)로 "모든 land 자산"에 동일 모드를 강제한다.
- 토지 자산이 2개 이상일 때 자산별로 다른 토지 성격(부수토지 vs 일반토지)을 표현 불가.
- 부수토지 여부를 사용자가 자산-수준에서 직접 선택하게 하면(`landNature`) 더 직관적이고 법령 정확.

변경 방향: `landNature: "appurtenant_to_housing" | "standalone"` 을 companion 자산-수준에 추가하고, 엔진 자동 분기 조건을 `isPrimaryShortTerm` 대신 `landNature === "appurtenant_to_housing"` 기반으로 전환. `appurtenantLandRateMode` 폼-전역 필드는 완전 제거.

---

## 변경 파일 목록 및 상세 방침

### 1. `lib/tax-engine/legal-codes/transfer.ts`

**추가할 상수 2개** (`TRANSFER` 객체 내 세율 섹션 근처):

```ts
/** 소득세법 §89 ① 3호 — 부수토지(주택 일체) 성격 */
LAND_NATURE_APPURTENANT: "소득세법 §89 ① 3호 + 시행령 §154 ⑦",
/** 소득세법 §104 ① — 비부수토지(독립 나대지) 본래 세율 적용 */
LAND_NATURE_NON_BUSINESS: "소득세법 §104 ①",
```

위치: 기존 `APPURTENANT_LAND_LIMIT` / `ONE_HOUSE_EXEMPT` 근처 (§89 관련 섹션).

---

### 2. `lib/tax-engine/types/transfer.types.ts`

**TransferTaxInput에 `landNature` 추가** (optional):

```ts
/**
 * 토지 자산의 성격 — 부수토지 여부 사용자 명시 입력.
 * propertyType === "land" 인 자산에만 의미.
 *
 * - "appurtenant_to_housing": 주택과 함께 양도되는 부수토지 (§89①3호·영§154⑦)
 * - "standalone": 독립 나대지·잡종지 등 주택과 무관한 토지
 *
 * 미지정(undefined) 시 primaryContextForCompanionRate 존재 여부로 자동 추론.
 */
landNature?: "appurtenant_to_housing" | "standalone";
```

위치: `manualHoldingPeriodOverride` 필드 **위** (부수토지 관련 필드 그룹).

**`primaryContextForCompanionRate`에 `landNature` forwarding 필드 추가**:

```ts
primaryContextForCompanionRate?: {
  // ... 기존 필드 유지 ...
  /** companion 토지가 부수토지임을 명시 — landNature forwarding */
  landNature?: "appurtenant_to_housing" | "standalone";
};
```

**`manualHoldingPeriodOverride` deprecated 표기** (JSDoc에 `@deprecated`):

```ts
/**
 * @deprecated landNature 명시 입력으로 대체 예정.
 * T-13/T-14 anchor 유지를 위해 기능 삭제는 하지 않음.
 * ...
 */
manualHoldingPeriodOverride?: ...
```

---

### 3. `lib/tax-engine/appurtenant-land-rate.ts`

**핵심 변경**: 자동 분기 조건 재설계.

현재:
```ts
const isPrimaryShortTerm = primary.holdingMonths < 12;
if (isPrimaryHousing && isCompanionLand && isBundled && isPrimaryShortTerm) { ... }
```

새 분기 로직 (수동 오버라이드 이후):

```ts
// companion.landNature 명시 입력이 있으면 최우선 판단
const isAppurtenantByNature = companion.landNature === "appurtenant_to_housing";
const isStandaloneByNature = companion.landNature === "standalone";

if (isStandaloneByNature) {
  return { applied: false };  // 명시적 독립토지 → 자동 분기 차단
}

// landNature === "appurtenant_to_housing" 또는 미지정(기존 호환) 시 분기 진입 조건 검사
const canAttemptAppurtenant = isAppurtenantByNature ||
  (isCompanionLand && isPrimaryHousing && isBundled);

if (!canAttemptAppurtenant) return { applied: false };
```

**`housingRateForHoldingPeriod()` 신설** (부수토지=Yes 시 보유기간별 동적 세율):

```ts
/**
 * 주택 보유기간에 따른 부수토지 세율 결정.
 * landNature="appurtenant_to_housing" 시 §89①3호·§104①후단 기준.
 *
 * - < 12개월: 0.70 (주택 단기 70%)
 * - 12~24개월: 0.60 (주택 1~2년 60%)
 * - ≥ 24개월: manualProgressive=true (주택 일반 누진)
 */
function housingRateForHoldingPeriod(holdingMonths: number): CompanionLandRateResolution {
  if (holdingMonths < 12) return { applied: true, unifiedRate: 0.70 };
  if (holdingMonths < 24) return { applied: true, unifiedRate: 0.60 };
  return { applied: true, manualProgressive: true };
}
```

**`isPrimaryShortTerm` 조건 제거**: 기존 `isPrimaryShortTerm` 체크 블록을 `housingRateForHoldingPeriod()` 호출로 대체.

**한도 초과 처리**: `landNature="appurtenant_to_housing"` + `buildingFootprintArea` 있을 때 한도 계산은 현행 유지. 한도 내/초과 분리 후:
- 한도 내: `housingRateForHoldingPeriod(holdingMonths).unifiedRate` 또는 `manualProgressive`
- 한도 초과: `holdingMonths ≥ 24`이면 `excessRate` 를 누진(undefined로 passing) → 호출부가 본래 세율 적용; `< 24`이면 `excessRate = 0.40`

**`CompanionLandRateInput`에 `landNature` 추가**:

```ts
export interface CompanionLandRateInput {
  assetKind: string;
  area?: number;
  manualHoldingPeriodOverride?: "shortTermHousing70" | "shortTerm60" | "progressive";
  /** 토지 성격 명시 입력 */
  landNature?: "appurtenant_to_housing" | "standalone";
}
```

---

### 4. `lib/tax-engine/transfer-tax-helpers.ts`

LTHD 부수토지 분기 추가.

현재: 토지 자산은 주택 LTHD 표를 적용하지 않음.

새 분기: companion 토지 엔진 입력에 `landNature === "appurtenant_to_housing"` + `primaryContextForCompanionRate` 있을 때, 해당 primary ctx에서 `isOneHousehold`/`residencePeriodMonths` 체크 후 주택 표 1 또는 표 2 적용.

구체적으로:
- `primaryContextForCompanionRate.landNature === "appurtenant_to_housing"` AND primary ctx에 `isOneHousehold=true` AND `residencePeriodMonths > 0` → 표 2
- `primaryContextForCompanionRate.landNature === "appurtenant_to_housing"` AND (primary ctx 미제공 or `isOneHousehold` 없음) → 표 1만
- `landNature === "standalone"` or 미설정 → 기존 토지 LTHD 분기

**참고**: `primaryContextForCompanionRate`에 `isOneHousehold`/`residencePeriodMonths` 필드를 추가해야 함 (→ item 2 타입 변경에 포함).

---

### 5. `lib/api/transfer-tax-schema.ts`

**`landNature` enum 추가** (메인 스키마 `propertySchema` 내):

```ts
/**
 * ⑨ 토지 자산 성격 — 부수토지 여부 명시.
 * propertyType === "land" 시 의미. 미설정 = 자동 추론.
 */
landNature: z.enum(["appurtenant_to_housing", "standalone"]).optional(),
```

**`appurtenantLandRateMode` 필드 완전 제거**: `203~205` 라인 삭제.

---

### 6. `lib/api/transfer-tax-schema-sub.ts`

**`companionAssetSchema`에 `landNature` 추가**:

```ts
/**
 * ⑩⑫ 토지 자산 성격 — companion 토지가 부수토지인지 명시.
 * assetKind === "land" 시 의미.
 */
landNature: z.enum(["appurtenant_to_housing", "standalone"]).optional(),
```

위치: `manualHoldingPeriodOverride` 근처(404 라인 근처).

---

### 7. `lib/calc/transfer-tax-api-helpers.ts`

**`buildAssetPayload` 함수에 `landNature` spread**:

```ts
// 모든 acquisitionCause에 적용 (purchase/inheritance/gift 공통)
landNature: (asset as Record<string, unknown>).landNature as "appurtenant_to_housing" | "standalone" | undefined,
```

`buildAssetPayload` 함수 내에서 `manualHoldingPeriodOverride` 라인 근처(325번 라인)에 추가.

**주의**: `AssetForm` 타입에 `landNature` 필드는 UI 시니어가 `calc-wizard-asset.ts`에 추가할 때까지 미정의 상태이므로, 타입 안전을 위해 캐스팅 패턴 사용. 엔진에 `undefined`로 전달되어 기존 동작과 동일 (타입 오류 없음).

---

### 8. `lib/calc/transfer-tax-api.ts`

**primary spread에 `landNature` 추가**:

```ts
landNature: primary.landNature as "appurtenant_to_housing" | "standalone" | undefined,
```

`primary`는 `AssetForm`이므로 동일하게 캐스팅 패턴 적용.

**`appurtenantLandRateMode` 전송 라인 제거** (`551번 라인`):

```ts
// 제거할 라인:
appurtenantLandRateMode: form.appurtenantLandRateMode !== "auto" ? form.appurtenantLandRateMode : undefined,
```

---

### 9. `app/api/calc/transfer/route.ts`

**`resolveUserModeOverride` import/호출 제거**:
- `import { resolveUserModeOverride, ... }` → `resolveUserModeOverride` 제거
- `const userModeOverride = resolveUserModeOverride(...)` 라인 삭제
- primary land patch에서 `userModeOverride` 사용 블록(598~600) 삭제
- `buildCompanionEngineInputs` 호출 시 `userModeOverride` 파라미터 제거
- `housingCtxFromCompanion` 관련 userMode 분기 제거

**companion 매핑에 `landNature` forwarding**:

```ts
// CompanionRawAsset 빌드 시
landNature: companionData.landNature,
```

**`primaryContextForCompanionRate`에 `landNature` forwarding**:

```ts
primaryContextForCompanionRate?: {
  // 기존 필드
  landNature: companion.landNature,  // forwarding
}
```

---

### 10. `app/api/calc/transfer/bundled-split-helpers.ts`

**`CompanionRawAsset`에 `landNature` 추가**:

```ts
interface CompanionRawAsset {
  // ... 기존 필드 ...
  landNature?: "appurtenant_to_housing" | "standalone";
}
```

**`CompanionBuildContext`에서 `userModeOverride` 제거**:

```ts
interface CompanionBuildContext {
  // userModeOverride?: ... 삭제
  primaryCtxForSplit?: { ...; landNature?: "appurtenant_to_housing" | "standalone" };
  // 나머지 유지
}
```

**`PrimarySplitContext`에 `landNature` 추가**:

```ts
interface PrimarySplitContext {
  // ... 기존 필드 ...
  landNature?: "appurtenant_to_housing" | "standalone";
}
```

**`resolveUserModeOverride` export 제거** (또는 `@deprecated` 표기로 유지 — 기존 T-13/T-14 사용 여부 확인 후 결정).

실제로 `resolveUserModeOverride`는 테스트에서 직접 호출되지 않으므로 **제거 가능**. `manualHoldingPeriodOverride`는 타입에 유지하므로 T-13/T-14 anchor에 영향 없음.

**`resolveCompanionSplit` 진입 조건 변경**:

현재:
```ts
if (
  primary.acquisitionCause !== "newConstruction" ||
  companion.assetKind !== "land" || ...
)
```

새 조건:
```ts
if (
  companion.landNature !== "appurtenant_to_housing" ||
  companion.assetKind !== "land" || ...
)
```

`acquisitionCause !== "newConstruction"` 조건을 `companion.landNature !== "appurtenant_to_housing"` 으로 대체.

**`buildCompanionEngineInputs`에서 `effectiveOverride` 계산 변경**:

```ts
// 기존: ctx.userModeOverride 참조 제거
const effectiveOverride = c.manualHoldingPeriodOverride;
// (userModeOverride 폼-전역 모드 전달 없음 — landNature로 대체)
```

---

### 11. `__tests__/tax-engine/transfer-tax/_helpers/case-28-fixtures.ts`

**모든 fixture 함수의 companion 토지에 `landNature: "appurtenant_to_housing"` 추가**:

- `makeLandInput()`: primaryContextForCompanionRate 기존 유지, **`landNature: "appurtenant_to_housing"` 최상위 추가**
- `makeAppurtenantInput()`: 동일
- `makeExcessInput()`: `landNature` 없음 유지 (한도 초과분 = 독립 토지로 처리)

---

### 12. `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts`

**T-16 의미 변경**:

현재: "건물 보유 12개월 정확히 → 자동 분기 미적용 (applied=false)"
신규: "`landNature: appurtenant_to_housing` + `holdingMonths: 12` → `applied=true, unifiedRate: 0.60`"

```ts
it("T-16 landNature=appurtenant_to_housing + 주택 보유 12개월(1~2년 구간) → unifiedRate=0.60", () => {
  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
    { propertyType: "housing", holdingMonths: 12, buildingFootprintArea: BUILDING_FOOTPRINT, isUrbanArea: true },
  );
  expect(resolution.applied).toBe(true);
  expect(resolution.unifiedRate).toBe(0.60);
});
```

**T-33 신규** — 부수토지=Yes + 주택 24개월 이상 → 토지 누진세율:

```ts
it("T-33 landNature=appurtenant_to_housing + 주택 보유 ≥24개월 → manualProgressive=true", () => {
  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
    { propertyType: "housing", holdingMonths: 24, buildingFootprintArea: BUILDING_FOOTPRINT, isUrbanArea: true },
  );
  expect(resolution.applied).toBe(true);
  expect(resolution.manualProgressive).toBe(true);
  expect(resolution.unifiedRate).toBeUndefined();
});
```

**T-34 신규** — 부수토지=Yes + 주택 12~24개월 → 토지 0.60:

```ts
it("T-34 landNature=appurtenant_to_housing + 주택 보유 12≤months<24 → unifiedRate=0.60", () => {
  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: LAND_AREA, landNature: "appurtenant_to_housing" },
    { propertyType: "housing", holdingMonths: 18 },
  );
  expect(resolution.applied).toBe(true);
  expect(resolution.unifiedRate).toBe(0.60);
});
```

**T-35 신규** — 부수토지=No (standalone) → 토지 본래 세율 (applied=false):

```ts
it("T-35 landNature=standalone → 자동 분기 차단 (applied=false)", () => {
  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: LAND_AREA, landNature: "standalone" },
    { propertyType: "housing", holdingMonths: 6, buildingFootprintArea: BUILDING_FOOTPRINT, isUrbanArea: true },
  );
  expect(resolution.applied).toBe(false);
});
```

**T-37 신규** — 한도 초과 + 부수토지=Yes + 주택 ≥24개월 → 한도 내(누진) / 한도 초과(본래 세율):

```ts
it("T-37 landNature=appurtenant_to_housing + 한도 초과 + 주택 ≥24개월 → 한도 내 manualProgressive / 초과 본래 세율", () => {
  const oversizeArea = BUILDING_FOOTPRINT * 5 + 100; // 초과 면적 있음
  const resolution = resolveCompanionLandRate(
    { assetKind: "land", area: oversizeArea, landNature: "appurtenant_to_housing" },
    { propertyType: "housing", holdingMonths: 24, buildingFootprintArea: BUILDING_FOOTPRINT, isUrbanArea: true },
  );
  expect(resolution.applied).toBe(true);
  expect(resolution.manualProgressive).toBe(true);       // 한도 내: 누진
  expect(resolution.excessArea).toBeGreaterThan(0);
  expect(resolution.excessRate).toBeUndefined();         // 초과분: 본래 보유기간 세율 (호출부가 처리)
});
```

---

### 13. `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g3.test.ts`

fixture `makeLandInput()`에 `landNature: "appurtenant_to_housing"` 추가로 자동 반영 확인. 직접 수정 사항:

- fixture 공유 방식이므로 case-28-fixtures.ts 변경으로 자동 승계
- 그러나 `resolveCompanionLandRate` 직접 호출 테스트가 있는지 확인 후 필요 시 `landNature` 추가

---

### 14. `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g4.test.ts`

동일. `makeAppurtenantInput()`/`makeExcessInput()` fixture 사용 테스트의 동작 확인.

---

### 15. 디자인 문서 갱신

`docs/02-design/features/transfer-tax-new-construction-bundled-case-28.engine.design.md`:

1. "법령 근거" 섹션 — 부수토지 판정(명시 입력)과 단기양도 세율(보유기간 기반 동적)이 분리됨을 명시
2. 자동 분기 의사코드 교체 — `isPrimaryShortTerm` → `landNature === "appurtenant_to_housing"` + `housingRateForHoldingPeriod()`
3. 케이스 매트릭스 — T-16 의미 변경 행 갱신, T-33~T-37 신규 행 추가
4. `appurtenantLandRateMode` 섹션 제거 (→ `landNature` 섹션으로 대체)

---

## 실행 순서

```
1. legal-codes/transfer.ts       → 상수 2개 추가
2. types/transfer.types.ts       → landNature 필드 + primaryCtx landNature + manualHoldingPeriodOverride deprecated
3. appurtenant-land-rate.ts      → 자동 분기 재설계 + housingRateForHoldingPeriod()
4. transfer-tax-helpers.ts       → LTHD 부수토지 분기
5. transfer-tax-schema.ts        → landNature enum + appurtenantLandRateMode 제거
6. transfer-tax-schema-sub.ts    → companion landNature enum
7. transfer-tax-api-helpers.ts   → buildAssetPayload landNature
8. transfer-tax-api.ts           → primary landNature + appurtenantLandRateMode 제거
9. bundled-split-helpers.ts      → CompanionRawAsset/Context/PrimaryCtx landNature + resolveUserModeOverride 제거
10. route.ts                      → resolveUserModeOverride 제거 + landNature forwarding
11. case-28-fixtures.ts           → landNature 추가
12. case-28.test.ts               → T-16 변경 + T-33~T-37 신규
13. case-28-g3/g4 확인            → 회귀 없음 확인
14. 디자인 문서 갱신
```

---

## 종료 조건 (DoD)

1. `npx tsc --noEmit` 0건
2. `npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts` 통과 (T-16 새 의미 + T-33~T-37 신규 포함)
3. `npx vitest run __tests__/tax-engine/transfer-tax/` 회귀 0건
4. 변경 파일 목록 + anchor 결과 보고

---

## 범위 제한 (Out of Scope)

- UI 영역 (AssetForm, factory, calc-wizard-store, CompanionAssetCard, Step1.tsx, validate.ts, FilingFormTable*) — UI 시니어 병렬 작업
- `manualHoldingPeriodOverride` 기능 삭제 금지 (T-13/T-14 anchor 유지)
- 800줄 정책 준수 — 분할 필요 시 즉시 분리
