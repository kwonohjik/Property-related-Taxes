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
 *   STEP 4: 세율 구분별 과세표준 (기본공제 §118의10④ 250만원 — 구분이 둘 이상이면 사용자 배분 입력)
 *   STEP 5: §118의11 산출세액 (1호 20%/25% 누진 · 2호가목 10% · 2호나목 20%)
 *   STEP 6: 납부유예 §118의16 처리 (5년/10년)
 *   STEP 7: 경정청구 계산 (조정공제·외국납부세액공제·비거주자공제) — 전역 입력(종목 공통 단가) 또는 종목별 실제 양도(PR-7a)
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
import { calcAdjustmentDeduction } from "./exit-tax-credit";
import { calcForeignTaxCredit } from "./exit-tax-credit";
import { calcDomesticTaxCredit } from "./exit-tax-credit";
import { STOCK_EXIT_TAX, STOCK_EXIT_TAX_CONSTS } from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_EXIT_TAX_2027 } from "@/lib/tax-engine/legal-codes/stock-exit-tax-2027";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import { applyRate } from "@/lib/tax-engine/tax-utils";
import { isForeignValuationMode } from "./exit-tax-fx";
import { resolveForeignHoldingKrw } from "./exit-tax-fx";
import { calcLocalIncomeTaxTable, floorTen } from "./exit-tax-bucket";
import { calcBuckets } from "./exit-tax-multi-bucket";
import { assertHoldingActualInputs } from "./exit-tax-actual-transfer";
import { calcHoldingActualTransfers } from "./exit-tax-actual-transfer";
import { hasHoldingActualTransfer } from "./exit-tax-actual-transfer";
import { calcMultiBucketLocalTax } from "./exit-tax-multi-bucket";
import { multiBucketNotices } from "./exit-tax-multi-bucket";
import {
  assertAdjustmentInputSupported,
  assertForeignInputs,
  buildAllExcludedResult,
  classifyExitTaxHoldings,
  type ExitTaxRegime,
} from "./exit-tax-regime";

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
export function calcHoldingResult(holding: ExitTaxHolding): ExitTaxHoldingResult {
  // 국외주식 외화 경로 — 외화 단가 × 주수 × 기준환율을 종목당 1회 절사(`exit-tax-fx.ts`). 원화 단가 경로는 아래 그대로.
  if (isForeignValuationMode(holding.departureDayValuationMode)) {
    const krw = resolveForeignHoldingKrw(holding);
    return {
      id: holding.id,
      stockName: holding.stockName,
      departureDayValue: krw.departureDayValue,
      departureDayValuePerShare: krw.departureDayValuePerShare,
      acquisitionCost: krw.acquisitionCost,
      transferGain: krw.departureDayValue - krw.acquisitionCost,
      valuationMode: holding.departureDayValuationMode,
      fx: krw.fx,
    };
  }
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

  // 출국일 연혁 게이트 — 기준은 실제 양도일이 아니라 **출국일**이다(소득세법 부칙 제8조).
  const regime: ExitTaxRegime = isExitTaxFrom2027(input.departureDate) ? "from2027" : "pre2027";

  // ──────────────────────────────────────────────────────────
  // STEP 1: §118의9 요건 확인
  //   ①1호: 출국일 전 10년 중 5년 이상 국내 주소·거소
  //   ②: 직전 연도말 대주주 (§178의8 → §167의8 준용)
  // ──────────────────────────────────────────────────────────
  const residencyEligible =
    input.yearsResidentLast10 >= STOCK_EXIT_TAX_CONSTS.MIN_RESIDENT_YEARS;
  const majorShareholderEligible = input.isMajorShareholder;

  if (!residencyEligible || !majorShareholderEligible) {
    // 2027.1.1. 이후 출국 + 국외 종목 입력: 대주주 판정에서 국외주식등이 빠진다는 사실을 덧붙인다(§118의9①2호 괄호).
    const foreignNote =
      regime === "from2027" && input.holdings.some((h) => h.marketType === "foreign_stock")
        ? " — 국외주식 보유분은 대주주 판정에서 제외됨 (소득세법 §118의9①2호)"
        : "";
    const reason = !residencyEligible
      ? `거주기간 ${input.yearsResidentLast10}년 — §118의9①1호 미충족 (출국일 전 10년 중 5년 이상 필요)`
      : `대주주 요건 미충족 — §178의8 (직전 연도말 대주주 비해당)${foreignNote}`;

    return {
      exitTaxRegime: regime,
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
      // 과세 자체가 없으므로 세율도 없다 — 서식 23·24행은 0을 그대로 보여준다.
      appliedRate: 0,
      progressiveDeduction: 0,
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
  assertForeignInputs(input, regime);
  const computedDetails: ExitTaxHoldingResult[] = input.holdings.map((h) =>
    calcHoldingResult(h),
  );
  appliedRules.push(STOCK_EXIT_TAX.SECTION_178_9_DEPARTURE_VALUE);

  // 범위·제외·세율 구분 분류 (§118의9①·시행령 §178의8②). 국내 종목만이면 전부 과세·1호라 종전과 같다.
  const cls = classifyExitTaxHoldings(input, regime, computedDetails);
  warnings.push(...cls.warnings);
  const holdingDetails = cls.details;
  // 조정공제·외국납부세액공제의 안분 인자(주식수)는 과세 종목만 쓴다 — 제외된 국외주식이 섞이면 조용히 틀린다.
  const taxedHoldings = cls.taxedHoldings;

  // 종목별 실제 양도(PR-7a) 입력 검증 — 제외된 종목에 입력이 오면 조용히 무시하지 않고 거부한다(전부 제외 조기 반환보다 먼저).
  assertHoldingActualInputs(input, cls.details);

  // 입력 종목이 있는데 전부 제외됐으면 납세의무가 없다. 배분 입력이 있으면 무시하지 않고 검증한다(과세 구분이 없으니 전부 0이어야 한다).
  if (input.holdings.length > 0 && taxedHoldings.length === 0) {
    if (input.basicDeductionAllocation != null) calcBuckets(input, []);
    return buildAllExcludedResult(regime, cls, appliedRules);
  }
  assertAdjustmentInputSupported(cls.buckets, input);
  appliedRules.push(...cls.appliedRules);

  // ──────────────────────────────────────────────────────────
  // STEP 4~5: 세율 구분별 과세표준 (§118의10④ 기본공제 250만원) + 산출세액 (§118의11)
  //   구분이 하나이면 종전과 같다. 둘 이상이면 기본공제 배분을 입력받고 구분 간 손실은 차단한다(exit-tax-multi-bucket.ts).
  // ──────────────────────────────────────────────────────────
  const taxedDetails = holdingDetails.filter((h) => h.scope !== "excluded");
  const totalDepartureDayValue = taxedDetails.reduce((sum, h) => sum + h.departureDayValue, 0);
  const calc = calcBuckets(input, taxedDetails);
  const isMultiBucket = calc.details.length >= 2;
  const isClause2 = calc.details.some((d) => d.bucket !== "clause1");
  const totalTransferGain = calc.totalGain;
  const basicDeduction = calc.basicDeduction;
  const taxBase = calc.taxBase;
  const incomeTax = calc.incomeTax;
  appliedRules.push(STOCK_EXIT_TAX.SECTION_118_10_4_BASIC_DEDUCTION);

  if (totalTransferGain <= 0) {
    warnings.push(`양도차익 합산 ${totalTransferGain.toLocaleString()}원 — 과세표준 0 (양도손실 또는 차익 없음)`);
  }

  // rate·progressiveDeduction 은 종전에도 계산되고 있었다 — 버리지 않고 결과에 echo 한다
  // (별지 제84호서식 23·24행. 산식은 그대로다). 구분이 둘 이상이면 단일 값이 성립하지 않아 0이고 `bucketDetails`를 읽는다.
  const appliedRate = isMultiBucket ? 0 : (calc.details[0]?.appliedRate ?? 0);
  const progressiveDeduction = isMultiBucket ? 0 : (calc.details[0]?.progressiveDeduction ?? 0);
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
      taxedHoldings,
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
          taxedHoldings.reduce((sum, h) => sum + h.shareCount, 0)
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

  // 종목별 실제 양도(PR-7a) — 전역 입력과 동시에 올 수 없으므로(`assertHoldingActualInputs`) 위 전역 블록은 모두 건너뛴 상태다.
  // 구분별 조정공제 · 종목별 외국납부세액 안분 · 총액 한도. 계산·고지는 `exit-tax-actual-transfer.ts`.
  const perHolding = hasHoldingActualTransfer(input)
    ? calcHoldingActualTransfers(input, holdingDetails, calc.details, incomeTax)
    : undefined;
  if (perHolding) {
    adjustmentDeduction = perHolding.adjustmentDeduction;
    foreignTaxCreditApplied = perHolding.foreignTaxCreditApplied;
    domesticTaxCreditApplied = perHolding.domesticTaxCreditApplied;
    warnings.push(...perHolding.warnings);
    appliedRules.push(...perHolding.appliedRules);
  }
  const foreignTaxPaidKrwEcho = perHolding ? perHolding.foreignTaxPaidKrw : foreignTaxPaidKrw;

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
  // 2호(국외주식)는 지방세법 §103의3⑧ 표를 과세표준에 직독한 값이 주값이고 소득세 10%는 참고값이다(C-5, V-3).
  // 1호는 종전 그대로 — 소득세 표의 정확히 10%와 같다. 구분이 둘 이상이면 구분별로 계산해 더한다.
  const multiLocal = isMultiBucket ? calcMultiBucketLocalTax(calc.details) : undefined;
  const localIncomeTax = multiLocal
    ? multiLocal.primary
    : isClause2
      ? calcLocalIncomeTaxTable(taxBase)
      : floorTen(taxForLocal * 0.1);
  const localIncomeTaxAlternative = multiLocal
    ? multiLocal.alternative
    : isClause2
      ? floorTen(applyRate(taxForLocal, 0.1))
      : undefined;
  appliedRules.push(STOCK_EXIT_TAX.LOCAL_TAX_103_3);
  if (isClause2) appliedRules.push(STOCK_EXIT_TAX_2027.LOCAL_103_3_8);
  if (multiLocal) {
    // 구분별 지방소득세·배분·3억 구간 기준 고지가 2호 단일 고지를 대신한다
    warnings.push(...multiBucketNotices(calc.details, multiLocal));
  } else if (isClause2) {
    warnings.push(
      `2호(국외주식) 지방소득세는 지방세법 §103의3⑧ 표를 과세표준에 직독한 ${localIncomeTax.toLocaleString()}원이 주값이고, 소득세 산출세액의 10%는 ${(localIncomeTaxAlternative ?? 0).toLocaleString()}원입니다 — 표가 호 구분 없는 단일표라 두 값이 다를 수 있어 확인 필요`,
    );
  }

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
    exitTaxRegime: regime,
    taxCategory: "exit_tax",
    isLiable: true,
    residencyEligible,
    majorShareholderEligible,

    holdingDetails: perHolding
      ? holdingDetails.map((d) => {
          const actualTransfer = perHolding.lotEchoes.get(d.id);
          return actualTransfer ? { ...d, actualTransfer } : d;
        })
      : holdingDetails,
    ...(taxedHoldings.length > 0
      ? {
          bucketDetails: perHolding
            ? calc.details.map((b) => ({ ...b, ...perHolding.bucketAdjustments.get(b.bucket) }))
            : calc.details,
        }
      : {}),
    ...(cls.foreignExclusion ? { foreignExclusion: cls.foreignExclusion } : {}),

    totalTransferGain,
    basicDeduction,
    taxBase,
    ...(calc.userAllocated ? { basicDeductionBasis: "user_allocation" as const } : {}),

    incomeTax,
    appliedRate,
    progressiveDeduction,
    localIncomeTax,
    ...(localIncomeTaxAlternative != null ? { localIncomeTaxAlternative } : {}),

    deferralYears,
    deferredTaxAmount,
    deferralInterestNote,
    deferralInterest,

    adjustmentDeduction,
    foreignTaxCreditApplied,
    // 공제에 실제로 쓰인 원화 금액 — 화면이 「외화 × 환율」 산식을 보일 수 있게 echo
    ...(foreignTaxPaidKrwEcho > 0 ? { foreignTaxPaidKrw: foreignTaxPaidKrwEcho } : {}),
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
