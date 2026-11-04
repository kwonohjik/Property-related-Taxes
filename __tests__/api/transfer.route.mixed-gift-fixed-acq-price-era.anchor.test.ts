/**
 * anchor — 증여 겸용 「증여 신고가액」 · 「소득세법 시행령」 §163⑨ 단서 구간(1985 전 · 개별주택가격 공시 전 PHD)의 둘째 자산·지분 배치.
 * 계획서 `docs/00-pm/mixed-gift-fixed-acq-price.plan.md` Q-2 a · 리뷰 게이트 W-2. ① 후보도 주택분·상가분 칸에서 오므로 신고가액 칸은 세액에 닿지 않고,
 * 비워도 ⑫가 막지 않는다(종전 둘째 자산 빈칸 = 400).
 *
 * 시료: `transfer.route.mixed-use-sec163-9-compare.routes.anchor.test.ts`와 같은 겸용(강남 · 2024-08-20 양도 30억 · mock 세율) + 함께 양도 토지(매매).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const T = 3_000_000_000;
const MIX = {
  assetKind: "housing",
  isMixedUseHouse: true,
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-03-01",
  inheritanceStartDate: "1980-03-01",
  decedentAcquisitionDate: "1970-01-01",
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  buildingFootprintArea: "100",
  mixedUseTotalLandArea: "200",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferHousingBuildingStdPrice: "800000000",
  mixedTransferLandPricePerSqm: "12000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "400000000",
  mixedAcqHousingBuildingStdPrice: "380000000",
  mixedAcqCommercialBuildingPrice: "80000000",
  mixedAcqLandPricePerSqm: "1200000",
  actualSalePrice: String(T),
} as Partial<AssetForm>;
const PHD = {
  usePreHousingDisclosure: true,
  useEstimatedAcquisition: true,
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "600000000",
  phdLandPricePerSqmAtAcq: "1200000",
  phdBuildingStdPriceAtAcq: "300000000",
  phdLandPricePerSqmAtFirst: "4000000",
  phdBuildingStdPriceAtFirst: "350000000",
  phdLandPricePerSqmAtTransfer: "12000000",
  phdBuildingStdPriceAtTransfer: "800000000",
  phdTransferHousingPrice: "1600000000",
  mixedAcqHousingPrice: "",
  mixedAcqHousingBuildingStdPrice: "",
} as Partial<AssetForm>;
const Y1990 = { acquisitionDate: "1990-03-01", inheritanceStartDate: "1990-03-01" } as Partial<AssetForm>;
const GIFT = {
  acquisitionCause: "gift", inheritanceStartDate: "", decedentAcquisitionDate: "", donorAcquisitionDate: "1970-01-01",
  giftDonorRelation: "lineal", giftSameHousehold: "no", standardPriceAtTransfer: "2500000000", standardPriceAtAcq: "500000000",
} as Partial<AssetForm>;
const g = (h: string, c: string) => ({ mixedHousingGiftValueOverride: h, mixedCommercialGiftValueOverride: c }) as Partial<AssetForm>;
const LAND = {
  ...makeDefaultAsset(1), assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-03-01", useEstimatedAcquisition: false,
  addressJibun: "서울 강남구 역삼동 2", fixedAcquisitionPrice: "100000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000",
  standardPriceAtAcq: "100000000", landArea: "300", landNature: "standalone",
} as unknown as AssetForm;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, MIX, ...over) as AssetForm;
function form(a: AssetForm, arr: "companion" | "fractional"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2024-08-20", filingDate: "2024-10-31", householdHousingCount: "2", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  });
  const second = { ...a, assetId: makeDefaultAsset(2).assetId } as AssetForm;
  if (arr === "companion") {
    f.assets = [LAND, second];
    f.contractTotalPrice = String(T + 200_000_000);
  } else {
    f.assets = [{ ...a, ownershipNumerator: "60", ownershipDenominator: "100" } as AssetForm, { ...second, ownershipNumerator: "40", ownershipDenominator: "100" } as AssetForm];
    Object.assign(f, { assetSplitMode: "fractional", bundledSaleMode: "apportioned", contractTotalPrice: String(T) });
  }
  return f;
}
async function run(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  const issues = [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message);
  return { status: res.status, totalTax: json?.data?.aggregated?.totalTax as number | undefined, issues };
}


describe("§163⑨ 단서 구간 증여 겸용 — 신고가액 빈칸 = 6억 = 9억 · 200", () => {
  it.each([
    ["1980 증여 · ① 9억+3억 · 둘째 자산", [GIFT, g("900000000", "300000000")], "companion", 585_600_362],
    ["1980 증여 · ① 9억+3억 · 지분 60/40", [GIFT, g("900000000", "300000000")], "fractional", 544_213_810],
    ["1990 증여 PHD · ① 9억+1억 · 둘째 자산", [GIFT, Y1990, PHD, g("900000000", "100000000")], "companion", 662_018_500],
    ["1990 증여 PHD · ① 9억+1억 · 지분 60/40", [GIFT, Y1990, PHD, g("900000000", "100000000")], "fractional", 619_228_501],
  ] as const)("%s", async (_n, over, arr, tax) => {
    for (const v of ["", "600000000", "900000000"]) {
      const r = await run(form(asset(...over, { fixedAcquisitionPrice: v } as Partial<AssetForm>), arr));
      expect(r.issues, v).toEqual([]);
      expect(r.status, v).toBe(200);
      expect(r.totalTax, v).toBe(tax);
    }
  });
});
