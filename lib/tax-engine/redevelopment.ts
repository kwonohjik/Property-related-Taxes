/**
 * 재개발/재건축 양도소득세 — Orchestrator
 *
 * 본 모듈은 RedevelopmentInfo 입력을 받아 3분할 양도차익 + 분기별 LTHD 적용 후
 * RedevelopmentResult를 반환한다. transfer-tax.ts 의 양도차익 산정 STEP에서
 * 호출되어 일반 분기 대신 재개발 분기 결과를 사용.
 *
 * 파일 분리 책임:
 *  - redevelopment-split.ts       : 3분할 양도차익 (§166①1호·①2호·②1호·②2호)
 *  - redevelopment-lthd.ts        : 분기별 LTHD 보유기간·율 (§166⑤)
 *  - redevelopment-settlement.ts  : 분양가·청산금 안분
 *  - redevelopment-valuation.ts   : 환산취득가 (§166③ + §164⑦ 단서)
 *  - redevelopment.ts (본 파일)   : 분기 라우팅 + 합산 + finalize 입력 빌더
 *
 * 사례 44 검증 (APT-환산-납부-주택출자):
 *   산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
 */

import {
  computeRedevelopmentSplit,
  type RedevelopmentSplitInput,
} from "./redevelopment-split";
import { computeRedevelopmentLthd, applyLthdToGain } from "./redevelopment-lthd";
import type {
  RedevelopmentInfo,
  RedevelopmentResult,
  RedevelopmentBranchDetail,
} from "./types/transfer-redevelopment.types";

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator 입력
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrator 입력 — RedevelopmentInfo + 자산-수준 메타.
 *
 * transfer-tax.ts 에서 다음과 같이 호출:
 *   const detail = runRedevelopment({
 *     redevelopment: input.redevelopment!,
 *     acquisitionDate: input.acquisitionDate,
 *     transferDate: input.transferDate,
 *     transferPrice: input.transferPrice,
 *     actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice,
 *     useEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
 *     isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
 *     isOneHouseSingle: input.isOneHousehold && input.householdHousingCount === 1,
 *     residencePeriodMonths: input.residencePeriodMonths,
 *   });
 */
export interface RedevelopmentOrchestratorInput extends RedevelopmentSplitInput {
  /** 입주권 양도 시 승계조합원 여부 (§95② 단서 — LTHD 0) */
  isSuccessorRightToMoveIn?: boolean;
  /** 1세대1주택 (LTHD 표2 + 12억 안분 분기) */
  isOneHouseSingle?: boolean;
  /**
   * 거주기간 개월 (legacy 단일값 — prior/new 두 필드가 모두 undefined 시 fallback).
   * 신규 케이스에서는 priorHouseResidenceMonths + newHouseResidenceMonths 사용 권장.
   */
  residencePeriodMonths?: number;
  /**
   * 종전주택 거주개월수 (시행령 §155⑰ 통산 prior 분량).
   * 사례 45 — 기존건물분 LTHD 표2 거주분 = prior + new (통산).
   */
  priorHouseResidenceMonths?: number;
  /**
   * 신축주택 거주개월수.
   * 사례 45 — 청산금납부분 LTHD 표2 진입 가드 (해석례 2020-386).
   */
  newHouseResidenceMonths?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator 본체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발/재건축 양도 결과 산정.
 *
 * Step 1: 3분할 양도차익 (split.ts)
 * Step 2: 분기별 LTHD 보유기간·율 (lthd.ts)
 * Step 3: 분기별 LTHD 금액 적용 (applyLthdToGain × 묶음 동일 율 강제)
 * Step 4: 합계 (gain·lthd·taxableIncome)
 *
 * 1세대1주택 §160 12억 안분은 본 함수 외부(transfer-tax.ts)에서
 * total.gain 과 total.lthd 에 적용 (분배법칙으로 분기별 분배는 UI 표시용).
 */
export function runRedevelopment(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, acquisitionDate, transferDate } = input;

  // ─ Step 1: 3분할 양도차익 ─
  const split = computeRedevelopmentSplit(input);

  // ─ Step 2: 분기별 LTHD 보유기간·율 ─
  const lthd = computeRedevelopmentLthd({
    redevelopment,
    acquisitionDate,
    transferDate,
    isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
    isOneHouseSingle: input.isOneHouseSingle,
    residencePeriodMonths: input.residencePeriodMonths,
    priorHouseResidenceMonths: input.priorHouseResidenceMonths,
    newHouseResidenceMonths: input.newHouseResidenceMonths,
  });

  // ─ Step 3: 분기별 LTHD 금액 적용 (묶음 동일 율 — §166⑤2호나목 분배법칙 산술) ─
  const preApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.preApproval.apportionedTransfer,
    apportionedAcquisition: split.preApproval.apportionedAcquisition,
    gain: split.preApproval.gain,
    holdingMonths: lthd.preApproval.holdingMonths,
    lthd: lthd.preApproval.applicable
      ? applyLthdToGain(split.preApproval.gain, lthd.preApproval.rate)
      : 0,
    lthdRate: lthd.preApproval.applicable ? lthd.preApproval.rate : 0,
  };

  const postApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.postApprovalExistingHouse.apportionedTransfer,
    apportionedAcquisition: split.postApprovalExistingHouse.apportionedAcquisition,
    gain: split.postApprovalExistingHouse.gain,
    holdingMonths: lthd.postApprovalExistingHouse.holdingMonths,
    lthd: lthd.postApprovalExistingHouse.applicable
      ? applyLthdToGain(split.postApprovalExistingHouse.gain, lthd.postApprovalExistingHouse.rate)
      : 0,
    lthdRate: lthd.postApprovalExistingHouse.applicable
      ? lthd.postApprovalExistingHouse.rate
      : 0,
  };

  const settlementDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.settlement.apportionedTransfer,
    apportionedAcquisition: split.settlement.apportionedAcquisition,
    gain: split.settlement.gain,
    holdingMonths: lthd.settlement.holdingMonths,
    lthd: lthd.settlement.applicable
      ? applyLthdToGain(split.settlement.gain, lthd.settlement.rate)
      : 0,
    lthdRate: lthd.settlement.applicable ? lthd.settlement.rate : 0,
  };

  // ─ Step 4: 합계 ─
  const totalGain = preApprovalDetail.gain + postApprovalDetail.gain + settlementDetail.gain;
  const totalLthd = preApprovalDetail.lthd + postApprovalDetail.lthd + settlementDetail.lthd;
  const taxableIncome = Math.max(0, totalGain - totalLthd);

  return {
    preApproval: preApprovalDetail,
    postApprovalExistingHouse: postApprovalDetail,
    settlement: settlementDetail,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: split.salePriceTotal,
    valuationMeta: split.valuationMeta,
    estimatedLumpDeduction: split.estimatedLumpDeduction,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// finalize 입력 빌더 — transfer-tax-finalize.ts LTHD 3줄 emit 용
// ──────────────────────────────────────────────────────────────────────────────

/**
 * finalize emit 용 LTHD 라인 3줄 산출.
 * code === 'LTHD' 라인 ID + 금액·율·gain·holdingMonths 노출.
 *
 * FilingFormTable 3열 표시와 1:1 매칭되어야 함 (anchor: lines.length === 3).
 */
export interface RedevelopmentLthdEmitLine {
  lineId: "preApproval" | "postApprovalExistingHouse" | "settlement";
  code: "LTHD";
  gain: number;
  rate: number;
  amount: number;
  holdingMonths: number;
  applicable: boolean;
}

export function buildLthdEmitLines(result: RedevelopmentResult): RedevelopmentLthdEmitLine[] {
  return [
    {
      lineId: "preApproval",
      code: "LTHD",
      gain: result.preApproval.gain,
      rate: result.preApproval.lthdRate,
      amount: result.preApproval.lthd,
      holdingMonths: result.preApproval.holdingMonths,
      applicable: result.preApproval.lthd > 0 || result.preApproval.gain > 0,
    },
    {
      lineId: "postApprovalExistingHouse",
      code: "LTHD",
      gain: result.postApprovalExistingHouse.gain,
      rate: result.postApprovalExistingHouse.lthdRate,
      amount: result.postApprovalExistingHouse.lthd,
      holdingMonths: result.postApprovalExistingHouse.holdingMonths,
      applicable:
        result.postApprovalExistingHouse.lthd > 0 ||
        result.postApprovalExistingHouse.gain > 0,
    },
    {
      lineId: "settlement",
      code: "LTHD",
      gain: result.settlement.gain,
      rate: result.settlement.lthdRate,
      amount: result.settlement.lthd,
      holdingMonths: result.settlement.holdingMonths,
      applicable: result.settlement.lthd > 0 || result.settlement.gain > 0,
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// 활성 분기 판정 (transfer-tax.ts STEP 분기용)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * TransferTaxInput.redevelopment 존재 + propertyType 호환 여부 판정.
 *
 * propertyType="redevelopment_apt" 또는 "right_to_move_in" + redevelopment 입력 시 활성.
 * 그 외는 false → transfer-tax.ts 의 일반 분기 사용.
 */
export function isRedevelopmentActive(
  propertyType: string,
  redevelopment: RedevelopmentInfo | undefined,
): boolean {
  if (redevelopment == null) return false;
  if (propertyType === "redevelopment_apt") return redevelopment.subject === "apt";
  if (propertyType === "right_to_move_in") return redevelopment.subject === "right";
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Re-export 편의용
// ──────────────────────────────────────────────────────────────────────────────

export type { RedevelopmentInfo, RedevelopmentResult, RedevelopmentBranchDetail } from "./types/transfer-redevelopment.types";
export { computeRedevelopmentValuation } from "./redevelopment-valuation";
export { computeRedevelopmentSplit } from "./redevelopment-split";
export { computeRedevelopmentLthd } from "./redevelopment-lthd";
export { computeSalePriceTotal, computeSettlementPreview } from "./redevelopment-settlement";
