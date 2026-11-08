/**
 * anchor — 수용 감면 「조세특례제한법」 §77⑨(상속 = 피상속인 취득일)이 일반건물·D2에서도 화면 입력 → ④ → ⑫ → 엔진으로 닿는다(Q-2),
 * 그리고 일반건물 · 분리 ON · 토지 상속에서 피상속인 취득일 순서를 **토지 상속개시일**과 비교한다(Q-3 · D-1).
 * 계획서 `docs/02-design/features/expropriation-77-9-gb-d2.plan.md`. 세율 mock — 정본 세액 아님.
 *
 * 공통: 수용 · 사업인정고시일 2025-06-01(소급 2년 = 2023-06-01) · 양도 2026-06-30 · 양도가액 12억 · 전액 현금.
 */
import { describe, expect, it, vi } from "vitest";

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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOTAL = "1200000000";
const EXPR = {
  transferCause: "public_expropriation", expropriationNoticeDate: "2025-06-01",
  reductions: [{ type: "public_expropriation", expropriationCash: TOTAL, expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2025-06-01" }],
};
const form = (a: Loose): TransferFormData =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-06-30", filingDate: "2026-08-31", contractTotalPrice: TOTAL, totalTransferExpense: "0", householdHousingCount: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", actualSalePrice: TOTAL, ...EXPR, ...a }] as AssetForm[],
  }))) as TransferFormData;

const GB: Loose = {
  assetKind: "general_building", gbLandArea: "200", gbBuildingArea: "300", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "150000000",
  fixedAcquisitionPrice: "",
};
const INH = "2024-01-10";
/** G1 일반건물 토지·건물 상속(분리 OFF) */
const G1 = (d: string) => ({ ...GB, acquisitionCause: "inheritance", gbBuildingAcquisitionCause: "inheritance", acquisitionDate: INH, landAcquisitionDate: INH,
  inheritanceStartDate: INH, decedentAcquisitionDate: d, publishedValueAtInheritance: "500000000", gbBuildingInheritedValue: "200000000" });
/** G2 일반건물 분리 ON · 토지 매매 2008 · 건물 상속 */
const G2 = (d: string) => ({ ...GB, hasSeperateLandAcquisitionDate: true, acquisitionCause: "purchase", gbBuildingAcquisitionCause: "inheritance",
  landAcquisitionDate: "2008-01-01", acquisitionDate: INH, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000",
  gbBuildingInheritedValue: "200000000", gbBuildingDecedentAcquisitionDate: d });
/** G3 일반건물 분리 ON · 토지 상속(landInh) · 건물 매매(bld) */
const G3 = (d: string, landInh = INH, bld = "2008-01-01") => ({ ...GB, hasSeperateLandAcquisitionDate: true, acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: landInh, acquisitionDate: bld, inheritanceStartDate: landInh, decedentAcquisitionDate: d,
  publishedValueAtInheritance: "500000000", landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionPrice: "150000000" });
/** D2 주택 · 건물 상속 · 토지 매매 2010 */
const D2 = (d: string) => ({ assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: INH, inheritanceStartDate: INH, inheritanceDate: INH,
  decedentAcquisitionDate: d, publishedValueAtInheritance: "400000000", inheritanceValuationMethod: "appraisal",
  landAcquisitionCause: "purchase", landCauseHost: "inheritance", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01",
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000", saleSplitMode: "actual",
  landTransferPrice: "700000000", buildingTransferPrice: "500000000", landStandardPriceAtTransfer: "700000000", buildingStandardPriceAtTransfer: "500000000",
  standardPriceAtTransfer: TOTAL });

async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  const data = (r.json?.data ?? {}) as Loose;
  const res = (r.result ?? {}) as Loose;
  const agg = data.aggregated as Loose | undefined;
  return {
    issues: allIssues(f).map((i) => [i.field ?? null, i.message]),
    status: r.status,
    fieldErrors: Object.keys(r.json?.error?.fieldErrors ?? {}),
    reduction: (agg ? agg.reductionAmount : res.reductionAmount) as number | undefined,
    tax: (agg ? agg.determinedTax : res.determinedTax) as number | undefined,
  };
}
const ORDER_MSG = "자산: 피상속인 취득일은 상속개시일보다 이전이어야 합니다.";

describe("Q-2 §77⑨ — 일반건물·D2도 피상속인 취득일로 「2년 이전 취득」을 판정한다", () => {
  it.each([
    ["G1 일반건물 토지·건물 상속 · 2000", G1("2000-01-01"), 25_958_999, 147_101_001],
    ["G1 · 2023-12-01(소급 2년 안) → 감면 0", G1("2023-12-01"), 0, 173_060_000],
    ["G2 일반건물 건물만 상속 · 2000", G2("2000-01-01"), 26_775_345, 151_726_963],
    ["G2 · 2023-12-01 → 건물분 빠짐", G2("2023-12-01"), 22_872_499, 155_629_809],
    ["D2 주택 건물만 상속 · 2000", D2("2000-01-01"), 18_759_000, 106_301_000],
    ["D2 · 2023-12-01 → 건물분 빠짐", D2("2023-12-01"), 13_913_960, 111_146_040],
  ])("%s", async (_n, a, reduction, tax) => {
    const r = await run(a);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.reduction).toBe(reduction);
    expect(r.tax).toBe(tax);
  });
});

describe("Q-3 D-1 — 일반건물 · 분리 ON · 토지 상속: 피상속인 취득일은 토지 상속개시일과 비교한다", () => {
  it("대조 — 건물 취득일(2008)보다 앞선 2000은 종전대로 통과", async () => {
    const r = await run(G3("2000-01-01"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.reduction).toBe(26_702_653);
  });
  it.each([
    // 토지 피상속인 2010 · 건물 매수 2008 — 둘 다 고시일 소급 2년 전 → 양쪽 성립(2000과 같은 값)
    ["2010-01-01", 26_702_653, 151_315_039],
    // 토지 피상속인 2023-12-01(소급 2년 안) → 토지분 불성립 · 건물분(2008 매수)만 성립
    ["2023-12-01", 4_657_087, 173_360_605],
  ])("건물 취득일(2008) ≤ %s < 토지 상속개시일(2024-01-10) — 막지 않는다(종전 ⑧·⑫ 400)", async (d, reduction, tax) => {
    const r = await run(G3(d));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.reduction).toBe(reduction);
    expect(r.tax).toBe(tax);
  });
  it("토지 상속개시일 이후 피상속인 취득일 → ⑧·⑫ 같은 칸에서 막는다", async () => {
    const r = await run(G3("2024-06-01"));
    expect(r.issues).toEqual([["decedentAcquisitionDate", ORDER_MSG]]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["decedentAcquisitionDate"]);
  });
  it("반대쪽 — 토지 상속 2010 · 건물 매수 2015 · 피상속인 2012(상속 뒤) → 막는다(종전 통과)", async () => {
    const r = await run(G3("2012-01-01", "2010-01-01", "2015-01-01"));
    expect(r.issues).toEqual([["decedentAcquisitionDate", ORDER_MSG]]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors).toEqual(["decedentAcquisitionDate"]);
  });
  it("대조 — 분리 OFF 일반건물·D2는 종전 기준(acquisitionDate) 그대로", async () => {
    for (const a of [G1(INH), D2(INH)]) {
      const r = await run(a);
      expect(r.issues).toEqual([["decedentAcquisitionDate", ORDER_MSG]]);
      expect(r.status).toBe(400);
    }
  });
});
