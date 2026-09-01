// P5 — §98 (세율 20%) + 모드 2 N-way 주택수 제외 단위 + 통합 anchor
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  evaluateUnsold98,
  resolveSpecialHouseExclusions,
} from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
  makeHouseInfo,
} from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

const R98 = {
  type: "unsold_98" as const,
  isNationalScale98: true,
  isOutsideSeoul98: true,
  isUnsoldConfirmed98: true,
  isNotRentalHousing98: true, // 령 §98①1호 괄호 (CA-06)
  isFirstBuyerNoOccupancy98: true,
  rentedFor5Years98: true,
};

describe("P5 단위 anchor", () => {
  it("§98 — flat_rate_20 + 2-트랙 시한 + 보유 5년 경계", () => {
    const base = {
      transferDate: D("2022-08-01"),
      acquisitionDate: D("1996-06-15"),
      isNationalScale: true,
      isOutsideSeoul: true,
      isUnsoldConfirmed: true,
      isNotRentalHousing: true, // 령 §98①1호 괄호 (CA-06)
      isFirstBuyerNoOccupancy: true,
      rentedFor5Years: true,
    };
    const r = evaluateUnsold98(base);
    expect(r.isEligible).toBe(true);
    expect(r.effectCategory).toBe("flat_rate_20");
    expect(r.taxReductionRate).toBe(0.2);
    expect(r.ruralSurtaxExempt).toBe(true);
    // ③항 트랙 (1998.6 취득)
    expect(evaluateUnsold98({ ...base, acquisitionDate: D("1998-06-15") }).isEligible).toBe(true);
    // 트랙 사이 공백 (1998.1)
    expect(
      evaluateUnsold98({ ...base, acquisitionDate: D("1998-01-15") }).ineligibleReasons.map((x) => x.code),
    ).toContain("OUT_OF_CONTRACT_PERIOD");
    // 보유 5년 경계 — 1996-06-15 취득: 2001-06-15 적격 / 2001-06-14 배제
    expect(evaluateUnsold98({ ...base, transferDate: D("2001-06-15") }).isEligible).toBe(true);
    expect(
      evaluateUnsold98({ ...base, transferDate: D("2001-06-14") }).ineligibleReasons.map((x) => x.code),
    ).toContain("HOLDING_PERIOD_SHORT");
  });

  it("모드 2 — 시한 표·§99 양도시한·미확인 배제", () => {
    const transferDate = D("2024-06-01");
    // §98의8 적격 — 최초 매매계약일 기준 (법 §98의8① — 취득일 기준 창 없음, D4-09)
    const ok = resolveSpecialHouseExclusions(
      [{ article: "unsold_98_8", houseContractDate: D("2015-06-01"), requirementsConfirmed: true }],
      transferDate,
    );
    expect(ok.excludedCount).toBe(1);
    // §99 — 양도일 2024 > 2007.12.31 시한 → 부적격
    const new99 = resolveSpecialHouseExclusions(
      [{ article: "new_99", houseAcquisitionDate: D("1999-06-01"), requirementsConfirmed: true }],
      transferDate,
    );
    expect(new99.excludedCount).toBe(0);
    expect(new99.entries[0].reason).toContain("2007.12.31");
    // 요건 미확인 → 부적격
    expect(
      resolveSpecialHouseExclusions(
        [{ article: "unsold_98_8", houseContractDate: D("2015-06-01"), requirementsConfirmed: false }],
        transferDate,
      ).excludedCount,
    ).toBe(0);
    // 기간 외 취득 → 부적격
    expect(
      resolveSpecialHouseExclusions(
        [{ article: "unsold_98_8", houseContractDate: D("2016-06-01"), requirementsConfirmed: true }],
        transferDate,
      ).excludedCount,
    ).toBe(0);
    // 복수 적격 — 전부 차감
    expect(
      resolveSpecialHouseExclusions(
        [
          { article: "unsold_98_8", houseContractDate: D("2015-06-01"), requirementsConfirmed: true },
          { article: "unsold_98_7", houseContractDate: D("2012-10-15"), requirementsConfirmed: true },
        ],
        transferDate,
      ).excludedCount,
    ).toBe(2);
  });
});

describe("P5 통합 anchor", () => {
  it("P5-1: §98 적격 26년 보유 — LTHD 표1 30% + flat 20% = 41,500,000 (농특세 0)", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("1996-06-15"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2,
        reductions: [R98],
      }),
      rates,
    );
    // 표1 15년+ 30% 한도 = 90M → 210M − 2.5M = 207.5M
    expect(r.longTermHoldingDeduction).toBe(90_000_000);
    expect(r.taxBase).toBe(207_500_000);
    // flat 20% (누진 58,910,000 대신)
    expect(r.calculatedTax).toBe(41_500_000);
    expect(r.appliedRate).toBe(0.2);
    expect(r.reductionAmount).toBe(0);
    expect(r.determinedTax).toBe(41_500_000);
    expect(r.unsold98Detail?.isEligible).toBe(true);
    expect(r.steps.some((s) => s.label.includes("세율 20% 특례"))).toBe(true);
    expect(r.steps.some((s) => s.label.includes("농어촌특별세"))).toBe(false);
    expect(r.localIncomeTax).toBe(4_150_000);
    expect(r.totalTax).toBe(45_650_000);
  });

  it("P5-1 대조군: 불적격(서울 밖 미확인) → 기본 누진 58,910,000", () => {
    const rates = makeMockRates();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("1996-06-15"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 2,
        reductions: [{ ...R98, isOutsideSeoul98: false }],
      }),
      rates,
    );
    expect(r.unsold98Detail?.isEligible).toBe(false);
    expect(r.calculatedTax).toBe(58_910_000);
  });

  it("P5-3: 모드 2 — 2주택 + §98의8 감면주택 적격 → 유효 1주택 비과세 / 미확인 → 과세", () => {
    const rates = makeMockRates();
    const base = {
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2015-07-01"),
      transferDate: new Date("2022-08-01"),
      householdHousingCount: 2,
      isOneHousehold: true,
    };
    const exempt = calculateTransferTax(
      baseTransferInput({
        ...base,
        specialHouseExclusions: [{
          article: "unsold_98_8" as const,
          houseAcquisitionDate: new Date("2015-08-01"),
          // §98의8①은 최초 매매계약일만을 기준으로 취득기간을 판정한다 (D4-09)
          houseContractDate: new Date("2015-06-01"),
          requirementsConfirmed: true,
        }],
      }),
      rates,
    );
    expect(exempt.isExempt).toBe(true);
    expect(exempt.specialHouseExclusionDetail?.excludedCount).toBe(1);

    const taxed = calculateTransferTax(
      baseTransferInput({
        ...base,
        specialHouseExclusions: [{
          article: "unsold_98_8" as const,
          houseAcquisitionDate: new Date("2015-08-01"),
          houseContractDate: new Date("2015-06-01"),
          requirementsConfirmed: false,
        }],
      }),
      rates,
    );
    expect(taxed.isExempt).toBe(false);
    expect(taxed.specialHouseExclusionDetail?.excludedCount).toBe(0);
  });

  it("P5-5: §98 + 3주택·조정지역 — 중과 배제 (3호) + flat 20% 유지", () => {
    const rates = makeMockRatesWithHouseEngine();
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("1996-06-15"),
        transferDate: new Date("2022-08-01"),
        householdHousingCount: 3,
        isRegulatedArea: true,
        houses: [
          makeHouseInfo("h1", { acquisitionDate: new Date("1996-06-15"), regionCode: "11680" }),
          makeHouseInfo("h2"),
          makeHouseInfo("h3"),
        ],
        sellingHouseId: "h1",
        reductions: [R98],
      }),
      rates,
    );
    const exclusionStep = r.steps.find((s) => s.label === "감면주택 다주택 중과 배제");
    expect(exclusionStep).toBeDefined();
    expect(exclusionStep?.legalBasis).toContain("3호");
    expect(r.appliedRate).toBe(0.2);
    expect(r.surchargeRate ?? 0).toBe(0);
  });
});
