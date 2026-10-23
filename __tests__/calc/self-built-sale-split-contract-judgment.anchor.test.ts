/**
 * 공유지분 본인 신축·증여자 신축 §114조의2 가산세 base — §100③을 계약서(100%) 금액으로 판정 (2026-10-24)
 *
 * 계획서: `docs/00-pm/sale-split-100-3-share-scale-judgment.plan.md` PR-4 (Q-1 a · Q-2 a · Q-4 a).
 * 폼 → ④(`buildSaleSplitWire`) → route POST(⑫ 공용 `sale` 객체 · ⑭) → 엔진(`resolveTransferPriceSplit` 계약 판정 leaf).
 *
 * 시료(§1): 양도가 10억 · 양도 당시 토지 2.4억 / 건물 1.6억 → 100% 안분 건물 4억. 계약서 토지 4.8억 / 건물 5.2억 — 건물 **정확히 +30%**.
 * 100% 판정은 「불분명」(기준시가 안분)인데, 종전에는 지분 몫(1/3: 173,333,333 vs 안분 133,333,334)으로 판정해 「30% 미만」이 됐다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { bundledForm, bundledProps, calc, captureBody, sbForm } from "./_self-built-housing-fixture";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const DECLARED: Partial<AssetForm> = { saleSplitMode: "actual", landTransferPrice: "480000000", buildingTransferPrice: "520000000" };
const own = (n: string, d: string): Partial<AssetForm> => ({ ownershipNumerator: n, ownershipDenominator: d, ownershipRemainderThirdParty: "yes" });

type SaleWire = Record<string, unknown>;
/** ④ 본문을 고쳐 보낸다 — 종전 와이어(계약서 금액 없음) 재현용. */
async function postEdited(over: Partial<AssetForm>, edit: (sale: SaleWire) => void) {
  const body = await captureBody(sbForm(over));
  edit((body.selfBuiltHousing as { sale: SaleWire }).sale);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body }),
  }));
  const json = (await res.json()) as { data?: { result?: { penaltyTax: number } } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data!.result!;
}

describe("본인 신축 단건 — 정확히 +30% 계약서는 지분이어도 「불분명」", () => {
  it.each([["1", "3"], ["2", "3"], ["1", "7"]])("지분 %s/%s → 가산세 = 안분 모드", async (n, d) => {
    const r = await calc(sbForm({ ...own(n, d), ...DECLARED }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const apportioned = await calc(sbForm({ ...own(n, d), saleSplitMode: "apportioned" }));
    expect(r.result!.penaltyTax).toBe(apportioned.result!.penaltyTax);
  });

  it("1/3 — 계획서 §1 값: 종전 4,062,499 → 3,125,000", async () => {
    expect((await calc(sbForm({ ...own("1", "3"), ...DECLARED }))).result!.penaltyTax).toBe(3_125_000);
    const legacy = await postEdited({ ...own("1", "3"), ...DECLARED }, (s) => {
      delete s.contractLandTransferPrice;
      delete s.contractBuildingTransferPrice;
    });
    expect(legacy.penaltyTax).toBe(4_062_499);
  });

  it("토지만 기재 — 계약 총액(10억)으로 건물 5.2억을 정해 판정 · 가산세 = 안분 모드", async () => {
    const r = await calc(sbForm({ ...own("1", "3"), saleSplitMode: "actual", landTransferPrice: "480000000", buildingTransferPrice: "" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect((r.body.selfBuiltHousing as { sale: SaleWire }).sale).toEqual({ landTransferPrice: 160_000_000, contractLandTransferPrice: 480_000_000 });
    expect(r.result!.penaltyTax).toBe(3_125_000);
  });

  it("단독 소유는 계약서 금액을 싣지 않고 종전 그대로", async () => {
    const r = await calc(sbForm(DECLARED));
    expect(r.body.selfBuiltHousing).toMatchObject({ sale: { landTransferPrice: 480_000_000, buildingTransferPrice: 520_000_000 } });
    expect((r.body.selfBuiltHousing as { sale: SaleWire }).sale).not.toHaveProperty("contractLandTransferPrice");
  });

  it("Q-4 — 구분 기재 적용 시 건물 = 지분 양도가액 − 토지(따로 버림하면 1원 모자람)", async () => {
    // 경계 밖(건물 +10%) · 구분 기재 적용 — 1/3: 토지 floor(5.6억/3) = 186,666,666 · 지분 양도가액 333,333,333 → 건물 146,666,667
    // (종전: 건물도 따로 버림 floor(4.4억/3) = 146,666,666 — 합이 1원 모자랐다)
    const split = { saleSplitMode: "actual", landTransferPrice: "560000000", buildingTransferPrice: "440000000" } as const;
    const r = await calc(sbForm({ ...own("1", "3"), ...split }));
    expect(r.status).toBe(200);
    const hs = (r.result!.selfBuiltHousingPenalty as { housingSplit: { saleBuilding: number } }).housingSplit;
    expect(hs.saleBuilding).toBe(146_666_667);
  });
});

// ─── 이월과세 × 증여자 신축 — 같은 `buildSaleSplitWire` · 같은 판정 leaf (`carryover-donor-built-114-2.anchor` DB-2 셀) ───
function donorForm(asset: Partial<AssetForm>): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "1,000,000,000";
  f.householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true;
  // 1세대1주택 비과세면 이월과세가 배제돼(`carryover_excluded`) 가산세 축이 닫힌다 — 2주택으로 둔다
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2024-05-01",
    landStandardPriceAtTransfer: "240,000,000",
    buildingStandardPriceAtTransfer: "160,000,000",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2024-05-01",
      donorAcquisitionDate: "2022-01-10",
      useEstimatedAcquisition: true,
      estimationMode: "general",
      donorStandardPriceAtAcquisition: "200,000,000",
      donorStandardPriceAtTransfer: "400,000,000",
      giftDateValuation: "800,000,000",
      giftTaxAmount: "0",
      donorRelation: "lineal",
      donorSameHousehold: "no",
      donorBuilt: true,
      donorBuiltType: "new",
      donorBuiltDate: "2022-01-10",
      donorBuiltLandPricePerSqm: "1,000,000",
      donorBuiltLandArea: "100",
      donorBuiltBuildingStdAtAcq: "60,000,000",
    },
    ...asset,
  } as AssetForm;
  return f;
}

describe("증여자 신축(이월과세) — 같은 계약서 판정", () => {
  // 이 셀에서 1/3·1/7은 세액 비교(`exclusionReason: "tax_comparison"`)로 B 시나리오가 채택돼 가산세가 닫힌다
  // (`notAppliedReason: "scenario_b"` 실측) — 판정과 무관한 축이라 2/3로 본다
  it.each([["2", "3"]])("지분 %s/%s · 정확히 +30% → 가산세 = 안분 모드 · 종전 와이어는 다른 값", async (n, d) => {
    const r = await calc(donorForm({ ...own(n, d), ...DECLARED }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const sale = ((r.body.carryoverTaxation as { donorBuilt: { housing: { sale: SaleWire } } }).donorBuilt.housing.sale);
    expect(sale).toMatchObject({ contractLandTransferPrice: 480_000_000, contractBuildingTransferPrice: 520_000_000 });
    const apportioned = await calc(donorForm({ ...own(n, d), saleSplitMode: "apportioned" }));
    expect(r.result!.penaltyTax).toBeGreaterThan(0);
    expect(r.result!.penaltyTax).toBe(apportioned.result!.penaltyTax);

    // 종전 결함 재현 — 계약서 금액을 빼면 지분 몫으로 판정해 「30% 미만」(구분 기재 적용)
    const body = await captureBody(donorForm({ ...own(n, d), ...DECLARED }));
    const s = (body.carryoverTaxation as { donorBuilt: { housing: { sale: SaleWire } } }).donorBuilt.housing.sale;
    delete s.contractLandTransferPrice;
    delete s.contractBuildingTransferPrice;
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body }),
    }));
    const legacy = (await res.json()) as { data: { result: { penaltyTax: number } } };
    expect(legacy.data.result.penaltyTax).not.toBe(r.result!.penaltyTax);
  });

  it("2/3 · 토지만 기재 — 계약 총액으로 건물을 정해 판정 · 가산세 = 안분 모드", async () => {
    const r = await calc(donorForm({ ...own("2", "3"), saleSplitMode: "actual", landTransferPrice: "480,000,000", buildingTransferPrice: "" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const apportioned = await calc(donorForm({ ...own("2", "3"), saleSplitMode: "apportioned" }));
    expect(r.result!.penaltyTax).toBe(apportioned.result!.penaltyTax);
  });
});

describe("함께 양도 — 둘째 자산이 본인 신축 1/3 지분", () => {
  // 이 셀의 지분 양도가액은 249,999,999(안분 건물 100,000,000 실측) → 계약서(100%) 749,999,997.
  // 100% 안분 건물 300,000,000 · 계약서 건물 3.9억 = 정확히 +30% → 「불분명」.
  const share = { ownershipNumerator: "1", ownershipDenominator: "3", ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>;
  it("④ 계약서 금액을 싣고 건물은 비운다 · 가산세 = 안분 모드", async () => {
    const r = await calc(bundledForm({ ...share, saleSplitMode: "actual", landTransferPrice: "359999997", buildingTransferPrice: "390000000" }));
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const comp = (r.body.companionAssets as { selfBuiltHousing: { sale: SaleWire } }[])[0];
    expect(comp.selfBuiltHousing.sale).toEqual({ landTransferPrice: 119_999_999, contractLandTransferPrice: 359_999_997, contractBuildingTransferPrice: 390_000_000 });
    const apportioned = await calc(bundledForm({ ...share, saleSplitMode: "apportioned" }));
    expect(bundledProps(r.json)[1].penaltyTax).toBeGreaterThan(0);
    expect(bundledProps(r.json)[1].penaltyTax).toBe(bundledProps(apportioned.json)[1].penaltyTax);
  });
});
