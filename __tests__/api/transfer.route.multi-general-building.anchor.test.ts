/**
 * anchor(⑫·⑭ 다건) — 일반건물을 다건 합산에 넣으면 단건 일반건물 route와 같은 세액이다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 G PR-2 · V-G1~V-G4).
 *
 * 단건 route는 일반건물을 토지·건물 카드로 펼쳐 합산 엔진을 직접 부른다(`dispatchGeneralBuilding`).
 * 다건은 같은 카드를 다른 자산과 한 합산에 넣는다(`multi-gb-expansion.ts`). 기대값은 단건 route 결과와의 동일성이다.
 *
 * - MG-1~3 실가·환산·토지/건물 취득일 분리(세율 구간이 갈리는 V-G1)
 * - MG-4 공익수용 §164⑨1호(V-G3) — 카드 함수가 수용 특례를 받지 않으면 다건만 45,199,334 과대였다
 * - MG-5 다른 자산과 합산 — 카드 id·자산별 상세
 * - MG-6·7 가산세(V-G2) — 신고 1건 = 1회 · base = 그 일반건물의 예정신고 세액(앞 자산이 기본공제를 쓰면 기본공제 없이)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GB_BG_SELF_BUILT_NOTICE } from "@/lib/tax-engine/general-building-bg-penalty-signal";
import { MULTI_GB_BG_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TD = "2024-03-01";

/** `transfer.route.gb-amendment.predo.anchor.test.ts`·`gb-reduction-penalty-f17`과 같은 물건 — 실가 198,210,000 · 환산 111,380,000. */
const COMMON = {
  transferDate: TD,
  expenses: 0,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbZoneType: "general_residential",
    ...over,
  } as AssetForm;
}

const EST: Partial<AssetForm> = { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" };

/** 같은 물건의 단건 body(다건 항목에도 그대로 쓴다). */
function gbBody(asset: AssetForm, top: Obj = {}): Obj {
  return {
    ...COMMON,
    useEstimatedAcquisition: asset.useEstimatedAcquisition,
    propertyType: "general_building",
    transferPrice: 1_000_000_000,
    totalPropertyTransferPrice: 1_000_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: asset.acquisitionDate,
    generalBuildingValuation: buildGeneralBuildingValuation(asset, TD),
    ...top,
  };
}

/** 같은 해 먼저 양도한 토지(기본공제를 먼저 쓴다). */
const LAND: Obj = {
  ...COMMON,
  transferDate: "2024-01-15",
  propertyType: "land",
  transferPrice: 300_000_000,
  acquisitionPrice: 100_000_000,
  acquisitionDate: "2015-01-01",
  useEstimatedAcquisition: false,
};

const post = async (h: (r: NextRequest) => Promise<Response>, url: string, body: unknown) => {
  const res = await h(new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as Obj };
};

async function single(body: Obj): Promise<Obj> {
  const r = await post(SINGLE, "http://l/api/calc/transfer", body);
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  return r.json.data.aggregated;
}

async function multi(items: Obj[]): Promise<Obj> {
  const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    basicDeductionAllocation: "EARLIEST_TRANSFER",
    properties: items.map((it, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `양도 ${i + 1}번`, ...it })),
  });
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  return r.json.data;
}

async function expectParity(body: Obj) {
  const s = await single(body);
  const m = await multi([body]);
  expect(m.determinedTax).toBe(s.determinedTax);
  expect(m.totalTax).toBe(s.totalTax);
  return { s, m };
}

const PENALTY_NONE = {
  determinedTax: 0,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none",
  penaltyReason: "normal",
};

/** `transfer.route.gb-amendment.predo.anchor.test.ts` 지분 픽스처와 같은 모양(60% · 40%). */
const shareValuation = (acqLandPerSqm: number, acqBuildingStd: number) => ({
  landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000, zoneType: "general_residential", acquisitionLandPricePerSqm: acqLandPerSqm,
  acquisitionBuildingStdPrice: acqBuildingStd, buildingAcquisitionCause: "purchase",
});
const SHARES = [
  { shareId: "share-a", shareLabel: "60% 지분", ownershipRatio: 0.6, acquisitionDate: "2009-03-01", valuation: shareValuation(1_000_000, 100_000_000) },
  { shareId: "share-b", shareLabel: "40% 지분", ownershipRatio: 0.4, acquisitionDate: "2015-03-01", valuation: shareValuation(1_500_000, 150_000_000) },
];

describe("다건 — 일반건물이 단건 일반건물 route와 같은 세액이다", () => {
  it("[MG-1] 실가 — 198,210,000", async () => {
    const { s } = await expectParity(gbBody(gbAsset()));
    expect(s.determinedTax).toBe(198_210_000);
  });

  it("[MG-2] 환산 — 111,380,000", async () => {
    const { s } = await expectParity(gbBody(gbAsset(EST)));
    expect(s.determinedTax).toBe(111_380_000);
  });

  it("[MG-3] V-G1 토지·건물 취득일 분리(토지 누진 · 건물 단기 50%) — 실가·환산", async () => {
    const split = { acquisitionDate: "2023-06-01", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2009-03-01" } as Partial<AssetForm>;
    await expectParity(gbBody(gbAsset(split)));
    await expectParity(gbBody(gbAsset({ ...EST, ...split })));
  });

  it("[MG-4] V-G3 공익수용 §164⑨1호 + 환산 — 수용 특례가 카드에 닿는다", async () => {
    const { s, m } = await expectParity(
      gbBody(gbAsset(EST), { transferCause: "public_expropriation", compensationPerSqm: 1_200_000, compensationBasisStdPrice: 1_500_000 }),
    );
    expect(s.determinedTax).toBeLessThan(111_380_000); // 특례가 실제로 발동하는 입력이다
    expect(m.determinedTax).toBe(s.determinedTax);
  });

  it("[MG-5] 다른 자산과 합산 — 카드 id는 부모 id 접미사 · 자산별 상세는 부모 id로", async () => {
    const s = await single(gbBody(gbAsset()));
    const m = await multi([LAND, gbBody(gbAsset())]);
    expect(m.properties.map((p: Obj) => p.propertyId)).toEqual(["p1", "land#p2", "building#p2"]);
    expect(m.generalBuildingDetailsByAsset?.p2).toBeDefined();
    expect(m.generalBuildingValuationDetail).toBeUndefined(); // 수정신고 판별자 슬롯은 쓰지 않는다
    expect(m.determinedTax).toBeGreaterThan(s.determinedTax);
  });

  it("[MG-6] V-G2 가산세는 신고 1건 = 1회 — 단건과 같다(카드 수만큼 배가되지 않는다)", async () => {
    const body = gbBody(gbAsset(), { filingPenaltyDetails: PENALTY_NONE });
    const { s, m } = await expectParity(body);
    expect(s.penaltyTax).toBe(39_642_000);
    expect(m.penaltyTax).toBe(39_642_000);
  });

  it("[MG-7] V-G2 가산세 base = 그 일반건물의 예정신고 세액 — 앞서 양도한 토지가 기본공제를 쓰면 기본공제 없이", async () => {
    const pen = { filingPenaltyDetails: PENALTY_NONE };
    const sNoBd = await single(gbBody(gbAsset(), { ...pen, annualBasicDeductionUsed: 2_500_000 }));
    const sWithBd = await single(gbBody(gbAsset(), pen));
    expect(sNoBd.penaltyTax).toBeGreaterThan(sWithBd.penaltyTax); // 두 base가 실제로 다르다(구별력)
    const m = await multi([LAND, gbBody(gbAsset(), pen)]);
    expect(m.penaltyTax).toBe(sNoBd.penaltyTax);
  });

  it("[MG-7b] V-G2 일반건물이 먼저 양도해 기본공제를 쓰면 나중 자산의 가산세 base에는 기본공제가 없다", async () => {
    const lateLand = { ...LAND, transferDate: "2024-06-15", filingPenaltyDetails: PENALTY_NONE };
    const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
      taxYear: 2024, annualBasicDeductionUsed: 2_500_000, basicDeductionAllocation: "EARLIEST_TRANSFER",
      properties: [{ propertyId: "p1", propertyLabel: "p1", ...lateLand }],
    });
    const landNoBd = r.json.data;
    const landWithBd = await multi([lateLand]);
    expect(landNoBd.penaltyTax).toBeGreaterThan(landWithBd.penaltyTax); // 구별력
    const m = await multi([gbBody(gbAsset()), lateLand]);
    expect(m.penaltyTax).toBe(landNoBd.penaltyTax);
  });

  /** 단건 ④가 만드는 모양(시가 10억 · 채무 3억 · 실지) — 유효한 info여야 공용 스키마를 지나 ⑫ 거부 규칙에 닿는다. */
  const BG_INFO = {
    valuationMode: "sangjeungbeop_market", lendingDepositTotal: 0, mortgageDebtAmount: 300_000_000, annualRentTotal: 0, marketValueAtTransfer: 1_000_000_000,
    acquisitionMethod: "actual", actualAcquisitionTotal: 200_000_000, donorRelation: "lineal_descendant",
    landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 0, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 0,
  };
  // 지분 분할 취득은 2026-11-10 지원 전환(트랙 GS) — 폼 경로 parity는 `__tests__/calc/multi-gb-shares-parity.anchor.test.ts`가 고정한다.
  //   직접 API도 단건 지분 route와 같은 세액이어야 한다. 지분 × 부담부증여도 같은 날 열었다(트랙 GS-BG) — 부담부증여 × 이월과세 지분만 계속 거부한다.
  it("[MG-8] ⑫ 지분 분할 취득(`generalBuildingShares`) — 단건 지분 route와 같은 세액 · 부담부증여 지분도 같은 세액 · 부담부증여 × 이월과세 지분만 거부", async () => {
    const { m } = await expectParity({ ...gbBody(gbAsset()), generalBuildingShares: SHARES });
    expect(m.totalTax).toBeGreaterThan(0);
    // 일반건물 부담부증여 — 양도시·취득시 기준시가 필수(⑫) · 채무는 지분율로 안분(④ `buildBurdenedGiftInfo` debtScaleRatio와 같은 형태)
    const info = (debt: number) => ({
      ...BG_INFO, mortgageDebtAmount: debt, actualAcquisitionTotal: undefined, actualLandAcquisitionPrice: 60_000_000, actualBuildingAcquisitionPrice: 60_000_000,
      landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
    });
    const bgBody = {
      ...gbBody(gbAsset()), transferType: "burdened_gift", burdenedGiftInfo: info(180_000_000), burdenedGiftWholeInfo: info(300_000_000),
      // 일반건물 부담부증여는 실지 경로만(⑫ `refineGbBurdenedGiftActualPath`)
      generalBuildingShares: SHARES.map((sh) => ({
        ...sh, valuation: { ...sh.valuation, actualPriceMode: true }, burdenedGiftInfo: info(sh.ownershipRatio === 0.6 ? 180_000_000 : 120_000_000),
      })),
    };
    const bg = await expectParity(bgBody);
    // 부담부증여가 실제로 반영됐다 — 일반 양도로 조용히 계산되지 않는다(양도가액 = 채무 인수분)
    expect(bg.m.totalTax).not.toBe(m.totalTax);
    const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [{
        propertyId: "p1", propertyLabel: "p1", ...bgBody,
        generalBuildingShares: bgBody.generalBuildingShares.map((sh, i) => (i === 1
          ? { ...sh, carryoverTaxation: { giftRegistryDate: "2021-06-01", donorAcquisitionDate: "2005-01-01", donorAcquisitionPrice: 10_000_000, useEstimatedAcquisition: false, giftTaxAmount: 0, giftDateValuation: 300_000_000, donorRelation: "spouse" } }
          : sh)),
      }],
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain(MULTI_GB_BG_CARRYOVER_UNSUPPORTED_MESSAGE);
  });
  // 일반건물 부담부증여 K-5 × 양도인 본인 신축 §114조의2 — 연간 합산은 가산세는 같았지만 «확인 필요» 고지(Q-14)를 싣지 않았다(2026-11-10 실측 · 트랙 BG #3119 경로).
  //   세액 축(`transfer.route.gb-burdened-gift-self-built-penalty.anchor.test.ts` K-5와 같은 입력)은 그대로 · 고지만 단건과 맞춘다.
  it("[MG-9] 부담부증여 × 본인 신축 가산세 — 단건과 같은 총납부(71,655,100)·가산세(6,250,000)·같은 고지", async () => {
    const body = {
      ...COMMON, propertyType: "general_building", transferDate: "2026-03-01", transferPrice: 1_000_000_000, acquisitionDate: "2022-01-10",
      acquisitionPrice: 0, expenses: 0, householdHousingCount: 2, transferType: "burdened_gift", acquisitionCause: "purchase", useEstimatedAcquisition: false,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0,
        mortgageDebtAmount: 500_000_000, annualRentTotal: 0, mortgageSetAmount: 500_000_000, donorRelation: "lineal_descendant",
        landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000,
      },
      generalBuildingValuation: {
        landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
        zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, actualPriceMode: true,
        buildingAcquisitionCause: "newConstruction", buildingAcquisitionDate: "2022-01-10", landAcquisitionDate: "2015-01-01",
      },
    };
    const s = await single(body);
    expect(s.totalTax).toBe(71_655_100);
    expect(s.warnings).toContain(GB_BG_SELF_BUILT_NOTICE);
    const r = await post(MULTI, "http://l/api/calc/transfer/multi", {
      taxYear: 2026, annualBasicDeductionUsed: 0, basicDeductionAllocation: "EARLIEST_TRANSFER",
      properties: [{ propertyId: "p1", propertyLabel: "p1", ...body }],
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    const m = r.json.data as Obj;
    expect(m.totalTax).toBe(71_655_100);
    expect(m.penaltyTax).toBe(6_250_000);
    expect(m.warnings).toContain(GB_BG_SELF_BUILT_NOTICE);
  });
});
