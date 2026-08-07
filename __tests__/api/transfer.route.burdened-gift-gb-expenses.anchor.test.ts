/**
 * anchor: `route.ts` 배관 — 부담부증여 + 일반건물 K-4의 **필요경비 전달** (W-4, 2026-08-07)
 *
 * 🔑 **엔진 anchor로는 이 결함을 못 잡는다.** 엔진 anchor는 payload를 직접 만들어 넣으므로
 *    `route.ts`가 값을 떨궈도 통과한다 — P-3이 정확히 그 구간의 결함이었고(계획서 §11.4),
 *    W-4의 **라이브 결함도 여기**였다.
 *
 * 🔴 **고쳐진 결함**: `route.ts`가 K-4에서 `capitalExpenditure + transferExpense`만 보고
 *    legacy `expenses`(= `directExpenses`)를 아예 보지 않았다. 현행 UI는 legacy 칸을
 *    「신규 두 칸이 둘 다 0일 때만」 띄우므로(`AssetSectionExpense.tsx:109-111`),
 *    legacy 칸만 채운 입력·기존 이력에서 필요경비가 **0으로 소실**됐다.
 *    실측 결정세액 **846,575,027 → 852,624,790**(6,049,763원 과대).
 *
 * 법령: 「소득세법」 제97조 제2항 제1호 — 취득가액을 실지거래가액에 의하는 경우의 필요경비는
 *       「제1항제2호(자본적지출) 및 제3호(양도비)의 금액을 더한 금액」.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

const LAND_AREA = 1279;
const T_LAND = 6_215_000;
const A_LAND = 2_130_000;
const T_BLDG = 631_846_500;
const A_BLDG = 424_472_064;

const CAPEX = 30_000_000;
const TRANSFER_EXP = 10_000_000;
const LEGACY_TOTAL = 40_000_000;

/** 신규 두 칸 — 자본적지출은 취득시·양도비는 양도시 비율(W-5). */
const ANS_LAND_EXP = 16_910_262;
/** legacy 한 덩어리 — 취득시 비율(이 경로의 종전 동작 보존). */
const ANS_LEGACY_LAND_EXP = 16_616_550;
const ANS_TAX_WITH_EXPENSE = 846_575_027;
const ANS_TAX_NO_EXPENSE = 852_624_790;

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
    lendingDepositTotal: 1_000_000_000,
    mortgageDebtAmount: 3_120_000_000,
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

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

/**
 * 실제 API 변환은 자본적지출·양도비를 **두 곳에** 싣는다 —
 * 최상위(`transfer-tax-api.ts`)와 `generalBuildingValuation`(`transfer-tax-api-gb.ts:349-355`).
 * ⚠️ 최상위만 넣으면 엔진 payload에 도달하지 않아 **legacy 후퇴 경로로 빠진다**(실측).
 *    fixture가 실제와 어긋나면 계약이 조용히 다른 것을 재게 된다.
 */
async function post(over: Record<string, unknown>) {
  const gbExpenses: Record<string, unknown> = {};
  if (over.capitalExpenditure) gbExpenses.capitalExpenditure = over.capitalExpenditure;
  if (over.transferExpense) gbExpenses.transferExpense = over.transferExpense;
  const res = await POST(
    req({
      ...BASE,
      ...over,
      generalBuildingValuation: { ...BASE.generalBuildingValuation, ...gbExpenses },
    }),
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  const ap = body.data.apportionment.apportioned as { assetKind: string; allocatedExpenses: number }[];
  return {
    landExp: ap.find((a) => a.assetKind === "land")?.allocatedExpenses,
    tax: body.data.aggregated.determinedTax as number,
  };
}

describe("route.ts 배관 — 부담부증여 일반건물 K-4 필요경비", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("신규 두 칸(자본적지출·양도비)이 엔진에 도달한다", async () => {
    const r = await post({ capitalExpenditure: CAPEX, transferExpense: TRANSFER_EXP });
    expect(r.landExp).toBe(ANS_LAND_EXP);
    expect(r.tax).toBe(ANS_TAX_WITH_EXPENSE);
  });

  it("🔴 legacy `expenses`만 있어도 도달한다 — 종전에는 통째로 소실됐다", async () => {
    const r = await post({ expenses: LEGACY_TOTAL });
    expect(r.landExp).toBe(ANS_LEGACY_LAND_EXP);
    expect(r.tax).toBe(ANS_TAX_WITH_EXPENSE);
  });

  it("🔴 legacy + 신규가 같이 와도 택일 — 이중계상 금지", async () => {
    const r = await post({
      expenses: LEGACY_TOTAL,
      capitalExpenditure: CAPEX,
      transferExpense: TRANSFER_EXP,
    });
    expect(r.tax).toBe(ANS_TAX_WITH_EXPENSE);
  });

  it("비용이 없으면 필요경비 0 — 대조군", async () => {
    const r = await post({});
    expect(r.landExp).toBe(0);
    expect(r.tax).toBe(ANS_TAX_NO_EXPENSE);
  });
});
