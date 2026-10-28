/**
 * anchor — 이월과세(§97의2) 시나리오 A 일반건물 카드: **증축(3-way)·파트 축(감정·매매사례)** 에서 신고서·명세서 「취득가액」 칸으로 옮기는 몫은 자본적지출 몫뿐이다.
 *
 * 계획서 `docs/00-pm/carryover-a-gb-card-filing-acq-cell-label.plan.md` §10-5 (V-4) — `transfer.route.gb-carryover-a-card-capex-split.anchor.test.ts` 가 환산·실가·지분·조각을,
 * 이 파일이 증축과 파트 축을 폼 → ⑧ → ④ → ⑫ → ⑭ 전 구간(mock 세율)으로 고정한다. 모양별 몫 분해는 단위 anchor `general-building-swap-own-capex.anchor.test.ts` 가 고정한다.
 *
 * 증축 픽스처는 `gb-carryover-a-own-expense-ext` 와 같지만 **증여자 취득가액을 30,000,000 으로** 낮췄다 — 그 파일(380,000,000)은 비교과세에서 B 가 채택된다. 비교과세는 양도차익이 아니라
 * **세액**으로 가른다(`exclusionReason: tax_comparison`): A 는 증여자 취득일부터 센 장기보유특별공제(2005 → 2019)가 커서 증여자 취득가액 380,000,000 이면 A 세액 232,414,405 < B 323,151,358 이고,
 * 100,000,000 이어도 A 319,438,405 < B 라 B 가 채택된다(실측). 이월과세가 세액을 더 키울 만큼 차익이 커야(= 증여자 취득가액이 낮아야) A 가 채택된다.
 * B 가 채택되면 이월과세 표시(취득가액 칸 이동)가 일어나지 않아 이동분이 0 이다.
 *
 * ## 손계산 (증축 — 짝 anchor 와 같은 몫)
 *  · 원건물 두 파트 실가: 자본적지출 20,000,000 × 205,000,000 / 355,000,000 = 11,549,295 · 양도비 10,000,000 × 1,265,243,006 / 1,600,000,000 = 7,907,768 (합 19,457,063)
 *  · 원건물 환산 + 증축분 환산: 환산 카드 3장 토지 235,610,102 : 원건물 172,397,635 : 증축분 34,479,528 → 자본적지출 10,649,350 · 양도비 5,324,675 (합 15,974,025)
 * ## 손계산 (파트 축 — 양도 1,000,000,000 · 토지 : 건물 양도시 기준시가 1 : 1)
 *  · 파트 직접귀속 자본적지출 토지 3,000,000 · 건물 700,000 · 양도비 1,000,000 → 토지 몫 500,000(양도가액 비례) · 증여세 상당액 30,000,000
 *    → 토지 필요경비 33,500,000 = 30,000,000 + 3,000,000 + 500,000 · 이동분 3,000,000 · 필요경비 칸 30,500,000
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
import { capExInAcquisitionColumnOfProperty } from "@/components/calc/results/transfer/exempt-gross-gain";
import { buildGbAcquisitionFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
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
  ...CARRYOVER_DEFAULTS, giftRegistryDate: "2016-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "30,000,000",
  giftTaxAmount: "", giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", giftDateValuation: "400,000,000", donorRelation: "lineal",
};
const ON = { acquisitionCause: "carryover_gift", acquisitionDate: "2016-03-01", landAcquisitionDate: "2016-03-01", gbBuildingAcquisitionCause: "purchase", fixedAcquisitionPrice: "250000000", carryover: CARRYOVER } as unknown as Partial<AssetForm>;
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


async function landCard(a: AssetForm) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(form(a))),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = json.data.aggregated.properties.find((x: any) => x.propertyId === "land");
  const shift = capExInAcquisitionColumnOfProperty(p);
  return { p, shift, adopted: p.carryoverTaxationDetail?.adoptedScenario as string | undefined, cellExp: p.necessaryExpense - shift };
}
const GIFT = 12_000_000; // 증여세 상당액: 산출세액 30,000,000 × 증여 당시 평가액 400,000,000 / 과세가액 1,000,000,000

describe.each([
  ["증축분 환산", EXT_ESTIMATED],
  ["증축분 실가", EXT_ACTUAL],
])("EXT 원건물 두 파트 실가 × %s — 취득시 기준시가(토지 : 원건물) 자본적지출 몫만 이동", (_n, ext) => {
  it("자본적지출 20,000,000 → 이동분 11,549,295 · 필요경비 칸 = 증여세 12,000,000", async () => {
    const r = await landCard(asset(PARTS_ACT, ext, ON, CAP));
    expect(r.adopted).toBe("A");
    expect(r.p.necessaryExpense).toBe(GIFT + 11_549_295);
    expect(r.shift).toBe(11_549_295);
    expect(r.cellExp).toBe(GIFT);
  });

  it("+ 양도비 10,000,000 → 이동분은 그대로 11,549,295 · 양도비 몫 7,907,768 은 필요경비 칸", async () => {
    const r = await landCard(asset(PARTS_ACT, ext, ON, CAP_TX));
    expect(r.p.necessaryExpense).toBe(GIFT + 19_457_063);
    expect(r.shift).toBe(11_549_295);
    expect(r.cellExp).toBe(GIFT + 7_907_768);
    // 칸 합 = 양도가액 − 양도차익 (신고서 항등식)
    expect(r.p.transferPrice - (r.p.acquisitionPrice + r.shift) - r.cellExp).toBe(r.p.transferGain);
  });

  it("양도비만 10,000,000 → 이동분 0 (자본적지출 몫이 없다) · 양도비 몫 7,907,768 전액 필요경비 칸", async () => {
    const r = await landCard(asset(PARTS_ACT, ext, ON, { transferExpense: "10000000" } as Partial<AssetForm>));
    expect(r.shift).toBe(0);
    expect(r.p.necessaryExpense).toBe(GIFT + 7_907_768);
  });
});

describe("EXT 원건물 두 파트 환산 × 증축분 환산 — 환산 카드 3장 (환산취득가 + 개산공제) 비례", () => {
  it("자본적지출 20,000,000 + 양도비 10,000,000 → 이동분 10,649,350 · 필요경비 칸 = 증여세 + 양도비 몫 5,324,675 · 명세서 산식에 「+ 자본적지출」", async () => {
    const r = await landCard(asset(PARTS_EST, EXT_ESTIMATED, ON, CAP_TX));
    expect(r.adopted).toBe("A");
    expect(r.p.necessaryExpense).toBe(GIFT + 15_974_025);
    expect(r.shift).toBe(10_649_350);
    expect(r.cellExp).toBe(GIFT + 5_324_675);
    expect(buildGbAcquisitionFormula(r.p, undefined, undefined, undefined)).toContain(`+ 자본적지출 ${(10_649_350).toLocaleString()}`);
  });

  it("양도비만 → 이동분 0 · 산식에 자본적지출 항 없음", async () => {
    const r = await landCard(asset(PARTS_EST, EXT_ESTIMATED, ON, { transferExpense: "10000000" } as Partial<AssetForm>));
    expect(r.shift).toBe(0);
    expect(buildGbAcquisitionFormula(r.p, undefined, undefined, undefined)).not.toContain("자본적지출");
  });
});

describe("PART 파트 축 — 토지 이월과세 × 건물 환산·감정가액·매매사례가액 (파트 직접귀속 + 양도비 가액 비례)", () => {
  const carryBody = (extra: Record<string, unknown>) => ({
    propertyType: "general_building", transferDate: "2024-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2021-03-01", acquisitionPrice: 0, expenses: 0,
    useEstimatedAcquisition: true, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
    generalBuildingValuation: {
      landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
      zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
      buildingAcquisitionCause: "purchase", landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: { giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: 150_000_000, useEstimatedAcquisition: false, giftTaxAmount: 30_000_000, giftDateValuation: 400_000_000 },
      landDirectExpenses: 3_000_000, buildingDirectExpenses: 700_000, transferExpense: 1_000_000,
      ...extra,
    },
  });
  async function partLand(extra: Record<string, unknown>) {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(carryBody(extra)),
    }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json.error)).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = json.data.aggregated.properties.find((x: any) => x.propertyId === "land");
    const shift = capExInAcquisitionColumnOfProperty(p);
    return { p, shift, cellExp: p.necessaryExpense - shift };
  }
  const SHAPES: Array<[string, Record<string, unknown>]> = [
    ["두 파트 환산", { landAcqMode: "estimated", buildingAcqMode: "estimated" }],
    ["건물 감정가액", { landAcqMode: "estimated", buildingAcqMode: "appraisal", buildingAcquisitionPrice: 400_000_000 }],
    ["건물 매매사례가액", { landAcqMode: "estimated", buildingAcqMode: "salesCase", buildingSalesCaseValue: 380_000_000 }],
  ];

  it.each(SHAPES)("%s — 토지 카드: 이동분 3,000,000(파트 직접귀속 자본적지출) · 필요경비 칸 30,500,000(증여세 + 양도비 몫 500,000)", async (_n, extra) => {
    const r = await partLand(extra);
    expect(r.p.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(r.p.necessaryExpense).toBe(30_000_000 + 3_000_000 + 500_000);
    expect(r.shift).toBe(3_000_000);
    expect(r.cellExp).toBe(30_500_000);
    expect(r.p.transferPrice - (r.p.acquisitionPrice + r.shift) - r.cellExp).toBe(r.p.transferGain);
    expect(buildGbAcquisitionFormula(r.p, undefined, undefined, undefined)).toContain(`+ 자본적지출 ${(3_000_000).toLocaleString()}`);
  });

  it("파트 직접귀속 없이 양도비만 → 이동분 0", async () => {
    const r = await partLand({ landAcqMode: "estimated", buildingAcqMode: "estimated", landDirectExpenses: undefined, buildingDirectExpenses: undefined });
    expect(r.shift).toBe(0);
    expect(r.p.necessaryExpense).toBe(30_000_000 + 500_000);
  });
});
