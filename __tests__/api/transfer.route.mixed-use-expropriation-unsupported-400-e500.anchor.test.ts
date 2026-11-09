/**
 * route anchor — 겸용 × 공익수용 «미지원 조합»은 직접 API에서 500이 아니라 400 INVALID_INPUT이다 (E-500 · 계획서 `mixed-use-expropriation-unsupported-500-e500.plan.md`).
 *
 * ⑧이 «아직 지원하지 않습니다»로 먼저 막는 조합(겸용 × 공익수용 × 실거래가·감정가액·상속·증여)을 직접 API로 보내면, 엔진이 일반 `Error`를 던져
 * route가 500 `INTERNAL_ERROR`로 응답했다(세액은 틀리지 않는다 — 호출자 입력의 결함이 서버 오류로 보인 것).
 * 엔진 throw를 `TaxCalculationError(INVALID_INPUT)`로 바꿔 기존 `taxCalculationErrorResponse`(400)를 탄다. 메시지는 불변.
 * 대조: 환산 취득은 ⑧ 0건 · 200.
 */
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { houseRow } from "../calc/_helpers/redev-one-house-route";

const TD = "2026-06-01";
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as never);
  vi.mocked(calcMixedUseTransferTax).mockClear();
});

async function post(form: unknown, mutate?: (body: Record<string, unknown>) => void) {
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
  if (mutate) mutate(captured as Record<string, unknown>);
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


const PEF = { ...getReductionDefault("public_expropriation"), expropriationCash: "1,200,000,000", expropriationApprovalDate: "2024-03-01" };
const UNSUPPORTED = /공익수용 특례 조합은 아직 지원하지 않습니다/;
const EXPR_INPUTS = {
  housingCompensationTotal: "800000000", housingCompensationBasisTotal: "500000000",
  mixedCommercialLandCompensationTotal: "300000000", mixedCommercialLandCompensationBasisTotal: "200000000", decedentAcquisitionDate: "2000-01-01",
};
const issues8 = (f: unknown) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f as never).map((i) => i.message));

/** 컴패니언 자리의 겸용 자산에 공익수용 특례 + 취득 방식을 입히고, 단건이면 겸용 1건만 남긴다. */
function formOf(mode: "single" | "companion", cause: "purchase" | "inheritance" | "gift", over: Record<string, unknown> = {}) {
  const f = bundled(cause) as unknown as { assets: Record<string, unknown>[]; contractTotalPrice: string };
  Object.assign(f.assets[1], { transferCause: "public_expropriation", reductions: [PEF], ...EXPR_INPUTS, ...over });
  if (mode === "single") {
    f.assets = [f.assets[1]];
    f.contractTotalPrice = "600000000";
  }
  return f;
}
const errOf = (r: Awaited<ReturnType<typeof post>>) => (r.json as unknown as { error?: { code?: string; message?: string } }).error;

const CELLS = [
  ["매매 실거래가", "purchase", {}],
  ["매매 감정가액", "purchase", { isAppraisalAcquisition: true }],
  ["상속", "inheritance", {}],
  ["증여", "gift", {}],
] as const;

describe("E-500 — 겸용 × 공익수용 미지원 조합: ⑧이 막고, 직접 API는 400 INVALID_INPUT(500 아님)", () => {
  it.each(CELLS)("단건 %s", async (_label, cause, over) => {
    const f = formOf("single", cause, over);
    expect(issues8(f).some((m) => UNSUPPORTED.test(m))).toBe(true); // ⑧이 같은 사유로 먼저 막는다
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(errOf(r)?.code).toBe("INVALID_INPUT");
    expect(errOf(r)?.message).toMatch(UNSUPPORTED);
  }, 60_000);

  it.each(CELLS)("컴패니언 %s", async (_label, cause, over) => {
    const f = formOf("companion", cause, over);
    expect(issues8(f).some((m) => UNSUPPORTED.test(m))).toBe(true);
    const r = await post(f);
    expect(r.status).toBe(400);
    expect(errOf(r)?.code).toBe("INVALID_INPUT");
    expect(errOf(r)?.message).toMatch(UNSUPPORTED);
  }, 60_000);

  it("대조: 매매 환산 취득은 ⑧ 지원 안 함 사유 0건 · 200", async () => {
    const f = formOf("single", "purchase", { useEstimatedAcquisition: true });
    expect(issues8(f).some((m) => UNSUPPORTED.test(m))).toBe(false);
    const r = await post(f);
    expect(r.status).toBe(200);
  }, 60_000);
});

/** 본문 수준 트리거 — ⑫를 통과하는 «용도변경·PHD» 입력(주택→상가 용도변경 · 최초 고시 PHD 3-시점)을 얹는다. */
const PHD = {
  firstDisclosureDate: "2008-04-30", firstDisclosureHousingPrice: 300000000, landPricePerSqmAtAcquisition: 1000000, buildingStdPriceAtAcquisition: 90000000,
  landPricePerSqmAtFirstDisclosure: 1100000, buildingStdPriceAtFirstDisclosure: 95000000, transferHousingPrice: 900000000, landPricePerSqmAtTransfer: 2000000,
  buildingStdPriceAtTransfer: 180000000, commercialBuildingStdPriceAtAcq: 100000000, commercialBuildingStdPriceAtFirstDisclosure: 105000000,
  commercialBuildingStdPriceAtTransfer: 300000000,
};
const PUC = { direction: "house_to_commercial", acqResidentialArea: 100, acqCommercialArea: 100, usageChangeDate: "2012-01-01" };
const plain = (cause: "purchase" | "inheritance", formOver: Record<string, unknown>) => {
  const f = formOf("single", cause, formOver) as unknown as { assets: Record<string, unknown>[] };
  Object.assign(f.assets[0], { transferCause: "general", reductions: [] });
  return f;
};

describe("E-500 — 실거래가·상속 취득 × 용도변경·PHD 미지원 조합도 400 INVALID_INPUT", () => {
  const CASES = [
    ["매매 실거래가 + 보유 중 용도변경", "purchase", { hasPartialUsageChange: true }, (b: { mixedUse: Record<string, unknown> }) => { b.mixedUse.partialUsageChange = PUC; }, /미공시\(PHD\)·보유 중 용도변경 조합은 아직 지원하지 않습니다/],
    ["매매 실거래가 + 미공시(PHD)", "purchase", { usePreHousingDisclosure: true }, (b: { mixedUse: Record<string, unknown> }) => { b.mixedUse.usePreHousingDisclosure = true; b.mixedUse.preHousingDisclosure = PHD; }, /미공시\(PHD\)·보유 중 용도변경 조합은 아직 지원하지 않습니다/],
    ["상속 + 보유 중 용도변경", "inheritance", { hasPartialUsageChange: true }, (b: { mixedUse: Record<string, unknown> }) => { b.mixedUse.partialUsageChange = PUC; }, /상속·증여 취득 \+ 보유 중 용도변경 조합은 아직 지원하지 않습니다/],
  ] as const;

  it.each(CASES)("%s", async (_label, cause, formOver, mutate, re) => {
    expect(issues8(plain(cause, formOver)).some((m) => /아직 지원하지 않습니다/.test(m))).toBe(true); // ⑧이 같은 계열 사유로 먼저 막는다
    const r = await post(plain(cause, {}), mutate as never);
    expect(r.status).toBe(400);
    expect(errOf(r)?.code).toBe("INVALID_INPUT");
    expect(errOf(r)?.message).toMatch(re);
  }, 60_000);
});
