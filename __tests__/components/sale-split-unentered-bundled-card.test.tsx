/**
 * anchor — 일괄(aggregate) 결과 화면 «구분 기재 + 두 칸 비움» 안내 — 배선 끝까지 (폼 → ④ → ⑫ route → `BundledAllocationCard`)
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10.3
 *
 * 일반건물은 `TransferTaxResultView`가 아니라 이 카드가 종착지이고, 함께 양도(컴패니언)는 `PropertyCard → ValuationDetailCards →
 * SplitGainDetailSection` 체인을 탄다. 안내는 폼 선택(`saleSplitMode`)을 호출부가 내려보내야 뜨므로 **카드 단위로** 배선을 본다
 * (판정 로직만 보면 «호출부가 prop을 안 내려보내는» 침묵 누락이 통과한다).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { cForm, bodyOf, routeOf } from "@/__tests__/calc/_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const STD = /구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 양도시 기준시가 비율로 안분했습니다/;
const gbAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), assetKind: "general_building", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase",
    acquisitionDate: "2005-03-01", landAcquisitionDate: "1999-05-24", hasSeperateLandAcquisitionDate: true,
    gbBuildingAcquisitionCause: "purchase", gbLandArea: "85", gbBuildingArea: "180.96", gbBuildingFootprintArea: "90.48", gbZoneType: "commercial",
    gbTransferLandPricePerSqm: "10830000", gbTransferBuildingValue: "20629440", gbAcqLandPricePerSqm: "1500000", gbAcqBuildingValue: "28144700",
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300000000", buildingAcquisitionPrice: "400000000",
    ownershipNumerator: "100", ownershipDenominator: "100", ...over,
  }) as never;
const splitAsset = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: "2005-06-01", landAcquisitionDate: "2003-06-01", hasSeperateLandAcquisitionDate: true,
    actualSalePrice: "1,500,000,000", standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100",
    buildingStandardPriceAtAcq: "100,000,000", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "250,000,000",
    landAcqMode: "actual", buildingAcqMode: "actual",
    landStandardPriceAtTransfer: "900,000,000", buildingStandardPriceAtTransfer: "600,000,000", ...over,
  }) as never;

async function renderBundled(form: ReturnType<typeof cForm>) {
  const r = await routeOf(POST as never, await bodyOf(form));
  expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  render(<BundledAllocationCard apportionment={r.json.data.apportionment} aggregated={r.json.data.aggregated} formData={form} />);
}

describe("일반건물 — BundledAllocationCard", () => {
  const gb = (over: Record<string, unknown>) =>
    cForm({ transferDate: "2025-06-30", filingDate: "2026-02-28", contractTotalPrice: "2000000000" } as never, gbAsset(over));

  it("B-1 구분 기재 + 빈칸 → 결과 카드 안내 1회 · 신고서 각주 1회 · 상세명세서 note", async () => {
    await renderBundled(gb({ saleSplitMode: "actual" }));
    expect(screen.getByTestId("sale-split-unentered-notice").textContent).toMatch(STD);
    expect(screen.getByTestId("filing-sale-split-unentered-note").textContent).toMatch(STD);
    expect(screen.queryByTestId("sale-split-judgment")).toBeNull();
  });
  it("B-2 일괄 양도 모드 → 어디에도 안 뜬다", async () => {
    await renderBundled(gb({ saleSplitMode: "apportioned" }));
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
    expect(screen.queryByTestId("filing-sale-split-unentered-note")).toBeNull();
  });
  it("B-3 한쪽만 채움 → 판정이 뜨고 안내는 안 뜬다", async () => {
    await renderBundled(gb({ saleSplitMode: "actual", landTransferPrice: "1,400,000,000" }));
    expect(screen.getByTestId("sale-split-judgment")).toBeTruthy();
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
  });
});

describe("함께 양도(컴패니언) split — PropertyCard 체인", () => {
  const plain = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2008-03-02", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "400,000,000" } as never;
  const comp = (mode: string) => cForm(
    { transferDate: "2025-06-30", filingDate: "2026-02-28", assets: [plain, splitAsset({ saleSplitMode: mode, fixedAcquisitionPrice: "550,000,000" })], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as never,
    plain,
  );
  it("B-4 컴패니언 actual + 빈칸 → 그 자산 카드에 안내가 정확히 1개", async () => {
    await renderBundled(comp("actual"));
    expect(screen.getAllByTestId("sale-split-unentered-notice")).toHaveLength(1);
    expect(screen.getByTestId("filing-sale-split-unentered-note").textContent).toMatch(STD);
  });
  it("B-6 첫 자산(propertyId \"primary\")이 split이어도 안내가 뜬다 — 카드 id와 폼 assetId가 다르다", async () => {
    const primarySplit = splitAsset({ saleSplitMode: "actual", fixedAcquisitionPrice: "550,000,000" });
    const other = { ...makeDefaultAsset(2), addressJibun: "서울 강남구 테스트동 9-9", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2008-03-02", fixedAcquisitionPrice: "300,000,000", actualSalePrice: "400,000,000" } as never;
    await renderBundled(
      cForm({ transferDate: "2025-06-30", filingDate: "2026-02-28", assets: [primarySplit, other], contractTotalPrice: "1900000000", bundledSaleMode: "actual" } as never, primarySplit),
    );
    expect(screen.getAllByTestId("sale-split-unentered-notice")).toHaveLength(1);
    // 신고서 각주도 같은 자산을 찾아야 한다(수집기의 카드 id → 폼 자산 규약)
    expect(screen.getByTestId("filing-sale-split-unentered-note").textContent).toMatch(STD);
  });
  it("B-5 컴패니언 apportioned → 안 뜬다", async () => {
    await renderBundled(comp("apportioned"));
    expect(screen.queryByTestId("sale-split-unentered-notice")).toBeNull();
  });
});
