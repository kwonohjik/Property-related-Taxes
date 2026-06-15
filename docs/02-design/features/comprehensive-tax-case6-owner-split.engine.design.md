# 종합부동산세 사례6 — 건물·부속토지 시가표준액 안분 엔진 설계

> 계획서: `docs/01-plan/features/comprehensive-tax-case6-owner-split.plan.md`
> 대상: `lib/tax-engine/comprehensive-tax-helpers.ts`(applyEffectiveFactor 3계수) + `comprehensive-tax.ts`(3 call sites) + `comprehensive-prior-year.ts`(2 call sites) + `types/comprehensive.types.ts`
> 작성일: 2026-06-15 · 13단계 STEP 5
> 범위: **건물·부속토지 소유자 분리 시 시가표준액 비율 안분**(≠1세대1주택). numeric은 ownershipRatio로 이미 재현(probe) — 본 설계는 **연도별 독립 안분비율을 정확 분수로 표현하는 정식 채널**.

---

## 1. 케이스 인벤토리

| # | 케이스 | 당해 입력 | 직전 입력 | 기대 | 검증 |
|---|---|---|---|---|---|
| S6-1 | **사례6** 토지만 100% | `appurtenantSplit={ownedPart:"land",land:8억,building:2억}`, `ownershipRatio` 미입력(1), ≠1세대1주택 | `appurtenantSplit={land:7.8억,building:2.6억}` | ⑤ 1,367,616·ⓐ 2,376,000·②ⓓ 912,384·나① 2,047,500·나② 1,708,500·나 3,756,000·가 3,743,616·다 5,634,000·`taxCap.isApplied=false` | anchor PY-S6 |
| S6-2 | 건물만 소유 | `ownedPart:"building"` | 동 | 비율 = 건물/전체 = 2/10 = 0.2 | anchor |
| S6-3 | 분리 + 공유지분 | `appurtenantSplit` + `ownershipRatio:0.5` | 동 | effectiveFactor = 0.5 × 0.8 단일 floor | anchor |
| S6-4 | 분리 미적용(회귀) | `appurtenantSplit` 미입력 | 미입력 | 사례1~5 anchor 불변(num=den=1 항등) | 전체 vitest |
| S6-5 | 1세대1주택 + 부속토지 | `isOneHouseOwner` + 분리 | 동 | §8④1호 의제(§9⑦⑨)와 직교 합성 | **범위외**(후속) |

---

## 2. 타입 (`types/comprehensive.types.ts`)

```ts
/**
 * 건물·부속토지 소유자 분리 시 시가표준액 비율 안분 (사례6 / 종부세법 §8④1호 "다른 주택의 부속토지").
 * 납세자가 토지(또는 건물)만 소유 → 주택 공시가격을 시가표준액 비율로 안분.
 * 안분비율 = ownedPart==="land" ? land/(land+building) : building/(land+building).
 * ★ 분수(num/den)로 엔진에 전달 — 사전 비율 라운딩 0 (feedback_safemul_decimal_apportion_precision).
 */
export interface AppurtenantSplitInput {
  ownedPart: "land" | "building";  // 납세자 소유 부분 (사례6 = "land")
  landStandardValue: number;       // 토지 시가표준액 (원)
  buildingStandardValue: number;   // 건물 시가표준액 (원)
}

// ComprehensiveProperty +1 (당해)
appurtenantSplit?: AppurtenantSplitInput;
// PreviousYearAutoInput +1 (직전 — 시가표준액 연도 변동 → 당해와 독립. 핵심)
appurtenantSplit?: AppurtenantSplitInput;
```

> 직전 `appurtenantSplit`는 당해와 **독립**(시가표준액 연도 변동: 당해 8억/2억 → 직전 7.8억/2.6억). `ownershipRatio`(공유지분, 연도 불변)는 기존대로 당해=직전 collapse 유지 — 두 계수 직교.

---

## 3. 알고리즘

### 3-1. `applyEffectiveFactor` 3계수 확장 (`comprehensive-tax-helpers.ts:57`)

현행(감면 × 지분)에 **시가표준액 안분 분수(num/den)**를 정확 결합:

```ts
export function applyEffectiveFactor(
  base: number,
  reductionRate?: number,
  ownershipRatio?: number,
  appurtenant?: { num: number; den: number },  // 신규 (시가표준액 안분)
): number {
  const ratioBp = BigInt(Math.round((ownershipRatio ?? 1) * 10000));
  const rateBp = BigInt(Math.round((reductionRate ?? 0) * 10000));
  const num = appurtenant ? BigInt(appurtenant.num) : 1n;
  const den = appurtenant ? BigInt(appurtenant.den) : 1n;
  // 단일 floor: (base × ratioBp × (10000−rateBp) × num) / (1e8 × den)
  return Number(
    (BigInt(Math.round(base)) * ratioBp * (10000n - rateBp) * num) /
      (100000000n * den),
  );
}
```

- **정확성**: num/den을 분자/분모로 fold → 비율 사전 라운딩 없음. 8억/10억 = 정확 0.8, 7.8억/10.4억 = 정확 0.75. BigInt overflow 안전(base 2조 케이스도).
- **회귀 0**: `appurtenant` 미전달 → num=den=1 → `(… × 1)/(1e8 × 1)` = 기존 식. 사례1~5 anchor 불변.
- `effectiveFactor`(float)는 **활성 호출처 0건**(V1 실측) → 미확장(선택적 일관성만).

### 3-2. 도출 헬퍼 + 5 call sites

```ts
// 헬퍼 (comprehensive-tax-helpers.ts — export, tax.ts·prior-year.ts 양쪽 import): AppurtenantSplitInput → {num, den} | undefined
export function toAppurtenantFraction(s?: AppurtenantSplitInput): { num: number; den: number } | undefined {
  if (!s) return undefined;
  const den = s.landStandardValue + s.buildingStandardValue;
  if (den <= 0) return undefined; // 0 가드 → 안분 미적용(방어)
  const num = s.ownedPart === "land" ? s.landStandardValue : s.buildingStandardValue;
  return { num, den };
}
```

| call site | 현행 | 변경 |
|---|---|---|
| `comprehensive-tax.ts:177` effectiveAssessedValue | `applyEffectiveFactor(prop.assessedValue, rate, ratio)` | `+ toAppurtenantFraction(prop.appurtenantSplit)` |
| `comprehensive-tax.ts:204` imposedTax | `applyEffectiveFactor(propTax, rate, ratio)` | `+ toAppurtenantFraction(prop.appurtenantSplit)` |
| `comprehensive-tax.ts:233` effectiveExcludedValue | `applyEffectiveFactor(prop.assessedValue, prop.reductionRate, prop.ownershipRatio)` | `+ toAppurtenantFraction(prop.appurtenantSplit)` |
| `comprehensive-prior-year.ts:63` effectiveAssessedValue | `applyEffectiveFactor(priorSum, rate, ratio)` | `+ toAppurtenantFraction(auto.appurtenantSplit)` |
| `comprehensive-prior-year.ts:102` propertyTaxEquiv | `applyEffectiveFactor(propertyTaxEquivRaw, rate, ratio)` | `+ toAppurtenantFraction(auto.appurtenantSplit)` |

★ **자동 전파**(별도 주입 불요 — effectiveAssessedValue/taxBase 파생): prior-year `:107`(propertyTaxBase)·`:110`(stdTaxNumerator)·`:114`(stdTaxDenominator) / tax.ts `:380`(numeratorStdTaxEq)·`:389`(aggregatedPropertyTaxBase)·`:392`(denominatorStdTax).

### 3-3. 검산 (S6-1 — probe 실측 일치)

```
당해 effectiveAssessedValue = applyEffectiveFactor(15억, 0, 1, {8억,10억})
  = 15억 × 10000 × 10000 × 8억 / (1e8 × 10억) = 15억 × 0.8 = 12억 ✓
당해 imposedTax = applyEffectiveFactor(2,970,000, 0, 1, {8억,10억}) = 2,376,000 ✓ (ⓐ)
  ※ propTax 2,970,000 = calculatePropertyTax(15억, isOneHousehold=false) 100% 표준세율 (probe)
직전 effectiveAssessedValue = applyEffectiveFactor(14억, 0, 1, {7.8억,10.4억}) = 10.5억 ✓
직전 propertyTaxEquiv = applyEffectiveFactor(2,730,000, 0, 1, {7.8억,10.4억}) = 2,047,500 ✓ (나①)
→ ⑤ 1,367,616 (전 항목 probe 실측 일치)
```

### 3-4. §122 Min 한계 (numeric 0 — 후속)

Step6 `:404-412` §122 Min은 안분값 기준(`min(imposedTax합, propertyTaxEquiv × pct)`). 교재는 100%-기준 Min 후 안분. 사례6 상한 미발동(2,970,000 < 3,549,000)이라 동일 → numeric 0. 완전 충실화(100% 직전 재산세 expose 후 100%-Min→안분)는 후속 drift anchor.

---

## 4. anchor (PY-S6 — 신규 `comprehensive-prior-year-owner-split.test.ts`)

```ts
const r = calculateComprehensiveTax({
  assessmentYear: 2022,
  isOneHouseOwner: false,
  properties: [
    { propertyId: "p1", assessedValue: 1_500_000_000,
      appurtenantSplit: { ownedPart: "land", landStandardValue: 800_000_000, buildingStandardValue: 200_000_000 } },
  ],
  previousYearAuto: {
    assessedValue: 1_400_000_000,        // 단일주택 → priorHouseValues 생략(assessedValue fallback, 실제 단일 UI 흐름 일치)
    isOneHouseOwner: false,
    appurtenantSplit: { ownedPart: "land", landStandardValue: 780_000_000, buildingStandardValue: 260_000_000 },
  },
});
expect(r.calculatedTax).toBe(2_280_000);                               // ①
expect(r.propertyTaxCredit.totalPropertyTax).toBe(2_376_000);         // ⓐ
expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(864_000);       // ⓑ (FMR 60%)
expect(r.propertyTaxCredit.propertyTaxBase).toBe(2_250_000);          // ⓒ
expect(r.propertyTaxCredit.creditAmount).toBe(912_384);              // ②ⓓ
expect(r.taxBeforeCap).toBe(1_367_616);                             // ③
expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(2_047_500);  // 나①
expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(1_708_500); // 나②
expect(r.previousYearEquivalent?.total).toBe(3_756_000);            // 나
expect(r.currentYearTotalEquivalent).toBe(3_743_616);              // 가
expect(r.taxCap?.capAmount).toBe(5_634_000);                       // 다
expect(r.taxCap?.isApplied).toBe(false);
expect(r.determinedHousingTax).toBe(1_367_616);                    // ⑤
```

**Phase 0 실패 확인**: 현행은 `appurtenantSplit` 필드 미인식(타입에 없음) → 안분 미적용 → ⑤ ≠ 1,367,616. Phase 1 통과.
**회귀**: S6-4(미입력) = 기존, + 기존 PY-S5(사례5)·PY-M2(사례4) 불변(전체 vitest).
> ★ anchor 주석: "PDF 나① 중간 2,490,000은 교재 오기 — 정정 2,730,000(8.4억×0.4%−63만, ×7.8/10.4=2,047,500). 세부담상한 미적용이라 ⑤ 안분 정밀도 무관(numeric 0)." (feedback_anchor_correction_legal_priority)

---

## 5. 동기화 지점 (엔진→타입)

| 지점 | 내용 |
|---|---|
| 타입 | `AppurtenantSplitInput` 신규 + `ComprehensiveProperty.appurtenantSplit?` + `PreviousYearAutoInput.appurtenantSplit?` |
| 엔진 | `applyEffectiveFactor` 4번째 인자 `appurtenant?:{num,den}` + `toAppurtenantFraction` 헬퍼 + 5 call sites |
| Zod(⑨⑫) | `comprehensivePropertySchema`·`previousYearAuto` schema에 `appurtenantSplit` object(ownedPart enum + 2 nonnegative int) optional |
| Result | 무변경(`propertyTaxCredit`·`previousYearEquivalent` 기존). 결과뷰는 form 시가표준액 직접 사용 |

UI/API/Route → ui.design.md.

---

## 6. 리스크 (엔진 한정)

| # | 항목 | 처리 |
|---|---|---|
| E-1 | `applyEffectiveFactor` 시그니처 변경이 사례1~5 회귀 | num=den=1 기본값 곱셈 항등 → 전체 vitest 회귀 0 확인 |
| E-2 | 시가표준액 합 0 (den=0) | `toAppurtenantFraction` den>0 가드 → undefined(안분 미적용 방어). ★ den>0이나 **owned part 시가표준액=0(num=0)**은 ratio 0 → 과표 0 — 엔진 미차단이므로 **validation(⑧)이 owned part 시가표준액 >0 보장** |
| E-3 | 당해/직전 안분비율 혼동 | 직전은 `auto.appurtenantSplit`(직전 시가표준액) — 당해 `prop.appurtenantSplit` 재사용 금지 |
| E-4 | 사전 비율 라운딩 1원 오차 | num/den 분수 fold(소수 곱 금지). 8/10·7.8/10.4 정확 |
| E-5 | numeric 0 (⑤ 무관) | §122 미발동 케이스 — 충실 재현·법령 정합 전용. §3-4 한계 |
