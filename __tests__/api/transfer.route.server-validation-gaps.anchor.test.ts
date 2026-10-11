/**
 * 서버 검증 보강 묶음 (2026-10-11 재실측 별건 #3·#4·#15). #1(겸용 PHD 양도시 H_T 0)은 S3-2 R-9 전환이 anchor다.
 *
 * #3 R-6 — 부담부증여 + 분리 전용 필드 → 400 (전환은 D1-6g). 여기서는 **긍정 짝**: 토지 취득일만 오면 종전 그대로 200·같은 세액.
 * #4 — 컴패니언 소유자 분리 3종 누락이 ⑫를 통과해 엔진이 분리를 조용히 포기하고 비소유 파트까지 과세하던 것(+7천만 원대) → 400.
 *      완결 입력은 종전 결정세액 그대로.
 * #15 — 수용·용도변경 ⑧이 원시 `hasSeperateLandAcquisitionDate`를 읽어 stale 분리 입력(상속·증여 호스트)에서
 *       ⑧ 통과 ↔ ⑫ 400(막다른 길) 또는 거짓 차단 → ⑧이 ④와 같은 「분리 없음」으로 읽는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { validateUsageConversion } from "@/lib/calc/transfer-tax-validate-usage-conversion";
import { hasStaleSplitInput } from "@/lib/calc/transfer-land-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
afterEach(() => vi.unstubAllGlobals());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(b: unknown): Promise<{ status: number; json: any }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  }));
  return { status: res.status, json: await res.json() };
}

describe("#3 R-6 긍정 짝 — 부담부증여에 토지 취득일만(분리 필드 없음)은 막지 않는다", () => {
  const BASE = {
    propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 1_200_000_000, transferDate: "2026-06-30",
    acquisitionDate: "2018-03-02", acquisitionPrice: 0, expenses: 0, isOneHousehold: false, householdHousingCount: 2,
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    residencePeriodMonths: 0, annualBasicDeductionUsed: 0, transferType: "burdened_gift", acquisitionCause: "purchase",
    burdenedGiftInfo: {
      valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual", marketValueAtTransfer: 1_200_000_000,
      actualLandAcquisitionPrice: 300_000_000, actualBuildingAcquisitionPrice: 400_000_000, donorRelation: "lineal_descendant",
      lendingDepositTotal: 0, mortgageDebtAmount: 300_000_000, annualRentTotal: 0,
      landStdPriceAtTransfer: 700_000_000, buildingStdPriceAtTransfer: 500_000_000,
      landStdPriceAtAcquisition: 300_000_000, buildingStdPriceAtAcquisition: 400_000_000,
    },
  };
  it("분리 없음 = 토지 취득일만 = 200 · 결정세액 20,435,000", async () => {
    const plain = await post(BASE);
    const withDate = await post({ ...BASE, landAcquisitionDate: "2008-05-10" });
    expect(plain.status).toBe(200);
    expect(withDate.status).toBe(200);
    expect(plain.json.data.result.determinedTax).toBe(20_435_000);
    expect(withDate.json.data.result.determinedTax).toBe(20_435_000);
  }, 60_000);
  it("파트 가액 하나만 와도 400(분리 전용 필드)", async () => {
    const r = await post({ ...BASE, landAcquisitionDate: "2008-05-10", landAcquisitionPrice: 300_000_000 });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("부담부증여는 토지·건물을 나눈 취득가액·양도가액을 받지 않습니다");
  }, 60_000);
});

describe("#4 컴패니언 소유자 분리 — ⑧ 차단 ⇔ ⑫ 400 (종전 ⑫ 200 · 비소유 파트 과세)", () => {
  const BASE = {
    propertyType: "land", transferDate: "2024-03-01", transferPrice: 600_000_000, acquisitionDate: "2010-01-01",
    acquisitionPrice: 200_000_000, expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 0,
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
    standardPriceAtTransferForApportion: 400_000_000, totalSalePrice: 1_000_000_000,
  };
  const asset = (kind: "building" | "housing", selfOwns: AssetForm["selfOwns"], over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(2), assetId: "c1", assetKind: kind, acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
      addressJibun: "서울 강남구 테스트동 9", fixedAcquisitionPrice: "150000000", selfOwns,
      hasSeperateLandAcquisitionDate: selfOwns !== "both", landAcquisitionDate: "2015-01-01",
      acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtAcq: "1000000",
      buildingStandardPriceAtAcq: "50000000", standardPriceAtAcq: "160000000", standardPriceAtTransfer: "400000000",
      landStandardPriceAtTransfer: "250000000", buildingStandardPriceAtTransfer: "150000000", ...over,
    }) as AssetForm;
  const run = (a: AssetForm) =>
    post({ ...BASE, companionAssets: [buildAssetPayload(a, "apportioned", "2024-03-01")] });

  it("완결 입력은 종전 결정세액 그대로 (건물 both 174,270,000 · building_only 102,510,000 · 주택 building_only 104,560,000)", async () => {
    for (const [a, det] of [
      [asset("building", "both"), 174_270_000],
      [asset("building", "building_only"), 102_510_000],
      [asset("housing", "building_only"), 104_560_000],
    ] as const) {
      const r = await run(a);
      expect(r.status).toBe(200);
      expect(r.json.data.aggregated.determinedTax).toBe(det);
    }
  }, 60_000);

  for (const [name, a, field] of [
    ["건물 building_only − ㎡당 공시지가", asset("building", "building_only", { standardPricePerSqmAtAcq: "" }), "standardPricePerSqmAtAcquisition"],
    ["건물 building_only − 면적", asset("building", "building_only", { acquisitionArea: "" }), "acquisitionArea"],
    ["건물 building_only − 기준시가 총액", asset("building", "building_only", { standardPriceAtAcq: "" }), "standardPriceAtAcquisition"],
    ["건물 land_only − ㎡당 공시지가", asset("building", "land_only", { standardPricePerSqmAtAcq: "" }), "standardPricePerSqmAtAcquisition"],
    ["주택 building_only − ㎡당 공시지가", asset("housing", "building_only", { standardPricePerSqmAtAcq: "" }), "standardPricePerSqmAtAcquisition"],
    ["주택 land_only − 기준시가 총액", asset("housing", "land_only", { standardPriceAtAcq: "" }), "standardPriceAtAcquisition"],
    // 양도시 파트 기준시가 — 종전에도 엔진 예외로 400이었지만 칸이 없었다(⑧은 이 칸을 짚는다)
    ["건물 building_only − 양도시 파트 기준시가", asset("building", "building_only", { landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" }), "landStandardPriceAtTransfer"],
  ] as const) {
    it(`${name} → ⑧ 차단 · ⑫ 400 (companionAssets.0.${field})`, async () => {
      expect(validateSplitDirectInputs(a, "자산2")).toBeTruthy();
      const r = await run(a);
      expect(r.status).toBe(400);
      expect(Object.keys(r.json.error.fieldErrors ?? {})).toContain(`companionAssets.0.${field}`);
    }, 60_000);
  }
});

describe("#15 수용·용도변경 ⑧ — stale 분리 입력은 「분리 없음」(④와 같은 술어)", () => {
  type Asset = ReturnType<typeof makeDefaultAsset>;
  const STALE = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1980-01-01", landCauseHost: "", landAcquisitionCause: "" } as Partial<Asset>;
  const form = (a: Asset): TransferFormData =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2025-03-01", contractTotalPrice: "900,000,000",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [a],
    }) as TransferFormData;
  const issues = (f: TransferFormData) => [0, 1, 2].flatMap((s) => collectStepIssues(s, f));
  async function viaForm(f: TransferFormData) {
    let body: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ success: true, data: {} }) } as unknown as Response;
    }));
    await callTransferTaxAPI(f).catch(() => undefined);
    vi.unstubAllGlobals();
    return post(body);
  }
  const exprBuilding = (over: Partial<Asset> = {}): Asset =>
    ({
      ...makeDefaultAsset(1), assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: "1983-05-01",
      decedentAcquisitionDate: "1975-01-01", addressJibun: "서울 강남구 역삼동 1", actualSalePrice: "900,000,000",
      useEstimatedAcquisition: true, standardPriceAtAcq: "20,000,000", standardPriceAtTransfer: "300,000,000",
      acquisitionArea: "100", transferCause: "public_expropriation", expropriationNoticeDate: "2024-01-01",
      preDeemedClauseAUnconfirmed: true, ...over,
    }) as Asset;

  it("전제: STALE은 stale 분리 입력이다", () => {
    expect(hasStaleSplitInput(exprBuilding(STALE))).toBe(true);
  });

  it("E 건물 수용 환산 + stale: ⑧이 ㎡당 보상가액을 요구(종전 ⑧ 통과 ↔ ⑫ 400) · 채우면 ⑧ 통과 + ⑫ 200", async () => {
    const empty = form(exprBuilding(STALE));
    expect(issues(empty).map((i) => i.field)).toContain("compensationPerSqm");
    const filled = form(exprBuilding({ ...STALE, compensationPerSqm: "3,000,000", compensationBasisStdPrice: "2,000,000" } as Partial<Asset>));
    expect(issues(filled)).toEqual([]);
    expect((await viaForm(filled)).status).toBe(200);
  }, 60_000);

  it("U 주택 상속 용도변경 + stale: C-19 「서로 다른 시점」 거짓 차단 없음 · ⑫ 200", async () => {
    const a = {
      ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2015-05-01",
      decedentAcquisitionDate: "2005-01-01", addressJibun: "서울 강남구 역삼동 1", actualSalePrice: "900,000,000",
      publishedValueAtInheritance: "300,000,000", hasNonHousingConversion: true, residentialUseStartDate: "2018-01-01", ...STALE,
    } as Asset;
    expect(validateUsageConversion(a, "자산", "2025-03-01")).toBeNull();
    expect((await viaForm(form(a))).status).toBe(200);
  }, 60_000);

  it("부정형 짝 — 진짜 분리(매매 호스트 · 다른 취득일)는 C-19 그대로 차단", () => {
    const a = {
      ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-05-01",
      hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", hasNonHousingConversion: true,
      residentialUseStartDate: "2018-01-01",
    } as Asset;
    expect(hasStaleSplitInput(a)).toBe(false);
    expect(validateUsageConversion(a, "자산", "2025-03-01")).toContain("서로 다른 시점");
  });
});
