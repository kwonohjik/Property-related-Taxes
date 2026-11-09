/**
 * 함께 양도 겸용주택 파트 카드 — 겸용 서브엔진 입력에 컴패니언의 취득 원인이 실린다 (#2938 STEP 0.45 후속 · NH-14 레인).
 *
 * 종전 `mixed-use-part-cards.ts`는 `acquisitionCause: undefined`를 넘겨, 겸용 서브엔진의 STEP 0.45(감면주택 중과 배제 선판정 — 상속·증여
 * 취득은 «감면되는 주택»이 아니다)가 컴패니언 겸용에는 취득 원인을 볼 수 없었다(단건 겸용은 `route.ts`가 `data.acquisitionCause`를 싣는다).
 *
 * 실측(전후 동일): 파트 카드 경로는 서브엔진의 `total`·`multiHouseSurcharge`를 버리고 안분·환산 값만 쓰며, 카드(aggregate item)는
 * `...companionEngine` 스프레드로 이미 실제 취득 원인을 받는다. 그래서 이 연결은 **세액을 바꾸지 않는다** — 매매 316,604,997 ·
 * 상속 183,219,140 · 증여 413,794,855 (수정 전 동일). 아래 첫 단언은 연결 자체(서브엔진 입력의 취득 원인), 둘째는 세액 불변이다.
 * 양도 2026-06-01 · 프로덕션 fallback 세율 · 주택 2채 명부 · 조정대상지역 · 컴패니언 겸용에 §99의3 1호 선택.
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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { houseRow } from "../calc/_helpers/redev-one-house-route";

const TD = "2026-06-01";
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as never);
  vi.mocked(calcMixedUseTransferTax).mockClear();
});

async function post(form: unknown) {
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

describe("컴패니언 겸용 — 서브엔진 입력의 취득 원인", () => {
  // 🔄 2026-11-07 리뷰 US-08 · US-38 — 컴패니언 겸용의 주택 파트 카드는 명부 없는 fallback이라 위기취득 세율 배제(상속·증여 2010-06-01)와
  //   §99의3 감면주택 중과 배제(매매)를 보지 못해 중과세율이 붙었다(종전 316,604,997 · 183,219,140 · 413,794,855). 새 값은 같은 입력에서
  //   겸용주택을 첫 자산으로 둔(명부 정밀 경로) 계산과 원 단위까지 같다(실측 242,772,000 · 208,214,285 · 327,319,142).
  //   🔄 2026-11-09 V-N1 — 매매 셀 242,772,000은 상가 파트 카드(`mu-comm-*`)에도 §99의3 소득 차감(25,000,000)이 실린 값이었다. 상가분은 주택 감면 대상이
  //   아니므로(`transfer-tax-mixed-use-income-deduction.ts`) 상가 카드에는 싣지 않는다 → 251,052,000. 상속·증여 셀은 불변. 카드별 값은 `…commercial-card-reductions-vn1.anchor`.
  it.each([
    ["purchase", 251_052_000],
    ["inheritance", 208_214_285],
    ["gift", 327_319_142],
  ] as const)("%s: 서브엔진에 취득 원인이 실린다 · 총세액 %i (연결 전후 동일)", async (cause, total) => {
    const r = await post(bundled(cause));
    expect(r.status).toBe(200);
    const causes = vi.mocked(calcMixedUseTransferTax).mock.calls.map((c) => (c[2] as { acquisitionCause?: string }).acquisitionCause);
    expect(causes.length).toBeGreaterThan(0);
    expect(new Set(causes)).toEqual(new Set([cause]));
    expect(r.json.data?.aggregated?.totalTax).toBe(total);
  }, 60_000);

  // 계획서 `surcharge-oos-remaining.plan.md` C — 상속 셀의 주택 파트 카드는 양도차익이 0 이하라 차손 조기반환을 탄다. 그 반환이 위기취득 표지를 싣지 않아
  //   기본세율(104-1-1)인데 세율군이 「중과」로 표시됐다(세액 208,214,285 불변). 매매(§99의3 배제)·증여(위기취득)는 종전에도 progressive였다.
  it.each(["purchase", "inheritance", "gift"] as const)("%s: 주택 파트 카드 세율군 = progressive (기본세율 호와 일치)", async (cause) => {
    const r = await post(bundled(cause));
    const props = (r.json.data?.aggregated as unknown as { properties: { propertyId: string; rateGroup: string; rateClause?: string }[] }).properties;
    const housingParts = props.filter((p) => p.propertyId.startsWith("mu-house-"));
    expect(housingParts).toHaveLength(2);
    for (const p of housingParts) {
      expect(p.rateGroup).toBe("progressive");
      expect(p.rateClause).toBe("104-1-1");
    }
  }, 60_000);

  it("US-07 분양권 상속 답도 그 자산의 것이 서브엔진에 실린다(취득 원인과 함께여야 STEP 0.45 게이트가 카드 판정과 갈리지 않는다)", async () => {
    const f = bundled("inheritance") as unknown as { assets: Record<string, unknown>[] };
    const companion = f.assets[1];
    f.assets[1] = { ...companion, inheritedPresaleCompletedByHeir: "yes", reductions: [{ ...getReductionDefault("unsold_98_3") }] };
    const r = await post(f);
    expect(r.status).toBeLessThan(500);
    const answers = vi.mocked(calcMixedUseTransferTax).mock.calls.map((c) => (c[2] as { inheritedPresaleCompletedByHeir?: string }).inheritedPresaleCompletedByHeir);
    expect(new Set(answers)).toEqual(new Set(["yes"]));
  }, 60_000);
});
