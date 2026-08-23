/**
 * anchor — 일반건물 × **legacy 모양 이월과세(§97의2) × 환산 모드**: ⑫가 기준시가를 버리는가.
 *
 * ## 결함 (2026-08-23 실측 · P-B)
 *
 * ⑫ `carryoverTaxationEngineShape`(`lib/api/transfer-tax-building-schemas.ts`)에
 * `donorStandardPriceAtAcquisition`가 **없어** Zod가 조용히 strip했다 — 400이 아니라
 * 200 + 환산취득가액 **0**. ④(`buildEngineShaped`)는 「이 경로에서도 실어야 취득가액 0을
 * 피한다(설계 D9-8)」는 주석과 함께 **싣고 있었고**, ⑧(`transfer-tax-validate-gb-carryover.ts`)은
 * 환산 모드에서 그 칸을 **필수로 요구**했다. 즉 「반드시 채우라고 한 값을 ⑫가 버린」 조합이다.
 *
 * ## 왜 legacy 모양으로 도달하는가 (dead path가 아니다)
 *
 * legacy 분기 게이트는 `transfer-tax-api-gb-carryover.ts`의
 * `if (!(giftTaxCalculated > 0) || !(giftTaxBase > 0))`인데, ⑧은 그 두 칸을 필수화하지 않는다.
 * ⇒ 구형 sessionStorage(신규 2필드 default `""`) · 「증여세 산출세액 0」(배우자 6억 공제 내 증여 —
 *   UI placeholder가 「(없으면 0)」으로 명시 초대) · 과세가액 단순 미입력 셋 다 legacy로 떨어진다.
 *
 * ## 픽스처 (K-14 anchor와 동일 — `transfer.route.gb-carryover.predo.anchor.test.ts`)
 *
 *   토지 100㎡ · 양도시 2,000,000/㎡ ⇒ 200,000,000 · 건물 양도시 기준시가 200,000,000
 *   ⇒ §166⑥ 안분 50:50 · 총양도가 10억 ⇒ 토지 500,000,000 / 건물 500,000,000
 *   증여등기 2021-03-01 · 증여자 취득 2005-06-15 · 증여자 취득 당시 토지 기준시가 60,000,000
 *
 * ⚠️ 세액은 **mock 세율표 기준 실측 스냅샷**이지 정본 세액이 아니다(K-12와 같은 규율).
 *    전부 route POST 실측값이며 산식으로 유도하지 않았다.
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
import { buildGeneralBuildingShares } from "@/lib/calc/transfer-tax-api-gb-shares";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

// ── 픽스처 ────────────────────────────────────────────────────────────
const GIFT_DATE = "2021-03-01";
const DONOR_ACQ = "2005-06-15";
const TRANSFER_DATE = "2024-03-01";
const TOTAL = 1_000_000_000;
/** 증여자 취득 당시 토지 기준시가 — 환산 분자. */
const DONOR_LAND_STD_AT_ACQ = 60_000_000;

const GB = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "purchase" as const,
};

const COMMON = {
  propertyType: "general_building" as const,
  transferDate: TRANSFER_DATE,
  acquisitionDate: GIFT_DATE,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
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

/** legacy(엔진 모양) 서브객체 — `landCarryoverTaxation`. */
const engineShaped = (over: object = {}) => ({
  giftRegistryDate: GIFT_DATE,
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: 150_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 400_000_000,
  ...over,
});

/** legacy × 환산 — 실가 칸을 비우고 기준시가만 싣는다(④ `buildEngineShaped`가 하는 그대로). */
const legacyEstimated = () =>
  engineShaped({
    useEstimatedAcquisition: true,
    donorAcquisitionPrice: undefined,
    donorStandardPriceAtAcquisition: DONOR_LAND_STD_AT_ACQ,
  });

/** 신규 사건 객체 (설계 D9-10) — part 경로 대조군용. */
const GIFT_EVENT = {
  giftRegistryDate: GIFT_DATE,
  giftTaxCalculated: 100_000_000,
  giftTaxBase: 500_000_000,
};

const part = (giftDateAssetValue: number, over: object = {}) => ({
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: 150_000_000,
  useEstimatedAcquisition: false,
  giftDateAssetValue,
  ...over,
});

const body = (gbOver: object = {}) => ({
  ...COMMON,
  transferPrice: TOTAL,
  generalBuildingValuation: { ...GB, ...gbOver },
});

type Prop = {
  propertyId: string;
  transferGain: number;
  acquisitionPrice: number;
  carryoverTaxationDetail?: {
    adoptedScenario: string;
    scenarioA: { acquisitionPrice: number; transferGain: number };
    scenarioB: { acquisitionPrice: number };
  };
};

async function post(b: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
  const json = await res.json();
  expect(res.status).toBe(200);
  return {
    properties: (json.data?.aggregated?.properties ?? []) as Prop[],
    determinedTax: json.data?.aggregated?.determinedTax as number,
  };
}
type Res = Awaited<ReturnType<typeof post>>;
const prop = (r: Res, id: string) => r.properties.find((p) => p.propertyId === id);

// ── 지분(%) 경로 — 폼 → ④ → route 전 구간 ──────────────────────────────
const carryoverForm = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: GIFT_DATE,
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: "300,000,000",
  donorCapitalExpenditure: "40,000,000",
  giftTaxAmount: "30,000,000",
  giftDateValuation: "600,000,000",
  ...over,
});

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    gbLandArea: "100",
    gbBuildingArea: "200",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    ...over,
  } as AssetForm;
}

const share = (id: string, num: string, over: Partial<AssetForm> = {}) =>
  gbAsset({ assetId: id, ownershipNumerator: num, ownershipDenominator: "100", ...over });

async function postShares(assets: AssetForm[]) {
  const sp = buildGeneralBuildingShares(assets, TRANSFER_DATE);
  expect(sp).toBeDefined();
  const payloads = sp as NonNullable<typeof sp>;
  return post({
    ...COMMON,
    transferPrice: TOTAL,
    totalPropertyTransferPrice: TOTAL,
    acquisitionDate: "2009-03-01",
    generalBuildingValuation: (payloads[0] as { valuation: object }).valuation,
    generalBuildingShares: payloads,
  });
}

describe("GBLE — GB × legacy 이월과세 × 환산: ⑫ 기준시가 침묵 strip", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // ══════════════════════════════════════════════════════════════════
  // GBLE-01·02 — 단건 GB (결함 본체)
  // ══════════════════════════════════════════════════════════════════
  /**
   * 환산취득가 = floor(토지 양도가 500,000,000 × 60,000,000 ÷ 200,000,000) = 150,000,000.
   * 분모는 **엔진이 아는 양도 당시 토지 기준시가**(2,000,000 × 100㎡)다.
   *
   * 🔑 「≠ 0」이 아니라 **원 단위 일치**로 건다 — 부정 단언은 다른 이유로 0이 아닐 때도 통과한다.
   * 🔴 strip 재발 시 실측값: 0.
   */
  it("GBLE-01: legacy 모양 × 환산 — 토지 환산취득가 150,000,000", async () => {
    const r = await post(
      body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: legacyEstimated() }),
    );
    const d = prop(r, "land")?.carryoverTaxationDetail;
    expect(d?.scenarioA.acquisitionPrice).toBe(150_000_000);
    expect(d?.adoptedScenario).toBe("A");
    expect(d?.scenarioA.transferGain).toBe(320_000_000);
  });

  /** 🔴 세액 고정 — strip 재발 시 실측 204,930,000(**43,470,000 과대과세**). */
  it("GBLE-02: legacy 모양 × 환산 — 결정세액 161,460,000", async () => {
    const r = await post(
      body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: legacyEstimated() }),
    );
    expect(r.determinedTax).toBe(161_460_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBLE-03·04 — 대조군 (수정이 건드리면 안 되는 경로)
  // ══════════════════════════════════════════════════════════════════
  /**
   * 실가 모드는 애초에 기준시가를 읽지 않는다. 증여자 취득가액 150,000,000이
   * GBLE-01의 환산 결과와 **같은 값**이라 세액도 같아야 한다 — 환산이 정상 동작하면
   * 실가와 같은 곳에 착지한다는 교차검증을 겸한다.
   */
  it("GBLE-03: 대조군 — legacy × 실가는 불변 (결정세액 161,460,000)", async () => {
    const r = await post(
      body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: engineShaped() }),
    );
    expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(150_000_000);
    expect(r.determinedTax).toBe(161_460_000);
  });

  /**
   * 신규 part 경로는 ⑫가 처음부터 통과시켰다(K-14). 세액이 GBLE-02와 다른 것은
   * 증여세 상당액이 영 §163의2②로 **안분**되기 때문이지 취득가액 차이가 아니다.
   */
  it("GBLE-04: 대조군 — 신규 part 경로는 불변 (취득가 150,000,000 · 결정세액 153,060,000)", async () => {
    const r = await post(
      body({
        carryoverGiftEvent: GIFT_EVENT,
        landAcquisitionCause: "carryover_gift",
        landCarryoverPart: part(300_000_000, {
          useEstimatedAcquisition: true,
          donorAcquisitionPrice: undefined,
          donorStandardPriceAtAcquisition: DONOR_LAND_STD_AT_ACQ,
        }),
      }),
    );
    expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(150_000_000);
    expect(r.determinedTax).toBe(153_060_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBLE-05 — 지분(%) 경로 (폼 → ④ → ⑫ → 엔진)
  // ══════════════════════════════════════════════════════════════════
  /**
   * GBSC-03(`transfer.route.gb-share-carryover-scale.anchor.test.ts`)은 ④ 출력만 단언해
   * ⑫ 이후를 관측하지 못했다(주석이 그 한계를 스스로 명시하고 있었다). 여기서 route까지 태운다.
   *
   * 기준시가는 **미스케일**이 계약이다(`ENGINE_SHAPED_SCALE`) — 100,000,000이 그대로 분자가 된다.
   * 🔴 strip 재발 시 실측: land#1 취득가 0 · 결정세액 141,063,200.
   */
  it("GBLE-05: 지분 40% legacy × 환산 — land#1 취득가 100,000,000 · 결정세액 117,543,200", async () => {
    const r = await postShares([
      share("share-a", "60"),
      share("share-b", "40", {
        acquisitionDate: GIFT_DATE,
        acquisitionCause: "carryover_gift",
        carryover: carryoverForm({
          useEstimatedAcquisition: true,
          estimationMode: "general",
          donorStandardPriceAtAcquisition: "100,000,000",
        }) as never,
      }),
    ]);
    const land1 = prop(r, "land#1");
    expect(land1?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(100_000_000);
    expect(land1?.acquisitionPrice).toBe(100_000_000);
    expect(r.determinedTax).toBe(117_543_200);
  });
});
