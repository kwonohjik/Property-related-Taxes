/**
 * anchor — 축 B(같은 물건 지분 분할 취득) 주택 지분 × 영 §155 판정 사실.
 * 둘째 지분 카드에 세대·물건 사실(명부·합가·일시적 2주택·⑳ 선언 등)이 실리지 않아, 앞 지분은 비과세인데 둘째 지분만 과세됐다
 * (60/40 · 10억: 53,933,000 / 단건 0). 금액은 mock 세율. 대조는 같은 사실의 단건 세액이다.
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
// 카드 입력 비교용 — 합산 엔진은 그대로 돌리고 받은 카드만 기록한다.
const seen = vi.hoisted(() => ({ properties: [] as Record<string, unknown>[] }));
vi.mock("@/lib/tax-engine/transfer-tax-aggregate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-aggregate")>();
  return {
    ...actual,
    calculateTransferTaxAggregateWithUnits: (...args: Parameters<typeof actual.calculateTransferTaxAggregateWithUnits>) => {
      seen.properties = args[0].properties as unknown as Record<string, unknown>[];
      return actual.calculateTransferTaxAggregateWithUnits(...args);
    },
  };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { runCalc, houseRow, captureBody, postTransfer } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NC = "4682025021";
const GANGNAM = "1168010100";
const other = (id: string, acq = "2018-09-27", o: object = {}) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const PRICEY = { region: "capital", regionCode: GANGNAM, officialPrice: "400000000", isApartment: true };
const R = other("r", undefined, { isLongTermRental: true });
const A = other("a", undefined, { mergeOrigin: "counterpart_side" });
const B = other("b", undefined, { mergeOrigin: "counterpart_side", isLongTermRental: true });
const NEW = other("n", "2023-01-15");
const unit = () => ({
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "48", requirementsConfirmed: true,
});
const RHE = (o: object = {}) => ({ applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", counterpartHouseResidedTwoYears: "", ...o });
const CARVE = RHE({ counterpartHouseResidedTwoYears: "yes" });
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const R30 = { residencePeriods: [{ moveInDate: "2019-08-08", moveOutDate: "2022-02-08" }] };
const R0 = { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0" };
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const APT = { ...{ acquisitionCause: "purchase", acquisitionDate: "2010-03-01", useEstimatedAcquisition: false, fixedAcquisitionPrice: "", redevActualAcquisitionPrice: "400000000", redevApprovalDate: "2018-05-01", redevRightsValue: "600000000", redevSettlementDirection: "pay", redevSettlementAmount: "100000000", redevPreApprovalExpenses: "20000000", redevOriginalAssetType: "housing", capitalExpenditure: "30000000", transferExpense: "10000000", addressJibun: "서울 A 1" }, assetKind: "redevelopment_apt", redevSubject: "apt" };

const share = (n: number, num: string, o: object) => ({
  ...makeDefaultAsset(n), assetKind: "housing", addressJibun: "테스트동 1", regionCode: NC, acquisitionCause: "purchase", acquisitionDate: "2019-08-08",
  fixedAcquisitionPrice: "500000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000",
  assetId: `s${n}`, ownershipNumerator: num, ownershipDenominator: "100", ...o,
});
const FR = { assetSplitMode: "fractional", bundledSaleMode: "actual" };
function form(assets: object[], houses: object[], over: object = {}) {
  return {
    ...createDefaultTransferFormData(), contractTotalPrice: "1000000000", transferDate: "2023-09-18", filingDate: "2023-12-31", isOneHousehold: true,
    assets, houses, householdHousingCount: String(houses.length + 1), householdNoOtherHousesConfirmed: houses.length === 0,
    householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", ...over,
  } as never;
}
/** 같은 사실 · 단건(100%)과 60/40 지분 */
const single = (kind: object, a: object, houses: object[], over: object = {}) => form([share(1, "100", { ...kind, ...a })], houses, over);
/** 둘째 지분은 같은 물건이라 소재지를 따라간다. 선언(⑳)·거주는 첫 지분에만 넣는다 — 화면도 첫 자산에서만 받는다. */
const shares = (kind: object, a: object, houses: object[], over: object = {}, second: object = {}) =>
  form([share(1, "60", { ...kind, ...a }), share(2, "40", { ...kind, ...("regionCode" in a ? { regionCode: a.regionCode } : {}), ...second })], houses, { ...FR, ...over });
const totalOf = async (f: never) => {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const d = r.json.data;
  return { total: (d.aggregated?.totalTax ?? d.result.totalTax ?? d.result.total?.totalPayable) as number, warnings: (d.aggregated?.warnings ?? d.result.warnings ?? []) as string[] };
};

const CASES: [string, object, object[], object][] = [
  ["⑳ 거주주택", { ...R30, rentalHousingException: RHE() }, [R], {}],
  ["0061 합가 상대 쪽 임대", { ...R0, rentalHousingException: CARVE }, [A, B], PARENTAL],
  ["동거봉양 합가", R0, [A], PARENTAL],
  ["일시적 2주택", R30, [NEW], {}],
];

describe.each([
  ["일반 주택", {}],
  ["겸용", MIXED],
  ["완공APT", APT],
] as const)("%s — 둘째 지분도 단건과 같은 판정", (_name, kind) => {
  it.each(CASES)("SH ★ %s → 단건과 같은 0", async (_c, a, houses, over) => {
    expect((await totalOf(single(kind, a, houses, over))).total).toBe(0);
    expect((await totalOf(shares(kind, a, houses, over))).total).toBe(0);
  });
});

describe("금액·지역 — 단건과 같다", () => {
  const BIG = { actualSalePrice: "2000000000" };
  const F2 = { contractTotalPrice: "2000000000" };
  it("SH-20 ⑳ 20억 → 12억 안분 171,006,000", async () => {
    const a = { ...R30, ...BIG, rentalHousingException: RHE() };
    expect((await totalOf(shares({}, a, [R], F2, BIG))).total).toBe(171_006_000);
    expect((await totalOf(single({}, a, [R], F2))).total).toBe(171_006_000);
  });
  it("SH-21 일시적 2주택 20억 → 171,006,000", async () => {
    const a = { ...R30, ...BIG };
    expect((await totalOf(shares({}, a, [NEW], F2, BIG))).total).toBe((await totalOf(single({}, a, [NEW], F2))).total);
  });
  it("SH-22 ⑳ 강남 2026-06 임대 4억 → 중과 배제 · 단건과 같음", async () => {
    const a = { ...R30, ...BIG, regionCode: GANGNAM, rentalHousingException: RHE() };
    const T = { transferDate: "2026-06-18", filingDate: "2026-08-31", ...F2 };
    expect((await totalOf(shares({}, a, [{ ...R, ...PRICEY }], T, BIG))).total).toBe((await totalOf(single({}, a, [{ ...R, ...PRICEY }], T))).total);
  });
  it("SH-23 강남 2026-06 3주택 → 중과 · 단건과 같음", async () => {
    const a = { ...R30, ...BIG, regionCode: GANGNAM };
    const T = { transferDate: "2026-06-18", filingDate: "2026-08-31", ...F2 };
    const hs = [other("x", "2018-01-01", PRICEY), other("y", "2018-01-02", PRICEY)];
    expect((await totalOf(shares({}, a, hs, T, BIG))).total).toBe((await totalOf(single({}, a, hs, T))).total);
  });
});

describe("불성립 · 미선언은 단건처럼 과세", () => {
  it("SH-30 ⑳ 미선언 · 임대 명부 → 172,766,000", async () => {
    expect((await totalOf(shares({}, R30, [R]))).total).toBe(172_766_000);
  });
  it("SH-31 ⑳ 거주 0 불성립 → 172,766,000", async () => {
    expect((await totalOf(shares({}, { ...R0, rentalHousingException: RHE() }, [R]))).total).toBe(172_766_000);
  });
});

describe("늦게 취득한 지분은 자기 취득일로 판정한다", () => {
  it("SH-40 둘째 지분 2023-02 취득 · 보유 2년 미만 → 특례와 무관하게 그 지분만 과세 152,075,000", async () => {
    const late = { acquisitionDate: "2023-02-01" };
    for (const [, a, houses, over] of CASES) {
      expect((await totalOf(shares({}, a, houses, over, late))).total).toBe(152_075_000);
    }
  });
});

describe("겸용 지분 근거 고지", () => {
  it("SH-50 ⑳ → 「주택 부분을 거주주택으로」 문장이 접두 없이 한 번", async () => {
    const { warnings } = await totalOf(shares(MIXED, { ...R30, rentalHousingException: RHE() }, [R]));
    expect(warnings.filter((w) => w.includes("겸용주택의 주택 부분을 거주주택으로")).length).toBe(1);
  });
});

/**
 * 판정 사실 7키 세액 — 그 사실이 단건 세액을 바꾸는 시료. 판정 메뉴·별도 입력에서 오는 값이라 본문에 직접 싣는다.
 * 키가 둘째 지분에 안 닿으면 지분 세액이 단건과 갈린다(60/40: 53,933,000 · 수용 152,075,000 · 유예 760,056,000 · 지구 52,261,000).
 * regionCode는 행이 없다 — 화면 본문은 조정 여부 boolean이 같은 결론을 실어, 키를 빼도 세액이 같았다(SH-60만 잡는다).
 */
const T24 = { transferDate: "2024-06-18", filingDate: "2024-08-31" };
const FACT_TAX: [string, object, object[], object, object, object][] = [
  ["marriageMerge 혼인 합가", R0, [A], {}, { marriageMerge: { marriageDate: "2023-06-28" }, isFirstTransferredInMerge: true }, {}],
  ["winWinRentalHouse 상생임대 · 강남 거주 0", { ...R0, regionCode: GANGNAM }, [], T24, { winWinRentalHouse: { winWinContractDate: "2022-01-10", increaseRatePct: 3, priorLeaseMonths: 24, winWinLeaseMonths: 24 } }, {}],
  ["specialHouseExclusions §98의3 미분양 제외", R30, [other("x", "2009-06-01")], {}, { specialHouseExclusions: [{ article: "unsold_98_3", houseId: "x", houseAcquisitionDate: "2009-06-01", houseContractDate: "2009-05-01", requirementsConfirmed: true }] }, {}],
  ["oneHouseExemptionProviso 수용 · 보유 1년", { ...R0, acquisitionDate: "2022-10-01" }, [], {}, { oneHouseExemptionProviso: { reason: "expropriation", expropriationDate: "2023-09-18", businessApprovalDate: "2023-01-01" } }, { acquisitionDate: "2022-10-01" }],
  ["gracePeriod 다목 · 강남 3주택 2026-06", { ...R30, actualSalePrice: "2000000000", regionCode: GANGNAM }, [other("x", "2018-01-01", PRICEY), other("y", "2018-01-02", PRICEY)], { transferDate: "2026-06-18", filingDate: "2026-08-31", contractTotalPrice: "2000000000" }, { gracePeriod: { contractDate: "2026-04-01", isLandPermitTarget: false, depositReceiptConfirmed: true } }, { actualSalePrice: "2000000000" }],
  ["unavoidableOutsideCapitalHouse §155⑧", R30, [other("x", "2018-09-27")], {}, { unavoidableOutsideCapitalHouse: { reason: "work", unresolvedAtTransfer: true } }, {}],
  ["regionInDesignatedDistrict 지구 밖 선언", { ...R0, regionCode: "4159710200", acquisitionDate: "2019-01-07", regionInDesignatedDistrict: true }, [], { transferDate: "2024-06-03", filingDate: "2024-08-31" }, { regionInDesignatedDistrict: false }, { acquisitionDate: "2019-01-07" }],
];
const totalWith = async (f: never, patch: object) => {
  const body = await captureBody(f);
  const r = await postTransfer(Object.assign(body, patch));
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  return (r.json.data.aggregated?.totalTax ?? r.json.data.result.totalTax) as number;
};

describe("판정 사실 키 세액 — 둘째 지분도 단건과 같다", () => {
  it.each(FACT_TAX)("SH-70 💰 %s", async (_k, a, houses, over, patch, second) => {
    const one = await totalWith(single({}, a, houses, over), patch);
    expect(one, "시료가 이 사실에 반응하지 않는다").not.toBe(await totalWith(single({}, a, houses, over), {}));
    expect(await totalWith(shares({}, a, houses, over, second), patch)).toBe(one);
  });
});

/** 소스 목록을 import하지 않는다 — 목록에서 키가 빠지면 이 행도 같이 빠져 아무것도 못 잡는다. */
const FACT_KEYS = [
  "houses", "sellingHouseId", "marriageMerge", "parentalCareMerge", "isFirstTransferredInMerge", "temporaryTwoHouse", "winWinRentalHouse",
  "specialHouseExclusions", "rentalHousingException", "oneHouseExemptionProviso", "gracePeriod", "unavoidableOutsideCapitalHouse",
  "regionCode", "regionInDesignatedDistrict",
] as const;

describe("판정 사실 키 — 둘째 지분 카드가 첫 지분과 같은 값을 받는다", () => {
  it("SH-60 🔑 키 목록 전부 · 값이 있는 사실로 채운 본문", async () => {
    const body = await captureBody(shares({}, { ...R30, rentalHousingException: RHE() }, [R]));
    Object.assign(body, {
      marriageMerge: { marriageDate: "2023-06-28" },
      parentalCareMerge: undefined,
      winWinRentalHouse: { winWinContractDate: "2021-03-01", increaseRatePct: 3, priorLeaseMonths: 24, winWinLeaseMonths: 24 },
      oneHouseExemptionProviso: { reason: "expropriation" },
      gracePeriod: { contractDate: "2026-05-01" },
      unavoidableOutsideCapitalHouse: { reason: "work", unresolvedAtTransfer: true },
      specialHouseExclusions: [{ article: "rental_97", houseId: "r", requirementsConfirmed: true }],
      temporaryTwoHouse: body.temporaryTwoHouse ?? { previousAcquisitionDate: "2019-08-08", newAcquisitionDate: "2023-01-15" },
      regionCode: NC,
      regionInDesignatedDistrict: true,
    });
    const r = await postTransfer(body);
    expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
    const [first, second] = [seen.properties.find((p) => p.propertyId === "primary")!, seen.properties.find((p) => p.propertyId !== "primary")!];
    const missing = FACT_KEYS.filter((k) => k !== "parentalCareMerge" && k !== "isFirstTransferredInMerge" && first[k] === undefined);
    expect(missing, "시료가 채우지 못한 키 — 이 키의 누락은 이 행이 잡지 못한다").toEqual([]);
    for (const k of FACT_KEYS) expect(second[k], k).toEqual(first[k]);
  });
});
