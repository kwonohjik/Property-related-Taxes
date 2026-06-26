# §71 농지 감면 — 손자 세대생략 시 한도 base에 세대생략가산액 포함 (R-7)

> 예규: 재산세과-2292(2008.8.18) 제3안. 조특법 §71·조특령 §68. §71 Phase 1 SCOPE_OUT(R-7) 해소. 단일 PR.

## 문제
§71 한도(5년 1억) 적용 base ㉡ = `computedTax`(⑦ 산출세액만). 손자(직계비속) 영농자녀가 조부모로부터 농지 증여받는 세대생략 케이스에서, 예규(제3안)는 한도 base = **산출세액 + 세대생략가산액**(⑬=⑦+⑫). 현재 엔진은 ⑦만 써서 ㉣·㉤ 과소 → 감면 과소·결정세액 과대.

## 해결
- `gift-tax.ts` STEP 7.5: `isGenerationSkipFarmland = surchargeResult.detail !== null`.
  - ㉡ = 손자면 `totalComputedTaxWithSurcharge`(⑬=⑦+할증), 아니면 `computedTax`(⑦).
  - ㉠ = 손자면 `priorAggregation.totalComputedTax + totalAdditionalSurcharge`(직전 ⑬), 아니면 `totalComputedTax`.
- 부→자(donorGroup A·세대생략 아님)·§57① 단서(isSubstituteGift)는 `detail===null` → ㉡=⑦ **현행 불변**.
- 엔진 `gift-farmland-reduction.ts` 무변경 (㉡/㉠ 인자만 변경).

## 14 동기화
신규 input/result 필드 0(기존 surchargeResult·isGenerationSkip 활용). UI/Zod/API/validate 무변경. farmlandReductionDetail.farmlandComputedTax(㉣)가 ⑬ 기준 echo.

## anchor (farmland-reduction-71-grandchild.test.ts)
조부→손자(성년), 농지 5억, 사전증여 없음.
- ⑦=80,000,000 · 세대생략 할증 24,000,000 · ㉡=⑬ 104,000,000 (현행 버그 ⑦만 80M).
- ㉣=104,000,000 / ㉤=min(104M,1억)=100,000,000 (버그 80M) / ㉮=480,769,230 / ㉯=19,230,770.
- 결정세액 = 104,000,000 − 100,000,000 = 4,000,000 (버그 24,000,000).
- 무회귀: 기존 §71 14(부→자) + R-2 mixed 8 불변.

## 이중차감 없음
finalTax = totalComputedTaxWithSurcharge(⑬, 할증 포함) − totalTaxCredit − ㉤. 할증이 ⑬에 더해지고 ㉤(⑬ 기준 ㉣ 산정)로 빼지므로 정합 — 이중 아님.

## 검증
- [x] anchor 5/5 + 기존 §71 14 + R-2 mixed 8 무회귀 + tsc 0 + gift 59
- [ ] 전체 스위트 + code-analyzer
- [ ] 커밋·푸시·머지

## SCOPE_OUT
- 손자 + 농지 + 다건 사전증여 동시(㉠ totalAdditionalSurcharge Σ over-count) — 희소, 후속.
- §57① 단서(대습) 시 할증 배제는 detail===null로 자동 ㉡=⑦ (정합).
