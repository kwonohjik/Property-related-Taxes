/**
 * anchor: 함께 양도 안분 모드 — 주 자산도 화면의 안분 키를 감면 기준시가로 쓴다
 * (계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` PR-2 · Q-3 a).
 *
 * 안분 키(자산 「양도시 기준시가」)는 주 자산·컴패니언 모두 화면에 있다(#2366 §8.1 Playwright — 안분 모드 칸 2개).
 * 컴패니언은 그 키를 감면 기준시가로 실었고(#2346 Q-2 a · #2351 Q-3 a), 주 자산은 환산 등에서만 실어
 * 감면 카드 양도시 칸이 비면 ⑧이 막았다. 본문에 키를 실으면 감면 카드에 같은 값을 넣은 세액과 같고(160,260,000),
 * 감면이 없으면 세액이 같다(PA-3 — 11종 실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { engineStdPriceAtTransfer } from "@/lib/calc/engine-std-price-at-transfer";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const STD_FIELD = "reduction.new_99_3.standardPriceAtTransfer993";
const r993 = (tr = "") => ({
  type: "new_99_3", contractDate993: "2002-01-01", usageApprovalDate993: "", standardPriceAt5Years: "400000000",
  standardPriceAtAcquisition993: "300000000", standardPriceAtTransfer993: tr, isRecontractExcluded993: false, recontractUnavoidableCause993: false,
  isRedevelopedNewHouse993: false, previousHouseStdPrice993: "", exclusiveAreaSqm993: "84", region993: "outside_speculation",
  acquisitionType993: "from_builder", hasOccupancyAtContract: false, isResident993: true, isHousingConstructionBusiness993: false,
});
/** 원조합원 입주권 부담부증여 — 일반 기준시가 칸이 화면에 0개(#2351 Playwright). */
const right = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(2), assetId: "o", addressJibun: "서울 강남구 테스트동 9-9",
    assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false, redevSubject: "right",
    acquisitionCause: "purchase", acquisitionDate: "2009-07-01", transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000", bgDonorRelation: "lineal_descendant",
    bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    bgActualAcquisitionTotal: "300,000,000", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
    redevOriginalAssetType: "housing", redevRightsValue: "900,000,000", redevSettlementDirection: "pay",
    redevSettlementAmount: "200,000,000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false,
    standardPriceAtAcq: "", standardPriceAtTransfer: "", ...over,
  }) as AssetForm;
const asset = (id: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), assetId: `a${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing",
    acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "700000000",
    standardPriceAtTransfer: "", useEstimatedAcquisition: false, ...over,
  }) as AssetForm;
const BASE = {
  transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm, contractTotalPrice = "1500000000") =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets: [a], contractTotalPrice }) as TransferFormData;
const bundle = (c: AssetForm, mode: "actual" | "apportioned") =>
  Object.assign(createDefaultTransferFormData(), BASE, {
    assets: [asset(1, { actualSalePrice: "600000000", standardPriceAtTransfer: "400000000" }), c],
    contractTotalPrice: mode === "actual" ? String(600000000 + Number(c.actualSalePrice)) : "1300000000",
    assetSplitMode: "companion", bundledSaleMode: mode,
  }) as TransferFormData;


const blocks = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.some((i) => i.field === STD_FIELD);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const det = (r: { json: any }) => r.json?.data?.aggregated?.determinedTax;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const primStd = (r: { body: any }) => r.body?.standardPriceAtTransfer;
/** 안분 모드 묶음 — 주 자산 키 4억 · 컴패니언 키 9억 · 총액 13억. */
const app = (p: Record<string, unknown> = {}, c: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  Object.assign(createDefaultTransferFormData(), BASE, {
    assets: [asset(1, { actualSalePrice: "", standardPriceAtTransfer: "400000000", ...p }), asset(2, { actualSalePrice: "", standardPriceAtTransfer: "900000000", ...c })],
    contractTotalPrice: "1300000000", assetSplitMode: "companion", bundledSaleMode: "apportioned", ...extra,
  }) as TransferFormData;

describe("PA-1 주 자산 · §99의3 · 감면 카드 양도시 칸 비움 — 안분 키로 감면한다", () => {
  it("⑧ 통과 · ④ 키 4억 전송 · 160,260,000 (종전 ⑧ 차단 · 엔진 MISSING 192,330,000)", async () => {
    const r = await runCalc(app({ reductions: [r993()] }));
    expect(blocks(r)).toBe(false);
    expect(primStd(r)).toBe(400_000_000);
    expect(r.json?.data?.aggregated?.properties?.[0]?.new993Detail?.ineligibleReasons ?? []).toEqual([]);
    expect(det(r)).toBe(160_260_000);
  });

  it("감면 카드에 키와 같은 4억을 넣은 세액과 같다", async () => {
    const r = await runCalc(app({ reductions: [r993("400000000")] }));
    expect(blocks(r)).toBe(false);
    expect(det(r)).toBe(160_260_000);
  });

  it("대조: 컴패니언은 종전대로 키로 감면한다(160,260,000)", async () => {
    const r = await runCalc(app({}, { reductions: [r993()] }));
    expect(blocks(r)).toBe(false);
    expect(det(r)).toBe(160_260_000);
  });
});

describe("PA-2 싣지 않는 경우 — 안분 키가 화면에 없거나 안분 모드가 아니다 (leaf 기대값 = ④ 본문)", () => {
  const cases: [string, () => TransferFormData, number | undefined][] = [
    ["안분 모드 · 키 4억", () => app(), 400_000_000],
    ["실가 거래 모드 · 숨은 4억", () => app({ actualSalePrice: "600000000" }, { actualSalePrice: "700000000" }, { bundledSaleMode: "actual" }), undefined],
    ["단건 · 숨은 4억", () => Object.assign(createDefaultTransferFormData(), BASE, { assets: [asset(1, { standardPriceAtTransfer: "400000000" })], contractTotalPrice: "700000000" }) as TransferFormData, undefined],
    ["축 B(지분) · 숨은 4억", () => Object.assign(app({ ownershipNumerator: "50", ownershipDenominator: "100" }, { ownershipNumerator: "50", ownershipDenominator: "100" }), { assetSplitMode: "fractional" }), undefined],
    ["부담부증여 주 자산(전 자산 부담부증여)", () => app(
      { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000", standardPriceAtAcq: "300000000" },
      { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000", standardPriceAtAcq: "300000000" },
    ), undefined],
  ];
  it.each(cases)("%s", async (_l, mk, expected) => {
    const f = mk();
    const r = await runCalc(f);
    expect(primStd(r)).toBe(expected);
    expect(engineStdPriceAtTransfer(f, 0)).toBe(expected ?? 0);
  });
});

describe("PA-3 감면이 없으면 주 자산 키를 실어도 세액이 같다 — 11종", () => {
  const CASES: [string, Record<string, unknown>, number][] = [
    ["주택 매매", {}, 192_330_000],
    ["토지 매매", { assetKind: "land", acquisitionArea: "200", landNature: "standalone" }, 192_330_000],
    ["건물 매매", { assetKind: "building" }, 192_330_000],
    ["상가 매매", { assetKind: "commercial_building" }, 192_330_000],
    ["주택 증여", { acquisitionCause: "gift" }, 192_330_000],
    ["주택 상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", inheritanceDate: "2015-01-01", publishedValueAtInheritance: "250000000", fixedAcquisitionPrice: "" }, 208_710_000],
    ["주택 감정가액", { isAppraisalAcquisition: true, standardPriceAtAcq: "200000000" }, 190_364_400],
    ["토지 수용", { assetKind: "land", acquisitionArea: "200", landNature: "standalone", transferCause: "public_expropriation", standardPricePerSqmAtTransfer: "1000000", transferArea: "200", compensationPerSqm: "3500000" }, 192_330_000],
    ["주택 경락", { isAuctionTransfer: true, auctionPrice: "650000000" }, 192_330_000],
    ["주택 미등기", { isUnregistered: true }, 192_330_000],
    ["주택 상속(1995 · 피상속인 1980 취득)", { acquisitionCause: "inheritance", decedentAcquisitionDate: "1980-01-01", inheritanceDate: "1995-01-01", acquisitionDate: "1995-01-01", publishedValueAtInheritance: "50000000", fixedAcquisitionPrice: "" }, 262_470_000],
  ];
  it.each(CASES)("%s", async (_l, over, tax) => {
    const r = await runCalc(app(over));
    expect(r.status).toBe(200);
    expect(primStd(r)).toBe(400_000_000);
    expect(det(r)).toBe(tax);
  });
});
