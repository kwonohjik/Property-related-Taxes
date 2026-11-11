/**
 * anchor — ⑥ 사이드바 계산 전 취득가액: 겸용 × 상속·증여(§163⑨)는 「계산 후 표시」(2026-11-11).
 *
 * 취득가액은 겸용 엔진이 주택·상가 기준시가 섹션의 평가액으로 정한다(mock 엔진 537,500,000). 종전 계산 전 사이드바는
 * 화면에 없는 칸 값을 보였다 — 증여 단건·묶음 600,000,000(`fixedAcquisitionPrice`) · 지분 60/40 360,000,000·240,000,000,
 * 상속 단건 600,000,000(`publishedValueAtInheritance`) · 상속 묶음·지분 0(pending 아님).
 * 출처: `docs/00-pm/mixed-gift-fixed-acq-price.plan.md` §7 V-1. 세액 무관(표시 전용). 시료는
 * `transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts`와 같다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData) {
  let captured: Record<string, unknown> = {};
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }),
  );
  return { body: captured, status: res.status, json: (await res.json()) as { data?: { aggregated?: Agg; result?: { total?: { totalPayable: number } } } } };
}
type Agg = { totalTax: number; properties: { propertyId: string; transferGain: number }[] };

const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, regionCode: "4682025021", addressJibun: "경남 테스트군 1-1",
  residentialFloorArea: "100", nonResidentialFloorArea: "60", buildingFootprintArea: "100", mixedUseTotalLandArea: "200",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: false,
  residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [],
  actualSalePrice: "1000000000", standardPriceAtTransfer: "800000000", standardPriceAtAcq: "500000000",
};
const INHERIT = (pub: string) => ({
  acquisitionCause: "inheritance", acquisitionDate: "2022-10-01", inheritanceStartDate: "2022-10-01", inheritanceAssetKind: "house_individual",
  decedentAcquisitionDate: "2015-01-01", publishedValueAtInheritance: pub,
});
const GIFT = (reported: string) => ({
  acquisitionCause: "gift", acquisitionDate: "2022-10-01", donorAcquisitionDate: "2015-01-01", giftDonorRelation: "lineal", giftSameHousehold: "no",
  fixedAcquisitionPrice: reported,
});
const PURCHASE = { acquisitionCause: "purchase", acquisitionDate: "2015-01-01", fixedAcquisitionPrice: "600000000" };
const LAND = {
  assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false, addressJibun: "경남 테스트군 2-1", regionCode: "4682025021",
  fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
};
type Arrangement = "primary" | "companion" | "single";
const form = (cause: Record<string, unknown>, arr: Arrangement): TransferFormData => {
  const m = { ...makeDefaultAsset(arr === "companion" ? 2 : 1), ...MIXED, ...cause };
  const l = { ...makeDefaultAsset(arr === "companion" ? 1 : 2), ...LAND };
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: arr === "single" ? [m] : arr === "primary" ? [m, l] : [l, m],
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: arr === "single" ? "1000000000" : "1200000000",
    householdHousingCount: "1", isOneHousehold: false, residencePeriodMonths: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};


const fractional = (cause: Record<string, unknown>) => {
  const share = (i: number, num: string) => ({ ...makeDefaultAsset(i), ...MIXED, ...cause, ownershipNumerator: num, ownershipDenominator: "100" });
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(), assets: [share(1, "60"), share(2, "40")], assetSplitMode: "fractional", bundledSaleMode: "apportioned",
    transferDate: "2023-09-18", filingDate: "2023-12-31", contractTotalPrice: "1000000000", householdHousingCount: "1", isOneHousehold: false,
    residencePeriodMonths: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData);
};
type Row = [number, boolean];
const rowsOf = (f: TransferFormData, res: unknown): Row[] =>
  computeTransferPerAssetSummary(f, res as never).rows.map((r) => [r.acqPrice, r.acqPending]);
const formOf = (cause: Record<string, unknown>, arr: "single" | "primary" | "companion" | "fractional") =>
  arr === "fractional" ? fractional(cause) : form(cause, arr);
const P: Row = [0, true];
const LAND_ROW: Row = [100_000_000, false];

describe("⑥ 사이드바 — 겸용 × 상속·증여 계산 전 취득가액", () => {
  it.each([
    ["증여", GIFT("600000000")],
    ["상속", INHERIT("600000000")],
  ] as const)("%s — 계산 전 「계산 후 표시」 · 계산 후 엔진 값", async (_n, cause) => {
    const expected = {
      single: { before: [P], after: [[537_500_000, false]] },
      primary: { before: [P, LAND_ROW], after: [[537_500_000, false], LAND_ROW] },
      companion: { before: [LAND_ROW, P], after: [LAND_ROW, [537_500_000, false]] },
      fractional: { before: [P, P], after: [[322_500_000, false], [215_000_000, false]] },
    } as const;
    for (const arr of ["single", "primary", "companion", "fractional"] as const) {
      const f = formOf(cause, arr);
      const r = await pipeline(f);
      expect(r.status).toBe(200);
      expect({ arr, before: rowsOf(f, null), after: rowsOf(f, r.json.data ?? null) }).toEqual({ arr, ...expected[arr] });
    }
  });

  it("🔴 짝: 매매 겸용은 계산 전 입력 취득가액 그대로(계산 후와 같다)", async () => {
    for (const [arr, rows] of [
      ["single", [[600_000_000, false]]],
      ["primary", [[600_000_000, false], LAND_ROW]],
      ["fractional", [[360_000_000, false], [240_000_000, false]]],
    ] as const) {
      const f = formOf(PURCHASE, arr);
      const r = await pipeline(f);
      expect(rowsOf(f, null)).toEqual(rows);
      expect(rowsOf(f, r.json.data ?? null)).toEqual(rows);
    }
  });
});
