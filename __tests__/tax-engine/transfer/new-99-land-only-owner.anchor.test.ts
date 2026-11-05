/**
 * anchor — 소유자 분리(토지만 본인) 주택 카드의 §99·§99의3 (리뷰 NH-08 · Q-28) + 중과 배제 선판정 정합.
 *
 * 결함: `selfOwns = "land_only"` 카드에서 §99·§99의3을 고르면 «본인 토지분» 양도소득에서 차감했다.
 * 법령: 주택과 부수토지 소유자가 다르면 부수토지 양도소득은 신축주택 감면 대상이 아니다
 *   (서면인터넷방문상담4팀-1118 · 국심2006중4504 · 조심2013중3556 — 모두 §99의3). §99는 정면 해석례가 없어
 *   같은 문언의 §99의3 해석을 따르되 «확인 필요»를 고지한다(Q-28).
 *
 * 기대값은 «감면 선택 없는 대조 시료»(같은 사실에서 reductions=[])의 세액과 같다. 세율표는 mock(정본 세액 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, makeMockRatesWithHouseEngine, makeHouseInfo, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const R993 = {
  type: "new_99_3" as const, contractDate993: D("2002-03-01"), acquisitionType993: "from_builder" as const, firstContract993: "yes" as const, region993: "outside_speculation" as const,
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};
const R99 = {
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 250_000_000, exclusiveAreaSqm99: 84,
};

const mk = (selfOwns: string, acq: string, landAcq: string, sameHh: boolean, reductions: unknown[]) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 450_000_000, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    isSeparateAcquisition: true, selfOwns, buildingOwnerSameHousehold: sameHh, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000,
    acquisitionDate: D(acq), landAcquisitionDate: D(landAcq), transferDate: D("2022-08-01"), reductions,
  } as never);

const run = (selfOwns: string, acq: string, landAcq: string, sameHh: boolean, reductions: unknown[]) =>
  calculateTransferTax(mk(selfOwns, acq, landAcq, sameHh, reductions), rates);

const detail = (r: ReturnType<typeof calculateTransferTax>) => r.new993Detail ?? r.new99Detail;

describe("NH-08 land_only × §99의3 — 토지만 본인이면 신축주택 취득자가 아니라 불성립 (대조 = 감면 없음)", () => {
  for (const sameHh of [true, false]) {
    it(`sameHh=${sameHh}: 적용 불가 · 세액이 감면 없는 대조와 같다`, () => {
      const r = run("land_only", "2003-09-01", "2003-09-01", sameHh, [R993]);
      const ctl = run("land_only", "2003-09-01", "2003-09-01", sameHh, []);
      expect(detail(r)?.isEligible).toBe(false);
      expect(detail(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["LAND_ONLY_OWNER"]);
      expect(detail(r)?.reducibleTransferIncome).toBe(0);
      expect(r.totalTax).toBe(ctl.totalTax);
      expect(r.totalTax).toBe(124_366_000);
    });
  }
  it("2호 자기건설(해석례 사실관계: 사용승인 2002-12-31, 토지 2002-02-18)도 같다", () => {
    const self993 = { ...R993, acquisitionType993: "self_built" as const, contractDate993: undefined, usageApprovalDate993: D("2002-12-31") };
    const r = run("land_only", "2002-12-31", "2002-02-18", true, [self993]);
    const ctl = run("land_only", "2002-12-31", "2002-02-18", true, []);
    expect(detail(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["LAND_ONLY_OWNER"]);
    expect(r.totalTax).toBe(ctl.totalTax);
  });
});

describe("NH-08 land_only × §99 — 정면 해석례 없음: 불성립 + «확인 필요» 고지 (Q-28)", () => {
  it("적용 불가 · 세액 = 대조 · 사유 문구에 확인 필요", () => {
    const r = run("land_only", "1999-01-01", "1999-01-01", true, [R99]);
    const ctl = run("land_only", "1999-01-01", "1999-01-01", true, []);
    expect(detail(r)?.isEligible).toBe(false);
    expect(detail(r)?.ineligibleReasons.map((x) => x.code)).toEqual(["LAND_ONLY_OWNER"]);
    expect(detail(r)?.ineligibleReasons[0].message).toContain("확인 필요");
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(124_366_000);
  });
  it("§99의3 사유 문구에는 «확인 필요»가 없다 (정면 해석례가 있다)", () => {
    const r = run("land_only", "2003-09-01", "2003-09-01", true, [R993]);
    expect(detail(r)?.ineligibleReasons[0].message).not.toContain("확인 필요");
    expect(detail(r)?.ineligibleReasons[0].message).toContain("서면인터넷방문상담4팀-1118");
  });
});

describe("NH-08 짝 불변 — both·building_only는 종전과 같이 적용 (회귀 안전망)", () => {
  it.each([
    ["both", "993", 94_390_999, 385_000_000],
    ["both", "99", 85_613_000, 385_000_000],
    ["building_only", "993", 2_401_500, 35_000_000],
    ["building_only", "99", 2_086_500, 35_000_000],
  ] as const)("%s × §%s: 적용 · 총세액 %i", (selfOwns, art, tax, applied) => {
    const is993 = art === "993";
    const r = run(selfOwns, is993 ? "2003-09-01" : "1999-01-01", is993 ? "2003-09-01" : "1999-01-01", true, [is993 ? R993 : R99]);
    expect(detail(r)?.isEligible).toBe(true);
    expect(detail(r)?.transferIncomeApplied).toBe(applied);
    expect(r.totalTax).toBe(tax);
  });
});

describe("NH-08 × STEP 0.45 — 감면이 불성립이면 다주택 중과를 배제하지 않는다 (소령 §167의3①5호 «감면되는 주택»)", () => {
  const ratesH = makeMockRatesWithHouseEngine();
  const base = (reductions: unknown[]) =>
    baseTransferInput({
      propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 450_000_000, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      isRegulatedArea: true, houses: [makeHouseInfo("h1", { acquisitionDate: D("2003-09-01"), regionCode: "11680" }), makeHouseInfo("h2")], sellingHouseId: "h1",
      isSeparateAcquisition: true, selfOwns: "land_only", buildingOwnerSameHousehold: true, landAcqMode: "actual", buildingAcqMode: "actual",
      landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000,
      acquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01"), transferDate: D("2022-08-01"), reductions,
    } as never);
  it("land_only §99의3: 중과 배제 단계가 없고 세액이 감면 없는 대조와 같다", () => {
    const r = calculateTransferTax(base([R993]), ratesH);
    const ctl = calculateTransferTax(base([]), ratesH);
    expect(r.steps.some((s) => /감면주택 다주택 중과 배제/.test(s.label))).toBe(false);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.surchargeRate).toBe(ctl.surchargeRate);
  });
});
