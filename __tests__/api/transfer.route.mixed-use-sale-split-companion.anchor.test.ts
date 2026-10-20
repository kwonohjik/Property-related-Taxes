/**
 * ⑫ 서버 가드 — 겸용 안분 기준·감가상각비·건물 귀속 양도비는 **단건 겸용 전용**(계획서 Q-2).
 * 동기화 점검 M-3: 클라이언트 ④는 보내지 않지만 컴패니언 겸용 `mixedUse`에 직접 넣으면 종전에는 200 + 세액 변동이었다.
 * 시드·파이프라인은 `transfer.route.companion-mixed-use-housing-rate-basis.anchor.test.ts`와 같다(primary 주택 + companion 겸용).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { withIdentityHousingBuildingStdOnForm } from "../tax-engine/_helpers/mixed-use-identity-std-form";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData, patch?: (b: unknown) => void) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  patch?.(captured);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    body: captured as { companionAssets?: Array<{ assetKind?: string; mixedUse?: Record<string, unknown> }> },
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}


/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(배율초과 발생). */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  // 부수토지가 정착면적의 3배 초과 ⇒ 용도지역 필수 (2026-09-06 · UI 리뷰). 주제와 무관한 축이라 값만 채운다.
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

/** primary 주택 + companion 겸용주택. 기준시가를 같게 두어 안분이 50:50. */
function bundledForm(): TransferFormData {
  // S3-2 ④ — 나목은 폼 필드에서 실려 간다(body shim 아님).
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [
      asset(1),
      asset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" }),
    ],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData);
}


async function postBundled(patch: (b: { companionAssets: Array<{ mixedUse: Record<string, unknown> }> }) => void) {
  const base = bundledForm();
  const f = { ...base, isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true } as TransferFormData;
  return pipeline(f, (b) => patch(b as { companionAssets: Array<{ mixedUse: Record<string, unknown> }> }));
}

describe("M-3 컴패니언 겸용 — 단건 전용 필드는 400", () => {
  it("[MC-0 대조군] 패치 없음 → 200", async () => {
    const r = await postBundled(() => {});
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  });

  it("[MC-1] 컴패니언 mixedUse에 감정가액 → 400", async () => {
    const r = await postBundled((b) => {
      Object.assign(b.companionAssets[0].mixedUse, { landAppraisalAtTransfer: 150_000_000, buildingAppraisalAtTransfer: 100_000_000 });
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("겸용주택 1건만 양도할 때");
  });

  it("[MC-2] 컴패니언 mixedUse에 감가상각비 → 400", async () => {
    const r = await postBundled((b) => {
      Object.assign(b.companionAssets[0].mixedUse, { commercialBuildingDepreciation: 1_000_000 });
    });
    expect(r.status).toBe(400);
  });
});
