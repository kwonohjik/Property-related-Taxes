/**
 * anchor: 감면 기준시가 폴백 — ⑧이 ④가 엔진에 싣는 **양도시 기준시가**와 같은 leaf를 본다
 * (계획서 `docs/00-pm/burdened-gift-bundle-hidden-stdprice.plan.md` PR-2 · D1·D3).
 *
 * 감면 카드의 양도시 기준시가 칸이 비면 엔진은 자산 입력 `standardPriceAtTransfer`로 대신 계산한다.
 * - **주 자산(D1)**: ④는 환산 등에서만 싣는데 ⑧은 자산의 일반 칸 값을 인정했다 — 실가 모드에 남은 값이면 ⑧ 통과 →
 *   엔진 `MISSING_STD_PRICE`(§1.1). 원조합원 입주권 부담부증여도 일반 주택 실가도 같았다.
 * - **컴패니언(D3, C1)**: ④가 실가 거래 모드에서도 화면에 없는 일반 칸 값을 실어 엔진이 감면 기준시가로 썼다
 *   (§99의3 결정세액 192,330,000 → 170,660,000, §1.5). 이제 화면에 칸이 있을 때만 싣는다.
 * 감면이 없으면 세액은 숨은 값과 무관하다(EA-6 — 11종 실측).
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
import { runCalc, captureBody } from "../calc/_helpers/redev-one-house-route";
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
const compStd = (r: { body: any }) => r.body?.companionAssets?.[0]?.standardPriceAtTransfer;

describe("EA-1 주 자산 — ④가 싣지 않는 숨은 값은 ⑧도 인정하지 않는다 (D1 · 세액 불변)", () => {
  it.each([
    ["원조합원 입주권 부담부증여", (h: Record<string, unknown>) => single(right({ ...h, reductions: [r993()] })), 129_470_000],
    ["일반 주택 실가", (h: Record<string, unknown>) => single(asset(1, { ...h, reductions: [r993()] })), 391_743_000],
  ] as const)("%s: 숨은 양도시 기준시가 5억 → ⑧ 감면 카드 칸 요구 · 엔진 결과 그대로", async (_l, mk, tax) => {
    const r = await runCalc(mk({ standardPriceAtAcq: "100000000", standardPriceAtTransfer: "500000000" }));
    expect(blocks(r)).toBe(true);
    expect(r.body.standardPriceAtTransfer).toBeUndefined();
    expect(r.result?.totalTax).toBe(tax);
    expect(r.result?.new993Detail?.ineligibleReasons?.[0]?.code).toBe("MISSING_STD_PRICE");
  });

  it("환산 주택은 ④가 싣고 ⑧도 인정한다 — 엔진이 그 값으로 감면", async () => {
    const r = await runCalc(
      single(asset(1, { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000", standardPriceAtTransfer: "500000000", reductions: [r993()] }), "700000000"),
    );
    expect(blocks(r)).toBe(false);
    expect(r.body.standardPriceAtTransfer).toBe(500_000_000);
    expect(r.result?.new993Detail?.isEligible).toBe(true);
  });

  it("감면 카드에 넣으면 실가 주택도 통과하고 감면된다", async () => {
    const r = await runCalc(single(asset(1, { reductions: [r993("500000000")] }), "700000000"));
    expect(blocks(r)).toBe(false);
    expect(r.result?.new993Detail?.isEligible).toBe(true);
  });
});

describe("EA-2 컴패니언 실가 거래 — 화면에 없는 칸은 싣지 않는다 (D3 · C1)", () => {
  it("숨은 9억 → ④ 미전송 · ⑧ 감면 카드 칸 요구 · 엔진 MISSING(192,330,000 — 종전 170,660,000)", async () => {
    const r = await runCalc(bundle(asset(2, { standardPriceAtTransfer: "900000000", reductions: [r993()] }), "actual"));
    expect(compStd(r)).toBeUndefined();
    expect(blocks(r)).toBe(true);
    expect(det(r)).toBe(192_330_000);
  });

  it("감면 카드에 9억을 넣으면 종전 숨은 값과 같은 세액(170,660,000)", async () => {
    const r = await runCalc(bundle(asset(2, { reductions: [r993("900000000")] }), "actual"));
    expect(blocks(r)).toBe(false);
    expect(det(r)).toBe(170_660_000);
  });

  it("안분 모드의 안분 키는 계속 싣고 인정한다(#2346 Q-2 a)", async () => {
    const r = await runCalc(bundle(asset(2, { standardPriceAtTransfer: "900000000", reductions: [r993()] }), "apportioned"));
    expect(compStd(r)).toBe(900_000_000);
    expect(blocks(r)).toBe(false);
  });

  it("환산 컴패니언은 실가 거래 모드에서도 싣고 인정한다", async () => {
    const r = await runCalc(
      bundle(asset(2, { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "200000000", standardPriceAtTransfer: "900000000", reductions: [r993()] }), "actual"),
    );
    expect(compStd(r)).toBe(900_000_000);
    expect(blocks(r)).toBe(false);
  });
});

describe("EA-3 ⑧ 인정 ⇔ ④ 본문에 값이 있다 (격자)", () => {
  const cells: [string, () => TransferFormData, number][] = [];
  for (const est of [false, true])
    for (const stale of ["", "900000000"]) {
      const o = { useEstimatedAcquisition: est, fixedAcquisitionPrice: est ? "" : "300000000", standardPriceAtAcq: est ? "200000000" : "", standardPriceAtTransfer: stale };
      cells.push([`주 자산 · 환산=${est} · 칸=${stale || "빈"}`, () => single(asset(1, o), "700000000"), 0]);
      for (const mode of ["actual", "apportioned"] as const)
        cells.push([`컴패니언 · ${mode} · 환산=${est} · 칸=${stale || "빈"}`, () => bundle(asset(2, o), mode), 1]);
    }
  cells.push(["원조합원 입주권 부담부증여 · 숨은 5억", () => single(right({ standardPriceAtTransfer: "500000000" })), 0]);

  it.each(cells)("%s", async (_l, mk, idx) => {
    const f = mk();
    const r = await runCalc(f);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = (idx === 0 ? r.body.standardPriceAtTransfer : (r.body as any).companionAssets?.[0]?.standardPriceAtTransfer) as number | undefined;
    expect(engineStdPriceAtTransfer(f, idx)).toBe(sent ?? 0);
  });
});

describe("EA-4 감면이 없으면 세액은 숨은 값과 무관하다 — 컴패니언 실가 거래 11종", () => {
  const CASES: [string, Record<string, unknown>, number][] = [
    ["주택 매매", {}, 192_330_000],
    ["토지 매매", { assetKind: "land", acquisitionArea: "200", landNature: "standalone" }, 192_330_000],
    ["건물 매매", { assetKind: "building" }, 192_330_000],
    ["상가 매매", { assetKind: "commercial_building" }, 192_330_000],
    ["주택 증여", { acquisitionCause: "gift" }, 192_330_000],
    ["주택 상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", inheritanceDate: "2015-01-01", publishedValueAtInheritance: "250000000", fixedAcquisitionPrice: "" }, 208_710_000],
    ["주택 감정가액", { isAppraisalAcquisition: true, standardPriceAtAcq: "200000000" }, 190_364_400],
    ["주택 고가 15억", { actualSalePrice: "1500000000" }, 459_435_000],
    ["토지 수용", { assetKind: "land", acquisitionArea: "200", landNature: "standalone", transferCause: "public_expropriation", standardPricePerSqmAtTransfer: "1000000", transferArea: "200", compensationPerSqm: "3500000" }, 192_330_000],
    ["주택 경락", { isAuctionTransfer: true, auctionPrice: "650000000" }, 192_330_000],
    ["주택 미등기", { isUnregistered: true }, 348_030_000],
  ];
  it.each(CASES)("%s", async (_l, over, tax) => {
    for (const stale of ["", "900000000"]) {
      const r = await runCalc(bundle(asset(2, { ...over, standardPriceAtTransfer: stale }), "actual"));
      expect(r.status).toBe(200);
      expect(compStd(r)).toBeUndefined();
      expect(det(r)).toBe(tax);
    }
  });
});

describe("EA-5 leaf 분기별 기대값 — ④ 본문 = 기대값 = ⑧ leaf", () => {
  const carry = (over: Record<string, unknown> = {}) => ({
    acquisitionCause: "carryover_gift",
    carryover: {
      ...makeDefaultAsset(9).carryover,
      useEstimatedAcquisition: true,
      estimationMode: "general",
      donorStandardPriceAtAcquisition: "200000000",
      donorStandardPriceAtTransfer: "700000000",
      giftRegistryDate: "2014-01-01",
      donorAcquisitionDate: "2005-01-01",
    },
    ...over,
  });
  const bgHouse = (id: number, over: Record<string, unknown> = {}) =>
    asset(id, {
      transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
      bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", standardPriceAtTransfer: "1000000000",
      standardPriceAtAcq: "500000000", actualSalePrice: "", ...over,
    });
  const allBg = (c: AssetForm) =>
    Object.assign(createDefaultTransferFormData(), BASE, { assets: [bgHouse(1), c], contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }) as TransferFormData;

  const CASES: [string, () => TransferFormData, number, number | undefined][] = [
    ["주 자산 1990 전 토지 환산 — 실가 플래그여도 양도시 칸을 싣는다", () => single(asset(1, { assetKind: "land", acquisitionArea: "200", landNature: "standalone", acquisitionDate: "1985-06-01", pre1990Enabled: true, standardPriceAtTransfer: "500000000" })), 0, 500_000_000],
    ["주 자산 PHD — 환산이어도 싣지 않는다(3시점 입력이 대신한다)", () => single(asset(1, { acquisitionDate: "2003-01-01", usePreHousingDisclosure: true, useEstimatedAcquisition: true, standardPriceAtTransfer: "500000000" })), 0, undefined],
    ["주 자산 이월과세 general 환산 — 증여자 양도시 기준시가", () => single(asset(1, carry({ standardPriceAtTransfer: "500000000" }))), 0, 700_000_000],
    ["컴패니언 이월과세 general 환산 — 증여자 양도시 기준시가(override)", () => bundle(asset(2, carry({ standardPriceAtTransfer: "500000000" })), "actual"), 1, 700_000_000],
    ["컴패니언 분리 축(토지·건물 취득일 다름) — 실가 거래여도 칸이 있다", () => bundle(asset(2, { hasSeperateLandAcquisitionDate: true, standardPriceAtTransfer: "900000000" }), "actual"), 1, 900_000_000],
    ["전 자산 부담부증여 · 입주권 컴패니언 — 다른 칸으로 받는다(숨은 5억 미전송)", () => allBg(right({ standardPriceAtTransfer: "500000000" })), 1, undefined],
    ["전 자산 부담부증여 · 주택 컴패니언 — §159 C 입력 칸이 있다", () => allBg(bgHouse(2, { standardPriceAtTransfer: "600000000" })), 1, 600_000_000],
  ];

  it.each(CASES)("%s", async (_l, mk, idx, expected) => {
    const f = mk();
    const body = await captureBody(f);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sent = (idx === 0 ? body.standardPriceAtTransfer : (body as any).companionAssets?.[0]?.standardPriceAtTransfer) as number | undefined;
    expect(sent).toBe(expected);
    expect(engineStdPriceAtTransfer(f, idx)).toBe(expected ?? 0);
  });
});
