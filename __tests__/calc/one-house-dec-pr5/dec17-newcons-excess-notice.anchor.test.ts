/**
 * NBL2611-C8 — 신축 취득 주택의 배율 초과분 «초과분 미분리» 고지가 신축임을 밝히고, 초과분이 분리되는 화면 경로를 알린다 (세액 불변).
 *
 * 신축 카드는 건물 신축비용만 받는다(`CompanionAcqNewConstructionBlock` — «토지 취득가액은 별도 자산으로 입력»). 토지 취득가액·취득일이 없어
 * 분리 경로(`housingExcessSplitApplies` — 매매 요건)가 열리지 않고 비과세 + 고지로 남는다. 종전 고지는 «이 입력 조합(부담부증여·지분·…)»만 나열해
 * 신축이 왜 해당하는지·무엇을 하면 되는지 알 수 없었다(2026-11-21 실측: 단건 신축 총세액 0 · 축 B 둘째 지분 신축 2,876,500).
 *
 * | 시료 | 총세액 | 고지 |
 * |---|---|---|
 * | 신축(토지 원인 미입력) · 초과 2,700㎡ | 0 (불변) | «신축 취득은 …» + 「매매」·「토지·건물 취득일 다름」 안내 |
 * | 안내대로 — 매매 + 토지·건물 취득일 다름 | 분리됨(비사업용 파트) | 미분리 고지 없음 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";

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
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>;

// 토지 3,000㎡ / 정착 100㎡ / 수도권 주거 3배 → 초과 2,700㎡ · 1세대1주택 · 양도가액 10억(12억 이하)
const OBJECT = {
  assetKind: "housing", addressJibun: "서울 강남구 테스트동 1-1", acquisitionArea: "3000", buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential", actualSalePrice: "1,000,000,000", residenceInputMode: "direct", residencePeriodMonthsAsset: "0",
};
const NEW_CONS = { acquisitionCause: "newConstruction", acquisitionDate: "2010-03-01", occupancyApprovalDate: "2010-03-01", fixedAcquisitionPrice: "500,000,000" };
/** 안내대로 — 토지를 먼저 매매하고 건물을 신축: 매매 + 「토지·건물 취득일 다름」(건물 취득일 = 사용승인일 · 건물 취득가액 = 신축비용). */
const GUIDED = {
  acquisitionCause: "purchase", acquisitionDate: "2010-03-01", landAcquisitionDate: "2008-05-01", hasSeperateLandAcquisitionDate: true,
  landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "450,000,000", buildingAcquisitionPrice: "50,000,000",
  saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "300,000,000",
  landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "300,000,000",
};
const form = (over: Record<string, unknown>) =>
  ({
    ...createDefaultTransferFormData(), transferDate: "2024-09-01", contractTotalPrice: "1000000000", isOneHousehold: true, householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, residencePeriodMonths: "0",
    assets: [{ ...makeDefaultAsset(1), ...OBJECT, ...over } as unknown as AssetForm],
  }) as never;
const warningsOf = (r: Loose): string[] => (r.result?.warnings ?? r.json?.data?.aggregated?.warnings ?? []) as string[];
const UNSEPARATED = /초과분 미분리/;
const NEW_CONS_TEXT = /신축 취득은 건물 신축비용만 입력받아 토지 취득가액·취득일이 없으므로/;
const GUIDE_TEXT = /취득원인 「매매」에서 「토지·건물 취득일 다름」을 켜고/;

describe("NBL2611-C8 — 신축 주택 배율 초과분 «미분리» 고지", () => {
  it("🔑 신축(토지 원인 미입력): 총세액 0 불변 · 고지가 신축임을 밝히고 분리 경로를 안내한다 · 종전 «이 입력 조합» 나열은 쓰지 않는다", async () => {
    const r = (await runCalc(form(NEW_CONS))) as Loose;
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(0);
    const w = warningsOf(r).filter((x) => UNSEPARATED.test(x));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(NEW_CONS_TEXT);
    expect(w[0]).toMatch(GUIDE_TEXT);
    expect(w[0]).toMatch(/2700\.00㎡/);
    expect(w[0]).not.toMatch(/이 입력 조합/);
  });

  it("🔑 안내대로 입력하면(매매 + 토지·건물 취득일 다름) 초과분이 분리된다 — 고지의 약속이 실제 경로와 맞는다", async () => {
    const r = (await runCalc(form(GUIDED))) as Loose;
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeTruthy();
    expect(r.result.totalTax).toBeGreaterThan(0);
    expect(warningsOf(r).some((x) => UNSEPARATED.test(x))).toBe(false);
  });

  it("대조 — 매매 같은 날 취득 범위 밖 조합(지분)의 고지는 종전 문구 그대로다", async () => {
    const r = (await runCalc(form({ acquisitionCause: "purchase", acquisitionDate: "2010-03-01", fixedAcquisitionPrice: "500,000,000", ownershipNumerator: "50", ownershipDenominator: "100" }))) as Loose;
    const w = warningsOf(r).filter((x) => UNSEPARATED.test(x));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/이 입력 조합\(부담부증여·지분·/);
    expect(w[0]).not.toMatch(NEW_CONS_TEXT);
  });
});
