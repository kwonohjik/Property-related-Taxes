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

/**
 * B: **환산 모드** 수령 경로 — `runHousingContribReceiveEstimated`.
 *
 * 위 A와 **분기 함수가 다르다**(`redevelopment.ts:346` vs `:490`). 환산 경로는 preApproval
 * 상세를 자체적으로 조립하므로 A만 고치면 이 경로는 그대로 원액을 표시한다(2026-08-13 재제보).
 *
 * 픽스처는 제보 화면을 그대로 재현한다:
 *   권리가액 300,000,000 · 수령청산금 50,000,000 → 안분비율 250/300
 *   취득당시 개별주택가격 120,000,000 → 개산공제 3,600,000 (§163⑥ 3%)
 *   인가당시 개별주택가격 200,000,000 → 환산취득가 floor(300M × 120M / 200M) = 180,000,000
 *   ⇒ 인가전 분: 양도가액 250,000,000 · 취득가액 150,000,000 · 양도차익 97,000,000
 */
describe("입주권 receive + 환산 — 인가전 분 필요경비 안분 (제보 화면 재현)", () => {
  const redevEstimated: RedevelopmentInfo = {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 300_000_000,
    settlementDirection: "receive",
    settlementAmount: 50_000_000,
    settlementSaleDate: new Date("2026-03-02"),
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    housingStdPriceAtAcq: 120_000_000,
    housingStdPriceAtApproval: 200_000_000,
    acquisitionRounding: "floor",
  };

  const estimatedInput: TransferTaxInput = baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 320_000_000,
    transferDate: new Date("2026-03-02"),
    acquisitionDate: new Date("2008-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    redevelopment: redevEstimated,
  });

  const result = calculateTransferTax(estimatedInput, mockRates);
  const pre = result.redevelopmentDetail!.preApproval;

  it("B-0: 제보 화면과 동일한 인가전 분 값이 나온다 (픽스처 정합 확인)", () => {
    expect(pre.apportionedTransfer).toBe(250_000_000);
    expect(pre.apportionedAcquisition).toBe(150_000_000);
    expect(pre.gain).toBe(97_000_000);
  });

  it("B-1: 인가전 분 열이 자기일관적이다 (양도가액 − 취득가액 − 필요경비 = 양도차익)", () => {
    expect(
      pre.apportionedTransfer - pre.apportionedAcquisition - (pre.expenses ?? 0),
    ).toBe(pre.gain);
  });

  it("B-2: 개산공제 3,600,000이 안분되어 3,000,000으로 표시된다", () => {
    expect(pre.expenses).toBe(3_000_000);
  });
});
