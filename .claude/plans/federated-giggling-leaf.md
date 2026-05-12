# 일반건물(토지+건물 일괄) 비사업용토지 판정 UI·엔진 보완 (보강판)

## Context

### 5가지 문제 요약

| # | 문제 | 현재 상태 |
|---|------|---------|
| 1 | 실거래가 모드 면적 입력 누락 | GeneralBuildingBlock이 `useEstimatedAcquisition=true`일 때만 마운트 |
| 2 | 용도지역별 배율 UI 누락 | `floorAreaMultiplier: 3` 하드코딩. `zoneType`·`isMetropolitan` 없음 |
| 3 | 공장 입지기준 UI 누락 | 별도 PDCA — 현 계획서 범위 외 |
| 4 | NBL 판정 — 단순 배율 비교 | `getHousingMultiplier()` 미호출. 배율 잘못 고정 |
| 5 | **초과분 중과세 안분 미구현 (버그)** | 초과 시 토지 전체에 +10%p → 소득세법 §104의3 위반. 초과분 비율만 중과해야 함 |

### 추가 반영 사항 (검토 의견)

| # | 항목 | 결정 |
|---|------|------|
| A | `getHousingMultiplier` 리네이밍 | `getLandFootprintMultiplier(zoneType, isMetro, kind)` 로 공용화 — §168의9(주택)·§168의12(건축물) 분기 대비 |
| B | Phase 3 안분 중과 | **Phase 2와 묶어 즉시 구현** — 세액 과산출 버그이므로 미룰 수 없음 |
| C | 용도지역 미입력 fallback 3배 | **Hard validation으로 변경** — 3배 기본값은 납세자 최불리. 미입력 시 계산 차단 |
| D | 기간기준(§168의6) | `judgeNonBusinessLand()`가 이미 처리. GB도 동일 엔진 연동으로 자동 포함 |
| E | 무허가건축물 예외 | `gbIsUnregistered: boolean` 필드 추가 — true 시 배율 무관 전체 NBL |
| F | `gbIsMetropolitan` 자동 판정 | 소재지 주소로 수도권 자동 감지 가능하면 연동 (Phase 1.5) |

---

## 작업 단계 (Phase 1·2·3 묶음 진행)

### Phase 1 — 폼 타입·UI 입력 보완

#### 1-A 폼 타입·initial·migration 갱신

**파일**: `lib/stores/calc-wizard-asset.ts` (gb* 필드 블록)

신규 필드:
```typescript
/** 용도지역 (§168의12 배율 결정). ZoneType 값 사용. 미입력 시 계산 차단. */
gbZoneType: string;
/** 수도권 소재 여부 */
gbIsMetropolitan: boolean;
/** 무허가건축물 여부. true 시 배율 무관 전체 비사업용 (§168의11①1호 단서) */
gbIsUnregistered: boolean;
```

**파일**: `lib/stores/calc-wizard-asset-factory.ts`
- `makeDefaultAsset`: `gbZoneType: "", gbIsMetropolitan: false, gbIsUnregistered: false`
- `migrateAsset`: undefined → 기본값

#### 1-B GeneralBuildingBlock 구조 재편

**파일**: `components/calc/transfer/GeneralBuildingBlock.tsx`

마운트 조건 분리 후 섹션별 조건부 렌더:
- **① 면적·규모 (sky)**: **항상 표시** — 토지면적·건물 연면적·건물 수평투영면적
- **② 양도시 기준시가 (emerald)**: `useEstimatedAcquisition === true` 시만
- **③ 취득시 기준시가 (amber)**: `useEstimatedAcquisition === true` 시만
- **④ 비사업용토지 판정 (rose) — 신규**: **항상 표시**

④ 섹션 구성:
```tsx
{/* ④ 비사업용토지 판정 (rose) */}
<div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
  <div className="flex items-center gap-2">
    <span className="…bg-rose-200 text-rose-800">④</span>
    <p className="…text-rose-700">비사업용토지 판정</p>
    <span className="text-[10px] text-rose-500">(소득세법 §104의3 · 시행령 §168의12)</span>
  </div>

  {/* 용도지역 — 필수 (미입력 시 계산 차단) */}
  <FieldCard
    label="용도지역"
    hint="국토계획법상 용도지역. 미입력 시 계산이 진행되지 않습니다."
  >
    <RadioCardGroup layout="inline" value={asset.gbZoneType}
      onChange={(v) => onChange({ gbZoneType: v })}
      options={GB_ZONE_OPTIONS} />
  </FieldCard>

  {/* 수도권 소재 — 자동감지 또는 토글 */}
  <ToggleCard tone="rose" variant="chip"
    title="수도권 소재 (서울·경기·인천)"
    checked={asset.gbIsMetropolitan}
    onCheckedChange={(v) => onChange({ gbIsMetropolitan: v })} />

  {/* 무허가건축물 여부 */}
  <ToggleCard tone="rose" variant="chip"
    title="무허가(미등재) 건축물"
    description="건축물대장 미등재 시 배율 무관 전체 비사업용 (시행령 §168의11①1호)"
    checked={asset.gbIsUnregistered}
    onCheckedChange={(v) => onChange({ gbIsUnregistered: v })} />

  {/* 자동 계산 결과 박스 — gbZoneType 입력 시 표시 */}
  {asset.gbZoneType && (
    <div className="rounded bg-rose-100/60 border border-rose-200 px-3 py-2 text-xs text-rose-800">
      <p>적용 배율: <span className="font-semibold">{multiplierLabel}</span></p>
      <p>인정 한도: {footprint}㎡ × {multiplier}배 = {allowedArea}㎡</p>
    </div>
  )}
</div>
```

**GB_ZONE_OPTIONS** (소득세법 시행령 §168의12 배율표 기준):
```typescript
const GB_ZONE_OPTIONS = [
  { value: "exclusive_residential", label: "전용주거" },
  { value: "general_residential",   label: "일반주거" },
  { value: "semi_residential",      label: "준주거" },
  { value: "commercial",            label: "상업지역" },
  { value: "industrial",            label: "공업지역" },
  { value: "green",                 label: "녹지지역" },
  { value: "planned_management",    label: "계획관리" },
  { value: "non_urban",             label: "도시지역 외" },
];
```

#### 1-C CompanionAssetCard 마운트 조건 변경

**파일**: `components/calc/transfer/CompanionAssetCard.tsx:519`

현재: `asset.assetKind === "general_building" && asset.useEstimatedAcquisition`
변경: `asset.assetKind === "general_building"`

#### 1-D Validate 갱신

**파일**: `lib/calc/transfer-tax-validate.ts` — GB 검증 블록

```typescript
if (asset.assetKind === "general_building") {
  // 면적 — 모드 무관 항상 필수 (NBL 판정용)
  if (!parseDecimal(asset.gbLandArea))
    return `${label}: 토지면적을 입력하세요.`;
  if (!parseDecimal(asset.gbBuildingFootprintArea))
    return `${label}: 건물 수평투영면적을 입력하세요.`;
  // 용도지역 — 필수 (fallback 없음, 미입력 시 차단)
  if (!asset.gbZoneType)
    return `${label}: 용도지역을 선택하세요 (비사업용토지 배율 결정에 필수입니다).`;

  // 환산취득가 모드 추가 검증 (기존 유지)
  if (asset.useEstimatedAcquisition) {
    if (!parseDecimal(asset.gbBuildingArea))
      return `${label}: 건물 연면적을 입력하세요.`;
    // 기준시가 4개 검증 (기존 유지) ...
  }
}
```

---

### Phase 2 — 배율 함수 공용화 + 엔진 연동

#### 2-A `getLandFootprintMultiplier()` 함수 신설

**파일**: `lib/tax-engine/non-business-land/urban-area.ts`

기존 `getHousingMultiplier()` 유지(하위 호환) + 공용 함수 추가:
```typescript
/**
 * §168의9(주택부속토지) · §168의12(건축물부속토지) 공용 배율 함수.
 * 현재 배율표는 동일하나 조문이 다르므로 kind 인자로 분기 준비.
 * 추후 시행령 개정 시 kind별로 배율표 분리 가능.
 */
export function getLandFootprintMultiplier(
  zoneType: ZoneType,
  isMetropolitan: boolean,
  kind: "housing" | "general_building" = "housing",
): { multiplier: number; detail: string } {
  // 현재는 kind 무관 동일 배율표 적용 (§168의9 = §168의12)
  return getHousingMultiplier(zoneType, isMetropolitan);
}
```

#### 2-B `GeneralBuildingInput` 타입 갱신

**파일**: `lib/tax-engine/general-building-valuation.ts`

```typescript
export type GeneralBuildingInput = {
  // ...기존 필드...
  zoneType?: string;          // 용도지역 (미입력 시 엔진이 예외)
  isMetropolitan?: boolean;   // 수도권 여부
  isUnregistered?: boolean;   // 무허가건축물 여부
};
```

#### 2-C 비사업용토지 판정 로직 교체

**파일**: `lib/tax-engine/general-building-valuation.ts:295-308`

현재:
```typescript
const multiplier = input.floorAreaMultiplier ?? 3;
const allowedLandArea = input.buildingFootprintArea * multiplier;
const isWithinNblRatio = input.landArea <= allowedLandArea;
```

변경:
```typescript
import { getLandFootprintMultiplier } from "./non-business-land/urban-area";
import type { ZoneType } from "./non-business-land/types";

// 무허가건축물: 배율 무관 전체 비사업용 (§168의11①1호 단서)
if (input.isUnregistered) {
  // ... isNonBusinessLand=true, nonBusinessRatio=1.0
}

// 용도지역 미입력 시 엔진 예외 (validate에서 이미 차단되어야 하지만 방어)
if (!input.zoneType) throw new Error("generalBuilding: zoneType 필수");

const { multiplier, detail: multiplierDetail } = getLandFootprintMultiplier(
  input.zoneType as ZoneType,
  input.isMetropolitan ?? false,
  "general_building",
);

const allowedLandArea = input.buildingFootprintArea * multiplier;
const isWithinNblRatio = input.landArea <= allowedLandArea;

// 초과분 비율 계산 (Phase 3 토지 분할에 사용)
const nonBusinessArea = Math.max(0, input.landArea - allowedLandArea);
const nonBusinessRatio = input.landArea > 0
  ? Math.round((nonBusinessArea / input.landArea) * 10000) / 10000
  : 0;
```

#### 2-D `GeneralBuildingOutput` 타입 갱신

```typescript
export type GeneralBuildingOutput = {
  // ...기존 필드...
  appliedMultiplier: number;    // 적용 배율 (3/5/10)
  multiplierDetail: string;     // "수도권 주·상·공 3배"
  nonBusinessArea: number;      // 초과 면적 (㎡)
  nonBusinessRatio: number;     // 초과 비율 (0~1)
};
```

---

### Phase 3 — 초과분 비례 중과세 안분 (Phase 2와 묶어 즉시 구현)

#### 3-A 토지 카드 분할 (핵심 — §104의3 정확 구현)

**파일**: `lib/tax-engine/general-building-valuation.ts` `buildGeneralBuildingAssetCards()`

초과분 있을 때(nonBusinessRatio > 0) 토지 카드를 **2장으로 분할**:

```typescript
const assetCards: AssetCardForAggregate[] = [];

if (nonBusinessRatio > 0 && !isWithinNblRatio) {
  // 토지 1: 사업용 (허용면적 비율)
  const businessRatio = 1 - nonBusinessRatio;
  assetCards.push({
    propertyId: "land_business",
    propertyLabel: "토지-사업용(1001)",
    propertyType: "land",
    transferPrice: Math.floor(allocation.land * businessRatio),
    acquisitionPrice: Math.floor(acquisition.land * businessRatio),
    expenses: Math.floor(estimatedDeduction.land * businessRatio),
    isNonBusinessLand: false,
    // ...
  });
  // 토지 2: 비사업용 (초과분)
  const businessCardTransferPrice = Math.floor(allocation.land * businessRatio);
  assetCards.push({
    propertyId: "land_nbl",
    propertyLabel: "토지-비사업용초과분(1002)",
    propertyType: "land",
    transferPrice: allocation.land - businessCardTransferPrice,  // 잔여 (원단위 보정)
    acquisitionPrice: Math.floor(acquisition.land * nonBusinessRatio),
    expenses: Math.floor(estimatedDeduction.land * nonBusinessRatio),
    isNonBusinessLand: true,
    // ...
  });
} else {
  // 전체 사업용 (1장)
  assetCards.push({ propertyId: "land", isNonBusinessLand: false, ... });
}
// 건물 카드 1장
assetCards.push({ propertyId: "building", isNonBusinessLand: false, ... });
```

#### 3-B apportionment 합성 갱신

**파일**: `app/api/calc/transfer/general-building-route-helper.ts`

propertyId "land_business"/"land_nbl"/"building" 3장 대응으로 apportionment 배열 갱신.

#### 3-C 결과 카드 갱신

**파일**: `components/calc/results/GeneralBuildingValuationDetailCard.tsx`

```
비사업용토지 판정 (§168의12)
  용도지역: 상업지역 · 수도권 → 배율 3배
  인정 한도: 90.48㎡ × 3 = 271.44㎡
  [사업용: 전체 (허용 내)]
  또는
  [초과분: 130㎡ / 32.5% → 토지 양도차익의 32.5%에 +10%p 중과]
```

#### 3-D FilingFormTableAggregateHelpers fallback 갱신

**파일**: `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts`

`findAssetByPropertyId` — propertyId가 `"land_business"` 또는 `"land_nbl"`일 때도 `assets[0]` fallback:
```typescript
if (
  formData.assets[0]?.assetKind === "general_building" &&
  (pid === "land" || pid === "land_business" || pid === "land_nbl" || pid === "building")
) {
  return formData.assets[0];
}
```

---

### Phase 1.5 — `gbIsMetropolitan` 자동 감지 (선택)

소재지 주소(`asset.addressJibun`)에 서울·경기·인천 키워드가 있으면 `gbIsMetropolitan=true` 자동 설정.
`onChange({ gbZoneType: v })` 와 동일한 시점에 연동.
> 자동 감지 실패 시 사용자 수동 토글로 fallback.

---

## API·Zod 동기화

**파일**: `lib/api/transfer-tax-schema.ts` `generalBuildingValuationSchema`
```typescript
zoneType: z.string().optional(),         // 신규 (validate에서 필수 보장)
isMetropolitan: z.boolean().optional(),  // 신규
isUnregistered: z.boolean().optional(),  // 신규
```

**파일**: `lib/calc/transfer-tax-api-helpers.ts` `buildGeneralBuildingValuation()`
```typescript
return {
  // ...기존...
  zoneType: asset.gbZoneType || undefined,
  isMetropolitan: asset.gbIsMetropolitan,
  isUnregistered: asset.gbIsUnregistered,
};
```

---

## 변경 파일 목록

| 파일 | 변경 |
|---|---|
| `lib/stores/calc-wizard-asset.ts` | `gbZoneType`, `gbIsMetropolitan`, `gbIsUnregistered` 추가 |
| `lib/stores/calc-wizard-asset-factory.ts` | initial·migration |
| `lib/tax-engine/non-business-land/urban-area.ts` | `getLandFootprintMultiplier()` 신설 |
| `lib/tax-engine/general-building-valuation.ts` | 타입 갱신, 배율 함수 호출, 초과분 계산, 토지 2분할 |
| `lib/api/transfer-tax-schema.ts` | Zod 필드 3개 추가 |
| `lib/calc/transfer-tax-api-helpers.ts` | 신규 필드 포함 |
| `lib/calc/transfer-tax-validate.ts` | 용도지역 필수 검증, 실거래가 모드 면적 필수 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | ④ NBL 판정 섹션, 조건부 렌더 |
| `components/calc/transfer/CompanionAssetCard.tsx` | 마운트 조건 변경 |
| `components/calc/results/GeneralBuildingValuationDetailCard.tsx` | 배율 상세, 초과분 안분 결과 |
| `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts` | land_business/land_nbl fallback 추가 |
| `app/api/calc/transfer/general-building-route-helper.ts` | 3장 카드 대응 |

---

## 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|---------|---------|
| A | 환산취득가 + 수도권 상업(3배) + 토지 85㎡ + 수평투영 90.48㎡ | 허용 271.44㎡ > 85 → 전체 사업용, 중과 미발동 |
| B | 환산취득가 + 도시 외(10배) + 토지 85㎡ + 수평투영 10㎡ | 허용 100㎡ > 85 → 사업용 |
| C | 실거래가 모드 | GeneralBuildingBlock 마운트, ①④ 표시, ②③ 숨김 |
| D | 용도지역 미입력 | "용도지역을 선택하세요" 오류로 계산 차단 |
| **E** | **초과분 안분 — 토지 400㎡, 투영 90㎡, 수도권 상업** | **허용 270㎡, 초과 130㎡(32.5%) → 토지 카드 2장 분할, 초과분만 +10%p** |
| **F** | **무허가건축물 gbIsUnregistered=true** | **배율 무관 전체 NBL, isNonBusinessLand=true** |
| G | 수도권 밖 녹지(5배) + 토지 100㎡ + 투영 30㎡ | 허용 150 > 100 → 사업용 |

---

## 14개 동기화 지점 매트릭스

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 타입 | `gbZoneType`, `gbIsMetropolitan`, `gbIsUnregistered` |
| ② | initial | factory 기본값 |
| ③ | migration | undefined → 기본값 |
| ④ | API 변환 | 신규 필드 포함 |
| ⑤ | UI 입력 위젯 | ④ NBL 판정 섹션, 마운트 조건 변경 |
| ⑥ | 사이드바 합계 | 영향 없음 |
| ⑦ | 결과 카드 | 배율 상세·초과분 안분 표시, land_business/land_nbl 열 |
| ⑧ | Validation | 용도지역 필수, 면적 모드 무관 필수 |
| ⑨⑩⑫ | Zod | 3개 선택 필드 추가 |
| ⑪⑬⑭ | Route handler | land_business/land_nbl 카드 pass-through 자동 처리 |

---

## 작업 순서

1. **폼 타입·initial·migration** (`calc-wizard-asset.ts` + `factory.ts`)
2. **`getLandFootprintMultiplier()` 신설** (`urban-area.ts`)
3. **엔진 타입·계산·토지 분할** (`general-building-valuation.ts`)
4. **API 변환 + Zod 스키마** (`api-helpers.ts` + `schema.ts`)
5. **Validate 갱신** (용도지역 필수, 실거래가 면적 필수)
6. **UI** (`GeneralBuildingBlock.tsx` ④ 섹션, `CompanionAssetCard.tsx` 마운트 조건)
7. **결과 카드·신고서 표 갱신** (`DetailCard.tsx` + `FilingFormTableAggregateHelpers.ts`)
8. **route helper 갱신** (3장 카드 대응)
9. **Anchor 테스트 갱신 + 시나리오 E·F 신규 테스트**
