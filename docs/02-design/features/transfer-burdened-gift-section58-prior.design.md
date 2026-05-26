# 부담부증여 §58 사전증여 기납부세액공제 안분 (PR3) — 설계

> 상위 계획: `docs/00-pm/inheritance-remaining-credit-deduction-gaps.plan.md` §1 (그룹 ①, 권장 PR 3순위)
> 단계: Design · 도메인: 양도소득세(부담부증여) → 증여세 §47②·§58
> KoreanLaw 검증: 상증법 §58②(한도식 §47② 합산과세표준 기준) 전문 대조 완료 (계획서 §7-2)

## Context

부담부증여 무상이전분 증여세는 `calcGiftTax`(메인 엔진)로 산출되며, 메인 엔진은 `priorGiftsWithin10Years`를 `aggregatePriorGiftsForGift`로 집계해 §58 Phase A 안분을 적용한다(gift-tax.ts:99·188~190).

**갭**: 집계 함수는 `matched[0].computedTax`(당시 산출세액)·`giftTaxBase`(당시 과세표준)로 한도를 산출하는데(gift-prior-aggregation.ts:137~138), `BurdenedGiftInfo.priorGiftsWithin10Years` 항목 타입(transfer-burdened-gift.types.ts:90)에 두 필드가 **없어** burdened map(burdened-gift-apportionment.ts:317)이 전달하지 못한다 → `priorAggregation.totalComputedTax=0`·`priorAddedTaxBase=0` → `usePhaseAFormula=false` → §58 미적용. `priorGiftTaxPaid`도 미전달이라 legacy fallback도 없음 → **§58 기납부세액공제 완전 누락(0)**.

동시에 §47② 합산(누진세율 상승)은 적용되므로 사전증여분이 **이중과세**된다.

**대비 — 메인 증여세 경로는 정상**: case-1-redonation-spouse.test.ts:87~88이 `priorGiftsWithin10Years`에 `computedTax`·`giftTaxBase`를 채워 전달 → Phase A 작동. burdened만 타입 누락.

## ★ 케이스 인벤토리

| # | 케이스 | priorGifts 입력 | 기대 §58 동작 |
|---|---|---|---|
| BG58-1 | 부담부증여, 사전증여 없음 | `[]` | priorAggregation 0, §58 미적용 (회귀 — 기존 P3-1~4 불변) |
| BG58-2 | 부담부증여 + 사전증여(computedTax·giftTaxBase 입력) | 1건 | §47② 합산 + **§58 안분 한도 = floor(금번 산출세액 × 직전 giftTaxBase / 합산 과세표준), 공제 = Min(직전 computedTax, 한도)** |
| BG58-3 | 사전증여 입력하나 computedTax 미입력(legacy 데이터) | computedTax undefined | priorAggregation.totalComputedTax=0 → §58 미적용. **validation 경고** (사전증여 입력 시 산출세액·과세표준 필수) |
| BG58-4 | 다른 증여자 그룹 사전증여 | donor 불일치 | §47 합산 제외(기존 isSameDonorGroup) — §58도 미적용 |

> BG58-2가 핵심 fix. BG58-3은 §47② 합산만 되고 §58 누락되는 현 버그를 validation으로 차단(부분입력 방지).

## §58 메커니즘 (구현 정확성 — 자가검토 I-2)

calcGiftTaxCredits Phase A (inheritance-gift-tax-credit.ts:334~337):
```
한도 = floor(금번 산출세액 × 직전 giftTaxBase / 합산 과세표준)
§58 공제 = Min(직전 computedTax(산출세액), 한도)
```
→ **§58 공제 대상 = 직전 증여 "산출세액"(`computedTax`)**, 기존 UI의 `giftTaxPaid`(실납부액)가 아니다. 상증법 §58① "납부하였거나 납부할 증여세액(증여 당시의 해당 증여재산에 대한 증여세**산출세액**)" 문언과 일치. → **`computedTax` 입력이 §58 작동의 필수 키**. `giftTaxPaid`는 §47② 합산 표시·`totalTaxPaid`용으로만 유지(기존 호환).

## 엔진 변경

1. `types/transfer-burdened-gift.types.ts:90` `priorGiftsWithin10Years` 항목에 추가:
   ```ts
   /** 당시 증여세 산출세액 (§58 한도 분자·기납부세액공제 대상). Phase A 안분 필수 */
   computedTax?: number;
   /** 당시 증여세 과세표준 (§58 한도 분자). Phase A 안분 필수 */
   giftTaxBase?: number;
   ```
2. `burdened-gift-apportionment.ts:317` map에 `computedTax: p.computedTax`·`giftTaxBase: p.giftTaxBase` 전달. (PriorGift 타입은 이미 두 필드 optional 보유 — gift 엔진 공유.)
3. 주석(line 324·326~327) "legacy priorGiftTaxPaid fallback" → "computedTax·giftTaxBase 전달로 Phase A 적용" 정정.

## anchor

- BG58-1 (회귀): 부담부증여 사전증여 없음 → 기존 P3-1~4 finalTax 불변.
- BG58-2: 부담부증여 + 사전증여(computedTax·giftTaxBase 입력) → §58 안분 한도 적용 + priorPaidCredit > 0. PDF/손계산 anchor.
- BG58-2b: 동일 시나리오에서 §58 적용 후 `결정세액 = 산출세액 − priorPaidCredit − filingCredit` 자기일관성.
- (Pre-Do) 수정 전: 사전증여 있어도 priorPaidCredit=0 실증 → 수정 후 > 0.

## 동기화 지점 (양도세 14지점 — priorGiftsWithin10Years 2필드 추가)

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ① | 폼 상태 | BurdenedGift 폼 priorGifts 항목 | computedTax·giftTaxBase 2필드 |
| ②③ | initial·normalize | 동상 | optional (빈값 허용) |
| ④ | API 변환 | `lib/calc/transfer-tax-api-burdened-gift.ts:84` | 2필드 전달 |
| ⑤ | UI 위젯 | `components/calc/transfer/BurdenedGiftPriorGiftsBlock.tsx` | 산출세액·과세표준 CurrencyInput 2개 |
| ⑦ | 결과 카드 | `BurdenedGiftDetailCard` (해당 시 §58 산식 노출) | 선택 |
| ⑧ | validation | `lib/calc/transfer-tax-validate*.ts` | 사전증여 입력 시 computedTax·giftTaxBase 필수(BG58-3 부분입력 차단) |
| ⑫ | Zod | `lib/api/transfer-tax-burdened-gift-schema.ts:56` | 2필드 optional |
| ⑬⑭ | body spread·route | transfer route handler | priorGifts 객체 통째 전달 경로 확인(침묵 strip 점검) |

⚠️ **⑫⑬⑭ 필수**: 2필드가 Zod·body·route에서 strip되지 않는지 grep 자가점검 ([[feedback_explicit_prop_mapping_strip]]). priorGifts는 배열 객체라 항목 필드 누락이 TS 미감지.

## Silent fallback 식별

- BG58-3(computedTax 미입력)에서 자동 추정 **금지**. 사전증여 입력 시 산출세액·과세표준 명시 입력 강제(validation). 미입력 시 §58 미적용이 아니라 **검증 오류로 차단** ([[feedback_no_silent_apportion_fallback]]).

## 범위 외

- 양친(부/모) 구분, 세대생략 사전증여 할증 — 별도.
