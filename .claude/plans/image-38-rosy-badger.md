# 다자산 합산 신고서 양식 표 — 단건 32행과 동일 구성으로 통일

## Context

사용자가 사례 27(동일 아파트 2회 지분취득, 1세대1주택 고가주택 합산신고) 결과 화면의 "신고서 양식" 표에 두 가지 문제를 지적함.

**현 상태**:
- 단건 양도(`FilingFormTable`, `FilingFormTableHelpers.ts:552-591`): 32행 — 양도일자/취득일자/보유기간/양도가액/취득가액/필요경비/전체 양도차익/비과세 양도차익/과세대상 양도차익/장기보유공제(계+보유분+거주분)/양도소득금액/기본공제/과세표준/산출세액/감면세액/결정세액/가산세/총결정세액/농어촌특별세/지방소득세 일체.
- 다자산 합산(`BundledAllocationCard.tsx > FilingFormTableAggregate`, 56-148): 자체 13행 하드코딩, 열 순서 `항목 | 자산1 | 자산2 | 합계`.

**사용자 지시**:
- **단건 양도는 기존 32행을 그대로 유지** (변경 없음).
- **다건 양도(다자산 합산)는 단건과 동일하게 32행으로 행수를 맞춤**.
- 다자산 열 순서: `항목 | 합계 | 자산1 | 자산2 | …`.

## 변경 대상 파일

| 파일 | 위치 | 역할 |
|---|---|---|
| `components/calc/results/BundledAllocationCard.tsx` | `FilingFormTableAggregate` (56-148) → **삭제**, 호출부(450-455), Props(10-21) | 자체 13행 표 제거하고 공용 `FilingFormTable` 호출로 교체 |
| `components/calc/results/transfer/FilingFormTable.tsx` | 1-157 | `aggregate` 모드 props 지원 (다자산 컬럼 + 자산별 셀 렌더) |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | `deriveColumns` (72-115), `buildRows` (286-543), `splitLtDeduction` (159) | `aggregate` 모드 분기 추가, `splitLtDeduction` export |
| `app/calc/transfer-tax/TransferTaxCalculator.tsx` | 471-485 | `formData` prop을 `BundledAllocationCard`에 전달 |

**단건 `FilingFormTable`의 기존 행/렌더 동작은 변경하지 않음** — 신규 모드 분기만 추가.

엔진(타입·계산) 미변경 — 기존 `PerPropertyBreakdown`/`AggregateTransferResult` + `formData.assets[]`로 모두 도출.

## 구현 방침

### 1. `FilingFormTableHelpers.ts` 에 `aggregate` 모드 추가

기존 4모드(`single`/`split-2col`/`mixed-2col`/`fourpart`)에 **`aggregate` 모드** 신설.

- `deriveColumns`(72-115): `aggregate` 모드 분기 추가 → `[{ key: "total", label: "합계" }, ...properties.map(p => ({ key: p.propertyId, label: p.propertyLabel + 지분배지 }))]`. 단건 모드 columns(`[{key:"total"}]`)와 분리·혼합 모드는 그대로.
- `buildRows`(286-543): `mode === "aggregate"` 분기 추가. 자산별 데이터 채우기 헬퍼 `aggregateFinancials(properties, formData, setNum, setStr)` 신설:
  - 자산별 머리정보 (`transferDate`/`acquisitionDate`/`holdingPeriod`/`residencePeriod`/`moveOut`/`moveIn`)는 `formData.assets[i]`에서 도출, 합계 칸엔 단건 동일 로직 그대로.
  - `transferPrice`/`acquisitionPrice`/`expenses`: `PerPropertyBreakdown` 그대로 (자본적지출은 취득가액에 합산하는 신고서 표시 관행 유지 — 기존 `FilingFormTableAggregate`와 동일).
  - `transferGain`: `p.transferGain`.
  - **`taxableGain`**: `assetTaxableGain = max(0, p.income) + p.longTermHoldingDeduction`.
  - **`exemptGain`**: `p.transferGain - assetTaxableGain` (음수는 0으로 절단).
  - **`ltDeduction`**: `p.longTermHoldingDeduction` (음수 표기, 기존 단건과 동일).
  - **`ltHoldingPart` / `ltResidencePart`**: `splitLtDeduction(p.longTermHoldingDeduction, holdingMonths, residenceMonths, useTable2)` 호출. 입력값:
    - `holdingMonths` = `calculateHoldingPeriod(asset.acquisitionDate, transferDate)` (`tax-utils.ts`).
    - `residenceMonths` = 단건 buildRows(`FilingFormTableHelpers.ts:349~`)의 동일 도출 식 재사용 (`asset.residencePeriods` 합 또는 `residenceMonthsDirect`).
    - `useTable2` = 단건과 동일 휴리스틱.
  - `incomeAmount`: `p.income`. 합계 = `aggregated.totalIncomeAfterOffset`.
  - **합산-only 행** (자산 셀 `null`, 합계만): `basicDeduction`/`taxBase`/`reductionTax`(합계)/`penaltyTax`(합계)/`ruralSurtax`/`localCalculatedTax`/`localReduction`/`localDeterminedTax`.
  - **자산별 가능 행**: `calculatedTax = p.refCalculatedTax`, `determinedTax = p.refDeterminedTax`, `reductionTax = -p.reductionAggregated`, `penaltyTax = p.penaltyTax + p.filingDelayedPenaltyTax`. 합계는 `aggregated.*`.
- `splitLtDeduction`(159) module-internal → **`export` 추가** (외부 재사용 X — 같은 파일 내 호출이지만 일관성).

### 2. `FilingFormTable.tsx` 에 `aggregate` props 추가

```tsx
interface FilingFormTableProps {
  result: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
  acquisitionDateLabel?: string;
  acquisitionDateOverride?: string;
  // 신규
  aggregate?: {
    properties: PerPropertyBreakdown[];
    aggregated: AggregateTransferResult;
    ownershipMap?: Map<string, { numerator: number; denominator: number }>;
  };
}
```

`aggregate` 존재 시 `deriveColumns({ result, aggregate })`가 `aggregate` 모드 컬럼 반환 → 헤더는 컬럼 배열 순서대로 (`total → properties...`) 출력. 자산 컬럼 헤더 라벨은 `propertyLabel + 지분배지`(`ownershipMap` 활용).

기존 단건/분리/혼합 모드 헤더·렌더 로직은 변경하지 않음.

### 3. `BundledAllocationCard.tsx` — 자체 표 제거

- `FilingFormTableAggregate`(56-148), `FilingRow`(150-192), `SeparatorRow`(194-202) **삭제**.
- 호출부(450-455)를 다음으로 교체:
  ```tsx
  <FilingFormTable
    result={aggregateToFilingResult(aggregated)}  // 합계 필드만 채워 단건 형태로 어댑팅 (기존 breakdownToFilingResult 패턴 재사용)
    formData={formData}
    aggregate={{ properties: aggregated.properties, aggregated, ownershipMap }}
  />
  ```
- `aggregateToFilingResult` 어댑팅 함수 신설(같은 파일): `aggregated.taxBase`/`calculatedTax`/`determinedTax`/`localIncomeTax`/`totalTax`/`reductionAmount`/`basicDeduction`/`penaltyTax` 등을 `TransferTaxResult` 형태로 합계 채움. `mixedUseDetail`/`splitDetail` 미설정 → `aggregate` 모드가 우선 적용됨.
- `BundledAllocationCard` Props에 `formData: TransferFormData` 추가.

### 4. `TransferTaxCalculator.tsx` — formData 전달

`471-485` 호출부에 `formData={formData}` 추가.

### 5. 비과세 양도차익 산정 정확도 — 한계

엄밀한 사례 27의 비과세 안분은 **합산 분모(`totalPropertyTransferPrice`)** 기반이므로, 자산별 `taxableGain` 분할은 엔진에서 직접 노출되지 않음. 본 계획에서는 `assetTaxableGain = max(0, p.income) + p.longTermHoldingDeduction` 역산. 1세대1주택 비과세가 적용되지 않는 일반 다자산 합산(묶음매매 등)에서는 자연스럽게 `assetTaxableGain === p.transferGain`로 도출되어 비과세 행 = 0.

후속(별도 PDCA): `PerPropertyBreakdown`에 `taxableGain`/`exemptGain` 명시 필드 추가하면 더 정확.

## 검증

1. **타입 체크**: `npx tsc --noEmit` 0건.
2. **anchor 회귀**: `npx vitest run __tests__/tax-engine/transfer/` (사례 27 anchor 15개 — 산출세액 39,702,352 / 총 납부 43,672,587 유지). 엔진 미변경.
3. **브라우저 수동 확인** (필수):
   - **(a) 단건 양도** (일반 1자산): 신고서 양식 표가 기존과 100% 동일한 32행, 열 = `항목 | 합계` (회귀 없음 검증).
   - **(b) 단건 분리/겸용주택**: 기존 그대로 (회귀 없음).
   - **(c) 사례 27 다자산 합산**:
     - 열 순서: `항목 | 합계 | 주 자산(주택) 지분 60% | 자산 2 지분 40%`
     - 32행 모두 표시 (자산 셀이 null인 행은 "—" 표기).
     - 비과세/과세 양도차익 자산별 표시 확인 (자산1 `assetTaxableGain = 30,282,353 + 121,129,411 = 151,411,764`, 비과세 363,388,236 — 실제 화면값으로 확인).
     - 장특공 보유분/거주분 분리: 자산1만 분리, 자산2는 단기보유라 0.
     - 합계 산출세액 39,702,352 / 총 납부세액 43,672,587 변동 없음.
   - **(d) 다른 다자산 시나리오**(묶음매매 등)도 32행 자연스러움 확인.

## 하지 않는 것 (Out of scope)

- 단건 `FilingFormTable` 행/렌더 변경 — 사용자 지시로 명시적 제외.
- 엔진 타입(`PerPropertyBreakdown`) 확장 — 후속 작업.
- `BundledAllocationCard`의 다른 카드(`PropertyCard`/`AggregatedTaxSummary`/안분 표) 변경.
- PDF 신고서 출력 변경.
- 농어촌특별세 자산별 안분 — 합계만 표시.
