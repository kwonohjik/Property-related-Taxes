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
 *   조정공제 = [출국일 양도가 − 실양도가] × §118의11에 따른 세율
 *            = 출국일 기준 산출세액 − 실양도가 기준 산출세액   (아래 본문 주석 참조)
 *
 * @param taxBase 출국일 기준 양도소득과세표준 (§118의10④ 기본공제 차감 후)
 * @param incomeTax 산출세액
 * @param totalDepartureDayValue 출국일 총 간주양도가액 (전 종목 합산)
 * @param actualTransferPricePerShare 실제 양도 1주당 단가 (원화)
 * @param holdings 보유 종목 (실양도 후 전체 종목 단일 주가 적용 — v1 단순화)
 */
function calcAdjustmentDeduction(
  taxBase: number,
  incomeTax: number,
  totalDepartureDayValue: number,
  actualTransferPricePerShare: number,
  holdings: ExitTaxHolding[],
): number {
  // 실제 양도가액 합계 = actualTransferPricePerShare × 총 주수
  // (v1: 전 종목 동일 단가 적용 단순화)
  const totalShareCount = holdings.reduce((sum, h) => sum + h.shareCount, 0);
  const actualTransferValue = actualTransferPricePerShare * totalShareCount;

  // 실양도가 >= 출국일 시가 → 조정공제 없음 (§118의12① 「낮은 때」 요건)
  if (actualTransferValue >= totalDepartureDayValue) return 0;
  if (taxBase <= 0) return 0;

  /**
   * §118의12①: [출국일 양도가액 − 실제 양도가액] × **§118의11에 따른 세율**
   *
   * §118의11의 세율은 스칼라가 아니라 **누진표**다(3억 이하 20% / 초과 6천만원 + 초과액 25%).
   * 그러므로 차액이 실제로 얹혀 있는 위치에, 걸친 구간마다 그 구간의 세율로 적용해야 한다.
   * 그것이 곧 **「출국일 기준 산출세액 − 실제 양도가액 기준 산출세액」**이다 —
   * 취득가액과 §118의10④ 기본공제가 두 계산에 똑같이 들어 있어 상쇄되므로,
   * 과세표준의 차이는 곧 양도가액의 차이(= 조문의 대괄호 항)와 같다.
   *
   * ⚠️ **「차액 × 단일 한계세율」로 축약하면 안 된다.** 두 과세표준이 같은 구간에 있을 때만
   *    같은 값이 되고, 구간을 걸치면 차액의 아랫부분에 20%가 적용되므로 25%를 통으로 곱한
   *    값이 과다해진다(취득 5억·출국 10억·실제 7억 → 정답 69,875,000 vs 통곱 75,000,000).
   *    아래 한 줄이 두 경우를 모두 처리한다.
   */
  const priceDrop = totalDepartureDayValue - actualTransferValue;
  const reducedTaxBase = Math.max(0, taxBase - priceDrop);
  const deduction = incomeTax - applyExitTaxRate(reducedTaxBase).tax;

  // 조정공제는 산출세액을 초과할 수 없다 (실양도가가 취득가 아래로 내려간 경우)
  return Math.min(Math.max(0, deduction), incomeTax);
}

/**
 * §118의13① 외국납부세액공제
 *
 * 🔴 2026-08-28 정정(리뷰 #9 — **세액 변경**) — 종전에는 **한도만** 구현하고 계산식(안분 비율)이
 * 통째로 빠져 있었다. 시그니처에 양도가액·필요경비 인자 자체가 없어 비율을 계산할 수 없었다.
 *
 * 법문(소득세법 lawId 001565, 시행 2026-07-01 본):
 *   「… 산출세액에서 조정공제액을 공제한 금액을 **한도로** 다음의 계산식에 따라 계산한
 *    외국납부세액을 산출세액에서 공제한다.
 *    해당 자산의 양도소득에 대하여 외국정부에 납부한 세액
 *      × [제118조의10제1항에 따른 양도가액(제118조의12제1항에 해당하는 경우에는 **실제 양도가액**)
 *         − 제118조의10제2항에 따른 필요경비]
 *      ÷ (실제 양도가액 − 제118조의10제2항에 따른 필요경비)」
 *   ⇒ 「한도」와 「계산식」은 **별개 요건**이다.
 *
 * 🔑 조정공제가 발동하는 구간(실양도 < 출국일 시가 = §118의12① 해당)은 분자도 실제 양도가액이
 *    되어 **분자 = 분모**라 비율이 1이다. 결함이 실제로 세액을 움직이는 구간은
 *    **「실양도 > 출국일 시가」 단독**이고, 방향은 항상 과대공제(세액 과소)였다.
 *    실측: 출국일 시가 50억·필요경비 20억·실양도 60억·외국납부 5억
 *      → 종전 5억 전액 공제 / 정상 floor(5억 × 30억/40억) = 3.75억 ⇒ 1.25억 과소.
 *
 * ⚠️ 곱셈이 2^53 을 넘을 수 있다(외국납부세액 × 양도차익) — BigInt 로 계산한다.
 *
 * §118의13②: 1호(외국정부 산출세액 공제 허용) 또는 2호(취득가액 출국일 시가 조정) 시 배제.
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param foreignTaxPaid 외국납부세액 (원화)
 * @param exclusionReason §118의13② 배제 사유
 * @param apportion 안분 인자 — 실제 양도가액이 없으면 비율을 세울 수 없다(`ratioApplied: false`).
 */
function calcForeignTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  foreignTaxPaid: number,
  exclusionReason: ExitTaxInput["foreignTaxExclusionReason"],
  apportion: {
    /** §118의10① 양도가액 — 출국일 현재 시가 합계 */
    departureDayValue: number;
    /** §118의10② 필요경비 합계 */
    necessaryExpense: number;
    /** 실제 양도가액 합계. 미입력이면 undefined. */
    actualTransferValue?: number;
  },
): { applied: number; ratioApplied: boolean } {
  // §118의13②적용 배제 → 공제 0
  if (exclusionReason !== "none") return { applied: 0, ratioApplied: false };

  // 공제한도 = 산출세액 − 조정공제액
  const limit = Math.max(0, incomeTax - adjustmentDeduction);

  const { departureDayValue, necessaryExpense, actualTransferValue } = apportion;

  // 실제 양도가액이 없으면 분모를 세울 수 없다. 여기서 공제를 **막지는 않는다** —
  // 근거 없이 불리해지기 때문이다. 대신 호출부가 경고로 표면화한다.
  if (actualTransferValue == null) {
    return { applied: Math.min(foreignTaxPaid, limit), ratioApplied: false };
  }

  const denominator = actualTransferValue - necessaryExpense;
  if (denominator <= 0) return { applied: 0, ratioApplied: true };

  // §118의12①에 해당하는 경우(실양도 < 출국일 시가)에는 분자도 **실제 양도가액**이다.
  const numeratorBase =
    actualTransferValue < departureDayValue ? actualTransferValue : departureDayValue;
  const numerator = numeratorBase - necessaryExpense;
  if (numerator <= 0) return { applied: 0, ratioApplied: true };

  const apportioned = Number(
    (BigInt(Math.trunc(foreignTaxPaid)) * BigInt(Math.trunc(numerator))) /
      BigInt(Math.trunc(denominator)),
  );

  return { applied: Math.min(apportioned, limit), ratioApplied: true };
}

/**
 * §118의14① 비거주자 세액공제
 *
 * 한도 = 「산출세액에서 조정공제액을 공제한 금액」 — **그 둘뿐이다**.
 *
 * 🔴 2026-08-28 정정(리뷰 #8) — 종전 주석은 「§118의13과 **병용** 시 순서」라 적고 한도에서
 * 외국납부세액공제까지 빼고 있었는데, 법문에 그런 항목이 없다. ②가 두 공제의 **병용 자체를
 * 금지**하므로 「병용 시 순서」라는 전제부터 틀렸다. 한도를 근거 없이 과소 산정하면
 * 납세자에게 불리해진다([[feedback_no_unfavorable_application_without_legal_basis]]).
 *
 * @param incomeTax 산출세액
 * @param adjustmentDeduction 조정공제액
 * @param domesticSourceTaxWithheld §156①7호 원천징수액 (원화)
 */
function calcDomesticTaxCredit(
  incomeTax: number,
  adjustmentDeduction: number,
  domesticSourceTaxWithheld: number,
): number {
  const limit = Math.max(0, incomeTax - adjustmentDeduction);
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
      finalTax: 0,
      totalTax: 0,
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
      taxBase,
      incomeTax,
      totalDepartureDayValue,
      input.actualTransferPricePerShare!,
      input.holdings,
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

  // §118의14① 비거주자 세액공제 — **외국납부세액공제보다 먼저** 판정한다.
  //   ②가 「제1항에 따른 공제를 **하는 경우**에는 제118조의13제1항에 따른 외국납부세액의
  //   공제를 적용하지 아니한다」로 §118의13①을 배제하기 때문이다(리뷰 #8).
  //   한도가 서로를 참조하지 않게 정정됐으므로(위 두 함수) 순서를 바꿔도 한도는 불변이다.
  const hasDomesticWithheld =
    input.domesticSourceTaxWithheld != null && input.domesticSourceTaxWithheld > 0;

  if (hasDomesticWithheld && incomeTax > 0) {
    const domCredit = calcDomesticTaxCredit(
      incomeTax,
      adjForCredit,
      input.domesticSourceTaxWithheld!,
    );
    domesticTaxCreditApplied = domCredit;
    if (domCredit > 0) {
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_14_DOMESTIC_CREDIT);
    }
  }

  // 🔑 「①에 따른 공제를 **하는 경우**」 — 필드가 있는지가 아니라 **실제 공제액이 있는지**로
  //    본다. 산출세액 0·한도 0 이면 공제를 「하는」 것이 아니므로 배제도 성립하지 않는다.
  //    「필드가 있으면 무조건 배제」로 짜면 근거 없이 불리해진다.
  const section118_14_2_excludes = (domesticTaxCreditApplied ?? 0) > 0;

  // §118의13① 외국납부세액공제
  if (hasForeignTax && incomeTax > 0) {
    if (section118_14_2_excludes) {
      foreignTaxCreditApplied = 0;
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_14_2_FOREIGN_CREDIT_EXCLUDED);
      warnings.push(STOCK_EXIT_TAX.SECTION_118_14_2_EXCLUSION_MESSAGE);
    } else {
      // §118의10② 필요경비 = 출국일 양도가액 − 출국일 양도차익 (Σ 종목 취득가액과 같다)
      const necessaryExpense = totalDepartureDayValue - totalTransferGain;
      const actualTransferValue = hasActualTransfer
        ? input.actualTransferPricePerShare! *
          input.holdings.reduce((sum, h) => sum + h.shareCount, 0)
        : undefined;

      const { applied, ratioApplied } = calcForeignTaxCredit(
        incomeTax,
        adjForCredit,
        foreignTaxPaidKrw,
        input.foreignTaxExclusionReason,
        { departureDayValue: totalDepartureDayValue, necessaryExpense, actualTransferValue },
      );
      foreignTaxCreditApplied = applied;
      if (applied > 0) {
        appliedRules.push(STOCK_EXIT_TAX.SECTION_118_13_FOREIGN_TAX_CREDIT);
      }
      // 계산식을 세우지 못했으면 조용히 전액 공제하지 않고 그 사실을 남긴다(리뷰 #9).
      if (!ratioApplied && input.foreignTaxExclusionReason === "none") {
        warnings.push(STOCK_EXIT_TAX.FOREIGN_CREDIT_RATIO_UNAVAILABLE_MESSAGE);
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

  /**
   * 결정세액·총 납부세액 — §118의15④가 「산출세액에 **더한다**」고 한 가산세를 여기서 합류시킨다.
   *
   * 종전에는 `holdingsReportPenalty`를 계산만 하고 **어느 총계에도 넣지 않았다**. 결과 카드는
   * 단독 행으로 보여줬지만 사이드바 요약에서는 금액이 통째로 사라졌다(형제 국외주식 트랙에는
   * `totalTax`가 있는데 국외전출세만 총액 개념 자체가 없었다).
   *
   * 🔑 지방소득세는 **가산세 이전 금액**(`taxForLocal`) 기준을 유지한다 — 지방세법상 부가되는
   *    대상은 소득세 산출세액이지 국세기본법·소득세법상 가산세가 아니다. 국외주식
   *    (`foreign-stock.ts`)도 같은 구조다.
   */
  const finalTax = taxForLocal + (holdingsReportPenalty ?? 0);
  const totalTax = finalTax + localIncomeTax;

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

    finalTax,
    totalTax,

    reentryRefund,

    warnings,
    appliedRules,
  };
}
