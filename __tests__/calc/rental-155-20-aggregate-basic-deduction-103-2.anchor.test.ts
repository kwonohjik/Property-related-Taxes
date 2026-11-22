/**
 * anchor — §155⑳ 거주주택 특례 자산이 다건(일괄·연간 합산)에 들어가면 기본공제를 「소득세법」 §103②대로
 * **감면소득금액 외의 양도소득금액에서 먼저** 공제한다 — 일반 경로(§155⑳ 없음)와 같은 배분·같은 §90① 감면.
 *
 * 법령: 「소득세법」 §90① `A × (B − C)/D × E`(B = 제95조 양도소득금액 안의 감면소득금액 — 고가주택은 §95③·
 * 「소득세법 시행령」 §160①로 12억 초과분) · §103② 「감면소득금액 외의 양도소득금액에서 먼저 공제」.
 *
 * 종전(master 3e325088a 실측): 강남 15억 거주주택(§155⑳ A · 조특법 §77 현금 15%) + 토지 3억 일괄에서
 *   ⓐ §155⑳ 결과가 §90①의 B 버킷(`reducibleIncomeBuckets`)을 싣지 않아 M-8이 율이 곱해진 15,465,000을 B(율 1)로 합성했고,
 *   ⓑ 다건이 `skipBasicDeduction: true`로 불러도 이 경로만 기본공제 2,500,000을 또 뺐다(§77 상세 basicDeductionOnCash 2,500,000).
 *   ⇒ 주택에 감면 외 소득이 있는 것처럼 보여 기본공제가 주택에 붙고, 감면 = 72,438,000 × 15,465,000 / 243,100,000 = 4,608,201
 *     (일반 경로 4,719,942 = 72,438,000 × (105,600,000 − 0) / 243,100,000 × 15%) · 총세액 75,534,418(일반 경로 75,433,851).
 *
 * 단건(주택만)은 감면 외 소득이 없어 C = 2,500,000이 맞다 — 3,096,750 그대로다.
 * 세액은 mock 세율표 값이다(구조 증거). 기대값은 일반 경로 대조군을 같은 실행에서 구해 비교하고, 원 단위 anchor를 함께 둔다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "./_helpers/redev-one-house-route";
import { runMulti } from "./_helpers/single-multi-route-parity";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const a = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...a, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;
type Path = "A" | "B" | "none";
const GANGNAM = "1168010100";
const ROW: HouseEntry = { id: "h2", region: "capital", regionCode: GANGNAM, acquisitionDate: "2012-01-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false };
const RENTAL: HouseEntry = { ...ROW, id: "h4", acquisitionDate: "2016-01-01", isLongTermRental: true, isApartment: false };
const EXPR_CASH = { type: "public_expropriation", expropriationCash: "1500000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" };
const EXPR_MIX = { ...EXPR_CASH, expropriationCash: "1000000000", expropriationBond: "500000000" };
const RL_LAND = { type: "replacement_land_comp", rlCashComp: "0", rlLandComp: "1500000000" };

function houseForm(path: Path, withLand: boolean, reduction?: Obj) {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300,000,000", regionCode: GANGNAM, actualSalePrice: "1,500,000,000", addressJibun: "서울 강남구 역삼동 1" } as never;
  if (withLand) f.assets.push({ ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never);
  const rh = path !== "none";
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: String(1_500_000_000 + (withLand ? 300_000_000 : 0)), bundledSaleMode: "actual", residencePeriodMonths: "0", householdHousingCount: rh ? "2" : "1", isRegulatedArea: true, wasRegulatedAtAcquisition: false, houses: rh ? [RENTAL] : [] });
  const a = f.assets[0] as unknown as Obj & { rentalHousingException: Obj };
  a.residenceInputMode = "direct";
  a.residencePeriodMonthsAsset = "48";
  if (path === "A") a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [{ ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-03-01", rentalRegistrationDate: "2019-03-01", standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct", rentalMonths: "90", requirementsConfirmed: true }] };
  if (path === "B") a.rentalHousingException = { ...a.rentalHousingException, applyException: true, scenario: "B", rentalUnits: [], priorResidenceTransferDate: "2020-08-25", wasRegisteredRentalOrChildcare: true, standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "450,000,000", standardPriceAtTransferForPhrp: "500,000,000" };
  if (reduction) Object.assign(a, { reductions: [reduction], transferCause: "public_expropriation", expropriationNoticeDate: "2024-01-01" });
  return f;
}
function landForm(path: Path) {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: "300,000,000" } as never;
  Object.assign(f, { transferDate: "2026-09-18", contractTotalPrice: "300000000", householdHousingCount: path !== "none" ? "2" : "1", isOneHousehold: true });
  return f;
}

async function bundled(path: Path, reduction?: Obj) {
  const r = await runCalc(houseForm(path, true, reduction));
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return r.json.data.aggregated as AggregateTransferResult;
}
async function multi(path: Path, reduction?: Obj) {
  const m = await runMulti([houseForm(path, false, reduction), landForm(path)]);
  expect(m.status).toBe(200);
  return m.json.data as unknown as AggregateTransferResult;
}
const peBreakdown = (p: unknown) => (p as { publicExpropriationDetail?: { breakdown?: Obj } }).publicExpropriationDetail?.breakdown;

/** 같은 사실관계의 일반 경로(§155⑳ 없음)와 세액·배분·§90① 표시가 같다 */
function expectSameAsGeneral(rh: AggregateTransferResult, gen: AggregateTransferResult) {
  expect(rh.properties[0]).toMatchObject({ rentalHousingApplied: true });
  expect(rh.totalTax).toBe(gen.totalTax);
  expect(rh.reductionAmount).toBe(gen.reductionAmount);
  expect(rh.calculatedTax).toBe(gen.calculatedTax);
  expect(rh.properties.map((p) => [p.allocatedBasicDeduction, p.taxBaseShare, p.reducibleIncome, p.reductionAggregated])).toEqual(
    gen.properties.map((p) => [p.allocatedBasicDeduction, p.taxBaseShare, p.reducibleIncome, p.reductionAggregated]),
  );
  const pick = (a: AggregateTransferResult) =>
    (a.reductionBreakdown ?? []).map((b) => [b.eligibleIncomeBeforeRate, b.basicDeductionApplied, b.reducibleIncomeAfterBasicDeduction, b.totalReducibleIncome]);
  expect(pick(rh)).toEqual(pick(gen));
}

describe("§155⑳ 다건 — §103② 기본공제는 감면 외 소득(토지)에서 먼저 · 일반 경로와 같은 §90①", () => {
  it("R-1 ★ 일괄 · §77 현금 — 감면 4,719,942 · 총세액 75,433,851 · 기본공제는 토지 · §77 상세 기본공제 0", async () => {
    const rh = await bundled("A", EXPR_CASH);
    expectSameAsGeneral(rh, await bundled("none", EXPR_CASH));
    expect(rh.reductionAmount).toBe(4_719_942); // 72,438,000 × 105,600,000 / 243,100,000 × 15%
    expect(rh.totalTax).toBe(75_433_851); // 종전 75,534,418
    const [house, land] = rh.properties;
    expect([house.allocatedBasicDeduction, land.allocatedBasicDeduction]).toEqual([0, 2_500_000]);
    expect(peBreakdown(house)).toMatchObject({ cashIncome: 105_600_000, basicDeductionOnCash: 0, reducibleIncome: 15_840_000 });
    expect(rh.reductionBreakdown?.[0]).toMatchObject({ eligibleIncomeBeforeRate: 105_600_000, basicDeductionApplied: 0, reducibleIncomeAfterBasicDeduction: 15_840_000, totalReducibleIncome: 15_840_000 });
  });

  it("R-2 다건 route(주택·토지 각 1건)도 같은 값", async () => {
    const rh = await multi("A", EXPR_CASH);
    expectSameAsGeneral(rh, await multi("none", EXPR_CASH));
    expect([rh.reductionAmount, rh.totalTax]).toEqual([4_719_942, 75_433_851]);
  });

  it("R-3 §77 현금·채권 혼합(15%·20%) — 일반 경로와 같다(감면 5,244,380 · 총세액 74,961,858)", async () => {
    const rh = await bundled("A", EXPR_MIX);
    expectSameAsGeneral(rh, await bundled("none", EXPR_MIX));
    expect([rh.reductionAmount, rh.totalTax]).toEqual([5_244_380, 74_961_858]); // 종전 5,132,639 · 75,062,424
  });

  it("R-4 §77의2 대토 전액 — 일반 경로와 같다(감면 12,586,512 · 총세액 68,353,938)", async () => {
    const rh = await bundled("A", RL_LAND);
    expectSameAsGeneral(rh, await bundled("none", RL_LAND));
    expect([rh.reductionAmount, rh.totalTax]).toEqual([12_586_512, 68_353_938]); // 종전 12,288,536 · 68,622,117
  });

  it("R-5 시나리오 B(소령 §161) · §77 현금 — 주택 전액이 감면소득이라 기본공제는 토지 · 감면 = 559,260,000 × 960,000,000 / 960,000,000 × 15%", async () => {
    const rh = await bundled("B", EXPR_CASH);
    const [house, land] = rh.properties;
    expect([house.allocatedBasicDeduction, land.allocatedBasicDeduction]).toEqual([0, 2_500_000]);
    expect(rh.reductionBreakdown?.[0]).toMatchObject({ aggregateCalculatedTax: 559_260_000, aggregateTaxBase: 960_000_000, eligibleIncomeBeforeRate: 960_000_000, basicDeductionApplied: 0 });
    expect([rh.calculatedTax, rh.reductionAmount, rh.totalTax]).toEqual([591_945_000, 83_889_000, 575_639_400]); // 종전 591,270,000 · 83,656,500 · 575,106,150
  });

  it("R-6 감면 없는 §155⑳ 일괄은 세액 불변(A 79,681,800 · B 650,397,000)", async () => {
    expect((await bundled("A")).totalTax).toBe(79_681_800);
    expect((await bundled("B")).totalTax).toBe(650_397_000);
  });

  it("R-7 단건(주택만)은 감면 외 소득이 없어 C = 2,500,000 — 감면 3,096,750 · 총세액 19,922,425 그대로", async () => {
    const s = await runCalc(houseForm("A", false, EXPR_CASH));
    const r = s.json.data.result as Obj;
    expect(r.rentalHousingExceptionDetail).toMatchObject({ applied: true });
    expect([r.basicDeduction, r.reductionAmount, r.totalTax]).toEqual([2_500_000, 3_096_750, 19_922_425]);
    expect(peBreakdown(r)).toMatchObject({ basicDeductionOnCash: 2_500_000, reducibleIncome: 15_465_000 });
    expect(r.reducibleIncomeBuckets).toEqual([{ income: 105_600_000, rate: 0.15 }]);
  });
});
