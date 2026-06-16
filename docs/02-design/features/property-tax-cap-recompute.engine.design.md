# 엔진 설계 — A-3 §118 정밀 재산정 (역사 세율표 + 전체 calc 연도화)

> 계획서: `docs/01-plan/features/property-tax-cap-recompute.plan.md`
> 대상: `lib/tax-engine/property-tax.ts`·`property-tax-comprehensive-aggregate.ts`·`separate-aggregate-land.ts`·`separate-taxation.ts`·신규 `data/property-rate-history.ts`
> 작성일 2026-06-16 · Design 단계

## 1. 데이터 — 역사 세율표 (P1)

`lib/tax-engine/data/property-rate-history.ts` (신규, 정적 상수 — memory `feedback_historical_tax_tables`)
```ts
export interface PropertyRateSet {
  buildingGeneral: number;   // 0.0025 (§111①2호 다목)
  buildingLuxury: number;    // 0.04   (§111①2호 가목)
  buildingFactory: number;   // 0.005  (§111①2호 나목)
  vesselAircraft: number;    // 0.003  (§111①4호 나목·5호)
  // 토지 — 누진 brackets (현행 엔진에서 추출)
  landComprehensive: PropertyTaxBracket[]; // 종합합산 0.2~0.5%
  landSeparateAggregate: PropertyTaxBracket[]; // 별도합산 0.2~0.4%
  landSeparatedLow: number;    // 0.0007
  landSeparatedGeneral: number;// 0.002
  landSeparatedHigh: number;   // 0.04
}
// 개정 이력 없음(amendment_track 확인) → 단일 기준연도 엔트리. 미래 개정 시 fromYear 추가.
export const PROPERTY_RATE_HISTORY: Record<number, PropertyRateSet> = { 2005: { ...현행 } };
export function getPropertyRateSet(year: number): PropertyRateSet; // year 이하 최대 fromYear
```
- **현행값 출처(P1 추출 anchor)**: `legal-codes/property.ts` BUILDING_GENERAL/LUXURY_RATE, `property-tax.ts:321`(factory 0.005)·`:692`(0.003), 토지 brackets는 각 엔진에서 추출. **원단위 일치 검증**.

## 2. calc 연도화 시그니처 (P2·P3) — rateSet 주입, 기본=현행 (회귀 0)

| 함수 | 현재 | 연도화 후 |
|---|---|---|
| `calcBuildingTax` (`property-tax.ts:303`) | `(taxBase, buildingType?)` | `(taxBase, buildingType?, rateSet?=getPropertyRateSet(현행))` |
| 선박·항공기 (`:692` 리터럴) | `applyRate(taxBase, 0.003)` | `applyRate(taxBase, rateSet.vesselAircraft)` |
| `calculateComprehensiveAggregateTax` (`comprehensive-aggregate:406`) | `(taxBase)` | `(taxBase, rateSet?)` |
| `calculateSeparateAggregateTax` (`separate-aggregate-land:416`) | `(input: SeparateAggregateInput, _rates?)` — **이미 _rates 인자 보유** | `_rates`/rateSet로 누진 brackets 주입 |
| `calculateSeparateTaxationTax` (`separate-taxation:396`) | `(classification, assessedValue)` — 세율 = `classification.appliedRate`(classify 단계) | **P3 연도화 보류**(Do 환류) — 세율이 classifyHeavy/LowRate/Standard 3함수에 분산 결정 + recompute 대상 아님(C-6x direct). 후속 |

**기본 인자 = `getPropertyRateSet(현행연도)`** → 모든 기존 호출부(종부세 연동 포함) 동작 불변. 각 Phase 후 해당 test + `comprehensive-*.test.ts` 회귀.

## 3. 타입 변경 (input)

`PropertyTaxInput` (`types/property.types.ts`)
```ts
previousYearTax?: number;        // 기존 — direct 모드 직전연도 실제 세액
previousYearTaxBase?: number;    // 신규 — recompute 모드 직전연도 과세표준
taxCapMode?: "direct" | "recompute"; // 신규 — UI 토글. 미지정 시 direct(하위호환)
```

## 4. recompute 알고리즘 (P4)

```
// calculatePropertyTax 본문 — 세부담상한 적용 직전, 비주택 한정, rates 보유
function resolveBasisTax(input, priorYear, rateSet):
  if taxCapMode==="recompute" && previousYearTaxBase!=null:
    return recomputePriorYearTax(objectType, landTaxType, previousYearTaxBase, priorYear)
  return input.previousYearTax   // direct(기존)

recomputePriorYearTax(objectType, landTaxType, priorTaxBase, priorYear):
  rs = getPropertyRateSet(priorYear)
  switch objectType/landTaxType:
    building   → calcBuildingTax(priorTaxBase, buildingType, rs).tax
    vessel/air → applyRate(priorTaxBase, rs.vesselAircraft)
    comprehensive_aggregate → calculateComprehensiveAggregateTax(priorTaxBase, rs)  // 과세표준 단순
    // ── v1 recompute 범위: 위 3종(건축물·선박·종합합산)만 — 과세표준→세액 단순 ──
    // 별도합산(SeparateAggregateInput 면적·필지 안분)·분리(classify 구조)는
    //   직전 과세표준만으로 세액 재산정 불가 → v1은 direct(직전 세액 직접입력) 유지, recompute 비노출(후속)
```
**연도화(P2·P3)는 토지 전체 calc 대상이나, recompute(P4)는 위 3종만.** 별도합산·분리는 calc 연도화는 하되 recompute 모드 미제공.
**세부담상한 4지점 주입** (basisTax를 각 함수 previousYearTax 자리에):
- 분리 `applyTaxCap`(`:581`,`:584`) · 메인 `applyTaxCap`(`:707`,`:710`)
- 종합합산 `applyBurdenCap`(`:638`,`:640`) · 별도합산 내부(`:502`)
- 각 함수 시그니처 불변 — 호출 인자만 basisTax.

## 5. 케이스 인벤토리 (전수)

| ID | objectType/landTaxType | mode | 기대 |
|---|---|---|---|
| C-1 | building | direct | min(당해, previousYearTax×150%) — 현행 회귀 |
| C-2 | building | recompute | 직전 과표 → 직전 세율(calcBuildingTax) → min(당해, ×150%) |
| C-3 | housing | 무관 | 미적용(§122 단서) — determinedTax=당해 |
| C-4 | building | 미입력 | 미적용 + 경고(현행) |
| C-5 | vessel | recompute | rs.vesselAircraft 재산정 |
| C-6 | land/comprehensive_aggregate | recompute | applyBurdenCap(:638) — **종합합산만 recompute**(과표 단순) |
| C-6x | land/separated·separate_aggregate | **direct only** | recompute 비노출(면적·classify 구조) — direct 직접입력 유지 |
| C-7 | building | recompute, 세율 개정연도 | priorYear 세율 적용 + 경고(현재 단일이라 현행과 동일, 미래 대비) |

## 6. anchor (Pre-Do)

1. P1: `getPropertyRateSet(2026).buildingGeneral === 0.0025`·`.vesselAircraft === 0.003` 등 현행 일치
2. P2/P3: 연도화 후 기존 calc anchor 불변(회귀) — calcBuildingTax·토지 3분류
3. P4: C-2(건축물)·C-5(선박)·C-6a/b/c(토지 3경로) recompute + C-1 direct 회귀 + C-3 주택
4. P6: calculatePropertyTax 통합 determinedTax 4분류

## 7. 회귀·800줄

- 최대 리스크: calc 시그니처 변경 → 기본 인자 현행 rateSet로 보존. comprehensive 연동 회귀 필수.
- `property-rate-history.ts` 단일 책임. `recomputePriorYearTax`는 신규 헬퍼(property-tax-helpers 또는 신규 파일).
- 종부세 영향: 토지 calc(`calculateComprehensiveAggregateTax` 등)를 종부세가 import하는지 P3 착수 시 grep 확인 → 영향 시 기본 인자로 보존.
