/**
 * anchor: 재개발 land+right+실가+pay (#1(A)) — 종전자산 취득가액 = 실거래가/신고가액 (§166①1호·§163⑨).
 *
 * 계획: docs/02-design/features/transfer-audit-residual-3items.plan.md §#1(A)
 *
 * feasibility spike 결과: runRedevelopment이 originalAssetType="land" && subject="right" && 실가를
 *   runOriginalMember → computeRightPay(§166①1호)로 라우팅하며, oldAcquisitionPrice =
 *   actualAcquisitionPrice(신고가액)를 사용(환산 §166③ 아님). validation :108 차단만 과보수였음.
 *
 * 증여(gift) 취득이면 신고가액이 §163⑨상 취득당시 실지거래가액 → 실가 모드가 정합.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(): RedevelopmentInfo {
  return {
    subject: "right",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2020-06-01"),
    rightsValue: 500_000_000,
    settlementDirection: "pay",
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "land",
    acquisitionRounding: "floor",
  };
}
function input(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 600_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2015-06-01"),
    acquisitionPrice: 200_000_000, // 증여 신고가액(§163⑨)
    expenses: 0,
    useEstimatedAcquisition: false, // 실가
    acquisitionCause: "gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(),
  });
}

describe("land+right+실가+pay (#1A) — 신고가액 취득가액 §166①1호", () => {
  const r = calculateTransferTax(input(), rates);
  const d = r.redevelopmentDetail!;

  it("valuationMeta.method = actual (환산 §166③ 아님)", () => {
    expect(d).toBeDefined();
    expect(d.valuationMeta?.method).toBe("actual");
  });
  it("인가전 양도차익 = 권리가액 500M − 신고가액 200M = 300,000,000", () => {
    expect(d.preApproval.gain).toBe(300_000_000);
  });
  it("총 양도차익 = 350,000,000 (인가전 300M + 인가후 50M)", () => {
    expect(r.transferGain).toBe(350_000_000);
  });
});
