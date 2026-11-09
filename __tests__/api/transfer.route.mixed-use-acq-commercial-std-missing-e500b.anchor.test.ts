/**
 * route anchor — 겸용 취득시 상가 기준시가 «입력 누락/0»은 ⑫가 400으로 먼저 막는다 · 상가→주택 «안분 후 0»은 500이 아니라 400 (E-500b · 계획서 `mixed-use-missing-input-throws-e500b.plan.md`).
 *
 * 엔진의 두 방어선(`transfer-tax-mixed-use-commercial.ts` «취득시 상가건물 기준시가·개별공시지가를 모두 입력하세요» 2곳)은 ⑫ refine
 * (`transfer-tax-schema-mixed-use.ts` 「겸용주택은 취득시 상가건물 기준시가가 필요합니다」)에 가려 직접 API로 도달하지 않는다 — 그 격자를 고정한다.
 * `housing-acq.ts` 상가→주택 용도변경은 «면적 안분 후 내림한 값이 0»일 때 던지는 계산 중간값이라 ⑫를 통과한다 → `TaxCalculationError(INVALID_INPUT)` = 400.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 본문(JSON)을 직접 고치는 route anchor: 중첩 필드를 타입 없이 다룬다 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/tax-engine/transfer-tax-mixed-use", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-mixed-use")>();
  return { ...actual, calcMixedUseTransferTax: vi.fn(actual.calcMixedUseTransferTax) };
});

import { POST } from "@/app/api/calc/transfer/route";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { houseRow } from "../calc/_helpers/redev-one-house-route";

const TD = "2026-06-01";
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as never);
  vi.mocked(calcMixedUseTransferTax).mockClear();
});

async function post(form: unknown, mutate?: (b: any) => void) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form as never);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  if (mutate) mutate(captured);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", body: JSON.stringify(captured), headers: { "content-type": "application/json" } }),
  );
  return { status: res.status, json: (await res.json()) as { data?: { aggregated?: { totalTax: number } } } };
}

const MIXED = {
  assetKind: "housing", isMixedUseHouse: true, acquisitionDate: "2010-06-01", useEstimatedAcquisition: false,
  residentialFloorArea: "100", nonResidentialFloorArea: "100", buildingFootprintArea: "100", mixedUseTotalLandArea: "200", mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "400000000", mixedTransferCommercialBuildingPrice: "100000000", mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "100000000", mixedAcqCommercialBuildingPrice: "50000000", mixedAcqLandPricePerSqm: "500000",
};
const R993 = {
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", contractDate993: "2002-03-01", houseType993: "apartment", firstContract993: "yes",
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "200,000,000", standardPriceAtTransfer993: "400,000,000",
  exclusiveAreaSqm993: "84", region993: "outside_speculation",
};
const asset = (i: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(i), addressJibun: "서울특별시 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", actualSalePrice: "600000000", standardPriceAtTransfer: "500000000", standardPriceAtAcq: "250000000", ...over,
});
const bundled = (cause: "purchase" | "inheritance" | "gift") => {
  const causeFacts =
    cause === "inheritance"
      ? { decedentAcquisitionDate: "1995-01-01", mixedHousingInheritedValueOverride: "400000000", mixedCommercialInheritedValueOverride: "100000000" }
      : cause === "gift"
        ? { mixedHousingInheritedValueOverride: "400000000", mixedCommercialInheritedValueOverride: "100000000" }
        : {};
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [asset(1), asset(2, { ...MIXED, acquisitionCause: cause, ...(cause === "purchase" ? { acquisitionDate: "2003-09-01" } : {}), ...causeFacts, reductions: [R993] })],
    transferDate: TD, filingDate: "2026-08-31", contractTotalPrice: "1200000000",
    isOneHousehold: false, isRegulatedArea: true, isRegulatedAreaTouched: true,
    houses: [houseRow("o1", "2015-03-01"), houseRow("o2", "2015-03-01")], householdHousingCount: "4",
    householdNoOtherHousesConfirmed: false, householdNoPresaleRightsConfirmed: true,
  } as never);
};


type Body = { mixedUse: Record<string, any>; companionAssets?: { mixedUse?: Record<string, any> }[] };
const PHD = {
  firstDisclosureDate: "2015-04-30", firstDisclosureHousingPrice: 300000000, landPricePerSqmAtAcquisition: 1000000, buildingStdPriceAtAcquisition: 90000000,
  landPricePerSqmAtFirstDisclosure: 1100000, buildingStdPriceAtFirstDisclosure: 95000000, transferHousingPrice: 900000000, landPricePerSqmAtTransfer: 2000000,
  buildingStdPriceAtTransfer: 180000000,
};
const PHD_FOUR = { ...PHD, commercialBuildingStdPriceAtAcq: 100000000, commercialBuildingStdPriceAtFirstDisclosure: 105000000, commercialBuildingStdPriceAtTransfer: 300000000, totalTransferPriceForFourPart: 1200000000 };

/** 겸용 1건만 양도하는 폼(단건 주 자산). */
function single(cause: "purchase" | "inheritance", over: Record<string, unknown> = {}) {
  const f = bundled(cause) as unknown as { assets: Record<string, unknown>[]; contractTotalPrice: string };
  Object.assign(f.assets[1], over);
  f.assets = [f.assets[1]];
  f.contractTotalPrice = "600000000";
  return f;
}

type Variant = [label: string, cause: "purchase" | "inheritance", formOver: Record<string, unknown>, mutate: (m: Record<string, any>) => void];
const VARIANTS: Variant[] = [
  ["환산 기본", "purchase", { useEstimatedAcquisition: true }, () => {}],
  ["실거래가", "purchase", {}, () => {}],
  ["감정가액", "purchase", { isAppraisalAcquisition: true }, () => {}],
  ["상속", "inheritance", {}, () => {}],
  ["주택→상가 용도변경", "purchase", { useEstimatedAcquisition: true }, (m) => { m.partialUsageChange = { direction: "house_to_commercial", acqResidentialArea: 100, acqCommercialArea: 0, usageChangeDate: "2012-01-01" }; }],
  ["상가→주택 용도변경", "purchase", { useEstimatedAcquisition: true }, (m) => { m.partialUsageChange = { direction: "commercial_to_house", acqResidentialArea: 0, acqCommercialArea: 100, usageChangeDate: "2012-01-01" }; }],
  ["미공시(PHD)", "purchase", { useEstimatedAcquisition: true }, (m) => { m.usePreHousingDisclosure = true; m.preHousingDisclosure = PHD; }],
];
const ZEROS = [
  ["상가건물=0", "commercialBuildingPrice", /취득시 상가건물 기준시가가 필요합니다/],
  ["공시지가=0", "landPricePerSqm", /취득시 개별공시지가가 필요합니다/],
] as const;
const errOf = (r: Awaited<ReturnType<typeof post>>) => (r.json as unknown as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } }).error;

describe("E-500b — 취득시 상가 기준시가 0: 단건 7방식 × 2 = 14칸이 모두 ⑫ 400 (둘 다 0이면 두 메시지)", () => {
  const cells = VARIANTS.flatMap((v) => ZEROS.map((z) => [v[0], z[0], v, z] as const));
  it.each(cells)("%s × %s", async (_vl, _zl, v, z) => {
    const r = await post(single(v[1], v[2]), (b: Body) => { v[3](b.mixedUse); b.mixedUse.acquisitionStandardPrice[z[1]] = 0; });
    expect(r.status).toBe(400);
    expect(errOf(r)?.code).toBe("INVALID_INPUT");
    expect(errOf(r)?.fieldErrors?.[`mixedUse.acquisitionStandardPrice.${z[1]}`]?.[0]).toMatch(z[2]);
  }, 60_000);

  it.each(VARIANTS)("%s × 둘 다 0 → 두 칸 모두 400", async (_l, cause, formOver, mutate) => {
    const r = await post(single(cause, formOver), (b: Body) => { mutate(b.mixedUse); b.mixedUse.acquisitionStandardPrice.commercialBuildingPrice = 0; b.mixedUse.acquisitionStandardPrice.landPricePerSqm = 0; });
    expect(r.status).toBe(400);
    const keys = Object.keys(errOf(r)?.fieldErrors ?? {});
    expect(keys).toContain("mixedUse.acquisitionStandardPrice.commercialBuildingPrice");
    expect(keys).toContain("mixedUse.acquisitionStandardPrice.landPricePerSqm");
  }, 60_000);
});

describe("E-500b — 컴패니언 겸용도 같은 ⑫ 거울 · PHD 4부분(Case A)은 요구하지 않는다(대조)", () => {
  it.each(ZEROS)("컴패니언 %s → 400", async (_l, key, re) => {
    const r = await post(bundled("purchase"), (b: Body) => { const c = b.companionAssets!.find((x) => x.mixedUse)!; c.mixedUse!.acquisitionStandardPrice[key] = 0; });
    expect(r.status).toBe(400);
    expect(errOf(r)?.fieldErrors?.[`companionAssets.0.mixedUse.acquisitionStandardPrice.${key}`]?.[0]).toMatch(re);
  }, 60_000);

  it("대조: 컴패니언 변경 없음 → 200", async () => {
    expect((await post(bundled("purchase"))).status).toBe(200);
  }, 60_000);

  it.each([["상가건물=0", "commercialBuildingPrice"], ["공시지가=0", "landPricePerSqm"], ["변경 없음", undefined]] as const)("PHD 4부분 안분(Case A) × %s → 200", async (_l, key) => {
    const r = await post(single("purchase", { useEstimatedAcquisition: true }), (b: Body) => {
      b.mixedUse.usePreHousingDisclosure = true;
      b.mixedUse.preHousingDisclosure = PHD_FOUR;
      b.mixedUse.partialUsageChange = { direction: "house_to_commercial", acqResidentialArea: 100, acqCommercialArea: 0, usageChangeDate: "2020-01-01" };
      if (key) b.mixedUse.acquisitionStandardPrice[key] = 0;
    });
    expect(r.status).toBe(200);
  }, 60_000);
});

describe("E-500b — 상가→주택 용도변경: 안분 후 0은 500이 아니라 400 INVALID_INPUT", () => {
  const extreme = (m: Record<string, any>) => {
    m.partialUsageChange = { direction: "commercial_to_house", acqResidentialArea: 1, acqCommercialArea: 99999, usageChangeDate: "2012-01-01" };
    m.residentialFloorArea = 1;
    m.nonResidentialFloorArea = 99999;
    m.totalLandArea = 0.01;
    m.buildingFootprintArea = 0.01;
    m.acquisitionStandardPrice.commercialBuildingPrice = 1;
    m.acquisitionStandardPrice.landPricePerSqm = 1;
  };
  it("주택 1㎡ · 상가 99,999㎡ · 취득시 상가건물 1원 · 공시지가 1원/㎡ → ⑫ 통과 후 엔진이 400", async () => {
    const r = await post(single("purchase", { useEstimatedAcquisition: true }), (b: Body) => extreme(b.mixedUse));
    expect(r.status).toBe(400);
    expect(errOf(r)?.code).toBe("INVALID_INPUT");
    expect(errOf(r)?.message).toMatch(/용도변경\(상가→주택\): 취득시 상가 기준시가\(건물\+토지\)가 0이거나 미입력/);
  }, 60_000);

  it("대조: 같은 입력에서 면적만 현실적으로(주택 50㎡ · 상가 50㎡) 바꾸면 안분 값이 0이 아니라 던지지 않는다 → 200", async () => {
    const r = await post(single("purchase", { useEstimatedAcquisition: true }), (b: Body) => {
      extreme(b.mixedUse);
      b.mixedUse.partialUsageChange.acqResidentialArea = 50;
      b.mixedUse.partialUsageChange.acqCommercialArea = 50;
      b.mixedUse.residentialFloorArea = 50;
      b.mixedUse.nonResidentialFloorArea = 50;
      b.mixedUse.totalLandArea = 100;
      b.mixedUse.buildingFootprintArea = 100;
    });
    expect(r.status).toBe(200);
  }, 60_000);
});
