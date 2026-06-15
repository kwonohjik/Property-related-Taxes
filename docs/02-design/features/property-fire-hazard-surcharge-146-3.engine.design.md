# 재산세 화재위험 건축물 소방분 중과 (§146③2호·2의2호) — 엔진 설계

> 계획서: `docs/01-plan/features/property-fire-hazard-surcharge-146-3.plan.md`
> 근거: 지방세법 §146③2호·2의2호 + 시행령 §138①②③ (KoreanLaw MCP 본문 검증)
> 대상 엔진: `lib/tax-engine/property-tax-surtax.ts` (`calcSurtax` 확장)

## 1. 케이스 인벤토리 (전수 enumerate)

| # | objectType | fireHazardClass | publishedPrice | 기대 동작 |
|---|---|---|---|---|
| C-1 | building | `fire_hazard` | 1억 | base 92,300 × 2 = **184,600** |
| C-2 | building | `large_fire_hazard` | 1억 | base 92,300 × 3 = **276,900** |
| C-3 | building | `none` | 1억 | base **92,300** (불변·회귀) |
| C-4 | building | **undefined**(미지정) | 1억 | none 동치 = 92,300 (multiplier 1) |
| C-5 | building | `large_fire_hazard` | 500만(저액) | base 2,000 × 3 = 6,000 (소액도 비례) |
| C-6 | building | `fire_hazard` | 0 | base 0 × 2 = **0** (경계) |
| C-7 | housing | `fire_hazard` | 7억 | **무시** — regionalResourceTax 0 (objectType 게이트), echo 필드 undefined |
| C-8 | land (각 유형) | — | — | early-return 경로, calcSurtax 신규 인자 미전달 → 무영향 |
| C-9 | vessel/aircraft | `fire_hazard` | — | non-land 공통 경로지만 objectType≠building → 무시 |

> base 92,300 = §146③1호 6구간: 64,000,000 초과 → 49,100 + floor((100,000,000−64,000,000)×12/10,000) = 49,100 + 43,200.
> base 2,000 = 600만 이하 구간: floor(5,000,000×4/10,000) = 2,000.

## 2. 입력/결과 타입 (types/property.types.ts)

### 신규 타입 + Input (1필드)
```ts
export type FireHazardClass = "none" | "fire_hazard" | "large_fire_hazard";

export interface PropertyTaxInput {
  // ... 기존 ...
  buildingType?: BuildingTaxType;
  /**
   * 화재위험 건축물 등급 — 소방분 지역자원시설세 중과(지방세법 §146③2호·2의2호).
   * objectType==="building" 전용. 미지정/"none"=중과 없음(×1). 시행령 §138①(×2)·②(×3).
   */
  fireHazardClass?: FireHazardClass;
}
```

### PropertySurtaxDetail echo (2필드 — building + 중과 시에만)
```ts
export interface PropertySurtaxDetail {
  localEducationTax: number;
  urbanAreaTax: number;
  /** 지역자원시설세 — 화재위험 중과 적용 후 최종 (지방세법 §146) */
  regionalResourceTax: number;
  /** 중과 전 §146③1호 base 소방분 (building + multiplier>1 일 때만 노출) */
  regionalResourceTaxBeforeSurcharge?: number;
  /** 화재위험 중과 배율 (2 또는 3 — building + 중과 시에만) */
  fireHazardMultiplier?: number;
}
```
- **echo 채우는 조건(STEP 3 #5 확정)**: `objectType==="building"` AND `multiplier > 1` 일 때만 두 echo 필드 노출. none/비건축물은 undefined → 결과 카드 중과 표기 게이트.

## 3. 법령 상수 (legal-codes/property.ts)

```ts
// PROPERTY (라벨)
FIRE_HAZARD_SURCHARGE: "지방세법 §146③2호·2의2호",   // 신규

// PROPERTY_CONST (수치)
FIRE_HAZARD_MULTIPLIER: 2,        // §146③2호 (시행령 §138①) ×2
LARGE_FIRE_HAZARD_MULTIPLIER: 3,  // §146③2의2호 (시행령 §138②) ×3
```

## 4. 신규 헬퍼 + calcSurtax 확장

```ts
/** 화재위험 등급 → 소방분 중과 배율 (단일 진실 — dual-truth 차단) */
function resolveFireHazardMultiplier(fireHazardClass?: FireHazardClass): number {
  switch (fireHazardClass) {
    case "large_fire_hazard": return PROPERTY_CONST.LARGE_FIRE_HAZARD_MULTIPLIER; // 3
    case "fire_hazard":       return PROPERTY_CONST.FIRE_HAZARD_MULTIPLIER;       // 2
    default:                  return 1;                                           // none/undefined
  }
}

export function calcSurtax(
  determinedTax: number,
  taxBase: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  isUrbanArea: boolean,
  fireHazardClass?: FireHazardClass,   // ← 신규 6번째 (optional)
): { surtax: PropertySurtaxDetail; totalSurtax: number; legalBasis: string[] } {
  // ... localEducationTax, urbanAreaTax 동일 ...

  // 지역자원시설세 = §146③1호 base × 화재위험 중과 배율(§146③2호·2의2호)
  const baseFireTax =
    objectType === "building" ? Math.max(0, calcRegionalResourceTax(publishedPrice)) : 0;
  const fireHazardMultiplier =
    objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1;
  const regionalResourceTax = baseFireTax * fireHazardMultiplier; // 정수 곱 — floor 불요

  const surtax: PropertySurtaxDetail = {
    localEducationTax,
    urbanAreaTax,
    regionalResourceTax,
    // falsy no-op 스프레드 (cond && {}) — §110③ taxBaseCap 스프레드와 동일 패턴
    ...(objectType === "building" && fireHazardMultiplier > 1 && {
      regionalResourceTaxBeforeSurcharge: baseFireTax,
      fireHazardMultiplier,
    }),
  };

  const totalSurtax = localEducationTax + urbanAreaTax + regionalResourceTax;

  const legalBasis: string[] = [PROPERTY.LOCAL_EDUCATION_TAX];
  if (isUrbanArea) legalBasis.push(PROPERTY.URBAN_AREA_TAX);
  if (objectType === "building") legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX);
  if (objectType === "building" && fireHazardMultiplier > 1)
    legalBasis.push(PROPERTY.FIRE_HAZARD_SURCHARGE);

  return { surtax, totalSurtax, legalBasis };
}
```

## 5. orchestrator 통합 (property-tax.ts)

`calcSurtax` 호출 4지점 중 **non-land 공통 경로(line 710)만** 6번째 인자 전달:
```ts
// property-tax.ts:710 (Step 4)
const surtaxResult = calcSurtax(
  determinedTax,
  effectiveTaxBase,
  input.publishedPrice,
  input.objectType,
  input.isUrbanArea ?? false,
  input.fireHazardClass,   // ← 신규 (building 외에는 calcSurtax 내부 게이트로 무영향)
);
```
- **land 3지점(516·583·642)**: `objectType="land"` early-return → 6번째 인자 **미전달**(optional 생략) → multiplier 1·base 0. 무변경.
- vessel/aircraft: 710 경유하나 objectType≠building → 무영향.

## 6. 정합성 anchor (Pre-Do 우선)

| anchor | 입력 | 기대 (원단위 `toBe`) |
|---|---|---|
| FH-1 | building, fire_hazard, 1억 | `regionalResourceTax=184,600` · `regionalResourceTaxBeforeSurcharge=92,300` · `fireHazardMultiplier=2` |
| FH-2 | building, large_fire_hazard, 1억 | `regionalResourceTax=276,900` · `fireHazardMultiplier=3` |
| FH-3 | building, none, 1억 | `regionalResourceTax=92,300` · echo 필드 undefined |
| FH-4 | building, undefined, 1억 | `regionalResourceTax=92,300` (none 동치) |
| FH-5 | housing, fire_hazard, 7억 | `regionalResourceTax=0` · echo undefined (기존 결과 불변) |
| FH-6 | building, fire_hazard, **0** | `regionalResourceTax=0` (base 0 × 2) · echo 노출(multiplier 2) — 경계 |

> calcSurtax 단위 테스트는 `calcSurtax(0, taxBase, 100_000_000, "building", false, "fire_hazard")` 형태로 6번째 인자 직접 검증.

## 7. 미확정 (Do 시 실측)

- **echo 필드 채움 조건**: building + multiplier>1 (확정). none·비건축물 undefined.
- **§138③ 겸용·구분사용**: 행안부령 위임 → v1 단일 등급만(겸용 안분 미지원).
- **legalBasis 중복**: `[...new Set(legalBasis)]`가 orchestrator 최종 단계에서 dedup(기존 동작) — FIRE_HAZARD_SURCHARGE 중복 안전.
- **base 소방분 과세표준은 pre-existing·불변**: 현행 `calcRegionalResourceTax(publishedPrice)`는 건축물 **시가표준액(publishedPrice) 직접** 사용(×공정시장가액비율 아님). 본 기능은 그 base에 multiplier만 곱하며 **base 산정 방식은 변경하지 않음**. base 과세표준 논점(§146④ "제110조 가액 또는 시가표준액")은 별도 사전 결정사항 — 본 계획 범위 외.
