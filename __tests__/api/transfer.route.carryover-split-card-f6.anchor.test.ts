/**
 * F-6 — 부수토지 배율 초과 분리 카드 × 이월과세 §97의2②2호 — **현행 카드별 판정 고정**.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-6 · §17.
 *
 * ②2호: 「제1항을 적용할 경우 제89조제1항제3호 각 목의 주택[…고가주택(이에 딸린 토지를 포함한다)을 포함한다]의
 * 양도에 해당하게 되는 경우」. 배율 초과 토지는 §89①3호의 「주택」도 「주택부수토지」도 아닌 **별개 자산**이다
 * (§89①3호 본문 · 재산세과-1485 등 같은 괄호 문구의 §95③ 해석례 · 사전-2026-법규재산-0075). 이월과세 여부와
 * 무관하게 비과세가 될 수 없어 ②2호의 취지(이월과세로 비과세를 만들어내는 것 차단)도 작동하지 않는다.
 * ⇒ 주택 카드가 ②2호로 배제돼도 **초과분 카드는 이월과세(②3호 비교)에 남는다** — 현행이 조문과 정합한다.
 *    정면 해석례는 **미확보**(국세청·심판원·판례 검색 0건) — 해석이 나오면 이 anchor를 다시 본다.
 *
 * ⚠️ 배율 **이내** 카드(`c1__appurtenant`)는 여기서 단언하지 않는다 — 조문상 「주택부수토지」라 주택을 따라야
 *    하지만, 엔진이 그 카드를 1세대1주택 판정에 넣지 않는 더 큰 쟁점(F-13)에 딸려 있다. 이 축은 안전망이 없다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

/** OH-1형 — 증여 2025-06-01(B 보유 8개월 → B 불해당) · 증여자 2000 취득(A 해당) ⇒ 주택 카드는 ②2호 배제 */
const CO = (giftDateValuation: number) => ({
  giftRegistryDate: "2025-06-01",
  donorAcquisitionDate: "2000-06-01",
  donorAcquisitionPrice: 10_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
  giftDateValuation,
  donorRelation: "spouse",
  exclusionDeclared: {},
});
const primary = {
  propertyType: "housing",
  transferPrice: 1_000_000_000,
  transferDate: "2026-02-16",
  acquisitionPrice: 0,
  acquisitionDate: "2025-06-01",
  acquisitionCause: "carryover_gift",
  carryoverTaxation: CO(1_000_000_000),
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
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
  totalSalePrice: 1_400_000_000,
  standardPriceAtTransferForApportion: 900_000_000,
};
/** 500㎡ — 한도 300㎡(정착 100㎡ × 3배) 대비 200㎡ 초과 → 한도 내/초과 두 카드로 갈린다 */
const companion = {
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2025-06-01",
  carryoverTaxation: CO(400_000_000),
  standardPriceAtTransfer: 300_000_000,
  directExpenses: 0,
  isOneHousehold: true,
  areaM2: 500,
  reductions: [],
};

type Detail = { isEligible: boolean; exclusionReason?: string; oneHouseExclusionSource?: string; adoptedScenario: string };
type Prop = { propertyId: string; carryoverTaxationDetail?: Detail };

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F-6 분리 카드 × ②2호 — 카드별 판정(별개자산설)", () => {
  it("F6-1 주택 카드는 ②2호(자동) 배제 · 배율 초과 카드는 이월과세 비교에 남는다", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...primary, companionAssets: [companion] }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { aggregated: { properties: Prop[] } } };
    const byId = (id: string) => json.data.aggregated.properties.find((p) => p.propertyId === id)!;

    const house = byId("primary").carryoverTaxationDetail!;
    expect(house.exclusionReason).toBe("one_house_exemption");
    expect(house.oneHouseExclusionSource).toBe("auto");
    expect(house.adoptedScenario).toBe("B");

    const excess = byId("c1__excess").carryoverTaxationDetail!;
    expect(excess.isEligible).toBe(true);
    expect(excess.exclusionReason).toBeUndefined();
  });
});
