/**
 * anchor: 지분 분할(축 B) 감면 배관 — 계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` PR-1 (Q-2 a 지분마다).
 *
 * **일반건물 지분 묶음**은 ④가 `generalBuildingShares[]`를 보내고 route 지분 루프가 카드를 만든다. 그 루프만 감면 인자에
 * `undefined`를 넘겨(`general-building-fractional.ts`) §77을 넣어도 결정세액이 감면 없음과 같았다(198,210,000 — 단건 100%는
 * 178,389,000). 지분 payload에는 감면 칸도 없었다. 형제 두 경로(환산·실가 단건)는 F17-A(`91096fa51`)부터 감면을 넘긴다.
 *
 * ⑧·⑤는 지분 카드의 **저장** `assetKind`(기본값 «주택»)를 봐서 일반건물 지분 카드에 주택 감면이 열리고 통과했다.
 * 주택 지분 카드(실가)는 화면에 없는 양도시 기준시가를 ④가 실어 엔진이 감면 기준시가로 썼다(C1과 같은 누수).
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
import { axisBEffectiveAsset } from "@/lib/calc/axis-b-effective-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

/** 조특법 §77 공익수용 — 현금보상 8억, 사업인정고시일 2024-01-01. */
const R77 = { type: "public_expropriation", expropriationCash: "800000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" };
const r993 = (tr = "") => ({
  type: "new_99_3", contractDate993: "2002-01-01", usageApprovalDate993: "", standardPriceAt5Years: "400000000",
  standardPriceAtAcquisition993: "300000000", standardPriceAtTransfer993: tr, isRecontractExcluded993: false, recontractUnavoidableCause993: false,
  isRedevelopedNewHouse993: false, previousHouseStdPrice993: "", exclusiveAreaSqm993: "84", region993: "outside_speculation",
  acquisitionType993: "from_builder", hasOccupancyAtContract: false, isResident993: true, isHousingConstructionBusiness993: false,
});
const half = { ownershipNumerator: "50", ownershipDenominator: "100" };
/** 일반건물 — 토지 100㎡ · 건물 200㎡ · 양도 10억 · 실가 취득 2억(F17 anchor와 같은 물건). */
const gb = (id: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), assetId: `g${id}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", fixedAcquisitionPrice: "200000000",
    actualSalePrice: "1000000000", ...over,
  }) as AssetForm;
/** 지분 카드 — 저장 `assetKind`는 기본값 «주택»이다(① 기본정보를 숨긴다). */
const gbShare = (id: number, over: Record<string, unknown> = {}) => gb(id, { ...half, assetKind: "housing", ...over });
const house = (id: number, over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(id), assetId: `h${id}`, addressJibun: "서울 강남구 테스트동 2-2", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", useEstimatedAcquisition: false, ...half, ...over,
  }) as AssetForm;
const BASE = {
  transferDate: "2024-03-01", filingDate: "2024-05-31", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const single = (a: AssetForm) => Object.assign(createDefaultTransferFormData(), BASE, { assets: [a], contractTotalPrice: "1000000000" }) as TransferFormData;
const shares = (assets: AssetForm[]) =>
  Object.assign(createDefaultTransferFormData(), BASE, { assets, contractTotalPrice: "1000000000", assetSplitMode: "fractional" }) as TransferFormData;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agg = (r: { json: any }) => r.json?.data?.aggregated;
const perCard = (r: Awaited<ReturnType<typeof runCalc>>) =>
  Object.fromEntries((agg(r)?.properties ?? []).map((p: { propertyId: string; reductionAggregated?: number }) => [p.propertyId, p.reductionAggregated ?? 0]));
const ONLY_HOUSING = "감면은 주택 양도에만 적용됩니다";
const STD_FIELD = "reduction.new_99_3.standardPriceAtTransfer993";

describe("GBR-1 일반건물 지분 묶음 — 감면이 엔진에 닿는다 (Q-2 a 지분마다)", () => {
  it("감면 없음: 지분 50/50 = 단건 100% = 198,210,000", async () => {
    expect(agg(await runCalc(single(gb(1))))?.determinedTax).toBe(198_210_000);
    expect(agg(await runCalc(shares([gb(1, half), gbShare(2)])))?.determinedTax).toBe(198_210_000);
  });

  it("양쪽 §77 = 단건 100% §77 = 178,389,000 (종전 198,210,000)", async () => {
    const one = await runCalc(single(gb(1, { reductions: [R77] })));
    expect(agg(one)?.determinedTax).toBe(178_389_000);
    const r = await runCalc(shares([gb(1, { ...half, reductions: [R77] }), gbShare(2, { reductions: [R77] })]));
    expect(r.issues).toEqual([]);
    expect(agg(r)?.determinedTax).toBe(178_389_000);
    expect(agg(r)?.reductionAmount).toBe(19_821_000);
    expect(Object.values(perCard(r)).every((v) => (v as number) > 0)).toBe(true);
  });

  it.each([
    ["첫 지분만", () => shares([gb(1, { ...half, reductions: [R77] }), gbShare(2)]), ["land#0", "building#0"]],
    ["둘째 지분만", () => shares([gb(1, half), gbShare(2, { reductions: [R77] })]), ["land#1", "building#1"]],
  ] as const)("%s §77 → 그 지분 카드만 감면 · 188,255,059", async (_l, mk, reduced) => {
    const r = await runCalc(mk());
    expect(agg(r)?.determinedTax).toBe(188_255_059);
    const cards = perCard(r);
    for (const [id, v] of Object.entries(cards)) expect((v as number) > 0, id).toBe((reduced as readonly string[]).includes(id));
  });

  it("지분 취득일마다 판정한다 — 둘째 지분 2023 취득(사업인정고시 2년 이내)은 그 지분만 감면 0", async () => {
    const r = await runCalc(
      shares([gb(1, { ...half, reductions: [R77] }), gbShare(2, { acquisitionDate: "2023-03-01", reductions: [R77] })]),
    );
    const cards = perCard(r);
    expect(cards["land#0"]).toBeGreaterThan(0);
    expect(cards["land#1"]).toBe(0);
    expect(cards["building#1"]).toBe(0);
  });

  it("④ 본문 — 첫 지분은 최상위 `reductions`, 둘째 지분부터 지분 payload `reductions`", async () => {
    const r = await runCalc(shares([gb(1, { ...half, reductions: [R77] }), gbShare(2, { reductions: [R77] })]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = r.body as any;
    expect(b.reductions.map((x: { type: string }) => x.type)).toEqual(["public_expropriation"]);
    expect(b.generalBuildingShares[0].reductions).toBeUndefined();
    expect(b.generalBuildingShares[1].reductions.map((x: { type: string }) => x.type)).toEqual(["public_expropriation"]);
  });
});

describe("GBR-2 ⑧·⑤ — 지분 카드는 첫 카드의 물건 값으로 본다", () => {
  it("일반건물 지분 카드의 주택 감면(§99의3)은 막힌다 — 대조: 단건 주택은 통과", async () => {
    const r = await runCalc(shares([gb(1, half), gbShare(2, { reductions: [r993("500000000")] })]));
    expect(r.issues.some((i) => i.message.includes(ONLY_HOUSING))).toBe(true);
    const twin = await runCalc(single(house(1, { ownershipNumerator: "100", reductions: [r993("500000000")] })));
    expect(twin.issues.some((i) => i.message.includes(ONLY_HOUSING))).toBe(false);
  });

  it("leaf: 지분 카드 = 첫 카드 자산 종류(일반건물·토지), 함께 양도·단건은 저장값 그대로", () => {
    expect(axisBEffectiveAsset(shares([gb(1, half), gbShare(2)]), 1).assetKind).toBe("general_building");
    expect(axisBEffectiveAsset(shares([house(1, { assetKind: "land" }), house(2)]), 1).assetKind).toBe("land");
    const companion = Object.assign(shares([house(1), house(2, { assetKind: "building" })]), { assetSplitMode: "companion" });
    expect(axisBEffectiveAsset(companion, 1).assetKind).toBe("building");
    expect(axisBEffectiveAsset(shares([gb(1, half), gbShare(2)]), 0).assetKind).toBe("general_building");
  });
});

describe("GBR-3 주택 지분 카드 — 화면에 없는 양도시 기준시가는 싣지 않는다", () => {
  const axisB993 = (over: Record<string, unknown>, red: object) => shares([house(1), house(2, { acquisitionDate: "2018-01-01", reductions: [red], ...over })]);

  it("실가 · 숨은 9억 → ④ 미전송 · ⑧ 감면 카드 칸 요구 · 엔진 감면 없음 212,910,000 (종전 191,350,000)", async () => {
    const r = await runCalc(axisB993({ standardPriceAtTransfer: "900000000" }, r993()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((r.body as any).companionAssets[0].standardPriceAtTransfer).toBeUndefined();
    expect(r.issues.some((i) => i.field === STD_FIELD)).toBe(true);
    expect(agg(r)?.determinedTax).toBe(212_910_000);
  });

  it("감면 카드에 9억을 넣으면 종전 숨은 값과 같은 세액(191,350,000)", async () => {
    const r = await runCalc(axisB993({}, r993("900000000")));
    expect(r.issues.some((i) => i.field === STD_FIELD)).toBe(false);
    expect(agg(r)?.determinedTax).toBe(191_350_000);
  });

  it("환산 지분 카드는 칸이 화면에 있다 — 싣고 인정한다", async () => {
    const est = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000", standardPriceAtTransfer: "900000000" };
    const r = await runCalc(axisB993(est, r993()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((r.body as any).companionAssets[0].standardPriceAtTransfer).toBe(900_000_000);
    expect(r.issues.some((i) => i.field === STD_FIELD)).toBe(false);
  });

  it("leaf 기대값 — 일반건물 지분 0 · 주택 지분 실가 0 · 환산 9억 (④ 본문과 같다)", () => {
    expect(engineStdPriceAtTransfer(shares([gb(1, half), gbShare(2, { standardPriceAtTransfer: "900000000" })]), 1)).toBe(0);
    // 환산 지분이어도 일반건물 지분 묶음은 `companionAssets`가 없다 — 0.
    expect(engineStdPriceAtTransfer(shares([gb(1, half), gbShare(2, { useEstimatedAcquisition: true, standardPriceAtTransfer: "900000000" })]), 1)).toBe(0);
    expect(engineStdPriceAtTransfer(shares([house(1), house(2, { standardPriceAtTransfer: "900000000" })]), 1)).toBe(0);
    expect(
      engineStdPriceAtTransfer(shares([house(1), house(2, { useEstimatedAcquisition: true, standardPriceAtTransfer: "900000000" })]), 1),
    ).toBe(900_000_000);
    // 부담부증여 지분은 종전대로 싣는다(② 양도정보가 첫 카드 값 — 범위 밖). 시가 모드는 함께 양도에서는 공용 칸이 없는 자산이다.
    const bg = { transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgDonorRelation: "lineal_descendant", bgMortgageDebtAmount: "200000000" };
    expect(engineStdPriceAtTransfer(shares([house(1, bg), house(2, { standardPriceAtTransfer: "900000000" })]), 1)).toBe(900_000_000);
    // 축 B는 안분 키가 없다 — 폼 모드가 안분이어도 실가 지분 카드는 0.
    expect(engineStdPriceAtTransfer(Object.assign(shares([house(1), house(2, { standardPriceAtTransfer: "900000000" })]), { bundledSaleMode: "apportioned" }), 1)).toBe(0);
  });
});

describe("GBR-4 감면이 없으면 주택 지분 묶음 세액은 숨은 값과 무관하다 — 8종", () => {
  const CASES: [string, Record<string, unknown>, number][] = [
    ["주택 매매", {}, 212_910_000],
    ["토지", { assetKind: "land", acquisitionArea: "200", landNature: "standalone" }, 212_910_000],
    ["건물", { assetKind: "building" }, 212_910_000],
    ["상가", { assetKind: "commercial_building" }, 212_910_000],
    ["주택 증여", { acquisitionCause: "gift" }, 212_910_000],
    ["주택 상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", inheritanceDate: "2015-01-01", publishedValueAtInheritance: "250000000", fixedAcquisitionPrice: "" }, 230_760_000],
    ["주택 감정", { isAppraisalAcquisition: true, standardPriceAtAcq: "200000000" }, 210_768_000],
    ["주택 미등기", { isUnregistered: true }, 333_170_000],
  ];
  it.each(CASES)("%s", async (_l, over, tax) => {
    for (const stale of ["", "900000000"]) {
      const r = await runCalc(shares([house(1, over), house(2, { ...over, acquisitionDate: "2018-01-01", standardPriceAtTransfer: stale })]));
      expect(r.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((r.body as any).companionAssets[0].standardPriceAtTransfer).toBeUndefined();
      expect(agg(r)?.determinedTax).toBe(tax);
    }
  });
});
