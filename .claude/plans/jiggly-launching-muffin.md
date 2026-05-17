# 상세명세서 자산별 산식 누락 수정 — 일반건물 실가 모드 §166⑥ 안분 산식

## Context

### 문제
일반건물(propertyType="general_building") **실가 모드**에서 계산결과 상세명세서의 자산별 펼침 행이 변수값을 포함한 §166⑥ 안분 산식 대신 fallback 문자열만 표시한다.

스크린샷(사례 35 — 주택→상가 용도변경, 실가 800M·취득 400M):

```
양도가액                                                       800,000,000
  자산별 양도가액 합계 — §166⑥ 안분(토지·건물·증축건물 기준시가 비율) 후
  ├ 토지(1001)                                               539,759,036
      자산별 입력 또는 엔진 산정 양도가액 = 539,759,036   ← ❌ fallback
  ├ 건물(3001)                                               260,240,964
      자산별 입력 또는 엔진 산정 양도가액 = 260,240,964   ← ❌ fallback
```

기대 (사례 31 환산모드와 동일한 표기 수준):

```
  ├ 토지(1001)                                               539,759,036
      800,000,000 × 339,492,000 / (339,492,000+163,610,000) = 539,759,036
  ├ 건물(3001)                                               260,240,964
      800,000,000 - 토지 539,759,036 = 260,240,964 (잔액 보정)
```

### 근본 원인
`calculateGeneralBuildingActualTransfer`(실가 모드)는 `aggregated.generalBuildingValuationDetail`을
**설정하지 않는다**. 환산 모드(`general-building-route-helper.ts:387`)에서만 설정됨.

→ UI의 `gbDetail`이 undefined → `buildGbTransferFormula`/`buildGbAcquisitionFormula`/`buildGbExpenseFormula`
가 line 119 조건(`gb && gb.landStdTotal && gb.buildingStdTotal`)을 통과하지 못해 fallback 문자열로 떨어짐.

### 의도된 결과
사례 35(주택→상가 용도변경) + 향후 모든 일반건물 실가 모드(부담부증여 §159①1호 분기는 별도)에서
양도가액·취득가액·필요경비 3개 항목 자산별 산식을 변수값과 함께 노출.

---

## 변경 파일

| # | 파일 | 변경 요지 |
|---|---|---|
| 1 | `app/api/calc/transfer/general-building-route-helper.ts` | `calculateGeneralBuildingActualTransfer` 끝(`:571` 반환 직전)에 `aggregated.generalBuildingValuationDetail = { ... }` 1회 설정 |
| 2 | `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts` | `buildGbAcquisitionFormula`·`buildGbExpenseFormula`에 실가 모드 분기 신설 (양도가액은 기존 §166⑥ 안분 분기 자동 작동) |

---

## 작업 1 — 엔진(API helper)에서 gbDetail 노출

**위치**: `app/api/calc/transfer/general-building-route-helper.ts:571` 직전.

`calculateGeneralBuildingActualTransfer` 내부에 이미 `landStdAtTransfer`·`totalStd`·`transferBuildingStdPrice`·
`acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`·`landArea`·`cards` 모두 산출되어 있음.
이를 `GeneralBuildingOutput` 형태 부분 객체로 묶어 부착한다.

```ts
// (return 직전)
const acqLandStdTotal = acquisitionLandPricePerSqm
  ? Math.floor(acquisitionLandPricePerSqm * landArea)
  : undefined;

aggregated.generalBuildingValuationDetail = {
  // UI 산식 빌더가 참조하는 필드만 채움 (나머지는 optional)
  assetCards: cards,
  nonBusinessRatio,
  landStdTotal: landStdAtTransfer,
  buildingStdTotal: transferBuildingStdPrice,
  acqLandStdTotal,
  acqBuilding1StdTotal: acquisitionBuildingStdPrice,
  // extensionStdTotal / acqExtensionStdTotal는 실가 모드(증축 없음)에서 undefined
  // 사례 35 분기 정보 (취득가 산식 분기에 필요)
  bundledActualAcquisitionPrice: actualAcquisitionPrice ?? undefined,
} as unknown as import("@/lib/tax-engine/general-building-valuation").GeneralBuildingOutput;
```

**주의**: `GeneralBuildingOutput`에 `bundledActualAcquisitionPrice` 필드가 없으므로
타입 확장이 필요. 두 가지 옵션:
- (A) `general-building-valuation.ts:339~381` 타입에 `bundledActualAcquisitionPrice?: number` optional 추가 (권장)
- (B) PerPropertyBreakdown.acquisitionPrice 합산으로 UI에서 도출 (assetCards 합산 가능)

**채택**: (A) — UI 가독성 ↑·타입 안전. legal-codes 변경 없음.

---

## 작업 2 — UI 산식 빌더에 실가 모드 분기 추가

### 양도가액 (`buildGbTransferFormula`, `:98~150`)
**변경 없음**. 기존 line 119~144 분기가 `gb.landStdTotal && gb.buildingStdTotal`만 보고 작동하므로
작업 1 후 자동으로 활성화됨.

### 취득가액 (`buildGbAcquisitionFormula`, `:162~250`)
실가 모드는 환산취득가 §176의2② 산식이 아니라 **§166⑥ 양도시 기준시가 비율로 일괄 실가 안분**.

새 분기 추가 (line 188~233 사이, 환산 모드 분기보다 먼저):

```ts
// ── 실가 모드 분기 (사례 35 등 — 환산취득가 미사용, 일괄 실가 안분) ──
// 토지·건물1만 존재(extensionStdTotal·acqExtensionStdTotal 모두 undefined)이고
// bundledActualAcquisitionPrice가 채워져 있으면 실가 모드.
const isActualBundledMode =
  gb.bundledActualAcquisitionPrice !== undefined &&
  !gb.extensionStdTotal &&
  !gb.acqExtensionStdTotal &&
  !asset?.useEstimatedAcquisition;

if (isActualBundledMode) {
  const bundledAcq = gb.bundledActualAcquisitionPrice!;
  const landStd = gb.landStdTotal!;
  const buildingStd = gb.buildingStdTotal!;
  if (p.propertyId === "land" || p.propertyId === "land_business" || p.propertyId === "land_nbl") {
    // 토지 취득가 = 일괄 실가 × 양도시 토지기준시가 / 총기준시가
    return buildAllocationFormula(bundledAcq, landStd, [landStd, buildingStd], p.acquisitionPrice);
  }
  if (p.propertyId === "building" || p.propertyId === "building1") {
    return buildResidualFormula(bundledAcq, [
      { label: "토지", value: bundledAcq - p.acquisitionPrice },
    ], p.acquisitionPrice);
  }
}
```

### 필요경비 (`buildGbExpenseFormula`, `:258~`)
실가 모드에서 `actualExpenses`(자본적지출+양도비 일괄 실가)도 §166⑥ 비율로 안분된다.
사례 35 입력은 expenses 0이므로 사이드 효과 없지만, 일반화하여 분기 추가:

```ts
const isActualBundledMode =
  gb?.bundledActualAcquisitionPrice !== undefined &&
  !gb.extensionStdTotal;

if (isActualBundledMode && displayExp > 0) {
  // 안분 비율 = transferPrice / totalTransferPrice (이미 §166⑥ 비율과 동일)
  return `필요경비 안분 = 자산별 양도가액 비율 × 일괄 실가 양도비 = ${fmt(displayExp)}`;
}
```

### 검증 가능성 보장
모든 분기에서 산식 = "AAA × BBB / CCC = DDD" 형식 유지. 사용자가 종이로 검산 가능해야 함.

---

## 검증 (verification)

### 1. 회귀
```bash
npx vitest run __tests__/tax-engine/transfer-tax/case-35-house-to-commercial.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/case-31-general-building.test.ts  # 환산 모드 회귀
npx vitest run __tests__/tax-engine/transfer-tax/case-33-general-building-extension.test.ts  # 증축 회귀
npx tsc --noEmit
```

### 2. 브라우저 수동 확인
1. `/calc/transfer-tax` → 자산 종류 "일반건물(토지·건물 분리 산정)" 선택
2. 사례 35 입력값: 양도가 800,000,000 / 취득가 400,000,000(실가) / 토지면적 100㎡ /
   양도시 토지 공시지가 3,394,920원/㎡ / 양도시 건물기준시가 163,610,000원 등
3. 결과 화면 "계산결과 상세명세서" → "양도가액" 펼침
4. **확인 포인트**:
   - 토지(1001) 행 산식 = `800,000,000 × 339,492,000 / (339,492,000+163,610,000) = 539,759,036`
   - 건물(3001) 행 산식 = `800,000,000 - 토지 539,759,036 = 260,240,964 (잔액 보정)`
5. "취득가액" 펼침
   - 토지 산식 = `400,000,000 × 339,492,000 / (339,492,000+163,610,000) = 269,879,518`
   - 건물 산식 = 잔액 보정 형식
6. fallback 문자열 "자산별 입력 또는 엔진 산정 양도가액 = X" 가 **사라졌는지** 확인

### 3. 사례 27·28 회귀 (gbDetail 없는 일반 다건)
다른 case의 fallback 문자열은 **유지**되어야 함 (해당 케이스는 gbDetail 없음 → 분기 미진입).

---

## 영향도 / 비변경 영역

- 엔진 계산값 변경 **없음** — 표시 산식 문자열만 추가.
- 사례 31(환산) / 사례 33(증축) 산식 **변경 없음** — 신규 `isActualBundledMode` 분기는
  `bundledActualAcquisitionPrice !== undefined`로 게이트되어 기존 환산 모드는 unaffected.
- 14개 동기화 지점 영향: 엔진 result 타입에 optional 필드 1개 추가 → ⑦(결과 카드) 한 곳만 변경.
- 800줄 정책: `general-building-valuation.ts`(현재 ~735줄) optional 필드 1줄 +
  helper 객체 spread 한 블록만 추가 (영향 미미).
