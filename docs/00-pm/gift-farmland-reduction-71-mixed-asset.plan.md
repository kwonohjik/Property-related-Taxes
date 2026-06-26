# §71 농지 감면 — 금번 증여 농지+비농지 혼합 ㉣ 안분 (R-2)

> 조특법 §71①·§71②. §71 Phase 1 SCOPE_OUT(R-2) 해소. 단일 PR.
> 작성: 2026-06-26 · 엔진: gift-farmland-reduction.ts + gift-tax.ts STEP 7.5

## 문제
㉣(농지분 산출세액)이 `aggregatedComputedTax − priorComputedTax`(금번 증여 **전체** 마진, 비농지 세액 포함). 금번 증여에 농지+비농지 혼합 + 5년 1억 한도 미구속 시 ㉤=min(㉣,잔여)이 **비농지분 세액까지 과대감면**.

## 해결 — 가액비례 안분
㉣ = (㉡−㉠) × 농지가액/금번총가액. §71 감면이 농지분 산출세액만 대상으로 제한.
- 단일 증여 내 농지+비농지 혼합 **직접 예규 부재** → 가액비례(법령 도출, 주석 명시).
- 단일 농지(농지=총가액)면 ratio=1 → full marginal **무회귀**.
- `gift-farmland-reduction.ts`: `FarmlandGiftReductionInput.currentTotalGiftValue` 추가, `calcFarmlandGiftReduction` ㉣ `safeMultiplyThenDivide(currentMarginalTax, farmlandValue, currentTotalGiftValue)`, `deriveFarmlandReduction` currentTotalGiftValue=ΣvaluatedAmounts.
- `gift-tax.ts` STEP 7.5: 첫 인자 `input.giftItems`→`ordinaryGiftItems`(valuationResults 인덱스 정합 + 분모 정확).

## 14 동기화
신규 input/result 필드 0(currentTotalGiftValue는 내부, 기존 valuatedAmounts에서 도출). UI/Zod/API/validate 무변경. farmlandReductionDetail.farmlandComputedTax(㉣)가 안분값 echo → 결과 카드 자동 정합.

## anchor (farmland-reduction-71-mixed.test.ts)
부친→자녀(세대생략 아님), 농지 2억 + 현금 8억(총 10억), 사전증여 없음, 한도 미구속.
- ㉡=225,000,000 / ㉣=225,000,000×2억/10억=45,000,000 / ㉤=min(45M,1억)=45,000,000 / ㉮=2억 / ㉯=0 / 결정세액 180,000,000.
- 현행 버그: ㉣=225M·㉤=1억·결정세액 125M. → 실패 캡처 후 통과.
- 무회귀: 기존 §71 14/14(단일 농지) 불변.

## 검증
- [x] anchor mixed 5/5 + 기존 §71 14 + tsc 0 + gift 51
- [ ] 전체 스위트 + code-analyzer
- [ ] 커밋·푸시·머지

## SCOPE_OUT
- 농지 prior + 혼합 + aggregation-excluded 동시(인덱스 정합은 ordinaryGiftItems로 1차 해소).
- 비농지 직전회차(R-3)·§58 한도 구속(R-9)은 별도.
