/**
 * §40 자동계산 통합 — 폼(raw) → buildDeemedGiftInput → calcDeemedGift end-to-end.
 * autoExcess·autoInterestLoss 모드로 raw 입력만으로 사례3·4 재현(④ API ↔ 헬퍼 ↔ 엔진 14지점).
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

function run(overrides: Partial<DeemedFormState>) {
  const form: DeemedFormState = { ...INITIAL_DEEMED, type: "convertible_bond", ...overrides };
  return calcDeemedGift(buildDeemedGiftInput(form));
}

describe("§40 자동계산 통합 (raw → 엔진)", () => {
  it("사례3 ④ autoInterestLoss(만기·발행이율·현가계수) → 380,983,600", () => {
    const r = run({
      cbCaseType: "conversion",
      cbPreConvPrice: "9000",
      cbPreConvShares: "1000000",
      cbConversionPrice: "5000",
      cbIncreasedShares: "200000",
      cbIsListed: true,
      cbListedMarketAvg: "9500",
      cbAcqGainPrior: "120000000",
      cbAutoInterestLoss: true,
      cbBondMaturity: "1000000000",
      cbCouponRatePct: "3",
      cbPvFactorAppr: "0.73502",
      cbAnnuityFactorAppr: "3.31212",
    });
    expect(r.deemedGiftValue).toBe(380_983_600);
  });

  it("사례4 ⑤ autoExcess + autoInterestLoss(전부 raw) → 526,264,550", () => {
    const r = run({
      cbCaseType: "conversion",
      cbPreConvPrice: "8500",
      cbPreConvShares: "1000000",
      cbConversionPrice: "5000",
      cbIncreasedShares: "1000000",
      cbIsListed: true,
      cbListedMarketAvg: "8200",
      cbAcqGainPrior: "0",
      cbAutoExcess: true,
      cbSubscribedShares: "1000000",
      cbTotalSubscribable: "1000000",
      cbOwnPreRatioPct: "30",
      cbAutoInterestLoss: true,
      cbBondMaturity: "5000000000",
      cbCouponRatePct: "3",
      cbPvFactorAppr: "0.68058",
      cbAnnuityFactorAppr: "3.99271",
    });
    expect(r.deemedGiftValue).toBe(526_264_550);
  });

  it("사례1 ① 직접입력 → 120,000,000", () => {
    const r = run({ cbCaseType: "acquisition", cbMarketValue: "1030000000", cbAcquisitionPrice: "910000000" });
    expect(r.deemedGiftValue).toBe(120_000_000);
  });
});
