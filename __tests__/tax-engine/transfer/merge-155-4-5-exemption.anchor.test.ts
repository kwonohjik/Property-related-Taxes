/**
 * Pre-Do 앵커 — 합가(혼인 §155⑤·동거봉양 §155④) 1세대1주택 비과세
 *
 * 계획서: docs/02-design/features/transfer-155-2-4-5-exemption-gap.plan.md Tier 1 · §7
 * 갭: 현행 checkExemption 합가 비과세 경로 없음 → householdHousingCount=2면 배제 게이트(:253) 과세.
 * 세법: §155④⑤ 합가·혼인일부터 10년 내 "먼저 양도" 주택 1세대1주택 의제.
 *       요건 = 합가 전 취득 + 선양도 + §154① 보유·거주.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

// 합가 2주택 — 혼인일 2020, 양도주택 2018 취득(합가 전), 2025 양도(10년 내), 비조정
function mergeInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 2,
    transferPrice: 500_000_000, // < 12억
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2018-01-01"), // 혼인일(2020) 전 취득
    transferDate: new Date("2025-06-01"), // 혼인일+10년(2030) 내
    isFirstTransferredInMerge: true,
    ...over,
  });
}

describe("합가 §155④⑤ 비과세 (앵커)", () => {
  it("★ 혼인 합가: 2주택+합가전취득+10년내+선양도 → 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      mergeInput({ marriageMerge: { marriageDate: new Date("2020-01-01") } }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("★ 동거봉양 합가 동일 → 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      mergeInput({ parentalCareMerge: { mergeDate: new Date("2020-01-01") } }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("혼인일+10년 초과 양도 → 과세", () => {
    const r = calculateTransferTax(
      mergeInput({
        marriageMerge: { marriageDate: new Date("2020-01-01") },
        transferDate: new Date("2030-06-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("합가 후 취득(acqDate>혼인일) → 과세 (합가전 취득 게이트)", () => {
    const r = calculateTransferTax(
      mergeInput({
        marriageMerge: { marriageDate: new Date("2020-01-01") },
        acquisitionDate: new Date("2021-01-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("선양도 토글 OFF → 과세 (§155④⑤ 먼저 양도 아님)", () => {
    const r = calculateTransferTax(
      mergeInput({
        marriageMerge: { marriageDate: new Date("2020-01-01") },
        isFirstTransferredInMerge: false,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("회귀: 합가 없음 + count=1 → 비과세 불변", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 1,
        transferPrice: 500_000_000,
        acquisitionDate: new Date("2018-01-01"),
        transferDate: new Date("2025-06-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });
});
