/**
 * anchor — **부담부증여 취득가액 칸을 비워 취득가액 0으로 계산되던 틈** (입주권 밖). 계획서 `docs/00-pm/bg-acq-part-zero-gap.plan.md`.
 *
 * 종전 ① 일반건물 토지·건물 한쪽만 입력: ⑧ 통과 ∧ ⑫ 200 — 비운 쪽 취득가액 0(K-4·K-6·K-7·이월과세 시나리오 A·B 모두). 시나리오 B는 채택 시나리오까지 바뀌었다.
 * 종전 ② 함께 양도 둘째 이후 자산의 K-4 비움: ⑧ 차단 ∧ ⑫ 200 — 주 자산 refine이 컴패니언에 없었다.
 *
 * 오라클(손계산 — K-4 · 시가 10억 · 채무 4억 · 채무비율 0.4 · 양도가액 4억 · 실지 2.5억): 4억 − 2.5억 × 0.4 = **300,000,000** · 지분 50%(채무 2억) **150,000,000** · 주택 + 같은 값 묶음 **600,000,000**.
 * 비운 값(종전): 토지만 360,000,000 · 건물만 340,000,000 · 묶음 둘째 비움 700,000,000.
 * 일반건물 K-6/K-7·이월과세 값은 양도가액 5억·채무비율 0.5의 취득가액(토지 1억 × 0.5 · 건물 2억 × 0.5)만 본다.
 *
 * · PZ-1 일반건물 K-4 · PZ-2 일반건물 K-6/K-7 · PZ-3 이월과세 시나리오 A·B — 한쪽 입력: ⑧ 그 칸 ∧ ⑫ 400, 두 칸: 통과 ∧ 값.
 * · PZ-4 함께 양도 둘째 이후 K-4 — ⑧ ⊇ ⑫.
 * · PZ-5 쓰이지 않으면 요구하지 않는다 — 담보 승.
 * · PZ-6 주택·건물 토지·건물 분리(취득일 다름) — ⑧은 전부터 막았고 ⑫ 직접 호출이 200이었다. 두 칸 K-7 오라클: 4억 − 2.5억 × 0.4 − 개산공제(기준시가 4억 × 0.4 × 3% = 480만) = 295,200,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { bgAsset, bgForm } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FORM = { filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const COMMON = { addressJibun: "제주특별자치도 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400000000", bgMortgageSetAmount: "400000000", bgAcquisitionMethod: "actual",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000" };
const KIND: Record<string, Record<string, unknown>> = {
  housing: { assetKind: "housing", bgActualAcquisitionTotal: "250000000" },
  land: { assetKind: "land", bgActualAcquisitionLand: "250000000", bgStdLandAtTransfer: "800000000", bgStdLandAtAcq: "400000000", landAreaM2: "100", landNature: "independent", companionLandNature: "independent" },
  building: { assetKind: "building", bgActualAcquisitionTotal: "250000000" },
  commercial_building: { assetKind: "commercial_building", bgActualAcquisitionTotal: "250000000" },
  general_building: { assetKind: "general_building", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
    gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "2015-01-01", useEstimatedAcquisition: false, bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "150000000" },
  redevelopment_apt: { assetKind: "redevelopment_apt", actualSalePrice: "525000000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", redevRightsValue: "219218500", redevSettlementDirection: "pay", redevSettlementAmount: "92781500", redevCompletionDate: "2022-09-01", redevPreApprovalExpenses: "0", redevOriginalAssetType: "housing", redevActualAcquisitionPrice: "100000000", bgActualAcquisitionTotal: "250000000", useEstimatedAcquisition: false },
};
const BLANK = { bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "" };
const a = (kind: string, id: string, ...over: Record<string, unknown>[]) => Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: id, ...COMMON, ...KIND[kind] }), ...over) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) => Object.assign(createDefaultTransferFormData(), FORM, { transferDate: "2026-02-16", assets, contractTotalPrice: "" }, over) as TransferFormData;
const SH = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000" };
const pct = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" });
const AB = { assetSplitMode: "fractional", contractTotalPrice: "400000000" };
const BD = { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "800000000" };
const MORT = { bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" };
const LAND_ONLY = { bgActualAcquisitionBuilding: "" };
const BLD_ONLY = { bgActualAcquisitionLand: "" };

const issues = (f: TransferFormData) => { const o: { field?: string; message: string }[] = []; for (let i = 0; i <= 5; i++) for (const m of collectStepIssues(i, f)) o.push({ field: m.field, message: m.message }); return o; };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const gain = (r: Awaited<ReturnType<typeof post>>) => (r.j.data?.aggregated?.totalTransferGain ?? r.j.data?.result?.transferGain) as number | undefined;
const blocked = async (f: TransferFormData, field: string) => {
  expect(issues(f).map((i) => i.field)).toContain(field);
  const r = await post(f);
  expect(r.status, JSON.stringify(r.j)).toBe(400);
  expect(JSON.stringify(r.j.error?.fieldErrors ?? {})).toContain("필요합니다");
};
const open = async (f: TransferFormData, oracle: number) => {
  expect(issues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, JSON.stringify(r.j)).toBe(200);
  expect(gain(r)).toBe(oracle);
};

describe("PZ-1 일반건물 K-4 — 토지·건물 두 칸", () => {
  it.each([
    ["단건", () => form([a("general_building", "a")]), 300_000_000],
    ["축 A 50%", () => form([a("general_building", "a", SH)]), 150_000_000],
    ["축 B 60/40", () => form([a("general_building", "p", pct("60")), a("general_building", "s", pct("40"))], AB), 300_000_000],
    ["묶음 둘째", () => form([a("housing", "h"), a("general_building", "b")], BD), 600_000_000],
  ] as const)("두 칸 입력 · %s", async (_n, mk, oracle) => { await open(mk(), oracle); });

  it.each([
    ["단건 · 토지만", () => form([a("general_building", "a", LAND_ONLY)]), "bgActualAcquisitionBuilding"],
    ["단건 · 건물만", () => form([a("general_building", "a", BLD_ONLY)]), "bgActualAcquisitionLand"],
    ["축 A · 토지만", () => form([a("general_building", "a", SH, LAND_ONLY)]), "bgActualAcquisitionBuilding"],
    ["축 B 첫 카드 · 토지만", () => form([a("general_building", "p", pct("60"), LAND_ONLY), a("general_building", "s", pct("40"))], AB), "bgActualAcquisitionBuilding"],
    ["묶음 둘째 · 토지만", () => form([a("housing", "h"), a("general_building", "b", LAND_ONLY)], BD), "bgActualAcquisitionBuilding"],
    ["묶음 첫째 · 건물만", () => form([a("general_building", "b", BLD_ONLY), a("housing", "h")], BD), "bgActualAcquisitionLand"],
  ] as const)("한쪽 입력 · %s: ⑧ ∧ ⑫ 400", async (_n, mk, field) => { await blocked(mk(), field); });
});

/** 양도가액 5억 · 채무비율 0.5 · 이월과세 시료(`transfer.route.gb-bg-carryover-presumed-scenario-b` 와 같은 값). */
const gb5 = (over: Record<string, unknown>, co: Record<string, unknown> = {}) => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "a", addressJibun: "제주특별자치도 강남구 테스트동 1-1", assetKind: "general_building", acquisitionCause: "carryover_gift", acquisitionDate: "2024-05-01", gbBuildingAcquisitionCause: "purchase",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
  carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2024-05-01", donorAcquisitionDate: "2015-01-01", donorAcquisitionPrice: "100,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no", ...co },
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" },
  ...over,
})) as AssetForm;
const PUR = { acquisitionCause: "purchase", acquisitionDate: "2015-01-01", landAcquisitionDate: "2015-01-01" };
const K7 = { ...PUR, bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "100,000,000", bgPresumedAcquisitionBuilding: "200,000,000" };
const CO7 = { bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100,000,000", bgCoDonorPresumedAcquisitionBuilding: "200,000,000", bgActualAcquisitionLand: "300,000,000", bgActualAcquisitionBuilding: "300,000,000" };
const acqs = (r: Awaited<ReturnType<typeof post>>) => ((r.j.data.aggregated.properties ?? []) as { acquisitionPrice: number }[]).map((p) => p.acquisitionPrice);

describe("PZ-2 일반건물 K-6·K-7 — 토지·건물 두 칸", () => {
  it("두 칸 입력: 취득가액 토지 5천만 · 건물 1억", async () => {
    const f = form([gb5(K7)], { transferDate: "2026-03-01" });
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(acqs(r)).toEqual([50_000_000, 100_000_000]);
  });
  it.each([
    ["감정가액 · 토지만", { ...K7, bgPresumedAcquisitionBuilding: "" }, "bgPresumedAcquisitionBuilding"],
    ["감정가액 · 건물만", { ...K7, bgPresumedAcquisitionLand: "" }, "bgPresumedAcquisitionLand"],
    ["매매사례가액 · 토지만", { ...K7, bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionBuilding: "" }, "bgPresumedAcquisitionBuilding"],
  ] as const)("%s: ⑧ ∧ ⑫ 400", async (_n, over, field) => { await blocked(form([gb5(over)], { transferDate: "2026-03-01" }), field); });
});

describe("PZ-3 이월과세 K-7 — 시나리오 A(당초 증여자)·B(양도인 평가액) 두 칸", () => {
  it("두 칸 입력: 결정세액은 시나리오 A 82,627,700 (시나리오 B 79,000,000)", async () => {
    const f = form([gb5(CO7)], { transferDate: "2026-03-01" });
    expect(issues(f)).toEqual([]);
    const r = await post(f);
    expect(r.status).toBe(200);
    expect(r.j.data.aggregated.determinedTax).toBe(82_627_700);
  });
  it.each([
    ["시나리오 B · 토지만 (종전: 채택 시나리오가 B로 바뀌어 139,000,000)", { ...CO7, bgActualAcquisitionBuilding: "" }, "bgActualAcquisitionBuilding"],
    ["시나리오 B · 건물만", { ...CO7, bgActualAcquisitionLand: "" }, "bgActualAcquisitionLand"],
    ["시나리오 A · 토지만 (종전: 113,226,000)", { ...CO7, bgCoDonorPresumedAcquisitionBuilding: "" }, "bgCoDonorPresumedAcquisitionBuilding"],
    ["시나리오 A · 건물만 (종전: 97,626,000)", { ...CO7, bgCoDonorPresumedAcquisitionLand: "" }, "bgCoDonorPresumedAcquisitionLand"],
  ] as const)("%s: ⑧ ∧ ⑫ 400", async (_n, over, field) => { await blocked(form([gb5(over)], { transferDate: "2026-03-01" }), field); });
});

describe("PZ-4 함께 양도 둘째 이후 K-4 비움 — ⑧ ∧ ⑫ 400 (종전 ⑫ 200 · 취득가액 0)", () => {
  it.each(["housing", "land", "building", "commercial_building", "general_building", "redevelopment_apt"])("둘째 %s", async (k) => {
    const f = form([a("housing", "h"), a(k, "b", BLANK)], BD);
    expect(issues(f).length).toBeGreaterThan(0);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j)).toBe(400);
    expect(r.j.error.fieldErrors["companionAssets.0.burdenedGiftInfo.actualAcquisitionTotal"]).toBeDefined();
  });
  it("0을 입력해도 같다 · 3건 묶음의 셋째도 같다", async () => {
    expect((await post(form([a("housing", "h"), a("housing", "b", { bgActualAcquisitionTotal: "0" })], BD))).status).toBe(400);
    const r = await post(form([a("housing", "h"), a("housing", "b"), a("housing", "c", BLANK)], { ...BD, contractTotalPrice: "1200000000" }));
    expect(r.j.error.fieldErrors["companionAssets.1.burdenedGiftInfo.actualAcquisitionTotal"]).toBeDefined();
  });
  it("입력하면 그대로 계산된다", async () => { await open(form([a("housing", "h"), a("housing", "b")], BD), 600_000_000); });
});

describe("PZ-5 쓰이지 않으면 요구하지 않는다 — 담보 승(취득시 기준시가 강제)", () => {
  it("주택 묶음 둘째 비움: 통과 ∧ 1,576,000,000", async () => {
    await open(form([a("housing", "h", MORT), a("housing", "b", BLANK, MORT)], BD), 1_576_000_000);
  });
  it("일반건물 단건 두 칸 비움 · 담보 승: ⑫ 200", async () => {
    const r = await post(form([a("general_building", "a", BLANK, MORT, { bgCoDonorLandStdPriceAtAcq: "", bgActualAcquisitionTotal: "" })]));
    expect(r.status, JSON.stringify(r.j)).toBe(200);
  });
});

describe("PZ-6 주택·건물 토지·건물 분리 — 한쪽 입력 ⑧ ∧ ⑫ 400", () => {
  const SPLIT = { bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000", bgMarketValueLand: "600,000,000", bgMarketValueBuilding: "400,000,000" };
  const own = (over: Record<string, unknown>) => bgAsset("converted", { donorBuilt: false }, {
    acquisitionCause: "purchase", acquisitionDate: "2022-01-10", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2000-06-01", ...SPLIT,
    bgAcquisitionMethod: "appraisal", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "", bgPresumedAcquisitionLand: "100,000,000", bgPresumedAcquisitionBuilding: "150,000,000", ...over,
  } as Partial<AssetForm>);
  const carry = (over: Record<string, unknown>) => bgAsset("converted", { donorBuilt: false }, {
    carryoverDonorSplit: true, ...SPLIT, bgAcquisitionMethod: "appraisal", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "600,000,000", bgActualAcquisitionBuilding: "400,000,000",
    bgCoDonorActualAcquisitionTotal: "", bgCoDonorPresumedAcquisitionLand: "50,000,000", bgCoDonorPresumedAcquisitionBuilding: "100,000,000", bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
    buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2015-01-01" }, ...over,
  } as Partial<AssetForm>);

  it("두 칸 입력은 그대로 계산된다 — K-7 295,200,000 · 건물 자산 같은 값 · K-4 300,000,000", async () => {
    expect(gain(await post(bgForm(own({}))))).toBe(295_200_000);
    expect(gain(await post(bgForm(own({ assetKind: "building" }))))).toBe(295_200_000);
    expect(gain(await post(bgForm(own({ bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "150,000,000" }))))).toBe(300_000_000);
    expect((await post(bgForm(carry({})))).status).toBe(200);
  });
  it.each([
    ["K-7 토지만 (종전 355,200,000)", () => own({ bgPresumedAcquisitionBuilding: "" }), "burdenedGiftInfo.presumedBuildingAcquisitionPrice"],
    ["K-7 건물만 (종전 335,200,000)", () => own({ bgPresumedAcquisitionLand: "" }), "burdenedGiftInfo.presumedLandAcquisitionPrice"],
    ["K-6 토지만", () => own({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionBuilding: "" }), "burdenedGiftInfo.presumedBuildingAcquisitionPrice"],
    ["건물 자산 K-7 토지만", () => own({ assetKind: "building", bgPresumedAcquisitionBuilding: "" }), "burdenedGiftInfo.presumedBuildingAcquisitionPrice"],
    ["K-4 토지만", () => own({ bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "100,000,000" }), "burdenedGiftInfo.actualBuildingAcquisitionPrice"],
    ["이월과세 K-7 시나리오 A 토지만 (종전 결정세액 84,520,480)", () => carry({ bgCoDonorPresumedAcquisitionBuilding: "" }), "burdenedGiftInfo.carryoverDonorBasis.presumedBuildingAcquisitionPrice"],
    ["이월과세 K-7 시나리오 A 건물만", () => carry({ bgCoDonorPresumedAcquisitionLand: "" }), "burdenedGiftInfo.carryoverDonorBasis.presumedLandAcquisitionPrice"],
    ["이월과세 K-7 시나리오 B 토지만", () => carry({ bgActualAcquisitionBuilding: "" }), "burdenedGiftInfo.actualBuildingAcquisitionPrice"],
    ["이월과세 K-4 시나리오 B 토지만", () => carry({ bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionLand: "50,000,000", bgCoDonorActualAcquisitionBuilding: "100,000,000", bgActualAcquisitionBuilding: "" }), "burdenedGiftInfo.actualBuildingAcquisitionPrice"],
  ] as const)("%s", async (_n, mk, path) => {
    const f = bgForm(mk());
    expect(issues(f).length).toBeGreaterThan(0);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j)).toBe(400);
    expect(r.j.error.fieldErrors[path]).toBeDefined();
  });
  it("묶음 둘째 자산 · K-7 토지만: ⑧ ∧ ⑫ 400", async () => {
    const f = form([a("housing", "h"), Object.assign(own({ bgPresumedAcquisitionBuilding: "" }), { assetId: "b" })], BD);
    expect(issues(f).length).toBeGreaterThan(0);
    const r = await post(f);
    expect(r.status, JSON.stringify(r.j)).toBe(400);
    expect(r.j.error.fieldErrors["companionAssets.0.burdenedGiftInfo.presumedBuildingAcquisitionPrice"]).toBeDefined();
  });
  it("담보 승은 금액을 읽지 않아 한쪽만 있어도 막지 않는다", async () => {
    expect((await post(bgForm(own({ bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000", bgPresumedAcquisitionBuilding: "" })))).status).toBe(200);
  });
  it("주택 파트 평가액을 나눠 보낸 본문에는 분리 규칙이 걸리고, 그 자산에 없는 파트(기준시가·평가액 없음)는 요구하지 않는다 — `burdened-gift-appraisal-sales-case` §114조의2 시료", async () => {
    const f = bgForm(own({ bgPresumedAcquisitionLand: "" }));
    expect((await post(f)).status).toBe(400);
  });
  it("주택 총액 입력(분리 아님)은 한쪽 규칙이 걸리지 않는다", async () => { await open(form([a("housing", "a")]), 300_000_000); });
});
