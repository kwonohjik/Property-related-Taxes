/**
 * anchor — **겸용주택 §167의10①4호(§155⑧ 수도권 밖 부득이 주택) 중과 배제** 비대칭 (2026-09-04).
 *
 * ## 🔴 가드가 찾은 결함
 *
 * `unavoidableOutsideCapitalHouse`(중과 입력의 boolean)는 **엔진이 파생**한다 —
 * `transfer-tax-judgment-steps.ts:55`가 `qualifiesUnavoidableOutsideCapital(input)`으로 세운다.
 * 그런데 **그 파생은 단건 경로에만** 있다. 겸용 엔진은 `...asset.multiHouse`를 넘기면서
 * `sellingHouseMeetsOneHouseRequirements`·`deemedOneHouseBy155` **둘만** 「단건과 같은 정본
 * 함수」로 파생한다(`transfer-tax-mixed-use.ts:209·212`) — **셋째만 빠졌다.**
 *
 * ⇒ 겸용 + 부득이한 사유 수도권 밖 주택이면 §167의10①4호 배제가 **발동하지 않는다**
 *   (`multi-house-surcharge-exclusion.ts:393`이 그 boolean을 읽는다). 납세자에게 **불리**하다.
 *
 * 발견 경위: ⑭ 겸용 조립 **키 커버리지 가드**(PR #1464)가 짚었다. 그 전에는 tsc도 테스트도
 * 이 비대칭을 보지 못했다.
 *
 * ## 법령
 *
 * 「소득세법 시행령」 §167의10①4호 — 「제155조제8항에 따른 수도권 밖에 소재하는 주택」.
 * §155⑧ 요건(2주택 · 해소일부터 3년) 판정은 **비과세와 같은 정본**
 * (`qualifiesUnavoidableOutsideCapital`)을 쓴다 — 기한 규칙 재구현 금지(계획서 F-2).
 *
 * ## ⚠️ 같은 이름의 두 축을 혼동하지 말 것
 *
 * | | 타입 | 의미 |
 * |---|---|---|
 * | `TransferTaxInput.unavoidableOutsideCapitalHouse` | **`{reason, resolvedDate}` 객체** | 사용자 입력(사유·해소일) |
 * | `MultiHouseSurchargeInput.unavoidableOutsideCapitalHouse` | **`boolean`** | 요건 판정 **결과** |
 *
 * 객체를 boolean 슬롯에 그대로 이어 붙이면 안 된다 — 정본 함수를 태워야 한다.
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

const house = (id: string, acq: string) => ({
  id,
  region: "capital" as const,
  acquisitionDate: acq,
  officialPrice: 800_000_000,
  isInherited: false,
  isLongTermRental: false,
});

/** 조정대상지역 · 세대 **2주택** · 겸용주택 양도. */
const MIXED = {
  transferPrice: 3_000_000_000,
  acquisitionPrice: 700_000_000,
  acquisitionDate: "2014-03-15",
  transferDate: "2026-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  // 중과 엔진 진입 — `multiHouse`는 `houses`가 있어야 조립된다.
  houses: [house("selling", "2014-03-15"), house("h2", "2015-03-01")],
  sellingHouseId: "selling",
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: "2014-03-15",
    buildingAcquisitionDate: "2014-03-15",
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 2_500_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

interface MixedResult {
  total: { determinedTax: number };
  housingPart: { longTermDeductionAmount: number };
  multiHouseSurcharge?: {
    surchargeApplicable?: boolean;
    surchargeType?: string;
    exclusionReasons?: { type: string; detail: string }[];
  };
}

async function call(over: Record<string, unknown> = {}): Promise<MixedResult> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...MIXED, ...over }),
    }),
  );
  const json = (await res.json()) as { data: { mode: string; result: MixedResult } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  expect(json.data.mode).toBe("mixed-use");
  return json.data.result;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

describe("겸용주택 × §167의10①4호 부득이 수도권 밖 주택", () => {
  it("UOC-1 부득이 사유(해소 전) → 중과 배제가 발동한다", async () => {
    const r = await call({ unavoidableOutsideCapitalHouse: { reason: "work" } });
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(
      reasons.some((x) => x.type === "unavoidable_outside_capital"),
      `배제 사유 부재 — ${JSON.stringify(r.multiHouseSurcharge)?.slice(0, 300)}`,
    ).toBe(true);
    // 배제가 서면 중과 자체가 꺼진다 — `isExcluded`가 아니라 이 두 필드가 결과 축이다.
    expect(r.multiHouseSurcharge?.surchargeApplicable).toBe(false);
    expect(r.multiHouseSurcharge?.surchargeType).toBe("none");
  });

  it("UOC-2 대조군 — 사유 미입력이면 배제되지 않는다 (판별력)", async () => {
    const r = await call();
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(reasons.some((x) => x.type === "unavoidable_outside_capital")).toBe(false);
  });

  it("UOC-3 배제가 세액을 실제로 바꾼다 (구별력 0 방지)", async () => {
    const withReason = await call({ unavoidableOutsideCapitalHouse: { reason: "work" } });
    const without = await call();
    expect(
      withReason.total.determinedTax,
      "세액이 같다 — 배제가 발동해도 결과가 안 바뀌면 이 anchor는 무의미하다",
    ).not.toBe(without.total.determinedTax);
    expect(withReason.total.determinedTax).toBeLessThan(without.total.determinedTax);
    // 실측 고정 — 배제 적용 409,284,688 vs 미적용 484,365,648 (차이 **75,080,960**).
    expect(without.total.determinedTax - withReason.total.determinedTax).toBe(75_080_960);
  });

  it("UOC-4 해소일부터 3년 초과면 배제되지 않는다 (기한 규칙이 정본과 같은가)", async () => {
    const r = await call({
      unavoidableOutsideCapitalHouse: { reason: "work", resolvedDate: "2020-01-01" },
    });
    const reasons = r.multiHouseSurcharge?.exclusionReasons ?? [];
    expect(reasons.some((x) => x.type === "unavoidable_outside_capital")).toBe(false);
  });
});
