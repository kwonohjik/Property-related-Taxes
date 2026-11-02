/**
 * anchor — 주 자산 겸용주택 + 함께 양도 묶음 × §155⑳ 거주주택 · §155④⑤ 합가 상대 쪽 임대.
 * 묶음 경로가 판정 입력을 넘기지 않아 주택 카드만 비과세이고 상가 카드(§154③ 본문)는 과세됐다(109,315,954).
 * 금액은 mock 세율. 대조는 같은 묶음에서 임대 행을 뺀 측정값이다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { runCalc, houseRow, allIssues } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NC = "4682025021";
const GANGNAM = "1168010100";
const RULING = "기준-2024-법규재산-0061";
const APPLIED = "겸용주택의 주택 부분을 거주주택으로";
const other = (id: string, o: object = {}) =>
  houseRow(id, "2018-09-27", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const PRICEY = { region: "capital", regionCode: GANGNAM, officialPrice: "400000000", isApartment: true };
const R = other("r", { isLongTermRental: true });
const A = other("a", { mergeOrigin: "counterpart_side" });
const B = other("b", { mergeOrigin: "counterpart_side", isLongTermRental: true });
const unit = () => ({
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "48", requirementsConfirmed: true,
});
const RHE = (o: object = {}) => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: "", ...o });
const CARVE = RHE({ counterpartHouseResidedTwoYears: "yes" });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const R0 = { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0" };
const R30 = { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }] };
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const SMALL = { residentialFloorArea: "60", nonResidentialFloorArea: "100" };
const BIG = { mixedTransferHousingPrice: "1500000000", actualSalePrice: "2000000000" };

const primary = (o: object) => ({
  ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "테스트동 1", regionCode: NC, acquisitionCause: "purchase", acquisitionDate: "2019-08-08",
  fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", ...MIXED, ...o,
});
const land = (o: object = {}) => ({
  ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", landType: "building_site", isNonBusinessLand: false, addressJibun: "테스트동 2", regionCode: NC,
  acquisitionCause: "purchase", acquisitionDate: "2019-08-08", useEstimatedAcquisition: false, fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000",
  standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", acquisitionArea: "100", transferArea: "100", areaScenario: "same", ...o,
});
const form = (o: object, houses: object[], over: object = {}, comp = land()) => {
  const assets = [primary(o), comp];
  return {
    ...createDefaultTransferFormData(), contractTotalPrice: String(assets.reduce((n, a) => n + Number(a.actualSalePrice), 0)), transferDate: "2023-09-18", filingDate: "2023-12-31",
    isOneHousehold: true, assets, houses, householdHousingCount: String(houses.length + 1), householdNoOtherHousesConfirmed: houses.length === 0,
    householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", ...over,
  } as never;
};
const calc = async (f: never) => {
  const r = await runCalc(f);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agg = r.json.data.aggregated as { totalTax: number; warnings: string[]; properties: any[] };
  return {
    status: r.status,
    total: agg.totalTax,
    warn: agg.warnings.join("\n"),
    comm: agg.properties.filter((p) => String(p.propertyId).startsWith("mu-comm")),
    house: agg.properties.filter((p) => String(p.propertyId).startsWith("mu-house")),
  };
};
const total = async (f: never) => (await calc(f)).total;

describe("⑳ 거주주택 — 임대 없는 묶음과 같다", () => {
  it("MB-1 ★ 임대 1채 · 거주 30 → 상가 카드까지 비과세 · 31,641,500 · 근거 고지", async () => {
    const f = form({ ...R30, rentalHousingException: RHE() }, [R]);
    expect(allIssues(f)).toEqual([]);
    const r = await calc(f);
    expect(r.status).toBe(200);
    expect(r.comm.length).toBe(2);
    expect(r.comm.every((p) => p.isExempt && p.determinedTax === 0)).toBe(true);
    expect(r.total).toBe(31_641_500);
    expect(r.total).toBe(await total(form(R30, [])));
    expect(r.warn.split(APPLIED).length - 1).toBe(1);
  });
  it("MB-2 주택 ≤ 상가 → 상가분은 과세로 남는다 · 대조와 같음", async () => {
    const o = { ...R30, ...SMALL };
    const r = await calc(form({ ...o, rentalHousingException: RHE() }, [R]));
    expect(r.comm.every((p) => p.determinedTax > 0)).toBe(true);
    expect(r.total).toBe(await total(form(o, [])));
  });
  it("MB-3 12억 초과 → 대조와 같음", async () => {
    const o = { ...R30, ...BIG };
    expect(await total(form({ ...o, rentalHousingException: RHE() }, [R]))).toBe(await total(form(o, [])));
  });
  it("MB-4 강남 2026-06 · 임대 4억 → 중과 배제 · 대조와 같음", async () => {
    const o = { ...R30, ...BIG, regionCode: GANGNAM };
    const t = { transferDate: "2026-06-18", filingDate: "2026-08-31" };
    const c = land({ regionCode: GANGNAM });
    expect(await total(form({ ...o, rentalHousingException: RHE() }, [{ ...R, ...PRICEY }], t, c))).toBe(await total(form(o, [], t, c)));
  });
});

describe("§155④⑤ 합가 상대 쪽 임대 (0061)", () => {
  it("MB-5 ★ 비조정 거주 0 → 상가 카드까지 비과세 · [A]만인 묶음과 같음 · 근거 고지", async () => {
    const r = await calc(form({ ...R0, rentalHousingException: CARVE }, [A, B], PARENTAL));
    expect(r.comm.every((p) => p.isExempt)).toBe(true);
    expect(r.total).toBe(31_641_500);
    expect(r.total).toBe(await total(form(R0, [A], PARENTAL)));
    expect(r.warn).toContain(RULING);
    // 카드 고지(`[자산명]` 접두)와 같은 문장을 접두 없이 또 싣지 않는다.
    expect(r.warn.split("\n").filter((w) => w.includes(RULING) && !w.startsWith("["))).toEqual([]);
  });
  it("MB-6 12억 초과 → [A]만인 묶음과 같음", async () => {
    const o = { ...R0, ...BIG };
    expect(await total(form({ ...o, rentalHousingException: CARVE }, [A, B], PARENTAL))).toBe(await total(form(o, [A], PARENTAL)));
  });
  it("MB-7 강남 2026-06 거주 30 → 15호 중과 배제 · [A]만인 묶음과 같음", async () => {
    const o = { ...R30, ...BIG, regionCode: GANGNAM };
    const m = { ...PARENTAL, parentalCareMergeDate: "2025-06-28", transferDate: "2026-06-18", filingDate: "2026-08-31" };
    const c = land({ regionCode: GANGNAM });
    const a4 = { ...A, ...PRICEY };
    expect(await total(form({ ...o, rentalHousingException: CARVE }, [a4, { ...B, ...PRICEY }], m, c))).toBe(await total(form(o, [a4], m, c)));
  });
});

describe("불성립 · 미선언은 종전 그대로", () => {
  const TAXED = 214_335_000;
  it("MB-8 거주 0 → ⑧이 막고 · 엔진은 전 카드 과세 · 불성립 고지", async () => {
    const f = form({ ...R0, rentalHousingException: RHE() }, [R]);
    expect(allIssues(f).map((i) => i.field)).toContain("residencePeriods");
    const r = await calc(f);
    expect(r.total).toBe(TAXED);
    expect(r.house.every((p) => !p.isExempt)).toBe(true);
    expect(r.warn).toContain("를 적용하지 않았습니다");
  });
  it("MB-9 상대 쪽 「아니오」 → 과세", async () => {
    expect(await total(form({ ...R0, rentalHousingException: RHE({ counterpartHouseResidedTwoYears: "no" }) }, [A, B], PARENTAL))).toBe(TAXED);
  });
  it("MB-10 ⑳ 미선언 → 과세 · 적용 고지 없음", async () => {
    const r = await calc(form(R30, [R]));
    expect(r.total).toBe(TAXED);
    expect(r.warn).not.toContain(APPLIED);
  });
});
