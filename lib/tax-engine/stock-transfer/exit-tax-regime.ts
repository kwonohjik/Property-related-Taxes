/**
 * 국외전출세 2027.1.1. 개정 — 범위·제외·세율 구분 분류 (순수 leaf)
 *
 * 법령: 소득세법 §118의9①(국외전출자 주식등)·§118의11(1호/2호 세율), 시행령 §178의8②(국외주식등 제외 3가지)
 * 기준일은 **출국일**이다(소득세법 부칙 제8조) — `isExitTaxFrom2027`이 판정한다. 이 파일은 그 결과(regime)를 받아
 * 종목을 「과세 / 제외」와 「세율 구분」으로 나눈다. 세액 계산은 `exit-tax.ts`·`exit-tax-bucket.ts`가 한다.
 *
 * PR-2 범위: 구분이 하나일 때까지만 계산한다. 구분 ≥2(국내 1호 + 국외 2호, 2호 가·나목 혼재)와
 * 2호 경정청구는 `assertSupportedByPr2`가 `INVALID_INPUT`으로 막는다(PR-4·PR-7).
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §3.2~§3.5
 */

import type {
  ExitTaxExcludedReason,
  ExitTaxHolding,
  ExitTaxHoldingResult,
  ExitTaxInput,
  ExitTaxRateBucket,
  ExitTaxResult,
} from "./types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { isValid, startOfDay } from "@/lib/tax-engine/utc-date";
import {
  STOCK_EXIT_TAX_2027,
  STOCK_EXIT_TAX_2027_CONSTS,
} from "@/lib/tax-engine/legal-codes/stock-exit-tax-2027";

export type ExitTaxRegime = "pre2027" | "from2027";

function invalid(message: string, path: string): TaxCalculationError {
  return new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { path });
}

const isForeign = (h: ExitTaxHolding): boolean => h.marketType === "foreign_stock";

/** 세율 구분 — 국내 종목은 1호, 국외주식은 중소기업(내국법인 발행)만 2호가목, 그 밖은 2호나목 */
export function rateBucketOf(h: ExitTaxHolding): ExitTaxRateBucket {
  if (!isForeign(h)) return "clause1";
  // isListedForeignCorp 미입력은 true(외국법인) — 가목 불가. ④·⑧과 같은 default.
  const isForeignCorp = h.isListedForeignCorp ?? true;
  return !isForeignCorp && h.isSmallMediumEnterprise === true ? "clause2a" : "clause2b";
}

/** 영 §178의8②2·3호 요건 4개가 **모두** true인가 (하나라도 false면 제외하지 않는다) */
function allWorkerChecksTrue(input: ExitTaxInput): boolean {
  const c = input.foreignWorkerChecks;
  return (
    c != null &&
    c.isOfficerOrEmployee &&
    c.isNotDailyWorker &&
    c.domesticWorkRatioAtLeast80 &&
    c.departedWithin6MonthsOfWorkEnd
  );
}

// ============================================================
// 입력 방어 (엔진은 침묵 보정하지 않는다 — 미입력은 오류)
// ============================================================

/**
 * 2027.1.1. 이후 출국 + 국외 종목일 때만 점검한다. (2026 이전 출국은 국외 종목을 계산에 쓰지 않는다.)
 * - PR-3 예약 외화 필드·외화 시가 모드가 있으면 거부(원화 단가 경로만 지원).
 * - 외국인근로자 구분이 none이 아닌데 요건 체크·가족 구분·근로 개시일이 빠졌으면 거부.
 */
export function assertForeignInputs(input: ExitTaxInput, regime: ExitTaxRegime): void {
  if (regime !== "from2027") return;
  const foreignHoldings = input.holdings.filter(isForeign);
  if (foreignHoldings.length === 0) return;

  for (const h of foreignHoldings) {
    const reserved =
      h.departureDayPriceForeign != null ||
      h.departureExchangeRate != null ||
      h.perShareAcquisitionPriceForeign != null ||
      h.acquisitionExchangeRate != null ||
      h.departureDayValuationMode === "foreign_market_price" ||
      h.departureDayValuationMode === "foreign_decree_178_3";
    if (reserved) {
      throw invalid(
        `국외주식 「${h.stockName}」: 외화·환율 입력은 아직 지원하지 않습니다 — 원화 단가로 입력하세요`,
        `holdings.${h.id}`,
      );
    }
    if (h.departureDayValuationMode !== "market_price") {
      throw invalid(
        `국외주식 「${h.stockName}」: 출국일 시가는 거래가액(market_price)만 지원합니다 (국내 비상장 평가 모드는 국외주식에 쓸 수 없음)`,
        `holdings.${h.id}.departureDayValuationMode`,
      );
    }
  }

  const status = input.foreignWorkerStatus ?? "none";
  if (status === "none") return;
  if (input.foreignWorkerChecks == null) {
    throw invalid("외국인근로자 요건 4개(foreignWorkerChecks)가 필요합니다", "foreignWorkerChecks");
  }
  if (status === "foreign_worker_family") {
    if (input.foreignWorkerFamilyKind == null) {
      throw invalid("외국인근로자 가족 구분(배우자/20세 이하 직계비속)이 필요합니다", "foreignWorkerFamilyKind");
    }
    const start = input.foreignWorkerStartDate;
    if (start == null || !isValid(start)) {
      throw invalid("외국인근로자가 국내에서 근로를 제공하기 시작한 날이 필요합니다", "foreignWorkerStartDate");
    }
  }
}

// ============================================================
// 분류
// ============================================================

export type ExitTaxClassification = {
  /** 종목별 결과에 scope·excludedReason·rateBucket를 얹은 것 (입력 순서 유지) */
  details: ExitTaxHoldingResult[];
  /** 과세(taxed) 종목 — 조정공제 안분·합계는 이것만 쓴다 */
  taxedHoldings: ExitTaxHolding[];
  /** 과세 종목에 나타난 세율 구분(중복 제거) */
  buckets: ExitTaxRateBucket[];
  foreignExclusion?: NonNullable<ExitTaxResult["foreignExclusion"]>;
  warnings: string[];
  appliedRules: string[];
};

function exclusionWarning(reason: ExitTaxExcludedReason, total: number): string {
  switch (reason) {
    case "pre2027_foreign_not_covered":
      return "2026.12.31. 이전 출국분은 국외주식등(§94①3다목)이 국외전출세 과세 대상이 아니어서 제외했습니다 — 적용 기준은 실제 양도일이 아니라 출국일입니다(소득세법 부칙 제8조)";
    case "foreign_total_le_500m":
      return `국외주식등 출국일 양도가액 합계 ${total.toLocaleString()}원이 5억원 이하라 국외전출자 주식등에서 제외했습니다 (시행령 §178의8②1호) — 합계는 소유한 국외주식등 전부를 문언대로 합산한 값이며, 외국인근로자 해당분 포함 여부는 확인 필요`;
    case "foreign_worker_owned":
      return "외국인근로자 소유 국외주식등으로 제외했습니다 (시행령 §178의8②2호) — 요건은 입력한 선언대로 판정했으며 근로 기간 80%·6개월 산정은 확인 필요";
    case "foreign_worker_family_pre_work":
      return "외국인근로자의 배우자·20세 이하 직계비속이 근로 개시일 전에 취득한 국외주식등으로 제외했습니다 (시행령 §178의8②3호) — 20세 이하 판정 시점은 선언 기준이며 확인 필요";
  }
}

/**
 * 종목을 과세/제외 + 세율 구분으로 분류한다.
 *
 * 제외 우선순위(시행령 §178의8② 각 호는 서로 독립이라 합집합이지만, 사유 표시는 아래 순서로 한다):
 *  - pre2027: 국외 종목 전부 `pre2027_foreign_not_covered`
 *  - from2027: ①1호 합계 ≤ 5억(**이하 = 경계 포함**, 합계는 소유 국외주식등 전부) → 국외 전부
 *              ②2호 본인(요건 4개) → 국외 전부 ③3호 가족(요건 4개) → 근로 개시일 전 취득 종목만
 */
export function classifyExitTaxHoldings(
  input: ExitTaxInput,
  regime: ExitTaxRegime,
  computed: ExitTaxHoldingResult[],
): ExitTaxClassification {
  const warnings: string[] = [];
  const appliedRules: string[] = [];
  const holdingById = new Map(input.holdings.map((h) => [h.id, h]));
  const foreignDetails = computed.filter((d) => isForeign(holdingById.get(d.id)!));
  const foreignTotal = foreignDetails.reduce((s, d) => s + d.departureDayValue, 0);
  const threshold = STOCK_EXIT_TAX_2027_CONSTS.FOREIGN_EXCLUSION_THRESHOLD;

  const status = input.foreignWorkerStatus ?? "none";
  const familyStart = input.foreignWorkerStartDate;

  const excludedReasonOf = (h: ExitTaxHolding): ExitTaxExcludedReason | undefined => {
    if (!isForeign(h)) return undefined;
    if (regime === "pre2027") return "pre2027_foreign_not_covered";
    if (foreignTotal <= threshold) return "foreign_total_le_500m";
    if (status === "foreign_worker" && allWorkerChecksTrue(input)) return "foreign_worker_owned";
    if (
      status === "foreign_worker_family" &&
      allWorkerChecksTrue(input) &&
      familyStart != null &&
      startOfDay(h.acquisitionDate).getTime() < startOfDay(familyStart).getTime()
    ) {
      return "foreign_worker_family_pre_work";
    }
    return undefined;
  };

  const details = computed.map((d): ExitTaxHoldingResult => {
    const h = holdingById.get(d.id)!;
    const excludedReason = excludedReasonOf(h);
    if (excludedReason) return { ...d, scope: "excluded", excludedReason };
    return { ...d, scope: "taxed", rateBucket: rateBucketOf(h) };
  });

  const taxedHoldings = input.holdings.filter(
    (h) => details.find((d) => d.id === h.id)?.scope === "taxed",
  );
  const buckets = [...new Set(taxedHoldings.map(rateBucketOf))];

  let foreignExclusion: ExitTaxClassification["foreignExclusion"];
  if (foreignDetails.length > 0) {
    const reasons = [
      ...new Set(
        details.flatMap((d) => (d.scope === "excluded" && d.excludedReason ? [d.excludedReason] : [])),
      ),
    ];
    foreignExclusion = {
      applied: reasons.length > 0,
      ...(reasons.length > 0 ? { reason: reasons[0] } : {}),
      foreignDepartureValueTotal: foreignTotal,
      threshold,
    };
    for (const reason of reasons) warnings.push(exclusionWarning(reason, foreignTotal));
    if (reasons.includes("pre2027_foreign_not_covered")) {
      appliedRules.push(STOCK_EXIT_TAX_2027.ADDENDUM_21221_8);
    }
    if (reasons.includes("foreign_total_le_500m")) {
      appliedRules.push(STOCK_EXIT_TAX_2027.DECREE_178_8_2_UNDER_500M);
    }
    if (reasons.includes("foreign_worker_owned")) {
      appliedRules.push(STOCK_EXIT_TAX_2027.DECREE_178_8_2_FOREIGN_WORKER);
    }
    if (reasons.includes("foreign_worker_family_pre_work")) {
      appliedRules.push(STOCK_EXIT_TAX_2027.DECREE_178_8_2_FOREIGN_WORKER_FAMILY);
    }
  }

  if (regime === "from2027") {
    if (taxedHoldings.some(isForeign)) appliedRules.push(STOCK_EXIT_TAX_2027.SCOPE_118_9_FOREIGN);
    if (buckets.includes("clause2a")) appliedRules.push(STOCK_EXIT_TAX_2027.RATE_118_11_2_A_SME);
    if (buckets.includes("clause2b")) appliedRules.push(STOCK_EXIT_TAX_2027.RATE_118_11_2_B);
    // 과세 종목이 국외주식뿐인데 대주주로 입력됨 — 차단하지 않는다(출국 전 국내분을 처분했을 수 있음, 계획 §3.6)
    if (
      taxedHoldings.length > 0 &&
      taxedHoldings.every(isForeign) &&
      input.isMajorShareholder
    ) {
      warnings.push(
        "과세 대상이 국외주식뿐입니다 — 국외주식 보유분은 대주주 판정에 포함되지 않습니다 (소득세법 §118의9①2호). 직전 연도말 국내 주식 기준 대주주 판정을 확인하세요",
      );
    }
  }

  return { details, taxedHoldings, buckets, foreignExclusion, warnings, appliedRules };
}

// ============================================================
// PR-2 범위 방어
// ============================================================

/**
 * 구분 ≥2 · 2호 경정청구를 막는다 (자동 안분·상계 fallback 금지).
 * - 2호(국외주식) 과세 종목이 있으면 조정공제·외국납부세액·비거주자 공제·실제 양도 입력을 거부한다(Q-8, PR-7).
 *   현행 조정공제는 「실제 양도 1주당 단가 하나를 전 종목에 곱한다」는 단순화라 통화·단가 수준이 다른 국외주식과 성립하지 않는다.
 * - 과세 구분이 둘 이상이면 기본공제 250만원 배분·구분 간 손실 상계 규정이 법령에 없어 거부한다(Q-4·Q-5, PR-4).
 */
export function assertSupportedByPr2(input: ExitTaxInput, buckets: ExitTaxRateBucket[]): void {
  const hasClause2 = buckets.some((b) => b !== "clause1");
  if (hasClause2) {
    const adjustmentInput =
      (input.actualTransferPricePerShare ?? 0) > 0 ||
      input.actualTransferDate != null ||
      (input.foreignTaxPaid ?? 0) > 0 ||
      (input.foreignTaxPaidForeign ?? 0) > 0 ||
      (input.domesticSourceTaxWithheld ?? 0) > 0;
    if (adjustmentInput) {
      throw invalid(
        "국외주식(2호) 과세 종목이 있으면 경정청구 입력(실제 양도·외국납부세액·비거주자 원천징수)을 쓸 수 없습니다 — 아직 지원하지 않습니다",
        "actualTransferPricePerShare",
      );
    }
  }
  if (buckets.length >= 2) {
    throw invalid(
      "과세 구분이 둘 이상입니다(국내 1호 + 국외 2호, 또는 2호 가목·나목 혼재) — 기본공제 250만원 배분·구분 간 손실 상계 규정이 법령에 없어 아직 지원하지 않습니다",
      "holdings",
    );
  }
}

// ============================================================
// 전부 제외 결과
// ============================================================

/**
 * 모든 종목이 제외되면 납세의무가 없다 — `not_liable`. §118의9 요건(거주·대주주)은 충족했으므로 둘 다 true.
 */
export function buildAllExcludedResult(
  regime: ExitTaxRegime,
  cls: ExitTaxClassification,
  baseRules: string[],
): ExitTaxResult {
  const reason = cls.foreignExclusion?.reason;
  const ineligibleReason = reason
    ? exclusionWarning(reason, cls.foreignExclusion?.foreignDepartureValueTotal ?? 0)
    : "과세 대상 종목이 없습니다";
  return {
    exitTaxRegime: regime,
    taxCategory: "not_liable",
    isLiable: false,
    ineligibleReason,
    residencyEligible: true,
    majorShareholderEligible: true,
    holdingDetails: cls.details,
    foreignExclusion: cls.foreignExclusion,
    totalTransferGain: 0,
    basicDeduction: 0,
    taxBase: 0,
    incomeTax: 0,
    appliedRate: 0,
    progressiveDeduction: 0,
    localIncomeTax: 0,
    deferralYears: 0,
    deferredTaxAmount: 0,
    deferralInterestNote: "",
    finalTax: 0,
    totalTax: 0,
    warnings: cls.warnings,
    appliedRules: [...baseRules, ...cls.appliedRules],
  };
}
