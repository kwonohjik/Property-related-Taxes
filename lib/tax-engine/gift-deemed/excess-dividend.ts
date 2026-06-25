/**
 * §41의2 초과배당에 따른 이익의 증여 — 순수 계산 엔진
 *
 * 법령 근거:
 * - 상증법 §41의2: 초과배당 과세 (현행 2021.1.1~: 과세표준차감 / 구법 2018~2020: 산출세액공제)
 * - 시행령 §31의2②: 초과배당금액 자동산정 (주주 비율 안분)
 * - 시행규칙 §10의3①: 소득세 상당액 율표 (6구간 2018~2024.3.21 / 7구간 2024.3.22~)
 */
import { GIFT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";
import {
  applyExcessDividendRateTable,
  resolveExcessDividendRateTable,
  resolveComprehensiveIncomeTaxBrackets,
} from "../data/gift-deemed-rates";
import {
  runSettlement2Pass,
  runLegacyCredit,
} from "./excess-dividend-settlement";
import type {
  DeemedGiftResult,
  ExcessDividendInput,
  ExcessDividendDetail,
  ShareholderDividend,
} from "./types";

// ──────────────────────────────────────────────────────────────
// 공개 진입점
// ──────────────────────────────────────────────────────────────

/**
 * §41의2 초과배당 메인 계산.
 * 시기 분기: dividendDate >= 2021-01-01 → 현행(과세표준차감)
 *            dividendDate < 2021-01-01  → 구법(산출세액공제, settlement 필요)
 */
export function calcExcessDividendGift(input: ExcessDividendInput): DeemedGiftResult {
  const { shareholders, dividendDate, incomeTaxMode } = input;

  // ① 초과배당금액 자동산정 (시행령 §31의2②)
  const amountDetail = computeExcessDividendAmount(shareholders);
  const { excessDividendAmount, totalShortfall } = amountDetail;

  // 총과소배당 0 → 과세 없음
  if (totalShortfall === 0 || excessDividendAmount === 0) {
    const detail: ExcessDividendDetail = {
      ...amountDetail,
      incomeTaxMode,
      appliedRateTableSet: null,
      incomeTaxEquivalent: 0,
      taxMethod: "current_deduction_from_base",
      isAggregationExcluded: false,
    };
    return {
      type: "excess_dividend",
      applied: false,
      deemedGiftValue: 0,
      breakdown: [
        { label: "초과배당금액", amount: 0, lawRef: GIFT.EXCESS_DIVIDEND_AUTO_COMPUTE },
      ],
      exclusionReason: "초과배당금액이 없음 — 과소배당 없거나 최대주주등 과소배당 비율 0",
      legalBasis: GIFT.EXCESS_DIVIDEND,
      excessDividendDetail: detail,
    };
  }

  // ② 소득세 상당액 산정 (시행규칙 §10의3)
  const incomeTaxResult = computeIncomeTaxEquivalent(input, excessDividendAmount, dividendDate);

  // ③ 시기 분기 — 현행(2021~) vs 구법(2018~2020)
  const isCurrentMethod = dividendDate >= new Date("2021-01-01");
  const taxMethod: ExcessDividendDetail["taxMethod"] = isCurrentMethod
    ? "current_deduction_from_base"
    : "legacy_credit_from_tax";

  // ④ 증여재산가액 산정
  let deemedGiftValue: number;
  if (isCurrentMethod) {
    // 현행: 초과배당금액 − 소득세상당액 (음수 → 0)
    const raw = excessDividendAmount - incomeTaxResult.incomeTaxEquivalent;
    deemedGiftValue = Math.max(0, raw);
  } else {
    // 구법: 과세표준 = 초과배당금액 전액 (소득세 미차감)
    deemedGiftValue = excessDividendAmount;
  }

  const applied = deemedGiftValue > 0;

  // ⑤ 정산 2-pass (현행 + giftTaxContext 제공 시) — settlement 파일에서 처리
  let settlementResult: ExcessDividendDetail["settlement"] = undefined;
  let legacyCreditResult: ExcessDividendDetail["legacyCredit"] = undefined;

  if (input.giftTaxContext) {
    if (isCurrentMethod && input.actualIncomeTax !== undefined) {
      // 현행 정산 2-pass
      settlementResult = runSettlement2Pass({
        excessDividendAmount,
        initialIncomeTax: incomeTaxResult.incomeTaxEquivalent,
        actualIncomeTax: input.actualIncomeTax,
        dividendDate,
        giftTaxContext: input.giftTaxContext,
      });
    } else if (!isCurrentMethod) {
      // 구법 산출세액공제
      legacyCreditResult = runLegacyCredit({
        excessDividendAmount,
        incomeTaxEquivalent: incomeTaxResult.incomeTaxEquivalent,
        dividendDate,
        giftTaxContext: input.giftTaxContext,
      });
    }
  }

  // ⑥ 결과 조립
  const detail: ExcessDividendDetail = {
    ...amountDetail,
    incomeTaxMode,
    appliedRateTableSet: incomeTaxResult.appliedRateTableSet,
    incomeTaxEquivalent: incomeTaxResult.incomeTaxEquivalent,
    comprehensiveMaxDetail: incomeTaxResult.comprehensiveMaxDetail,
    taxMethod,
    settlement: settlementResult,
    legacyCredit: legacyCreditResult,
    isAggregationExcluded: !applied,
  };

  const breakdown: CalculationStep[] = [
    {
      label: "초과배당금액 (자동산정)",
      amount: excessDividendAmount,
      lawRef: GIFT.EXCESS_DIVIDEND_AUTO_COMPUTE,
    },
    {
      label: "소득세 상당액",
      amount: incomeTaxResult.incomeTaxEquivalent,
      lawRef: GIFT.EXCESS_DIVIDEND_INCOME_TAX_RATE,
    },
    {
      label: isCurrentMethod
        ? "증여재산가액 (초과배당금액 − 소득세상당액)"
        : "증여재산가액 (초과배당금액 전액, 산출세액에서 소득세 공제)",
      amount: deemedGiftValue,
      lawRef: GIFT.EXCESS_DIVIDEND,
      note: isCurrentMethod
        ? "§41의2① 현행(2021~): 과세표준차감 방식"
        : "§41의2 구법(2018~2020): 산출세액공제 방식",
    },
  ];

  return {
    type: "excess_dividend",
    applied,
    deemedGiftValue,
    breakdown,
    exclusionReason: applied
      ? undefined
      : "초과배당금액이 소득세 상당액 이하 — §47② 재차증여 합산 배제 해당",
    legalBasis: GIFT.EXCESS_DIVIDEND,
    thresholdEcho: {
      excessDividendAmount,
      incomeTaxEquivalent: incomeTaxResult.incomeTaxEquivalent,
      isCurrentMethod,
    },
    excessDividendDetail: detail,
  };
}

// ──────────────────────────────────────────────────────────────
// 공개 유틸: 초과배당금액 자동산정 (테스트에서 직접 호출)
// ──────────────────────────────────────────────────────────────

/**
 * 시행령 §31의2② — 주주 배열에서 초과배당금액 자동산정.
 *
 * 알고리즘:
 * 1. 총배당 = Σ actualDividend (모든 주주 합계)
 * 2. 특수관계인 비례배당 = 총배당 × (특수관계인 지분율)
 * 3. ①가액 = 특수관계인 실수령 − 특수관계인 비례배당 (과소 시 0)
 * 4. 각 주주 과소배당 = max(0, 비례배당 − 실수령)
 *    - 최대주주 과소: majorShortfall
 *    - 기타 주주 과소: otherShortfall (⚠️ 분모에 포함 — 교차검토 정정)
 *    - 총과소배당: totalShortfall = majorShortfall + otherShortfall
 * 5. ②비율 = majorShortfall / totalShortfall (분모 0 방어)
 * 6. 초과배당금액 = ①가액 × ②비율 (safeMultiplyThenDivide 정수연산)
 */
export function computeExcessDividendAmount(
  shareholders: ShareholderDividend[],
): Pick<
  ExcessDividendDetail,
  | "totalDividend"
  | "proportionalDividend"
  | "excessBeforeRatio"
  | "majorShortfall"
  | "totalShortfall"
  | "ratioNumer"
  | "ratioDenom"
  | "excessDividendAmount"
> {
  // 총배당
  const totalDividend = shareholders.reduce((sum, sh) => sum + sh.actualDividend, 0);

  // 특수관계인 지분율 합계
  const relatedNumer = shareholders
    .filter((sh) => sh.role === "related_party")
    .reduce((sum, sh) => sum + sh.ownershipRatio.numer * (100 / sh.ownershipRatio.denom), 0);

  // 특수관계인 비례배당: totalDividend × (관련 지분율 / 100)
  // 정수연산: safeMultiplyThenDivide(totalDividend × relatedNumer, 1, 100) 형식
  const proportionalDividend = Math.floor((totalDividend * relatedNumer) / 100);

  // 특수관계인 실수령 합계
  const relatedActual = shareholders
    .filter((sh) => sh.role === "related_party")
    .reduce((sum, sh) => sum + sh.actualDividend, 0);

  // ①가액 = 실수령 − 비례 (과소 시 0)
  const excessBeforeRatio = Math.max(0, relatedActual - proportionalDividend);

  // 각 주주 과소배당 계산 (주주별 비례배당 = totalDividend × 지분율)
  let majorShortfall = 0;
  let otherShortfall = 0;

  for (const sh of shareholders) {
    if (sh.role === "related_party") continue; // 특수관계인 제외
    const proportional = Math.floor(
      (totalDividend * sh.ownershipRatio.numer) / sh.ownershipRatio.denom,
    );
    const shortfall = Math.max(0, proportional - sh.actualDividend);
    if (sh.role === "major_shareholder") {
      majorShortfall += shortfall;
    } else {
      // role === 'other' — 기타 주주도 분모에 포함 (교차검토 A3 정정)
      otherShortfall += shortfall;
    }
  }

  const totalShortfall = majorShortfall + otherShortfall;

  // ②비율 = majorShortfall / totalShortfall (분모 0 방어)
  // 초과배당금액 = excessBeforeRatio × (majorShortfall / totalShortfall)
  let excessDividendAmount = 0;
  if (totalShortfall > 0) {
    // 정수연산: excessBeforeRatio × majorShortfall / totalShortfall
    excessDividendAmount = Math.floor(
      (excessBeforeRatio * majorShortfall) / totalShortfall,
    );
  }

  return {
    totalDividend,
    proportionalDividend,
    excessBeforeRatio,
    majorShortfall,
    totalShortfall,
    ratioNumer: majorShortfall,
    ratioDenom: totalShortfall,
    excessDividendAmount,
  };
}

// ──────────────────────────────────────────────────────────────
// 내부 헬퍼: 소득세 상당액 산정
// ──────────────────────────────────────────────────────────────

interface IncomeTaxResult {
  incomeTaxEquivalent: number;
  appliedRateTableSet: ExcessDividendDetail["appliedRateTableSet"];
  comprehensiveMaxDetail?: ExcessDividendDetail["comprehensiveMaxDetail"];
}

function computeIncomeTaxEquivalent(
  input: ExcessDividendInput,
  excessDividendAmount: number,
  dividendDate: Date,
): IncomeTaxResult {
  const { incomeTaxMode } = input;

  if (incomeTaxMode === "exempt") {
    return { incomeTaxEquivalent: 0, appliedRateTableSet: null };
  }

  if (incomeTaxMode === "separate") {
    // 분리과세: 실제 소득세액 직접 사용
    return {
      incomeTaxEquivalent: input.separateIncomeTax ?? 0,
      appliedRateTableSet: null,
    };
  }

  if (incomeTaxMode === "comprehensive") {
    // 종합과세: Max(ⓐ−ⓑ, 초과배당금액×14%)
    return computeComprehensiveIncomeTax(
      excessDividendAmount,
      input.comprehensiveTaxBase ?? excessDividendAmount,
      input.comprehensiveTaxBaseExcluding,
      input.incomeTaxYear ?? dividendDate.getFullYear(),
    );
  }

  // undetermined (기본): 율표 자동 적용
  const table = resolveExcessDividendRateTable(dividendDate);
  const rateTableSet =
    table.length === 7 ? ("7bracket_2024" as const) : ("6bracket_2018" as const);
  const incomeTaxEquivalent = applyExcessDividendRateTable(excessDividendAmount, table);

  return { incomeTaxEquivalent, appliedRateTableSet: rateTableSet };
}

/** 종합과세 Max(ⓐ−ⓑ, 초과배당금액×14%) 계산 */
function computeComprehensiveIncomeTax(
  excessDividendAmount: number,
  comprehensiveTaxBase: number,
  comprehensiveTaxBaseExcluding: number | undefined,
  incomeTaxYear: number,
): IncomeTaxResult {
  const brackets = resolveComprehensiveIncomeTaxBrackets(incomeTaxYear);
  // TaxBracket 형식으로 변환 (calculateProgressiveTax 시그니처 호환)
  const taxBrackets = brackets.map((b) => ({
    min: 0,
    max: b.max,
    rate: b.rate,
    deduction: b.deduction,
  }));

  // ⓑ기준 = comprehensiveTaxBase − excessDividendAmount (미입력 시)
  const taxBaseExcluding =
    comprehensiveTaxBaseExcluding ?? Math.max(0, comprehensiveTaxBase - excessDividendAmount);

  // ⓐ = 종합소득과세표준 × 세율
  const taxA = computeProgressiveTaxWithDeduction(comprehensiveTaxBase, taxBrackets);
  // ⓑ = (과세표준 − 초과배당) × 세율
  const taxB = computeProgressiveTaxWithDeduction(taxBaseExcluding, taxBrackets);

  const taxAminusB = Math.max(0, taxA - taxB);
  // 하한: 초과배당금액 × 14%
  const taxFloor = Math.floor(excessDividendAmount * 0.14);
  const appliedAmount = Math.max(taxAminusB, taxFloor);

  return {
    incomeTaxEquivalent: appliedAmount,
    appliedRateTableSet: null,
    comprehensiveMaxDetail: {
      taxA,
      taxB,
      taxAminusB,
      taxFloor,
      appliedAmount,
    },
  };
}

/**
 * 누진세율 계산 (§55 deduction 방식).
 * tax-utils.calculateProgressiveTax와 다른 bracket 구조 (deduction 방식) 이므로 내부 구현.
 */
function computeProgressiveTaxWithDeduction(
  amount: number,
  brackets: { min: number; max: number | null; rate: number; deduction: number }[],
): number {
  if (amount <= 0) return 0;
  for (const b of brackets) {
    if (b.max === null || amount <= b.max) {
      return Math.max(0, Math.floor(amount * b.rate) - b.deduction);
    }
  }
  const last = brackets[brackets.length - 1];
  return Math.max(0, Math.floor(amount * last.rate) - last.deduction);
}

/** 신고기한구분 분기 — 영§31의2③1호 해당 여부 (현행 법령상 항상 false) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isFilingDeadlineExempt(_dividendDate: Date, _isDiligentFiler: boolean): boolean {
  // 현행 법령 해석: 일반 신고기한=5.31<6.1, 성실 신고기한=6.30<7.1
  // → 영③1호 "신고기한이 6.1/7.1 이후"에 해당하는 케이스가 사실상 없음
  // → 정산 항상 적용
  return false;
}
