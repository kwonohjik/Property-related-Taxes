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

  /**
   * 거주기간 개월 (legacy 단일값 — 신규 두 필드가 모두 undefined 일 때 fallback).
   * 신규 케이스에서는 priorHouseResidenceMonths + newHouseResidenceMonths 사용 권장.
   */
  residencePeriodMonths?: number;

  /**
   * 종전주택 거주개월수 (시행령 §154⑧ 통산 산식의 prior 분량).
   * 기존건물분(인가전+인가후 비청산) LTHD 표2 거주분 = prior + new (통산).
   */
  priorHouseResidenceMonths?: number;

  /**
   * 신축주택 거주개월수.
   * 청산금납부분 LTHD 표2 진입 가드 — 사전법령해석재산 2020-386.
   */
  newHouseResidenceMonths?: number;
}

/** 분기별 LTHD 산정 결과 (3분기 각각) */
export interface RedevelopmentLthdBranch {
  /** 보유기간 (months 단위) */
  holdingMonths: number;
  /** 보유기간 잔여 일수 (X년 Y월 Z일 표시용 — 사례 46 신고서 양식 표 정합) */
  holdingDays?: number;
  /** 보유기간 (years 정수 — 표 적용용) */
  holdingYears: number;
  /** LTHD 율 (0~0.8) — holdingRate + residenceRate */
  rate: number;
  /** LTHD 보유분 율 (표1: rate 전액, 표2: 0~0.40) */
  holdingRate: number;
  /** LTHD 거주분 율 (표1: 0, 표2: 0~0.40, 거주 2년+ 가드) */
  residenceRate: number;
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

  // ─ 사례 46 가드: exemptionEligibleAtApproval=false 시 표1 강등 ─
  // 서면2016-법령해석재산-2705 (2017.02.13) — 청산금 수령분 1세대1주택 비과세 판정 시점:
  // 보유·거주요건은 관리처분계획인가일 현재 기준. 인가일 기준 2년 미충족 시
  // 1세대1주택 비과세 미해당 → LTHD 표2 진입 차단, 표1 강제.
  // undefined 시 legacy isOneHouseSingle fallback (사례 44·45 회귀 안전).
  const effectiveOneHouseSingle =
    redevelopment.exemptionEligibleAtApproval === false
      ? false
      : (input.isOneHouseSingle ?? false);

  // ─ 거주월수 귀속 분리 (사례 45 — 시행령 §154⑧ + 사전법령해석재산 2020-386) ─
  // 신규 두 필드(prior/new)가 모두 undefined 시 legacy fallback:
  //   기존건물분 = residencePeriodMonths 단일값
  //   청산금분   = 0 (해석례 보수적 적용 — 신축거주 입력 없으면 표1 강등)
  const hasSplitResidence =
    input.priorHouseResidenceMonths !== undefined || input.newHouseResidenceMonths !== undefined;
  const prior = input.priorHouseResidenceMonths ?? 0;
  const newMonths = input.newHouseResidenceMonths ?? 0;
  const existingResidenceMonths = hasSplitResidence ? prior + newMonths : input.residencePeriodMonths ?? 0;
  const payResidenceMonths = hasSplitResidence ? newMonths : 0;

  // ─ subject="right" (입주권 양도) 분기 ─
  if (subject === "right") {
    return computeRightLthd({
      acquisitionDate,
      approvalDate,
      isSuccessorRightToMoveIn: isSuccessorRightToMoveIn ?? false,
      isOneHouseSingle: effectiveOneHouseSingle,
      // 입주권은 인가전 분만 LTHD → 기존건물분 거주월수만 의미 있음
      residencePeriodMonths: existingResidenceMonths,
    });
  }

  // ─ subject="apt" (완공 APT 양도) 분기 ─
  return computeAptLthd({
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle: effectiveOneHouseSingle,
    existingResidenceMonths,
    payResidenceMonths,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 입주권 양도 (§166⑤1호 + §95② 단서)
// ──────────────────────────────────────────────────────────────────────────────

export function computeRightLthd(args: {
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
      settlement: zeroBranch("§94①2호 (조합원입주권 = 부동산을 취득할 수 있는 권리) + 시행령 §166①1호·2호 가목 산식 구조상 LTHD 대상 자산 부존재 (§95② 대상자산 토지·건물 범위 외)"),
    };
  }

  // 원조합원: 인가전 분만 LTHD (§166⑤1호 — 취득일 ~ 관리처분 인가일)
  const preApprovalHolding = calculateHoldingPeriod(acquisitionDate, approvalDate);
  const preApprovalMonths = preApprovalHolding.years * 12 + preApprovalHolding.months;
  const preApprovalSplit = computeLthdRateSplit(
    preApprovalHolding.years,
    isOneHouseSingle,
    Math.floor(residencePeriodMonths / 12),
  );

  return {
    preApproval: {
      holdingMonths: preApprovalMonths,
      holdingDays: preApprovalHolding.days,
      holdingYears: preApprovalHolding.years,
      rate: preApprovalSplit.total,
      holdingRate: preApprovalSplit.holding,
      residenceRate: preApprovalSplit.residence,
      applicable: true,
    },
    postApprovalExistingHouse: zeroBranch("입주권 양도 시 인가후 기존주택분 양도차익은 LTHD 대상 부존재 (§95② 단서·§166⑤1호)"),
    settlement: zeroBranch("§94①2호 (조합원입주권 = 부동산을 취득할 수 있는 권리) + 시행령 §166①1호·2호 가목 산식 구조상 LTHD 대상 자산 부존재 (§95② 대상자산 토지·건물 범위 외)"),
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
  /** 기존건물분 거주월수 (= prior + new, §154⑧ 통산) */
  existingResidenceMonths: number;
  /** 청산금분 거주월수 (= new, 해석례 2020-386) */
  payResidenceMonths: number;
}): RedevelopmentLthdResult {
  const {
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle,
    existingResidenceMonths,
    payResidenceMonths,
  } = args;

  const existingResidenceYears = Math.floor(existingResidenceMonths / 12);
  const payResidenceYears = Math.floor(payResidenceMonths / 12);

  // ─ §166⑤2호나목: 기존건물분 (preApproval + postApprovalExistingHouse) = 취득일 ~ 신축양도일 ─
  // 묶음 동일 보유기간 → 동일 LTHD율 (분배법칙으로 분기별 산출해도 합계 동일)
  // 거주분 = §154⑧ 통산 (prior + new)
  const existingHolding = calculateHoldingPeriod(acquisitionDate, transferDate);
  const existingMonths = existingHolding.years * 12 + existingHolding.months;
  const existingSplit = computeLthdRateSplit(existingHolding.years, isOneHouseSingle, existingResidenceYears);

  const preApprovalBranch: RedevelopmentLthdBranch = {
    holdingMonths: existingMonths,
    holdingDays: existingHolding.days,
    holdingYears: existingHolding.years,
    rate: existingSplit.total,
    holdingRate: existingSplit.holding,
    residenceRate: existingSplit.residence,
    applicable: true,
  };
  const postApprovalBranch: RedevelopmentLthdBranch = { ...preApprovalBranch };

  // ─ 청산금 분 보유기간 + 거주월수 = new 만 (해석례 2020-386) ─
  let settlementBranch: RedevelopmentLthdBranch;
  if (settlementDirection === "pay") {
    // §166⑤2호가목: 인가일 ~ 신축양도일
    const payHolding = calculateHoldingPeriod(approvalDate, transferDate);
    const payMonths = payHolding.years * 12 + payHolding.months;
    const paySplit = computeLthdRateSplit(payHolding.years, isOneHouseSingle, payResidenceYears);
    settlementBranch = {
      holdingMonths: payMonths,
      holdingDays: payHolding.days,
      holdingYears: payHolding.years,
      rate: paySplit.total,
      holdingRate: paySplit.holding,
      residenceRate: paySplit.residence,
      applicable: true,
    };
  } else {
    // 수령: §95④ + NTS 집행기준 — 취득일 ~ settlementSaleDate (소유권이전 고시일 다음날)
    // 거주월수도 신축거주만 (해석례 동일 적용 — 수령 분기는 별도 해석례 없으나 보수적 적용)
    const endDate = settlementSaleDate ?? transferDate;
    const receiveHolding = calculateHoldingPeriod(acquisitionDate, endDate);
    const receiveMonths = receiveHolding.years * 12 + receiveHolding.months;
    const receiveSplit = computeLthdRateSplit(receiveHolding.years, isOneHouseSingle, payResidenceYears);
    settlementBranch = {
      holdingMonths: receiveMonths,
      holdingDays: receiveHolding.days,
      holdingYears: receiveHolding.years,
      rate: receiveSplit.total,
      holdingRate: receiveSplit.holding,
      residenceRate: receiveSplit.residence,
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
  return computeLthdRateSplit(years, isOneHouseSingle, residenceYears).total;
}

/**
 * 보유분/거주분 분리 율 산정 (신고서 양식 표시용).
 * 표1: holding=rate(≤0.30), residence=0
 * 표2: holding=min(years×0.04,0.40), residence=min(resYears×0.04,0.40) (거주 2년+ 가드)
 */
export function computeLthdRateSplit(
  years: number,
  isOneHouseSingle: boolean,
  residenceYears: number,
): { holding: number; residence: number; total: number } {
  if (years < 3) return { holding: 0, residence: 0, total: 0 };

  if (isOneHouseSingle && residenceYears >= 2) {
    const holding = Math.min(years * 0.04, 0.40);
    const residence = Math.min(residenceYears * 0.04, 0.40);
    return { holding, residence, total: holding + residence };
  }

  const holding = Math.min(years * 0.02, 0.30);
  return { holding, residence: 0, total: holding };
}

/** LTHD 대상 부존재 분기 (입주권 양도 인가후·청산금) */
function zeroBranch(reason: string): RedevelopmentLthdBranch {
  return {
    holdingMonths: 0,
    holdingYears: 0,
    rate: 0,
    holdingRate: 0,
    residenceRate: 0,
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
