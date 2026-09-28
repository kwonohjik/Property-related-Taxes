/**
 * §41의2 초과배당에 따른 이익의 증여 — 순수 계산 엔진
 *
 * 법령 근거:
 * - 상증법 §41의2: 초과배당 과세 (현행 2021.1.1~: 과세표준차감 / 구법 2018~2020: 산출세액공제)
 * - 시행령 §31의2②: 초과배당금액 자동산정 (주주 비율 안분)
 * - 시행규칙 §10의3①: 소득세 상당액 율표 (6구간 2018~2024.3.21 / 7구간 2024.3.22~)
 */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
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
import { FOR_PROFIT_DONEE_REASON } from "./taxpayer-gate";
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

  // ① 초과배당금액 자동산정 (시행령 §31의2②) — 계산 대상 수증자 1인분
  const amountDetail = computeExcessDividendAmount(shareholders, input.targetDoneeId);
  // 「상증법」§2 9호·§4의2①·③ — 대상 수증자가 영리법인이면 납세의무자가 아니다
  const targetIsForProfitCorp =
    amountDetail.donees?.find((d) => d.id === amountDetail.targetDoneeId)?.isForProfitCorp === true;
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
      exclusionReason:
        amountDetail.targetDoneeId !== undefined &&
        !amountDetail.donees?.some((d) => d.id === amountDetail.targetDoneeId)
          ? "초과배당금액이 없음 — 선택한 특수관계인은 본인 지분에 비례한 배당보다 많이 받지 않았습니다"
          : "초과배당금액이 없음 — 과소배당 없거나 최대주주등 과소배당 비율 0",
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

  const applied = deemedGiftValue > 0 && !targetIsForProfitCorp;

  // ⑤ 정산 2-pass (현행 + giftTaxContext 제공 시) — settlement 파일에서 처리
  let settlementResult: ExcessDividendDetail["settlement"] = undefined;
  let legacyCreditResult: ExcessDividendDetail["legacyCredit"] = undefined;

  if (input.giftTaxContext && !targetIsForProfitCorp) {
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
    // §47② 합산배제 안내는 「초과배당금액 ≤ 소득세 상당액」일 때뿐 — 영리법인 제외와 섞지 않는다
    isAggregationExcluded: deemedGiftValue <= 0,
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
      // 제외되면 정의어(§31① 「증여재산가액」)를 달지 않고 금액을 「제외 전」으로 남긴다(7-12와 같은 규칙)
      label: `${targetIsForProfitCorp ? "제외 전 산출 이익" : "증여재산가액"} ${
        isCurrentMethod ? "(초과배당금액 − 소득세상당액)" : "(초과배당금액 전액, 산출세액에서 소득세 공제)"
      }`,
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
    deemedGiftValue: applied ? deemedGiftValue : 0,
    breakdown,
    exclusionReason: applied
      ? undefined
      : targetIsForProfitCorp
        ? FOR_PROFIT_DONEE_REASON
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
 * 시행령 §31의2② — 주주 배열에서 초과배당금액 자동산정. **특수관계인 1인 단위**다.
 *
 * 원문(현행 MST 288887):
 *   1호 「최대주주등의 특수관계인이 배당등을 받은 금액에서 **본인이** 보유한 주식등에 비례하여 배당등을
 *       받을 경우의 그 배당등의 금액을 차감한 가액」
 *   2호 「보유한 주식등에 비하여 낮은 금액의 배당등을 받은 **주주등**이 … 적게 배당등을 받은 금액
 *       (과소배당금액) 중 최대주주등의 과소배당금액이 차지하는 비율」
 *
 * 알고리즘:
 * 1. 총배당 = Σ actualDividend (모든 주주 합계)
 * 2. 각 주주 비례배당 = floor(총배당 × 지분율) — 정수 분수(리뷰 #10)
 * 3. 과소배당 = max(0, 비례배당 − 실수령) — **역할 불문 전원**(2호 「주주등」). 과소수령 특수관계인도 분모다.
 *    - 최대주주 과소: majorShortfall / 그 외(기타·특수관계인) 과소: 분모에만
 * 4. 수증자 = 과다수령한 특수관계인 **각자**: ①가액 = 실수령 − 본인 비례배당
 * 5. 초과배당금액(수증자별) = ①가액 × majorShortfall / totalShortfall (정수연산)
 * 6. 계산 대상 1명 = targetDoneeId → 없거나 불일치면 영리법인이 아닌 첫 수증자 → 그래도 없으면 첫 수증자
 *
 * ⚠️ 종전에는 특수관계인 전원의 실수령·비례배당을 **합산**해 ①을 하나로 만들었다 — 과다수령 2명이
 *    한 사람이 되고(누진 율표·증여세가 합계에 걸림), 과소수령 특수관계인은 ①에서 상계되면서 ② 분모에서는
 *    빠졌다. 비특수관계 과다수령자가 없으면 합계는 대수적으로 같아서 1명 픽스처로는 보이지 않았다.
 */
export function computeExcessDividendAmount(
  shareholders: ShareholderDividend[],
  targetDoneeId?: string,
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
  | "donees"
  | "targetDoneeId"
> {
  const totalDividend = shareholders.reduce((sum, sh) => sum + sh.actualDividend, 0);
  const proportionalOf = (sh: ShareholderDividend) =>
    safeMultiplyThenDivide(totalDividend, sh.ownershipRatio.numer, sh.ownershipRatio.denom);

  // 과소배당 — 「과소배당을 받은 주주등」 전원(2호). 역할이 특수관계인이어도 과소수령이면 분모다.
  let majorShortfall = 0;
  let otherShortfall = 0;
  for (const sh of shareholders) {
    const shortfall = Math.max(0, proportionalOf(sh) - sh.actualDividend);
    if (sh.role === "major_shareholder") majorShortfall += shortfall;
    else otherShortfall += shortfall; // 기타 주주(교차검토 A3) · 과소수령 특수관계인
  }
  const totalShortfall = majorShortfall + otherShortfall;

  // 수증자 = 과다수령한 특수관계인 각자(1호 「본인이」)
  let relatedSeq = 0;
  const donees: NonNullable<ExcessDividendDetail["donees"]> = [];
  for (const sh of shareholders) {
    if (sh.role !== "related_party") continue;
    relatedSeq += 1;
    const proportionalDividend = proportionalOf(sh);
    const excessBeforeRatio = Math.max(0, sh.actualDividend - proportionalDividend);
    if (excessBeforeRatio === 0) continue;
    donees.push({
      id: sh.id,
      name: sh.name?.trim() || `특수관계인 ${relatedSeq}`, // 내부 id 표시 금지(feedback_no_internal_id_in_result)
      proportionalDividend,
      actualDividend: sh.actualDividend,
      excessBeforeRatio,
      excessDividendAmount:
        totalShortfall > 0 ? safeMultiplyThenDivide(excessBeforeRatio, majorShortfall, totalShortfall) : 0,
      ...(sh.isForProfitCorp === true && { isForProfitCorp: true }),
    });
  }

  // 실재하는 특수관계인 행을 골랐으면 그 사람이다 — 초과수령이 없어도 **다른 사람으로 바꾸지 않는다**.
  // 행이 없는 id(삭제된 행 등 stale)만 기본값으로 돌아간다.
  const pickedRelatedRow = shareholders.some((sh) => sh.role === "related_party" && sh.id === targetDoneeId);
  const target = pickedRelatedRow
    ? donees.find((d) => d.id === targetDoneeId)
    : (donees.find((d) => d.isForProfitCorp !== true) ?? donees[0]);

  return {
    totalDividend,
    // 수증자가 없으면 특수관계인 비례배당 합계(표시용 — 종전 값)
    proportionalDividend:
      target?.proportionalDividend ??
      shareholders.filter((sh) => sh.role === "related_party").reduce((a, sh) => a + proportionalOf(sh), 0),
    excessBeforeRatio: target?.excessBeforeRatio ?? 0,
    majorShortfall,
    totalShortfall,
    ratioNumer: majorShortfall,
    ratioDenom: totalShortfall,
    excessDividendAmount: target?.excessDividendAmount ?? 0,
    donees,
    targetDoneeId: pickedRelatedRow ? targetDoneeId : target?.id,
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
