/**
 * anchor — 컴패니언(함께 양도) 겸용주택 × 부담부증여: 계산하지 않고 막는다 (MB-6 · ⑫).
 *
 * 컴패니언 겸용은 서브엔진이 `mixedUse`만 읽고 채무 귀속(`debtAttribution`)을 싣는 입력 경로가 없다. 열어 두면 §159 안분 없이
 * 일반 양도로 계산되는 «오류 없는 오산»이 된다 — `refineCompanionMixedUseBurdenedGift`(컴패니언 arm)와 `refineMixedUseBurdenedGift`
 * (primary 겸용 + 컴패니언 존재 → MB-6)가 입구에서 400으로 막는다. 대조군은 같은 body에서 양도 형태만 일반 양도인 경우(200).
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

async function pipeline(form: TransferFormData) {
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

/** primary가 겸용인 조합 — **계속 차단**된다(별건 축). */
function primaryMixedForm(): TransferFormData {
  return withIdentityHousingBuildingStdOnForm({
    ...createDefaultTransferFormData(),
    assets: [asset(1, MIXED_FIELDS), asset(2)],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData);
}


const BG_INFO = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 0,
  mortgageDebtAmount: 100_000_000,
  annualRentTotal: 0,
  marketValueAtTransfer: 1_000_000_000,
  acquisitionMethod: "actual",
  actualAcquisitionTotal: 500_000_000,
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 1_000_000_000,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 500_000_000,
  donorRelation: "lineal_descendant",
  debtAttribution: { housing: 0, commercial: 0, unallocated: 100_000_000 },
  housingAppraisal: { exists: false },
};

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return { status: res.status, text: JSON.stringify(await res.json()) };
}

describe("컴패니언 겸용주택 × 부담부증여 — MB-6 차단 (API)", () => {
  it("[CB-0] 대조군 — 같은 body(일반 양도)는 200", async () => {
    const r = await pipeline(bundledForm());
    expect(r.status).toBe(200);
  });

  it("[CB-1] 🔴 컴패니언이 겸용이고 transferType=burdened_gift → 400 (컴패니언 arm)", async () => {
    const r = await pipeline(bundledForm());
    const body = r.body as { companionAssets: Array<Record<string, unknown>> };
    const idx = body.companionAssets.findIndex((c) => c.assetKind === "mixed_use_house");
    expect(idx).toBeGreaterThanOrEqual(0);
    body.companionAssets[idx].transferType = "burdened_gift";
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/단독 소유 단건만 지원합니다/);
    expect(res.text).toMatch(new RegExp(`companionAssets.*${idx}|"fieldErrors"`));
  });

  it("[CB-2] 🔴 구 표식(컴패니언 acquisitionCause=burdened_gift)도 같다 → 400", async () => {
    const r = await pipeline(bundledForm());
    const body = r.body as { companionAssets: Array<Record<string, unknown>> };
    const idx = body.companionAssets.findIndex((c) => c.assetKind === "mixed_use_house");
    body.companionAssets[idx].acquisitionCause = "burdened_gift";
    expect((await post(body)).status).toBe(400);
  });

  it("[CB-3] 🔴 primary가 겸용 BG이고 컴패니언이 따로 있으면 MB-6 → 400 (primary arm)", async () => {
    const r = await pipeline(primaryMixedForm());
    const body = { ...(r.body as object), transferType: "burdened_gift", burdenedGiftInfo: BG_INFO };
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/단독 소유 단건만 지원합니다/);
  });
});
