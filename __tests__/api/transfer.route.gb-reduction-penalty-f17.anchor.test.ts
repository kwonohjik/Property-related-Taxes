/**
 * anchor: 일반건물(GB) 라우트가 **조특법 감면·가산세를 엔진에 전달**한다 (F17-A, 2026-08-23)
 *
 * ## 종전 결함
 *
 * `general-building-route-cards.ts`가 카드마다 `reductions: []`를 **하드코딩**했고,
 * `route.ts`의 GB 분기는 `filingPenaltyDetails`·`delayedPaymentDetails`를 인자로 넘기지도
 * 않았다. 그런데 클라이언트는 자산 종류와 무관하게 이 값들을 body 최상위에 싣고(④),
 * Zod도 받고(⑫), ⑧ validate도 통과시킨다 ⇒ **입력은 되는데 침묵 무시**.
 *
 * 실측 Δ = **0원**(2026-08-23 P-0):
 *
 * | | 종전 | 현행 |
 * |---|---|---|
 * | 실가 §77 공익수용 | 204,930,000 (감면 0) | **184,347,667** (감면 **20,582,333**) |
 * | 실가 무신고 가산세 | 총세액 225,423,000 (가산세 0) | **266,409,000** (가산세 **40,986,000**) |
 * | 환산 §77 공익수용 | 115,332,000 (감면 0) | **103,717,162** (감면 **11,614,838**) |
 *
 * 같은 payload가 **단건 경로에서는 처음부터 세액을 움직였다** — 즉 「의도된 미지원」이 아니라
 * 배관 누락이다. 결정적 근거는 **같은 파일이 같은 모양의 결함을 이미 한 번 고쳤다는 것**이다
 * (`general-building-route-cards.ts`의 `isUnregistered` — 종전 `false` 하드코딩, 바로 다음 줄이
 * `reductions: []`였다).
 *
 * ## 법령
 *
 * · 조특법 §77①1호·3호의 「**토지등**」은 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」
 *   §2 1호 → §3 2호(「토지와 함께 … 필요한 입목, **건물**, 그 밖에 토지에 정착된 물건」)로
 *   위임된다. 조특령 §72에 자산 종류를 좁히는 문언이 없다 ⇒ **건물 파트도 대상**이다.
 * · 가산세는 국세기본법 §47의3①·§48② 본문·각 호·단서 어디에도 **양도 자산의 종류에 따른
 *   예외가 없다** — 겸용·일반건물이라는 이유로 0으로 두는 근거 조문이 부존재한다.
 *
 * ## 🔴 착수 전 안전망 = 0건
 *
 * 배선을 넣은 채 `__tests__/tax-engine/transfer` + `__tests__/api` + `__tests__/calc`
 * **553파일 5,729건**을 돌려도 **전건 통과**했다. 이 파일이 그 사각지대를 덮는다.
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
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER_DATE = "2024-03-01";

/** 조특법 §77 공익수용 — 현금보상 8억. 고시일 2024-01-01(취득 2009-03-01이라 소급 2년 요건 충족). */
const RED_77 = [
  {
    type: "public_expropriation",
    cashCompensation: 800_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: "2024-01-01",
  },
];

/** 무신고 가산세 — `determinedTax`·`reductionAmount`는 엔진이 집계값으로 덮어쓴다. */
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

const COMMON = {
  transferDate: TRANSFER_DATE,
  expenses: 0,
  useEstimatedAcquisition: false,
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

/** 토지 100㎡ · 건물 연면적 200㎡ · 바닥 50㎡ · 일반주거 · 양도 10억 / 취득 2억. */
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

const ESTIMATED: Partial<AssetForm> = {
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
};

interface Agg {
  determinedTax: number;
  reductionAmount: number;
  penaltyTax: number;
  localIncomeTax: number;
  totalTax: number;
  properties: { propertyId: string; reductionAggregated?: number }[];
  filingUnitPenaltyDetail?: { totalPenalty: number };
  steps: { label: string }[];
}

/** 폼 → ④ → route POST → aggregated. ④를 태워야 「route가 버린다」를 잡는다. */
async function post(asset: AssetForm, over: object = {}, top: object = {}): Promise<Agg> {
  const gbv = buildGeneralBuildingValuation(asset, TRANSFER_DATE);
  expect(gbv).toBeDefined();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        propertyType: "general_building",
        transferPrice: 1_000_000_000,
        totalPropertyTransferPrice: 1_000_000_000,
        acquisitionPrice: 200_000_000,
        acquisitionDate: "2009-03-01",
        generalBuildingValuation: gbv,
        ...top,
        ...over,
      }),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated?: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated!;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("F17-A · 일반건물 감면 배관", () => {
  it("GBR-01: 🔴 §77 공익수용이 **실제로 세액을 움직인다** (종전 Δ 0)", async () => {
    const base = await post(gbAsset());
    const red = await post(gbAsset(), { reductions: RED_77 });

    expect(base.determinedTax).toBe(204_930_000);
    expect(base.reductionAmount).toBe(0);

    /**
     * 🔴 값 갱신 (2026-09-03) — 20,582,333 → **20,493,000**. 다건 M-8이 「소득세법」 §90①의
     * `− C`(양도소득 기본공제)를 §77 계열에도 적용하도록 정정했다. 토지·건물 두 파트가 **모두**
     * 감면대상이라 §103②의 비감면소득이 없고, 그래서 C 250만원이 감면 분자에 그대로 실린다.
     * 상세: `__tests__/tax-engine/transfer/aggregate-reduction-77-series-buckets.anchor.test.ts`.
     */
    expect(red.reductionAmount).toBe(20_493_000);
    expect(red.determinedTax).toBe(184_437_000);
    expect(red.determinedTax).not.toBe(base.determinedTax);
  });

  it("GBR-02: 🔑 **토지·건물 두 파트 모두** 감면 대상이다 (조특법 §77 「토지등」)", async () => {
    const red = await post(gbAsset(), { reductions: RED_77 });
    const land = red.properties.find((p) => p.propertyId === "land")!;
    const building = red.properties.find((p) => p.propertyId === "building")!;

    expect(land.reductionAggregated).toBeGreaterThan(0);
    expect(building.reductionAggregated).toBeGreaterThan(0);
    // 안분 잔액은 말단이 흡수한다 — Σ = 전체 불변식(feedback_floor_residual_absorption).
    expect(land.reductionAggregated! + building.reductionAggregated!).toBe(red.reductionAmount);
  });

  it("GBR-03: 환산 경로도 **같은 규약**이다 (두 경로가 갈리면 안 된다)", async () => {
    const base = await post(gbAsset(ESTIMATED), {}, { useEstimatedAcquisition: true });
    const red = await post(gbAsset(ESTIMATED), { reductions: RED_77 }, { useEstimatedAcquisition: true });

    expect(base.determinedTax).toBe(115_332_000);
    // 값 갱신 (2026-09-03) — §90①의 `− C` 적용. GBR-01과 같은 뿌리다.
    expect(red.reductionAmount).toBe(11_533_200);
    expect(red.determinedTax).toBe(103_798_800);
  });

  it("GBR-04: 대조군 — 감면을 안 고르면 종전 값 그대로다 (회귀 0)", async () => {
    const base = await post(gbAsset());
    expect(base.determinedTax).toBe(204_930_000);
    expect(base.totalTax).toBe(225_423_000);
    expect(base.properties.every((p) => (p.reductionAggregated ?? 0) === 0)).toBe(true);
  });
});

/**
 * §77의3 매수 경로축(2026-08-24) — **route를 통과하는 유일한 관측 지점**.
 *
 * ⚠️ 카드 필터 자체는 `gb-route-cards-reduction-scope-f17.anchor.test.ts`가 leaf 직접 호출로
 *    덮는데, **그 방식은 ⑫ Zod를 태우지 않는다**. 실측: Zod에서 `purchaseRoute`를 지운
 *    뮤테이션에 leaf anchor + 단건 route anchor **20/20이 전건 통과**했다(구별력 0).
 *    N-6(A)가 기록한 「route에 body를 직접 넣는 anchor는 ④를 안 태운다」의 **거울상**이다 —
 *    층을 건너뛰는 anchor는 그 층의 결함을 못 본다. 그래서 여기 route 경유 케이스를 둔다.
 */
describe("§77의3 매수 경로 × 일반건물 파트", () => {
  const RED_77_3 = (purchaseRoute: "claim" | "negotiated") => [
    {
      type: "gb_designated_land",
      branch: "in_zone",
      purchaseRoute,
      // 취득 2009-03-01 < 지정일 ⇒ §77의3①1호(지정일 이전 취득 + 거주) 40% 성립.
      designationDate: "2010-01-01",
      triggerDate: "2024-01-01",
      residedFromAcqToTrigger: true,
    },
  ];

  it("GBRT-01: 🔴 §20 협의매수는 **건물 파트에도 감면이 붙는다** (「토지와 그 토지의 정착물」)", async () => {
    const r = await post(gbAsset(), { reductions: RED_77_3("negotiated") });
    const building = r.properties.find((p) => p.propertyId === "building")!;
    expect(building.reductionAggregated).toBeGreaterThan(0);
  });

  it("GBRT-02: 🔴 §17 매수청구는 **건물 파트가 빠진다** (「매수대상토지」 = 토지만)", async () => {
    const r = await post(gbAsset(), { reductions: RED_77_3("claim") });
    const land = r.properties.find((p) => p.propertyId === "land")!;
    const building = r.properties.find((p) => p.propertyId === "building")!;
    expect(land.reductionAggregated).toBeGreaterThan(0);
    expect(building.reductionAggregated ?? 0).toBe(0);
  });

  it("GBRT-03: 🔴 경로가 **세액을 실제로 가른다** — ⑫에서 strip되면 두 값이 같아진다", async () => {
    const claim = await post(gbAsset(), { reductions: RED_77_3("claim") });
    const negotiated = await post(gbAsset(), { reductions: RED_77_3("negotiated") });

    /**
     * ⭐ 두 값의 **갱신 여부가 갈리는 것 자체가 §103②이다** (2026-09-03).
     * · `claim`(§17 매수청구) — 건물 파트가 감면대상이 아니라 **비감면소득**이 되어 기본공제를
     *   먼저 흡수한다 ⇒ C = 0 ⇒ **41,164,666 그대로**.
     * · `negotiated`(§20 협의매수) — 두 파트 모두 감면대상이라 비감면소득이 없다 ⇒ C 250만원이
     *   감면 분자에 실린다 ⇒ 82,329,332 → **81,972,000**.
     */
    expect(claim.reductionAmount).toBe(41_164_666);
    expect(negotiated.reductionAmount).toBe(81_972_000);
    expect(negotiated.determinedTax).toBeLessThan(claim.determinedTax);
  });
});

describe("F17-A · 일반건물 가산세 배관", () => {
  it("GBP-01: 🔴 무신고 가산세가 총세액에 반영된다 (종전 Δ 0)", async () => {
    const base = await post(gbAsset());
    const pen = await post(gbAsset(), { filingPenaltyDetails: PENALTY_NONE });

    expect(base.penaltyTax).toBe(0);
    expect(pen.penaltyTax).toBe(40_986_000);
    expect(pen.totalTax).toBe(266_409_000);
    expect(pen.totalTax - base.totalTax).toBe(40_986_000);
  });

  it("GBP-02: 🔴 **신고 1건 = 가산세 1회** — 카드 수만큼 배가되지 않는다", async () => {
    const pen = await post(gbAsset(), { filingPenaltyDetails: PENALTY_NONE });

    // 무신고 20%(국세기본법 §47의2①1호) × 집계 결정세액 204,930,000 = 40,986,000.
    // 카드(토지·건물)마다 실렸다면 정확히 2배인 81,972,000이 됐을 것이다.
    expect(pen.penaltyTax).toBe(Math.floor(204_930_000 * 0.2));
    expect(pen.filingUnitPenaltyDetail?.totalPenalty).toBe(40_986_000);
  });

  it("GBP-03: 신고불성실 가산세는 **지방소득세 base가 아니다**", async () => {
    const base = await post(gbAsset());
    const pen = await post(gbAsset(), { filingPenaltyDetails: PENALTY_NONE });

    // 지방소득세 = (결정세액 + §114의2 건물가산세) × 10% — 신고불성실은 제외(지방세법 §103의3).
    expect(pen.localIncomeTax).toBe(base.localIncomeTax);
    expect(pen.localIncomeTax).toBe(20_493_000);
  });

  it("GBP-04: 가산세 근거를 **화면에 남긴다** (세액만 바뀌고 침묵하지 않는다)", async () => {
    const pen = await post(gbAsset(), { filingPenaltyDetails: PENALTY_NONE });
    expect(pen.steps.some((s) => s.label === "가산세 (신고서 단위)")).toBe(true);
  });
});
