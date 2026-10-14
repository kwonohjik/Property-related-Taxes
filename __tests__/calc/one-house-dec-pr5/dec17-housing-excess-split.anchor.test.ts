/**
 * #17 (S08-1) — 토지·건물을 **같은 날** 함께 산 주택의 배율 초과 부수토지를 비과세에서 빼고 비사업용 토지로 분리 과세한다.
 *
 * 폼 → ④ → ⑧ → ⑫ → ⑭ → 엔진. 시료: 매매 취득 2012-01-02(총 5억) · 양도 2026-02-16 · 양도가 10억 · 토지 500㎡ · 정착면적 100㎡ ·
 * 수도권 주거지역(배율 3배 → 한도 300㎡ · 초과 200㎡) · 거주 120개월.
 *
 *   기준시가(취득시): 개별주택가격 3억 · ㎡당 공시지가 40만원(토지 2억) · 건물 1.5억  → 토지 : 건물 = 4 : 3 … 이 시료는 위 값 그대로
 *   기준시가(양도시): ㎡당 공시지가 80만원(토지 4억) · 건물 4억
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 5칸 입력 | 총세액 0 (초과분까지 1세대1주택 비과세 · 고지 없음) | 비사업용 토지 초과분 과세 |
 * | 5칸 중 하나 미입력 | 통과(총세액 0) | ⑧이 입력칸으로 차단 / API 직접 호출은 400 |
 * | 소재지 구분 미선택(면적 > 정착면적 3배) | 통과(총세액 0) | ⑧이 소재지 구분 차단 |
 * | 면적이 한도 이내 | 0 | 0 (불변 · 카드 없음) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

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
import { housingExcessAreaOfAsset, housingExcessNeedsLandSplit, housingExcessZonePending } from "@/lib/calc/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE_OVER: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  actualSalePrice: "1000000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
};
const FIVE: Record<string, unknown> = {
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};

function formWith(assetOver: Record<string, unknown> = {}) {
  const f = createDefaultTransferFormData();
  const house = { ...makeDefaultAsset(1), ...HOUSE_OVER, ...assetOver } as unknown as AssetForm;
  return {
    ...f,
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets: [house],
  } as never;
}
const issuesText = (r: Awaited<ReturnType<typeof runCalc>>) => JSON.stringify(r.issues);

describe("#17 같은 날 취득 주택 — 배율 초과분 분리", () => {
  it("5칸 입력 → 초과 200㎡가 비사업용 토지로 분리 과세 (수정 전 총세액 0 — 초과분까지 비과세)", async () => {
    const r = await runCalc(formWith(FIVE));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    // ④가 분리 축을 싣는다 — 별개취득이 아니다(두 취득일이 같다)
    expect(r.body.landAcquisitionDate).toBe("2012-01-02");
    expect(r.body.isSeparateAcquisition).toBe(false);
    expect(r.body.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    const nbl = r.result.splitDetail?.nonBusinessLandPart;
    expect(nbl).toMatchObject({ limitArea: 300, excessArea: 200, appliedMultiplier: 3 });
    expect(r.result.totalTax).toBeGreaterThan(0);
    // 주택 + 한도 내 토지는 12억 이하라 비과세, 세액은 초과분(비사업용 토지)에서만 나온다
    expect(r.result.splitDetail.land.gain).toBeGreaterThan(nbl.gain);
  });

  it("긍정 짝 — 면적이 한도 이내(250㎡ ≤ 300㎡)면 카드·분리 없이 종전과 같다 (총세액 0)", async () => {
    const over = { acquisitionArea: "250", transferArea: "250" };
    const r = await runCalc(formWith(over));
    expect(r.issues).toEqual([]);
    expect(r.body.landAcquisitionDate).toBeUndefined();
    expect(r.result.totalTax).toBe(0);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
  });

  it.each([
    ["standardPriceAtAcq", "취득 당시 개별주택가격"],
    ["standardPricePerSqmAtAcq", "취득 당시 ㎡당 개별공시지가"],
    ["buildingStandardPriceAtAcq", "취득 당시 건물 기준시가"],
    ["standardPricePerSqmAtTransfer", "양도 당시 ㎡당 개별공시지가"],
    ["buildingStandardPriceAtTransfer", "양도 당시 건물 기준시가"],
  ])("5칸 중 %s 미입력 → ⑧이 그 입력칸으로 차단", async (field, text) => {
    const r = await runCalc(formWith({ ...FIVE, [field]: "" }));
    const hit = r.issues.find((i) => i.message.includes("배율 한도를") && i.message.includes(text));
    expect(hit, issuesText(r)).toBeDefined();
    expect(hit!.field).toBe(field);
  });

  it("API 직접 호출 — 5칸이 없으면 엔진이 400으로 막는다 (초과분이 조용히 비과세로 새지 않는다)", async () => {
    const r = await runCalc(formWith({}));
    expect(r.issues.length).toBeGreaterThan(0); // ⑧이 먼저 막는다 — 본문은 그래도 route로 보내 본다
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.json)).toContain("기준시가");
  });

  it("소재지 구분 미선택 + 면적 > 정착면적 3배 → ⑧이 소재지 구분을 요구 (미입력 fallback 금지)", async () => {
    const r = await runCalc(formWith({ ...FIVE, appurtenantLandZone: undefined }));
    const hit = r.issues.find((i) => i.field === "appurtenantLandZone");
    expect(hit, issuesText(r)).toBeDefined();
  });

  it("배율은 양도일 연혁 — 2021 양도(도시지역 일률 5배 → 한도 500㎡)면 500㎡는 한도 이내라 카드 없음", async () => {
    const f = formWith({}) as { transferDate: string };
    f.transferDate = "2021-12-31";
    const r = await runCalc(f as never);
    expect(r.issues.some((i) => i.message.includes("배율 한도를"))).toBe(false);
  });
});

describe("#17 술어 — 분리 경로 대상 여부 (노출 ⇔ 필수 ⇔ 전송 ⇔ 엔진이 같은 값)", () => {
  const asset = (over: Record<string, unknown> = {}) =>
    ({ ...makeDefaultAsset(1), ...HOUSE_OVER, ...over }) as unknown as AssetForm;

  it("기본 시료 → 대상, 초과 200㎡", () => {
    expect(housingExcessNeedsLandSplit(asset(), TD)).toBe(true);
    expect(housingExcessAreaOfAsset(asset(), TD)).toBe(200);
  });
  it.each([
    ["양도일 없음", () => housingExcessNeedsLandSplit(asset(), undefined)],
    ["상속 취득", () => housingExcessNeedsLandSplit(asset({ acquisitionCause: "inheritance" }), TD)],
    ["소유자 분리(건물만 보유)", () => housingExcessNeedsLandSplit(asset({ selfOwns: "building_only" }), TD)],
    ["겸용주택", () => housingExcessNeedsLandSplit(asset({ isMixedUseHouse: true }), TD)],
    ["부담부증여", () => housingExcessNeedsLandSplit(asset({ transferType: "burdened_gift" }), TD)],
    ["지분 양도(1/2)", () => housingExcessNeedsLandSplit(asset({ ownershipNumerator: "1", ownershipDenominator: "2" }), TD)],
    // 환산·감정·매매사례 단독은 #17-4로 대상이 됐다(`dec17-housing-excess-b2.anchor.test.ts`) — 환산 + 공익수용만 남는다
    ["환산 + 공익수용", () => housingExcessNeedsLandSplit(asset({ useEstimatedAcquisition: true, transferCause: "public_expropriation" }), TD)],
    ["토지 취득일 별도(별개취득) — 기존 경로", () => housingExcessNeedsLandSplit(asset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2011-06-01" }), TD)],
    ["면적 한도 이내", () => housingExcessNeedsLandSplit(asset({ acquisitionArea: "300", transferArea: "300" }), TD)],
    ["소재지 구분 없음", () => housingExcessNeedsLandSplit(asset({ appurtenantLandZone: undefined }), TD)],
  ])("대상 아님 — %s", (_n, fn) => {
    expect(fn()).toBe(false);
  });
  it("소재지 구분이 비었고 면적 > 정착면적 3배 → 소재지 구분 요구(pending) / 3배 이하면 요구 없음", () => {
    expect(housingExcessZonePending(asset({ appurtenantLandZone: undefined }))).toBe(true);
    expect(housingExcessZonePending(asset({ appurtenantLandZone: undefined, acquisitionArea: "300", transferArea: "300" }))).toBe(false);
    expect(housingExcessZonePending(asset())).toBe(false);
  });
});

describe("#17 엔진 직접 호출 — 마지막 방어선과 고지", () => {
  const rates = makeMockRates();
  const base = {
    propertyType: "housing" as const, transferPrice: 1_000_000_000, transferDate: new Date(TD),
    acquisitionDate: new Date("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
    isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
    buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential" as const,
  };
  const split = {
    landAcquisitionDate: new Date("2012-01-02"),
    standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000, buildingStandardPriceAtAcquisition: 150_000_000,
    landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
  };

  it("구분 근거(기준시가)가 없으면 계산하지 않는다 — 초과분이 조용히 비과세로 새지 않는다", () => {
    expect(() => calculateTransferTax(baseTransferInput(base), rates)).toThrow(/기준시가/);
  });

  it("긍정 짝 — 같은 입력에 기준시가를 주면 초과 200㎡가 비사업용 토지로 분리된다 (토지 차익 214,285,715 중 85,714,286 · 총세액 9,296,570)", () => {
    const r = calculateTransferTax(baseTransferInput({ ...base, ...split }), rates);
    expect(r.splitDetail?.nonBusinessLandPart).toMatchObject({ limitArea: 300, excessArea: 200, gain: 85_714_286 });
    expect(r.splitDetail?.land.gain).toBe(214_285_715);
    expect(r.totalTax).toBe(9_296_570);
    expect((r.warnings ?? []).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });

  it("입력 경로가 없는 조합(상속 취득)은 막지 않고 비과세를 유지하되 «초과분 미분리» 고지", () => {
    const r = calculateTransferTax(baseTransferInput({ ...base, acquisitionCause: "inheritance" as const }), rates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect((r.warnings ?? []).some((w) => w.includes("초과분 미분리") && w.includes("확인이 필요합니다"))).toBe(true);
  });

  it("소재지 구분이 없고 면적 > 정착면적 3배 → 배율 판정을 하지 않았다는 확인 필요 고지 (대조: 3배 이하면 고지 없음)", () => {
    const noZone = calculateTransferTax(baseTransferInput({ ...base, appurtenantLandZone: undefined }), rates);
    expect((noZone.warnings ?? []).some((w) => w.includes("소재지 구분이 없어 배율 한도"))).toBe(true);
    const small = calculateTransferTax(baseTransferInput({ ...base, appurtenantLandZone: undefined, acquisitionArea: 250 }), rates);
    expect((small.warnings ?? []).some((w) => w.includes("소재지 구분이 없어 배율 한도"))).toBe(false);
  });

  it("하위 1 가 → #17-2 — 고가주택(12억 초과)에 초과분이 함께 있으면 재산세제과-915 회신 방식 고지(불확실 표현 없음), 12억 이하면 없다", () => {
    const high = calculateTransferTax(baseTransferInput({ ...base, ...split, transferPrice: 2_000_000_000 }), rates);
    expect(high.isPartialExempt).toBe(true);
    const w = (high.warnings ?? []).find((x) => x.includes("고가주택에 배율 초과 부수토지"));
    expect(w).toContain("재산세제과-915");
    expect(w).not.toContain("확인이 필요");
    const low = calculateTransferTax(baseTransferInput({ ...base, ...split }), rates);
    expect((low.warnings ?? []).some((w) => w.includes("고가주택에 배율 초과 부수토지"))).toBe(false);
  });
});
