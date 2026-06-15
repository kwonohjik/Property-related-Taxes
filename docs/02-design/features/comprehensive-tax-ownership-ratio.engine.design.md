# 종합부동산세 공유지분(지분율) — 엔진 설계

> PDCA Design (engine). 2026-06-15. Plan: `docs/01-plan/features/comprehensive-tax-ownership-ratio.plan.md`.
> 사례2(reductionRate ✅PR#197) 메커니즘 재사용. 코딩 금지 — 설계만.

## 1. 케이스 인벤토리

| ID | 케이스 | 입력 | 기대(핵심) | anchor |
|---|---|---|---|---|
| C3-A | 사례3 일반1주택 지분 70% | 공시 15억/13억, ratio 0.7, 감면 0 | ① 1,620,000 → ⑤ 907,200 | comprehensive-case3-anchor |
| C3-REG1 | 지분 미입력 = 100% 단독 | ratio undefined | 사례12·사례2 동작 보존(회귀 0) | 기존 anchor green |
| C3-REG2 | 감면율 회귀 (헬퍼 도입 후) | 사례2 입력 | effectiveFactor(rate,undefined)=(1−rate) → 294,924 등 동일 | case2-anchor green |
| C3-COMBO | 지분+감면 동시 | ratio 0.7, rate 0.25 | 곱 결합 floor(공시×0.7×0.75) | combo anchor |
| C3-EXCL | 합산배제+지분 동시 | 1주택 합산배제 + 1주택 지분 | A-2 effectiveExcludedValue ownershipRatio 반영 | excl anchor |

## 2. input / result 타입 변경

```ts
// types/comprehensive.types.ts
interface ComprehensiveProperty {
  // ... 기존
  reductionRate?: number;   // 0~1 (기존, PR#197)
  ownershipRatio?: number;  // 0~1, 미입력=1(단독 100%). 신규
}
interface PreviousYearAutoInput {
  reductionRate?: number;   // 기존
  ownershipRatio?: number;  // 신규 — 해당연도 지분율(원칙3)
}
// result: effectiveIncludedAssessedValue 재사용(지분후+감면후 결합값). 신규 필드 없음.
```
★ [STEP6 정정] 결과카드 "지분율 X%" 표시는 result echo로 역산 불가(지분·감면 결합) → UI는 **form 값(ownershipRatio) 직접** 사용. result echo 추가 불필요(UI설계 확정).

## 3. 알고리즘 — applyEffectiveFactor 단일 헬퍼 (single-source)

★ [Do 환류 2026-06-15] **float 계수 곱 금지** — `floor(base × (ratio×(1−rate)))`를 float로 하면 0.7 부정확(`1,500,000,000 × 0.7 = 1,049,999,999.99 → floor 1원 부족`). 사례2(0.75)는 float 정확이라 우연히 통과했으나 사례3(0.7)에서 전 칸 드리프트(⑤ 907,167 vs 907,200). **만분율(basis point) 정수 + BigInt**로 정정(memory feedback_applyrate_fractional_rate_one_won_error). 헬퍼 시그니처가 `effectiveFactor(rate, ratio): number`(계수) → `applyEffectiveFactor(base, rate, ratio): number`(floor된 결과)로 변경됨.

```ts
// comprehensive-tax-helpers.ts (prior-year도 import)
export function applyEffectiveFactor(base: number, reductionRate?: number, ownershipRatio?: number): number {
  const ratioBp = BigInt(Math.round((ownershipRatio ?? 1) * 10000));  // 만분율 정수
  const rateBp = BigInt(Math.round((reductionRate ?? 0) * 10000));
  return Number((BigInt(Math.round(base)) * ratioBp * (10000n - rateBp)) / 100000000n);  // 곱 후 1회 floor, overflow 안전
}
```

5개 주입 지점 (전부 `floor(base × effectiveFactor(rate, ratio))`):

| 지점 | 파일:line | base | 비고 |
|---|---|---|---|
| A-1 | comprehensive-tax.ts:174 | prop.assessedValue | effectiveTotalFromLoop 누적 |
| A-2 | comprehensive-tax.ts:230 | prop.assessedValue (합산배제분) | effectiveExcludedValue 차감 ★누락주의 |
| B | comprehensive-tax.ts:201 | propTax(100%지분 determinedTax) | imposedTax → 안분ⓐ+참고+합계 |
| C | comprehensive-prior-year.ts:88 | propertyTaxEquivRaw(원공시 calcHousingTax) | 직전 재산세상당 |
| D | comprehensive-prior-year.ts:54 | auto.assessedValue | 직전 종부세 과표·분모·공제 연쇄 |

- 곱 순서 무관(교환), floor는 곱 후 1회.
- 합산배제 **판정**은 원공시 기준 유지(R-2). 과세표준만 effectiveFactor 적용.
- 재산세 1세대1주택 특례세율(isOneHousehold) 판정은 publishedPrice=원공시 — v1 사례3 일반이라 무관(R-2 일반화 후속).

## 4. 동기화 지점 (엔진/API측)
⑨⑩ Zod `ownershipRatio: z.number().min(0).max(1).optional()` (메인+previousYearAuto) · ⑬ comprehensive-api.ts %→/100(미입력→undefined) · ⑭ route pass-through. ⑪ optional 해당없음.

## 5. anchor (원단위 toBe)
C3-A: taxBase 270,000,000 / calcTax 1,620,000 / ②ⓐ 2,079,000 ②ⓑ 648,000 ②ⓒ 1,890,000 ②ⓓ 712,800 / ③⑤ 907,200 / 직전 propertyTaxEquiv 1,743,000 comprehensiveTaxEquiv 974,238 / totalPropertyTax 2,079,000 / taxCap.isApplied false.
Pre-Do: 현행(지분 미지원) 사례3 → ① 미반영 드리프트 실측.

## 6. 리스크 (Plan §7 동기화)
R-1 지분+감면 결합 단일 floor / R-2 1세대1주택 특례세율 원공시 판정 / R-4 §10의2 v1 제외 / R-5 fallback ratio=1·rate=0 / R-7 floor 1원 tolerance.
