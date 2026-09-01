/**
 * P3 하이브리드 감면 — §98의3 · §98의5 · §98의6 (2026-06-12)
 *
 * P2 코어(unsold-hybrid.ts computeHybridEffect)에 rate 일반화로 합류:
 * - §98의3: 서울 밖(지정지역 제외) 미분양 — 100% (수도권과밀억제권역 60%, 대지 660·연면적(전용)
 *   149 이내 한정 — 령 §98의3①단서, 과밀 판정 = 매매계약일 현재 령④). 거주자 2009.2.12~2010.2.11 /
 *   국내사업장 없는 비거주자 2009.3.16~2010.2.11. ② 자기건설(동기간 착공+사용승인, 조합원·멸실 제외).
 *   농특세 비과세 (농특세령 §4⑦1호).
 * - §98의5: 2010.2.11 현재 수도권 밖 미분양 — ~2011.4.30 최초 매매계약. 감면율 = 분양가 인하율별
 *   (≤10% 60% / ≤20% 80% / >20% 100% — 법 ①각호). 위임령 = 조번호 어긋난 령 §98의4 (원문 확정).
 *   농특세 비과세.
 * - §98의6: 준공후미분양 (사용검사·승인 후 2011.3.29 현재 미계약+선착순 — 령 §98의5②) — 50%.
 *   1호: 사업주체등이 ~2011.12.31 임대계약+2년 임대 후 최초 매매계약 취득 (5년 내 50% 세액감면 가능)
 *   2호: 최초 매매계약 취득 후 5년 임대 (등록 후 기산 령⑤ — 5년 내 세액감면 없음, 법 ① "제1호 한정")
 *   제외: 기준시가 합계 6억 초과 또는 연면적(전용) 149 초과 (취득/최초 임대개시 당시 — 령② 단서).
 *   농특세 과세.
 * - 공통 특칙 (법 §98의3④·§98의5③·§98의6③): 장특 표1(§95②단서 시 표2) + 세율 §104①1호 강제 —
 *   suppressShortTermRate 주입 (transfer-tax.ts STEP 7). 중과 배제 = 소령 §167의3①5호.
 */

import { applyRate as applyHybridRate } from "../tax-utils";
import { TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { fullMonthsBetween } from "./unsold-98-8";
import { evaluateP4FromReduction } from "./unsold-hybrid-p4";
import { evaluateP5FromReduction } from "./unsold-hybrid-p5";
import {
  computeHybridEffect,
  ineligibleHybrid,
  evaluateHybridFromReduction as evaluateP2HybridFromReduction,
  toHybridDate,
  type HybridEvalContext,
  type ReductionLike,
  type UnsoldHybridIneligibleReason,
  type UnsoldHybridResult,
} from "./unsold-hybrid";

// UTC 자정 파싱 (T suffix 금지)
export const UNSOLD_98_3_PERIOD_FROM_RESIDENT = new Date("2009-02-12");
export const UNSOLD_98_3_PERIOD_FROM_NONRESIDENT = new Date("2009-03-16");
export const UNSOLD_98_3_PERIOD_TO = new Date("2010-02-11");
/** 령 §98의3①단서 — 과밀억제권역 한정 면적 (대지 660·연면적(전용) 149 이내) */
export const UNSOLD_98_3_OVERCON_LAND_LIMIT = 660;
export const UNSOLD_98_3_OVERCON_FLOOR_LIMIT = 149;
export const UNSOLD_98_3_OVERCON_RATE = 0.6;

export const UNSOLD_98_5_CONTRACT_TO = new Date("2011-04-30");
/** 사실상 시작 경계 — 2010.2.11 현재 미분양 컷오프 (그 이전 본인 계약은 미분양 모순, D-8) */
export const UNSOLD_98_5_CONTRACT_FROM = new Date("2010-02-12");

export const UNSOLD_98_6_RENTAL_CONTRACT_TO = new Date("2011-12-31");
export const UNSOLD_98_6_RATE = 0.5;
/** 령 §98의5② 단서 — 주택+부수토지 기준시가 합계 6억·연면적(전용) 149 (초과 시 제외 — OR) */
export const UNSOLD_98_6_STD_SUM_LIMIT = 600_000_000;
export const UNSOLD_98_6_FLOOR_LIMIT = 149;
export const UNSOLD_98_6_RENTAL_MONTHS = 60;

/** 특칙 — 단기세율(§104①2·3호) 배제 대상 (법 §98의2①·§98의3④·§98의5③·§98의6③ 각 2호) */
export const RATE_SPECIAL_REDUCTION_IDS: ReadonlyArray<string> = [
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
];

// ─────────────────────────────────────────────────────────────────
// §98의3
// ─────────────────────────────────────────────────────────────────

export interface Unsold983Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 거주자 / 국내사업장 없는 비거주자 (소법 §120) — 시한 시작일 분기 */
  residencyType?: "resident" | "nonresident_no_pe";
  /** 사업주체 취득(법①) / 자기건설(법②) */
  houseType?: "purchased" | "self_built";
  /** 최초 매매계약일 — purchased (시한: 거주자 2009.2.12~ / 비거주자 2009.3.16~ ~2010.2.11) */
  contractDate?: Date;
  /** 착공일 — self_built (동기간 내) */
  constructionStartDate?: Date;
  /** 사용승인·사용검사일 (임시 포함) — self_built (동기간 내) */
  usageApprovalDate?: Date;
  /** 서울 밖 + 지정지역(소법 §104의2) 아님 — 통합 확인 */
  isOutsideSeoulNotDesignated?: boolean;
  /** 수도권과밀억제권역 (매매계약일 현재 — 령④). ON 시 60% + 면적 한정 */
  isOverconcentration?: boolean;
  /** 대지면적 (㎡) — 과밀 시 660 이내 한정 */
  landAreaSqm?: number;
  /** 주택 연면적(공동주택 전용, ㎡) — 과밀 시 149 이내 한정 */
  floorAreaSqm?: number;
  /** 미분양 확인 (령① — 2009.2.11까지 미계약·선착순 등) */
  isUnsoldConfirmed?: boolean;
  /** 사업주체(20호 미만 주택건설사업자 포함)와 최초 매매계약 */
  isFirstContract?: boolean;
  /** 매매계약일 현재 입주사실 없음 (령②1호) */
  isNotOccupiedAtContract?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령②2·3호) */
  isNotRecontract?: boolean;
  /** 자기건설 — 조합원 관리처분·멸실 재건축 아님 (법②단서) */
  isNotExcludedSelfBuilt?: boolean;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

export function evaluateUnsold983(input: Unsold983Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_3;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  const houseType = input.houseType ?? "purchased";
  const isOvercon = input.isOverconcentration === true;
  const rate = isOvercon ? UNSOLD_98_3_OVERCON_RATE : 1.0;
  const from =
    input.residencyType === "nonresident_no_pe"
      ? UNSOLD_98_3_PERIOD_FROM_NONRESIDENT
      : UNSOLD_98_3_PERIOD_FROM_RESIDENT;

  // 1) 시한 — purchased: 매매계약일 / self_built: 착공일 AND 사용승인일 (법②)
  if (houseType === "self_built") {
    if (!input.constructionStartDate || !input.usageApprovalDate) {
      reasons.push({
        code: "MISSING_SELF_BUILT_DATES",
        message: "자기건설 주택의 착공일과 사용승인·사용검사일이 모두 입력되어야 합니다 (법 §98의3② — 2009.2.12~2010.2.11 기간 내 착공·사용승인).",
        legalBasis,
      });
    } else {
      const within = (d: Date) =>
        d.getTime() >= UNSOLD_98_3_PERIOD_FROM_RESIDENT.getTime() &&
        d.getTime() <= UNSOLD_98_3_PERIOD_TO.getTime();
      if (!within(input.constructionStartDate) || !within(input.usageApprovalDate)) {
        reasons.push({
          code: "OUT_OF_CONTRACT_PERIOD",
          message: "착공일·사용승인일이 2009.2.12~2010.2.11 기간 외입니다 (법 §98의3②).",
          legalBasis,
        });
      }
    }
  } else {
    if (!input.contractDate) {
      reasons.push({
        code: "MISSING_CONTRACT_DATE",
        message: "최초 매매계약일이 입력되지 않았습니다 (거주자 2009.2.12~2010.2.11 / 국내사업장 없는 비거주자 2009.3.16~2010.2.11).",
        legalBasis,
      });
    } else if (
      input.contractDate.getTime() < from.getTime() ||
      input.contractDate.getTime() > UNSOLD_98_3_PERIOD_TO.getTime()
    ) {
      reasons.push({
        code: "OUT_OF_CONTRACT_PERIOD",
        message:
          input.residencyType === "nonresident_no_pe"
            ? "최초 매매계약일이 비거주자 적용기간(2009.3.16~2010.2.11) 외입니다 (법 §98의3①2호)."
            : "최초 매매계약일이 거주자 적용기간(2009.2.12~2010.2.11) 외입니다 (법 §98의3①1호).",
        legalBasis,
      });
    }
  }

  // 2) 지역 — 서울 밖 + 지정지역 아님
  if (input.isOutsideSeoulNotDesignated !== true) {
    reasons.push({
      code: "NOT_OUTSIDE_SEOUL",
      message: "서울특별시 밖의 지역(소득세법 §104의2 지정지역 제외)에 있는 주택임이 확인되지 않았습니다 (법 §98의3① 본문).",
      legalBasis,
    });
  }
  // 3) 과밀억제권역 — 면적 한정 (대지 660 이내 AND 연면적 149 이내)
  if (isOvercon) {
    if (!(input.landAreaSqm !== undefined && input.landAreaSqm > 0) ||
        !(input.floorAreaSqm !== undefined && input.floorAreaSqm > 0)) {
      reasons.push({
        code: "MISSING_AREA",
        message: "수도권과밀억제권역 주택은 대지면적과 연면적(공동주택은 전용면적)을 입력해야 합니다 (조특령 §98의3①단서 — 660㎡·149㎡ 이내 한정).",
        legalBasis: "조특령 §98의3①단서",
      });
    } else if (
      input.landAreaSqm > UNSOLD_98_3_OVERCON_LAND_LIMIT ||
      input.floorAreaSqm > UNSOLD_98_3_OVERCON_FLOOR_LIMIT
    ) {
      reasons.push({
        code: "AREA_LIMIT_EXCEEDED",
        message: "수도권과밀억제권역 주택은 대지면적 660㎡ 이내이고 연면적(전용면적) 149㎡ 이내인 경우에 한정됩니다 (조특령 §98의3①단서).",
        legalBasis: "조특령 §98의3①단서",
      });
    }
  }
  // 4) 양도 시점
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의3①).",
      legalBasis,
    });
  }
  // 5) 자격 토글
  if (input.isUnsoldConfirmed !== true) {
    reasons.push({
      code: "NOT_UNSOLD_CONFIRMED",
      message: "미분양주택 요건(2009.2.11까지 분양계약 미체결 + 2009.2.12 이후 선착순 공급 등)이 확인되지 않았습니다 (조특령 §98의3①).",
      legalBasis: "조특령 §98의3①",
    });
  }
  if (houseType === "purchased" && input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체(20호 미만 주택건설사업자 포함)와 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (법 §98의3①).",
      legalBasis,
    });
  }
  if (houseType === "purchased" && input.isNotOccupiedAtContract !== true) {
    reasons.push({
      code: "OCCUPIED_AT_CONTRACT",
      message: "매매계약일 현재 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의3②1호).",
      legalBasis: "조특령 §98의3②1호",
    });
  }
  if (houseType === "purchased" && input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의3②2·3호).",
      legalBasis: "조특령 §98의3②2·3호",
    });
  }
  if (houseType === "self_built" && input.isNotExcludedSelfBuilt !== true) {
    reasons.push({
      code: "SELF_BUILT_EXCLUDED",
      message: "정비사업조합원이 관리처분계획에 따라 취득한 주택·멸실 후 재건축한 주택이 아님이 확인되지 않았습니다 (법 §98의3②단서).",
      legalBasis,
    });
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_3", reasons, legalBasis, rate, true);

  return computeHybridEffect({
    id: "unsold_98_3",
    legalBasis,
    articleLabel: isOvercon ? "조특법 §98의3① (수도권과밀억제권역 60%)" : "조특법 §98의3①",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의3③",
    rate,
    ruralSurtaxExempt: true, // 농특세령 §4⑦1호
  });
}

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
      message: "최초 매매계약일이 적용기간(2010.2.11 현재 미분양 ~ 2011.4.30 계약) 외입니다 (법 §98의5①).",
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

// ─────────────────────────────────────────────────────────────────
// §98의6
// ─────────────────────────────────────────────────────────────────

export interface Unsold986Input {
  transferDate: Date;
  acquisitionDate: Date;
  /** 1호: 사업주체등 2년 임대 후 취득 / 2호: 취득 후 5년 임대 */
  hoType?: "seller_rented" | "buyer_rented";
  /** 최초 매매계약일 */
  contractDate?: Date;
  /** 주택+부수토지 기준시가 합계 (원) — 취득 당시 (1호는 최초 임대개시 당시). 6억 초과 제외 */
  stdPriceSumAtBase?: number;
  /** 연면적 (공동주택 전용, ㎡) — 149 초과 제외 */
  floorAreaSqm?: number;
  /** 준공후미분양 확인 (사용검사·승인 후 2011.3.29 현재 미계약 + 선착순 — 령②) */
  isUnsoldAfterCompletion?: boolean;
  /** 사업주체등과 최초 매매계약 */
  isFirstContract?: boolean;
  /** 준공 후 입주사실 없음 (령③1호) */
  isNotOccupiedAfterCompletion?: boolean;
  /** 해제 후 재계약·대체취득 아님 (령③2·3호) */
  isNotRecontract?: boolean;
  /** (1호) 사업주체등이 2011.12.31까지 임대계약 체결 + 2년 이상 임대 확인 */
  sellerRented2Years?: boolean;
  /** (2호) 임대계약 체결일 (~2011.12.31 한정) */
  rentalContractDate?: Date;
  /** (2호) 임대개시일 — 사업자등록+임대사업자등록 후 (령⑤1호 기산) */
  rentalStartDate?: Date;
  /** (2호) 임대종료일 — 미입력 시 양도일까지 계속 */
  rentalEndDate?: Date;
  /** (2호) 상속 합산 피상속인 임대기간 (개월 — 령⑤2호) */
  inheritedRentalMonths?: number;
  transferIncome: number;
  standardPriceAtAcquisition?: number;
  standardPriceAt5Years?: number;
  standardPriceAtTransfer?: number;
}

export function evaluateUnsold986(input: Unsold986Input): UnsoldHybridResult {
  const legalBasis = TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_6;
  const reasons: UnsoldHybridIneligibleReason[] = [];
  const hoType = input.hoType ?? "seller_rented";
  const rate = UNSOLD_98_6_RATE;

  // 1) 기준시가 합계 6억 + 연면적 149 (초과 시 제외 — OR, 령② 단서)
  if (input.stdPriceSumAtBase === undefined || input.stdPriceSumAtBase <= 0) {
    reasons.push({
      code: "MISSING_STD_SUM",
      message: `주택과 부수토지의 기준시가 합계(${hoType === "seller_rented" ? "최초 임대개시 당시" : "취득 당시"})가 입력되지 않았습니다 (조특령 §98의5② 단서 — 6억 한도).`,
      legalBasis: "조특령 §98의5②",
    });
  } else if (input.stdPriceSumAtBase > UNSOLD_98_6_STD_SUM_LIMIT) {
    reasons.push({
      code: "STD_SUM_LIMIT_EXCEEDED",
      message: "주택과 부수토지의 기준시가 합계가 6억원을 초과합니다 (조특령 §98의5② 단서).",
      legalBasis: "조특령 §98의5②",
    });
  }
  if (input.floorAreaSqm === undefined || input.floorAreaSqm <= 0) {
    reasons.push({
      code: "MISSING_AREA",
      message: "연면적(공동주택은 전용면적)이 입력되지 않았습니다 (149㎡ 한도 검증).",
      legalBasis: "조특령 §98의5②",
    });
  } else if (input.floorAreaSqm > UNSOLD_98_6_FLOOR_LIMIT) {
    reasons.push({
      code: "AREA_LIMIT_EXCEEDED",
      message: "연면적(전용면적)이 149㎡를 초과합니다 (조특령 §98의5② 단서).",
      legalBasis: "조특령 §98의5②",
    });
  }
  // 2) 양도 시점
  if (input.transferDate.getTime() <= input.acquisitionDate.getTime()) {
    reasons.push({
      code: "TRANSFER_BEFORE_ACQUISITION",
      message: "준공후미분양주택을 취득한 후에 양도하는 경우에만 적용됩니다 (법 §98의6①).",
      legalBasis,
    });
  }
  // 3) 자격 토글 공통
  if (input.isUnsoldAfterCompletion !== true) {
    reasons.push({
      code: "NOT_UNSOLD_AFTER_COMPLETION",
      message: "준공후미분양 요건(사용검사·사용승인 후 2011.3.29 현재 분양계약 미체결 + 선착순 공급)이 확인되지 않았습니다 (조특령 §98의5②).",
      legalBasis: "조특령 §98의5②",
    });
  }
  if (input.isFirstContract !== true) {
    reasons.push({
      code: "NOT_FIRST_CONTRACT",
      message: "사업주체등과 최초로 매매계약을 체결한 요건이 확인되지 않았습니다 (법 §98의6①).",
      legalBasis,
    });
  }
  if (input.isNotOccupiedAfterCompletion !== true) {
    reasons.push({
      code: "OCCUPIED_AFTER_COMPLETION",
      message: "준공 후 입주한 사실이 없는 주택임이 확인되지 않았습니다 (조특령 §98의5③1호).",
      legalBasis: "조특령 §98의5③1호",
    });
  }
  if (input.isNotRecontract !== true) {
    reasons.push({
      code: "RECONTRACT_EXCLUDED",
      message: "계약 해제 후 본인·배우자(직계존비속·형제자매 포함) 재계약 또는 대체취득 주택이 아님이 확인되지 않았습니다 (조특령 §98의5③2·3호).",
      legalBasis: "조특령 §98의5③2·3호",
    });
  }
  // 4) 호별 임대 요건
  if (hoType === "seller_rented") {
    if (input.sellerRented2Years !== true) {
      reasons.push({
        code: "SELLER_RENTAL_NOT_CONFIRMED",
        message: "사업주체등이 2011.12.31까지 임대계약을 체결하여 2년 이상 임대한 주택임이 확인되지 않았습니다 (법 §98의6①1호).",
        legalBasis,
      });
    }
  } else {
    if (!input.rentalContractDate) {
      reasons.push({
        code: "MISSING_RENTAL_CONTRACT_DATE",
        message: "임대계약 체결일이 입력되지 않았습니다 (2011.12.31 이전 임대계약 체결에 한정 — 법 §98의6①2호).",
        legalBasis,
      });
    } else if (input.rentalContractDate.getTime() > UNSOLD_98_6_RENTAL_CONTRACT_TO.getTime()) {
      reasons.push({
        code: "RENTAL_CONTRACT_TOO_LATE",
        message: "임대계약 체결일이 2011.12.31 이후입니다 (법 §98의6①2호 — 2011.12.31 이전 체결에 한정).",
        legalBasis,
      });
    }
    let rentalMonths = 0;
    if (!input.rentalStartDate) {
      reasons.push({
        code: "MISSING_RENTAL_START",
        message: "임대개시일이 입력되지 않았습니다 (사업자등록과 임대사업자등록 후 임대를 개시한 날부터 기산 — 조특령 §98의5⑤1호).",
        legalBasis: "조특령 §98의5⑤",
      });
    } else {
      const rentalEnd = input.rentalEndDate ?? input.transferDate;
      rentalMonths = fullMonthsBetween(input.rentalStartDate, rentalEnd) + (input.inheritedRentalMonths ?? 0);
      if (rentalMonths < UNSOLD_98_6_RENTAL_MONTHS) {
        reasons.push({
          code: "RENTAL_PERIOD_SHORT",
          message: `임대기간이 5년(60개월) 미만입니다 (인정 임대기간 ${rentalMonths}개월 — 등록 후 임대개시일부터 기산${input.inheritedRentalMonths ? `, 피상속인 ${input.inheritedRentalMonths}개월 합산` : ""}).`,
          legalBasis: "조특령 §98의5⑤",
        });
      }
    }
  }

  if (reasons.length > 0) return ineligibleHybrid("unsold_98_6", reasons, legalBasis, rate, false);

  return computeHybridEffect({
    id: "unsold_98_6",
    legalBasis,
    articleLabel: hoType === "seller_rented" ? "조특법 §98의6①1호" : "조특법 §98의6①2호",
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    transferIncome: input.transferIncome,
    standardPriceAtAcquisition: input.standardPriceAtAcquisition,
    standardPriceAt5Years: input.standardPriceAt5Years,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    allocationLegalBasis: "조특령 §98의5④",
    rate,
    ruralSurtaxExempt: false,
    // 5년 내 세액감면은 1호 한정 (법 ① "제1호의 요건을 갖춘 주택에 한정한다")
    allowWithin5YTaxAmount: hoType === "seller_rented",
    within5YIneligibleReason: {
      code: "NO_WITHIN_5Y_BENEFIT",
      message: "취득일부터 5년 이내 양도 시 세액감면은 제1호(사업주체등이 2년 이상 임대한 주택을 취득) 요건을 갖춘 주택에 한정됩니다 — 제2호(취득 후 5년 임대)는 5년이 지난 후 양도분 차감만 적용됩니다 (법 §98의6①).",
      legalBasis,
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// 통합 dispatcher — P2 + P3 (router·calcReductions 진입점)
// ─────────────────────────────────────────────────────────────────

export const ALL_HYBRID_IDS: ReadonlyArray<string> = [
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  "unsold_98_4",
  "unsold_98",
];

/**
 * calcReductions 진입점 (P2+P3 통합) — 5년 내 세액감면 후보 (§127⑦ max 패턴).
 * eligible && tax_amount일 때만 reductionAmount = 산출세액 × rate 채움.
 */
export function evaluateAnyHybridTaxAmount(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: {
    transferDate: Date;
    acquisitionDate?: Date;
    assetContractDate?: Date;
    calculatedTax: number;
  },
): UnsoldHybridResult | undefined {
  if (!reductions || !ctx.acquisitionDate) return undefined;
  const r = reductions.find((x) => ALL_HYBRID_IDS.includes(x.type)) as ReductionLike | undefined;
  if (!r) return undefined;
  const detail = evaluateAnyHybridFromReduction(r, {
    transferDate: ctx.transferDate,
    acquisitionDate: ctx.acquisitionDate,
    assetContractDate: ctx.assetContractDate,
    transferIncome: 0, // tax_amount 판정에는 소득금액 불요 (5년 후 경로는 router가 담당)
  });
  if (!detail) return undefined;
  if (detail.isEligible && detail.effectCategory === "tax_amount") {
    return { ...detail, reductionAmount: applyHybridRate(ctx.calculatedTax, detail.taxReductionRate) };
  }
  return detail;
}

export function evaluateAnyHybridFromReduction(
  r: ReductionLike,
  ctx: HybridEvalContext,
): UnsoldHybridResult | undefined {
  if (r.type === "unsold_98_3") {
    return evaluateUnsold983({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      residencyType: r.residencyType983 as Unsold983Input["residencyType"],
      houseType: r.houseType983 as Unsold983Input["houseType"],
      contractDate: toHybridDate(r.contractDate983) ?? ctx.assetContractDate,
      constructionStartDate: toHybridDate(r.constructionStartDate983),
      usageApprovalDate: toHybridDate(r.usageApprovalDate983),
      isOutsideSeoulNotDesignated: r.isOutsideSeoulNotDesignated983 as boolean | undefined,
      isOverconcentration: r.isOverconcentration983 as boolean | undefined,
      landAreaSqm: r.landAreaSqm983 as number | undefined,
      floorAreaSqm: r.floorAreaSqm983 as number | undefined,
      isUnsoldConfirmed: r.isUnsoldConfirmed983 as boolean | undefined,
      isFirstContract: r.isFirstContract983 as boolean | undefined,
      isNotOccupiedAtContract: r.isNotOccupiedAtContract983 as boolean | undefined,
      isNotRecontract: r.isNotRecontract983 as boolean | undefined,
      isNotExcludedSelfBuilt: r.isNotExcludedSelfBuilt983 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition983 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years983 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer983 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  if (r.type === "unsold_98_5") {
    return evaluateUnsold985({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      contractDate: toHybridDate(r.contractDate985) ?? ctx.assetContractDate,
      priceReductionRatePct: r.priceReductionRatePct985 as number | undefined,
      isNonCapitalUnsoldAtCutoff: r.isNonCapitalUnsoldAtCutoff985 as boolean | undefined,
      isFirstContract: r.isFirstContract985 as boolean | undefined,
      isNotOccupiedAtContract: r.isNotOccupiedAtContract985 as boolean | undefined,
      isNotRecontract: r.isNotRecontract985 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition985 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years985 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer985 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  if (r.type === "unsold_98_6") {
    return evaluateUnsold986({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      hoType: r.hoType986 as Unsold986Input["hoType"],
      contractDate: toHybridDate(r.contractDate986) ?? ctx.assetContractDate,
      stdPriceSumAtBase: r.stdPriceSumAtBase986 as number | undefined,
      floorAreaSqm: r.floorAreaSqm986 as number | undefined,
      isUnsoldAfterCompletion: r.isUnsoldAfterCompletion986 as boolean | undefined,
      isFirstContract: r.isFirstContract986 as boolean | undefined,
      isNotOccupiedAfterCompletion: r.isNotOccupiedAfterCompletion986 as boolean | undefined,
      isNotRecontract: r.isNotRecontract986 as boolean | undefined,
      sellerRented2Years: r.sellerRented2Years986 as boolean | undefined,
      rentalContractDate: toHybridDate(r.rentalContractDate986),
      rentalStartDate: toHybridDate(r.rentalStartDate986),
      rentalEndDate: toHybridDate(r.rentalEndDate986),
      inheritedRentalMonths: r.inheritedRentalMonths986 as number | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r.standardPriceAtAcquisition986 as number | undefined,
      standardPriceAt5Years: r.standardPriceAt5Years986 as number | undefined,
      standardPriceAtTransfer:
        (r.standardPriceAtTransfer986 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
  }
  // P5 (§98) → P4 (§98의2·§98의4) → P2 (§98의7·§99의2) 순 위임
  return (
    evaluateP5FromReduction(r, ctx) ??
    evaluateP4FromReduction(r, ctx) ??
    evaluateP2HybridFromReduction(r, ctx)
  );
}
