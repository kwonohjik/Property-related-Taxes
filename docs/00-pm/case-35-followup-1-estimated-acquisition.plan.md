# 사례 35 후속 PR #1 — 주택→상가 용도변경 환산취득가 분기 (§99-164-10)

> 본 사례 35 메인 PR(`beb9ea5`·`93b4145`·`41af0c0`)의 §9 후속-1 트리거.
> 취득가액을 모르는 경우 양도소득세 집행기준 99-164-10의 환산주택가격 산식을 적용한다.

## 1. 법령 근거

**양도소득세 집행기준 99-164-10** (PDF p.539 박스 인용):

> 취득당시에는 주택으로 개별주택가격이 고시된 이후 상가건물로 용도를 변경하여 양도하는 경우,
> 취득 시 기준시가는 환산주택가격을 자산별 기준시가로 안분하여 토지와 주택분 기준시가를 각각 산정하며,
> 양도 시 기준시가는 일반건물과 토지에 대한 기준시가를 적용하여 계산한다.

### 1-1. 산식

```
취득당시 환산주택가격(기준시가)
  = 최초공시주택가격 × (토지 취득당시 기준시가 + 건물 취득당시 기준시가)
                    ÷ (주택가격 최초공시 당시 토지기준시가 + 건물기준시가 합계)
```

이 환산주택가격을 토지·건물 자산별 취득당시 기준시가로 안분하여 각 자산의 취득가액 환산(§176조의2)에 사용.

### 1-2. 양도시 기준시가

- 건물: 국세청장 고시 산정방법 평가가액
- 토지: 개별공시지가 × 면적(㎡)

### 1-3. 본 PR 적용 범위

- propertyType = `general_building` + `useEstimatedAcquisition = true` (환산 모드)
- 사용자가 "주택으로 취득 후 상가로 용도변경" 추가 토글 ON
- 취득당시 토지·건물 기준시가는 별도 입력 불가능 (이미 주택으로 일괄 공시되었던 시점) → **최초공시주택가격 + 최초공시 시점 토지·건물 기준시가**로 환산

## 2. 사용 시나리오 (가상 케이스 35-F1)

사용자가 1995년 주택 취득 → 2010년 상가로 용도변경 → 2024년 양도. 취득가액 영수증 없음 → 환산취득가 모드.

| 항목 | 값 |
|---|---|
| 취득일 | 1995-03-15 |
| 용도변경일 | 2010-08-07 |
| 양도일 | 2024-02-19 |
| 양도가 | 800,000,000 |
| 양도시 토지 기준시가 | 10,830,000 원/㎡ × 85㎡ = 920,550,000 |
| 양도시 건물 기준시가 | 20,629,440 |
| 최초공시주택가격 (1995 첫 고시) | 가상 100,000,000 |
| 최초공시 당시 토지기준시가 | 28,000,000 |
| 최초공시 당시 건물기준시가 | 12,000,000 |
| 취득당시 토지기준시가 | 30,000,000 |
| 취득당시 건물기준시가 | 14,000,000 |

```
환산주택가격 = 100,000,000 × (30,000,000 + 14,000,000) ÷ (28,000,000 + 12,000,000)
            = 100,000,000 × 44,000,000 ÷ 40,000,000
            = 110,000,000
```

이 환산주택가격이 일반건물 환산 산식의 **취득당시 합계 기준시가** 역할.

## 3. 신규 입력 필드

기존 환산 모드 입력 위에 4필드 추가 (`GeneralBuildingInput` / `AssetForm`):

| AssetForm (gb*) | 엔진 측 | 의미 |
|---|---|---|
| `gbHasFirstDisclosure` | `hasFirstDisclosure?: boolean` | "주택으로 최초공시 후 상가로 용도변경" 토글 |
| `gbFirstDisclosurePrice` | `firstDisclosurePrice?: number` | 최초공시주택가격 (원) |
| `gbFirstDisclosureLandStdPrice` | `firstDisclosureLandStdPrice?: number` | 최초공시 당시 토지 기준시가 (원) |
| `gbFirstDisclosureBuildingStdPrice` | `firstDisclosureBuildingStdPrice?: number` | 최초공시 당시 건물 기준시가 (원) |

활성화 조건: `useEstimatedAcquisition === true` AND `gbHouseToCommercialConversion === true` (본 PR 메인의 토글) AND `gbHasFirstDisclosure === true`.

기존 `gbAcqLandPricePerSqm` / `gbAcqBuildingValue` 는 **취득당시** 토지·건물 기준시가로 그대로 사용.

## 4. 엔진 변경

### 4-1. 환산 분기 분리

`general-building-valuation.ts`의 환산 산식에서 사용하는 "취득당시 합계 기준시가" 분모가 다음 분기로 결정:

```ts
const acqTotalStdPrice = input.hasFirstDisclosure
  ? calcConvertedHousingPrice(input)   // §99-164-10 환산주택가격
  : (input.acquisitionLandPricePerSqm * input.landArea + input.acquisitionBuildingStdPrice);

// 이후 기존 §176조의2 환산 산식에 acqTotalStdPrice를 분모로 주입
```

### 4-2. `calcConvertedHousingPrice()` 신규 함수

```ts
function calcConvertedHousingPrice(input: GeneralBuildingInput): number {
  const acqLandStd = input.acquisitionLandPricePerSqm! * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice!;
  const firstDiscLandStd = input.firstDisclosureLandStdPrice!;
  const firstDiscBuildingStd = input.firstDisclosureBuildingStdPrice!;
  const firstDiscPrice = input.firstDisclosurePrice!;

  const acqTotal = acqLandStd + acqBuildingStd;
  const firstDiscTotal = firstDiscLandStd + firstDiscBuildingStd;

  // §99-164-10: 최초공시가 × 취득당시 합계 / 최초공시 합계
  return Math.floor(firstDiscPrice * acqTotal / firstDiscTotal);
}
```

위치: `lib/tax-engine/general-building-valuation.ts` 새 helper section.

### 4-3. 안분 비율

환산주택가격을 토지·건물에 안분 — 자산별 취득당시 기준시가 비율 사용:

```
토지 환산 = 환산주택가격 × 취득당시 토지기준시가 / (토지+건물 취득당시 기준시가)
건물 환산 = 환산주택가격 - 토지 환산
```

이후 기존 §176조의2 환산 산식 (양도가 × 자산별 취득당시기준시가 / 양도시 기준시가)에 위 값 주입.

## 5. UI 변경

### 5-1. 신규 토글 (GeneralBuildingBlock)

기존 §⑦ "주택→상가 용도변경" ToggleCard ON 시 활성화되는 sub-section으로:

- ToggleCard "주택으로 최초공시 후 상가로 용도변경 (환산취득가)" (tone="rose")
- ON 시 펼침:
  - DateInput "최초공시일" (옵션, 안내용)
  - CurrencyInput "최초공시주택가격"
  - CurrencyInput "최초공시 당시 토지기준시가"
  - CurrencyInput "최초공시 당시 건물기준시가"
- 미리보기 카드: 환산주택가격 자동 계산 (useMemo 순수)

### 5-2. validate

- `gbHasFirstDisclosure === true` 일 때 4필드 모두 필수
- 합계 양수 검증
- `useEstimatedAcquisition === true` AND `gbHouseToCommercialConversion === true` 와 함께만 활성

## 6. 14 동기화 지점 (신규 4필드 영향)

| # | 위치 | 변경 |
|---|---|---|
| ① | `lib/stores/calc-wizard-asset.ts` | gb* 4필드 추가 |
| ② | `calc-wizard-asset-factory.ts` `makeDefaultAsset` | `false / "" / "" / ""` 초기값 |
| ③ | 동상 `migrateAsset` | `??=` fallback |
| ④ | `lib/calc/transfer-tax-api-helpers.ts` `buildGeneralBuildingValuation` | 환산 모드에서 조건부 spread |
| ⑤ | `components/calc/transfer/GeneralBuildingBlock.tsx` | §⑦ sub-toggle + 4 CurrencyInput + 미리보기 |
| ⑥ | 사이드바 | 영향 없음 |
| ⑦ | 결과 카드 산식 | 환산주택가격 산식 표시 (선택) |
| ⑧ | `transfer-tax-validate-gb.ts` | 4필드 필수 + 합계 양수 |
| ⑨ | Zod enum | 해당 없음 |
| ⑩ | `transfer-tax-building-schemas.ts` `.superRefine` | `hasFirstDisclosure=true` 시 3필드 필수 |
| ⑪ | acquisitionDate fallback | 변경 없음 |
| ⑫ | 동상 Zod 객체 정의 | 4필드 명시 |
| ⑬ | `transfer-tax-api.ts` body spread | `generalBuildingValuation` 자동 spread |
| ⑭ | `general-building-route-helper.ts` | `firstDisclosurePrice` 등 number 변환 + 환산 분기 호출 |

## 7. Anchor 테스트 계획

`__tests__/tax-engine/transfer-tax/case-35-followup-1-estimated-acquisition.test.ts`

| # | 시나리오 | 검증 |
|---|---|---|
| F1-1 | §99-164-10 환산주택가격 단위 산식 (위 §2 가상 케이스) | 110,000,000 정확 |
| F1-2 | 토지·건물 안분 | 환산주택가격 × 비율 = 자산별 환산기준시가 |
| F1-3 | 전체 흐름 (양도가→환산취득가→LTHD 기산일 이동→과세표준→산출세액) | 단위 케이스 통산 검증 |
| F1-4 | validate 차단 — `hasFirstDisclosure=true` ∧ 4필드 누락 | 오류 코드 |
| F1-5 | `hasFirstDisclosure=false` → 기존 분기 (사례 31 회귀 보호) | 904,725,192 / 27,660,876 등 사례 31 anchor 보존 |

## 8. 800줄 사전 점검

| 파일 | 현재 | 예상 후 | 상태 |
|---|---|---|---|
| `general-building-valuation.ts` | ~720 | +30 (`calcConvertedHousingPrice` + 분기) | ~750 | OK |
| `transfer-tax-validate-gb.ts` | 199 | +15 (필수 4필드) | ~214 | OK |
| `transfer-tax-building-schemas.ts` | 213 | +20 (4필드 + refine) | ~233 | OK |
| `calc-wizard-asset.ts` | 770 | +10 (4필드 주석 간결) | ~780 | 경계, 주석 압축 필요 |
| `calc-wizard-asset-factory.ts` | ~530 | +10 (initial + normalize) | ~540 | OK |
| `GeneralBuildingBlock.tsx` | ~660 | +60 (sub-toggle + 4 input + 미리보기) | ~720 | OK |

## 9. 종료 조건

- [ ] §99-164-10 환산주택가격 산식 anchor 정확
- [ ] 사례 31 anchor 회귀 0 (`hasFirstDisclosure=false` 미사용 경로)
- [ ] 14지점 sync 0 누락 (⑫⑬⑭ grep 자가 점검)
- [ ] `npx tsc --noEmit` 0건
- [ ] 전체 vitest 회귀 0건

## 10. 후속 PR

- 후속 PR #2: 중과 적용 케이스 (사례 35-6 skip 활성화)
- 후속 PR #3: 세대원 주택 수 자동 판정
- 후속 PR #4: `ToggleCardTone` `fuchsia` 추가
- 후속 PR #5: `PrecedentArticleModal` (예규/판례 모달)
