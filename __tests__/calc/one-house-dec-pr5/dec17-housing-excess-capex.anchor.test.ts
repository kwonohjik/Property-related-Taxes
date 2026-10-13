/**
 * #17 후속 — 같은 날 취득 주택의 배율 초과분 분리 경로가 자산 전체 자본적지출을 쓰지 않던 결함.
 *
 * 분리 경로(`calcSplitGain` 주택 비-별개)는 파트 자본적지출(`landDirectExpenses`·`buildingDirectExpenses`)만 읽는다. 「소득세법」 §100② 후문은
 * 공통되는 취득가액·양도비용만 안분 대상으로 열거하므로 자본적지출은 귀속 파트를 받아야 한다(자동 안분 금지). 종전에는 카드에 파트 칸이 없어
 * 고지만 뜨고 세액은 불변이었다 — 실가면 필요경비 누락(과다 과세), 환산이면 §97②2호 단서 비교 누락.
 *
 * 수정: 카드에 「그중 토지분 자본적지출」 1칸(⑤) · ⑧ 필수(미입력 차단 · 0 ≤ 토지분 ≤ 전체) · ④ 토지분 / 전체 − 토지분 전송. 같은 술어
 * (`housingExcessNeedsCapexSplit`). 별개취득 토글이 켜져 있으면(같은 날짜) 분리 섹션의 파트 칸이 받는다 — 이중 입력 없음.
 *
 * 등가 오라클: 같은 시료에서 별개취득 토글 ON(같은 날짜) + 파트 칸에 같은 금액을 넣은 입력 — 이미 파트 값을 싣는 기존 경로.
 *
 * 시료는 `dec17-housing-excess-b2.anchor.test.ts`와 같다(10억 양도 · 5억 취득 · 500㎡ · 정착 100㎡ · 수도권 주거 3배 · 초과 200㎡).
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
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "@/lib/calc/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
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
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const single = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TD,
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, ...over }],
  }) as never;
const asset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as unknown as AssetForm;
/** 등가 오라클 — 별개취득 토글 ON(같은 날짜) + 분리 섹션 파트 칸 */
const toggleOn = (land: string, building: string) => ({
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2012-01-02",
  landDirectExpenses: land,
  buildingDirectExpenses: building,
});
const capexNotice = (ws: string[] | undefined) => (ws ?? []).find((w) => w.includes("자산 전체 자본적지출"));
const EST = { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" };

describe("#17 후속 — 배율 초과분 분리의 자본적지출 토지분·건물분", () => {
  it("🔑 실가 + 자본적지출 1억(토지분 6천만) → 파트 값으로 실려 필요경비에 반영 (수정 전 9,296,570 · 고지만)", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000", housingExcessLandCapex: "60000000" }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.landDirectExpenses).toBe(60_000_000);
    expect(r.body.buildingDirectExpenses).toBe(40_000_000);
    expect(r.result.splitDetail?.nonBusinessLandPart?.excessArea).toBe(200);
    expect(r.result.totalTax).toBe(5_533_156);
    expect(capexNotice(r.result.warnings)).toBeUndefined();
    // 등가 오라클 — 같은 금액을 별개취득 토글(같은 날짜)의 파트 칸으로 넣은 입력과 같은 세액
    const o = await runCalc(single({ capitalExpenditure: "100000000", ...toggleOn("60000000", "40000000") }));
    expect(o.result.totalTax).toBe(r.result.totalTax);
  });

  it("귀속이 세액을 바꾼다 — 같은 1억도 전부 건물분(토지분 0)이면 초과분(토지) 차익이 줄지 않는다 = 자본적지출 없는 세액", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000", housingExcessLandCapex: "0" }));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBeUndefined(); // 0은 싣지 않는다(파트 칸과 같은 `ratioed` 규약)
    expect(r.body.buildingDirectExpenses).toBe(100_000_000);
    expect(r.result.totalTax).toBe(9_296_570);
    expect(capexNotice(r.result.warnings)).toBeUndefined();
    const o = await runCalc(single({ capitalExpenditure: "100000000", ...toggleOn("0", "100000000") }));
    expect(o.result.totalTax).toBe(r.result.totalTax);
  });

  it("환산 + §97②2호 단서 발동 — 자본적지출 6억(토지분 3억 · 건물분 3억) > 파트별 환산 + 개산공제 → 세액 감소 (수정 전 14,336,406)", async () => {
    const r = await runCalc(single({ ...EST, capitalExpenditure: "600000000", housingExcessLandCapex: "300000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBe(300_000_000);
    expect(r.body.buildingDirectExpenses).toBe(300_000_000);
    expect(r.result.totalTax).toBe(8_210_400);
    expect(r.result.totalTax).toBeLessThan(14_336_406);
    expect(capexNotice(r.result.warnings)).toBeUndefined();
    const o = await runCalc(single({ ...EST, capitalExpenditure: "600000000", ...toggleOn("300000000", "300000000") }));
    expect(o.result.totalTax).toBe(r.result.totalTax);
  });

  it("환산 + §97②2호 단서 미발동 짝 — 자본적지출 2억(토지분 1억 · 건물분 1억) ≤ 파트별 환산 + 개산공제 → 본문(개산공제) 그대로 14,336,406", async () => {
    const r = await runCalc(single({ ...EST, capitalExpenditure: "200000000", housingExcessLandCapex: "100000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBe(100_000_000);
    expect(r.body.buildingDirectExpenses).toBe(100_000_000);
    expect(r.result.totalTax).toBe(14_336_406);
  });

  it("⑧ — 토지분 미입력이면 그 칸으로 차단 (수정 전: 통과 · 자본적지출 누락)", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000" }));
    const hit = r.issues.find((i) => i.field === "housingExcessLandCapex");
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    expect(hit!.message).toContain("토지분 자본적지출을 입력하세요");
  });

  it("⑧ — 토지분이 전체를 넘으면 차단 (건물분 음수 금지)", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000", housingExcessLandCapex: "100000001" }));
    const hit = r.issues.find((i) => i.field === "housingExcessLandCapex");
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    expect(hit!.message).toContain("0 이상 100,000,000 이하");
  });

  it("경계 — 토지분 = 전체면 통과하고 건물분은 싣지 않는다(0)", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000", housingExcessLandCapex: "100000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBe(100_000_000);
    expect(r.body.buildingDirectExpenses).toBeUndefined();
  });

  it("이중 입력 없음 — 별개취득 토글 ON(같은 날짜)이면 이 칸을 요구하지 않고, 잔존 토지분 값도 싣지 않는다(파트 칸이 정본)", async () => {
    const over = { capitalExpenditure: "100000000", housingExcessLandCapex: "100000000", ...toggleOn("60000000", "40000000") };
    expect(housingExcessNeedsCapexSplit(asset(over), TD)).toBe(false);
    const r = await runCalc(single(over));
    expect(r.issues.some((i) => i.field === "housingExcessLandCapex")).toBe(false);
    expect(r.body.landDirectExpenses).toBe(60_000_000);
    expect(r.body.buildingDirectExpenses).toBe(40_000_000);
  });

  it("대조 — 자본적지출이 없으면 칸·요구가 없고 잔존 토지분 값도 싣지 않는다", async () => {
    expect(housingExcessNeedsCapexSplit(asset({ housingExcessLandCapex: "50000000" }), TD)).toBe(false);
    const r = await runCalc(single({ housingExcessLandCapex: "50000000" }));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBeUndefined();
    expect(r.body.buildingDirectExpenses).toBeUndefined();
    expect(r.result.totalTax).toBe(9_296_570);
  });

  it("대조 — 감정가액·매매사례가액 취득은 개산공제뿐이라(§97②2호 단서는 환산만) 자본적지출 칸을 묻지 않는다 · 실가·환산은 묻는다", () => {
    const capex = { capitalExpenditure: "100000000" };
    expect(housingExcessNeedsCapexSplit(asset({ ...capex, isAppraisalAcquisition: true }), TD)).toBe(false);
    expect(housingExcessNeedsCapexSplit(asset({ ...capex, isSalesCaseAcquisition: true }), TD)).toBe(false);
    expect(housingExcessNeedsCapexSplit(asset({ ...capex, useEstimatedAcquisition: true }), TD)).toBe(true);
    expect(housingExcessNeedsCapexSplit(asset(capex), TD)).toBe(true);
  });

  it("대조 — 배율 초과분 분리 경로가 아니면(면적 한도 이내) 자본적지출이 있어도 칸·요구가 없다", async () => {
    const over = { capitalExpenditure: "100000000", acquisitionArea: "250", transferArea: "250" };
    expect(housingExcessNeedsCapexSplit(asset(over), TD)).toBe(false);
    const r = await runCalc(single(over));
    expect(r.issues).toEqual([]);
    expect(r.body.landDirectExpenses).toBeUndefined();
  });

  it("엔진 고지는 파트 값이 없을 때만 — API 직접 호출(자산 전체만)은 종전처럼 고지 · 세액 불변", async () => {
    const r = await runCalc(single({ capitalExpenditure: "100000000" }));
    // ⑧은 막지만 runCalc는 route까지 보내 본다 — 파트 값이 없는 body
    expect(r.body.landDirectExpenses).toBeUndefined();
    expect(r.result.totalTax).toBe(9_296_570);
    expect(capexNotice(r.result.warnings)).toContain("100,000,000");
  });

  it("건물분 = 전체 − 토지분 (⑤ 표시·⑧·④ 단일 소스)", () => {
    expect(housingExcessCapexParts(asset({ capitalExpenditure: "100,000,000", housingExcessLandCapex: "60,000,000" }))).toEqual({
      total: 100_000_000,
      land: 60_000_000,
      building: 40_000_000,
    });
    expect(housingExcessCapexParts(asset({ capitalExpenditure: "100000000", housingExcessLandCapex: "" }))).toMatchObject({ land: null, building: null });
    expect(housingExcessCapexParts(asset({ capitalExpenditure: "100000000", housingExcessLandCapex: "0" }))).toMatchObject({ land: 0, building: 100_000_000 });
  });
});
