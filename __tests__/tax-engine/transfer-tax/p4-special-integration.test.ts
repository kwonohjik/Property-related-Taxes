// P4 — §98의2 (특칙 전용) + §98의4 (비거주자 10%) 단위 + 통합 anchor
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  evaluateUnsold982,
  evaluateUnsold984,
  table2HoldingRate,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p4";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
  makeHouseInfo,
} from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

const R982 = {
  type: "unsold_98_2" as const,
  isNonCapitalUnsold982: true,
  isFirstOrFcfsContract982: true,
};
const R984 = {
  type: "unsold_98_4" as const,
  isNonResidentNoPe984: true,
  isNotUnsold983House984: true,
};

describe("P4 단위 anchor", () => {
  it("표2 보유기간별 공제율 — 2년 0% / 3년 12% / 7년 28% / 10년+ 40%", () => {
    expect(table2HoldingRate(2)).toBe(0);
    expect(table2HoldingRate(3)).toBeCloseTo(0.12, 10);
    expect(table2HoldingRate(7)).toBeCloseTo(0.28, 10);
    expect(table2HoldingRate(10)).toBe(0.4);
    expect(table2HoldingRate(15)).toBe(0.4);
  });

  it("§98의2 — 특칙 전용 (lthd_rate_special) + 시한 (취득 OR 계약)", () => {
    const base = {
      transferDate: D("2016-08-01"),
      acquisitionDate: D("2009-06-15"),
      isNonCapitalUnsold: true,
      isFirstOrFcfsContract: true,
    };
    const r = evaluateUnsold982(base);
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("lthd_rate_special");
    expect(r.reductionAmount).toBe(0);
    // 취득 기간 외 + 계약 2010.12.15 (계약금 케이스) → 적격
    expect(
      evaluateUnsold982({ ...base, acquisitionDate: D("2011-03-01"), contractDate: D("2010-12-15") })
        .isEligible,
    ).toBe(true);
    // 둘 다 기간 외 → 배제
    expect(
      evaluateUnsold982({ ...base, acquisitionDate: D("2011-03-01") }).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
  });

  it("§98의4 — tax_amount 10% + 비거주자 미확인 차단 + 시한 경계", () => {
    const base = {
      transferDate: D("2022-08-01"),
      acquisitionDate: D("2009-06-15"),
      isNonResidentNoPe: true,
      isNotUnsold983House: true,
    };
    const r = evaluateUnsold984(base);
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("tax_amount");
    expect(r.taxReductionRate).toBe(0.1);
    expect(
      evaluateUnsold984({ ...base, isNonResidentNoPe: false }).ineligibleReasons.map((x) => x.code),
    ).toContain("NOT_NONRESIDENT");
    expect(evaluateUnsold984({ ...base, acquisitionDate: D("2009-03-16") }).isEligible).toBe(true);
    expect(
      evaluateUnsold984({ ...base, acquisitionDate: D("2009-03-15") }).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
  });
});

describe("P4 통합 anchor", () => {
  it("P4-1: §98의2 보유 7년 — 장특 표2 28% (84M)·감면세액 0·농특세 0·결정세액 61,190,000", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-06-15"),
        transferDate: new Date("2016-08-01"),
        householdHousingCount: 2,
        reductions: [R982],
      }),
      rates,
    );
    // 표2 보유 7년 × 4% = 28% → 표1 14% 대신 강제
    expect(r.longTermHoldingRate).toBeCloseTo(0.28, 10);
    expect(r.longTermHoldingDeduction).toBe(84_000_000);
    // 216M − 2.5M = 213.5M → ×38% − 19.94M = 61,190,000
    expect(r.taxBase).toBe(213_500_000);
    expect(r.calculatedTax).toBe(61_190_000);
    // 감면세액 없음 (특칙 전용)
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(61_190_000);
    expect(r.unsold982Detail?.isEligible).toBe(true);
    expect(r.unsold982Detail?.effectCategory).toBe("lthd_rate_special");
    expect(r.steps.some((s) => s.label.includes("특칙 적용"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("농어촌특별세"))).toBe(false);
  });

  it("P4-2: §98의2 보유 1년 6개월 — 표2 3년 미만 LTHD 0 + 단기세율 배제 (기본 누진 93,110,000)", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2010-06-15"),
        transferDate: new Date("2011-12-15"),
        householdHousingCount: 2,
        reductions: [R982],
      }),
      rates,
    );
    expect(r.longTermHoldingDeduction).toBe(0);
    // 단기 60% (178.5M) 대신 기본 누진 297.5M × 38% − 19.94M
    expect(r.calculatedTax).toBe(93_110_000);
    expect(r.appliedRate).toBe(0.38);
  });

  it("P4-3: §98의2 + 3주택·조정지역 — 중과 배제 (5호 열거)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-06-15"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 3,
        isRegulatedArea: true,
        houses: [
          makeHouseInfo("h1", { acquisitionDate: new Date("2009-06-15"), regionCode: "11680" }),
          makeHouseInfo("h2"),
          makeHouseInfo("h3"),
        ],
        sellingHouseId: "h1",
        reductions: [R982],
      }),
      rates,
    );
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
  });

  it("P4-4: §98의4 — 10% 감면 6,347,000·농특세 1,269,400·총 64,104,700", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-06-15"),
        transferDate: new Date("2022-08-01"), // 13년 — 5년 무관 10% 감면
        householdHousingCount: 2,
        reductions: [R984],
      }),
      rates,
    );
    // LTHD 표1 13년 26% = 78M → 222M − 2.5M = 219.5M → 63,470,000
    expect(r.longTermHoldingDeduction).toBe(78_000_000);
    expect(r.calculatedTax).toBe(63_470_000);
    expect(r.reductionAmount).toBe(6_347_000);
    expect(r.reductionTypeApplied).toBe("unsold_98_4");
    expect(r.determinedTax).toBe(57_123_000);
    expect(r.unsold984Detail?.ruralSurtax).toBe(1_269_400);
    expect(r.localIncomeTax).toBe(5_712_300);
    expect(r.totalTax).toBe(64_104_700);
  });

  it("P4-5: §98의4 + 3주택·조정지역 — 중과 유지 (소령 §167의3①5호 비열거)", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2009-06-15"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 3,
        isRegulatedArea: true,
        houses: [
          makeHouseInfo("h1", { acquisitionDate: new Date("2009-06-15"), regionCode: "11680" }),
          makeHouseInfo("h2"),
          makeHouseInfo("h3"),
        ],
        sellingHouseId: "h1",
        reductions: [R984],
      }),
      rates,
    );
    expect(r.unsold984Detail?.isEligible).toBe(true);
    // §98의4 감면주택은 소령 §167의3①5호(감면주택 다주택 중과배제)에 비열거 → 그 배제 step은 없음(유지).
    expect(r.steps.some((s) => s.label === "감면주택 다주택 중과 배제")).toBe(false);
    // 단, 양도주택 취득일 2009-06-15는 부칙 §9270호 §14① window(2009.3.16~2012.12.31) 내 →
    // §98의4 미분양주택은 취득기간상 항상 이 window에 포함 → §104⑦ 세율 중과 배제(기본세율).
    // (재산세제과-1422·서울행정 2024구단72950). 세율만 배제 — §167의3①5호 감면주택 배제와는 별개 축.
    expect(r.rateSurchargeStatutoryExcluded).toBe(true);
    expect(r.surchargeRate).toBeUndefined();
  });
});
