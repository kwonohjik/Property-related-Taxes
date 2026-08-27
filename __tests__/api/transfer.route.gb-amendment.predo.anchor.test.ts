/**
 * Pre-Do anchor: 일반건물(GB) 라우트가 **수정신고·경정청구를 엔진에 전달**한다
 * (계획서 `docs/00-pm/transfer-amendment-remaining-cases.plan.md` Phase 0 · A-1)
 *
 * ## 결함
 *
 * `route.ts`의 GB 분기(`:425-510`)가 `dispatchGeneralBuilding`에 `amendment`를 **넘기지 않는다**.
 * 대비: `:305`(§166⑥ 일괄)·`:416`(겸용)은 `engineInput.amendment`를 명시적으로 넘긴다.
 * 그런데 클라이언트는 자산 종류와 무관하게 이 값을 싣고(④), Zod도 받고
 * (`transfer-tax-schema.ts:516`), ⑧ validate도 통과시킨다(`transfer-tax-validate.ts:499`는
 * `step===3 && form.amendmentMode`만 본다) ⇒ **입력은 되는데 침묵 무시**.
 *
 * 🔑 **엔진 anchor로는 못 잡는다** — 엔진은 이미 `computeAmendment`를 부른다
 * (`transfer-tax-aggregate.ts:386`). 끊긴 곳은 route다(메모리 `feedback_leaf_anchor_skips_zod_layer`).
 *
 * 🔴 **이 파일은 F17-A(`transfer.route.gb-reduction-penalty-f17.anchor.test.ts`)와 같은 모양의
 *    결함이다.** 같은 분기가 `reductions`·`filingPenaltyDetails`를 같은 이유로 버렸고, 그때도
 *    실측 Δ = 0원이었다. **세 번째 재발**이다(F17 주석은 `isUnregistered` 하드코딩을 두 번째로 센다).
 *
 * ## 법령
 *
 * 국세기본법 §45①(수정신고)·§45의2①(경정청구)의 요건은 「**과세표준신고서를 법정신고기한까지
 * 제출한 자**」 + 기한이다. 본문에도 각 호에도 **양도 자산의 종류·평가 방법·양도 유형을 가르는
 * 문언이 없다** ⇒ 일반건물을 배제할 근거 조문이 부존재한다. (KoreanLaw 실측, MST 288571)
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

/** F17-A와 **같은 물건**을 쓴다 — 기준세액이 이미 실측·고정돼 있어 대조가 쉽다. */
const BASE_TAX_ACTUAL = 204_930_000;
const BASE_TAX_ESTIMATED = 115_332_000;

/** 당초 결정세액을 기준세액보다 낮게 잡아 **추가납부 본세가 양수**가 되게 한다. */
const ORIGINAL_ACTUAL = 200_000_000;
const ORIGINAL_ESTIMATED = 110_000_000;
const ADDITIONAL_ACTUAL = BASE_TAX_ACTUAL - ORIGINAL_ACTUAL; // 4,930,000
const ADDITIONAL_ESTIMATED = BASE_TAX_ESTIMATED - ORIGINAL_ESTIMATED; // 5,332,000

/** 가산세는 끈다 — 이 anchor가 재는 것은 **배관 도달**이지 가산세 산식이 아니다. */
function amendment(originalDeterminedTax: number, over: object = {}) {
  return {
    originalDeterminedTax,
    applyUnderReportingPenalty: false,
    underReportingReason: "normal",
    underReductionMode: "exempt",
    applyLatePaymentPenalty: false,
    statutoryFilingDeadline: "2025-05-31",
    amendedFilingDate: "2024-09-01",
    ...over,
  };
}

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
  totalTax: number;
  amendmentDetail?: {
    correctionKind?: string;
    additionalTax?: number;
    refundTax?: number;
    totalAdditionalPayment?: number;
  };
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

// ── 지분(fractional) 경로 픽스처 ─────────────────────────────────────
// `transfer.route.gb-fractional.predo.anchor.test.ts`와 **같은 물건**을 쓴다.
// 토지 100㎡ · 건물 연면적 200㎡ · 바닥 50㎡ · 총 양도가액 10억 · 지분 A 60% / B 40%.
const FRAC_PROPERTY_LEVEL = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
};

const fracShareValuation = (acqLandPerSqm: number, acqBuildingStd: number) => ({
  ...FRAC_PROPERTY_LEVEL,
  acquisitionLandPricePerSqm: acqLandPerSqm,
  acquisitionBuildingStdPrice: acqBuildingStd,
  buildingAcquisitionCause: "purchase" as const,
});

const FRAC_SHARES = [
  {
    shareId: "share-a",
    shareLabel: "60% 지분",
    ownershipRatio: 0.6,
    acquisitionDate: "2009-03-01",
    valuation: fracShareValuation(1_000_000, 100_000_000),
  },
  {
    shareId: "share-b",
    shareLabel: "40% 지분",
    ownershipRatio: 0.4,
    acquisitionDate: "2015-03-01",
    valuation: fracShareValuation(1_500_000, 150_000_000),
  },
];

async function postFractional(over: object = {}): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...COMMON,
        propertyType: "general_building",
        useEstimatedAcquisition: true,
        acquisitionPrice: 0,
        transferPrice: 1_000_000_000,
        totalPropertyTransferPrice: 1_000_000_000,
        acquisitionDate: FRAC_SHARES[0].acquisitionDate,
        generalBuildingValuation: FRAC_SHARES[0].valuation,
        generalBuildingShares: FRAC_SHARES,
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

describe("A-1 · 일반건물 수정신고·경정청구 배관 (국세기본법 §45·§45의2)", () => {
  it("GBA-01: 🔴 실가 경로 — amendment가 엔진에 도달해 `amendmentDetail`을 만든다", async () => {
    const base = await post(gbAsset());
    expect(base.determinedTax).toBe(BASE_TAX_ACTUAL);
    expect(base.amendmentDetail).toBeUndefined(); // 대조군: 미지정이면 미생성

    const amended = await post(gbAsset(), { amendment: amendment(ORIGINAL_ACTUAL) });

    // 🔴 종전에는 route가 amendment를 버려 이 값이 undefined였다 (실측 Δ 0).
    expect(amended.amendmentDetail).toBeDefined();
    expect(amended.amendmentDetail!.additionalTax).toBe(ADDITIONAL_ACTUAL);
  });

  it("GBA-02: 🔴 환산 경로도 **같은 규약** — 두 경로가 갈리면 안 된다", async () => {
    const base = await post(gbAsset(ESTIMATED), {}, { useEstimatedAcquisition: true });
    expect(base.determinedTax).toBe(BASE_TAX_ESTIMATED);

    const amended = await post(
      gbAsset(ESTIMATED),
      { amendment: amendment(ORIGINAL_ESTIMATED) },
      { useEstimatedAcquisition: true },
    );

    expect(amended.amendmentDetail).toBeDefined();
    expect(amended.amendmentDetail!.additionalTax).toBe(ADDITIONAL_ESTIMATED);
  });

  it("GBA-03: 경정청구(환급 방향)도 도달한다 — `correctionKind`가 보존된다", async () => {
    // 당초 결정세액을 기준세액보다 **높게** 잡아 환급 방향을 만든다.
    const amended = await post(gbAsset(), {
      amendment: amendment(BASE_TAX_ACTUAL + 10_000_000, {
        correctionKind: "refund_claim",
        claimReasonType: "ordinary",
      }),
    });

    expect(amended.amendmentDetail).toBeDefined();
    expect(amended.amendmentDetail!.correctionKind).toBe("refund_claim");
    expect(amended.amendmentDetail!.refundTax).toBe(10_000_000);
  });

  it("GBA-04: 본세(determinedTax)는 정정으로 **바뀌지 않는다** — amendmentDetail은 echo다", async () => {
    const base = await post(gbAsset());
    const amended = await post(gbAsset(), { amendment: amendment(ORIGINAL_ACTUAL) });

    // 정정은 「당초 대비 차액」을 보여줄 뿐 본세 산출을 바꾸지 않는다.
    expect(amended.determinedTax).toBe(base.determinedTax);
  });
  it("GBA-05: 🔴 **지분(fractional) 경로**도 도달한다 — 세 GB 경로가 갈리면 안 된다", async () => {
    // 🔑 이 anchor가 없으면 지분 배선은 **무방비**다 — 실측으로 확인했다:
    //    `general-building-fractional.ts`의 `amendment` 전달을 지운 채
    //    `__tests__/api` + `__tests__/lib/calc` **1,196건이 전건 통과**했다(P-4).
    //    `route.ts:146` 분기는 `assetLevel` 묶음을 받지 않아 단독 인자로 전달되므로
    //    다른 두 경로의 anchor가 이 경로를 **대신 지켜주지 못한다**.
    const base = await postFractional();
    expect(base.amendmentDetail).toBeUndefined();

    const amended = await postFractional({
      amendment: amendment(base.determinedTax - 3_000_000),
    });
    expect(amended.amendmentDetail).toBeDefined();
    expect(amended.amendmentDetail!.additionalTax).toBe(3_000_000);
    // 본세는 정정으로 바뀌지 않는다(echo).
    expect(amended.determinedTax).toBe(base.determinedTax);
  });
});
