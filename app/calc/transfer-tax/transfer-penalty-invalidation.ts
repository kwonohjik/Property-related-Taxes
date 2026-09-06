/**
 * 가산세 파생값 무효화 판정 — `TransferTaxCalculator`에서 분리 (800줄 정책, 2026-09-06).
 *
 * ## 왜 필요한가
 *
 * 「가산세 계산하기」가 채우는 `calcDeterminedTax`(결정세액)는 종전에 **어디서도 비워지지
 * 않았다** — `handleReset`조차 `penaltyResult`만 비웠다. 그래서
 *   ① 가산세 계산 → 앞 단계로 돌아가 양도가액·필요경비 수정 → 기납부세액 입력, 또는
 *   ② 「초기화」 후 완전히 새 건을 입력 → 기납부세액 입력
 * 하면 `Step6`의 `handlePriorPaidChange`가 **옛 계산의 결정세액**으로
 * `unpaidTax = max(0, 결정세액 − 기납부세액)`을 자동 기입했다.
 *
 * 그 값은 표시용이 아니다 — `lib/calc/transfer-tax-api-body-blocks.ts:164`가
 * `delayedPaymentDetails.unpaidTax`로 **엔진에 그대로 보낸다** ⇒ 지연납부가산세가 틀린
 * 금액으로 산출되고 화면에는 아무 경고도 없다.
 *
 * (memory `feedback_store_update_must_invalidate_result`)
 */

/**
 * 가산세 산정에만 쓰이는 필드 — 이것만 바뀌면 **결정세액은 그대로**다.
 *
 * 목록 출처: `steps/Step6.tsx`(가산세 입력)와 `components/calc/transfer/AmendmentBlock.tsx`
 * (수정신고·경정청구)가 `onChange`로 쓰는 키 전수.
 *
 * ⚠️ 여기 **없는** 키는 전부 「결정세액에 영향 있음」으로 본다 — 자산·감면·보유상황은 물론
 *    앞으로 추가될 필드까지 안전측으로 걸린다. 목록을 **넓히는** 변경은 결정세액이 정말
 *    그 필드와 무관한지 확인하고 할 것(좁히는 방향은 언제나 안전하다).
 */
export const PENALTY_ONLY_KEYS: ReadonlySet<string> = new Set([
  // Step6 — 가산세 입력
  "enablePenalty",
  "priorPaidTax",
  "unpaidTax",
  "filingType",
  "penaltyReason",
  "lateFilingNotified",
  "originalFiledTax",
  "excessRefundAmount",
  "fraudulentPortion",
  "interestSurcharge",
  "paymentDeadline",
  "actualPaymentDate",
  // AmendmentBlock — 수정신고·경정청구
  "amendmentMode",
  "originalDeterminedTax",
  "claimReasonType",
  "statutoryFilingDeadline",
  "posteriorEventDate",
  "amendedFilingDate",
  "originalPaymentDate",
  "applyUnderReportingPenalty",
  "underReportingReason",
  "underReductionMode",
  "priorAssessmentNotified",
  "applyLatePaymentPenalty",
  "amendedPaymentDate",
]);

/**
 * 이 패치가 **결정세액을 낡게 만드는가**.
 *
 * 빈 패치는 아무것도 바꾸지 않으므로 `false`(무효화하지 않는다).
 */
export function patchInvalidatesDeterminedTax(patch: object): boolean {
  return Object.keys(patch).some((k) => !PENALTY_ONLY_KEYS.has(k));
}
