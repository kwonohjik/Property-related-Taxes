/**
 * #17-5 ① 후속 — 개별주택가격 최초 공시일(2005-04-30) 전이지만 개별공시지가 최초 고시일(1990-08-30) 이후에 취득한 주택(PHD 환산이 아닌 취득가액)의 배율 초과 부수토지 분리.
 *
 * 종전: «취득 당시 개별주택가격이 없다»는 이유로 분리하지 않고 비과세 + 고지였다. 지금: 그 칸에 영 §164⑦ 산식으로 추정한 취득당시 기준시가를 받아 5칸 경로로 계산한다 —
 * 개별주택가격이 공시되기 전에 취득한 주택의 취득당시 자산별 안분은 영 §164⑦ 산식으로 계산한 취득당시 기준시가를 적용한다(서면인터넷방문상담4팀-685, 2007.2.22. 회신 원문 확인).
 * 토지분 : 건물분은 취득시 ㎡당 개별공시지가 × 면적 : 건물 기준시가 비율이다(총액은 비율에 영향이 없다 — 감정·매매사례의 개산공제 base로만 쓰인다).
 *
 * ## 시료 — 취득 2000-03-01 · 양도 2026-02-16 · 양도가 10억 · 취득가 5억(실가) · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거(한도 300㎡ · 초과 200㎡) · 거주 120개월
 * 취득시: 영 §164⑦ 추정 기준시가 3억 · ㎡당 40만원(토지 2억) · 건물 1.5억 / 양도시: ㎡당 80만원(토지 4억) · 건물 4억.
 *
 * | 값 | 산식 | 결과 |
 * |---|---|---|
 * | 토지분 취득가액 | floor(5억 × 2억/3.5억) | 285,714,285 |
 * | 토지분 양도가액 | 10억 × 4억/8억 | 500,000,000 |
 * | 토지 양도차익 | 500,000,000 − 285,714,285 | 214,285,715 |
 * | 초과분 양도차익 | floor(214,285,715 × 200/500) | 85,714,286 |
 * | 장특(표1 — 26년 × 2% = 52% → 상한 30%) | floor(85,714,286 × 0.3) | 25,714,285 |
 * | 과세표준 | 85,714,286 − 25,714,285 − 2,500,000 | 57,500,001 |
 * | 산출세액(2000 취득은 중과 유예 취득기간(2009.3.16.~2012.12.31.) 밖 — 기본세율 24%(5,000만 초과 · 누진공제 576만) + 비사업용 10%p) | floor(57,500,001 × 0.24) − 5,760,000 + floor(57,500,001 × 0.10) | 13,790,000 |
 * | 지방소득세 · 총세액 | 13,790,000 × 10% → | 15,169,000 |
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
const LAND_ACQ = Math.floor((500_000_000 * 200_000_000) / 350_000_000); // 285,714,285
const LAND_GAIN = 500_000_000 - LAND_ACQ; // 214,285,715
const NBL_GAIN = Math.floor(LAND_GAIN * 0.4); // 85,714,286
const LTD = Math.floor(NBL_GAIN * 0.3); // 25,714,285
const BASE = NBL_GAIN - LTD - 2_500_000; // 57,500,001
const INCOME_TAX = Math.floor(BASE * 0.24) - 5_760_000 + Math.floor(BASE * 0.1); // 비사업용 토지 +10%p(구성 요소별 floor)
const TOTAL_TAX = INCOME_TAX + Math.floor(INCOME_TAX * 0.1);

const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2000-03-01",
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

describe("#17-5 ① 후속 — 1990-08-30 이후 · 2005-04-30 전 취득 + 실지거래가액 → 5칸 경로", () => {
  it("기대값 유도 sanity", () => {
    expect(LAND_ACQ).toBe(285_714_285);
    expect(NBL_GAIN).toBe(85_714_286);
    expect(BASE).toBe(57_500_001);
    expect(TOTAL_TAX).toBe(15_169_000);
  });

  it("🔑 2000-03-01 취득 — ⑧ 통과 · 초과분 85,714,286 · 총세액 15,169,000 · «초과분 미분리» 고지 없음 (수정 전: 총세액 0 + «2005년 전 취득» 고지)", async () => {
    const r = await runCalc(single());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.splitDetail?.land.acquisitionPrice).toBe(LAND_ACQ);
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, limitArea: 300, gain: NBL_GAIN, holdingYears: 25, longTermRate: 0.3, longTermDeduction: LTD });
    expect(r.result.totalTax).toBe(TOTAL_TAX);
    expect(warningsOf(r).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });

  it("취득시 개별주택가격(영 §164⑦ 추정값)이 비면 ⑧이 그 칸을 «영 §164⑦» 문구로 요구한다", async () => {
    const r = await runCalc(single({ standardPriceAtAcq: "" }));
    const hit = r.issues.find((i) => i.field === "standardPriceAtAcq" && i.message.includes("배율 한도를"));
    expect(hit?.message).toContain("영 §164⑦");
  });

  it("경계 — 1990-08-30 당일은 분리 경로 / 하루 전(1990-08-29)은 범위 밖(비과세 + «1990-08-30» 고지)", async () => {
    const on = await runCalc(single({ acquisitionDate: "1990-08-30" }));
    expect(on.result.splitDetail?.nonBusinessLandPart?.gain).toBe(NBL_GAIN);
    const before = await runCalc(single({ acquisitionDate: "1990-08-29" }));
    expect(before.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(before.result.totalTax).toBe(0);
    expect(warningsOf(before).some((w) => w.includes("초과분 미분리") && w.includes("1990-08-30"))).toBe(true);
  });

  it("대조 — 같은 시료가 2012 취득이어도 분리값(실가)은 같다 — 취득가·기준시가 비율이 같으면 취득 시기는 장특 보유기간(14년 28%)·중과 유예(2009.3.16.~2012.12.31. 취득)만 바꾼다", async () => {
    const r = await runCalc(single({ acquisitionDate: "2012-01-02" }));
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ gain: NBL_GAIN, holdingYears: 14, longTermRate: 0.28 });
    expect(r.result.totalTax).toBe(9_296_570); // 유예 취득기간 — 비사업용 +10%p 없음 (같은 시료의 기존 #17 anchor 값)
  });
});
