/**
 * Pre-Do 앵커 — 상속주택 "자체" 양도 §154⑧3호 보유기간 통산 (Tier 2-B)
 *
 * 세법(소득세법 시행령 §154⑧3호): 상속받은 주택으로서 상속인과 피상속인이 상속개시 당시 동일세대인 경우
 *   상속개시 전에 상속인과 피상속인이 동일세대로서 거주·보유한 기간을 (§154① 비과세) 보유·거주기간에 통산.
 * 갭: 현행 meetsOneHouseHoldingResidence(exemption.ts:161)는 input.acquisitionDate(=상속개시일) 직접 기산 →
 *   상속개시 후 보유가 2년 미만이면 통산 없이 과세.
 * 설계: decedentSameHouseholdBeforeInheritance(게이트) + decedentCohabitationHoldingStartDate(기산 backdate).
 *   §154 비과세 보유기간 전용(LTHD·단기세율 무관). 거주 통산분은 residencePeriodMonths(사용자 입력).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const mockRates = makeMockRates();

// 상속주택 1채 자체 양도 (1세대1주택). 상속개시 2024-06, 양도 2025-06 → 상속개시일 기산 보유 1년(<2년).
function inheritedSelfInput(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    acquisitionCause: "inheritance",
    acquisitionDate: new Date("2024-06-01"), // 상속개시일
    transferDate: new Date("2025-06-01"),
    transferPrice: 500_000_000, // < 12억
    acquisitionPrice: 300_000_000,
    ...over,
  });
}

describe("§154⑧3호 상속주택 자체 양도 보유기간 통산 (2-B 앵커)", () => {
  it("★ 동일세대 상속 + 동일세대 보유 통산으로 2년↑ → 비과세 (RED→GREEN)", () => {
    const r = calculateTransferTax(
      inheritedSelfInput({
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationHoldingStartDate: new Date("2020-01-01"), // 통산 보유 5년↑
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  it("별도세대 상속(게이트 off) → 통산 없음 → 상속개시일 기산 보유 1년 → 과세", () => {
    const r = calculateTransferTax(
      inheritedSelfInput({
        decedentSameHouseholdBeforeInheritance: false,
        decedentCohabitationHoldingStartDate: new Date("2020-01-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("동일세대이나 통산 후에도 보유 2년 미만 → 과세 (경계)", () => {
    const r = calculateTransferTax(
      inheritedSelfInput({
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationHoldingStartDate: new Date("2024-01-01"), // 통산해도 ~1.4년
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("가드: 통산 기산일이 상속개시일 이후면 backdate 안 함 → 과세", () => {
    const r = calculateTransferTax(
      inheritedSelfInput({
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationHoldingStartDate: new Date("2025-01-01"), // > 상속개시일
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  it("회귀: 매매 취득(비상속) 5년 보유 → 비과세 불변 (신규 필드 무간섭)", () => {
    const r = calculateTransferTax(
      inheritedSelfInput({
        acquisitionCause: "purchase",
        acquisitionDate: new Date("2018-01-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });
});
