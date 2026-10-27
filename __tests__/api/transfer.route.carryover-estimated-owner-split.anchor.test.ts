/**
 * 이월과세 환산(증여자 취득가액 모름) × 소유자 분리 — 계획서 `docs/02-design/features/carryover-estimated-owner-split.plan.md`.
 *
 * 수정 전(mock 세율): 시나리오 A가 `acquisitionPrice: 0`(재환산 전제)인데 소유자 분리가 파트 방식 실가로 그 0을 안분했다 — 파트 취득가액 0 ·
 * 건물만 204,930,000 · 토지만 126,660,000(결과 화면은 환산취득가액 257,142,857을 표시). 수정: A에서 본인 파트를 환산(Q-1 ①).
 */
import { describe, expect, it, vi } from "vitest";

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
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { ownerSplitDonorEstimated } from "@/lib/calc/transfer-land-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const c0 = cAsset() as unknown as Loose;
/** 증여자 2015-06-01 취득 · 취득가액 모름(일반 환산 — 증여자 취득 당시 3억 · 양도시 14억) · 증여 등기 2023-03-01 · 평가액 9억 */
const CARRY: Loose = {
  ...c0, ...STD, carryoverDonorSplit: false, landAcquisitionPrice: "", buildingAcquisitionPrice: "", saleSplitMode: "apportioned",
  landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", acquisitionDate: "2023-03-01",
  carryover: {
    ...c0.carryover, donorAcquisitionPrice: "", useEstimatedAcquisition: true, estimationMode: "general",
    donorStandardPriceAtAcquisition: "300,000,000", donorStandardPriceAtTransfer: "1,400,000,000", giftDateValuation: "900,000,000",
  },
};
const HH = {
  transferDate: "2025-06-30", filingDate: "2025-08-31", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), { ...HH, contractTotalPrice: "1200000000", assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm] }) as TransferFormData;

async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: (r.result as Loose | undefined)?.calculatedTax as number | undefined,
    split: (r.result as Loose | undefined)?.splitDetail as Loose | undefined,
    zod: Object.keys((r.json as Loose)?.error?.fieldErrors ?? {}),
  };
}

describe("이월과세 환산 × 소유자 분리 — 시나리오 A가 본인 파트를 환산한다", () => {
  it("소유자 같음(대조) — 자산 단위 환산 276,786,000 그대로", async () => {
    const r = await run({ ...CARRY, selfOwns: "both" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 276_786_000]);
  });

  it.each([
    ["building_only", 152_360_571],
    ["land_only", 92_667_029],
  ] as const)("%s — 파트 환산·개산공제(수정 전 파트 취득가액 0)", async (owns, tax) => {
    const r = await run({ ...CARRY, selfOwns: owns });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, tax]);
    expect([r.split?.land.acqMode, r.split?.land.acquisitionPrice, r.split?.land.appraisalDeduction]).toEqual(["estimated", 102_857_142, 3_600_000]);
    expect([r.split?.building.acqMode, r.split?.building.acquisitionPrice, r.split?.building.appraisalDeduction]).toEqual(["estimated", 154_285_714, 5_400_000]);
  });

  it("개별주택가격 총액 칸은 이월과세 블록 값이 정본 — 소유자 분리 화면 총액을 비워도 ⑧ 통과 · 같은 세액(리뷰 게이트 D-2)", async () => {
    const r = await run({ ...CARRY, selfOwns: "building_only", standardPriceAtAcq: "" });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 152_360_571]);
  });

  it("증여세 상당액 2천만 — 본인 파트 양도차익에서 차감된다(건물만 145,960,571)", async () => {
    // 분리 계산을 유지하고 본인 파트 필요경비에 더한다 — 분리 상세 단언은 `transfer.route.carryover-owner-split-gift-tax.anchor.test.ts`(계획서 `carryover-owner-split-display-gift-tax.plan.md` V-5a).
    const r = await run({ ...CARRY, selfOwns: "building_only", carryover: { ...CARRY.carryover, giftTaxCalculated: "20,000,000", giftTaxAmount: "20,000,000" } });
    expect([r.fields, r.status, r.tax]).toEqual([[], 200, 145_960_571]);
  });

  it("증여자 취득가액을 알면(실가) 종전 그대로 — 건물만 145,860,000", async () => {
    const r = await run({ ...CARRY, selfOwns: "building_only", carryover: { ...CARRY.carryover, useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "300,000,000" } });
    expect([r.fields, r.status, r.tax, r.split?.building.acqMode]).toEqual([[], 200, 145_860_000, "actual"]);
  });

  it.each([
    ["양도가액 감정 안분", { saleSplitMode: "appraisal", landAppraisalAtTransfer: "500,000,000", buildingAppraisalAtTransfer: "700,000,000" }],
    ["양도가액 구분 기재", { saleSplitMode: "actual", landTransferPrice: "480,000,000", buildingTransferPrice: "720,000,000" }],
  ] as const)("%s + 양도시 파트 기준시가 없음 → ⑧·⑫ 모두 막는다(환산 분모 · 칸 있음)", async (_n, sale) => {
    const r = await run({ ...CARRY, selfOwns: "building_only", ...sale, buildingStandardPriceAtTransfer: "", standardPricePerSqmAtTransfer: "" });
    expect(r.fields).toEqual(["standardPricePerSqmAtTransfer"]);
    expect(r.status).toBe(400);
    expect(r.zod).toEqual(expect.arrayContaining(["landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"]));
  });
});

describe("비주택 건물 — 비례 안분이 없어 본인 파트 분모만 요구한다", () => {
  it("건물만 + 양도가액 감정 안분 + 건물 양도시 기준시가 없음 → ⑧·⑫ 모두 그 칸을 막는다(토지 분모는 요구하지 않는다)", async () => {
    const r = await run({ ...CARRY, assetKind: "building", standardPriceAtAcq: "600000000", selfOwns: "building_only", saleSplitMode: "appraisal", landAppraisalAtTransfer: "500,000,000", buildingAppraisalAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "" });
    expect(r.fields).toEqual(["buildingStandardPriceAtTransfer"]);
    expect([r.status, r.zod]).toEqual([400, ["buildingStandardPriceAtTransfer"]]);
  });
});

describe("함께 양도 자산(컴패니언)", () => {
  it("이월과세 환산 소유자 분리도 같은 엔진 경로 — 파트 환산·개산공제(취득가액 0이 아니다)", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      ...HH, contractTotalPrice: "1700000000",
      assets: [
        { ...makeDefaultAsset(1), ...CARRY, selfOwns: "both", actualSalePrice: "500,000,000", carryover: { ...CARRY.carryover, useEstimatedAcquisition: false, estimationMode: null, donorAcquisitionPrice: "100,000,000" } } as AssetForm,
        { ...makeDefaultAsset(2), ...CARRY, selfOwns: "building_only" } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer((await captureBody(f)) as Loose);
    const sd = (r.json as Loose)?.data?.aggregated?.properties?.[1]?.splitDetail as Loose | undefined;
    expect([allIssues(f), r.status]).toEqual([[], 200]);
    expect([sd?.building.acqMode, sd?.land.acqMode]).toEqual(["estimated", "estimated"]);
    expect(sd?.building.acquisitionPrice).toBeGreaterThan(0);
    expect(sd?.building.appraisalDeduction).toBeGreaterThan(0);
  });
});

describe("술어 범위 — 본인 소유 파트만 · 일반 환산만", () => {
  const a = { ...makeDefaultAsset(1), ...CARRY, selfOwns: "building_only" } as AssetForm;
  it("건물만 → 건물만 환산 파트", () => {
    expect(ownerSplitDonorEstimated(a)).toEqual({ land: false, building: true });
  });
  it.each([
    ["소유자 같음", { selfOwns: "both" }],
    ["증여자 취득가액 앎", { carryover: { ...CARRY.carryover, useEstimatedAcquisition: false } }],
    ["PHD 환산", { carryover: { ...CARRY.carryover, estimationMode: "phd" } }],
    ["상속", { acquisitionCause: "inheritance" }],
  ] as const)("%s → 해당 없음", (_n, over) => {
    expect(ownerSplitDonorEstimated({ ...a, ...over } as AssetForm)).toEqual({ land: false, building: false });
  });
});
