/**
 * anchor — E-14l: 일반건물 **환산 경로**에 취득시 기준시가가 없으면 결과가 NaN이 된다.
 *
 * ## 결함 (base `af34ad75` 실측)
 *
 * `generalBuildingValuationSchema`(⑫)의 `acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`는
 * `optional`인데 엔진 타입 `GeneralBuildingInput`은 둘 다 필수 `number`다. 환산 경로
 * (`actualPriceMode` 아님)에 비워 보내면 Zod를 통과해 엔진에 `undefined`가 도달했다:
 *
 * | 파트 | 엔진에서 | 응답 |
 * |---|---|---|
 * | 건물 | 환산취득가 분자·개산공제 base가 `undefined` → NaN(`general-building-converted-acquisition.ts`) | `general_building_unit` 카드 전 필드 NaN, **200** (JSON에서 null) |
 * | 토지 | `floorProduct`가 비정상 인자를 0으로 돌린다(`area-utils.ts`) | 토지 취득가액·개산공제 **0**, 200 — `totalTax` 85,868,200 (값이 있으면 48,415,400) |
 *
 * 컴패니언 GB(`bundled-split-helpers.ts` → `buildGbPartCards`)·지분 분할(`generalBuildingShares`)·
 * 증축(3-way)도 같은 엔진을 불러 **같은 결함**이었다(각각 NaN 45·79·74곳).
 *
 * ## 도달 범위 — UI로는 닿지 않는다, API 직접 호출로만 닿는다
 *
 * ④ `buildGeneralBuildingValuation`은 환산 파트의 값이 비면 payload를 만들지 않고(`undefined`),
 * ⑧ V-5가 같은 축으로 먼저 막는다. 환산 경로 payload에는 두 키를 **항상 숫자로** 싣는다(실가
 * 파트는 0) ⇒ UI 입력으로 `undefined`가 엔진에 도달하는 경로는 없다(아래 UI-1·UI-2).
 * 발견 경로도 테스트 픽스처였다 — `transfer.route.bundled-swallows-special`의 GB 픽스처가
 * 스키마에 없는 키(`acqLandPricePerSqm`·`acqBuildingStdPrice`)를 써서 조용히 strip됐다.
 *
 * ## 수정
 *
 * - ⑩ Zod: 환산 경로에서 **환산 파트(또는 증축)** 의 취득시 기준시가를 요구한다 — ④·⑧ V-5와 같은 축.
 * - 실가 파트는 요구하지 않는다 — 생략되면 표시값(`standardPriceAtAcquisition`)만 NaN이었으므로
 *   형제 `general-building-part-cards.ts`처럼 0으로 읽는다(④가 싣는 값과 같다).
 * - route: 응답에 NaN·Infinity가 있으면 500으로 끊는다(`lib/api/non-finite-guard.ts`).
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
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TRANSFER_DATE = "2024-03-01";

const COMMON = {
  transferPrice: 500_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
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

/** 취득시 기준시가가 **없는** 환산 경로 valuation (base에서 NaN을 만든 모양). */
const V = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "general_residential" as const,
};
const ACQ = { acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000 };
const LAND_KEY = "acquisitionLandPricePerSqm";
const BUILDING_KEY = "acquisitionBuildingStdPrice";

const EXTENSION = {
  extensionDate: "2015-01-01",
  acquisitionMode: "estimated" as const,
  transferExtensionBuildingStdPrice: 50_000_000,
  acquisitionExtensionBuildingStdPrice: 30_000_000,
  extensionAcquisitionCause: "newConstruction" as const,
};

const single = (v: object, top: object = {}) => ({
  ...COMMON,
  propertyType: "general_building",
  generalBuildingValuation: v,
  ...top,
});
const withCompanionGb = (v: object) => ({
  ...COMMON,
  propertyType: "housing",
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 400_000_000,
  companionAssets: [
    {
      assetId: "c1",
      assetLabel: "일반건물",
      assetKind: "general_building",
      standardPriceAtTransfer: 400_000_000,
      directExpenses: 0,
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      reductions: [],
      isOneHousehold: false,
      generalBuildingValuation: v,
    },
  ],
});
const shares = (v: object) => ({
  ...COMMON,
  propertyType: "general_building",
  useEstimatedAcquisition: true,
  acquisitionPrice: 0,
  generalBuildingValuation: v,
  generalBuildingShares: [
    { shareId: "a", shareLabel: "60%", ownershipRatio: 0.6, acquisitionDate: "2009-03-01", valuation: v },
    { shareId: "b", shareLabel: "40%", ownershipRatio: 0.4, acquisitionDate: "2015-03-01", valuation: v },
  ],
});

interface Json {
  data?: {
    aggregated?: {
      totalTax: number;
      determinedTax: number;
      properties: Array<{ propertyId: string; acquisitionPrice: number; necessaryExpense: number }>;
    };
    apportionment?: { apportioned: Array<{ standardPriceAtAcquisition: number | null }> };
  };
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> };
}

async function post(body: object): Promise<{ status: number; json: Json }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}

/** 400 + 지정 경로에 Zod 오류가 있는지. */
function expectFieldErrors(r: { status: number; json: Json }, paths: string[]) {
  expect(r.status, JSON.stringify(r.json.error)).toBe(400);
  expect(Object.keys(r.json.error?.fieldErrors ?? {}).sort()).toEqual([...paths].sort());
}

/** 200 + 세액·카드 금액이 전부 숫자(JSON null 아님)인지. */
function expectFiniteResult(r: { status: number; json: Json }) {
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  const agg = r.json.data!.aggregated!;
  expect(typeof agg.totalTax).toBe("number");
  for (const p of agg.properties) {
    expect(typeof p.acquisitionPrice, p.propertyId).toBe("number");
    expect(typeof p.necessaryExpense, p.propertyId).toBe("number");
  }
}

describe("E-14l · 일반건물 환산 경로 — 취득시 기준시가 누락 차단 (⑩ Zod)", () => {
  it("E14L-1 🔴 단건 · 두 값 모두 없음 → 400 (base: 200 + 건물 카드 NaN)", async () => {
    expectFieldErrors(await post(single(V)), [
      `generalBuildingValuation.${LAND_KEY}`,
      `generalBuildingValuation.${BUILDING_KEY}`,
    ]);
  });

  it("E14L-2 🔴 단건 · 토지 값만 없음 → 400 (base: 200 + 토지 취득가액 0 · 결정세액 과대)", async () => {
    expectFieldErrors(await post(single({ ...V, [BUILDING_KEY]: 100_000_000 })), [
      `generalBuildingValuation.${LAND_KEY}`,
    ]);
  });

  it("E14L-3 🔴 단건 · 건물 값만 없음 → 400", async () => {
    expectFieldErrors(await post(single({ ...V, [LAND_KEY]: 1_000_000 })), [
      `generalBuildingValuation.${BUILDING_KEY}`,
    ]);
  });

  it("E14L-4 🔴 컴패니언 일반건물 → 400 (같은 스키마 · 경로 접두어만 다르다)", async () => {
    expectFieldErrors(await post(withCompanionGb(V)), [
      `companionAssets.0.generalBuildingValuation.${LAND_KEY}`,
      `companionAssets.0.generalBuildingValuation.${BUILDING_KEY}`,
    ]);
  });

  it("E14L-5 🔴 지분 분할 → 400 (지분마다)", async () => {
    const r = await post(shares(V));
    expect(r.status).toBe(400);
    const keys = Object.keys(r.json.error?.fieldErrors ?? {});
    for (const i of [0, 1]) {
      expect(keys).toContain(`generalBuildingShares.${i}.valuation.${LAND_KEY}`);
      expect(keys).toContain(`generalBuildingShares.${i}.valuation.${BUILDING_KEY}`);
    }
  });

  it("E14L-6 🔴 증축(3-way) → 실가 파트 모드여도 두 값 필요 (안분 분모)", async () => {
    const v = {
      ...V,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 150_000_000,
      buildingAcquisitionPrice: 150_000_000,
      extensionInfo: EXTENSION,
    };
    expectFieldErrors(await post(single(v, { useEstimatedAcquisition: true })), [
      `generalBuildingValuation.${LAND_KEY}`,
      `generalBuildingValuation.${BUILDING_KEY}`,
    ]);
  });

  // ── 긍정 짝 — 같은 payload에 값만 채우면 200 + 전부 숫자 ─────────────────
  it("E14L-P1 🟢 단건 · 값이 있으면 200 + 토지·건물 카드 금액이 숫자", async () => {
    const r = await post(single({ ...V, ...ACQ }));
    expectFiniteResult(r);
    const land = r.json.data!.aggregated!.properties.find((p) => p.propertyId === "land")!;
    const building = r.json.data!.aggregated!.properties.find((p) => p.propertyId === "building")!;
    // 환산취득가 = 안분 양도가액 × 취득시 ÷ 양도시 기준시가 — 두 파트 모두 양수
    expect(land.acquisitionPrice).toBe(125_000_000);
    expect(building.acquisitionPrice).toBe(125_000_000);
    expect(r.json.data!.aggregated!.totalTax).toBe(48_415_400);
  });

  it("E14L-P2 🟢 컴패니언·지분·증축도 값이 있으면 200", async () => {
    expectFiniteResult(await post(withCompanionGb({ ...V, ...ACQ })));
    expectFiniteResult(await post(shares({ ...V, ...ACQ })));
    expectFiniteResult(
      await post(single({ ...V, ...ACQ, extensionInfo: EXTENSION }, { useEstimatedAcquisition: true })),
    );
  });

  it("E14L-P3 🟢 실가 파트의 값은 요구하지 않는다 — 생략해도 200, 표시값은 0 (base: NaN)", async () => {
    // 토지 실가 + 건물 환산 · 토지 취득시 기준시가 생략
    const r = await post(
      single({
        ...V,
        [BUILDING_KEY]: 100_000_000,
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 150_000_000,
      }),
    );
    expectFiniteResult(r);
    expect(r.json.data!.apportionment!.apportioned[0].standardPriceAtAcquisition).toBe(0);

    // 건물 실가 + 토지 환산 · 건물 취득시 기준시가 생략
    expectFiniteResult(
      await post(
        single({
          ...V,
          [LAND_KEY]: 1_000_000,
          landAcqMode: "estimated",
          buildingAcqMode: "actual",
          buildingAcquisitionPrice: 150_000_000,
        }),
      ),
    );
  });

  it("E14L-P4 🟢 실가 경로(`actualPriceMode`)에는 이 요구를 걸지 않는다 — 판정은 그 경로의 것", async () => {
    // 실가 경로는 자기 규칙(`requireAcqStd` — 「소득세법」 제100조 제2항)으로 판정한다.
    // Zod에서 막히면 400 + 이 필드 경로가 나온다 — 그렇지 않음을 본다.
    const r = await post(single({ ...V, actualPriceMode: true }));
    expect(r.status).not.toBe(400);
    expect(r.json.error?.fieldErrors?.[`generalBuildingValuation.${LAND_KEY}`]).toBeUndefined();
  });
});

// ── UI 경로 — undefined가 엔진에 닿지 않음을 고정 (도달 범위 판정의 근거) ──────
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
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbZoneType: "general_residential",
    ...over,
  } as AssetForm;
}

describe("E-14l · UI 경로에서는 도달하지 않는다 (④·⑧)", () => {
  it("UI-1 환산 파트 값이 비면 ⑧이 막고 ④는 payload를 만들지 않는다", () => {
    const asset = gbAsset({ gbAcqBuildingValue: "" });
    expect(validateGeneralBuildingAsset(asset, "자산1", TRANSFER_DATE)).toContain(
      "취득시 건물기준시가 총액을 입력하세요",
    );
    expect(buildGeneralBuildingValuation(asset, TRANSFER_DATE)).toBeUndefined();

    const noLand = gbAsset({ gbAcqLandPricePerSqm: "" });
    expect(validateGeneralBuildingAsset(noLand, "자산1", TRANSFER_DATE)).toContain(
      "취득시 토지 공시지가를 입력하세요",
    );
    expect(buildGeneralBuildingValuation(noLand, TRANSFER_DATE)).toBeUndefined();
  });

  it("UI-2 🟢 ④는 환산 경로 payload에 두 키를 항상 숫자로 싣는다 — 값이 있으면 200 + 숫자", async () => {
    const gbv = buildGeneralBuildingValuation(gbAsset(), TRANSFER_DATE) as Record<string, unknown>;
    expect(typeof gbv[LAND_KEY]).toBe("number");
    expect(typeof gbv[BUILDING_KEY]).toBe("number");
    expect(gbv.actualPriceMode).toBeUndefined(); // 환산 경로
    expectFiniteResult(
      await post({
        ...COMMON,
        useEstimatedAcquisition: true,
        acquisitionPrice: 0,
        propertyType: "general_building",
        generalBuildingValuation: gbv,
      }),
    );
  });
});
