# 재산세 주택 건축물분 소방분 (§146④ 단서) — 엔진 설계

> 계획서: `docs/01-plan/features/property-housing-building-fire-service-146-4.plan.md`
> 근거: 지방세법 §146④ 단서 + §104 3호 + §110①2호 (KoreanLaw MCP 본문 검증)
> 대상 엔진: `lib/tax-engine/property-tax-surtax.ts` (`calcSurtax` 주택 분기) + orchestrator(`property-tax.ts:710`)

## 1. 케이스 인벤토리 (전수 enumerate)

| # | objectType | housingBuildingValue | isOneHousehold/연도 | 기대 동작 |
|---|---|---|---|---|
| C-1 | housing | 1.5억 | 일반(60%) | 과세표준 9천만 → base 80,300 |
| C-2 | housing | **undefined**(미입력) | — | 소방분 **0** (기존 회귀) |
| C-3 | housing | 1억 | 1세대1주택 2026, publishedPrice 7억(45%) | 과세표준 4,500만 → base 30,100 |
| C-4 | housing | 5천만(저액) | 일반 | 과세표준 3천만 → base = floor(30,000,000×?)... 2,600만~3,900만 구간: 13,700 + (30,000,000−26,000,000)×8/10,000 = 16,900 |
| C-5 | building | 1억 + housingBuildingValue 지정 | — | **housingBuildingValue 무시** — 기존 publishedPrice 경로(92,300) 불변(회귀) |
| C-6 | land (각 유형) | — | — | early-return·무영향 |
| C-7 | housing | 0 | 일반 | 과세표준 0 → base 0 (경계) |
| C-8 | housing | 1.5억 + fireHazardClass 지정 | 일반 | **화재위험 중과 미적용**(multiplier 1) — base만 |

> C-1 base: 과세표준 90,000,000 → 6,400만 초과: 49,100 + (90,000,000−64,000,000)×12/10,000 = 49,100 + 31,200 = 80,300.
> C-3 base: 과세표준 45,000,000 → 3,900만~6,400만: 24,100 + (45,000,000−39,000,000)×10/10,000 = 24,100 + 6,000 = 30,100.

## 2. 입력/결과 타입 (types/property.types.ts)

### Input (1필드)
```ts
export interface PropertyTaxInput {
  // ... 기존 ...
  /**
   * 주택 건축물 부분 시가표준액 (원) — 주택 소방분 지역자원시설세 과세표준(§146④ 단서, §4② 지자체장 산정).
   * objectType==="housing" 전용·선택. 미입력 시 주택 소방분 미산출. 주택공시가격(publishedPrice=토지+건물)과 별개.
   */
  housingBuildingValue?: number;
}
```

### PropertySurtaxDetail echo (1필드 — housing 소방분 산출 시에만)
```ts
export interface PropertySurtaxDetail {
  localEducationTax: number;
  urbanAreaTax: number;
  regionalResourceTax: number;
  regionalResourceTaxBeforeSurcharge?: number; // 기존(화재위험 중과)
  fireHazardMultiplier?: number;               // 기존
  /** 주택 건물분 소방분 과세표준 = 건물분가액 × FMR (§146④ 단서, housing 산출 시에만) */
  housingFireServiceTaxBase?: number;
}
```
- 결과 카드 "건물분 × FMR = 과세표준" 표기는 `housingFireServiceTaxBase` + `result.fairMarketRatio`(이미 존재)로 충분.

## 3. 법령 상수 (legal-codes/property.ts)
- building 소방분: 기존 `PROPERTY.REGIONAL_RESOURCE_TAX = "지방세법 §146"` 재사용.
- **주택 소방분: 신규 `PROPERTY.REGIONAL_RESOURCE_TAX_HOUSING = "지방세법 §146④ 단서"`** (legalBasis·결과 note 정확화 — 주택은 §146④ 단서 근거).
- 신규 수치 상수 없음(FMR·brackets 모두 기존 재사용).

## 4. calcSurtax 확장 (7번째 param)

```ts
export function calcSurtax(
  determinedTax: number,
  taxBase: number,
  publishedPrice: number,
  objectType: PropertyTaxInput["objectType"],
  isUrbanArea: boolean,
  fireHazardClass?: FireHazardClass,
  housingFireServiceTaxBase?: number,   // ← 신규 7번째 (주택 건물분 소방분 과세표준, FMR 적용 후)
): { surtax: PropertySurtaxDetail; totalSurtax: number; legalBasis: string[] } {
  // ... localEducationTax, urbanAreaTax 동일 ...

  // 지역자원시설세 — 건축물(2호)·주택(3호) 분기 (§146③1호 base + §146③2호·2의2호 중과)
  const baseFireTax =
    objectType === "building"
      ? Math.max(0, calcRegionalResourceTax(publishedPrice))               // 2호: 시가표준액 직접
      : objectType === "housing" && housingFireServiceTaxBase != null
        ? Math.max(0, calcRegionalResourceTax(housingFireServiceTaxBase))  // 3호: 건물분 × FMR(§146④ 단서)
        : 0;
  const fireHazardMultiplier =
    objectType === "building" ? resolveFireHazardMultiplier(fireHazardClass) : 1; // 주택 중과 없음(§138 주거용 제외)
  const regionalResourceTax = baseFireTax * fireHazardMultiplier;

  const surtax: PropertySurtaxDetail = {
    localEducationTax,
    urbanAreaTax,
    regionalResourceTax,
    ...(objectType === "building" && fireHazardMultiplier > 1 && {
      regionalResourceTaxBeforeSurcharge: baseFireTax,
      fireHazardMultiplier,
    }),
    // 주택 소방분 산출 시 과세표준 echo
    ...(objectType === "housing" && housingFireServiceTaxBase != null && {
      housingFireServiceTaxBase,
    }),
  };

  // ... totalSurtax 동일 ...
  const legalBasis: string[] = [PROPERTY.LOCAL_EDUCATION_TAX];
  if (isUrbanArea) legalBasis.push(PROPERTY.URBAN_AREA_TAX);
  if (objectType === "building") legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX);
  if (objectType === "building" && fireHazardMultiplier > 1)
    legalBasis.push(PROPERTY.FIRE_HAZARD_SURCHARGE);
  // 주택 소방분 산출 시 근거 push (§146④ 단서 — building의 §146과 구분)
  if (objectType === "housing" && housingFireServiceTaxBase != null)
    legalBasis.push(PROPERTY.REGIONAL_RESOURCE_TAX_HOUSING);

  return { surtax, totalSurtax, legalBasis };
}
```

## 5. orchestrator 통합 (property-tax.ts:710)

```ts
// fairMarketRatio = calcTaxBase(Step 1) 반환값 (§110③ 상한과 무관 — ratio 자체 불변)
const housingFireServiceTaxBase =
  input.objectType === "housing" && input.housingBuildingValue != null
    ? applyRate(input.housingBuildingValue, fairMarketRatio)
    : undefined;

const surtaxResult = calcSurtax(
  determinedTax,
  effectiveTaxBase,
  input.publishedPrice,
  input.objectType,
  input.isUrbanArea ?? false,
  input.fireHazardClass,
  housingFireServiceTaxBase, // 신규 7번째
);
```
- **non-land 공통 경로(710)만** 전달. land 3지점(516·583·642)은 housing 아님 → 미전달.
- `applyRate(housingBuildingValue, fairMarketRatio)` — floor 1회(과세표준 천원 절사 규정 없음 → 원 단위, 기존 calcTaxBase와 동일).

## 6. 정합성 anchor (Pre-Do 우선)

| anchor | 입력 | 기대 (원단위 `toBe`) |
|---|---|---|
| HB-1 | housing, 건물분 1.5억, 일반(`isOneHousehold=false`) | `surtax.housingFireServiceTaxBase=90,000,000` · `surtax.regionalResourceTax=80,300` |
| HB-2 | housing, housingBuildingValue 미입력 | `surtax.regionalResourceTax=0` · `housingFireServiceTaxBase` undefined |
| HB-3 | housing, 건물분 1억, isOneHousehold, publishedPrice 7억, targetDate 2026-06-01 | `housingFireServiceTaxBase=45,000,000` · `regionalResourceTax=30,100` |
| HB-4 | building, publishedPrice 1억 + housingBuildingValue 1.5억 | `regionalResourceTax=92,300` (housingBuildingValue 무시·회귀) |
| HB-5 | housing, 건물분 1.5억 + fireHazardClass="large_fire_hazard" | `regionalResourceTax=80,300` (중과 미적용·multiplier 1) · `fireHazardMultiplier` undefined |
| HB-7 | housing, 건물분 0 | `regionalResourceTax=0` · `housingFireServiceTaxBase=0`(echo 노출 — `0 != null`) (경계) |

> calcSurtax 단위: `calcSurtax(0, taxBase, publishedPrice, "housing", false, undefined, 90_000_000)` — 7번째 인자 직접.
> 통합: `calculatePropertyTax({objectType:"housing", publishedPrice, housingBuildingValue, ...})` — FMR 적용 경로 검증.

## 7. 미확정 (Do 시 실측)

- **FMR 구간 판정 기준**: 1세대1주택 비율은 `publishedPrice`(주택 전체) 기준 구간 판정(엔진 calcTaxBase 기존 동작) → 소방분도 동일 비율. 건물분가액 기준 아님. HB-3 anchor로 확정.
- **legalBasis 중복**: building·housing 모두 `REGIONAL_RESOURCE_TAX` push 가능하나 orchestrator `[...new Set(legalBasis)]` dedup → 안전.
- **선박(5호) 소방분**: 범위 외(별도 갭).
- **§146③1호 base 과세표준 — building은 시가표준액 직접, housing은 ×FMR**: 두 분기의 과세표준 산정 방식 차이는 §146④ 본문(건축물=시가표준액) vs 단서(주택=건물분×FMR) 정합.
