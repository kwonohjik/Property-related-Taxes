/**
 * P3 하이브리드 감면 — 조특법 §98의5 (2026-06-12)
 *
 * - §98의5: 2010.2.11 현재 수도권 밖 미분양 — ~2011.4.30 최초 매매계약. 감면율 = 분양가 인하율별
 *   (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호). 위임령 = 조번호 어긋난 령 §98의4 (원문 확정).
 *   농특세 비과세.
 *
 * `unsold-hybrid-p3.ts`(747줄)에서 조문별로 분리 (동작 변경 없음 — 순수 이동). §98의5 상수·
 * `Unsold985Input`·`resolve985Rate`·`evaluateUnsold985`가 여기 있고, `unsold-hybrid-p3.ts`가 같은 이름으로 재수출한다.
 *
 * 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 * suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 * 특칙 대상 ID 목록(RATE_SPECIAL_REDUCTION_IDS)과 통합 dispatcher(evaluateAnyHybridFromReduction ·
 * evaluateAnyHybridTaxAmount)는 `unsold-hybrid-p3.ts`에 남아 있다.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { computeHybridEffect } from "./unsold-hybrid";
import { ineligibleHybrid } from "./unsold-hybrid";
import type { UnsoldHybridIneligibleReason } from "./unsold-hybrid";
import type { UnsoldHybridResult } from "./unsold-hybrid";
import { UNSOLD_98_5_CONTRACT_FROM } from "./unsold-98-period-gates";

// UTC 자정 파싱 (T suffix 금지)
export const UNSOLD_98_5_CONTRACT_TO = new Date("2011-04-30");
/** 시작 경계 — 법률 제10285호 부칙 제2조(2010.5.14. 이후 최초 계약). 상수 정본은 `unsold-98-period-gates.ts`(US-05·US-57) */
export { UNSOLD_98_5_CONTRACT_FROM };

// ─────────────────────────────────────────────────────────────────
// §98의5
// ─────────────────────────────────────────────────────────────────

export interface Unsold985Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 최초 매매계약일 (~2011.4.30 + 계약금) */
  contractDate?: Date;
  /** 분양가격 인하율 (%) — (최초 공시 분양가 − 매매가) ÷ 최초 공시 분양가 × 100 */
  priceReductionRatePct?: number;
  /** 2010.2.11 현재 수도권 밖 미분양 확인 (령 §98의4①) */
  isNonCapitalUnsoldAtCutoff?: boolean;
  /** 사업주체등과 최초 매매계약 */
  isFirstContract?: boolean;
  /** 매매계약일 현재 입주사실 없음 (령②1호) */
  isNotOccupiedAtContract?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령②2·3호) */
  isNotRecontract?: boolean;
  /** 거주자 또는 국내사업장 없는 비거주자(법 ① — US-42). false면 적용 주체 아님. 미제공은 true(D11-05와 같은 기본값) */
  isEligibleSubject?: boolean;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

/** 법 §98의5①각호 — 인하율별 감면율 (≤10% 60% / ≤20% 80% / >20% 100%) */
export function resolve985Rate(priceReductionRatePct: number): number {
  if (priceReductionRatePct <= 10) return 0.6;
  if (priceReductionRatePct <= 20) return 0.8;
  return 1.0;
}

export function evaluateUnsold985(input: Unsold985Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_5;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  if (input.isEligibleSubject === false) {
    reasons.push({
      code: "NOT_ELIGIBLE_SUBJECT",
      message: "국내사업장이 있는 비거주자는 적용되지 않습니다 — 적용 주체는 거주자 또는 「소득세법」 제120조에 따른 국내사업장이 없는 비거주자입니다 (법 §98의5①).",
      legalBasis,
    });
  }
  /**
   * D5-02 — 인하율 **0%도 감면 대상**이다.
   *
   * 조특법 §98의5① 각 호(법제처 `target=eflaw` 실측 2026-08-31):
   *   1. 분양가격 인하율이 100분의 10 **이하**인 경우: 100분의 60
   *   2. 100분의 10을 초과하고 100분의 20 이하: 100분의 80
   *   3. 100분의 20을 초과: 100분의 100
   *
   * 🔴 1호에 **하한 문언이 없다**. 종전에는 `> 0`을 요구해 0%를 「미입력」으로 차단했고,
   *    정가 매입(인하 없음) 사안이 감면을 전혀 못 받았다 — **납세자 불리**.
   *    조특령 §98의4④의 산정식
   *    「(입주자 모집공고안에 공시된 분양가격 − 매매계약서상의 매매가격) ÷ 공시 분양가격 × 100」도
   *    정가 매입 시 값이 정확히 0이 된다.
   *
   * ⇒ 판정 기준을 「값이 있는가」로 바꾼다(0은 유효한 값). 음수는 조문에 없는 구간이라
   *   별도 사유로 막는다.
   */
  const hasRate = input.priceReductionRatePct !== undefined;
  const rate = hasRate ? resolve985Rate(input.priceReductionRatePct!) : 0.6;

  if (!input.contractDate) {
    reasons.push({
      code: "MISSING_CONTRACT_DATE",
      message: "최초 매매계약일이 입력되지 않았습니다 (2011.4.30까지 — 2010.2.11 현재 미분양 주택).",
      legalBasis,
    });
  } else if (
    input.contractDate.getTime() < UNSOLD_98_5_CONTRACT_FROM.getTime() ||
    input.contractDate.getTime() > UNSOLD_98_5_CONTRACT_TO.getTime()
  ) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "최초 매매계약일이 적용기간(2010.5.14.~2011.4.30. 최초 계약 — 2010.2.11 현재 미분양) 외입니다 (법 §98의5①, 법률 제10285호 부칙 제2조).",
      legalBasis,
    });
  }
  if (!hasRate) {
    reasons.push({
      code: "MISSING_PRICE_REDUCTION_RATE",
      message: "분양가격 인하율(%)이 입력되지 않았습니다 — (최초 입주자 모집공고 분양가 − 실제 매매가) ÷ 최초 분양가 × 100 (법 §98의5①각호 감면율 산정). 인하가 없으면 0을 입력하세요.",
      legalBasis: "조특령 §98의4④",
    });
  } else if (input.priceReductionRatePct! < 0) {
    // 조문의 구간은 「10 이하 / 10 초과 20 이하 / 20 초과」로 음수 구간이 없다.
    // 매매가가 공시 분양가를 넘은 경우이므로 인하율이 아니라 입력 오류로 본다.
    reasons.push({
      code: "NEGATIVE_PRICE_REDUCTION_RATE",
      message: "분양가격 인하율은 음수일 수 없습니다 (조특령 §98의4④ 산정식).",
      legalBasis: "조특령 §98의4④",
    });
  }
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의5①).",
      legalBasis,
    });
  }
  if (input.isNonCapitalUnsoldAtCutoff !== true) {
    reasons.push({
      code: "NOT_NONCAPITAL_UNSOLD",
      message: "2010.2.11 현재 수도권 밖의 지역에 있는 미분양주택(입주자 계약일 경과 단지 선착순 공급 등) 요건이 확인되지 않았습니다 (법 §98의5① · 령 §98의4①).",
      legalBasis: "조특령 §98의4①",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결하고 계약금을 납부한 요건이 확인되지 않았습니다 (법 §98의5①).",
      legalBasis,
    });
  }
  if (input.isNotOccupiedAtContract !== true) {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message: "매매계약일 현재 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의4②1호).",
      legalBasis: "조특령 §98의4②1호",
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의4②2·3호).",
      legalBasis: "조특령 §98의4②2·3호",
    });
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_5", reasons, legalBasis, rate, true);

  return computeHybridEffect({
    id: "unsold_98_5",
    legalBasis,
    articleLabel: `조특법 §98의5① (분양가 인하율 ${input.priceReductionRatePct}% → 감면율 ${Math.round(rate * 100)}%)`,
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의4③",
    rate,
    ruralSurtaxExempt: true, // 농특세령 §4⑦1호
  });
}
