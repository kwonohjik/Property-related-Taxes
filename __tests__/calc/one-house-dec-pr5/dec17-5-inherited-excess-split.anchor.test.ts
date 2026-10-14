/**
 * #17-5 ② — 개별주택가격(보충적 평가)으로 평가한 **상속·증여 주택**의 배율 초과 부수토지 분리.
 *
 * 종전: 취득가액이 상증 평가액 하나라 토지·건물로 나눌 입력 경로가 없다는 이유로 «막지도 계산하지도 않고» 비과세 + «초과분 미분리» 고지였다.
 * 지금: 평가액(= 개별주택가격 합계)을 「건물 기준시가 · 토지 개별공시지가」 비율로 나눠 초과분을 비사업용 토지로 분리한다 — 서면인터넷방문상담4팀-688(2006.3.23.,
 * 상증법 §61①4호: 개별주택가격으로 평가한 주택과 부수토지의 가액을 구분하려면 건물 기준시가와 토지 개별공시지가로 안분). 소득세법 시행령 §166⑥ 준용의 직접 근거는
 * 없으므로 결과에 «확인 필요» 고지를 단다. 시가·감정·공매·공동주택가격·의제취득일 전·2005-04-30 전·가업상속은 근거가 없어 종전대로(비과세 + 고지).
 *
 * ## 시료 — 상속개시 2012-01-02 · 피상속인 취득 2005-06-01 · 양도 2026-02-16 · 양도가 10억 · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거(한도 300㎡ · 초과 200㎡)
 * 평가액(개별주택가격) 3억 · 취득시 ㎡당 40만원(토지 기준시가 2억) · 건물 기준시가 1.5억 / 양도시 ㎡당 80만원(토지 4억) · 건물 4억 · 거주 120개월.
 *
 * | 값 | 산식 | 결과 |
 * |---|---|---|
 * | 토지분 취득가액 | floor(3억 × 2억/3.5억) | 171,428,571 |
 * | 토지분 양도가액 | 10억 × 4억/8억 | 500,000,000 |
 * | 토지 양도차익 | 500,000,000 − 171,428,571 (실가 — 개산공제 없음) | 328,571,429 |
 * | 초과분 양도차익 | floor(328,571,429 × 200/500) | 131,428,571 |
 * | 장특(표1 — 상속개시일부터 14년 × 2% = 28%) | floor(131,428,571 × 0.28) | 36,799,999 |
 * | 과세표준 | 131,428,571 − 36,799,999 − 2,500,000 | 92,128,572 |
 * | 산출세액(상속개시 2012-01-02는 중과 유예 취득기간(2009.3.16.~2012.12.31.) 안이라 기본세율, 8,800만 초과 35% · 누진공제 1,544만) | floor(92,128,572 × 0.35) − 15,440,000 | 16,805,000 |
 * | 지방소득세 · 총세액 | 16,805,000 × 10% → | 18,485,500 |
 *
 * 장특 기산: 상속 자산의 장기보유특별공제 보유기간은 상속개시일부터다(§95④ — 피상속인 취득일 통산은 가업상속 비율분 한정, `transfer-tax-lthd.ts`). 세율 보유기간만 §104②1호로 피상속인 취득일 통산.
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

const TD = "2026-02-16";
// ── 독립 기대값 ────────────────────────────────────────────────────────────────────────
const LAND_ACQ = Math.floor((300_000_000 * 200_000_000) / 350_000_000); // 171,428,571
const LAND_GAIN = 500_000_000 - LAND_ACQ; // 328,571,429
const NBL_GAIN = Math.floor(LAND_GAIN * 0.4); // 131,428,571 — 200/500
const LTD = Math.floor(NBL_GAIN * 0.28); // 36,799,999
const BASE = NBL_GAIN - LTD - 2_500_000; // 92,128,572
const INCOME_TAX = Math.floor(BASE * 0.35) - 15_440_000;
const TOTAL_TAX = INCOME_TAX + Math.floor(INCOME_TAX * 0.1);

const FIVE: Record<string, unknown> = {
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionDate: "2012-01-02",
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
  ...FIVE,
};
const INHERIT: Record<string, unknown> = {
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2005-06-01",
  inheritanceStartDate: "2012-01-02",
  inheritanceAssetKind: "house_individual",
  inheritanceValuationMethod: "supplementary",
  publishedValueAtInheritance: "300000000",
};
const GIFT: Record<string, unknown> = {
  acquisitionCause: "gift",
  donorAcquisitionDate: "2005-06-01",
  inheritanceStartDate: "2012-01-02",
  inheritanceAssetKind: "house_individual",
  inheritanceValuationMethod: "supplementary",
  fixedAcquisitionPrice: "300000000",
};
const asset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as unknown as AssetForm;
const single = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets: [asset(over)],
  }) as never;
const warningsOf = (r: Awaited<ReturnType<typeof runCalc>>): string[] => (r.result?.warnings ?? []) as string[];
const unseparated = (ws: string[]) => ws.some((w) => w.includes("초과분 미분리"));
const inheritedNotice = (ws: string[]) => ws.some((w) => w.includes("서면인터넷방문상담4팀-688") && w.includes("확인이 필요합니다"));

describe("#17-5 ② 기대값 유도 sanity", () => {
  it("산식 표와 같다", () => {
    expect(LAND_ACQ).toBe(171_428_571);
    expect(NBL_GAIN).toBe(131_428_571);
    expect(BASE).toBe(92_128_572);
    expect(TOTAL_TAX).toBe(18_485_500);
  });
});

describe("#17-5 ② 폼→④→⑧→⑫⑭→엔진 — 개별주택가격(보충적 평가) 상속·증여 주택의 초과분 분리", () => {
  it("🔑 상속: ⑧ 통과(취득시 개별주택가격 칸 없음) · 초과분 131,428,571 · 총세액 18,485,500 · «확인 필요» 고지 · 수정 전: 총세액 0 + «초과분 미분리»", async () => {
    const r = await runCalc(single(INHERIT));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.splitDetail?.land.acquisitionPrice).toBe(LAND_ACQ);
    expect(r.result.splitDetail?.land.gain).toBe(LAND_GAIN);
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, limitArea: 300, gain: NBL_GAIN, holdingYears: 14, longTermRate: 0.28, longTermDeduction: LTD });
    expect(r.result.totalTax).toBe(TOTAL_TAX);
    expect(unseparated(warningsOf(r))).toBe(false);
    expect(inheritedNotice(warningsOf(r))).toBe(true);
  });

  it("④ — 취득시 개별주택가격(5칸 총액)은 폼에 남은 칸이 아니라 상속 평가액을 싣는다(화면에 없는 값이 계산에 쓰이지 않는다)", async () => {
    const r = await runCalc(single({ ...INHERIT, standardPriceAtAcq: "999999999" }));
    expect(r.body.standardPriceAtAcquisition).toBe(300_000_000);
    expect(r.result.totalTax).toBe(TOTAL_TAX);
  });

  it("🔑 증여(단순 증여 — 증여 신고가액 3억 · 보충적 평가): 같은 분리 · 증여받은 날부터 14년", async () => {
    const r = await runCalc(single(GIFT));
    expect(r.issues.filter((i) => !i.message.includes("증여자"))).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ gain: NBL_GAIN, holdingYears: 14, longTermRate: 0.28 });
    expect(inheritedNotice(warningsOf(r))).toBe(true);
    expect(r.body.standardPriceAtAcquisition).toBe(300_000_000);
  });

  it("⑧ — 나머지 4칸은 그대로 요구한다: 취득시 ㎡당 공시지가가 비면 막는다 (평가액 칸이 아니라 그 칸을 지목)", async () => {
    const r = await runCalc(single({ ...INHERIT, standardPricePerSqmAtAcq: "" }));
    expect(r.issues.some((i) => i.field === "standardPricePerSqmAtAcq" && i.message.includes("배율 한도를"))).toBe(true);
  });

  it("대조 — 면적이 한도 이내(250㎡)면 분리도 고지도 없다: 총세액 0", async () => {
    const r = await runCalc(single({ ...INHERIT, acquisitionArea: "250", transferArea: "250" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(inheritedNotice(warningsOf(r))).toBe(false);
  });

  it.each([
    ["시가(매매사례) 평가", { inheritanceValuationMethod: "market_value" }],
    ["감정평가", { inheritanceValuationMethod: "appraisal" }],
    ["공동주택가격(house_apart)", { inheritanceAssetKind: "house_apart" }],
  ])("범위 밖 — %s는 평가액을 나눌 근거가 없다: ⑧이 5칸을 요구하지 않고 비과세 + «초과분 미분리» 고지", async (_n, over) => {
    const r = await runCalc(single({ ...INHERIT, ...over }));
    expect(r.issues.some((i) => i.message.includes("배율 한도를"))).toBe(false);
    expect(r.result?.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(r.result?.totalTax).toBe(0);
    expect(unseparated(warningsOf(r))).toBe(true);
    expect(inheritedNotice(warningsOf(r))).toBe(false);
  });

  it("범위 밖 — 상속개시일이 2005-04-30 전이면(§163⑨ 2호 §164⑦ max 구간) 분리하지 않는다", async () => {
    const r = await runCalc(single({ ...INHERIT, acquisitionDate: "2003-03-01", inheritanceStartDate: "2003-03-01", decedentAcquisitionDate: "1990-01-01" }));
    expect(r.issues.some((i) => i.message.includes("배율 한도를"))).toBe(false); // ⑧이 엔진이 쓰지 않을 5칸을 요구하지 않는다(칸 있는 요구·쓰이는 입력)
    expect(r.result?.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(r.result?.totalTax).toBe(0);
    const a = asset({ ...INHERIT, acquisitionDate: "2003-03-01", inheritanceStartDate: "2003-03-01", decedentAcquisitionDate: "1990-01-01" });
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(false);
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(false);
  });

  it("범위 밖 — 이월과세 증여(취득원인 carryover_gift)는 취득가액 경로가 달라 대상이 아니다", () => {
    const a = asset({ ...GIFT, acquisitionCause: "carryover_gift" });
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(false);
  });
});

import { housingExcessNeedsLandSplit, housingExcessUsesInheritedTotal, housingExcessInheritedTotal } from "@/lib/calc/housing-excess-split";
import { housingExcessNeedsAcqContract } from "@/lib/calc/housing-excess-acq-contract";
import { housingExcessSplitAppliesToInput, isSuppValuedHouseInheritance } from "@/lib/tax-engine/housing-excess-split";
import { housingExcessAcqContractApplies } from "@/lib/tax-engine/housing-excess-acq-contract";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

describe("#17-5 ② 클라이언트 술어 — ⑤ 카드 · ⑧ 요구 · ④ 전송 · 엔진 게이트", () => {
  it("보충적 평가 상속 첫 자산 — 분리 경로(5칸 중 총액 제외)이고 ④가 싣는 총액 = 평가액", () => {
    const a = asset(INHERIT);
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(true);
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(true);
    expect(housingExcessInheritedTotal(a, TD)).toBe(300_000_000);
  });

  it("함께 양도 카드(isNonPrimary)는 아니다 — 상속 평가액이 다른 채널(inheritanceValuation)이라 엔진 어댑터가 읽지 못한다", () => {
    const a = asset(INHERIT);
    expect(housingExcessNeedsLandSplit(a, TD, true)).toBe(false);
    expect(housingExcessUsesInheritedTotal(a, TD, true)).toBe(false);
    expect(housingExcessInheritedTotal(a, TD, true)).toBeUndefined();
  });

  it("평가방법 미선택(\"\")은 ④가 supplementary로 싣는 값과 같다 — 같은 사실이다", () => {
    expect(housingExcessUsesInheritedTotal(asset({ ...INHERIT, inheritanceValuationMethod: "" }), TD)).toBe(true);
  });

  it("매매 취득은 총액이 5칸의 일부다 — 상속 총액 경로가 아니다", () => {
    const a = asset({ acquisitionCause: "purchase", fixedAcquisitionPrice: "500000000" });
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(true);
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(false);
  });

  it("가업상속 의제 취득가액이 켜진 상속은 대상이 아니다", () => {
    const a = asset({ ...INHERIT, familyBusinessInheritance: { decedentAcquisitionDate: "2005-06-01" } as never });
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(false);
  });

  it("건물 상속 + 토지 매매 혼합(D2 — ④가 landAcquisitionCause를 싣고 상속 평가액 payload를 싣지 않는다)은 대상이 아니다", () => {
    const a = asset({
      ...INHERIT,
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2012-01-02",
      landAcquisitionCause: "purchase",
      landCauseHost: "inheritance",
    });
    expect(housingExcessUsesInheritedTotal(a, TD)).toBe(false);
    expect(housingExcessUsesInheritedTotal(asset(INHERIT), TD)).toBe(true);
  });

  it("계약서 토지·건물 구분금액 칸은 매매계약서의 가액 구분이라 상속·증여에는 열리지 않는다 (매매는 그대로 열린다)", () => {
    expect(housingExcessNeedsAcqContract(asset(INHERIT), TD)).toBe(false);
    expect(housingExcessNeedsAcqContract(asset({ acquisitionCause: "purchase", fixedAcquisitionPrice: "500000000" }), TD)).toBe(true);
  });
});

describe("#17-5 ② 엔진 술어 — 어댑터는 ④가 싣는 inheritedAcquisition을 읽는다", () => {
  const ia = (over: Record<string, unknown> = {}) => ({
    inheritanceDate: new Date("2012-01-02"),
    assetKind: "house_individual" as const,
    reportedMethod: "supplementary" as const,
    reportedValue: 300_000_000,
    ...over,
  });
  const base = (over: Record<string, unknown> = {}) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      transferDate: new Date(TD),
      acquisitionDate: new Date("2012-01-02"),
      acquisitionCause: "inheritance",
      acquisitionPrice: 300_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      buildingFootprintArea: 100,
      acquisitionArea: 500,
      appurtenantLandZone: "metropolitan_residential",
      inheritedAcquisition: ia(),
      ...over,
    } as never);

  it.each([
    ["상속 · 보충적 · 단독주택", {}, true],
    ["증여(단순) · 보충적", { acquisitionCause: "gift" }, true],
    ["이월과세 증여", { acquisitionCause: "carryover_gift" }, false],
    ["부담부증여", { acquisitionCause: "burdened_gift" }, false],
    ["시가 평가", { inheritedAcquisition: ia({ reportedMethod: "market_value" }) }, false],
    ["공동주택가격", { inheritedAcquisition: ia({ assetKind: "house_apart" }) }, false],
    ["의제취득일(1985-01-01) 전 상속", { inheritedAcquisition: ia({ inheritanceDate: new Date("1984-12-31") }) }, false],
    ["신고가액 없음", { inheritedAcquisition: ia({ reportedValue: undefined }) }, false],
    ["평가 payload 없음", { inheritedAcquisition: undefined }, false],
    ["가업상속", { familyBusinessInheritance: { appliedRate: 0.5 } }, false],
    ["토지 취득원인 혼합(건물 상속 + 토지 매매)", { landAcquisitionCause: "purchase" }, false],
  ])("%s → 분리 경로 %s", (_n, over, expected) => {
    expect(housingExcessSplitAppliesToInput(base(over))).toBe(expected);
  });

  it("leaf 술어 — 네 조건이 모두 있어야 한다", () => {
    const ok = { assetKind: "house_individual", reportedMethod: "supplementary", reportedValue: 1, postDeemed: true };
    expect(isSuppValuedHouseInheritance(ok)).toBe(true);
    for (const k of ["assetKind", "reportedMethod", "reportedValue", "postDeemed"] as const) {
      expect(isSuppValuedHouseInheritance({ ...ok, [k]: k === "postDeemed" ? false : k === "reportedValue" ? 0 : "x" })).toBe(false);
    }
  });

  it("계약서 구분금액 경로는 매매만이다 — 상속에 구분금액을 실으면 엔진이 막는다(API 직접 호출)", () => {
    expect(housingExcessAcqContractApplies(base(), "actual", "actual")).toBe(false);
    expect(housingExcessAcqContractApplies(base({ acquisitionCause: "purchase", inheritedAcquisition: undefined }), "actual", "actual")).toBe(true);
  });

  it("매매 취득의 같은 날 분리에는 상속·증여 «확인 필요» 고지가 없다 (고지는 상속·증여 취득에만)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 1_000_000_000, transferDate: new Date(TD), acquisitionDate: new Date("2012-01-02"), acquisitionPrice: 500_000_000,
        expenses: 0, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
        buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential",
        landAcquisitionDate: new Date("2012-01-02"), standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000,
        buildingStandardPriceAtAcquisition: 150_000_000, landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
      } as never),
      makeMockRates(),
    );
    expect(r.splitDetail?.nonBusinessLandPart).toBeDefined();
    expect((r.warnings ?? []).some((w) => w.includes("서면인터넷방문상담4팀-688"))).toBe(false);
  });
});
