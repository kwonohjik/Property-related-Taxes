# 3차 증여(재차증여 체인) — §58 가산재산 marginal 산출세액·과표 + §57 한도 보정 계획서

> 산식 출처: **재재산-610(2007.5.23)** 3차 증여 계산사례 (조부→손자 세대생략). 구법 사례(3천만 공제·10% 신고공제·5년 cutoff)라 절대숫자 재현 아님 — **구조 메커니즘**을 현행법(10년·5천만·3%)으로 구현.
> 작성일: 2026-06-26 · 엔진: `gift-prior-aggregation.ts` + `gift-tax.ts` · 단일 PR
> 사용자 framing 확정: "구조 메커니즘(현행법)".

---

## 0. 문제 — 직전회차가 "그 자신의 사전증여"를 합산했던 재차증여 체인

현재 엔진은 §58 ⑭(가산재산 산출세액)·⑮ 분자(가산재산 과표)·§57 ⑩에 **`matched[0]`(직전회차)의 전체 합산값**(`computedTax`·`giftTaxBase`)을 사용한다.

- **2차 사례(사례 2)**: 직전=1차(단일·체인 없음) → `matched[0].computedTax`(231,000)=가산재산 산출세액, `matched[0].giftTaxBase`(970,000)=가산재산 과표. **정확**.
- **3차 사례(재재산-610)**: 직전=2차가 *그 자신의 사전증여(1차)*를 합산한 회차. 금번(3차) cutoff에서 1차가 탈락하면:
  - ⑭ = 2차⑦ − 1차⑦ = 348,000 − 231,000 = **117,000** (≠ 2차⑦ 348,000)
  - ⑤_prior 가산재산 과표 = 300,000 − 공제×300,000/400,000 = **277,500** (≠ 2차⑤ 1,270,000)
  - ⑨ 기할증 = 2차⑫ = 35,100 (탈락한 1차⑫ 미포함 — `Σ matched ⑫`가 이미 정확)

→ **현행 10년법에서도 발생**: 직전회차 사전증여가 *직전의 10년 내 · 금번의 10년 밖*일 때 (예: 1차 2013·2차 2020·3차 2024 → 1차 2013은 3차 2024의 10년 밖, 2차 2020의 10년 내).

## 1. 구조 메커니즘 (법개정 무관 — 재재산-610 산식)

```
가산재산 산출세액 ⑭   = matched[0].computedTax − Q.computedTax     (Q=금번 탈락한 직전회차의 직전 사전증여)
가산재산 과표 ⑤_prior = ⑤ × totalAmount / (totalAmount + netCurrent)  (= 가산재산 − 공제 안분)
한도 ⑮(§58)          = ⑦ × ⑤_prior / ⑤
한도 ⑩(§57)          = ⑦ × ⑤_prior / ⑤ × 할증율
⑯ = min(⑭, ⑮)  /  ⑨ = Σ matched ⑫ (현행 유지)
```

- `totalAmount` = Σ matched giftAmount = 가산재산(③) = 2차 현재가액(2차 giftAmount, 1차 미포함 — 1차 탈락).
- `netCurrent` = 금번 순증여가액.
- drop-out 없으면(2차 사례): ⑭=matched[0].computedTax, ⑤_prior=matched[0].giftTaxBase — **현행 100% 보존**.

## 2. drop-out 감지 (gift-prior-aggregation.ts)

`matched` 확정 후, priorGifts 중 다음을 만족하는 **가장 최근** prior Q를 탐색:
1. 금번 cutoff 탈락: `isBefore(Q.giftDate, boundary47)` (이미 matched 제외됨)
2. matched[0]의 10년 내: `!isBefore(Q.giftDate, subYears(matched[0].giftDate, 10))`
3. matched[0]보다 이전: `Q.giftDate < matched[0].giftDate`
4. 동일 donor 그룹 (matched와 동일 기준)

Q 존재 → `priorRoundHadDropout=true`, `marginalPriorComputedTax = matched[0].computedTax − Q.computedTax`.
Q 부재 → false, marginal=totalComputedTax (현행).

> **Phase 1 범위**: 3차(drop-out 1건). 4차+ 다중 drop-out은 "가장 최근 Q"로 근사 — 후속. SCOPE_OUT 명시.

## 3. PriorAggregationResult 확장 (신규 2필드)

```ts
/** 직전회차가 그 자신의 사전증여(금번 cutoff 탈락)를 합산했던 재차증여 체인 (재재산-610) */
priorRoundHadDropout: boolean;
/** drop-out 시 가산재산 산출세액 ⑭ = matched[0].computedTax − Q.computedTax. 아니면 totalComputedTax */
marginalPriorComputedTax: number;
```

## 4. gift-tax.ts 연결 (STEP 6.5 신규 — surcharge·credit 직전)

```ts
const effectivePriorAgg = priorAggregation.priorRoundHadDropout
  ? { ...priorAggregation,
      totalComputedTax: priorAggregation.marginalPriorComputedTax,
      priorAddedTaxBase: safeMultiplyThenDivide(taxBase, priorAggregation.totalAmount, priorAggregation.totalAmount + netCurrentGiftValue) }
  : priorAggregation;
```
- STEP 7 surcharge: `effectivePriorAgg` 전달 (⑩ marginal).
- STEP 8 credit: `priorGiftComputedTax: effectivePriorAgg.totalComputedTax`, `priorGiftAddedTaxBase: effectivePriorAgg.priorAddedTaxBase`.
- `priorGiftCreditDetail`(STEP 10)도 effectivePriorAgg 기준으로 echo (자기일관 — memory `feedback_engine_result_display_drift`).

> 2-스트림 경로(`gift-tax-two-stream.ts`)는 동일 패턴 미적용 — 특례 prior는 별개 스트림. SCOPE_OUT.

## 5. 14 동기화 지점

엔진 input/result **신규 필드 없음** — `PriorGift`의 기존 필드(`computedTax`·`giftTaxBase`·`giftDate`·`additionalGenerationSkipSurcharge`)만 사용. UI/Zod/API/validate **무변경**.
- ① ~ ⑭: 변경 없음 (기존 prior 입력 필드 재사용).
- ⑦ 결과 카드: `priorGiftCreditDetail`이 marginal 값 echo → `GenerationSkipSurchargeBreakdownCard`·`TaxCreditBreakdownCard` 자동 반영 (산식 표시 정합 확인만).
- **순수 엔진-내부 보정** → 동기화 부담 최소. PostToolUse ui-sync hook은 무시 (신규 필드 0).

## 6. Pre-Do anchor (현행법 합성 — 재재산-610 구조)

`__tests__/tax-engine/gift/three-round-prior-chain.test.ts`:
- 입력: 조부→손자, 1차(2013-01-01, 10억), 2차(2020-01-01, 3억), 3차(2024-01-01, 1억).
  - 1차·2차의 `computedTax`·`giftTaxBase`·`additionalGenerationSkipSurcharge`는 **probe로 현행 엔진 산출**(1차 standalone·2차 with 1차 prior — 기존 정확 경로) 후 priorGift 입력으로 동결.
- 3차 cutoff(2014)에서 1차(2013) 탈락 → drop-out 발동.
- **구조 anchor**(toBe):
  - `priorRoundHadDropout === true`
  - `marginalPriorComputedTax === 2차computedTax − 1차computedTax`
  - `priorGiftCreditDetail.priorComputedTax === marginal` (⑭)
  - `priorGiftCreditDetail.priorAddedTaxBase === ⑤ × 가산/(가산+순현재)` (⑤_prior 안분)
  - ⑯ = min(⑭, ⑮) / ⑨ = 2차⑫
- **무회귀 anchor**: 2차 사례(drop-out 없음) — 기존 값 불변(`priorRoundHadDropout===false`, ⑭=2차⑦).
- 실행 → **실패 캡처**(현행 엔진은 2차 전체값 사용).

## 7. 검증 (DoD)
- [ ] 3차 구조 anchor toBe (probe 동결값) + 2차 무회귀
- [ ] `npx tsc --noEmit` 0 / gift 전체 회귀 0 / 상속 회귀 0 (priorAggregation 공유)
- [ ] code-analyzer High/Medium 0
- [ ] 800줄 — gift-prior-aggregation.ts(189) 여유, gift-tax.ts(441) 여유

## 8. SCOPE_OUT
1. 4차+ 다중 drop-out (가장 최근 Q 근사).
2. 2-스트림(특례) 경로 marginal.
3. 구법 절대숫자 재현(3천만·10%·5년) — 현행 계산기 불필요.
4. 직전회차가 비-세대생략(donorGroup≠B)인 혼합 체인 — §58만, §57 무관(자동 처리).
