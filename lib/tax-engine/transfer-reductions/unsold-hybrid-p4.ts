/**
 * P4 — §98의2 (특칙 전용) + §98의4 (비거주자 10%) (2026-06-12)
 *
 * - §98의2: 거주자 · 취득 2008.11.3~2010.12.31 (2010.12.31까지 계약+계약금 포함) · 수도권 밖
 *   미분양 (령 §98의2① — 2008.11.2까지 미계약·선착순 / 사업계획승인 사업주체 최초계약).
 *   효과 = 특칙 전용: 장특 = 양도차익 × §95② 표2 보유기간별 공제율 (D-5 — 보유 열만, 연 4%
 *   최대 40%) + 세율 §104①1호 (단기세율 배제). 감면세액 없음 → 농특세 대상 아님.
 *   (※ 위 「연 4%·40%」는 2021.1.1. 이후 양도분 표2 보유 열이다 — ~2020.12.31. 양도분은 연 8%·80%,
 *   `data/lthd-table2-era.ts` `table2HoldingRateAt`이 양도일로 가른다.)
 *   중과 배제 ○ (소령 §167의3①5호 열거). ②(법인)·③(부동산매매업)은 범위 외.
 * - §98의4: 국내사업장 없는 비거주자 (소법 §120) · 취득 2009.3.16~2010.2.11 (계약+계약금 포함) ·
 *   §98의3 미분양 외 주택 — 양도소득세 10% 세액감면 (5년 구분 없음 — 단일).
 *   중과 배제 × (5호 비열거 — 다주택 중과 정상 적용). 농특세 = 감면세액 × 20%. 위임령 없음.
 */

import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { unsold982PeriodGateReasons } from "./unsold-98-period-gates";
import {
  ineligibleHybrid,
  toHybridDate,
  type HybridEvalContext,
  type ReductionLike,
  type UnsoldHybridIneligibleReason,
  type UnsoldHybridResult,
} from "./unsold-hybrid";

// UTC 자정 파싱
export const UNSOLD_98_2_PERIOD_FROM = new Date("2008-11-03");
export const UNSOLD_98_2_PERIOD_TO = new Date("2010-12-31");
export const UNSOLD_98_4_PERIOD_FROM = new Date("2009-03-16");
export const UNSOLD_98_4_PERIOD_TO = new Date("2010-02-11");
/** 법 §98의4 — 세액감면율 10% */
export const UNSOLD_98_4_RATE = 0.1;
/** §95② 표2 보유기간별 공제율 — 양도일 시행본 기준(운영 식은 STEP 4.05가 이 헬퍼를 직접 호출한다). */
export { table2HoldingRateAt } from "../data/lthd-table2-era";

/**
 * §98의2 특칙 장특 결과 echo — STEP 4.05(`transfer-tax-lthd-982-step.ts`)가 채워 STEP 4.6·결과 카드가 읽는다(표시 전용).
 * - table2_holding: 표2 보유기간별 공제율로 장특을 계산했다.
 * - one_house_table2_kept: 1세대1주택 표2(보유+거주 합산)가 유지되어 특칙을 쓰지 않았다(§95② 단서 — 「각 표 외의 부분 본문」만 배제).
 * - rental97_kept: §97의3 특례 공제액이 표2 보유기간별 공제액보다 커 그 공제액을 썼다(US-16 · Q-2 (a)).
 */
export interface Unsold982LthdEcho {
  outcome: "table2_holding" | "one_house_table2_kept" | "rental97_kept";
  /** 표2 보유기간별 공제율(정수 %) — 양도일 시행본 */
  holdingRatePct: number;
  /** 표2 보유기간별 공제율로 계산한 장특 */
  holdingDeduction: number;
  /** 엔진이 실제 공제한 장특 */
  appliedDeduction: number;
  /** 적용하지 않았거나 비교한 §97의3 특례 공제액(있을 때만) */
  rental97Deduction?: number;
}

const OUTCOME_LABEL: Record<Unsold982LthdEcho["outcome"], string> = {
  table2_holding: "특칙 적용 — 장특 표2 보유기간별 공제율·기본세율",
  one_house_table2_kept: "1세대1주택 표2(보유+거주) 유지 — 기본세율 특칙",
  rental97_kept: "§97의3 특례 장특 적용 — 기본세율 특칙",
};

/** 배지·STEP 4.6 라벨 문구 */
export function unsold982OutcomeLabel(outcome: Unsold982LthdEcho["outcome"] | undefined): string {
  return OUTCOME_LABEL[outcome ?? "table2_holding"];
}

/** STEP 4.05 결과를 반영한 §98의2 formulaSteps — 엔진이 적용한 공제율·공제액과 같은 값을 쓴다. */
export function unsold982FormulaStepsOf(echo: Unsold982LthdEcho): UnsoldHybridResult["formulaSteps"] {
  const rate = `표2 보유기간별 공제율 ${echo.holdingRatePct}% (양도일 시행 소득세법 §95② 표2)`;
  const tail = "+ §104①1호 기본세율 (단기세율 배제) — 감면세액은 없습니다";
  if (echo.outcome === "one_house_table2_kept") {
    return [{
      label: unsold982OutcomeLabel(echo.outcome),
      value: 0,
      formula: `1세대1주택 표2(보유+거주 합산) 공제율이 적용되어 장기보유특별공제 ${echo.appliedDeduction.toLocaleString()}원을 유지했습니다 (법 §98의2①은 「각 표 외의 부분 본문」만 배제) ${tail}`,
    }];
  }
  if (echo.outcome === "rental97_kept") {
    return [{
      label: unsold982OutcomeLabel(echo.outcome),
      value: 0,
      formula: `${rate}로 계산한 장기보유특별공제 ${echo.holdingDeduction.toLocaleString()}원보다 §97의3 특례 공제액 ${echo.appliedDeduction.toLocaleString()}원이 커서 그 공제액을 적용했습니다 ${tail}`,
    }];
  }
  return [{
    label: unsold982OutcomeLabel(echo.outcome),
    value: 0,
    formula:
      `양도차익 × ${rate} = ${echo.appliedDeduction.toLocaleString()}원 ${tail}` +
      (echo.rental97Deduction !== undefined ? ` (§97의3 특례 공제액 ${echo.rental97Deduction.toLocaleString()}원은 적용하지 않음)` : ""),
  }];
}

/** STEP 4.05 결과를 §98의2 평가 결과에 싣는다(적격일 때만). */
export function withUnsold982LthdEcho(detail: UnsoldHybridResult, echo: Unsold982LthdEcho | undefined): UnsoldHybridResult {
  if (!echo || !detail.isEligible || detail.id !== "unsold_98_2") return detail;
  return { ...detail, lthd982Echo: echo, formulaSteps: unsold982FormulaStepsOf(echo) };
}

// ─────────────────────────────────────────────────────────────────
// §98의2 — 특칙 전용
// ─────────────────────────────────────────────────────────────────

export interface Unsold982Input {
  transferDate: Date;
  /** 지방 미분양주택 취득일 (= 양도 자산 취득일) — 시한 1차 기준 */
  acquisitionDate: Date;
  /** 매매계약일 (선택) — 취득일이 기간 외여도 2010.12.31까지 계약+계약금이면 포함 */
  contractDate?: Date;
  /** 거주자 (법①). 기본 true */
  isResident?: boolean;
  /** 수도권 밖 미분양 확인 (령 §98의2① — 2008.11.2까지 미계약·선착순 등) */
  isNonCapitalUnsold?: boolean;
  /** 선착순 공급 취득 또는 사업주체와 최초 매매계약 (령①1·2호) */
  isFirstOrFcfsContract?: boolean;
  /**
   * 매매계약일 현재 입주한 사실 3-state — "no"(없음)만 적용, "yes"(있음)·"unknown"(모름)·미입력은 불성립.
   * 국세청 해석례(법규과-1582·부동산거래관리과-1012) 기준 — 조특법·령 문언에는 제외 규정이 없다(US-15 · Q-1 (A)).
   */
  occupiedAtContract?: "yes" | "no" | "unknown";
}

export function evaluateUnsold982(input: Unsold982Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_2;
  const reasons: UnsoldHybridIneligibleReason[] = [];

  if (input.isResident === false) {
    reasons.push({
      code: "NOT_RESIDENT",
      message: "거주자가 아닌 경우 §98의2이 적용되지 않습니다 (법 ① 본문).",
      legalBasis,
    });
  }
  const inWindow = (d: Date | undefined) =>
    d !== undefined &&
    d.getTime() >= UNSOLD_98_2_PERIOD_FROM.getTime() &&
    d.getTime() <= UNSOLD_98_2_PERIOD_TO.getTime();
  if (!inWindow(input.acquisitionDate) && !inWindow(input.contractDate)) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "취득일(또는 2010.12.31까지의 매매계약일)이 2008.11.3~2010.12.31 취득기간 외입니다 (법 §98의2①).",
      legalBasis,
    });
  }
  reasons.push(...unsold982PeriodGateReasons(input.contractDate, input.transferDate)); // US-17 계약일 하한 · US-18 시행일(2009.1.1.)
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "지방 미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의2①).",
      legalBasis,
    });
  }
  if (input.isNonCapitalUnsold !== true) {
    reasons.push({
      code: "NOT_NONCAPITAL_UNSOLD",
      message: "수도권 밖에 있는 미분양주택 요건(2008.11.2까지 분양계약 미체결 + 선착순 공급 등)이 확인되지 않았습니다 (조특령 §98의2①). 사업주체 최초 매매계약은 2008.11.3 현재 입주자모집공고에 따른 입주자의 계약일이 지나지 아니한 주택에 한정하며, 분양전환된 임대주택은 대상이 아닙니다 (조특령 §98의2①2호 괄호 · 국세청 부동산거래관리과-340·-43).",
      legalBasis: "조특령 §98의2①",
    });
  }
  if (input.isFirstOrFcfsContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "선착순 공급으로 취득하거나 사업주체와 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (조특령 §98의2①1·2호).",
      legalBasis: "조특령 §98의2①",
    });
  }
  if (input.occupiedAtContract !== "no") {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message:
        input.occupiedAtContract === "yes"
          ? "매매계약일 현재 입주한 사실이 있는 주택은 적용하지 않았습니다 (국세청 법규과-1582·부동산거래관리과-1012 해석례 — 조특법·시행령 문언에는 제외 규정이 없어 확인 필요)."
          : "매매계약일 현재 입주한 사실이 없는지 확인되지 않아(모름·미입력) 적용하지 않았습니다 (국세청 법규과-1582·부동산거래관리과-1012 해석례 — 조특법·시행령 문언에는 제외 규정이 없어 확인 필요).",
      legalBasis: "국세청 법규과-1582 · 부동산거래관리과-1012",
    });
  }
  if (reasons.length > 0) return ineligibleHybrid("unsold_98_2", reasons, legalBasis, 0, true);

  return {
    id: "unsold_98_2",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    // 특칙 전용 — 감면세액·소득금액 차감 없음. 장특 표2 + §104①1호는 transfer-tax.ts에서 적용.
    effectCategory: "lthd_rate_special",
    taxReductionRate: 0,
    reductionAmount: 0,
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "within_5_years",
    formulaSteps: [
      {
        label: "특칙 적용 — 장기보유특별공제 표2 보유기간별 공제율 + 기본세율",
        value: 0,
        formula: "양도차익 × 소득세법 §95② 표2 보유기간별 공제율(양도일 시행 표2) + §104①1호 기본세율 (단기세율 배제) — 감면세액은 없습니다",
      },
    ],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt: true, // 감면세액 부재 — 농특세 자체 미발생
    legalBasis,
  };
}

// ─────────────────────────────────────────────────────────────────
// §98의4 — 비거주자 10% 세액감면
// ─────────────────────────────────────────────────────────────────

export interface Unsold984Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 매매계약일 (선택) — 2010.2.11까지 계약+계약금 포함 */
  contractDate?: Date;
  /** 국내사업장 없는 비거주자 확인 (소법 §120) — 미확인 시 적용 불가 (거주자 차단) */
  isNonResidentNoPe?: boolean;
  /** §98의3 미분양주택이 아닌 주택 확인 */
  isNotUnsold983House?: boolean;
}

export function evaluateUnsold984(input: Unsold984Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_4;
  const reasons: UnsoldHybridIneligibleReason[] = [];

  if (input.isNonResidentNoPe !== true) {
    reasons.push({
      code: "NOT_NONRESIDENT",
      message: "소득세법 §120에 따른 국내사업장이 없는 비거주자임이 확인되지 않았습니다 — 거주자는 §98의4를 적용받을 수 없습니다 (§98의3 등 다른 특례 검토).",
      legalBasis,
    });
  }
  const inWindow = (d: Date | undefined) =>
    d !== undefined &&
    d.getTime() >= UNSOLD_98_4_PERIOD_FROM.getTime() &&
    d.getTime() <= UNSOLD_98_4_PERIOD_TO.getTime();
  if (!inWindow(input.acquisitionDate) && !inWindow(input.contractDate)) {
    reasons.push({
      code: "OUT_OF_CONTRACT_PERIOD",
      message: "취득일(또는 2010.2.11까지의 매매계약일)이 2009.3.16~2010.2.11 취득기간 외입니다 (법 §98의4).",
      legalBasis,
    });
  }
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의4).",
      legalBasis,
    });
  }
  if (input.isNotUnsold983House !== true) {
    reasons.push({
      code: "IS_UNSOLD_983_HOUSE",
      message: "§98의3제1항에 따른 미분양주택 외의 주택임이 확인되지 않았습니다 — 미분양주택은 §98의3을 적용합니다 (법 §98의4).",
      legalBasis,
    });
  }
  if (reasons.length > 0) return ineligibleHybrid("unsold_98_4", reasons, legalBasis, UNSOLD_98_4_RATE, false);

  // 10% 세액감면 — 5년 구분 없음 (법문 단일 문장)
  return {
    id: "unsold_98_4",
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: false,
    effectCategory: "tax_amount",
    taxReductionRate: UNSOLD_98_4_RATE,
    reductionAmount: 0, // calcReductions에서 산출세액 × 10% 채움
    reducibleTransferIncome: 0,
    fiveYearRatio: 0,
    signCase: "within_5_years",
    formulaSteps: [
      {
        label: "양도소득세 10% 세액감면 (5년 구분 없음)",
        value: 0,
        formula: "조특법 §98의4 — 양도소득세의 100분의 10에 상당하는 세액을 감면 (감면세액 단계 적용)",
      },
    ],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt: false,
    legalBasis,
  };
}

// ─────────────────────────────────────────────────────────────────
// reduction payload → Input 매핑 (p3 dispatcher에서 호출)
// ─────────────────────────────────────────────────────────────────

export function evaluateP4FromReduction(
  r: ReductionLike,
  ctx: HybridEvalContext,
): UnsoldHybridResult | undefined {
  if (r.type === "unsold_98_2") {
    return evaluateUnsold982({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate982), // Q-19 — 조문 칸이 정본 (자산-수준 매매계약일 대체 제거)
      isResident: (r.isResident982 as boolean | undefined) ?? true,
      isNonCapitalUnsold: r.isNonCapitalUnsold982 as boolean | undefined,
      isFirstOrFcfsContract: r.isFirstOrFcfsContract982 as boolean | undefined,
      occupiedAtContract: r.occupiedAtContract982 as "yes" | "no" | "unknown" | undefined,
    });
  }
  if (r.type === "unsold_98_4") {
    return evaluateUnsold984({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate984) ?? ctx.assetContractDate,
      isNonResidentNoPe: r.isNonResidentNoPe984 as boolean | undefined,
      isNotUnsold983House: r.isNotUnsold983House984 as boolean | undefined,
    });
  }
  return undefined;
}
