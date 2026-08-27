/**
 * 국외전출세 — 순수 엔진 (PR-4B)
 *
 * 법령: 소득세법 §118의9~§118의16 (2026.4.21. 시행)
 * 시행령: §178의8, §178의9, §178의10, §167의8
 *
 * 계산 흐름:
 *   STEP 1: §118의9 요건 확인 (거주기간 5년 이상 + 대주주)
 *   STEP 2: 종목별 출국일 시가 산정 (§178의9)
 *   STEP 3: 종목별 양도차익 (간주양도가 − 취득가)
 *   STEP 4: 합산 과세표준 (기본공제 §118의10④ 250만원)
 *   STEP 5: §118의11 → §104①11가목2) 20%/25% 산출세액
 *   STEP 6: 납부유예 §118의16 처리 (5년/10년)
 *   STEP 7: 경정청구 계산 (조정공제·외국납부세액공제·비거주자공제)
 *   STEP 8: 보유현황 미신고 가산세 §118의15
 *   STEP 9: 지방소득세 (10원 미만 절사) + 결과 조립
 *
 * 스코프 (§118의9①: §94①3가·나목 + §94①4다·라목):
 *   - §94①4다·라목 기타자산(비상장 과점주주·부동산과다보유법인)도 §118의9① 범위 포함.
 *     다·라목은 §94①4의 주식이므로 출국일 시가 × 주수 − 취득가 동일 흐름 + §118의11 동일 세율(20/25%)로 계산
 *     (별도 세율·평가 분기 불요 — 부동산과다보유 가중치는 사용자 입력 출국일 시가에 반영). [B-1②c 정정]
 * 완료(시리즈 B-1②): §118의16④ 이자상당액(PR-3)·§118의17 재입국(PR-2)
 */

import type {
  ExitTaxInput,
  ExitTaxHolding,
  ExitTaxResult,
  ExitTaxHoldingResult,
} from "./types/exit-tax.types";
import { STOCK_MAJOR_PROGRESSIVE_BRACKETS } from "./stock-rate-tables";
import { STOCK_EXIT_TAX, STOCK_EXIT_TAX_CONSTS } from "@/lib/tax-engine/legal-codes/stock";

// ============================================================
// 내부 유틸: §118의11 → §104①11가목2) 누진세율
// STOCK_MAJOR_PROGRESSIVE_BRACKETS 재사용
// ============================================================

/**
 * §118의11 → §104①11가목2) 준용 산출세액 계산
 * 3억 이하 20% / 초과 25%(누진공제 15,000,000)
 */
function applyExitTaxRate(taxBase: number): {
  rate: number;
  progressiveDeduction: number;
  tax: number;
} {
  if (taxBase <= 0) return { rate: 0, progressiveDeduction: 0, tax: 0 };

  for (const bracket of STOCK_MAJOR_PROGRESSIVE_BRACKETS) {
    const max = bracket.max ?? Infinity;
    if (taxBase <= max) {
      const rawTax = Math.floor(taxBase * bracket.rate) - bracket.deduction;
      return {
        rate: bracket.rate,
        progressiveDeduction: bracket.deduction,
        tax: Math.max(0, rawTax),
      };
    }
  }

  // 최고 구간 (25%)
  const last = STOCK_MAJOR_PROGRESSIVE_BRACKETS[STOCK_MAJOR_PROGRESSIVE_BRACKETS.length - 1];
  const rawTax = Math.floor(taxBase * last.rate) - last.deduction;
  return {
    rate: last.rate,
    progressiveDeduction: last.deduction,
    tax: Math.max(0, rawTax),
  };
}

/** 10원 미만 절사 (§47③ 준용 — 지방소득세) */
function floorTen(n: number): number {
  return Math.floor(n / 10) * 10;
}

// ============================================================
// STEP 2: 종목별 출국일 시가 산정 (§178의9)
// ============================================================

/**
 * 1종목 출국일 시가 1주당 결정 (§178의9)
 *
 * §178의9①: 출국일 당시 거래가액 원칙
 * §178의9②: 불명 시 상장→§99①3 / 비상장→매매사례→§99①4 순차
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 * 모드별 미입력은 validation에서 차단. 엔진은 0 처리하지 않고 입력값 그대로 사용.
 */
function resolveDepartureDayValuePerShare(holding: ExitTaxHolding): number {
  switch (holding.departureDayValuationMode) {
    case "market_price":
      // §178의9① 출국일 거래가액
      return holding.departureDayMarketPrice ?? 0;

    case "prior_year_std":
      // §99①3 기준시가 (상장: 1개월 종가평균)
      return holding.priorYearEndMonthAvg ?? 0;

    case "unlisted_sample":
      // §178의9②2호가목 전후 각 3개월 매매사례가액
      return holding.unlistedSamplePrice ?? 0;

    case "unlisted_std":
      // §99①4 비상장 기준시가 (매매사례 없음)
      return holding.unlistedStdPricePerShare ?? 0;

    default:
      return 0;
  }
}

// ============================================================
// STEP 3: 종목별 양도차익 계산
// ============================================================

/**
 * 1종목 결과 계산
 * holdingGain = (출국일 시가 × 주수) − (취득가액 × 주수)
 */
function calcHoldingResult(holding: ExitTaxHolding): ExitTaxHoldingResult {
  const pricePerShare = resolveDepartureDayValuePerShare(holding);
  const departureDayValue = pricePerShare * holding.shareCount;
  const acquisitionCost = holding.perShareAcquisitionPrice * holding.shareCount;
  const transferGain = departureDayValue - acquisitionCost;

  return {
    id: holding.id,
    stockName: holding.stockName,
    departureDayValue,
    departureDayValuePerShare: pricePerShare,
    acquisitionCost,
    transferGain,
    valuationMode: holding.departureDayValuationMode,
  };
}

// ============================================================
// STEP 7: 경정청구 — 조정공제·외국납부세액공제·비거주자공제
// ============================================================

/**
 * §118의12 조정공제 계산
 *
 * 실양도가액 < 출국일 시가 시:
 *   조정공제 = 산출세액 × (출국일 양도가 − 실양도가) / 출국일 양도차익
 *
 * @param incomeTax 산출세액
 * @param totalDepartureDayValue 출국일 총 간주양도가액 (전 종목 합산)
 * @param actualTransferPricePerShare 실제 양도 1주당 단가 (원화)
 * @param holdings 보유 종목 (실양도 후 전체 종목 단일 주가 적용 — v1 단순화)
 * @param totalGain 출국일 기준 양도차익 합산 (기본공제 차감 전)
 */
function calcAdjustmentDeduction(
  incomeTax: number,
  totalDepartureDayValue: number,
  actualTransferPricePerShare: number,
  holdings: ExitTaxHolding[],
  totalGain: number,
): number {
  // 실제 양도가액 합계 = actualTransferPricePerShare × 총 주수
  // (v1: 전 종목 동일 단가 적용 단순화)
  const totalShareCount = holdings.reduce((sum, h) => sum + h.shareCount, 0);
  const actualTransferValue = actualTransferPricePerShare * totalShareCount;

  // 실양도가 >= 출국일 시가 → 조정공제 없음
  if (actualTransferValue >= totalDepartureDayValue) return 0;
  // 양도차익 0 이하 → 조정공제 없음 (분모 방어)
  if (totalGain <= 0) return 0;

  // §118의12: 산출세액 × 실양도차손 / 출국일 양도차익
  const realTransferLoss = totalDepartureDayValue - actualTransferValue;
  // Math.floor 정수 연산 (§47② 준용)
  const deduction = Math.floor((incomeTax * realTransferLoss) / totalGain);

  // 조정공제는 산출세액을 초과할 수 없음
  return Math.min(deduction, incomeTax);
}

/**
 * §118의13 외국납부세액공제
 *
 * 한도 = 산출세액 − 조정공제액
 * §118의13②: 1호(외국정부 산출세액 공제 허용) 또는 2호(취득가액 출국일 시가 조정) 시 배제
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param foreignTaxPaid 외국납부세액 (원화)
 * @param exclusionReason §118의13② 배제 사유
 */
function calcForeignTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  foreignTaxPaid: number,
  exclusionReason: ExitTaxInput["foreignTaxExclusionReason"],
): number {
  // §118의13②적용 배제 → 공제 0
  if (exclusionReason !== "none") return 0;
  // 공제한도 = 산출세액 − 조정공제액
  const limit = Math.max(0, incomeTax - adjustmentDeduction);
  return Math.min(foreignTaxPaid, limit);
}

/**
 * §118의14 비거주자 세액공제
 *
 * 한도 = 산출세액 − 조정공제액
 * (§118의13과 병용 시 순서: 조정공제 → 외국납부세액공제 → 비거주자공제)
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param foreignTaxCreditApplied §118의13 외국납부세액공제액
 * @param domesticSourceTaxWithheld 원천징수액 (원화)
 */
function calcDomesticTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  foreignTaxCreditApplied: number,
  domesticSourceTaxWithheld: number,
): number {
  // 한도 = 산출세액 − 조정공제액 − 외국납부세액공제
  const limit = Math.max(0, incomeTax - adjustmentDeduction - foreignTaxCreditApplied);
  return Math.min(domesticSourceTaxWithheld, limit);
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 국외전출세 계산 (§118의9~§118의16)
 *
 * @param input ExitTaxInput — Date는 route handler에서 coerceDates 완료된 상태
 *   (holdings[] 배열 내 acquisitionDate도 map 변환 완료 전제)
 * @returns ExitTaxResult
 */
export function calculateExitTax(input: ExitTaxInput): ExitTaxResult {
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // ──────────────────────────────────────────────────────────
  // STEP 1: §118의9 요건 확인
  //   ①1호: 출국일 전 10년 중 5년 이상 국내 주소·거소
  //   ②: 직전 연도말 대주주 (§178의8 → §167의8 준용)
  // ──────────────────────────────────────────────────────────
  const residencyEligible =
    input.yearsResidentLast10 >= STOCK_EXIT_TAX_CONSTS.MIN_RESIDENT_YEARS;
  const majorShareholderEligible = input.isMajorShareholder;

  if (!residencyEligible || !majorShareholderEligible) {
    const reason = !residencyEligible
      ? `거주기간 ${input.yearsResidentLast10}년 — §118의9①1호 미충족 (출국일 전 10년 중 5년 이상 필요)`
      : `대주주 요건 미충족 — §178의8 (직전 연도말 대주주 비해당)`;

    return {
      taxCategory: "not_liable",
      isLiable: false,
      ineligibleReason: reason,
      residencyEligible,
      majorShareholderEligible,
      holdingDetails: [],
      totalTransferGain: 0,
      basicDeduction: 0,
      taxBase: 0,
      incomeTax: 0,
      localIncomeTax: 0,
      deferralYears: 0,
      deferredTaxAmount: 0,
      deferralInterestNote: "",
      warnings: [reason],
      appliedRules: [STOCK_EXIT_TAX.SECTION_118_9_ELIGIBILITY],
    };
  }

  appliedRules.push(STOCK_EXIT_TAX.SECTION_118_9_ELIGIBILITY);
  appliedRules.push(STOCK_EXIT_TAX.SECTION_178_8_MAJOR_SHAREHOLDER);

  // ──────────────────────────────────────────────────────────
  // STEP 2~3: 종목별 출국일 시가 산정 + 양도차익 계산 (§178의9)
  // ──────────────────────────────────────────────────────────
  const holdingDetails: ExitTaxHoldingResult[] = input.holdings.map((h) =>
    calcHoldingResult(h),
  );
  appliedRules.push(STOCK_EXIT_TAX.SECTION_178_9_DEPARTURE_VALUE);

  // ──────────────────────────────────────────────────────────
  // STEP 4: 합산 과세표준 (§118의10④ 기본공제 250만원)
  // ──────────────────────────────────────────────────────────
  const totalTransferGain = holdingDetails.reduce((sum, h) => sum + h.transferGain, 0);
  const totalDepartureDayValue = holdingDetails.reduce((sum, h) => sum + h.departureDayValue, 0);

  // §118의10④ 기본공제 250만원 (§103①·§118의7과 별도 그룹)
  const basicDeduction =
    totalTransferGain > 0
      ? Math.min(STOCK_EXIT_TAX_CONSTS.BASIC_DEDUCTION, totalTransferGain)
      : 0;
  appliedRules.push(STOCK_EXIT_TAX.SECTION_118_10_4_BASIC_DEDUCTION);

  const taxBase = Math.max(0, totalTransferGain - basicDeduction);

  if (totalTransferGain <= 0) {
    warnings.push(`양도차익 합산 ${totalTransferGain.toLocaleString()}원 — 과세표준 0 (양도손실 또는 차익 없음)`);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 5: §118의11 산출세액 (§104①11가목2) 20%/25%)
  // ──────────────────────────────────────────────────────────
  const { tax: incomeTax } = applyExitTaxRate(taxBase);
  appliedRules.push(STOCK_EXIT_TAX.SECTION_118_11_TAX_RATE);

  // ──────────────────────────────────────────────────────────
  // STEP 6: 납부유예 §118의16
  // ──────────────────────────────────────────────────────────
  let deferralYears = 0;
  let deferredTaxAmount = 0;
  let deferralInterest: number | undefined;
  let deferralInterestNote =
    "납부유예 이자상당액은 실제 납부 시 관할 세무서에서 별도 계산합니다 (§118의16④·시행령 §178의12③)";

  if (input.deferralRequested) {
    // 10년 연장 사유 분기 (§118의16 + 대통령령)
    deferralYears =
      input.deferralReason === "study_abroad" || input.deferralReason === "other_10yr"
        ? STOCK_EXIT_TAX_CONSTS.DEFERRAL_YEARS_EXTENDED
        : STOCK_EXIT_TAX_CONSTS.DEFERRAL_YEARS_DEFAULT;
    deferredTaxAmount = incomeTax; // 전액 유예 (§118의16①)
    appliedRules.push(STOCK_EXIT_TAX.SECTION_118_16_DEFERRAL);
    warnings.push(`납부유예 ${deferralYears}년 신청 — 납세담보 제공 또는 납세관리인 신고 필수 (§118의16①)`);
    if (deferralYears === 10) {
      warnings.push("10년 유예 사유 해당 여부는 관할 세무서 확인 필요 (§118의16 + 대통령령)");
    }

    // 이자상당액 §118의16④·시행령 §178의12③ — 일수·1일당 이자율 입력 시 산출
    // = floor(유예세액 × 일수 × 1일당 이자율). 1일당 이자율은 국기령 §43의3②(연도별 변동·사용자 입력).
    const days = input.deferralInterestDays;
    const rate = input.deferralInterestDailyRate;
    if (days != null && days > 0 && rate != null && rate > 0) {
      deferralInterest = Math.floor(deferredTaxAmount * days * rate);
      deferralInterestNote = `이자상당액 = 유예세액 ${deferredTaxAmount.toLocaleString()} × ${days}일 × ${rate} (국기령 §43의3② 1일당 이자율)`;
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 7: 경정청구 — 조정공제·외국납부세액공제·비거주자공제
  //   (납부유예 후 실양도 완료 시 또는 직접 입력 시 적용)
  // ──────────────────────────────────────────────────────────
  let adjustmentDeduction: number | undefined;
  let foreignTaxCreditApplied: number | undefined;
  let domesticTaxCreditApplied: number | undefined;
  let finalTaxAfterAdjustment: number | undefined;

  // 조정공제 §118의12: 실양도가 입력 시 계산
  const hasActualTransfer =
    input.actualTransferPricePerShare != null && input.actualTransferPricePerShare > 0;

  if (hasActualTransfer && incomeTax > 0 && totalTransferGain > 0) {
    const adj = calcAdjustmentDeduction(
      incomeTax,
      totalDepartureDayValue,
      input.actualTransferPricePerShare!,
      input.holdings,
      totalTransferGain,
    );
    adjustmentDeduction = adj;
    if (adj > 0) {
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_12_ADJUSTMENT);
    }
  } else if (hasActualTransfer) {
    // 실양도 입력은 있으나 산출세액 0 → 조정공제 해당 없음
    adjustmentDeduction = 0;
  }

  // 외국납부세액공제 §118의13
  //
  // 외화로 넣었으면 **기준환율로 환산**한다(소령 §178의5 — 수령·지출일 현재 외국환거래법
  // 기준환율 또는 재정환율). 둘 다 있어야 환산한다 — 환율만 있고 외화가 없으면 조용히 0을
  // 만들지 않고 원화 입력값을 그대로 쓴다.
  const foreignTaxPaidKrw =
    input.foreignTaxPaidForeign != null &&
    input.foreignTaxPaidForeign > 0 &&
    input.foreignTaxExchangeRate != null &&
    input.foreignTaxExchangeRate > 0
      ? Math.floor(input.foreignTaxPaidForeign * input.foreignTaxExchangeRate)
      : (input.foreignTaxPaid ?? 0);
  const hasForeignTax = foreignTaxPaidKrw > 0;
  const adjForCredit = adjustmentDeduction ?? 0;

  if (hasForeignTax && incomeTax > 0) {
    const credit = calcForeignTaxCredit(
      incomeTax,
      adjForCredit,
      foreignTaxPaidKrw,
      input.foreignTaxExclusionReason,
    );
    foreignTaxCreditApplied = credit;
    if (credit > 0) {
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_13_FOREIGN_TAX_CREDIT);
    }
    if (input.foreignTaxExclusionReason !== "none") {
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_13_2_EXCLUSION);
      warnings.push(
        input.foreignTaxExclusionReason === "credit_allowed"
          ? STOCK_EXIT_TAX.EXCLUSION_REASON_1_MESSAGE
          : STOCK_EXIT_TAX.EXCLUSION_REASON_2_MESSAGE,
      );
    }
  }

  // §118의14 비거주자 세액공제
  const hasDomesticWithheld =
    input.domesticSourceTaxWithheld != null && input.domesticSourceTaxWithheld > 0;

  if (hasDomesticWithheld && incomeTax > 0) {
    const domCredit = calcDomesticTaxCredit(
      incomeTax,
      adjForCredit,
      foreignTaxCreditApplied ?? 0,
      input.domesticSourceTaxWithheld!,
    );
    domesticTaxCreditApplied = domCredit;
    if (domCredit > 0) {
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_14_DOMESTIC_CREDIT);
    }
  }

  // 경정 후 최종 세액
  if (
    adjustmentDeduction != null ||
    foreignTaxCreditApplied != null ||
    domesticTaxCreditApplied != null
  ) {
    finalTaxAfterAdjustment = Math.max(
      0,
      incomeTax -
        (adjustmentDeduction ?? 0) -
        (foreignTaxCreditApplied ?? 0) -
        (domesticTaxCreditApplied ?? 0),
    );
  }

  // ──────────────────────────────────────────────────────────
  // STEP 8: 보유현황 미신고 가산세 §118의15
  //   = 액면금액 합계 × 2%
  // ──────────────────────────────────────────────────────────
  let holdingsReportPenalty: number | undefined;

  if (!input.hasFiledHoldingsReport) {
    appliedRules.push(STOCK_EXIT_TAX.SECTION_118_15_REPORT_PENALTY);
    warnings.push("보유현황 미신고 — §118의15 가산세 발생. 액면금액 합계 × 2% 계산.");

    if (input.totalFaceValue != null && input.totalFaceValue > 0) {
      holdingsReportPenalty = Math.floor(
        input.totalFaceValue * STOCK_EXIT_TAX_CONSTS.HOLDINGS_REPORT_PENALTY_RATE,
      );
    } else {
      warnings.push("보유현황 가산세: 액면금액 합계(totalFaceValue) 미입력 — 가산세 금액 계산 불가");
    }
  }

  // ──────────────────────────────────────────────────────────
  // STEP 9: 지방소득세 (10원 미만 절사) + 결과 조립
  // ──────────────────────────────────────────────────────────
  // 납부유예 시 지방소득세는 실제 납부 시점에 별도 계산
  // 즉시 납부 케이스: (경정 후 세액 or 산출세액) × 10%
  const taxForLocal = finalTaxAfterAdjustment ?? incomeTax;
  const localIncomeTax = floorTen(taxForLocal * 0.1);
  appliedRules.push(STOCK_EXIT_TAX.LOCAL_TAX_103_3);

  // ──────────────────────────────────────────────────────────
  // STEP 8.5: 재전입 환급 §118의17①1호 (5년 이내 미양도 재입국 거주자)
  //   납부유예 중 → 유예 세액 취소 / 납부 완료 → 환급(미신고 가산세는 환급 제외 ③)
  // ──────────────────────────────────────────────────────────
  let reentryRefund: ExitTaxResult["reentryRefund"];
  if (input.reenteredWithin5Years) {
    const isDeferralCancel = input.deferralRequested;
    const refundIncomeTax = finalTaxAfterAdjustment ?? incomeTax;
    // 취소(유예): 유예 소득세 / 환급(납부): 소득세 + 지방소득세. 미신고 가산세(§118의15④)는 §118의17③ 환급 제외.
    const amount = isDeferralCancel ? deferredTaxAmount : refundIncomeTax + localIncomeTax;
    reentryRefund = {
      isDeferralCancel,
      amount,
      note: isDeferralCancel
        ? "납부유예 중 재입국 — 유예 세액 취소 신청 (사유 발생일부터 1년 이내, §118의17①)"
        : "재입국 — 납부세액 환급 신청 (사유 발생일부터 1년 이내, §118의17①). 보유현황 미신고 가산세(§118의15④)는 환급 제외(③).",
    };
    appliedRules.push(STOCK_EXIT_TAX.SECTION_118_17_REENTRY);
  }

  return {
    taxCategory: "exit_tax",
    isLiable: true,
    residencyEligible,
    majorShareholderEligible,

    holdingDetails,

    totalTransferGain,
    basicDeduction,
    taxBase,

    incomeTax,
    localIncomeTax,

    deferralYears,
    deferredTaxAmount,
    deferralInterestNote,
    deferralInterest,

    adjustmentDeduction,
    foreignTaxCreditApplied,
    // 공제에 실제로 쓰인 원화 금액 — 화면이 「외화 × 환율」 산식을 보일 수 있게 echo
    ...(foreignTaxPaidKrw > 0 ? { foreignTaxPaidKrw } : {}),
    domesticTaxCreditApplied,
    finalTaxAfterAdjustment,

    holdingsReportPenalty,

    reentryRefund,

    warnings,
    appliedRules,
  };
}
