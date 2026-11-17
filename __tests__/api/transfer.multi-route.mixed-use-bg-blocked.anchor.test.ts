/**
 * anchor — 연간 합산(다건 `/api/calc/transfer/multi`) × 겸용주택 × 부담부증여: **계속 막는다** (PR-B 이후에도 범위 밖).
 *
 * PR-B는 단건 계산기의 함께 양도 묶음(`/api/calc/transfer`)만 열었다. 연간 합산은 ⑧(`validateMultiSupportedMode` — 겸용주택·한 건 내 다자산)과
 * ⑫(`MULTI_REJECT_RULES` — `mixedUse`·`companionAssets` 키)가 각자 막는다 — 열린 길이 아니라 키·자산 종류 기준 차단이라 이번 변경(`isCompanion`·`isAxisB`·MB-19~21)과 무관하다.
 * 이 파일은 그 차단이 PR-B로 풀리지 않았음을 ⑧·서버 양쪽에서 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { MULTI_COMPANION_UNSUPPORTED_MESSAGE, MULTI_MIXED_USE_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BG_INFO = {
  valuationMode: "sangjeungbeop_standard", lendingDepositTotal: 0, mortgageDebtAmount: 100_000_000, annualRentTotal: 0,
  landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 1_200_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 600_000_000,
  donorRelation: "lineal_descendant", debtAttribution: { housing: 0, commercial: 0, unallocated: 100_000_000 },
};
/** ⑫ 겸용 서브객체 필수 필드를 채운 최소 유효 값 — 거부 규칙(`MULTI_REJECT_RULES.mixedUse`)이 키 존재만 보므로 값은 계산에 쓰이지 않는다. */
const MIXED_USE = {
  isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
  landAcquisitionDate: "2010-03-15", buildingAcquisitionDate: "2010-03-15", residencePeriodYears: 0,
  transferStandardPrice: { housingPrice: 600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 5_000_000, housingBuildingPrice: 100_000_000 },
  acquisitionStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 2_500_000, housingBuildingPrice: 50_000_000 },
};
const item = (over: object = {}) => ({
  propertyId: "p1", propertyLabel: "p1", propertyType: "housing" as const, transferDate: "2026-02-16", acquisitionDate: "2015-06-01",
  transferPrice: 100_000_000, acquisitionPrice: 50_000_000, expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1,
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], residencePeriodMonths: 0,
  transferType: "burdened_gift", burdenedGiftInfo: BG_INFO, ...over,
});
async function call(properties: object[]) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer/multi", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taxYear: 2026, properties, annualBasicDeductionUsed: 0 }),
  }));
  return { status: res.status, text: JSON.stringify(await res.json()) };
}
const mixedBg = (id: number) => ({
  ...makeDefaultAsset(id), assetKind: "housing", isMixedUseHouse: true, transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard",
}) as unknown as AssetForm;
const houseBg = (id: number) => ({ ...makeDefaultAsset(id), assetKind: "housing", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard" }) as unknown as AssetForm;

describe("연간 합산 × 겸용 부담부증여 — PR-B 이후에도 막힘", () => {
  it("[MB-M1] 서버: 겸용 서브객체(mixedUse)를 가진 부담부증여 건 → 400 (겸용 분리계산은 단건 계산기에서만)", async () => {
    const r = await call([item({ propertyType: "mixed-use-house", mixedUse: MIXED_USE })]);
    expect(r.status).toBe(400);
    expect(r.text).toContain(MULTI_MIXED_USE_UNSUPPORTED_MESSAGE);
  });

  it("[MB-M2] 서버: 한 건 내 다자산(companionAssets)에 겸용 부담부증여 컴패니언 → 400 (한 건 내 다자산은 단건 계산기에서만)", async () => {
    const r = await call([item({ companionAssets: [{ assetId: "m2", assetLabel: "겸용", assetKind: "mixed_use_house", transferType: "burdened_gift", burdenedGiftInfo: BG_INFO, mixedUse: MIXED_USE, transferPrice: 100_000_000, acquisitionDate: "2010-03-15", acquisitionCause: "purchase" }] })]);
    expect(r.status).toBe(400);
    expect(r.text).toContain(MULTI_COMPANION_UNSUPPORTED_MESSAGE);
  });

  it("[MB-M3] ⑧: 겸용 부담부증여 건은 연간 합산에 넣을 수 없다 · 주택 + 겸용 부담부증여 묶음도 한 건 내 다자산으로 막힌다", () => {
    const base = createDefaultTransferFormData();
    expect(validateMultiSupportedMode({ ...base, assets: [mixedBg(1)] } as never)).toBe(MULTI_MIXED_USE_UNSUPPORTED_MESSAGE);
    expect(validateMultiSupportedMode({ ...base, assets: [houseBg(1), mixedBg(2)] } as never)).not.toBeNull();
  });
});
