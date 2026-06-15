# 종합부동산세 사례5 — 직전 §8④ 안분 고령자 공제 엔진 설계

> 계획서: `docs/01-plan/features/comprehensive-tax-case5-joint-regional.plan.md`
> 대상: `lib/tax-engine/comprehensive-prior-year.ts` + `types/comprehensive.types.ts`
> 작성일: 2026-06-15 · 13단계 STEP 5
> 범위: **G-5 — 직전연도 1세대1주택+§8④ 고령자 공제의 §9⑦⑨ 공시가격 안분** (당해·직전 재산세 합산·11억 의제는 기구현)

---

## 1. 케이스 인벤토리

| # | 케이스 | 직전 입력 | 직전 고령자 공제 | 기대 |
|---|---|---|---|---|
| S5-1 | **사례5** 부부+지방저가 | `priorHouseValues=[13억,1.95억]`, `isOneHouseOwner=true`, `priorSection8Para4Value=1.95억`, birthDate(직전69세) | §9⑦ 안분 13억/14.95억 × 30% | 직전 종부세상당액 **1,182,305** · ⑤ 969,711 |
| S5-2 | 직전 §8④ 없음(사례4 PY-M2) | `priorSection8Para4Value` 미입력 | 고령자 자체 미입력(0) | 회귀 0 (안분 비율 미적용) |
| S5-3 | 직전 1주택·§8④ 없음·고령 | `isOneHouseOwner=true`, birthDate, `priorSection8Para4Value` 미입력 | 안분 없이 전체 × rate (기존) | 기존 동작 보존 |
| S5-4 | 직전 §8④ 있으나 고령 미해당 | birthDate 미입력 | 공제 0 | 안분 무의미(0) |

---

## 2. 타입 (`types/comprehensive.types.ts` — PreviousYearAutoInput +1)

```ts
export interface PreviousYearAutoInput {
  // ... 기존(assessedValue·isOneHouseOwner·birthDate·acquisitionDate·reductionRate·ownershipRatio·
  //         priorHouseValues·isMultiHouseInAdjustedArea·taxableHouseCount) ...
  /**
   * 직전연도 §8④ 특례주택(지방저가·상속·일시적2주택 등) 공시가격 합(원).
   * §9⑦⑨: 1세대1주택+§8④ 고령자·장기보유 공제는 (산출세액 − §8④분 안분) × 공제율.
   * 미입력 = §8④ 없음 → 안분 미적용(전체에 공제율). 입력 시 main = priorSum − 이 값.
   */
  priorSection8Para4Value?: number;
}
```

> 직전 §8④ 안분 분자(main) = `priorSum − priorSection8Para4Value`. 사례5: 14.95억 − 1.95억 = 13억. 당해(15억/17억)와 분리 — 직전 공시 기준이라 별도 입력 필수.

---

## 3. 알고리즘 (`comprehensive-prior-year.ts` 고령자 공제 1지점)

### 현행 (:116-126, §8④ 안분 미적용 — 부정합)
```ts
const oneHouseDeductionAmount = Math.floor(afterPropertyCredit * oneHouseDeductionRate);
```

### 변경 (§9⑦⑨ 안분 — 당해 `applyOneHouseDeduction`(helpers:18-25)과 동일 정수연산)
현행(:137 `Math.floor(afterPropertyCredit * oneHouseDeductionRate)`)을 §8④ 안분 분기로:
```ts
// import 추가(:19): safeMultiplyThenDivide  (현재 safeMulDivRound만)
const s84 = auto.priorSection8Para4Value ?? 0;
let oneHouseDeductionAmount: number;
if (s84 > 0 && s84 < priorSum && oneHouseDeductionRate > 0) {
  // §9⑦⑨ 안분: 당해 applyOneHouseDeduction과 동일 — floor(base × rateInt × main / (total×100))
  const rateInt = Math.round(oneHouseDeductionRate * 100); // 0.3 → 30
  oneHouseDeductionAmount = safeMultiplyThenDivide(
    afterPropertyCredit * rateInt,
    priorSum - s84,        // main = priorSum − §8④ 공시
    priorSum * 100,        // total × 100
  );
} else {
  // §8④ 없음 = 전체(기존 동작 — 사례4 PY-M2 회귀 0)
  oneHouseDeductionAmount = Math.floor(afterPropertyCredit * oneHouseDeductionRate);
}
```

- ★ 당해 helpers와 **동일 패턴**(`rateInt` + `safeMultiplyThenDivide` 1회 floor) — 2단 floor 아님(정수연산 일관성).
- S5-2(s84 미입력): else 분기 → 기존 동작 = **사례4 PY-M2 회귀 0**.

### 검산 (helpers 단일식 — 계획 §4-1)
```
afterPropertyCredit = 2,402,000 − 802,411 = 1,599,589 · rateInt = 30 · main 13억 · total 14.95억
oneHouseDeduction = floor(1,599,589 × 30 × 13억 / (14.95억 × 100)) = floor(417,284.08) = 417,284
직전 종부세상당액 = 1,599,589 − 417,284 = 1,182,305  ✓ (safeMultiplyThenDivide 단일식 — 2단 floor 가정 시 417,283은 오산이었음)
```

> ★ `priorSum`은 PR#204에서 이미 정의(재산세 주택별 합산용). G-5는 그 priorSum을 안분 분모로 재사용 — 신규 변수 없음.

---

## 4. anchor (PY-S5 — Phase 0 갭 실증 → Phase 1 통과)

`__tests__/tax-engine/comprehensive-special-cases.test.ts`(D2-1 인접) 또는 prior-year-multi:

```ts
const r = calculateComprehensiveTax({
  assessmentYear: 2022,
  isOneHouseOwner: false,
  isJointOwnershipSpecialCase: true,
  birthDate: new Date("1952-01-01"),       // 당해 70세 / 직전 69세
  acquisitionDate: new Date("2018-01-01"),
  properties: [
    { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
    { propertyId: "p2", assessedValue: 200_000_000, location: "non_metro", exclusionType: "none", section8para4Type: "regional_low_price" },
  ],
  previousYearAuto: {
    assessedValue: 1_495_000_000,
    priorHouseValues: [1_300_000_000, 195_000_000],
    priorSection8Para4Value: 195_000_000,    // 직전 세종(지방저가)
    isOneHouseOwner: true,
  },
});
expect(r.calculatedTax).toBe(2_280_000);                                   // 당해 ①
expect(r.determinedHousingTax).toBe(969_711);                             // ⑤ (불변)
expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(2_635_500);       // 직전 재산세 (PDF)
expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(2_402_000);  // 직전 ⓐ (PDF)
expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(1_182_306); // §9⑦ 안분 (G-5 — 현행 1,119,713 실패)
expect(r.taxCap?.isApplied).toBe(false);
```

**Phase 0 실패 확인**: 현행은 `comprehensiveTaxEquiv = 1,119,713`(안분 미적용) → `1,182,305` expect 실패 = 갭 실증. (당해·재산세·ⓐ는 현행 통과)

> ★ anchor 주석: "1,182,305 = §9⑦ §8④ 안분(13억/14.95억) × 직전 69세 30%. PDF 1,599,590(고령자 미반영 단순화)·현행 1,119,713(안분 누락) 모두 부정합 — 세부담상한 미적용이라 ⑤ 969,711 무관."

회귀: 사례4 **PY-M2**(`priorSection8Para4Value` 미입력 → `apportionBase=afterPropertyCredit`) 불변.

---

## 5. 동기화 지점 (엔진→타입)

| 지점 | 내용 |
|---|---|
| 타입 | `PreviousYearAutoInput.priorSection8Para4Value?: number` |
| 엔진 | `prior-year.ts` 고령자 공제 1지점(§3) — `priorSum` 재사용 + `import { safeMultiplyThenDivide }`(현재 미import) |
| Zod(⑨⑫) | `previousYearAutoSchema`에 `priorSection8Para4Value: z.number().int().nonnegative().optional()` |
| Result | 무변경(`comprehensiveTaxEquiv`·`detail` 기존) |

UI/API/Route 동기화 → ui.design.md.

---

## 6. 리스크(엔진 한정)

| # | 항목 | 처리 |
|---|---|---|
| E-1 | 직전 §8④ 안분 분자 = priorSum − s84 (음수 가드) | `priorSum > 0 && s84 < priorSum` 전제. s84 ≥ priorSum이면 비정상 입력 → 안분 0 방어 |
| E-2 | 당해 §8④ 안분(15억/17억) ↔ 직전(13억/14.95억) 혼동 | 직전은 `priorSection8Para4Value`(직전 공시) 별도 — 당해 `section8para4Detail` 재사용 금지 |
| E-3 | 정수연산 패턴 | 당해 `applyOneHouseDeduction`과 동일 `safeMultiplyThenDivide` 단일식(`rateInt`+1회 floor). 검산 1,182,305 일치 |
| E-4 | numeric 영향 0 (⑤ 무관) | G-5는 직전 상당액 충실 재현·법령 정합 전용 — 세부담상한 binding 케이스에서만 ⑤ 영향 |
