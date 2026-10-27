/**
 * 화면 경로(폼 → ④ → route) — 토지만 본인 × 같은 세대 × 주택보다 나중에 취득한 부수토지 보유요건(G-3) · 다건 세율 기산 · 합가일 고지.
 * 계획서 `docs/02-design/features/land-only-later-land-holding.plan.md` Q-1·Q-2·Q-3 (a).
 *
 * 시료(독립 정수 산식 — 엔진 출력 복사 아님): 매매 · 양도 12억 = 토지 4.8억 + 건물 7.2억(구분 기재) · 토지 취득가액 1.2억 · 건물 1.8억
 *   주택 2015-01-01 취득 · 토지 2022-06-01 취득(「토지·건물 소유자 다름」이 별개 취득 토글도 켠다) → 2023-02-16 양도(토지 보유 8개월)
 *   토지 양도차익 = 480,000,000 − 120,000,000 = 360,000,000 → 기본공제 2,500,000 → 357,500,000 × 70%(주택부수토지 1년 미만) = 250,250,000
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE } from "@/lib/tax-engine/land-only-owner-household";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(() => vi.unstubAllGlobals());

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const ONE_HOUSE = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const PUR: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  actualSalePrice: "1,200,000,000", fixedAcquisitionPrice: "300,000,000", residenceInputMode: "direct", residencePeriods: [], ...STD,
  hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2022-06-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "120,000,000", buildingAcquisitionPrice: "180,000,000", saleSplitMode: "actual",
  landTransferPrice: "480,000,000", buildingTransferPrice: "720,000,000",
};
const LAND_ONLY_SAME = { selfOwns: "land_only", buildingOwnerSameHousehold: true };

const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...ONE_HOUSE, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: result?.calculatedTax as number | undefined,
    totalTax: result?.totalTax as number | undefined,
    isExempt: result?.isExempt as boolean | undefined,
    warnings: (result?.warnings ?? []) as string[],
    steps: ((result?.steps ?? []) as { label: string }[]).map((s) => s.label),
    body,
  };
}

/** 다건 양도 화면 — 같은 폼을 1건으로 「합산 계산」에 넣는다(클라이언트 fetch를 가로채 본문을 route에 그대로 넘긴다). */
async function runMulti(a: Loose): Promise<number> {
  const f = form(a);
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: {} }) } as Response;
  }));
  const mf = { taxYear: 2023, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  await callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await MULTI(new NextRequest("http://l/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { totalTax: number } }).data.totalTax;
}

describe("D-1 화면 경로 — 토지만 본인 × 같은 세대 × 나중 취득 토지 8개월", () => {
  it("토지분 비과세 제외 — 357,500,000 × 70% = 250,250,000(수정 전: 전액 비과세 0) · 별개 취득으로 전송", async () => {
    const r = await run({ ...PUR, ...LAND_ONLY_SAME });
    expect([r.fields, r.status, r.isExempt, r.tax]).toEqual([[], 200, false, 250_250_000]);
    expect([r.body.selfOwns, r.body.isSeparateAcquisition, r.body.landAcquisitionDate]).toEqual(["land_only", true, "2022-06-01"]);
    expect(r.steps).toContain("부수토지 비과세 제외");
    // G-3로 이미 과세됐으니 합가일 고지는 없다
    expect(r.warnings).not.toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
  });

  it("토지 보유 2년 이상(2020-06-01)이면 비과세 그대로 — 합가일 고지(Q-3 a)", async () => {
    const r = await run({ ...PUR, ...LAND_ONLY_SAME, landAcquisitionDate: "2020-06-01" });
    expect([r.fields, r.status, r.isExempt, r.tax]).toEqual([[], 200, true, 0]);
    expect(r.warnings).toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
  });

  it("소유자 같음 대조 — 같은 250,250,000 · 합가일 고지 없음", async () => {
    const r = await run(PUR);
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 250_250_000]);
    expect(r.warnings).not.toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_NOTICE);
  });
});

describe("D-2 화면 경로 — 다건 양도(합산 계산) 1건 = 단건", () => {
  it("토지만 본인 8개월 — 총세액 250,250,000 + 지방소득세 25,025,000 = 275,275,000(수정 전 다건은 주택 취득일 기준 기본세율)", async () => {
    const r = await run({ ...PUR, ...LAND_ONLY_SAME });
    expect(r.totalTax).toBe(275_275_000);
    expect(await runMulti({ ...PUR, ...LAND_ONLY_SAME })).toBe(275_275_000);
  });
});

describe("V-2 함께 양도 1세대1주택 단위 — 토지만 본인 주택 카드의 나중 취득 토지", () => {
  /** route 원시 본문 — 주택 카드: 건물 8억(취득 3억) · 자기 토지 8억(취득 4억) 200㎡ · 부수토지 카드 4억(취득 2억) 200㎡ · 2026-02-16 양도(20억 고가) */
  const houseCard = (over: Loose) => ({
    propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-02-16", acquisitionPrice: 700_000_000, acquisitionDate: "2014-01-01",
    acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 1, residencePeriodMonths: 60, isRegulatedArea: false,
    wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
    buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential", totalSalePrice: 2_000_000_000,
    standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: "2014-01-01", landAcqMode: "actual",
    buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
    landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 200, transferArea: 200,
    landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000,
    companionAssets: [{
      assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01",
      fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 200, reductions: [],
    }],
    ...over,
  });
  async function primaryCard(over: Loose) {
    const res = await postTransfer(houseCard(over));
    expect(res.status).toBe(200);
    const props = ((res.json as Loose).data?.aggregated?.properties ?? []) as { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number }[];
    return props.find((p) => p.propertyId === "primary")!;
  }

  it("토지 2025-06-01(8개월) — 주택 카드 토지분 8억 − 4억 = 4억을 12억 안분·장특 없이 전액 과세(수정 전: 안분 대상)", async () => {
    const p = await primaryCard({ landAcquisitionDate: "2025-06-01", ...LAND_ONLY_SAME });
    expect([p.transferGain, p.income, p.longTermHoldingDeduction]).toEqual([400_000_000, 400_000_000, 0]);
  });
});
