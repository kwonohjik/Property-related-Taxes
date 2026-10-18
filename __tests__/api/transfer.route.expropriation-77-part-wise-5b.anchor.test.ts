/**
 * 5B — 토지·건물을 따로 취득한 자산의 조특법 §77① 「사업인정고시일부터 소급하여 2년 이전에 취득한 토지등」 요건을
 * 파트별로 판정한다(2026-10-11 사용자 결정 — 정면 해석례 없음, 확인 필요 고지).
 *
 * 종전에는 건물 취득일 하나로 자산 전체를 판정해 「건물만 충족」이면 토지분까지 감면(14,259,000),
 * 「토지만 충족」이면 전부 불성립(0)이었다(재실측 B-5 B1·B3). 이제 충족한 파트의 양도소득금액만 감면대상이고,
 * 기본공제는 감면이 없는 파트에서 먼저 공제한다(「소득세법」 §103②). route 경유(④ → ⑫ → ⑭ → 엔진).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildPublicExpropriationParts } from "@/lib/tax-engine/public-expropriation-reduction";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer-split-gain.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 2주택(비과세 없음) · 토지 300→500 · 건물 150→300 · 양도 2026-06-30 · 사업인정고시 2025-06-01(소급 2년 = 2023-06-01) */
const house = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-02",
    landAcquisitionCause: "purchase",
    landCauseHost: "purchase",
    landAcquisitionDate: "2024-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "150,000,000",
    actualSalePrice: "800,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "500,000,000",
    buildingTransferPrice: "300,000,000",
    landStandardPriceAtTransfer: "500,000,000",
    buildingStandardPriceAtTransfer: "300,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100000",
    ...over,
  }) as AssetForm;

const form = (a: AssetForm, over: Partial<TransferFormData> = {}): TransferFormData =>
  ({
    transferDate: "2026-06-30", filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), bundledSaleMode: "actual",
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;

const PE = {
  reductions: [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2025-06-01" }],
  isOneHousehold: false, householdHousingCount: 2, transferCause: "public_expropriation",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(f: TransferFormData, extra: Record<string, unknown> = PE): Promise<any> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const body = {
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
    annualBasicDeductionUsed: 0, ...cap.body, residencePeriodMonths: 0, ...extra,
  };
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const j = await res.json();
  expect(res.status, JSON.stringify(j).slice(0, 600)).toBe(200);
  return j.data.result;
}

const NOTICE = "파트별로 적용한 정면 해석례는 확인하지 못했습니다";
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes(NOTICE));

describe("5B — §77 「소급 2년 이전 취득」 요건 파트별 판정", () => {
  it("건물 충족(2010) · 토지 미충족(2024-01-10) → 건물분 양도소득금액만 감면대상, 기본공제는 토지분에서 먼저", async () => {
    const r = await run(form(house()));
    const d = r.publicExpropriationDetail;
    expect(d.isEligible).toBe(true);
    expect(d.partWise).toEqual({ eligiblePart: "building", eligibleIncome: 105_000_000, excludedIncome: 200_000_000, basicDeductionOnExcluded: 2_500_000 });
    expect(d.breakdown.basicDeductionOnCash).toBe(0);
    // 95,060,000 × (105,000,000 × 15%) / 302,500,000 = 4,949,404 (종전 14,259,000 — 토지분까지 감면)
    expect(r.reductionAmount).toBe(4_949_404);
    expect(hasNotice(r)).toBe(true);
  }, 60_000);

  it("건물 미충족(2024-01-10) · 토지 충족(2010) → 토지분만 감면(종전 0)", async () => {
    const r = await run(form(house({ acquisitionDate: "2024-01-10", landAcquisitionDate: "2010-03-02" })));
    const d = r.publicExpropriationDetail;
    expect(d.isEligible).toBe(true);
    expect(d.partWise).toEqual({ eligiblePart: "land", eligibleIncome: 140_000_000, excludedIncome: 150_000_000, basicDeductionOnExcluded: 2_500_000 });
    // 89,310,000 × (140,000,000 × 15%) / 287,500,000 = 6,523,513
    expect(r.reductionAmount).toBe(6_523_513);
    expect(hasNotice(r)).toBe(true);
  }, 60_000);

  it("대조: 두 파트 모두 충족 → 자산 전체 감면(종전 값 그대로), 파트별 표시·고지 없음", async () => {
    const r = await run(form(house({ landAcquisitionDate: "2012-01-10" })));
    expect(r.publicExpropriationDetail.partWise).toBeUndefined();
    expect(r.reductionAmount).toBe(11_059_500);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("두 파트 모두 미충족 → 감면 불성립", async () => {
    const r = await run(form(house({ acquisitionDate: "2024-01-10", landAcquisitionDate: "2024-02-10" })));
    expect(r.publicExpropriationDetail.isEligible).toBe(false);
    expect(r.publicExpropriationDetail.notEligibleReason).toContain("소급 2년 이전에 취득한 토지등이 아닙니다");
    expect(r.reductionAmount).toBe(0);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("경계: 토지를 소급 2년 되는 날(2023-06-01) 취득 → 충족(자산 전체), 하루 뒤(2023-06-02) → 파트별", async () => {
    const on = await run(form(house({ landAcquisitionDate: "2023-06-01" })));
    expect(on.publicExpropriationDetail.partWise).toBeUndefined();
    expect(on.reductionAmount).toBe(13_567_500);
    const after = await run(form(house({ landAcquisitionDate: "2023-06-02" })));
    expect(after.publicExpropriationDetail.partWise?.eligiblePart).toBe("building");
    expect(after.reductionAmount).toBe(4_903_915);
  }, 60_000);

  it("감면 제외분 소득(1,000,000)이 기본공제보다 작으면 그만큼만 먼저 공제하고 나머지는 감면대상분에서", async () => {
    const r = await run(form(house({ landAcquisitionPrice: "499,000,000" })));
    const d = r.publicExpropriationDetail;
    expect(d.partWise).toEqual({ eligiblePart: "building", eligibleIncome: 105_000_000, excludedIncome: 1_000_000, basicDeductionOnExcluded: 1_000_000 });
    expect(d.breakdown.basicDeductionOnCash).toBe(1_500_000);
    // 20,785,000 × ((105,000,000 − 1,500,000) × 15%) / 103,500,000 = 3,117,750
    expect(r.reductionAmount).toBe(3_117_750);
  }, 60_000);

  it("대조: 토지 취득일을 따로 입력하지 않은 자산 → 종전 자산 단위 판정 그대로", async () => {
    const r = await run(form(house({ hasSeperateLandAcquisitionDate: false, landAcquisitionDate: "" } as Partial<AssetForm>)));
    expect(r.publicExpropriationDetail.partWise).toBeUndefined();
    expect(r.reductionAmount).toBe(29_731_500);
    expect(hasNotice(r)).toBe(false);
  }, 60_000);

  it("1세대1주택 고가주택(16억) — 파트 소득은 고가주택 안분 **후** 과세 양도차익 기준", async () => {
    const a = house({
      actualSalePrice: "1,600,000,000", landTransferPrice: "1,000,000,000", buildingTransferPrice: "600,000,000",
      landStandardPriceAtTransfer: "1,000,000,000", buildingStandardPriceAtTransfer: "600,000,000",
    });
    const r = await run(form(a, { householdHousingCount: "1", isOneHousehold: true } as Partial<TransferFormData>), { ...PE, isOneHousehold: true, householdHousingCount: 1 });
    expect(r.isPartialExempt).toBe(true);
    // 건물분 = 450,000,000 × (16억 − 12억)/16억 − 장특 33,750,000 = 78,750,000
    expect(r.publicExpropriationDetail.partWise).toEqual({ eligiblePart: "building", eligibleIncome: 78_750_000, excludedIncome: 175_000_000, basicDeductionOnExcluded: 2_500_000 });
    // 75,535,000 × (78,750,000 × 15%) / 251,250,000 = 3,551,272
    expect(r.reductionAmount).toBe(3_551_272);
  }, 60_000);

  it("감면 제외 파트가 차손이면 감면대상은 자산 양도소득금액을 넘지 않는다", async () => {
    const r = await run(form(house({ landAcquisitionPrice: "600,000,000" })));
    // 토지 −100,000,000 + 건물 105,000,000 = 자산 양도소득금액 5,000,000
    expect(r.publicExpropriationDetail.partWise).toEqual({ eligiblePart: "building", eligibleIncome: 5_000_000, excludedIncome: 0, basicDeductionOnExcluded: 0 });
    // 150,000 × ((5,000,000 − 2,500,000) × 15%) / 2,500,000 = 22,500
    expect(r.reductionAmount).toBe(22_500);
  }, 60_000);
});

describe("5B — 파트 입력 게이트 (`buildPublicExpropriationParts`)", () => {
  const part = (gain: number, lthd: number) => ({ gain, longTermDeduction: lthd }) as SplitGainResult["land"];
  const split = { land: part(200_000_000, 0), building: part(150_000_000, 45_000_000) } as SplitGainResult;
  const d = (s: string) => new Date(s);
  const ok = { isSeparateAcquisition: true, landAcquisitionDate: d("2024-01-10"), acquisitionDate: d("2010-03-02"), selfOwns: "both" as const, transferDate: d("2026-06-30") };

  it("별개취득 · 둘 다 본인 소유 → 파트 입력(양도소득금액 = 과세 양도차익 − 장특)", () => {
    expect(buildPublicExpropriationParts(ok, split)).toEqual({
      land: { acquisitionDate: d("2024-01-10"), income: 200_000_000 },
      building: { acquisitionDate: d("2010-03-02"), income: 105_000_000 },
    });
  });
  it("별개취득이 아니면 만들지 않는다(종전 자산 단위 판정)", () => {
    expect(buildPublicExpropriationParts({ ...ok, isSeparateAcquisition: false }, split)).toBeUndefined();
  });
  it("한 파트만 본인 소유면 만들지 않는다", () => {
    expect(buildPublicExpropriationParts({ ...ok, selfOwns: "building_only" }, split)).toBeUndefined();
  });
});
