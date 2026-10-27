/**
 * anchor — 주택·건물 부담부증여 × 토지·건물 취득일 다름 → 화면 경로(폼 → ⑧ → ④ → route)로 파트별 계산 (V-4 PR-B · 설계서 Q-2 a · Q-3 a)
 *
 * 설계서 `docs/00-pm/bg-house-building-split.design.md` §5.2 · §5.3. 엔진은 PR-A(`bg-house-building-split.anchor.test.ts`)와 같은 셀이다.
 * 수정 前: ⑧·⑫가 BG-D(「아직 계산하지 못합니다」)로 막았다 · 토글 C도 ⑧이 막았다.
 *
 * 공통 셀: 양도 2026-02-16 · 시가 10억(토지분 6억 · 건물분 4억 — Q-3 a 칸) · 채무 4억(B/C 0.4).
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { bgAsset, bgForm, bodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
afterEach(() => vi.unstubAllGlobals());

type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
async function post(body: Body): Promise<{ status: number; det?: number; message?: string; data?: Body }> {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 }),
  }));
  const json = (await res.json()) as { data?: { result?: Body; aggregated?: Body }; error?: { message?: string; fieldErrors?: Record<string, string[]> } };
  const message = [json.error?.message, ...Object.values(json.error?.fieldErrors ?? {}).flat()].filter(Boolean).join(" | ");
  const data = json.data?.result ?? json.data?.aggregated;
  return { status: res.status, det: data?.determinedTax, message, data };
}
const issues = (f: TransferFormData) =>
  [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).filter((i) => !String(i.field).startsWith("household")) as { field?: string; message?: string }[];
const bodyAny = async (f: TransferFormData) => (await bodyOf(f)) as Body;
const run = async (f: TransferFormData) => post(await bodyOf(f));
const ok = async (f: TransferFormData) => {
  expect(issues(f)).toEqual([]);
  const r = await run(f);
  expect(r.status, r.message).toBe(200);
  return r;
};

/** 시가 평가 · K-4 · 본인 취득(매매) — 토지 2000-06-01 · 건물 2022-01-10 · 실지 토지 1억 · 건물 1.5억 · 평가액 토지분 6억 · 건물분 4억. */
const SPLIT_MARKET = {
  bgMarketValueAtTransfer: "1,000,000,000", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "400,000,000",
  bgMarketValueLand: "600,000,000", bgMarketValueBuilding: "400,000,000",
} as Partial<AssetForm>;
const own = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    acquisitionCause: "purchase", acquisitionDate: "2022-01-10", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2000-06-01",
    ...SPLIT_MARKET,
    bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "100,000,000", bgActualAcquisitionBuilding: "150,000,000",
    ...over,
  } as Partial<AssetForm>);

describe("본인 취득 · 토지·건물 취득일 다름 → 파트별 계산(종전 ⑧·⑫ 차단)", () => {
  /** PR-A S2와 같은 셀 — 토지 200,000,000 × 30% · 건물 100,000,000 × 8% → 67,270,000. */
  it("주택 · 시가 · K-4 → 67,270,000 · 본문에 토지 취득일 · 파트 실지 · 파트 평가액", async () => {
    const f = bgForm(own());
    const body = await bodyAny(f);
    expect(body.landAcquisitionDate).toBe("2000-06-01");
    expect(body.burdenedGiftInfo).toMatchObject({ actualLandAcquisitionPrice: 100_000_000, actualBuildingAcquisitionPrice: 150_000_000, marketValueByPart: { land: 600_000_000, building: 400_000_000 } });
    expect(body.burdenedGiftInfo.actualAcquisitionTotal).toBeUndefined();
    const r = await ok(f);
    expect(r.det).toBe(67_270_000);
  });

  it("건물(토지 제외) → 같은 값 67,270,000", async () => {
    expect((await ok(bgForm(own({ assetKind: "building" })))).det).toBe(67_270_000);
  });

  it("기준시가 평가(K-1~K-3) — 양도시 개별주택가격 5억을 가목 3억 : 나목 3억 비율로(2.5억 · 2.5억) · 취득시 토지 1억 · 건물 1.5억 → 37,101,040", async () => {
    /**
     * 개별주택가격(라목 결합 공시) 5억을 가목 : 나목 = 1 : 1로 나눈다(「소득세법 시행령」 제166조 제6항 · 일반 양도 S3-1과 같은 비례) → 토지 2.5억 · 건물 2.5억.
     * B/C = 4억 / 5억 = 0.8 → 양도가액 2억 · 2억 · 취득가액 8천만 · 1.2억 · 개산공제 240만 · 360만.
     * 토지 117,600,000 × 30% = 35,280,000 · 건물 76,400,000 × 8% = 6,112,000.
     * 194,000,000 − 41,392,000 − 2,500,000 = 150,108,000 × 38% − 19,940,000 = 37,101,040.
     */
    const f = bgForm(own({
      bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgMarketValueLand: "", bgMarketValueBuilding: "", bgAcquisitionMethod: "",
      bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "",
      standardPriceAtTransfer: "500,000,000",
      standardPricePerSqmAtTransfer: "3,000,000", transferArea: "100", buildingStandardPriceAtTransfer: "300,000,000",
      standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100", buildingStandardPriceAtAcq: "150,000,000",
    } as Partial<AssetForm>));
    const body = await bodyAny(f);
    expect(body.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 250_000_000, buildingStdPriceAtTransfer: 250_000_000, landStdPriceAtAcquisition: 100_000_000, buildingStdPriceAtAcquisition: 150_000_000 });
    expect((await ok(f)).det).toBe(37_101_040);
  });

  it("⑧ — K-4 파트 실지·평가액 파트 칸을 비우면 막는다(자동 안분 금지 · Q-2 a · Q-3 a)", () => {
    expect(issues(bgForm(own({ bgActualAcquisitionLand: "" })))[0]?.field).toBe("bgActualAcquisitionLand");
    expect(issues(bgForm(own({ bgMarketValueBuilding: "" })))[0]?.field).toBe("bgMarketValueBuilding");
    const sum = issues(bgForm(own({ bgMarketValueLand: "500,000,000" })))[0];
    expect([sum?.field, sum?.message?.includes("합계")]).toEqual(["bgMarketValueLand", true]);
  });

  it("회귀 — 같은 날이면 파트 칸을 묻지 않고 종전 그대로", async () => {
    const f = bgForm(own({ landAcquisitionDate: "2022-01-10", bgActualAcquisitionTotal: "250,000,000", bgActualAcquisitionLand: "", bgActualAcquisitionBuilding: "", bgMarketValueLand: "", bgMarketValueBuilding: "" }));
    const body = await bodyAny(f);
    expect(body.burdenedGiftInfo.marketValueByPart).toBeUndefined();
    expect((await ok(f)).status).toBe(200);
  });
});

describe("이월과세 · 토글 C(당초 증여자가 토지·건물을 다른 날 취득) → 파트별 계산(종전 ⑧ 차단)", () => {
  /** PR-A S4와 같은 셀 — A: 토지 2000(25년) · 건물 2015(11년) · 당초 증여자 실지 5천만 · 1억 → 73,198,000 · B 0. */
  const carry = (bDate = "2015-01-01", over: Partial<AssetForm> = {}) =>
    bgAsset("converted", { donorBuilt: false }, {
      carryoverDonorSplit: true,
      ...SPLIT_MARKET,
      bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "", bgActualAcquisitionLand: "600,000,000", bgActualAcquisitionBuilding: "400,000,000",
      bgCoDonorActualAcquisitionLand: "50,000,000", bgCoDonorActualAcquisitionBuilding: "100,000,000", bgCoDonorActualAcquisitionTotal: "",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "150,000,000", giftDateValuation: "1,000,000,000", giftTaxAmount: "0", donorRelation: "lineal", donorSameHousehold: "no" },
      buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: bDate },
      ...over,
    } as Partial<AssetForm>);

  it("A 73,198,000 채택 · 본문에 건물분 증여자 취득일 · 당초 증여자 파트 실지", async () => {
    const f = bgForm(carry());
    const body = await bodyAny(f);
    expect(body.burdenedGiftInfo.carryoverDonorBasis).toMatchObject({ actualLandAcquisitionPrice: 50_000_000, actualBuildingAcquisitionPrice: 100_000_000, buildingDonorAcquisitionDate: "2015-01-01" });
    const r = await ok(f);
    expect(r.det).toBe(73_198_000);
  });

  it("⑧ — 건물분 증여자 취득일을 비우면 그 칸으로", () => {
    expect(issues(bgForm(carry("")))[0]?.field).toBe("buildingCarryover.donorAcquisitionDate");
  });
});

describe("⑫ — 화면을 거치지 않은 본문도 같은 규칙", () => {
  it("파트 평가액 합계가 시가와 다르면 400", async () => {
    const body = await bodyAny(bgForm(own()));
    const r = await post({ ...body, burdenedGiftInfo: { ...body.burdenedGiftInfo, marketValueByPart: { land: 500_000_000, building: 400_000_000 } } });
    expect(r.status).toBe(400);
    expect(r.message).toContain("합계");
  });
});
