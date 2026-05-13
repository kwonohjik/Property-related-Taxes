# 사례 35 후속-1 — 환산취득가 §99-164-10 분기 엔진 설계

> Plan: `docs/00-pm/case-35-followup-1-estimated-acquisition.plan.md`
> 본 사례 35 메인 PR(`beb9ea5`) 후속-1.

## 1. 산식 (양도소득세 집행기준 99-164-10)

```
환산주택가격 = 최초공시주택가격
             × (취득당시 토지기준시가 + 취득당시 건물기준시가)
             ÷ (최초공시 당시 토지기준시가 + 최초공시 당시 건물기준시가)
```

이 환산주택가격을 토지·건물 자산별 취득당시 기준시가 비율로 안분하여 자산별 환산취득가 §176조의2 산식의 분자로 사용.

## 2. 케이스 인벤토리

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| F1-1 | 환산주택가격 단위 산식 | firstDisc=100M, firstDiscLand=28M, firstDiscBld=12M, acqLand=30M, acqBld=14M | 110,000,000 |
| F1-2 | 자산별 안분 — 토지/건물 환산기준시가 | F1-1 + landArea=85㎡ | 토지 환산 = 110M × 30M/(30M+14M) = 75,000,000 / 건물 환산 = 35,000,000 |
| F1-3 | validate — `hasFirstDisclosure=true` ∧ 4필드 누락 | — | 오류 코드 `general_building.first_disclosure_required` |
| F1-4 | `hasFirstDisclosure=false` 회귀 | 사례 31 입력 | 사례 31 anchor(904,725,192 / 27,660,876 등) 보존 |

## 3. 타입 변경

`GeneralBuildingInput` (`general-building-valuation.ts`) 추가:

```ts
// 사례 35 후속-1: §99-164-10 환산주택가격
hasFirstDisclosure?: boolean;
firstDisclosurePrice?: number;             // 최초공시주택가격 (원)
firstDisclosureLandStdPrice?: number;      // 최초공시 당시 토지기준시가 (원)
firstDisclosureBuildingStdPrice?: number;  // 최초공시 당시 건물기준시가 (원)
```

`AssetCardForAggregate`: 자산 카드는 환산주택가격이 이미 자산별 안분된 값으로 들어오므로 신규 필드 propagate 불요 (안분 직후 일반 환산 산식 진입).

## 4. 핵심 함수

```ts
/**
 * §99-164-10 환산주택가격.
 * 주택으로 최초공시 후 상가로 용도변경한 경우 취득당시 환산기준시가 산정.
 */
export function calcConvertedHousingPrice(input: GeneralBuildingInput): number {
  const acqLandStd = (input.acquisitionLandPricePerSqm ?? 0) * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice ?? 0;
  const firstDiscLandStd = input.firstDisclosureLandStdPrice ?? 0;
  const firstDiscBuildingStd = input.firstDisclosureBuildingStdPrice ?? 0;
  const firstDiscPrice = input.firstDisclosurePrice ?? 0;
  const firstDiscTotal = firstDiscLandStd + firstDiscBuildingStd;
  if (firstDiscTotal <= 0) return 0;
  const acqTotal = acqLandStd + acqBuildingStd;
  return Math.floor(firstDiscPrice * acqTotal / firstDiscTotal);
}
```

## 5. 안분 — `buildGeneralBuildingAssetCards` 환산 분기 수정

기존 환산 분기에서 토지·건물 환산기준시가 산정 직전에:

```ts
if (input.hasFirstDisclosure && input.useEstimatedAcquisition) {
  const converted = calcConvertedHousingPrice(input);
  const acqLandStd = (input.acquisitionLandPricePerSqm ?? 0) * input.landArea;
  const acqBuildingStd = input.acquisitionBuildingStdPrice ?? 0;
  const acqTotal = acqLandStd + acqBuildingStd;
  if (acqTotal > 0) {
    // 환산주택가격을 자산별 취득당시 기준시가 비율로 안분
    const convertedLand = Math.floor(converted * acqLandStd / acqTotal);
    const convertedBuilding = converted - convertedLand;
    // 후속: §176조의2 환산 산식의 자산별 분자로 convertedLand·convertedBuilding 사용
    // (현재 acquisitionLandPricePerSqm·acquisitionBuildingStdPrice 대신 주입)
  }
}
```

본 PR에서는 **acquisition*StdPrice를 직접 override**하는 단순 접근 채택:

```ts
const effectiveInput = input.hasFirstDisclosure
  ? overrideWithConvertedHousingPrice(input)
  : input;
// 이후 기존 환산 산식이 effectiveInput.acquisitionLandPricePerSqm·acquisitionBuildingStdPrice 사용
```

`overrideWithConvertedHousingPrice()`가 자산별 안분된 값을 `acquisitionLandPricePerSqm` (역산: convertedLand / landArea) + `acquisitionBuildingStdPrice` (convertedBuilding) 으로 주입. 이 방식이 기존 §176조의2 산식 그대로 재사용 가능하여 변경 최소화.

## 6. 결과 노출

`GeneralBuildingOutput` 에 선택 필드 추가:

```ts
convertedHousingPriceDetail?: {
  firstDisclosurePrice: number;
  acqTotalStdPrice: number;
  firstDiscTotalStdPrice: number;
  convertedHousingPrice: number;
  convertedLandStdPrice: number;
  convertedBuildingStdPrice: number;
  legalBasis: "양도소득세 집행기준 99-164-10";
};
```

UI 결과 카드에서 산식 표시용 (선택). 본 PR 범위 안.

## 7. 회귀 보장

`hasFirstDisclosure === undefined | false` 시 `overrideWithConvertedHousingPrice` 미진입 → 기존 환산 산식 그대로. 사례 31~33 anchor zero 회귀.

## 8. 800줄

| 파일 | 변경 | 영향 |
|---|---|---|
| `general-building-valuation.ts` | +50줄 (`calcConvertedHousingPrice` + `overrideWithConvertedHousingPrice` + 분기) | 720 → ~770, OK |
