/**
 * F-13 — 일괄양도에서 따로 입력한 **주택부수토지(배율 이내)**의 1세대1주택 비과세·12억 합산 판정 anchor.
 * 계획서: docs/00-pm/transfer-companion-appurtenant-land-exemption.plan.md.
 *
 * 「소득세법」 §89①3호: 비과세 대상 = 「각 목의 주택」 + 「주택부수토지(배율 이내)」 · 12억 판정 = 「주택 및 이에 딸린
 * 토지의 양도 당시 실지거래가액의 합계액」. 결정(2026-09-19): Q-1 (가) 단위로 묶어 합계액 판정 · Q-2 배율 초과분은 비과세
 * 제외 + 비사업용 토지 · Q-3 부수토지로서의 보유기간은 주택·토지 중 늦은 날부터(단일 입력 G-3과 같은 함수) · Q-4 부수토지도
 * 주택의 이월과세 ②2호 배제를 따른다.
 *
 * 기대값: 같은 거래를 **단일 주택(토지 포함 가액)**으로 입력한 결과와 같다(C1·C2). 세율은 프로덕션 fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const TD = "2026-02-16";
const rates = loadFallbackTransferRates(new Date(TD));

/** 1세대1주택 · 2014 취득 · 거주 5년 · 수도권 주거지역(배율 3배) · 정착면적 100㎡ → 한도 300㎡ */
const primary = (house: number, land: number, over: object = {}) => ({
  propertyType: "housing",
  transferPrice: house,
  transferDate: TD,
  acquisitionPrice: house / 2,
  acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  buildingFootprintArea: 100,
  isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential",
  totalSalePrice: house + land,
  standardPriceAtTransferForApportion: house / 1000,
  ...over,
});
const land = (price: number, over: object = {}) => ({
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: price / 2,
  standardPriceAtTransfer: price / 1000,
  directExpenses: 0,
  isOneHousehold: true,
  areaM2: 200,
  reductions: [],
  ...over,
});

type Prop = {
  propertyId: string;
  isExempt?: boolean;
  rateGroup: string;
  carryoverTaxationDetail?: { adoptedScenario: string; exclusionReason?: string };
};
type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };

async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}
const byId = (a: Agg, id: string) => a.properties.find((p) => p.propertyId === id)!;

/** 같은 거래를 단일 주택(토지 포함 가액)으로 — 법령상 기대값의 기준 */
const single = (price: number) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: price,
      acquisitionPrice: price / 2,
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date(TD),
      householdHousingCount: 1,
      isOneHousehold: true,
      residencePeriodMonths: 60,
    } as Partial<TransferTaxInput>),
    rates,
  ).totalTax;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

describe("F-13 주택 + 배율 이내 부수토지 = 1세대1주택 단위", () => {
  it("F13-1 합계 11억(≤12억) → 주택·부수토지 모두 비과세 0 = 단일 주택 입력 (종전 8,844,000)", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000)] });
    expect(byId(a, "c1").isExempt).toBe(true);
    expect(a.totalTax).toBe(0);
    expect(a.totalTax).toBe(single(1_100_000_000));
  });

  it("F13-2 합계 14억 → 합계액으로 12억 안분 4,801,500 = 단일 주택 입력 (종전 14,124,000)", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000)] });
    expect(a.totalTax).toBe(4_801_500);
    expect(a.totalTax).toBe(single(1_400_000_000));
  });

  it("F13-3 Q-2 배율 초과 분리 — 한도 내 카드만 단위(합 12.4억) · 초과 카드는 비사업용 토지", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000, { areaM2: 500 })] });
    expect(byId(a, "c1__excess").rateGroup).toBe("non_business_land");
    expect(byId(a, "c1__appurtenant").rateGroup).not.toBe("non_business_land");
    expect(a.totalTax).toBe(7_254_500);
  });

  it("F13-4 Q-3 부수토지를 주택보다 늦게 취득해 부수토지로서 2년 미만 → 그 토지는 비과세 아님", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000, { acquisitionDate: "2025-01-01" })] });
    expect(byId(a, "primary").isExempt).toBe(true);
    expect(byId(a, "c1").isExempt).toBe(false);
  });

  it("F13-5 배율 판정 불가(면적 없음) → 단위에 넣지 않고 안내 · 토지는 일반 과세", async () => {
    const a = await post({ ...primary(800_000_000, 300_000_000), companionAssets: [land(300_000_000, { areaM2: undefined })] });
    expect(byId(a, "c1").isExempt).toBe(false);
    expect((a.warnings ?? []).some((w) => w.includes("배율 이내인지 판정하지 못했습니다"))).toBe(true);
  });

  it("F13-6 대조군: 1세대1주택이 아니면 단위와 무관하게 종전과 같다 154,286,000", async () => {
    const a = await post({
      ...primary(800_000_000, 300_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
      companionAssets: [land(300_000_000)],
    });
    expect(a.totalTax).toBe(154_286_000);

    // 면적이 없어도 1세대1주택이 아니면 비과세 판정 자체가 없으므로 「판정하지 못했다」 안내를 내지 않는다.
    const noArea = await post({
      ...primary(800_000_000, 300_000_000, { isOneHousehold: false, householdHousingCount: 2 }),
      companionAssets: [land(300_000_000, { areaM2: undefined })],
    });
    expect(noArea.warnings ?? []).not.toContainEqual(expect.stringContaining("배율 이내인지"));
  });

  it("F13-7 Q-4 주택이 이월과세 ②2호로 배제되면 부수토지 카드도 배제(B)", async () => {
    const CO = (v: number) => ({
      giftRegistryDate: "2025-06-01",
      donorAcquisitionDate: "2000-06-01",
      donorAcquisitionPrice: 10_000_000,
      useEstimatedAcquisition: false,
      giftTaxAmount: 0,
      giftDateValuation: v,
      donorRelation: "spouse",
      exclusionDeclared: {},
    });
    const a = await post({
      ...primary(1_000_000_000, 400_000_000, {
        acquisitionCause: "carryover_gift",
        acquisitionDate: "2025-06-01",
        acquisitionPrice: 0,
        residencePeriodMonths: 0,
        carryoverTaxation: CO(1_000_000_000),
      }),
      companionAssets: [
        land(400_000_000, {
          acquisitionCause: "carryover_gift",
          acquisitionDate: "2025-06-01",
          fixedAcquisitionPrice: undefined,
          carryoverTaxation: CO(400_000_000),
        }),
      ],
    });
    expect(byId(a, "primary").carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
    const l = byId(a, "c1").carryoverTaxationDetail!;
    expect(l.exclusionReason).toBe("one_house_exemption");
    expect(l.adoptedScenario).toBe("B");
  });
});
