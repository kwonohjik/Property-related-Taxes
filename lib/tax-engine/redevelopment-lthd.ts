/**
 * 재개발/재건축 — 분기별 LTHD 보유기간·율 산정
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13):
 * - ★ 시행령 §166⑤ — LTHD 보유기간 분기 (호별 명시):
 *     1호:     인가전양도차익 보유기간 = 취득일 ~ 관리처분 인가일 (입주권 양도 시)
 *     2호가목: APT 청산금납부분양도차익 보유기간 = 관리처분 인가일 ~ 신축양도일
 *     2호나목: APT 기존건물분양도차익 보유기간 = 취득일 ~ 신축양도일 (전체)
 *
 * - 본법 §95② 단서 — 입주권 양도 시 인가전 분만 LTHD (원조합원 한정, 승계 0)
 * - 본법 §95④ — LTHD 보유기간 = 취득일~양도일 (청산금 수령 LTHD 종료일 도출)
 * - NTS 집행기준 — 청산금 수령분 양도시기 = 소유권이전 고시일 다음날
 *
 * LTHD 율 산식 (소법 §95② 표1/표2):
 * - 표1 (일반): 3년차 6% / 매년 2% 가산 / 15년+ 30% 캡
 * - 표2 (1세대1주택 + 거주 2년+): 보유 × 4% (40% 캡) + 거주 × 4% (40% 캡) = 80% 캡
 *
 * 사례 44 검증:
 * - preApproval (apt + housing): 2005-04-09 ~ 2023-02-16 ≈ 17년 10월 → 표1 30% 캡
 * - postApprovalExistingHouse (apt): 동일 17년 10월 → 동일 30% (묶음 동일 율 강제)
 * - settlement (apt + pay): 2009-10-23 ~ 2023-02-16 ≈ 13년 3월 → 표1 26%
 */

import { applyRate } from "./tax-utils";
import { calculateHoldingPeriod } from "./tax-utils";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// 입력·결과
// ──────────────────────────────────────────────────────────────────────────────

/** 분기별 LTHD 산정 입력 */
export interface RedevelopmentLthdInput {
  /** RedevelopmentInfo (subject·approvalDate·settlementDirection·settlementSaleDate) */
  redevelopment: RedevelopmentInfo;

  /** 자산 취득일 */
  acquisitionDate: Date;

  /** 자산 양도일 (완공 APT 양도일 또는 입주권 양도일) */
  transferDate: Date;

  /** 입주권 양도 시 승계조합원 여부 (true 시 LTHD 0 — §95② 단서) */
  isSuccessorRightToMoveIn?: boolean;

  /** 1세대 1주택 여부 (표2 적용 분기) */
  isOneHouseSingle?: boolean;

  /** 거주기간 개월 (표2 거주분 적용용) */
  residencePeriodMonths?: number;
}

/** 분기별 LTHD 산정 결과 (3분기 각각) */
export interface RedevelopmentLthdBranch {
  /** 보유기간 (months 단위) */
  holdingMonths: number;
  /** 보유기간 (years 정수 — 표 적용용) */
  holdingYears: number;
  /** LTHD 율 (0~0.8) */
  rate: number;
  /** LTHD 산정 가능 여부 (false 시 LTHD 대상 자체 부존재) */
  applicable: boolean;
  /** 비적용 사유 (UI 표시용) */
  reason?: string;
}

/** 분기별 LTHD 결과 — 3분기 묶음 */
export interface RedevelopmentLthdResult {
  preApproval: RedevelopmentLthdBranch;
  postApprovalExistingHouse: RedevelopmentLthdBranch;
  settlement: RedevelopmentLthdBranch;
}

// ──────────────────────────────────────────────────────────────────────────────
// 본문 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 분기별 LTHD 보유기간·율 산정.
 *
 * §166⑤ 호별 보유기간 + §95② 단서 분기 처리:
 * - subject="right" (입주권 양도): 인가전 분만 LTHD (원조합원), 나머지 부존재
 * - subject="apt" (완공 APT 양도): 3분기 모두 LTHD (단, 묶음 LTHD율 동일 강제)
 *
 * @returns 3분기 각각의 보유기간·율·적용 가능 여부
 */
export function computeRedevelopmentLthd(
  input: RedevelopmentLthdInput,
): RedevelopmentLthdResult {
  const { redevelopment, acquisitionDate, transferDate, isSuccessorRightToMoveIn } = input;
  const { subject, approvalDate, settlementDirection, settlementSaleDate } = redevelopment;

  // ─ subject="right" (입주권 양도) 분기 ─
  if (subject === "right") {
    return computeRightLthd({
      acquisitionDate,
      approvalDate,
      isSuccessorRightToMoveIn: isSuccessorRightToMoveIn ?? false,
      isOneHouseSingle: input.isOneHouseSingle ?? false,
      residencePeriodMonths: input.residencePeriodMonths ?? 0,
    });
  }

  // ─ subject="apt" (완공 APT 양도) 분기 ─
  return computeAptLthd({
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle: input.isOneHouseSingle ?? false,
    residencePeriodMonths: input.residencePeriodMonths ?? 0,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 입주권 양도 (§166⑤1호 + §95② 단서)
// ──────────────────────────────────────────────────────────────────────────────

function computeRightLthd(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  isSuccessorRightToMoveIn: boolean;
  isOneHouseSingle: boolean;
  residencePeriodMonths: number;
}): RedevelopmentLthdResult {
  const {
    acquisitionDate,
    approvalDate,
    isSuccessorRightToMoveIn,
    isOneHouseSingle,
    residencePeriodMonths,
  } = args;

  // §95② 단서: 승계조합원은 LTHD 0
  if (isSuccessorRightToMoveIn) {
    return {
      preApproval: zeroBranch("§95② 단서 — 승계조합원(조합원으로부터 취득)은 LTHD 미적용"),
      postApprovalExistingHouse: zeroBranch("입주권 양도 시 인가후 기존주택분 양도차익은 LTHD 대상 부존재 (§95② 단서·§166⑤1호)"),
      settlement: zeroBranch("입주권 양도 시 청산금은 LTHD 대상 자산 부존재 (§94① 범위 외)"),
    };
  }

  // 원조합원: 인가전 분만 LTHD (§166⑤1호 — 취득일 ~ 관리처분 인가일)
  const preApprovalHolding = calculateHoldingPeriod(acquisitionDate, approvalDate);
  const preApprovalMonths = preApprovalHolding.years * 12 + preApprovalHolding.months;
  const preApprovalRate = computeLthdRate(
    preApprovalHolding.years,
    isOneHouseSingle,
    Math.floor(residencePeriodMonths / 12),
  );

  return {
    preApproval: {
      holdingMonths: preApprovalMonths,
      holdingYears: preApprovalHolding.years,
      rate: preApprovalRate,
      applicable: true,
    },
    postApprovalExistingHouse: zeroBranch("입주권 양도 시 인가후 기존주택분 양도차익은 LTHD 대상 부존재 (§95② 단서·§166⑤1호)"),
    settlement: zeroBranch("입주권 양도 시 청산금은 LTHD 대상 자산 부존재 (§94① 범위 외)"),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 완공 APT 양도 (§166⑤2호 + 묶음 동일 율 강제)
// ──────────────────────────────────────────────────────────────────────────────

function computeAptLthd(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  transferDate: Date;
  settlementDirection: "pay" | "receive";
  settlementSaleDate?: Date;
  isOneHouseSingle: boolean;
  residencePeriodMonths: number;
}): RedevelopmentLthdResult {
  const {
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle,
    residencePeriodMonths,
  } = args;

  const residenceYears = Math.floor(residencePeriodMonths / 12);

  // ─ §166⑤2호나목: 기존건물분 (preApproval + postApprovalExistingHouse) = 취득일 ~ 신축양도일 ─
  // 묶음 동일 보유기간 → 동일 LTHD율 (분배법칙으로 분기별 산출해도 합계 동일)
  const existingHolding = calculateHoldingPeriod(acquisitionDate, transferDate);
  const existingMonths = existingHolding.years * 12 + existingHolding.months;
  const existingRate = computeLthdRate(existingHolding.years, isOneHouseSingle, residenceYears);

  const preApprovalBranch: RedevelopmentLthdBranch = {
    holdingMonths: existingMonths,
    holdingYears: existingHolding.years,
    rate: existingRate,
    applicable: true,
  };
  const postApprovalBranch: RedevelopmentLthdBranch = { ...preApprovalBranch };

  // ─ 청산금 분 보유기간 ─
  let settlementBranch: RedevelopmentLthdBranch;
  if (settlementDirection === "pay") {
    // §166⑤2호가목: 인가일 ~ 신축양도일
    const payHolding = calculateHoldingPeriod(approvalDate, transferDate);
    const payMonths = payHolding.years * 12 + payHolding.months;
    settlementBranch = {
      holdingMonths: payMonths,
      holdingYears: payHolding.years,
      rate: computeLthdRate(payHolding.years, isOneHouseSingle, residenceYears),
      applicable: true,
    };
  } else {
    // 수령: §95④ + NTS 집행기준 — 취득일 ~ settlementSaleDate (소유권이전 고시일 다음날)
    // settlementSaleDate 미입력 시 transferDate로 fallback (validation에서 차단되어야 함)
    const endDate = settlementSaleDate ?? transferDate;
    const receiveHolding = calculateHoldingPeriod(acquisitionDate, endDate);
    const receiveMonths = receiveHolding.years * 12 + receiveHolding.months;
    settlementBranch = {
      holdingMonths: receiveMonths,
      holdingYears: receiveHolding.years,
      rate: computeLthdRate(receiveHolding.years, isOneHouseSingle, residenceYears),
      applicable: true,
    };
  }

  return {
    preApproval: preApprovalBranch,
    postApprovalExistingHouse: postApprovalBranch,
    settlement: settlementBranch,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/**
 * LTHD 율 산정 (표1·표2 분기).
 *
 * 소법 §95② 별표:
 * - 표1 (일반): 3년 미만 0% / 3년차 6% / 매년 2% 가산 / 15년+ 30% 캡
 * - 표2 (1세대1주택 + 거주 2년+): 보유 × 4% (40% 캡) + 거주 × 4% (40% 캡)
 *
 * @param years 보유 연수 (정수, 보유개월 / 12 floor)
 * @param isOneHouseSingle 1세대1주택 여부
 * @param residenceYears 거주 연수 (정수)
 */
function computeLthdRate(
  years: number,
  isOneHouseSingle: boolean,
  residenceYears: number,
): number {
  if (years < 3) return 0;

  if (isOneHouseSingle && residenceYears >= 2) {
    // 표2: 보유분 4% + 거주분 4%, 각 40% 캡
    const holdingPart = Math.min(years * 0.04, 0.40);
    const residencePart = Math.min(residenceYears * 0.04, 0.40);
    return holdingPart + residencePart;
  }

  // 표1: 보유 × 2%, 최대 30%
  return Math.min(years * 0.02, 0.30);
}

/** LTHD 대상 부존재 분기 (입주권 양도 인가후·청산금) */
function zeroBranch(reason: string): RedevelopmentLthdBranch {
  return {
    holdingMonths: 0,
    holdingYears: 0,
    rate: 0,
    applicable: false,
    reason,
  };
}

/**
 * 양도차익 × LTHD율 → LTHD 금액 (분기별).
 * applyRate (Math.floor) 사용 — 세법 정수연산 원칙.
 *
 * 묶음 양도차익 (preApproval + postApprovalExistingHouse) × 동일 율 = 분기별 산출 합 (분배법칙).
 */
export function applyLthdToGain(gain: number, rate: number): number {
  if (gain <= 0 || rate <= 0) return 0;
  return applyRate(gain, rate);
}
