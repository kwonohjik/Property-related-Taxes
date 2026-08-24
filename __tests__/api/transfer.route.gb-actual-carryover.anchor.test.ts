/**
 * anchor — 일반건물 **실거래가(실가) 모드 × 배우자등 이월과세(§97의2)**: 배선되어 있는가.
 *
 * ## 결함 기록 (P-C, 2026-08-23)
 *
 * 실가 경로(`general-building-route-actual.ts`)가 이월과세 서브객체를 **통째로 버리고 있었다**.
 * ④가 실어 보내고(`transfer-tax-api-gb.ts` 실가 return의 `buildGbCarryoverPayload`),
 * `coerceGeneralBuildingPayload`가 **모드와 무관하게** 붙이고, dispatch가 payload를 통째
 * 스프레드하는데, `GeneralBuildingActualPricePayload`에 필드가 없고 구조분해가 꺼내지 않아
 * 여기서 증발했다 — `as unknown as` 캐스트라 tsc도 침묵했다.
 *
 * ⑤(`GeneralBuildingAcquisitionCards.tsx:627`)·⑧(`transfer-tax-validate-gb-carryover.ts`)
 * 어디에도 `landAcqMode` 게이트가 없다 ⇒ 「실가 모드 + 이월과세」는 **정상적으로 만들어지는
 * 조합**인데도 세액이 1원도 바뀌지 않았다(실측 299,010,000 → 299,010,000).
 *
 * 🔴 **안전망은 0건이었다** — 배선을 주입한 채 `npm run test:transfer`를 돌려도
 *    602파일 6,681건이 base와 **완전 동일**하게 통과했다. 이 파일이 그 사각지대를 덮는다.
 *
 * ## 왜 route까지 태우는가
 *
 * 결함은 ④도 엔진도 아닌 **라우트의 구조분해**에 있었다. 폼 → ④ → route → 엔진을 전 구간
 * 태워야 관측된다 — payload를 손으로 적으면 ④가 무엇을 싣는지가 빠지고, 엔진만 부르면
 * 라우트가 빠진다.
 *
 * ## 픽스처 (전 케이스 공통 — GBAC-05만 토지 면적 변형)
 *
 *   토지 100㎡ · 건물 연면적 200㎡ · 바닥 50㎡ · general_residential
 *   양도일 2024-03-01 · 총 양도가액 1,000,000,000 · **실가 모드**(두 파트 모두 actual)
 *   양도시 기준시가 — 토지 2,000,000/㎡ × 100 = 200,000,000 · 건물 200,000,000 ⇒ §166⑥ 50:50
 *   자산 취득가액 200,000,000 (안분 시 토지 100,000,000 · 건물 100,000,000)
 *
 *   이월과세(토지) — 증여등기 2021-03-01 · 증여자 취득 2005-06-15 ·
 *                   증여자 취득가 150,000,000 · 증여 당시 평가액 400,000,000 · 증여세 30,000,000
 *
 * ⚠️ **부호를 일반화하지 말 것.** 이 픽스처는 증여자 취득일 승계로 LTHD가 급증해(2년11개월 0%
 *    → 18년8개월 30%) 세액이 **내려가지만**, 반대 방향 픽스처도 성립한다. 고정하는 것은
 *    「이월과세 유무로 결과가 **갈린다**」와 그때의 정확한 수치다.
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
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

const TRANSFER_DATE = "2024-03-01";
const TOTAL = 1_000_000_000;

/** 이월과세 폼 — 토지 파트 정본. `over`로 파트·모드 변형. */
const carryoverForm = (over: object = {}) => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-03-01",
  donorAcquisitionDate: "2005-06-15",
  donorAcquisitionPrice: "150,000,000",
  giftTaxAmount: "30,000,000",
  giftDateValuation: "400,000,000",
  ...over,
});

/** 실가 모드 일반건물 — 두 파트 모두 `actual`. */
function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2021-03-01",
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

/** 환산 모드 변형 — 대조군(GBAC-03) 전용. */
const ESTIMATED: Partial<AssetForm> = {
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
};

const COMMON = {
  propertyType: "general_building" as const,
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

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

type Agg = {
  determinedTax: number;
  properties: {
    propertyId: string;
    acquisitionPrice: number;
    necessaryExpense: number;
    carryoverTaxationDetail?: {
      adoptedScenario?: "A" | "B";
      scenarioA?: { acquisitionPrice: number; giftTaxAddedToExpense: number };
    };
  }[];
};

/** 폼 → ④ → route POST → aggregated. ④가 payload를 못 만들면 그 자체가 결함이라 여기서 터뜨린다. */
async function post(asset: AssetForm): Promise<Agg> {
  const gbv = buildGeneralBuildingValuation(asset, TRANSFER_DATE);
  expect(gbv).toBeDefined();
  const res = await POST(
    req({
      ...COMMON,
      transferPrice: TOTAL,
      totalPropertyTransferPrice: TOTAL,
      acquisitionPrice: 200_000_000,
      acquisitionDate: "2021-03-01",
      generalBuildingValuation: gbv,
    }),
  );
  const json = (await res.json()) as { data?: { aggregated?: unknown } };
  expect(res.status).toBe(200);
  return json.data?.aggregated as Agg;
}

const card = (a: Agg, id: string) => {
  const p = a.properties.find((x) => x.propertyId === id);
  expect(p, `카드 ${id}가 없다`).toBeDefined();
  return p!;
};

/** 토지만 이월과세. */
const landCarryover = (over: object = {}) =>
  gbAsset({ acquisitionCause: "carryover_gift", carryover: carryoverForm(over) as never });

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("GBAC — 일반건물 실가 모드 × 이월과세(§97의2) 배선", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBAC-01 — 핵심: 실가 모드에서 이월과세가 세액을 움직이는가
  // ══════════════════════════════════════════════════════════════════
  it("GBAC-01: 🔴 실가 × 토지 이월과세 — 이월과세 유무로 결과가 갈린다", async () => {
    const base = await post(gbAsset());
    const co = await post(landCarryover());

    // 종전에는 이 두 값이 **바이트 동일**이었다(299,010,000 = 299,010,000).
    expect(base.determinedTax).toBe(299_010_000);
    expect(co.determinedTax).toBe(225_090_000);
    expect(co.determinedTax).not.toBe(base.determinedTax);
  });

  it("GBAC-01b: 토지 카드가 증여자 취득가액을 승계하고 증여세를 필요경비에 산입한다", async () => {
    const co = await post(landCarryover());
    const land = card(co, "land");

    // §97의2①1호 — 증여자의 취득가액. 종전에는 §166⑥ 안분값 100,000,000 그대로였다.
    expect(land.acquisitionPrice).toBe(150_000_000);
    // 같은 항 3호 — 증여세 상당액.
    expect(land.necessaryExpense).toBe(30_000_000);
    expect(land.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    // 건물 파트는 이월과세가 아니므로 손대지 않는다(§166⑥ 안분값 그대로).
    expect(card(co, "building").acquisitionPrice).toBe(100_000_000);
    expect(card(co, "building").carryoverTaxationDetail).toBeUndefined();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-02 — 대조군: 이월과세가 아닌 실가는 건드리지 않았다
  // ══════════════════════════════════════════════════════════════════
  it("GBAC-02: 대조군 — 취득원인이 매매인 실가 경로는 불변 (회귀 0)", async () => {
    const base = await post(gbAsset());
    expect(base.determinedTax).toBe(299_010_000);
    expect(card(base, "land").acquisitionPrice).toBe(100_000_000); // §166⑥ 50:50
    expect(card(base, "building").acquisitionPrice).toBe(100_000_000);
    for (const p of base.properties) expect(p.carryoverTaxationDetail).toBeUndefined();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-03 — 대조군: 환산 경로는 손대지 않았다
  // ══════════════════════════════════════════════════════════════════
  it("GBAC-03: 대조군 — 환산 경로 세액 불변 (이식 원본을 건드리지 않았다)", async () => {
    const base = await post(gbAsset(ESTIMATED));
    const co = await post(
      gbAsset({ ...ESTIMATED, acquisitionCause: "carryover_gift", carryover: carryoverForm() as never }),
    );
    expect(base.determinedTax).toBe(170_660_000);
    expect(co.determinedTax).toBe(161_460_000);
    expect(co.properties.find((p) => p.propertyId === "land")?.carryoverTaxationDetail).toBeDefined();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-04 — 건물 파트 (법 §97의2① 「토지·건물 등」)
  // ══════════════════════════════════════════════════════════════════
  const buildingCarryoverForm = () =>
    carryoverForm({
      donorAcquisitionPrice: "80,000,000",
      giftDateValuation: "300,000,000",
      giftTaxAmount: "20,000,000",
    });

  it("GBAC-04: 건물 파트만 이월과세 — 건물 카드만 승계, 토지는 안분값 유지", async () => {
    const r = await post(
      gbAsset({
        gbBuildingAcquisitionCause: "carryover_gift",
        carryover: carryoverForm() as never,
        buildingCarryover: buildingCarryoverForm() as never,
      }),
    );
    expect(r.determinedTax).toBe(248_610_000);
    expect(card(r, "building").acquisitionPrice).toBe(80_000_000);
    expect(card(r, "building").necessaryExpense).toBe(20_000_000);
    // 토지 취득원인은 매매 그대로 — 파트 축이 독립임을 고정한다.
    expect(card(r, "land").acquisitionPrice).toBe(100_000_000);
    expect(card(r, "land").carryoverTaxationDetail).toBeUndefined();
  });

  it("GBAC-04b: 토지·건물 두 파트 이월과세 — 각 파트가 자기 증여자 취득가액을 쓴다", async () => {
    const r = await post(
      gbAsset({
        acquisitionCause: "carryover_gift",
        gbBuildingAcquisitionCause: "carryover_gift",
        carryover: carryoverForm() as never,
        buildingCarryover: buildingCarryoverForm() as never,
      }),
    );
    expect(r.determinedTax).toBe(174_690_000);
    expect(card(r, "land").acquisitionPrice).toBe(150_000_000);
    expect(card(r, "building").acquisitionPrice).toBe(80_000_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-05 — NBL 2분할: 이월과세 입력이 **2배 계상**되지 않는가
  // ══════════════════════════════════════════════════════════════════
  /**
   * 토지 500㎡ · 바닥 50㎡ ⇒ 배율 초과로 사업용·비사업용초과분 **2장**으로 갈린다
   * (「소득세법」 §104의3). 두 카드에 서브객체를 통째로 복사하면 증여자 취득가액·
   * 증여 당시 평가액·증여세가 전부 2배가 된다 — 환산 경로에서 실측된 과소 8,706,426의 재발이다.
   * `splitLandCarryover`를 같은 면적 비율로 태워 **합이 입력과 같음**을 고정한다.
   */
  const NBL: Partial<AssetForm> = {
    gbLandArea: "500",
    gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "400,000",
  };

  it("GBAC-05: NBL 2분할 — 이월과세 입력이 면적 비율로 갈리고 합이 입력과 같다", async () => {
    const co = await post(
      gbAsset({ ...NBL, acquisitionCause: "carryover_gift", carryover: carryoverForm() as never }),
    );
    const biz = card(co, "land_business");
    const nbl = card(co, "land_nbl");

    expect(biz.acquisitionPrice).toBe(60_000_000);
    expect(nbl.acquisitionPrice).toBe(90_000_000);
    // 🔑 2배 계상이면 여기가 300,000,000이 된다.
    expect(biz.acquisitionPrice + nbl.acquisitionPrice).toBe(150_000_000);
    expect(biz.necessaryExpense + nbl.necessaryExpense).toBe(30_000_000);
    expect(co.determinedTax).toBe(253_089_999);
  });

  it("GBAC-05b: NBL 대조군 — 이월과세 없으면 종전 안분값 그대로", async () => {
    const base = await post(gbAsset(NBL));
    expect(base.determinedTax).toBe(299_010_000);
    expect(card(base, "land_business").acquisitionPrice).toBe(66_666_666);
    expect(card(base, "land_nbl").acquisitionPrice).toBe(100_000_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-06 — 증여자 취득가액 환산: GB 파트 모드와 **직교**한 축
  // ══════════════════════════════════════════════════════════════════
  /**
   * `carryoverTaxation.useEstimatedAcquisition`은 **증여자의** 취득가액을 모를 때 그것을
   * §97①1호 나목·영 §163⑨로 환산하느냐는 축이고, GB 파트의 `landAcqMode`와 직교한다
   * (`transfer-carryover.types.ts:31-40`). ⑤도 ⑧도 모드 게이트가 없어 **실가 모드에서
   * 열려 있고 분자를 필수로 요구**한다 — 라우트가 분모를 안 실으면 취득가액이 **0**이 된다.
   *
   *   토지 양도가액 500,000,000 × (증여자 취득 당시 50,000,000 ÷ 양도 당시 200,000,000)
   *   = 125,000,000
   */
  it("GBAC-06: 실가 모드에서도 증여자 취득가액 환산이 성립한다 (분모 미주입이면 0)", async () => {
    const r = await post(
      landCarryover({
        useEstimatedAcquisition: true,
        estimationMode: "general",
        donorStandardPriceAtAcquisition: "50,000,000",
        donorAcquisitionPrice: "",
      }),
    );
    const land = card(r, "land");
    expect(land.acquisitionPrice).toBe(125_000_000);
    expect(land.acquisitionPrice).not.toBe(0);
    expect(r.determinedTax).toBe(232_440_000);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBAC-07 — 부담부증여와는 결합하지 않는다 (④ 계약)
  // ══════════════════════════════════════════════════════════════════
  /**
   * §159①1호 경로는 **다른 줄기**(`bgCoDonor*`)가 담당하므로 ④가 서브객체를 만들지 않는다.
   * 라우트에 가드를 두지 않는 근거가 이 계약이다 — 두 곳에서 막으면 dual-truth가 된다.
   */
  it("GBAC-07: ④가 부담부증여에서는 이월과세 서브객체를 만들지 않는다", () => {
    const gbv = buildGeneralBuildingValuation(
      gbAsset({
        transferType: "burdened_gift",
        acquisitionCause: "carryover_gift",
        carryover: carryoverForm() as never,
      }),
      TRANSFER_DATE,
    ) as unknown as Record<string, unknown>;
    expect(gbv).toBeDefined();
    expect(Object.keys(gbv).filter((k) => /arryover/i.test(k))).toEqual([]);
  });
});
