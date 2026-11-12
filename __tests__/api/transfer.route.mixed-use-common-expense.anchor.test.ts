/**
 * anchor — 겸용주택 × 함께 양도 × 폼 「총 양도비」 (2026-11-12 · 사용자 지시 · Q-5 후속)
 *
 * 결함: 겸용 엔진은 겸용 서브객체의 자산 단위 양도비(`mixedUse.transferExpense`)만 읽고(양도시 기준시가로 주택분·상가분 안분),
 *   파트 카드는 엔진 칸을 비운다(`mixed-use-part-cards.ts` neutralized). 총 양도비 몫은 옛 덩어리 `expenses`로만 와서
 *   **주 자산 겸용·컴패니언 겸용 모두, 선언 채널 유무와 무관하게** 버려졌다.
 *   수정 전 실측(겸용 + 주택 · 총 양도비 2천만): 과세표준 445,300,002 ↔ 자산 칸 양도비 1천만씩 438,300,003(세액 +2,800,000) ·
 *   축 B 겸용 60/40 세액 227,610,002 ↔ 221,730,002(+5,880,000). 환산 겸용은 개산공제 경로라 불변.
 * 수정: `withMixedUseCommonExpense`(`app/api/calc/transfer/engine-input.ts`) — 몫을 `mixedUse.transferExpense`에 더한다(주 자산 `bundled-route.ts` ·
 *   컴패니언 `bundled-split-helpers.ts` 같은 leaf).
 * 약속: 총 양도비 한 번 입력 ≡ 각 자산 양도비 칸에 몫 직접 입력(소득세법 §100② 후문).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withMixedUseCommonExpense } from "@/app/api/calc/transfer/engine-input";
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

type AggProp = { propertyId?: unknown; rateGroup?: unknown };
function aggregated(r: { json: Record<string, unknown> }) {
  return (r.json as { data?: { aggregated?: { properties?: AggProp[] } } }).data?.aggregated ?? {};
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
    ...makeDefaultAsset(i), addressJibun: "제주특별자치도 강남구 테스트동 1-1",
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


type F = () => TransferFormData;
const pick = (base: F, t: string, other: Record<string, unknown>, mixed: Record<string, unknown>, mixedIdx: number) => {
  const b = base();
  return { ...b, isOneHousehold: false, totalTransferExpense: t, assets: b.assets.map((a, i) => ({ ...a, ...(i === mixedIdx ? mixed : other) })) } as TransferFormData;
};
const agg = async (f: TransferFormData) => {
  const r = await pipeline(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
  return aggregated(r) as { taxBase: number; calculatedTax: number };
};

describe("MC-1 총 양도비 ≡ 자산 칸 양도비 몫(1천만씩) — 겸용 위치 × 자본적지출", () => {
  it.each([
    ["컴패니언 겸용", bundledForm, 1, {}, 438_300_003],
    ["컴패니언 겸용 · 자본적지출", bundledForm, 1, { capitalExpenditure: "10000000" }, 431_300_003],
    ["주 자산 겸용", primaryMixedForm, 0, {}, 438_300_003],
    ["주 자산 겸용 · 자본적지출", primaryMixedForm, 0, { capitalExpenditure: "10000000" }, 431_300_003],
  ] as const)("%s", async (_n, base, mi, ch, taxBase) => {
    const a = await agg(pick(base, "20000000", {}, ch, mi));
    const o = await agg(pick(base, "0", { transferExpense: "10000000" }, { ...ch, transferExpense: "10000000" }, mi));
    expect(a.taxBase).toBe(o.taxBase);
    expect(a.calculatedTax).toBe(o.calculatedTax);
    expect(a.taxBase).toBe(taxBase); // 수정 전 +7,000,000(몫 소실)
  });
});

describe("MC-2 축 B 겸용 지분 60/40 — 지분 카드 양도비 칸은 물건 전체 금액(× 지분율)", () => {
  const ab = (t: string, e: Record<string, unknown>) =>
    withIdentityHousingBuildingStdOnForm({
      ...createDefaultTransferFormData(), isOneHousehold: false,
      assets: [
        asset(1, { ...MIXED_FIELDS, ownershipNumerator: "60", ownershipDenominator: "100", ...e }),
        asset(2, { ...MIXED_FIELDS, ownershipNumerator: "40", ownershipDenominator: "100", ...e }),
      ],
      assetSplitMode: "fractional", transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1200000000", householdHousingCount: "2", totalTransferExpense: t,
    } as TransferFormData);
  it("총 양도비 2천만 ≡ 각 카드 2천만 · 221,730,002(수정 전 227,610,002)", async () => {
    const a = await agg(ab("20000000", {}));
    const o = await agg(ab("0", { transferExpense: "20000000" }));
    expect(a.calculatedTax).toBe(o.calculatedTax);
    expect(a.calculatedTax).toBe(221_730_002);
  });
});

describe("MC-3 환산 겸용 컴패니언 — 개산공제 경로(회귀: 수정 전에도 같았다)", () => {
  it("총 양도비 ≡ 자산 칸 양도비", async () => {
    const est = (t: string, p: Record<string, unknown>, m: Record<string, unknown>) => {
      const b = bundledForm();
      return { ...b, isOneHousehold: false, totalTransferExpense: t, assets: [{ ...b.assets[0], ...p }, { ...b.assets[1], useEstimatedAcquisition: true, ...m }] } as TransferFormData;
    };
    const a = await agg(est("20000000", {}, {}));
    const o = await agg(est("0", { transferExpense: "10000000" }, { transferExpense: "10000000" }));
    expect(a.calculatedTax).toBe(o.calculatedTax);
  });
});

describe("MC-4 leaf", () => {
  it("몫을 자산 단위 양도비에 더한다 · 몫 0·없음은 그대로", () => {
    expect(withMixedUseCommonExpense({ transferExpense: 3 }, 5)).toEqual({ transferExpense: 8 });
    expect(withMixedUseCommonExpense({}, 5)).toEqual({ transferExpense: 5 });
    expect(withMixedUseCommonExpense({ transferExpense: 3 }, 0)).toEqual({ transferExpense: 3 });
    expect(withMixedUseCommonExpense({}, undefined)).toEqual({});
  });
});
