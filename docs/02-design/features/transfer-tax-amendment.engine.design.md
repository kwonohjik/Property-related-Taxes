# 양도소득세 수정신고(경정) — 엔진 설계

> 계획서: `docs/00-pm/transfer-tax-amendment.plan.md`. UI: `transfer-tax-amendment.ui.design.md`.
> 범위: **양도소득세 단건(single)만**. 모든 인용은 KoreanLaw 본문 검증(추정 금지).

## Context

당초 신고를 마친 양도건의 양도가액·취득가액·필요경비가 사후 변동(대표: 수용 후 증액보상금)될 때, **당초 양도연도 귀속으로 수정신고**한다. 계산기는 당초 양도일·세율·감면을 그대로 두고 양도가액만 바꿔 재계산 → **당초 납부세액 차감 → 추가 납부세액** 산출. 신고불성실·납부지연 가산세는 선택(국세기본법 §48②·§48①2호). 기존엔 수정신고 전용 경로 부재(가산세 스텝의 당초세액 차감이 과소신고에 결합돼 있어 부적합).

---

## ★ 케이스 인벤토리 (행=anchor 테스트 약속)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 추가납부만(가산세 OFF) | 국세기본법 §45 | 당초30M/수정50M→delta20M | `transfer/amendment.test.ts` A1 | ☐ TODO |
| 2 | + 신고불성실 ON(normal, exempt) | 국기 §47의3 | 20M×10%=2M | A2 | ☐ TODO |
| 3 | + 납부지연 ON | 국기 §47의4 | 20M×경과일×0.022% | A3 | ☐ TODO |
| 4 | 수정<당초 (경정청구 영역) | — | delta=0 음수가드 | A4 | ☐ TODO |
| 5 | 통합 파이프라인 | — | `calculateTransferTax` totalPayable | A5 | ☐ TODO |
| 6 | §48② 자동감면 (3~6개월 50%) | 국기 §48②1호다 | 2M×0.5=1M | A6 | ☐ TODO |
| 6b | §48② 경계값 (1·3·6·12·18·24개월) | 국기 §48②1호가~바 | 브래킷 경계 | A6-b | ☐ TODO |
| 7 | §48② 납부지연 **미적용** 회귀 | 국기 §48②1호(§47의3 한정) | 납부지연=A3 불변 | A7 | ☐ TODO |
| 8 | 경정예고 후 → 감면율 0 | 국기 §48②1호 본문 단서 | 신고불성실=2M | A8 | ☐ TODO |
| 9 | 저장소 당초 미소실 | (구현) | 당초·수정 2 record 유지 | `storage/amendment-dedup.test.ts` A9 | ☐ TODO |

**규칙**: 행≥1 없으면 Do 금지. Phase 0에서 A1·A2 우선 작성·실행(실패 확보).

---

## 법령 근거 (KoreanLaw 본문 검증 — 시행 20260701)

```
소득세법 §110① (검증): 확정신고 = 과세기간 다음 연도 5.1~5.31.
  → 법정신고기한 = (양도연도+1)-05-31. §110① 단서=토지거래허가일 기준(예외).
  → §110④ 예정신고-only 확정신고 미이행은 상이 → scope 밖.
국세기본법 §47의3: 과소신고가산세 (일반 10%, 부정 40%, 역외 60%).
국세기본법 §47의4: 납부지연가산세 (미납액 × 경과일 × 일 이자율, 현행 0.022%).
국세기본법 §48②1호 (검증): 법정신고기한 후 수정신고 시 §47의3 가산세 감면.
  가.1개월 90 / 나.3개월 75 / 다.6개월 50 / 라.1년 30 / 마.1년6개월 20 / 바.2년 10 (% ). 2년초과 0.
  ★ "제47조의3에 따른 가산세만 해당" → 납부지연(§47의4) 감면 절대 미적용.
  ★ "경정할 것을 미리 알고 제출한 경우 제외" → priorAssessmentNotified=true면 감면율 0.
국세기본법 §48①2호: 정당한 사유 → 가산세 전액 면제(증액보상금 exempt 옵션 근거).
```

`legal-codes/common.ts` 신규 상수:
```ts
export const AMENDMENT_REDUCTION_48_2 = [
  { maxMonths: 1, rate: 0.90 }, { maxMonths: 3, rate: 0.75 }, { maxMonths: 6, rate: 0.50 },
  { maxMonths: 12, rate: 0.30 }, { maxMonths: 18, rate: 0.20 }, { maxMonths: 24, rate: 0.10 },
] as const; // 초과 0
export const AMENDMENT_48_2 = "국세기본법 §48②1호";
```

---

## 엔진 input 타입 (`types/transfer.types.ts` — `TransferTaxInput` 확장)

```ts
amendment?: {
  originalDeterminedTax: number;         // 당초 결정세액(=당초 납부 본세)
  applyUnderReportingPenalty: boolean;   // 신고불성실(§47의3)
  underReportingReason: PenaltyReason;   // "normal"|"fraudulent"|"offshore_fraud"
  underReductionMode: "exempt" | "auto_48_2";
  statutoryFilingDeadline?: Date;        // auto_48_2·납부지연 기산점 (date-coerce)
  amendedFilingDate?: Date;              // auto_48_2 경과기간 종점
  priorAssessmentNotified?: boolean;     // §48② 배제
  applyLatePaymentPenalty: boolean;      // 납부지연(§47의4) — §48② 감면 대상 아님
  amendedPaymentDate?: Date;             // 납부지연 경과일 종점
};
```
> Date 필드는 라우트에서 `toDate`/`toOptionalDate`(`lib/api/date-coerce.ts`) 변환 약속.

## 엔진 result 타입 (`types/transfer-result.types.ts` — `TransferTaxResult` 확장)

```ts
amendmentDetail?: {
  originalDeterminedTax: number;
  amendedDeterminedTax: number;      // = determinedTax
  additionalTax: number;             // max(0, 수정−당초)
  underReportingReductionRate: number; // 적용 감면율(0~0.9) — 결과 산식 표기용
  underReportingPenalty: number;
  latePaymentPenalty: number;
  additionalLocalIncomeTax: number;  // 참고(지자체 별도)
  totalPayable: number;
  steps: CalculationStep[];
};
```
> **[정책 feedback_engine_result_map_json_loss]** steps 외 필드는 **Record/원시값** 로 정의(Map 금지 — JSON 소실). `underReportingReductionRate`를 결과에 노출해 UI 산식이 엔진 단일진실 추종(dual-truth 회피).

---

## 계산 알고리즘

### resolveAmendmentReductionRate(deadline, filingDate, notified) → number
> import: `import { addMonths, isAfter } from "date-fns"`.
1. `notified === true` → **0** 반환(경정예고 배제 — §48②1호 본문 단서).
2. `deadline`·`filingDate` 중 하나라도 없으면 0(감면 산정 불가 — validate에서 사전 차단).
3. **[E1 정정 — 날짜 비교]** "법정신고기한 후 N개월 이내" = `filingDate <= addMonths(deadline, N)`. 순차 판정:
   ```ts
   for (const { maxMonths, rate } of AMENDMENT_REDUCTION_48_2)
     if (!isAfter(filingDate, addMonths(deadline, maxMonths))) return rate; // filingDate <= 기한+N개월
   return 0; // 2년 초과
   ```
   - `filingDate <= deadline`(기한 내·이전)여도 최초 구간(1개월) 매칭 → 90%. 실무상 수정신고는 기한 후지만 방어적.
   - **왜 숫자 브래킷 금지**: `differenceInCalendarMonths`는 일(day)을 버려 "1개월 5일 경과"를 1로 계산 → "이내" 오판정(기한 05-15→신고 06-20이 90%로 잘못). `addMonths` 날짜 비교가 세법 "이내" 정확.
   - anchor A6-b: 각 경계 **직전/직후 1일**(예: 기한+3개월 당일=75%, +1일=50%)로 고정.

### computeAmendment(input.amendment, determinedTax) → AmendmentDetail
```
additionalTax = max(0, determinedTax − originalDeterminedTax)          // 음수가드=경정청구
// 신고불성실 (§47의3)
grossUnder = applyUnderReportingPenalty
  ? calculateFilingPenalty({ determinedTax: additionalTax, originalFiledTax:0, reductionAmount:0,
      priorPaidTax:0, excessRefundAmount:0, interestSurcharge:0,
      filingType:"under", penaltyReason: underReportingReason }).filingPenalty   // = additionalTax × 10/40/60%
  : 0
reductionRate = (applyUnderReportingPenalty && underReductionMode==="auto_48_2")
  ? resolveAmendmentReductionRate(statutoryFilingDeadline, amendedFilingDate, priorAssessmentNotified) : 0
underReportingPenalty = truncateToWon(grossUnder × (1 − reductionRate))
// 납부지연 (§47의4) — §48② 감면 미적용(reductionRate 곱하지 않음)
latePaymentPenalty = applyLatePaymentPenalty
  ? calculateDelayedPaymentPenalty({ unpaidTax: additionalTax,
      paymentDeadline: statutoryFilingDeadline, actualPaymentDate: amendedPaymentDate }).delayedPaymentPenalty
  : 0
additionalLocalIncomeTax = applyRate(additionalTax, 0.1)               // [E4] 참고 근사(지자체 별도 신고). 엄밀=floor(수정det×.1)−floor(당초det×.1)이나 참고표시라 delta×10% 채택
totalPayable = additionalTax + underReportingPenalty + latePaymentPenalty
```

### 오케스트레이터 통합 — `transfer-tax-finalize.ts` STEP 12.5 (끝 append)
- **[E2 정정]** STEP 11 총납부세액 이후 **끝에 append**(CLAUDE.md "가능한 끝에 appended step"). `determinedTax`(line 308)는 이미 확보돼 있어 사용 가능. `input.amendment` 있으면 `computeAmendment(input.amendment, determinedTax)` → `amendmentDetail` 첨부 + amendment steps push.
- **2-pass 불필요**: 당초세액은 입력값, 수정결정세액은 이번 run. 라우트 penalty 2-pass(`route.ts:757`) **미진입**(amendment ↔ filingPenaltyDetails 상호배타).
- 기존 `determinedTax`·`totalTax`(전체 수정세액)는 유지(참고). headline 전환은 UI 책임.
- 별도 파일 `lib/tax-engine/transfer-tax-amendment.ts`(순수 함수, 800줄 정책). finalize에서 1줄 호출.
- **[E3 전제]** §48②는 "법정신고기한까지 제출한 자"(당초 **기한 내 확정신고**) 전제. 불러온 당초 record가 정상 확정신고 가정. 당초 무신고(§48②2호 기한후신고 영역)는 scope 밖 — UI 안내만.

#### ⚠️ [E6 — High] finalize→result 명시 plumbing 4-지점 (침묵 strip 방지)
`transfer-tax.ts:705~732`는 finalize 반환을 **명시 구조분해**하고 `733`에서 **명시 재조립**(spread 아님) → 신규 필드는 TS가 못 잡고 침묵 drop. `amendmentDetail`을 **전부** 추가:
1. `FinalizeResult` 인터페이스(`transfer-tax-finalize.ts:70`)에 `amendmentDetail?`.
2. finalize 함수가 return 객체(`:368~402`)에 `amendmentDetail` 포함.
3. `transfer-tax.ts:705` 구조분해 목록에 `amendmentDetail` 추가.
4. `transfer-tax.ts:733` return 객체에 `amendmentDetail` 추가.
5. `TransferTaxResult`(`types/transfer-result.types.ts`)에 `amendmentDetail?`.
> 정책 `feedback_explicit_prop_mapping_strip`. Do 완료 점검서 이 5지점 grep 필수.

- **[E7]** exempt(`transfer-tax.ts:282`)·loss(`:411`) **조기반환은 finalize 미경유** → `amendmentDetail` 없음. 수정 후 exempt/loss = **경정청구 영역**(additionalTax=0)이라 MVP 허용(추가납부 0). 필요 시 조기반환에도 computeAmendment 호출은 후속.

---

## 정수 연산

- `additionalTax`·penalty 전부 `truncateToWon`. 율 적용 `applyRate`(floor). §48② `× (1−rate)`도 `truncateToWon`.
- `Math.round` 금지. 감면율은 상수 배열(부동소수 누적 없음).

---

## Silent fallback / 자동 안분 후보 식별

- `statutoryFilingDeadline` 자동도출 = **명시 도출**(양도일→다음해 5.31)이며 자동 안분 아님. **useEffect→store 미러링 금지**(hydration 1회 or useMemo display fallback + validate 동일). 정책 `mirror-pattern`·`feedback_useeffect_store_mirror_forbidden`.
- `originalDeterminedTax` prefill = hydration 1회. 미입력(0)이면 delta 과대 → **validate에서 amendmentMode 시 >0 필수 차단**.
- `auto_48_2` + 날짜 미입력 → validate 차단(silent 0 감면 금지). 납부지연 ON + 날짜 미입력 동일.
- 자동 안분 fallback 없음(`feedback_no_silent_apportion_fallback`).

---

## 테스트 약속

- 케이스 인벤토리 9행 → anchor A1~A9. Phase 0에서 A1·A2 우선(실패 확보 후 결과 타입 동결).
- A7(§48② 납부지연 미적용)·A8(경정예고 배제)는 **과다감면 회귀 방지** 필수.
- 금액 원단위 `toBe()`(`feedback_pdf_example_test_anchoring`).

---

## UI 통합 위임

- UI 명세: `transfer-tax-amendment.ui.design.md`.
- 14 동기화 지점 + 저장소 ⓢ1~3은 계획서 §5·§5.1. 엔진은 input/result 타입·`computeAmendment`·`resolveAmendmentReductionRate`·legal-codes 상수만 책임.
