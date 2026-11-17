/**
 * 비주택 → 주택 용도변경(§95⑤) × 토지·건물 분리 계산 — 빈틈없이 막는다(엔진·⑫·⑧ 같은 사실 · 사용자 결정 2026-11-17).
 *
 * 엔진은 토지 취득일이 오면 나눠 계산하고(`calcSplitGain`) 그 경로에서 §95⑤를 건너뛴다(`transfer-tax-lthd.ts` `!splitDetail`).
 * 수정 전 실측(건물 2010-03-01 · 주거용 사용 2020-01-01 · 거주 60개월 · 2025-01-15 · 20억):
 *   · 분리 없음 + 용도변경: §95⑤ 58% · 47,245,000 (정상)
 *   · API 같은 날 분리 입력 + 용도변경: 200 · 60% · 43,901,000 (용도변경 무시)
 *   · API 토지 나중 + 용도변경: 200 · 용도변경 없을 때와 같은 67,309,000
 *   · 화면 증여 소유자 분리(토지만 본인) + 용도변경: ⑧ C-19 없음 · 200 · 토지 60%
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md (PR-2 남은 한계 — 용도변경 × 토지 별개 취득).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, postTransfer } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE } from "@/lib/tax-engine/usage-conversion-split-scope";
import { usageConversionSplitConflict } from "@/lib/tax-engine/usage-conversion-split-scope";
import { baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const CONV_WIRE = { nonHousingToHousingConversion: { residentialUseStartDate: "2020-01-01", residenceMonthsTrimmed: 0 } };
const WIRE: Loose = {
  propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 2_000_000_000, transferDate: "2025-01-15", acquisitionDate: "2010-03-01",
  acquisitionPrice: 1_000_000_000, expenses: 0, isOneHousehold: true, householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, residencePeriodMonths: 60, annualBasicDeductionUsed: 0,
};
const SPLIT_WIRE: Loose = {
  acquisitionPrice: 0, landAcquisitionDate: "2020-03-01", isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
  landTransferPrice: 1_400_000_000, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: 1_400_000_000, buildingStandardPriceAtTransfer: 600_000_000,
  landAcquisitionPrice: 900_000_000, buildingAcquisitionPrice: 100_000_000,
};
const msgs = (j: Loose) => JSON.stringify(j?.error ?? {});

describe("⑫ API 직접 — 분리 계산(토지 취득일) + 용도변경 = 400", () => {
  it("🔑 토지 나중·같은 날 모두 400 (수정 전 200 · 용도변경 무시 67,309,000 · 43,901,000)", async () => {
    for (const land of ["2020-03-01", "2010-03-01"]) {
      const r = await postTransfer({ ...WIRE, ...SPLIT_WIRE, landAcquisitionDate: land, ...CONV_WIRE });
      expect(r.status, land).toBe(400);
      expect(msgs(r.json as Loose), land).toContain(USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE);
    }
  });

  it("⑫ 자체 — 엔진에 닿기 전 스키마가 막는다(단건 · 다건 property 같은 refine)", () => {
    const issueAt = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
      (r.error?.issues ?? []).filter((i) => i.path.join(".") === "nonHousingToHousingConversion").map((i) => i.message);
    expect(issueAt(propertySchema.safeParse({ ...WIRE, ...SPLIT_WIRE, ...CONV_WIRE }))).toEqual([USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE]);
    expect(issueAt(propertyItemSchema.safeParse({ propertyId: "p1", propertyLabel: "p1", ...WIRE, ...SPLIT_WIRE, ...CONV_WIRE }))).toEqual([USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE]);
    expect(issueAt(propertySchema.safeParse({ ...WIRE, ...CONV_WIRE }))).toEqual([]);
  });

  it("짝 — 분리 없이 용도변경은 §95⑤ 그대로(58% · 47,245,000) · 분리만은 그대로 200", async () => {
    const c = await postTransfer({ ...WIRE, ...CONV_WIRE });
    expect(c.status).toBe(200);
    const res = (c.json as Loose).data.result;
    expect(res.usageConversionDetail).toBeDefined();
    expect(res.longTermHoldingRate).toBeCloseTo(0.58, 10);
    expect(res.totalTax).toBe(47_245_000);
    expect((await postTransfer({ ...WIRE, ...SPLIT_WIRE })).status).toBe(200);
  });
});

describe("엔진 입구 — calcSplitGain이 같은 leaf로 throw (⑫를 거치지 않는 직접 호출)", () => {
  it("분리 입력 + 용도변경이면 INVALID_INPUT · 메시지 같음", () => {
    const D = (s: string) => new Date(`${s}T00:00:00Z`);
    const input = baseTransferInput({
      propertyType: "housing", transferPrice: 2_000_000_000, acquisitionPrice: 1_000_000_000, acquisitionDate: D("2010-03-01"), landAcquisitionDate: D("2010-03-01"),
      transferDate: D("2025-01-15"), residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1,
      nonHousingToHousingConversion: { residentialUseStartDate: D("2020-01-01"), residenceMonthsTrimmed: 0 },
    } as never);
    expect(() => calculateTransferTax(input, makeMockRates() as never)).toThrow(USAGE_CONVERSION_SPLIT_UNSUPPORTED_MESSAGE);
  });

  it("leaf — 주택·건물만 · 둘 다 있어야 true", () => {
    expect(usageConversionSplitConflict({ propertyType: "housing", nonHousingToHousingConversion: {}, landAcquisitionDate: "2010-01-01" })).toBe(true);
    expect(usageConversionSplitConflict({ propertyType: "building", nonHousingToHousingConversion: {}, landAcquisitionDate: "2010-01-01" })).toBe(true);
    expect(usageConversionSplitConflict({ propertyType: "housing", nonHousingToHousingConversion: {} })).toBe(false);
    expect(usageConversionSplitConflict({ propertyType: "housing", landAcquisitionDate: "2010-01-01" })).toBe(false);
    expect(usageConversionSplitConflict({ propertyType: "land", nonHousingToHousingConversion: {}, landAcquisitionDate: "2010-01-01" })).toBe(false);
  });
});

describe("⑧ ≡ ④ — 화면에서 토지 취득일이 실리면 ⑧ C-19가 막고 ⑫도 400 (3중 패턴 격자)", () => {
  const base: Loose = {
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2010-03-01",
    fixedAcquisitionPrice: "1,000,000,000", actualSalePrice: "2,000,000,000", standardPriceAtTransfer: "2,000,000,000",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "60", hasNonHousingConversion: true, residentialUseStartDate: "2020-01-01",
  };
  const splitParts: Loose = {
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "900,000,000", buildingAcquisitionPrice: "100,000,000", saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000", buildingTransferPrice: "600,000,000", landStandardPriceAtTransfer: "1,400,000,000", buildingStandardPriceAtTransfer: "600,000,000",
  };
  const giftOwnerSplit: Loose = {
    acquisitionCause: "gift", selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, standardPriceAtAcq: "500000000",
    standardPricePerSqmAtAcq: "1000000", acquisitionArea: "200", buildingStandardPriceAtAcq: "100000000", landStandardPriceAtTransfer: "1400000000", buildingStandardPriceAtTransfer: "600000000",
  };
  const form = (a: Loose) =>
    ({
      ...createDefaultTransferFormData(), transferDate: "2025-01-15", filingDate: "2025-03-31", contractTotalPrice: "2000000000", isOneHousehold: true, householdHousingCount: "1",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0", assets: [{ ...base, ...a }],
    }) as never;
  const C19 = "토지·건물을 나눠 계산하는 자산";
  const cells: [string, Loose, boolean][] = [
    ["용도변경만", {}, false],
    ["별개 취득 토글(토지 나중)", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-03-01", ...splitParts }, true],
    ["매수 토지만 본인(토글 없이 토지 취득일)", { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false, landAcquisitionDate: "2020-03-01", ...splitParts }, true],
    ["🔑 증여 소유자 분리(토지만 본인) — 수정 전 ⑧ 통과 · 토지 60%", giftOwnerSplit, true],
  ];
  for (const [name, a, blocked] of cells)
    it(name, async () => {
      const r = await runCalc(form(a));
      const c19 = (r.issues as { message: string }[]).some((i) => i.message.includes(C19));
      expect(c19, name).toBe(blocked);
      expect("landAcquisitionDate" in (r.body as Loose), name).toBe(blocked); // ⑧ 판정 ⇔ ④가 토지 취득일을 싣는다
      if (blocked) expect(r.status, name).toBe(400);
    });
});
