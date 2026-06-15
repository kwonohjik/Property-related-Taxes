# 재산세 주택 과세표준상한제 (§110③) — 엔진 설계

> 계획서: `docs/01-plan/features/property-tax-base-cap-110-3.plan.md`
> 근거: 지방세법 §110③ + 시행령 §109의2① ② (KoreanLaw MCP 본문 검증 완료)
> 대상 엔진: `lib/tax-engine/property-tax.ts` (housing 분기 전용)

## 1. 케이스 인벤토리 (전수 enumerate)

| # | objectType | priorYearPublishedPrice | 직전 vs 당해 | 1세대1주택/연도 | 기대 동작 |
|---|---|---|---|---|---|
| C-1 | housing | 입력 (직전<당해, 급등) | 당해 > 직전×1.05 | 일반 60% | **상한 작동** — finalTaxBase = taxBaseCap < currentTaxBase |
| C-2 | housing | 입력 (완만 상승) | 당해 ≤ 직전×1.05 | 일반 60% | **상한 미도달** — finalTaxBase = currentTaxBase, `taxBaseCapApplied=false` |
| C-3 | housing | 입력 (직전 ≥ 당해, 하락) | 당해 < 직전 | 일반 60% | 상한 미도달(상한액 > 당해) — currentTaxBase 그대로 |
| C-4 | housing | **미입력(undefined)** | — | 일반 60% | priorBaseEquiv=taxBase → 상한 미작동(신축·자료부재) |
| C-5 | housing | 입력 | 급등 | **1세대1주택 2026 (45%)** | 양쪽 항 45% 비율, 상한 작동 |
| C-6 | building | 입력/미입력 무관 | — | — | **신규 필드 완전 무시** — 기존 결과 불변(회귀) |
| C-7 | land (각 유형) | — | — | — | **무영향** — 분리/별도/종합합산 분기 무변경 |
| C-8 | housing | 음수 | — | — | Zod에서 차단(`nonnegative`). 엔진 도달 시에도 `< 0` 가드 |

## 2. 입력/결과 타입 (types/property.types.ts)

### Input 추가 (1필드)
```ts
export interface PropertyTaxInput {
  // ... 기존 ...
  publishedPrice: number;          // 당해연도 시가표준액(공시가격) — 기존
  // ▼ 신규
  /**
   * 직전연도 시가표준액(공시가격, 원) — 주택 과세표준상한제(§110③) 계산용.
   * 미입력 시 상한 미작동(시행령 §109의2① 단서). objectType==="housing" 외에는 무시.
   */
  priorYearPublishedPrice?: number;
}
```

### Result 추가 (5필드, 모두 optional — housing 상한 적용 시에만)
```ts
export interface PropertyTaxResult {
  // ... 기존 taxBase 는 상한 적용 후 effectiveTaxBase 로 채워짐 ...
  /** 과세표준상한 적용 전 당해연도 과세표준 (= calcTaxBase 원값) */
  taxBaseBeforeCap?: number;
  /** §110③ 과세표준상한 실제 적용 여부 (상한액 < 당해 과세표준일 때만 true) */
  taxBaseCapApplied?: boolean;
  /** 과세표준상한액 (직전 상당액 + 당해×5%) */
  taxBaseCapLimit?: number;
  /** 직전연도 과세표준 상당액 (직전 시가표준액 × 당해 공정시장가액비율) */
  priorYearTaxBaseEquivalent?: number;
  /** 과세표준상한율 (0.05) */
  taxBaseCapRate?: number;
}
```
- **`taxBase` 필드 자체는 상한 적용 후 값(`effectiveTaxBase`)** 으로 채운다. 종부세 연동·세율·도시지역분 모두 이 값을 본다(자기일관).

## 3. 법령 상수 (legal-codes/property.ts)

```ts
// PROPERTY (조문 라벨) — 기존 TAX_CAP("지방세법 §122")와 별도
TAX_BASE_CAP: "지방세법 §110③",            // 신규

// PROPERTY_CONST (수치)
TAX_BASE_CAP_RATE: 0.05,                    // 시행령 §109의2② (100분의 5)
```
> ⚠️ 기존 `HOUSING_TAX_CAP_BRACKET_1/2`·`HOUSING_TAX_CAP_PCT_1/2/3`·`HOUSING_TAX_CAP_ABOLISHED_YEAR`(폐지 §122 세부담상한)는 **`comprehensive-prior-year.ts:185-192`에서 사용 중** → **건드리지 않는다**. 신규 상수는 `TAX_BASE_*` 접두로 명확히 구분.

## 4. 신규 순수 함수

```ts
/**
 * 주택 과세표준상한제 (지방세법 §110③, 시행령 §109의2)
 *
 * 과세표준상한액 = 직전연도 과세표준 상당액 + (당해 과세표준 × 5%)
 *   직전연도 과세표준 상당액 = 직전 시가표준액 × 당해 공정시장가액비율
 *   (직전 시가표준액 없으면 당해 과세표준 동치 → 상한 미작동)
 *
 * @param taxBase                당해연도 과세표준 (calcTaxBase 산정값)
 * @param fairMarketRatio        당해 공정시장가액비율 (calcTaxBase 반환값 — 동일 비율 재사용)
 * @param priorYearPublishedPrice 직전연도 시가표준액 (미입력 시 상한 미작동)
 */
export function applyHousingTaxBaseCap(
  taxBase: number,
  fairMarketRatio: number,
  priorYearPublishedPrice?: number,
): {
  cappedTaxBase: number;
  taxBaseBeforeCap: number;
  taxBaseCapApplied: boolean;
  taxBaseCapLimit: number;
  priorYearTaxBaseEquivalent: number;
  taxBaseCapRate: number;
} {
  const priorEquiv =
    priorYearPublishedPrice != null && priorYearPublishedPrice >= 0
      ? applyRate(priorYearPublishedPrice, fairMarketRatio)
      : taxBase;                                   // 폴백 동치 (publishedPrice 불요)
  const capIncrement = applyRate(taxBase, PROPERTY_CONST.TAX_BASE_CAP_RATE);
  const capLimit = priorEquiv + capIncrement;
  const cappedTaxBase = Math.min(taxBase, capLimit);

  return {
    cappedTaxBase,
    taxBaseBeforeCap: taxBase,
    taxBaseCapApplied: cappedTaxBase < taxBase,
    taxBaseCapLimit: capLimit,
    priorYearTaxBaseEquivalent: priorEquiv,
    taxBaseCapRate: PROPERTY_CONST.TAX_BASE_CAP_RATE,
  };
}
```

## 5. 파이프라인 통합 (calculatePropertyTax)

```ts
// Step 1 (기존)
const { taxBase, fairMarketRatio, legalBasis: taxBaseLegal } = calcTaxBase(...);
legalBasis.push(taxBaseLegal);

// ── Step 1.5 (신규) — housing 전용 과세표준상한 ──
let effectiveTaxBase = taxBase;
let taxBaseCap: ReturnType<typeof applyHousingTaxBaseCap> | undefined;
if (input.objectType === "housing") {
  taxBaseCap = applyHousingTaxBaseCap(taxBase, fairMarketRatio, input.priorYearPublishedPrice);
  effectiveTaxBase = taxBaseCap.cappedTaxBase;
  if (taxBaseCap.taxBaseCapApplied) legalBasis.push(PROPERTY.TAX_BASE_CAP);
}

// Step 2 (기존 — housing 분기): 1번째 인자만 effectiveTaxBase, 2번째는 원본 publishedPrice
const housingResult = calcHousingTax(
  effectiveTaxBase,        // ← capped (세율 과표)  [property-tax.ts:485 치환]
  input.publishedPrice,    // ← 원본 (9억 특례 판정 — property-tax.ts:219, 치환 금지)
  input.isOneHousehold ?? false,
);
```

### `taxBase` → `effectiveTaxBase` 정확 치환 지점 (실측 line, 3곳)
| # | 위치 | 현행 | 변경 | 비주택 안전성 |
|---|---|---|---|---|
| 1 | property-tax.ts:485 (housing 분기) | `calcHousingTax(taxBase, …)` | `calcHousingTax(effectiveTaxBase, …)` | housing 전용 분기 |
| 2 | property-tax.ts:740 (Step 4 공통 surtax) | `calcSurtax(determinedTax, taxBase, …)` | `…, effectiveTaxBase, …` | 비주택은 `effectiveTaxBase === taxBase`(Step 1.5 미진입) → 무영향 |
| 3 | property-tax.ts:756 (최종 return) | `taxBase,` | `taxBase: effectiveTaxBase,` | 동상 — 비주택 결과 `taxBase` 불변 |

- **비주택 무영향 근거**: Step 1.5 가드가 `objectType === "housing"` → building·vessel·aircraft는 `effectiveTaxBase = taxBase`(초기값) 유지. 따라서 공통 경로(2·3) 치환은 비주택 결과를 바꾸지 않음.
- vessel/aircraft Step 2(line 711 `applyRate(taxBase, 0.003)`)는 **치환 불요**(동일값이나 최소 diff 위해 유지).
- 결과 객체 5필드는 스프레드 주입: `...(taxBaseCap && { taxBaseBeforeCap: taxBaseCap.taxBaseBeforeCap, taxBaseCapApplied: taxBaseCap.taxBaseCapApplied, taxBaseCapLimit: taxBaseCap.taxBaseCapLimit, priorYearTaxBaseEquivalent: taxBaseCap.priorYearTaxBaseEquivalent, taxBaseCapRate: taxBaseCap.taxBaseCapRate })`.
- **land early-return 블록(line 555·628·681)은 무변경** — 자체 taxBase(sepResult.taxBase·comprehensiveTaxBase) 사용, 외부 `effectiveTaxBase`와 무관.
- **§122 ↔ §110③ 무상호작용**: §110③은 과세표준 단계 상한, §122 세부담상한(주택 미적용)은 세액 단계. housing은 `applyTaxCap`이 determinedTax=calculatedTax 그대로 반환 → double-cap 없음. 두 메커니즘 독립.

## 6. 정합성 anchor (Pre-Do 우선)

| anchor | 입력 | 기대 (원단위 `toBe`) |
|---|---|---|
| C-1 | housing, 당해 7억, 직전 5억, 일반(`isOneHousehold=false`) | `taxBaseBeforeCap=420,000,000` · `taxBaseCapLimit=321,000,000` · `taxBase=321,000,000` · `taxBaseCapApplied=true` |
| C-4 | housing, 당해 7억, 직전 undefined | `taxBase=420,000,000` · `taxBaseCapApplied=false` |
| C-5 | housing, 당해 7억, 직전 5억, `isOneHousehold=true`, **`targetDate="2026-06-01"`**(45% 비율 게이트) | `taxBase=240,750,000` · `taxBaseCapApplied=true` |
| C-6 | building, 직전 5억 | 신규 5필드 전부 undefined · 기존 결과 불변 |

> C-5 주의: `taxYear`는 `targetDate.slice(0,4)`(property-tax.ts:467)에서 도출. 2026 1세대1주택 43~45% 비율은 `taxYear === 2026` 게이트(property-tax.ts:116)이므로 anchor 입력에 `targetDate="2026-06-01"` 필수.

## 7. 미확정 (Do 시 실측)

- **상한율 연도 게이트**: 시행령 §109의2② 현행 5% 고정. 부칙상 연도 분기 불요로 판단 → `TAX_BASE_CAP_RATE` 단일 상수. 개정 시 갱신.
- **음수 입력**: Zod `nonnegative`로 1차 차단. 엔진은 `>= 0` 가드로 폴백 처리(throw 아님 — undefined와 동일 취급).
