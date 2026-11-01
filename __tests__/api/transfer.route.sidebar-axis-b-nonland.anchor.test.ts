/**
 * 축 B 일반건물 지분 × 일반 양도 — 계산 후 사이드바가 엔진이 쓴 값을 읽는지(계획서 `axis-b-sidebar-nonland.plan.md` D-1).
 *
 * 엔진 행 id가 `land#0`·`building#0`이라 폼 id 매칭이 실패하고, 부담부증여 전용 분기도 타지 못해 floor 폴백(합 ≠ 총액)과 취득가액 0으로 떨어졌다.
 * 비교 기준: 양도가액 = `apportionment.apportioned`의 지분별 합, 취득가액·필요경비 = `aggregated.properties`의 지분별 합(엔진이 실제 차감한 값).
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
import { captureBody, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { GB_SAMPLES } from "../components/_helpers/gb-bundled-blocks-fixtures";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SAMPLES: Record<string, L> = {
  실가: Object.assign({}, ...GB_SAMPLES.INH[0]),
  환산: Object.assign({}, GB_SAMPLES["S100-est"][0][0]),
  SWAP: Object.assign({}, ...GB_SAMPLES.SWAP[0]),
};
const SHARES: [string, [string, string][], number][] = [
  ["1/3×3 · 10억", [["1", "3"], ["1", "3"], ["1", "3"]], 1_000_000_000],
  ["60/40 · 2,000,000,001", [["60", "100"], ["40", "100"]], 2_000_000_001],
  ["14.29×7 · 10억", Array(7).fill(["14.29", "100"]), 1_000_000_000],
];

function form(base: L, shares: [string, string][], total: number, perShare: L[] = []) {
  const f = createDefaultTransferFormData() as L;
  Object.assign(f, { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: String(total), bundledSaleMode: "actual", assetSplitMode: "fractional", householdHousingCount: "2" });
  f.assets = shares.map(([n, d], i) => ({ ...makeDefaultAsset(i + 1), ...base, ...(perShare[i] ?? {}), assetId: `A${i + 1}`, ownershipNumerator: n, ownershipDenominator: d, ownershipRemainderThirdParty: "" }));
  return f;
}

/** 지분 번호(`#i`)별 합 — id 접미사가 곧 폼 위치다. */
function byShare(rows: L[], id: string, pick: (r: L) => number, n: number) {
  const out = Array(n).fill(0);
  for (const r of rows) out[Number(String(r[id]).split("#").pop())] += pick(r);
  return out;
}

async function run(base: L, shares: [string, string][], total: number, perShare: L[] = []) {
  const f = form(base, shares, total, perShare);
  const body = (await captureBody(f as never)) as L;
  expect(body.generalBuildingShares?.length).toBe(shares.length);
  const r = await postTransfer(body);
  expect(r.status).toBe(200);
  const d = r.json?.data as L;
  const rows = computeTransferPerAssetSummary(f as never, d as never).rows;
  const n = shares.length;
  return {
    rows,
    sale: byShare(d.apportionment.apportioned, "assetId", (p) => p.allocatedSalePrice, n),
    acq: byShare(d.aggregated.properties, "propertyId", (p) => p.acquisitionPrice, n),
    exp: byShare(d.aggregated.properties, "propertyId", (p) => p.necessaryExpense, n),
  };
}

describe("축 B 일반건물 지분 × 일반 양도 — 계산 후 사이드바 = 엔진", () => {
  for (const [kind, base] of Object.entries(SAMPLES)) {
    for (const [name, shares, total] of SHARES) {
      it(`${kind} · ${name}`, async () => {
        const e = await run(base, shares, total);
        expect(e.rows.map((x) => x.salePending)).toEqual(shares.map(() => false));
        expect(e.rows.map((x) => x.acqPending)).toEqual(shares.map(() => false));
        expect(e.rows.map((x) => x.expensePending)).toEqual(shares.map(() => false));
        expect(e.rows.map((x) => x.salePrice)).toEqual(e.sale);
        expect(e.rows.map((x) => x.acqPrice)).toEqual(e.acq);
        expect(e.rows.map((x) => x.expense)).toEqual(e.exp);
        expect(e.rows.reduce((s, x) => s + x.salePrice, 0)).toBe(total);
        expect(e.rows.map((x) => x.saleIsApportioned)).toEqual(shares.map(() => false));
      }, 60_000);
    }
  }

  it("이월과세 지분 — 취득가액·필요경비는 안분 행(시나리오 A 미반영)이 아니라 엔진이 차감한 값", async () => {
    const GB = { assetKind: "general_building", addressJibun: "서울 A 1", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01", useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated", gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000" };
    const carryover = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "300,000,000", donorCapitalExpenditure: "40,000,000", giftTaxAmount: "30,000,000", giftDateValuation: "600,000,000" };
    const e = await run(GB, SHARES[1][1], 1_000_000_001, [{}, { acquisitionDate: "2021-03-01", acquisitionCause: "carryover_gift", carryover }]);
    expect(e.rows.map((x) => x.salePrice)).toEqual([600_000_000, 400_000_001]);
    expect(e.rows.map((x) => x.acqPrice)).toEqual([300_000_000, 220_000_000]);
    expect(e.rows.map((x) => x.expense)).toEqual([3_600_000, 47_200_000]);
  }, 60_000);

  it("감가상각비 — 엔진이 공제한 값을 또 빼지 않는다", async () => {
    const base = Object.assign({}, ...GB_SAMPLES["S100-act"][0]);
    const plain = await run(base, SHARES[1][1], SHARES[1][2]);
    const dep = await run({ ...base, depreciationAmount: "10000000" }, SHARES[1][1], SHARES[1][2]);
    expect(dep.rows.map((x) => x.acqPrice)).toEqual(dep.acq);
    expect(plain.acq[0] - dep.acq[0]).toBe(6_000_000);
    expect(plain.acq[1] - dep.acq[1]).toBe(4_000_000);
  }, 60_000);

  it("지분 번호 접미사는 `#` 포함 일치 — `#1`이 `#11`을 잡지 않는다(11지분, 응답은 손으로 구성)", () => {
    const f = form(SAMPLES["실가"], Array(11).fill(["1", "11"]), 1_100);
    const row = (i: number) => ({ assetId: `land#${i}`, allocatedSalePrice: 100 + i, allocatedAcquisitionPrice: 0, allocatedExpenses: 0, saleMode: "actual" });
    const prop = (i: number) => ({ propertyId: `land#${i}`, acquisitionPrice: 10 + i, necessaryExpense: 1 + i });
    const idx = Array.from({ length: 11 }, (_, i) => i);
    const rows = computeTransferPerAssetSummary(f as never, { mode: "bundled", apportionment: { apportioned: idx.map(row) }, aggregated: { properties: idx.map(prop) } } as never).rows;
    expect(rows.map((x) => x.salePrice)).toEqual(idx.map((i) => 100 + i));
    expect(rows.map((x) => x.acqPrice)).toEqual(idx.map((i) => 10 + i));
    expect(rows.map((x) => x.expense)).toEqual(idx.map((i) => 1 + i));
  });

  it("수치 고정 — 실가 1/3×3 · 10억: 흡수는 마지막 지분, 취득가액은 지분별 150,000,000", async () => {
    const e = await run(SAMPLES["실가"], SHARES[0][1], SHARES[0][2]);
    expect(e.rows.map((x) => x.salePrice)).toEqual([333_333_333, 333_333_333, 333_333_334]);
    expect(e.rows.map((x) => x.acqPrice)).toEqual([150_000_000, 150_000_000, 150_000_000]);
  }, 60_000);
});
