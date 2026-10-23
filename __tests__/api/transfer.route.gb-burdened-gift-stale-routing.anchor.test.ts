/**
 * anchor — 일반건물 **부담부증여 × 환산·증축 stale 라우팅** (PR-1 · 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` §2.3·§4 결함 2)
 *
 * ## 결함
 * 부담부증여로 전환하면 ③의 환산 라디오·증축 토글이 화면에서 숨는데(`CompanionAcqPurchaseBlock.tsx:367`·
 * `GeneralBuildingAcquisitionCards.tsx:299`), 이전에 켠 값(`useEstimatedAcquisition`·`gbHasExtension`·분리 ON 파트 환산)은 남는다.
 * ④ `transfer-tax-api-gb.ts`의 라우팅이 그 값을 보고 환산 경로로 보내면 route 는 `actualPriceMode !== true` 라 §159(`burdenedGiftInfo`)를
 * 소비하지 않는다 — 부담부증여가 **조용히** 무시되고 200 이 나간다(⑧ 통과).
 *
 * ## 이 anchor 가 지키는 것
 * 1. stale 4종(환산 선택 후 전환 · 증축 환산모드 · 증축 실가모드 · 분리 ON 파트 환산) × K-5/K-4 = stale 없는 대조값.
 * 2. API 직접 호출: 부담부증여 + 일반건물 payload 가 실가 경로가 아니면 **400**(침묵 무시 금지).
 * 3. 회귀 0: 부담부증여가 아닌 일반건물의 환산·증축·혼합·감정·매매사례 라우팅은 수정 전과 같은 값이다(값은 수정 **전** 실측 고정).
 *
 * 수치는 mock 세율표 실측값이지 «정본 세액»이 아니다 — 같은 입력의 전후 대조가 목적이다.
 * 픽스처: 토지 100㎡×2,000,000(양도시 2억)·건물 양도시 2억 · 취득시 토지 1억·건물 1억 · 시가 10억 · 채무 5억 · 양도 2026-03-01 · 취득 2015-03-01.
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE } from "@/lib/api/transfer-tax-schema-gb-bg-refines";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

// ── 폼 픽스처 ──────────────────────────────────────────────────────────
function gbAsset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as AssetForm;
}
const BG_MARKET = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
};
const K5 = { ...BG_MARKET, bgAcquisitionMethod: "converted" };
const K4 = { ...BG_MARKET, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "150,000,000", bgActualAcquisitionBuilding: "150,000,000" };

const EXT = {
  gbHasExtension: true, gbExtensionDate: "2020-05-01", gbExtensionArea: "30", gbExtensionAcquisitionCause: "purchase",
  gbExtensionAcquisitionMode: "estimated", gbTransferExtensionBuildingStdPrice: "50,000,000",
  gbAcquisitionExtensionBuildingStdPrice: "30,000,000", fixedAcquisitionPrice: "500,000,000",
};
const STALE: Record<string, object> = {
  "환산 선택 후 전환": { useEstimatedAcquisition: true },
  "증축(환산모드) 후 전환": EXT,
  "증축(실가모드) 후 전환": { ...EXT, gbExtensionAcquisitionMode: "actual", gbExtensionActualAcquisitionPrice: "80,000,000", gbExtensionActualExpenses: "0" },
  "분리 ON 파트 환산 후 전환": {
    hasSeperateLandAcquisitionDate: true, landAcqMode: "estimated", buildingAcqMode: "actual",
    landAcquisitionDate: "2015-03-01", buildingAcquisitionDate: "2015-03-01",
    landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "100,000,000",
  },
  // 이미 막혀 있던 stale(`transfer-tax-api-gb.ts` !isBurdenedGiftGb) — 불변 확인용
  "감정가액 선택 후 전환": { isAppraisalAcquisition: true, fixedAcquisitionPrice: "500,000,000" },
  "매매사례 선택 후 전환": { isSalesCaseAcquisition: true, similarSalesValue: "500,000,000" },
};

const form = (a: AssetForm, over: Record<string, unknown> = {}): TransferFormData =>
  ({
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

interface Run { status: number; body: Record<string, unknown>; totalTax?: number; totalGain?: number; hasBg: boolean; error?: { message?: string } }
async function run(f: TransferFormData): Promise<Run> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  const json = (await res.json()) as { data?: { transferBurdenedGiftBreakdown?: unknown; aggregated?: Record<string, unknown> }; error?: { message?: string } };
  const a = json.data?.aggregated;
  return {
    status: res.status, body: cap.body!, error: json.error,
    totalTax: a?.totalTax as number | undefined, totalGain: a?.totalTransferGain as number | undefined,
    hasBg: !!(json.data?.transferBurdenedGiftBreakdown ?? a?.burdenedGift),
  };
}
const issues = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));

// ─────────────────────────────────────────────────────────────────────
describe("SR-1 대조 — stale 없는 단건 GB 부담부증여 (불변)", () => {
  it.each([
    ["K-5", K5, 57_552_880, 247_000_000],
    ["K-4", K4, 91_135_000, 350_000_000],
  ])("%s", async (_n, bg, tax, gain) => {
    const r = await run(form(gbAsset(bg)));
    expect(r.status).toBe(200);
    expect((r.body.generalBuildingValuation as Record<string, unknown>).actualPriceMode).toBe(true);
    expect(r.totalTax).toBe(tax);
    expect(r.totalGain).toBe(gain);
    expect(r.hasBg).toBe(true);
  });
});

describe("SR-2 stale × 부담부증여 — 대조값과 같다 (⑧ 은 통과하므로 ④ 가 막아야 한다)", () => {
  for (const [kName, bg, tax, gain] of [["K-5", K5, 57_552_880, 247_000_000], ["K-4", K4, 91_135_000, 350_000_000]] as const) {
    it.each(Object.keys(STALE))(`${kName} · %s`, async (name) => {
      const f = form(gbAsset({ ...bg, ...STALE[name] }));
      expect(issues(f)).toEqual([]); // ⑧ 통과 — 사용자는 끌 칸이 없다
      const r = await run(f);
      expect(r.status).toBe(200);
      expect((r.body.generalBuildingValuation as Record<string, unknown>).actualPriceMode).toBe(true);
      expect((r.body.generalBuildingValuation as Record<string, unknown>).extensionInfo).toBeUndefined();
      expect(r.hasBg).toBe(true);
      expect(r.totalTax).toBe(tax);
      expect(r.totalGain).toBe(gain);
    });
  }
});

// ── API 직접 호출 ────────────────────────────────────────────────────
const GB = { landArea: 100, buildingArea: 200, buildingFootprintArea: 50, transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000, zoneType: "general_residential", acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000, buildingAcquisitionCause: "purchase" };
const COMMON = { propertyType: "general_building", transferDate: "2026-03-01", transferPrice: 500_000_000, acquisitionDate: "2015-03-01", acquisitionPrice: 0, expenses: 0, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0 };
const INFO = { valuationMode: "sangjeungbeop_market", acquisitionMethod: "converted", marketValueAtTransfer: 1_000_000_000, lendingDepositTotal: 0, mortgageDebtAmount: 500_000_000, annualRentTotal: 0, mortgageSetAmount: 500_000_000, landStdPriceAtTransfer: 200_000_000, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 100_000_000, donorRelation: "lineal_descendant" };
const EXT_INFO = { extensionDate: "2020-05-01", extensionAcquisitionCause: "purchase", acquisitionMode: "estimated", transferExtensionBuildingStdPrice: 50_000_000, acquisitionExtensionBuildingStdPrice: 30_000_000 };
async function post(gbOver: object, top: object = {}) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...COMMON, transferType: "burdened_gift", acquisitionCause: "purchase", useEstimatedAcquisition: false, burdenedGiftInfo: INFO, generalBuildingValuation: { ...GB, ...gbOver }, ...top }),
  }));
  return { status: res.status, json: (await res.json()) as { data?: { aggregated?: { totalTax?: number } }; error?: { message?: string; fieldErrors?: Record<string, unknown> } } };
}

describe("SR-3 서버 안전망 — 부담부증여 + 일반건물 payload 가 실가 경로가 아니면 400", () => {
  it("actualPriceMode true — 정상(200, 57,552,880)", async () => {
    const r = await post({ actualPriceMode: true });
    expect(r.status).toBe(200);
    expect(r.json.data?.aggregated?.totalTax).toBe(57_552_880);
  });
  it("actualPriceMode false → 400", async () => {
    const r = await post({ actualPriceMode: false });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain(GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE);
  });
  it("actualPriceMode 생략 → 400", async () => {
    expect((await post({})).status).toBe(400);
  });
  it("actualPriceMode false + extensionInfo → 400 (종전: 200 · 세액 0)", async () => {
    const r = await post({ actualPriceMode: false, extensionInfo: EXT_INFO, bundledAcquisitionPrice: 500_000_000 });
    expect(r.status).toBe(400);
  });
  it("actualPriceMode true + extensionInfo — 실가 경로는 증축을 쓰지 않으므로 거부하지 않는다(대조 57,552,880)", async () => {
    const r = await post({ actualPriceMode: true, extensionInfo: EXT_INFO, bundledAcquisitionPrice: 500_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.data?.aggregated?.totalTax).toBe(57_552_880);
  });
  it("대조군 — 부담부증여가 아니면 환산 payload 는 그대로 200", async () => {
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...COMMON, transferPrice: 1_000_000_000, acquisitionCause: "purchase", useEstimatedAcquisition: true, generalBuildingValuation: { ...GB, actualPriceMode: false } }),
    }));
    expect(res.status).toBe(200);
  });
});

// ── 컴패니언·지분 payload 도 같은 안전망 (④ 가 만든 정상 body 의 실가 표지만 뒤집는다) ──
async function bodyOf(f: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  return cap.body!;
}
async function postBody(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  return { status: res.status, json: (await res.json()) as { error?: { fieldErrors?: Record<string, unknown> } } };
}
describe("SR-3b 컴패니언·지분 payload 안전망", () => {
  it("컴패니언 GB + burdenedGiftInfo + 환산 payload → 400 (정상 body 는 200)", async () => {
    const f = { ...form(gbAsset(K5)), assetSplitMode: "companion", contractTotalPrice: "", assets: [gbAsset(K5), { ...gbAsset(K5), assetId: "asset-2", addressJibun: "서울 강남구 테스트동 2-2" }] } as unknown as TransferFormData;
    const body = await bodyOf(f);
    const comp = (body.companionAssets as Record<string, unknown>[])[0];
    expect(comp.burdenedGiftInfo).toBeDefined();
    expect((await postBody(body)).status).toBe(200);
    const bad = { ...body, companionAssets: [{ ...comp, generalBuildingValuation: { ...(comp.generalBuildingValuation as object), actualPriceMode: false } }] };
    const r = await postBody(bad);
    expect(r.status).toBe(400);
    // 다른 refine(⑩ 환산 필수값)의 400 과 구별 — 이 안전망의 메시지가 컴패니언 경로를 짚어야 한다
    expect(JSON.stringify(r.json.error)).toContain(GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE);
    expect(JSON.stringify(r.json.error)).toContain("companionAssets.0.generalBuildingValuation.actualPriceMode");
  });
  it("지분(축 B) GB + 부담부증여 + 환산 payload → 400", async () => {
    const share2 = { ...gbAsset({ ...K5, ownershipNumerator: "40", ownershipDenominator: "100", assetId: "asset-2" }), transferType: "regular" };
    const f = { ...form(gbAsset({ ...K5, ownershipNumerator: "60", ownershipDenominator: "100" })), assetSplitMode: "fractional", assets: [gbAsset({ ...K5, ownershipNumerator: "60", ownershipDenominator: "100" }), share2] } as unknown as TransferFormData;
    const body = await bodyOf(f);
    const shares = body.generalBuildingShares as { valuation: object }[];
    expect(shares.length).toBe(2);
    const bad = { ...body, generalBuildingShares: [{ ...shares[0], valuation: { ...shares[0].valuation, actualPriceMode: false } }, shares[1]] };
    const r = await postBody(bad);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain(GB_BG_ACTUAL_PATH_REQUIRED_MESSAGE);
    expect(JSON.stringify(r.json.error)).toContain("generalBuildingShares.0.valuation.actualPriceMode");
  });
});

// ── 회귀 0: 부담부증여가 아닌 GB 라우팅 — 수정 전 실측값 고정 ─────────────────
describe("SR-4 회귀 0 — 비부담부증여 일반건물 라우팅 불변 (값은 수정 전 실측)", () => {
  const REG: [string, object, number, number][] = [
    ["실가", { fixedAcquisitionPrice: "500,000,000" }, 141_966_000, 500_000_000],
    ["환산", { useEstimatedAcquisition: true }, 139_906_800, 494_000_000],
    ["증축 환산모드", EXT, 121_076_267, 432_433_333],
    ["증축 실가모드", STALE["증축(실가모드) 후 전환"], 116_152_667, 420_000_000],
    ["분리 ON 혼합(토지 환산 + 건물 실가)", STALE["분리 ON 파트 환산 후 전환"], 192_463_920, 647_000_000],
    ["감정가액", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "500,000,000" }, 139_906_800, 494_000_000],
    ["매매사례가액", { isSalesCaseAcquisition: true, similarSalesValue: "500,000,000" }, 139_906_800, 494_000_000],
  ];
  it.each(REG)("%s", async (_n, over, tax, gain) => {
    const f = form(gbAsset({ transferType: "regular", ...over }));
    expect(issues(f)).toEqual([]);
    const r = await run(f);
    expect(r.status).toBe(200);
    expect(r.hasBg).toBe(false);
    expect(r.totalTax).toBe(tax);
    expect(r.totalGain).toBe(gain);
  });
});

// ── 옛 이력 (Q-5) ───────────────────────────────────────────────────
describe("SR-5 옛 이력 — stale 이 남은 저장값은 복원 후 재계산으로 정정된다", () => {
  it("migrateAsset 후에도 stale 은 그대로이고(복원이 지우지 않음), 재계산 결과는 대조값이다", async () => {
    const { migrateAsset } = await import("@/lib/stores/calc-wizard-asset-factory");
    const saved = gbAsset({ ...K5, ...EXT, useEstimatedAcquisition: true });
    const restored = migrateAsset(JSON.parse(JSON.stringify(saved)) as AssetForm) as AssetForm;
    expect(restored.transferType).toBe("burdened_gift");
    expect(restored.useEstimatedAcquisition).toBe(true);
    expect(restored.gbHasExtension).toBe(true);
    const r = await run(form(restored));
    expect(r.status).toBe(200);
    expect(r.totalTax).toBe(57_552_880);
  });
});
