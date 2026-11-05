/**
 * route anchor — 조특법 §99·§99의3 리뷰 PR-4: NH-08(토지만 본인 소유 카드) · NH-10(부담부증여 고가주택 판정 가액).
 * 폼 → ⑧ validate → ④ 변환 → fetch body → ⑫ Zod → ⑭ route → 엔진. 세율표는 route 폴백(`loadFallbackTransferRates`)이라 정본 세액이 아니다.
 *
 * NH-08(Q-28): selfOwns = land_only 카드의 §99·§99의3 → 적용 불가 + 감면 선택 없는 대조와 같은 세액. §99는 «확인 필요» 고지.
 *   ⑧은 막지 않는다 — 선택은 가능하고 결과 카드가 불성립 사유를 알린다(막다른 길 없음). 그래서 ⑧ 통과 ↔ ⑫ 200이 정합이다.
 * NH-10: 부담부증여는 고가주택 판정에 증여가액을 쓴다(소득세법 §89①3호 판정과 같은 소스).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { allIssues, runCalc } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const red993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"), houseType993: "apartment", firstContract993: "yes", // NH-02·NH-17 ⑧ 필수 (#L1b)

  contractDate993: "2002-03-01", acquisitionType993: "from_builder", region993: "outside_speculation", exclusiveAreaSqm993: "84",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "200,000,000", standardPriceAtTransfer993: "400,000,000", ...over,
});
const red99 = () => ({
  ...getReductionDefault("new_99"), houseType99: "apartment", firstContract99: "yes", // NH-02·NH-03 ⑧ 필수 (#L1b)

  contractDate99: "1998-06-01", acquisitionType99: "from_builder", exclusiveAreaSqm99: "84",
  standardPriceAtAcquisition99: "100,000,000", standardPriceAt5Years99: "160,000,000", standardPriceAtTransfer99: "250,000,000",
});

// ── NH-08 ──
function ownerSplit(selfOwns: string, reductions: unknown[], acq: string): TransferFormData {
  const asset = Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq, landAcquisitionDate: acq,
    actualSalePrice: "1,000,000,000", fixedAcquisitionPrice: "450,000,000", selfOwns,
    buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false,
    landAcquisitionPrice: selfOwns === "building_only" ? "" : "200,000,000", buildingAcquisitionPrice: selfOwns === "land_only" ? "" : "250,000,000",
    standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100", standardPriceAtAcq: "150,000,000",
    standardPricePerSqmAtTransfer: "7,000,000", transferArea: "100", buildingStandardPriceAtTransfer: "300,000,000",
    reductions: reductions as never,
  }));
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2022-08-01", contractTotalPrice: "1,000,000,000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const det = (r: any) => r.new993Detail ?? r.new99Detail;

describe("NH-08 route — 토지만 본인 소유 카드의 §99의3·§99", () => {
  it.each([
    ["§99의3", [red993()], "2003-09-01"],
    ["§99", [red99()], "1999-03-01"],
  ] as const)("%s: 적용 불가 · 세액 = 감면 선택 없는 대조 · ⑧은 막지 않는다", async (_n, reds, acq) => {
    const f = ownerSplit("land_only", [...reds], acq);
    const ctlForm = ownerSplit("land_only", [], acq);
    const r = await runCalc(f);
    const ctl = await runCalc(ctlForm);
    expect(r.status).toBe(200);
    expect(det(r.r).isEligible).toBe(false);
    expect(det(r.r).ineligibleReasons.map((q: { code: string }) => q.code)).toEqual(["LAND_ONLY_OWNER"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(124_960_000);
    // ⑧ 통과 ↔ ⑫ 200 정합 — 감면 선택 때문에 새로 생기는 이슈가 없다
    expect(allIssues(f).filter((m) => /99|신축/.test(m))).toEqual([]);
  });
  it("§99 사유에만 «확인 필요»", async () => {
    const r99 = await runCalc(ownerSplit("land_only", [red99()], "1999-03-01"));
    const r993 = await runCalc(ownerSplit("land_only", [red993()], "2003-09-01"));
    expect(det(r99.r).ineligibleReasons[0].message).toContain("확인 필요");
    expect(det(r993.r).ineligibleReasons[0].message).not.toContain("확인 필요");
  });
  it.each([
    ["both", "§99의3", [red993()], "2003-09-01", 94_984_999],
    ["both", "§99", [red99()], "1999-03-01", 86_207_000],
    ["building_only", "§99의3", [red993()], "2003-09-01", undefined],
  ] as const)("짝 불변 — %s × %s는 종전과 같이 적용", async (so, _n, reds, acq, tax) => {
    const r = await runCalc(ownerSplit(so, [...reds], acq));
    expect(r.status).toBe(200);
    expect(det(r.r).isEligible).toBe(true);
    if (tax) expect(r.totalTax).toBe(tax);
  });
});

// ── NH-10 ──
const bgHouse = (reductions: unknown[], debt: string, stdTransfer: string): TransferFormData => {
  const asset = Object.assign({ ...makeDefaultAsset(1) }, x({
    assetId: "h1", addressJibun: "경기도 수원시 팔달구 인계동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-09-01",
    fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: stdTransfer, standardPriceAtAcq: "400000000", useEstimatedAcquisition: false,
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: debt, bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0",
    reductions: reductions as never,
  }));
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2021-08-01", filingDate: "2021-10-31", totalTransferExpense: "0", isOneHousehold: true, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [asset], contractTotalPrice: "",
  }) as TransferFormData;
};
const bgRed = () => red993({ contractDate993: "2003-01-15", standardPriceAtAcquisition993: "400,000,000", standardPriceAt5Years: "600,000,000", standardPriceAtTransfer993: "1,000,000,000" });

describe("NH-10 route — 부담부증여 §99의3 고가주택 (증여가액 10억 · 채무 3억 · 양도 2021-08-01 → 9억 초과)", () => {
  it("고가주택으로 배제 · 세액 = 감면 선택 없는 대조", async () => {
    const r = await runCalc(bgHouse([bgRed()], "300000000", "1000000000"));
    const ctl = await runCalc(bgHouse([], "300000000", "1000000000"));
    expect(r.status).toBe(200);
    expect(det(r.r).isEligible).toBe(false);
    expect(det(r.r).ineligibleReasons.map((q: { code: string }) => q.code)).toEqual(["HIGH_VALUE_HOUSE"]);
    expect(r.totalTax).toBe(ctl.totalTax);
    expect(r.totalTax).toBe(89_608_200);
  });
  it("증여가액이 고가가 아니면(8억) 채무가 작아도 적용 — 비고가 짝", async () => {
    const r = await runCalc(bgHouse([bgRed()], "300000000", "800000000"));
    expect(det(r.r).isEligible).toBe(true);
  });
});
