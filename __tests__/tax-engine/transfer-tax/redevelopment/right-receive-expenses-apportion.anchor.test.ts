/**
 * 입주권 양도 + 청산금 수령 — **인가전 분 필요경비 안분** anchor (2026-08-13 사용자 제보).
 *
 * 결함: `redevelopmentDetail.preApproval`의 `apportionedTransfer`·`apportionedAcquisition`·`gain`은
 * §166①2호 나목 비율((평가액 − 청산금) / 평가액)로 안분된 값인데 `expenses`만 **안분 전 원액**이라
 * 신고서 표의 인가전 분 열이 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋난다.
 *
 * 차익 자체는 옳다 — `preApprovalGain`(원액 필요경비 차감 후)에 비율을 곱하므로 실효 차감액은
 * 이미 안분값이다. 즉 **표시 전용 드리프트**(memory `feedback_engine_result_display_drift`).
 *
 * 기존 사례 36 테스트가 이를 못 잡은 이유: `preApprovalExpenses: 0`이라 안분 유무가 같은 값이다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const redevInfo: RedevelopmentInfo = {
  subject: "right",
  approvalLawBasis: "urban_renovation_art_74",
  approvalDate: new Date("2018-10-23"),
  rightsValue: 300_000_000,
  settlementDirection: "receive",
  settlementAmount: 60_000_000, // 비율 = (300M − 60M) / 300M = 0.8
  settlementSaleDate: new Date("2023-03-02"),
  preApprovalExpenses: 5_000_000, // ★ 0이 아니어야 안분 누락이 드러난다
  postApprovalExpenses: 0,
  originalAssetType: "housing",
  acquisitionRounding: "floor",
};

const input: TransferTaxInput = baseTransferInput({
  propertyType: "right_to_move_in",
  transferPrice: 520_000_000,
  transferDate: new Date("2023-03-02"),
  acquisitionDate: new Date("2002-04-09"),
  acquisitionPrice: 100_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  redevelopment: redevInfo,
});

describe("입주권 receive — 인가전 분 필요경비 안분", () => {
  const result = calculateTransferTax(input, mockRates);
  const pre = result.redevelopmentDetail!.preApproval;

  it("A-1: 인가전 분 열이 자기일관적이다 (양도가액 − 취득가액 − 필요경비 = 양도차익)", () => {
    expect(
      pre.apportionedTransfer - pre.apportionedAcquisition - (pre.expenses ?? 0),
    ).toBe(pre.gain);
  });

  it("A-2: 필요경비가 §166①2호 나목 비율로 안분된다 (5,000,000 × 0.8)", () => {
    // 안분 전 원액 5,000,000이 그대로 오면 실패한다.
    expect(pre.expenses).toBe(4_000_000);
  });
});
