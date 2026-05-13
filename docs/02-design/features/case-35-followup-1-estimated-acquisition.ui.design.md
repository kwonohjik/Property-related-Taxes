# 사례 35 후속-1 UI 디자인 — §99-164-10 환산주택가격 입력

> Plan: `docs/00-pm/case-35-followup-1-estimated-acquisition.plan.md`
> Engine: `case-35-followup-1-estimated-acquisition.engine.design.md`

## 1. UI 위치

기존 사례 35 메인 PR에서 추가된 §⑦ "주택 → 상가 용도변경" ToggleCard 내부 sub-section.

활성화 조건:
- `useEstimatedAcquisition === true` (환산취득가 모드)
- `gbHouseToCommercialConversion === true` (주택→상가 변경)
- `gbHasFirstDisclosure === true` (본 sub-toggle)

## 2. AssetForm 신규 필드 (gb* 4개)

| AssetForm | 엔진 매핑 | 타입 |
|---|---|---|
| `gbHasFirstDisclosure` | `hasFirstDisclosure` | `boolean` |
| `gbFirstDisclosurePrice` | `firstDisclosurePrice` | `string` (원 정수) |
| `gbFirstDisclosureLandStdPrice` | `firstDisclosureLandStdPrice` | `string` |
| `gbFirstDisclosureBuildingStdPrice` | `firstDisclosureBuildingStdPrice` | `string` |

initial: `false / "" / "" / ""`.

normalize: `??=` fallback.

## 3. UI 위젯

GeneralBuildingBlock §⑦ 내부:

```tsx
{asset.gbHouseToCommercialConversion && asset.useEstimatedAcquisition && (
  <ToggleCard
    tone="rose"
    variant="card"
    title="주택으로 최초공시 후 상가로 용도변경 (환산취득가)"
    description="취득가액을 모르는 경우 §99-164-10 환산주택가격으로 취득당시 기준시가 환산."
    checked={asset.gbHasFirstDisclosure}
    onCheckedChange={(v) => onChange({ gbHasFirstDisclosure: v })}
  >
    <FieldCard label="최초공시주택가격" unit="원"
      hint="주택가격이 최초로 고시된 시점의 개별주택가격 총액 (원)">
      <CurrencyInput hideUnit
        value={asset.gbFirstDisclosurePrice}
        onChange={(v) => onChange({ gbFirstDisclosurePrice: v })} />
    </FieldCard>
    <FieldCard label="최초공시 당시 토지 기준시가" unit="원"
      hint="최초공시 시점 개별공시지가 × 면적 총액">
      <CurrencyInput hideUnit
        value={asset.gbFirstDisclosureLandStdPrice}
        onChange={(v) => onChange({ gbFirstDisclosureLandStdPrice: v })} />
    </FieldCard>
    <FieldCard label="최초공시 당시 건물 기준시가" unit="원"
      hint="최초공시 시점 건물 기준시가 총액 (원)">
      <CurrencyInput hideUnit
        value={asset.gbFirstDisclosureBuildingStdPrice}
        onChange={(v) => onChange({ gbFirstDisclosureBuildingStdPrice: v })} />
    </FieldCard>
    {convertedPreview && (
      <div className="rounded border bg-rose-100/60 border-rose-300 px-3 py-2 text-xs text-rose-800">
        <p className="font-semibold">환산주택가격 = {convertedPreview.converted.toLocaleString()} 원</p>
        <p className="mt-1">= {convertedPreview.firstDisc.toLocaleString()} × {convertedPreview.acqTotal.toLocaleString()} ÷ {convertedPreview.firstDiscTotal.toLocaleString()}</p>
        <p className="mt-1 text-rose-600">근거: 양도소득세 집행기준 99-164-10</p>
      </div>
    )}
  </ToggleCard>
)}
```

`convertedPreview`는 useMemo 순수 함수 — 4필드 + landArea + acqLandPerSqm + acqBuildingValue 모두 입력 시 환산주택가격 미리보기.

## 4. 14 동기화 지점

| # | 위치 | 변경 |
|---|---|---|
| ① | `calc-wizard-asset.ts` | gb* 4필드 추가 |
| ② | `calc-wizard-asset-factory.ts` | initial `false / "" / "" / ""` |
| ③ | 동상 `migrateAsset` | `??=` fallback |
| ④ | `transfer-tax-api-helpers.ts` 환산 분기 | 조건부 spread 4필드 |
| ⑤ | `GeneralBuildingBlock.tsx` | sub-ToggleCard + 3 CurrencyInput + 미리보기 |
| ⑥ | 사이드바 | 영향 없음 |
| ⑦ | 결과 카드 | (선택) 산식 표시 |
| ⑧ | `transfer-tax-validate-gb.ts` | `gbHasFirstDisclosure=true` 시 3필드 필수 + 합계 양수 |
| ⑨ | Zod enum | 해당 없음 |
| ⑩ | `transfer-tax-building-schemas.ts` `.superRefine` | 4필드 필수 분기 |
| ⑪ | acquisitionDate fallback | 변경 없음 |
| ⑫ | 동상 Zod 객체 정의 | 4필드 명시 |
| ⑬ | `transfer-tax-api.ts` body spread | `generalBuildingValuation` 자동 |
| ⑭ | `general-building-route-helper.ts` | number 변환 후 spread (Date 변환 없음 — 4필드 모두 number) |

## 5. validate 오류 코드

| 조건 | 코드 |
|---|---|
| `gbHasFirstDisclosure=true ∧ gbFirstDisclosurePrice 없음` | `general_building.first_disclosure.price_required` |
| 동상 토지 누락 | `general_building.first_disclosure.land_required` |
| 동상 건물 누락 | `general_building.first_disclosure.building_required` |
| 합계 0 이하 | `general_building.first_disclosure.sum_must_be_positive` |
| `gbHasFirstDisclosure=true` ∧ `useEstimatedAcquisition=false` | 토글 비활성 (UI에서 자동 차단) |

## 6. 회귀 보호

`gbHasFirstDisclosure === false` → API 변환에서 4필드 spread 안 됨 → 엔진 `hasFirstDisclosure === undefined` → 환산 분기 미진입 → 사례 31~34 anchor 100% 보존.
