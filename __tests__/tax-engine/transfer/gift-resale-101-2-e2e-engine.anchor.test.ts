/**
 * 소득세법 §101② — 1호·2호의 양도세 결정세액을 **실제 단건 엔진**으로 고정 (Pre-Do · P0)
 *
 * 계획서: `docs/00-pm/transfer-101-2-gift-resale.plan.md` §1·§6
 *
 * 안 A(판정 화면)는 사용자가 양도세 계산기를 수증자·증여자 기준으로 한 번씩 돌린 결정세액을 넣는다.
 * 이 파일은 그 두 계산이 교재 값을 내는지 — 즉 계획의 전제 — 를 엔진 회귀로 감시한다.
 *
 * - 수증자(을): 취득 = 증여 등기 2026.2.1. · 취득가액 = 증여가액 75,000,000 · 1년 미만 50%(§104①3호)
 * - 증여자(갑) 직접 양도: 취득 2019.5.1. 50,000,000 · 자본적지출·양도비 5,000,000 · 장특공 6년 12% · 누진 24%
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";

const TD = new Date("2026-04-05T00:00:00Z");
const rates = loadFallbackTransferRates(TD);

const LAND: Omit<TransferTaxInput, "acquisitionPrice" | "acquisitionDate" | "expenses"> = {
  propertyType: "land",
  transferPrice: 150_000_000,
  transferDate: TD,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
};

describe("§101② 1호·2호 양도세 — 단건 엔진 실호출 (P0 anchor)", () => {
  it("1호 수증자(을) 결정세액 36,250,000 — 1년 미만 50%", () => {
    const r = calculateTransferTax(
      {
        ...LAND,
        acquisitionCause: "gift",
        acquisitionPrice: 75_000_000,
        acquisitionDate: new Date("2026-02-01T00:00:00Z"),
        expenses: 0,
      },
      rates,
    );
    expect(r.transferGain).toBe(75_000_000);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.taxBase).toBe(72_500_000);
    expect(r.rateClause).toBe("104-1-3");
    expect(r.determinedTax).toBe(36_250_000);
  });

  it("2호 증여자(갑) 직접양도 결정세액 13,704,000 — 장특공 12% · 누진 24%", () => {
    const r = calculateTransferTax(
      {
        ...LAND,
        acquisitionCause: "purchase",
        acquisitionPrice: 50_000_000,
        acquisitionDate: new Date("2019-05-01T00:00:00Z"),
        expenses: 5_000_000,
      },
      rates,
    );
    expect(r.transferGain).toBe(95_000_000);
    expect(r.longTermHoldingDeduction).toBe(11_400_000);
    expect(r.taxBase).toBe(81_100_000);
    expect(r.determinedTax).toBe(13_704_000);
  });
});
