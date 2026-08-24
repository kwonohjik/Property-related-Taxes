/**
 * characterization anchor — **부담부증여 × aggregate 표시 열 산술** N-3.
 *
 * 계획서: `docs/00-pm/transfer-f16-spinoff-items.plan.md` §N-3
 *
 * ## 🔵 원 주장은 재현되지 않았다 (2026-08-23)
 *
 * 원 기재: 「부담부증여 aggregate **양도가액 열 0** — 수정 전후 모두 열 산술이 깨져 있다
 * (§159 유상분은 `burdenedGiftInfo`에서 파생). ⑧이 마법사 경로를 막지만 **GB route는
 * aggregate를 거쳐 도달**」.
 *
 * 그 GB route를 두 취득방법(실가·환산)으로 실제 POST한 결과 **양도가액은 0이 아니고
 * 세 열이 자기일관**했다. `acquisitionMethod`는 `"actual" | "converted"` 둘뿐이라
 * (⑫ enum) 이 둘이 전수다.
 *
 * 다른 aggregate 진입점에는 애초에 도달하지 않는다 — `burdenedGiftInfo`가
 * `app/api/calc/transfer/multi/route.ts`·`lib/api/transfer-tax-schema-sub.ts`(컴패니언)에
 * **0건**이라 다자산·컴패니언 경로는 부담부증여를 받지 않는다.
 *
 * ⇒ **결함 아님으로 종결.** 다만 이 축의 안전망이 **0건**이었으므로(그래서 미검증 주장이
 *   문서에 남았다) 현행 동작을 이 anchor로 고정한다.
 *
 * ## 무엇을 고정하는가
 *
 * `transfer-tax-aggregate.ts`의 표시 열(`transferPrice`·`acquisitionPrice`·
 * `necessaryExpense`·`transferGain`)이 **자산별로 산술적으로 닫혀 있을 것**.
 * 「양도가액 = 채무액 안분」이라는 §159 구조도 함께 고정한다 — 입력 `transferPrice`가
 * 아니라 **채무액**이 분자라는 것이 이 축의 핵심이고, 그것을 모르면 「열이 이상하다」는
 * 오해가 다시 생긴다.
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

const LAND_AREA = 1_000;
const T_LAND = 3_000_000;
const T_BLDG = 1_500_000_000;
const A_LAND = 1_000_000;
const A_BLDG = 500_000_000;

/** 보증금 1,000,000,000 + 근저당 3,120,000,000 = **채무 4,120,000,000** (= 유상분 분자). */
const DEPOSIT = 1_000_000_000;
const MORTGAGE = 3_120_000_000;
const DEBT_TOTAL = DEPOSIT + MORTGAGE;

const BASE = {
  propertyType: "general_building" as const,
  transferType: "burdened_gift" as const,
  transferPrice: 2_500_000_000,
  transferDate: "2023-02-19",
  acquisitionPrice: 2_500_000_000,
  acquisitionDate: "1998-09-07",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  burdenedGiftInfo: {
    valuationMode: "sangjeungbeop_market" as const,
    acquisitionMethod: "actual" as const,
    marketValueAtTransfer: 8_580_831_500,
    actualLandAcquisitionPrice: 2_000_000_000,
    actualBuildingAcquisitionPrice: 500_000_000,
    lendingDepositTotal: DEPOSIT,
    mortgageDebtAmount: MORTGAGE,
    annualRentTotal: 130_000_000,
    landStdPriceAtTransfer: LAND_AREA * T_LAND,
    buildingStdPriceAtTransfer: T_BLDG,
    landStdPriceAtAcquisition: LAND_AREA * A_LAND,
    buildingStdPriceAtAcquisition: A_BLDG,
    donorRelation: "lineal_descendant" as const,
  },
  generalBuildingValuation: {
    transferLandPricePerSqm: T_LAND,
    transferBuildingStdPrice: T_BLDG,
    landArea: LAND_AREA,
    buildingFootprintArea: 388.27,
    zoneType: "general_residential" as const,
    actualPriceMode: true,
    buildingAcquisitionCause: "purchase" as const,
    acquisitionLandPricePerSqm: A_LAND,
    acquisitionBuildingStdPrice: A_BLDG,
  },
};

type Prop = {
  propertyId: string;
  transferPrice: number;
  acquisitionPrice: number;
  necessaryExpense: number;
  transferGain: number;
};

async function run(over: object = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    data?: { aggregated?: { determinedTax: number; properties: Prop[] } };
  };
  const agg = json.data?.aggregated;
  expect(agg).toBeDefined();
  return agg!;
}

/** ⑫ enum이 허용하는 취득방법 전수 (`"actual" | "converted"`). */
const MODES = {
  actual: {},
  converted: {
    useEstimatedAcquisition: true,
    generalBuildingValuation: { ...BASE.generalBuildingValuation, actualPriceMode: false },
    burdenedGiftInfo: { ...BASE.burdenedGiftInfo, acquisitionMethod: "converted" as const },
  },
};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("N3 — 부담부증여 aggregate 표시 열 (characterization)", () => {
  it.each(Object.entries(MODES))(
    "N3-01(%s): 자산별 「양도가액 − 취득가액 − 필요경비 = 양도차익」이 성립한다",
    async (_mode, over) => {
      const agg = await run(over);
      expect(agg.properties.length).toBeGreaterThan(0);
      for (const p of agg.properties) {
        expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
        // 🔴 원 주장의 핵심 — 양도가액 열이 0이 아니다.
        expect(p.transferPrice).toBeGreaterThan(0);
      }
    },
  );

  it("N3-02: 양도가액 합 = **채무액**이다 (입력 `transferPrice`가 아니라 §159 유상분)", async () => {
    const agg = await run();
    const sum = agg.properties.reduce((s, p) => s + p.transferPrice, 0);
    expect(sum).toBe(DEBT_TOTAL);
    // 입력 양도가액(2,500,000,000)과 다르다는 것이 이 축의 요지다.
    expect(sum).not.toBe(BASE.transferPrice);
  });

  it("N3-03: 실가 모드 자산별 스냅샷 (mock 세율표 기준 실측)", async () => {
    const agg = await run();
    const land = agg.properties.find((p) => p.propertyId === "land")!;
    const building = agg.properties.find((p) => p.propertyId === "building")!;
    expect(land.transferPrice).toBe(2_746_666_666);
    expect(land.acquisitionPrice).toBe(960_279_898);
    expect(land.transferGain).toBe(1_786_386_768);
    expect(building.transferPrice).toBe(1_373_333_334);
    expect(building.acquisitionPrice).toBe(240_069_974);
    expect(building.transferGain).toBe(1_133_263_360);
    expect(agg.determinedTax).toBe(852_624_790);
  });
});
