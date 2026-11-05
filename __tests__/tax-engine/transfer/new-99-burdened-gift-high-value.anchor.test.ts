/**
 * anchor — 부담부증여 × §99·§99의3 고가주택 단서 (리뷰 NH-10, F-45·F-53).
 *
 * 결함: 감면 단서의 고가주택 판정이 `transferPrice` placeholder(= 채무액)를 썼다. 같은 엔진의 소득세법 §89①3호
 * 판정은 증여가액(`burdenedGiftDenominator`)을 쓴다 → 증여가액 10억·채무 3억이면 비과세 판정은 고가주택인데
 * 감면 판정은 3억이라 고가주택이 아니라고 보아 감면했다.
 * 법령: 소령 §156① 고가주택 판정은 «전체이전·일부이전·부담부증여이전 등 이전방식에 관계없이 1주택의 전체가액»
 *   — 부담부증여는 «당해 주택의 증여가액»(서면인터넷방문상담4팀-1692 · -1526 · 국심2007서2099).
 *   조특법 §99①·§99의3① 단서가 소득세법 §89①3호의 고가주택을 가리킨다.
 *
 * 기대값은 «같은 사실에서 고가주택으로 배제된 대조 시료»(채무 7억 — placeholder도 고가) 및 «감면 선택 없는 대조»와 같다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveIncomeDeduction } from "@/lib/tax-engine/transfer-reductions/income-deduction-router";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput, makeMockRatesWithHouseEngine, makeHouseInfo } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const D = (s: string) => new Date(s);

const R993 = {
  type: "new_99_3" as const, contractDate993: D("2003-01-15"), standardPriceAtAcquisition993: 400_000_000, standardPriceAt5Years: 600_000_000,
  standardPriceAtTransfer993: 1_000_000_000, exclusiveAreaSqm993: 84, region993: "outside_speculation" as const, acquisitionType993: "from_builder" as const, firstContract993: "yes" as const,
  isResident993: true, isHousingConstructionBusiness993: false,
};
// §99 — 1998 계약분의 고가주택 = 165㎡ 이상 AND 6억 초과 (면적 요건이 있어 170㎡)
const R99 = {
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 400_000_000, standardPriceAt5Years99: 600_000_000, standardPriceAtTransfer99: 1_000_000_000, exclusiveAreaSqm99: 170,
};
const info = (debt: number, c: number) => ({
  valuationMode: "sangjeungbeop_standard", lendingDepositTotal: debt, mortgageDebtAmount: 0, annualRentTotal: 0, donorRelation: "lineal_descendant",
  landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: c, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 400_000_000,
}) as BurdenedGiftInfo;

const bg = (reductions: unknown[], debt: number, c: number, acq: string, extra: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing", transferType: "burdened_gift", transferPrice: debt, acquisitionPrice: 0, burdenedGiftInfo: info(debt, c),
    transferDate: D("2021-08-01"), acquisitionDate: D(acq), isOneHousehold: true, householdHousingCount: 2, residencePeriodMonths: 0, reductions, ...extra,
  } as never);
const run = (reductions: unknown[], debt: number, c: number, acq: string) => {
  const i = bg(reductions, debt, c, acq);
  return calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
};
const d = (r: ReturnType<typeof calculateTransferTax>) => r.new993Detail ?? r.new99Detail;

describe("NH-10 §99의3 — 증여가액 C 10억 · 채무 3억 (양도 2021-08-01 → 9억 초과 고가주택)", () => {
  it("고가주택으로 배제 · 세액이 감면 없는 대조(30,187,300)와 같다", () => {
    const r = run([R993], 300_000_000, 1_000_000_000, "2003-09-01");
    const ctl = run([], 300_000_000, 1_000_000_000, "2003-09-01");
    expect(d(r)?.isEligible).toBe(false);
    expect(d(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(30_187_300);
  });
  it("채무가 커도(7억) 같은 배제 — 증여가액이 기준이라 채무 크기와 무관", () => {
    const r = run([R993], 700_000_000, 1_000_000_000, "2003-09-01");
    const ctl = run([], 700_000_000, 1_000_000_000, "2003-09-01");
    expect(d(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(98_049_160);
  });
  it("증여가액이 고가가 아니면(C 8억 ≤ 9억) 채무가 작아도 감면 적용 (비고가 짝)", () => {
    const r = run([R993], 300_000_000, 800_000_000, "2003-09-01");
    expect(d(r)?.isEligible).toBe(true);
    expect(d(r)?.reducibleTransferIncome).toBeGreaterThan(0);
  });
  it("경계: C = 9억 정확히 → 적용 / 9억 + 1원 → 배제 (2008.10.6.~2021.12.7. 구간)", () => {
    expect(d(run([R993], 300_000_000, 900_000_000, "2003-09-01"))?.isEligible).toBe(true);
    expect(d(run([R993], 300_000_000, 900_000_001, "2003-09-01"))?.isEligible).toBe(false);
  });
});

describe("NH-10 §99 — 1998 계약 170㎡, 증여가액 10억(6억 초과) · 채무 3억", () => {
  it("고가(고급)주택으로 배제 · 세액이 감면 없는 대조와 같다", () => {
    const r = run([R99], 300_000_000, 1_000_000_000, "1999-01-01");
    const ctl = run([], 300_000_000, 1_000_000_000, "1999-01-01");
    expect(d(r)?.isEligible).toBe(false);
    expect(d(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(ctl.totalTax);
  });
  it("증여가액 5억(6억 이하) → 채무 3억이어도 적용 (비고가 짝)", () => {
    expect(d(run([R99], 300_000_000, 500_000_000, "1999-01-01"))?.isEligible).toBe(true);
  });
});

describe("NH-10 × STEP 0.45 — 고가주택으로 감면이 불성립이면 중과를 배제하지 않는다", () => {
  const ratesH = makeMockRatesWithHouseEngine();
  const runH = (reductions: unknown[]) =>
    calculateTransferTax(
      bg(reductions, 300_000_000, 1_000_000_000, "2003-09-01", {
        isRegulatedArea: true, houses: [makeHouseInfo("h1", { acquisitionDate: D("2003-09-01"), regionCode: "11680" }), makeHouseInfo("h2")], sellingHouseId: "h1",
      }),
      ratesH,
    );
  it("중과 배제 단계 없음 · 중과율·세액이 감면 없는 대조와 같다", () => {
    const r = runH([R993]);
    const ctl = runH([]);
    expect(r.steps.some((s) => /감면주택 다주택 중과 배제/.test(s.label))).toBe(false);
    expect(r.surchargeRate).toBe(ctl.surchargeRate);
    expect(r.totalTax).toBe(ctl.totalTax);
  });
});

describe("NH-10 라우터 — 고가 판정 가액 우선순위: 증여가액(burdenedGiftDenominator) → 총 물건가(지분) → 양도가액", () => {
  const ctx = (o: Record<string, number>) => ({
    transferDate: D("2021-08-01"), acquisitionDate: D("2003-09-01"), transferPrice: 300_000_000, transferIncome: 100_000_000, ...o,
  });
  it("증여가액이 있으면 placeholder(채무액)·총 물건가보다 우선", () => {
    const hv = resolveIncomeDeduction([R993], ctx({ burdenedGiftDenominator: 1_000_000_000 }));
    expect(hv.new993Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    const hvOverTotal = resolveIncomeDeduction([R993], ctx({ burdenedGiftDenominator: 1_000_000_000, totalPropertyTransferPrice: 500_000_000 }));
    expect(hvOverTotal.new993Detail?.isEligible).toBe(false);
  });
  it("지분 부담부증여는 호출자가 «지분 증여가액 ÷ 지분율»(물건 전체)을 싣는다 — 24억 물건 지분 50% 증여분 12억 → 물건 전체 24억으로 판정", () => {
    expect(resolveIncomeDeduction([R993], ctx({ burdenedGiftDenominator: 2_400_000_000 })).new993Detail?.isEligible).toBe(false);
  });
  it("증여가액이 없으면(부담부증여 아님) 종전 순서 그대로", () => {
    expect(resolveIncomeDeduction([R993], ctx({ totalPropertyTransferPrice: 1_000_000_000 })).new993Detail?.isEligible).toBe(false);
    expect(resolveIncomeDeduction([R993], ctx({})).new993Detail?.isEligible).toBe(true);
  });
});
