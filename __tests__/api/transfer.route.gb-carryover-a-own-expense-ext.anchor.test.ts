/**
 * anchor — 일반건물 **증축(3-way)** × 토지 이월과세(§97의2) × 양도자 본인 자본적지출·양도비 (계획서 V-1 · 결정 Q-6 probe 결과)
 *
 * `gb-carryover-a-own-expense` anchor 의 환산·실가·지분 경로와 같은 메커니즘(`swap.ownDirect` → `buildProperties`)이 증축 조합에서도
 * 그대로 서는지 고정한다. 증축 자산은 `resolveExtensionBuildingPart`의 증축 전/후 배분과 얽혀 있어 **차단(⑧) 대신 포함**할 수 있는지 먼저 실측했다 —
 * 같은 입력에서 이월과세 아닌 카드(OFF)가 받는 토지 몫과 이월과세 A·B 토지 카드가 쓰는 본인 몫이 **원 단위로 같다**(규칙 복제 없음).
 *
 * 폼 → ⑧ → ④ → ⑫ → ⑭ 전 구간 · mock 세율. 원건물 두 파트 환산(`PARTS_EST`) / 실가(`PARTS_ACT`) × 증축분 환산 / 실가.
 * 증여 2016-03-01 · 양도 2019-02-16 · 증여자 취득 2005-06-15 · 증여자 취득가액 380,000,000 · 증여 당시 평가액 400,000,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1", gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000",
  gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: String(T),
  gbHasExtension: true, gbExtensionDate: "2018-05-01", gbExtensionArea: "50",
};
const EXT_ACTUAL = {
  gbExtensionAcquisitionMode: "actual", gbExtensionAcquisitionCause: "purchase", gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const EXT_ESTIMATED = {
  gbExtensionAcquisitionMode: "estimated", gbExtensionAcquisitionCause: "newConstruction",
  gbTransferExtensionBuildingStdPrice: "40000000", gbAcquisitionExtensionBuildingStdPrice: "30000000",
} as Partial<AssetForm>;
const PARTS_EST = { landAcqMode: "estimated", buildingAcqMode: "estimated", useEstimatedAcquisition: true } as Partial<AssetForm>;
const PARTS_ACT = { landAcqMode: "actual", buildingAcqMode: "actual", useEstimatedAcquisition: false } as Partial<AssetForm>;
const CARRYOVER = {
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2016-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "380,000,000",
  giftTaxAmount: "", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", giftDateValuation: "400,000,000", donorRelation: "lineal",
};
const ON = { acquisitionCause: "carryover_gift", acquisitionDate: "2016-03-01", landAcquisitionDate: "2016-03-01", gbBuildingAcquisitionCause: "purchase", fixedAcquisitionPrice: "250000000", carryover: CARRYOVER } as unknown as Partial<AssetForm>;
const OFF = { acquisitionCause: "purchase", acquisitionDate: "2016-03-01", landAcquisitionDate: "2016-03-01", gbBuildingAcquisitionCause: "purchase", fixedAcquisitionPrice: "250000000", landAcquisitionPrice: "150000000", buildingAcquisitionPrice: "100000000" } as unknown as Partial<AssetForm>;
// 그중 증축 전 지출액 0 = 전부 증축 후(`gb-extension-capex-timing.plan.md` — ⑧ 필수).
const NONE = {} as Partial<AssetForm>;
const CAP = { capitalExpenditure: "20000000", gbCapexBeforeExtension: "0" } as Partial<AssetForm>;
const CAP_TX = { ...CAP, transferExpense: "10000000" } as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, BASE, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = newForm();
  f.transferDate = "2019-02-16";
  f.filingDate = "2019-05-31";
  f.contractTotalPrice = String(T);
  f.assets = [a];
  return f;
}

interface Card { id: string; ne: number; aGain?: number; bGain?: number }
async function run(a: AssetForm): Promise<Card[]> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(form(a))),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data.aggregated.properties.map((p: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    id: p.propertyId, ne: p.necessaryExpense,
    aGain: p.carryoverTaxationDetail?.scenarioA?.transferGain, bGain: p.carryoverTaxationDetail?.scenarioB?.transferGain,
  }));
}
const land = (cards: Card[]) => cards.find((c) => c.id === "land")!;
const A_NONE = 873_243_006; // 양도가액 1,265,243,006(토지 몫) − 증여자 380,000,000 − 증여세 상당액 12,000,000
const B_NONE = 865_243_006; // 1,265,243,006 − 증여 당시 평가액 400,000,000 (개산공제 없음 — B-2)

describe.each([
  ["증축분 환산", EXT_ESTIMATED],
  ["증축분 실가", EXT_ACTUAL],
])("증축 × 이월과세 × 본인 지출 — %s", (_n, ext) => {
  it("원건물 두 파트 환산 · 본인 지출 0 → A 873,243,006 · B 865,243,006", async () => {
    const on = await run(asset(PARTS_EST, ext, ON, NONE));
    expect(land(on).aGain).toBe(A_NONE);
    expect(land(on).bGain).toBe(B_NONE);
  });

  it("원건물 두 파트 실가 · 본인 지출 0 → 같다", async () => {
    const on = await run(asset(PARTS_ACT, ext, ON, NONE));
    expect(land(on).aGain).toBe(A_NONE);
    expect(land(on).bGain).toBe(B_NONE);
  });

  describe("원건물 두 파트 실가 — 자본적지출은 취득시 기준시가(토지 : 원건물), 양도비는 양도가액 비례 (§97②1호 가산)", () => {
    it.each([
      // 20,000,000 × 205,000,000 / 355,000,000 = 11,549,295
      ["자본적지출 20,000,000", CAP, 11_549_295],
      // + 양도비 10,000,000 × 1,265,243,006 / 1,600,000,000 = 7,907,768 → 19,457,063
      ["자본적지출 20,000,000 + 양도비 10,000,000", CAP_TX, 19_457_063],
    ])("%s → 토지 몫 %i 가 A·B 모두에 들어간다 (OFF 카드와 같다)", async (_label, x, share) => {
      const on = await run(asset(PARTS_ACT, ext, ON, x));
      const off = await run(asset(PARTS_ACT, ext, OFF, x));
      expect(land(off).ne).toBe(share);
      expect(land(on).aGain).toBe(A_NONE - share);
      expect(land(on).bGain).toBe(B_NONE - share);
    });
  });
});

describe("증축 × 이월과세 — 원건물 두 파트 환산: 자산총액 판정(단서 불발) 배분 규칙을 그대로 쓴다", () => {
  /**
   * 증축분 환산이면 환산 카드 3장(토지·원건물·증축분)에 (환산취득가 + 개산공제) 비례:
   *   토지 235,610,102 : 원건물 172,397,635 : 증축분 34,479,528 (합 442,487,265)
   *   자본적지출 20,000,000 → 토지 20,000,000 × 235,610,102 / 442,487,265 = 10,649,350
   *   + 양도비 10,000,000(합 30,000,000) → 15,974,025
   * OFF 카드는 단서 불발이라 본문(개산공제 6,150,000)이지만 A·B 는 제97조제2항제1호 몫을 쓴다.
   */
  it.each([
    ["자본적지출 20,000,000", CAP, 10_649_350],
    ["자본적지출 20,000,000 + 양도비 10,000,000", CAP_TX, 15_974_025],
  ])("%s → 토지 몫 %i", async (_label, x, share) => {
    const on = await run(asset(PARTS_EST, EXT_ESTIMATED, ON, x));
    const off = await run(asset(PARTS_EST, EXT_ESTIMATED, OFF, x));
    expect(land(off).ne).toBe(6_150_000);
    expect(land(on).aGain).toBe(A_NONE - share);
    expect(land(on).bGain).toBe(B_NONE - share);
    expect(land(on).ne).toBe(share);
  });
});
