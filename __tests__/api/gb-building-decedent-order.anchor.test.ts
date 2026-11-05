/**
 * anchor — 일반건물 · 분리 ON · 건물 상속: 「건물 피상속인 취득일」은 건물 상속개시일보다 앞서야 한다(⑧·⑫).
 * 계획서 `docs/02-design/features/gb-building-decedent-order.plan.md`. 세율 mock — 정본 세액 아님.
 *
 * 종전: 상속개시일과 같거나 늦은 날짜(양도일 뒤 포함)도 ⑧·⑫를 통과해, 엔진이 그 날로 세율·수용 감면을 판정해 세액이 바뀌었다.
 * 픽스처는 #2915 anchor(`expropriation-77-9-gb-d2.anchor.test.ts`) G2 — 토지 매매 2008 · 건물 상속개시 2024-01-10 · 수용.
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOTAL = "1200000000";
const EXPR = {
  transferCause: "public_expropriation", expropriationNoticeDate: "2025-06-01",
  reductions: [{ type: "public_expropriation", expropriationCash: TOTAL, expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2025-06-01" }],
};
const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-06-30", filingDate: "2026-08-31", contractTotalPrice: TOTAL, totalTransferExpense: "0", householdHousingCount: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", actualSalePrice: TOTAL, ...EXPR, ...a }] as AssetForm[],
  }) as TransferFormData;

const GB: Loose = {
  assetKind: "general_building", gbLandArea: "200", gbBuildingArea: "300", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "150000000",
  fixedAcquisitionPrice: "",
};
const INH = "2024-01-10";
/** G2 일반건물 분리 ON · 토지 매매 2008 · 건물 상속 */
const G2 = (d: string) => ({ ...GB, hasSeperateLandAcquisitionDate: true, acquisitionCause: "purchase", gbBuildingAcquisitionCause: "inheritance",
  landAcquisitionDate: "2008-01-01", acquisitionDate: INH, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000",
  gbBuildingInheritedValue: "200000000", gbBuildingDecedentAcquisitionDate: d });
/** G3 일반건물 분리 ON · 토지 상속(landInh) · 건물 매매(bld) */
const G3 = (d: string, landInh = INH, bld = "2008-01-01") => ({ ...GB, hasSeperateLandAcquisitionDate: true, acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: landInh, acquisitionDate: bld, inheritanceStartDate: landInh, decedentAcquisitionDate: d,
  publishedValueAtInheritance: "500000000", landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionPrice: "150000000" });

async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  const agg = (r.json?.data?.aggregated ?? {}) as Loose;
  return {
    issues: allIssues(f).map((i) => [i.field ?? null, i.message]),
    status: r.status,
    fieldErrors: (r.json?.error?.fieldErrors ?? {}) as Record<string, string[]>,
    tax: agg.determinedTax as number | undefined,
  };
}
const MSG8 = "자산: 건물 피상속인 취득일은 건물 상속개시일보다 이전이어야 합니다.";
const MSG12 = "건물 피상속인 취득일은 건물 상속개시일보다 이전이어야 합니다";
const KEY12 = "generalBuildingValuation.buildingDecedentAcquisitionDate";

describe("Q-1 건물 피상속인 취득일 순서 — ⑧·⑫", () => {
  it.each([
    ["2000-01-01", 151_726_963],
    ["2023-12-01", 155_629_809],
  ])("정상 %s → 통과 · 세액 불변", async (d, tax) => {
    const r = await run(G2(d));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(tax);
  });
  it.each([["2024-01-10"], ["2025-01-01"], ["2027-01-01"]])("틀린 입력 %s(상속개시일 이후) → ⑧ 그 칸 · ⑫ 400", async (d) => {
    const r = await run(G2(d));
    expect(r.issues).toEqual([["gbBuildingDecedentAcquisitionDate", MSG8]]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors[KEY12]).toEqual([MSG12]);
  });
  it("대조 — 토지만 상속(G3 · 건물 매매)은 이 검사와 무관", async () => {
    const r = await run(G3("2000-01-01"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
  });
});

describe("Q-2 ⑫ D3 비움 문구 — §104②1호(§95④ 인용 삭제)", () => {
  it("건물 피상속인 취득일 비움 → ⑫ 문구", async () => {
    const body = (await captureBody(form(G2("")))) as Loose;
    const r = await postTransfer(body);
    expect(r.status).toBe(400);
    expect(r.json?.error?.fieldErrors?.[KEY12]).toEqual(["상속으로 취득한 건물은 피상속인 취득일이 필요합니다 (소득세법 §104②1호)"]);
  });
});
