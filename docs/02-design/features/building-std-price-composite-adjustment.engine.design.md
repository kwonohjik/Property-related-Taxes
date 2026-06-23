# 복합구조 조정률 건물특성 자동계산 — Engine Design

> Plan: `docs/00-pm/building-std-price-composite-adjustment.plan.md`
> 관련: `building-standard-price.engine.design.md` · `building-std-price-nts-report.engine.design.md`

## 목표

복합구조(상증) 각 부분의 조정률을 **건물 특성(I~VII)으로 자동 산정**한다.
기존 단일구조의 `calcSpecialAdjustmentRate`/`selectSpecialAdjustment`를 **단일 출처로 재사용**하여
부분별 배율 + `adjustmentItems`(NTS 계산서 번호 echo)를 산출한다.

비목표: 양도 복합(조정률 미적용, 차단 유지) · 공용 부속 `sharedAdjustment`(기존 수동 번호/% 유지).

## 1. 타입 변경 (`types/building-standard-price.types.ts`)

### 1.1 `BuildingCompositePart`에 부분별 특성 추가

```ts
export interface BuildingCompositePart {
  // ... 기존 필드 (label, structureKey, usageNo, floorArea, acqUsageNo,
  //      adjustmentRate, adjustmentNos, sharedAdjustmentRate, sharedAdjustmentNos)

  /**
   * 부분별 개별건물 특성(상증 전용) — IV 상가층·부속, V 개축, VI 무벽, VII 구조진단·화재.
   * 건물 전체 특성(I 지붕·II·III)은 input.specialFeatures(공유). 엔진이 부분마다 merge.
   * adjustmentRate/adjustmentNos(수동)가 있으면 그 부분은 수동 우선 — specialFeatures 무시.
   */
  specialFeatures?: SpecialAdjustmentFeatures;
}
```

- 새 별도 타입 신설 안 함 — `SpecialAdjustmentFeatures` 재사용. 건물전체/부분 분담은 **필드 부분집합**으로 구현.
- `input.specialFeatures`(이미 존재) = **복합 모드에서는 건물 전체 특성**(I·II·III + isResidentialUse/isApartmentUse). 단일 모드 의미(전체 7구분)와 모드 배타적이므로 충돌 없음.

### 1.2 키셋 상수 — 오염 방지(Critical, 정정 B) 🔴

단일 모드에서 채운 부분키(IV~VII)가 `input.specialFeatures`에 잔존하면 복합에서 전 부분에 잘못 곱해진다.
**경계(`toEngineInput`)에서 키셋으로 필터**해 disjoint를 보증한다(엔진은 merge 시 오염 없음 가정 가능).

```ts
// data/.../special-adjustment-rate.ts (또는 types 인접)
export const BUILDING_WIDE_FEATURE_KEYS = [
  "roofMaterial", "maxFloors", "intelligentBuildingGrade", "houseTypeTier",
] as const; // I·II 최고층수·II 지능형·III
export const PART_FEATURE_KEYS = [
  "commercialFloor", "ancillaryParking", "remodelCount",
  "wallessRatio", "structuralSafety", "normalUseRatio",
] as const; // IV·V·VI·VII (II 연면적은 자동·필드 없음)
export function pickFeatures(f: SpecialAdjustmentFeatures | null | undefined,
  keys: readonly (keyof SpecialAdjustmentFeatures)[]): SpecialAdjustmentFeatures | undefined { /* keys만 추림, 빈 객체면 undefined */ }
```

- `toEngineInput`(복합): `base.specialFeatures = pickFeatures(f.adjustmentFeatures, BUILDING_WIDE_FEATURE_KEYS)`.
- `toCompositePart`(features): `part.specialFeatures = pickFeatures(p.specialFeatures, PART_FEATURE_KEYS)`.
- 모달 onApply도 scope 키셋으로 필터(2차 방어, UI 설계 §2).

## 2. 헬퍼 변경 (`building-standard-price-helpers.ts`)

### 2.1 `CompositeYearOptions` 확장

```ts
export interface CompositeYearOptions {
  usageNoSelector: (p: BuildingCompositePart) => number;
  adjustmentEnabled: boolean;
  ancillary: AncillaryFacility[];
  remodel?: RemodelInfo;
  errorPrefix?: string;

  /** 건물 전체 특성(상증 복합 전용) — I 지붕·II·III. 부분 specialFeatures와 merge. */
  buildingWideFeatures?: SpecialAdjustmentFeatures;
  /** II 최고층수 통나무조 제외·주거용 판정 컨텍스트 */
  adjustmentCtx?: { isResidential: boolean; isApartment: boolean };
}
```

### 2.2 `calcCompositeForYear` — 부분 주용도 조정률 산정 분기 교체

현행 L303-305:
```ts
const mainAdj = opts.adjustmentEnabled
  ? adjustmentFromNos(p.adjustmentNos, p.adjustmentRate, label)
  : { adjRate: 1.0, items: undefined };
```

신규:
```ts
const mainAdj = opts.adjustmentEnabled
  ? resolvePartAdjustment(p, opts, year, point.structureKey, buildingTotalArea, label)
  : { adjRate: 1.0, items: undefined };
```

신규 헬퍼(파일 내부):
```ts
/** 부분 조정률 — 수동(번호/%) 우선, 없으면 건물전체+부분 특성 자동 산정(단일 출처 재사용). */
function resolvePartAdjustment(
  p: BuildingCompositePart,
  opts: CompositeYearOptions,
  year: number,
  structureKey: string,
  buildingTotalArea: number,
  label: string,
): { adjRate: number; items?: { nos: number[]; rate: number }[] } {
  // 1) 수동 우선(하위호환)
  if (p.adjustmentNos?.length || p.adjustmentRate != null) {
    return adjustmentFromNos(p.adjustmentNos, p.adjustmentRate, label);
  }
  // 2) 특성 자동 — 건물전체 + 부분 merge
  const merged = { ...(opts.buildingWideFeatures ?? {}), ...(p.specialFeatures ?? {}) };
  if (Object.keys(merged).length === 0) return { adjRate: 1.0, items: undefined };
  const structureIndex = resolveStructureIndex(year, structureKey) ?? 0;
  const ctx = {
    isResidential: !!opts.adjustmentCtx?.isResidential,
    isApartment: !!opts.adjustmentCtx?.isApartment,
    structureKey, // II 통나무조 제외·I 지붕 게이트(부분 구조지수<100일 때만)
  };
  // rate·items 모두 동일 selection 공유(L513) → 드리프트 0. rate는 calcSpecialAdjustmentRate 직접 호출(정정 M).
  const rate = calcSpecialAdjustmentRate(merged, structureIndex, buildingTotalArea, ctx);
  const sel = selectSpecialAdjustment(merged, structureIndex, buildingTotalArea, ctx);
  return {
    adjRate: rate,
    items: sel.length > 0 ? sel.map((s) => ({ nos: s.nos, rate: s.rate })) : undefined,
  };
}
```

- **`buildingTotalArea`**(II 연면적용) = `totalMainArea`(부분 주용도 면적 합) + 부속 종류별 면적 합.
  적용요령(4) "지하·옥탑 포함 전체면적". `calcCompositeForYear` 진입부에서 1회 계산:
  ```ts
  const ancillaryTotal = opts.ancillary.reduce((s, a) => s + (a.areaM2 > 0 ? a.areaM2 : 0), 0);
  const buildingTotalArea = totalMainArea + ancillaryTotal;
  ```
  🔴 Pre-Do 검증: II 연면적 분모에 부속 포함 여부 고시 재확인(미확인 시 주석에 "확인 필요").
- `selectSpecialAdjustment`/`resolveStructureIndex`는 이미 import됨(단일 경로에서 사용 중).
- **rate = `calcSpecialAdjustmentRate` 직접 호출**(L602-614, 채택 — 정정 M). items만 `selectSpecialAdjustment`로 산출.
  두 함수가 이미 동일 selection 공유(L513) → 산식·번호 항상 일치(드리프트 0). 산식 재구현 금지.
- **수동 우선 부분**(정정 D): 부분에 `adjustmentNos`/`adjustmentRate`가 있으면 그 부분은 건물전체 특성도 **미적용**(완전 수동 override) — 단일구조 manual 의미와 일관. 부분 간 비일관은 사용자의 명시 선택. UI에 안내(UI §3.2).

### 2.3 공용 부속(sharedAdjustment) — 변경 없음

`sharedAdjustmentNos`/`sharedAdjustmentRate`(L314-316)는 기존 수동 경로 유지. 특성 자동계산 비대상(MVP 범위 외, 향후).

## 3. Orchestrator 변경 (`building-standard-price.ts`)

### 3.1 `calcCompositeValuation`(상증) — 건물전체 특성 전달

```ts
const { breakdowns, total, apportionment } = calcCompositeForYear(
  resolveCompositeParts(input), year, landPrice, input.builtYear,
  {
    usageNoSelector: (p) => p.usageNo,
    adjustmentEnabled: true,
    ancillary: normalizeAncillary(input.ancillaryFacilities, input.sharedFacilityArea),
    remodel: { remodelYear: input.remodelYear, isInheritanceGift: true },
    // 신규 ↓ (input.specialFeatures는 toEngineInput에서 BUILDING_WIDE_FEATURE_KEYS로 이미 필터됨 — §1.2)
    buildingWideFeatures: input.manualAdjustmentRate == null ? input.specialFeatures : undefined,
    adjustmentCtx: { isResidential: !!input.isResidentialUse, isApartment: !!input.isApartmentUse },
  },
);
```

- `manualAdjustmentRate`가 있으면 건물 전체 특성 무시(단일 모드 manual과 일관). 복합에서 manual은 부분별이므로 input.manualAdjustmentRate는 통상 미사용 — 방어적으로만.

### 3.2 `calcTransferComposite`(양도) — 건물특성 입력 차단 추가

현행 L140-149 조정률 차단 루프에 부분 `specialFeatures`와 input.specialFeatures 차단 추가:
```ts
if (input.specialFeatures) {
  throw new BuildingStdPriceError("양도 복합: 건물특성 조정률은 상속·증여에만 적용됩니다.");
}
for (const p of parts) {
  if (p.adjustmentRate != null || p.adjustmentNos?.length || p.specialFeatures /* 신규 */
      || p.sharedAdjustmentRate != null || p.sharedAdjustmentNos?.length) {
    throw new BuildingStdPriceError("양도 복합: 조정률은 상속·증여에만 적용됩니다.");
  }
}
```

## 4. 데이터 흐름 (상증 복합, 자동계산)

```
입력(건물전체): input.specialFeatures = { roofMaterial?, maxFloors?, intelligentBuildingGrade?, houseTypeTier? }
              + isResidentialUse/isApartmentUse
입력(부분 i):   parts[i].specialFeatures = { commercialFloor?, ancillaryParking?, remodelCount?, wallessRatio?,
                                            structuralSafety?, normalUseRatio? }
        │
calcCompositeValuation → calcCompositeForYear(buildingWideFeatures, adjustmentCtx)
        │  buildingTotalArea = Σ parts.floorArea + Σ ancillary
        ▼ per part:
resolvePartAdjustment → merged = {건물전체 ∪ 부분} → calcSpecialAdjustmentRate(merged, structIdx(part), totalArea, ctx)
        │                                          + selectSpecialAdjustment → items
        ▼
calcPointBreakdown(adjRate) → breakdown{ standardPrice, adjustmentItems: items }
        ▼
compositeTotal = Σ standardPrice  /  NTS 계산서 Ⅲ 조정률(번호) = adjustmentItems echo
```

## 5. Pre-Do Anchor (필수 — 우선 작성·실패 확보)

`__tests__/tax-engine/building-standard-price/composite-adjustment.test.ts` (신규)

상증 평가 2023, 복합 2부분, 건물전체 최고층수 12층:
- 건물전체: `specialFeatures = { maxFloors: 12 }`, isResidential=false.
- Part1: 1층 점포, `structureKey` 철근콘크리트(구조지수 100), 700㎡, `specialFeatures = { commercialFloor: 20 }`.
- Part2: 2층 사무실, 철근콘크리트, 700㎡, specialFeatures 없음.
- buildingTotalArea = 1400㎡(부속 0) → II 연면적 no10(100, 중립). 최고층수 12 → no6(110). II max = 110(no6).

기대(조정률 배율·items):
| 부분 | merged II | 부분 특성 | 배율 | items(nos) |
|---|---|---|---|---|
| Part1 | 110(no6) | IV 상가1층 120(no20) | **1.32** | [6, 20] |
| Part2 | 110(no6) | 없음 | **1.10** | [6] |

- `breakdowns[main1].adjustmentItems` = `[{nos:[6],rate:110},{nos:[20],rate:120}]`
- `breakdowns[main2].adjustmentItems` = `[{nos:[6],rate:110}]`
- 표준가격은 부분별 `floor(perM2 × residual × adjRate) × 면적` 산식 검산(실측 후 원단위 toBe 동결).

추가 anchor:
- **양도 차단**: 양도 복합 + `parts[i].specialFeatures` → `BuildingStdPriceError` throw.
- **수동 우선**: 부분에 adjustmentNos=[24] + specialFeatures={commercialFloor:20} 동시 → 수동(24, 60) 적용, 특성 무시.

## 6. 회귀 / 비변경 보장

- 기존 복합 수동 번호/% 경로: `resolvePartAdjustment`의 (1) 분기로 동일 동작(`adjustmentFromNos` 그대로).
- 단일구조 경로(L260-291): 변경 없음.
- 양도 복합: 차단 강화(기존 테스트 영향 없음 — 기존 양도 복합 테스트는 조정률 미입력).
- `nts-report-cases.test.ts`: 기존 케이스(adjustmentRate/Nos 직접 입력)는 (1) 분기 유지 → 무변경.

## 7. 검증 게이트

- [ ] Pre-Do anchor 우선 실행 → 실패 확보 → 디자인 환류
- [ ] 🔴 KoreanLaw/고시로 적용단위 분류(특히 I·V·VII)·II 연면적 부속 포함 재확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/building-standard-price/`
- [ ] 양도 차단·수동 우선·자동산정 anchor 전부 green
