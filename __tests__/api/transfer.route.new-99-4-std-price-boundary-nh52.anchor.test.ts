/**
 * 리뷰 NH-52 — §99의4 가액 합계 3억 경계가 세액을 가른다 (계산은 바뀌지 않았다 — 안내 PR의 «계산 불변» 고정).
 *
 * 입력한 `ruralHouseStdPrice`를 그대로 한도와 비교한다(경계 포함 — 「초과하지 아니할 것」). 증축·부수토지 추가 취득분을 더해
 * 3억을 넘는지가 세액을 가르므로 폼이 포함 입력을 안내한다(조특령 §99의4⑪, 계획서 docs/00-pm/new-994-expansion-notice-nh52.plan.md §3.2).
 * 시료는 `transfer.route.mixed-use-99-4-d5-merge-order.anchor.test.ts`의 일반 경로(양도 2024-03-01 · 혼인합가 3주택 세대).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine()));

const RURAL = {
  type: "new_99_4_rural",
  houseId: "rural",
  ruralHouseAcquisitionDate: "2012-05-01",
  ruralHouseStdPrice: 100_000_000,
  isRegisteredHanok: false,
  adjacentArea994: "no" as const,
  meetsLocationRequirement: true,
};
const H = (id: string, acquisitionDate: string, over: object = {}) => ({
  id,
  region: "capital",
  acquisitionDate,
  officialPrice: 300_000_000,
  isInherited: false,
  isLongTermRental: false,
  isApartment: false,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...over,
});
const COMMON = {
  propertyType: "housing",
  transferPrice: 1_000_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2015-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 3,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 60,
  marriageMerge: { marriageDate: "2020-06-15" },
  isFirstTransferredInMerge: true,
  sellingHouseId: "selling",
  houses: [
    H("selling", "2015-03-01", { mergeOrigin: "seller_side" }),
    H("gen", "2010-01-01", { mergeOrigin: "counterpart_side" }),
    H("rural", "2012-05-01", { region: "non_capital", mergeOrigin: "counterpart_side" }),
  ],
};

async function withPrice(ruralHouseStdPrice: number) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...COMMON, reductions: [{ ...RURAL, ruralHouseStdPrice }] }),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}

describe("NH-52 — §99의4 가액 합계 3억 경계 (계산 불변)", () => {
  it.each([
    [290_000_000, true, 0],
    [300_000_000, true, 0], // 경계 포함 — 「초과하지 아니할 것」
    [300_000_001, false, 204_090_000],
    [330_000_000, false, 204_090_000],
  ])("가액 합계 %i → 적용 %s · 세액 %i", async (price, eligible, tax) => {
    const r = await withPrice(price);
    expect(r.new994Detail.isEligible).toBe(eligible);
    expect(r.determinedTax ?? r.totalTax ?? r.calculatedTax).toBe(tax);
  });
});
