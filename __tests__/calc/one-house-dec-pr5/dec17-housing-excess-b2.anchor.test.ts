/**
 * #17 후속(B2) — 같은 날 취득 주택의 배율 초과분 분리 leaf 보정 2건.
 *
 * 시료(기존 #17 anchor와 같다): 매매 취득 2012-01-02 · 양도 2026-02-16 · 양도가 10억 · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거지역(3배 → 한도 300㎡ ·
 * 초과 200㎡) · 거주 120개월. 기준시가 — 취득시 개별주택가격 3억 · ㎡당 40만원(토지 2억) · 건물 1.5억 / 양도시 ㎡당 80만원(토지 4억) · 건물 4억.
 *
 * ## #17-3 엔진·클라이언트 지분 판정 불일치
 * 엔진 어댑터가 `totalPropertyTransferPrice`만 있으면 지분으로 봤다. 일괄양도 1세대1주택 단위(#18 `applyOneHouseUnitPrice`)는 지분이 아닌 주택 카드에도
 * 주택 + 부수토지 합계액을 그 필드로 싣는다 → ⑤⑧이 받고 ④가 보낸 기준시가 5칸을 엔진이 버리고 «지분 등 입력 경로 없음» 고지만 냈다.
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 주택(초과 200㎡) + 부수토지 카드 100㎡ 일괄양도 | 총세액 0 · 주택 카드 «초과분 미분리» 고지 | 주택 카드 초과분 85,714,286 분리 · 고지 없음 |
 *
 * ## #17-4 환산·감정·매매사례 취득
 * 종전에는 실지거래가액만 분리 경로였다. 분리 경로(주택 비-별개)는 개별주택가격을 가목:나목 비례로 나누고 환산 분모(양도시 개별주택가격)도 같은
 * 척도로 나누므로, 토지분 + 건물분 환산취득가액 = 자산 전체 환산취득가액(10억 × 3억 ÷ 8억 = 3.75억)을 취득시 기준시가 비율(4:3)로 나눈 값이다.
 *
 * | 시료 | 수정 전 | 수정 후 (총세액 · 초과분 양도차익) |
 * |---|---|---|
 * | 환산(양도시 개별주택가격 8억) | 0 · 고지 | 14,336,406 · 112,228,572 |
 * | 감정 4.5억 | 0 · 고지 | 11,077,892 · 95,085,714 |
 * | 매매사례 4.8억 | 0 · 고지 | 9,774,486 · 88,228,572 |
 * | 환산 + 공익수용 | 0 · 고지 | 0 · 고지 (불변 — §164⑨1호 주택 총액 특례가 분리 경로에 닿지 않는다) |
 * | 실가 + 잔존 파트 방식(별개취득 켰다 끈 `landAcqMode` 등) | ⑧ 통과 · API 400(칸 없는 막다른 길) | 9,296,570 (실가 그대로) |
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
import { housingExcessNeedsLandSplit } from "@/lib/calc/housing-excess-split";
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
const LAND: Record<string, unknown> = {
  assetKind: "land",
  landNature: "appurtenant",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "50000000",
  actualSalePrice: "100000000",
  addressJibun: "서울 테스트동 1-1",
  areaScenario: "same",
  acquisitionArea: "100",
  transferArea: "100",
  standardPriceAtTransfer: "80000000",
};
const household = {
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const single = (over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), ...HOUSE, ...over }],
  }) as never;
const bundle = (houseOver: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: "1100000000",
    assets: [
      { ...makeDefaultAsset(1), ...HOUSE, standardPriceAtTransfer: "800000000", ...houseOver },
      { ...makeDefaultAsset(2), ...LAND },
    ],
  }) as never;

type Prop = { propertyId: string; splitDetail?: { nonBusinessLandPart?: { gain: number; excessArea: number } } };
const unseparated = (ws: string[] | undefined) => (ws ?? []).some((w) => w.includes("초과분 미분리"));

describe("#17-3 일괄양도 1세대1주택 단위의 주택 카드 — 합계액(#18)은 지분이 아니다", () => {
  it("🔑 주택(초과 200㎡) + 부수토지 카드 → 주택 카드의 초과분이 분리된다 (수정 전: 5칸을 받고도 총세액 0 + «초과분 미분리» 고지)", async () => {
    const r = await runCalc(bundle());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    // ⑤⑧이 요구한 5칸을 ④가 싣는다 — 수정 전에도 같았다(엔진만 버렸다)
    expect(r.body.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    expect(r.body.totalPropertyTransferPrice).toBeUndefined();
    const agg = r.json.data.aggregated as { totalTax: number; warnings?: string[]; properties: Prop[] };
    const house = agg.properties.find((p) => p.propertyId === "primary")!;
    // 단건과 같은 분리(초과 200㎡ · 85,714,286) — 단위 합계액(11억)은 12억 판정 분모로만 쓰인다
    expect(house.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, gain: 85_714_286 });
    expect(unseparated(agg.warnings)).toBe(false);
    expect(agg.totalTax).toBeGreaterThan(0);
  });

  const rates = makeMockRates();
  const engineBase = {
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

  it("엔진 직접 — 단위 주택 카드(`oneHouseUnitRole: house` + 합계액)는 분리 경로, 단건과 같은 세액 9,296,570", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...engineBase, ...split, totalPropertyTransferPrice: 1_100_000_000, oneHouseUnitRole: "house" as const }),
      rates,
    );
    expect(r.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, gain: 85_714_286 });
    expect(r.totalTax).toBe(9_296_570);
  });

  it.each([
    ["지분 1/2 (ownershipRatio 0.5)", { totalPropertyTransferPrice: 2_000_000_000, ownershipRatio: 0.5, oneHouseUnitRole: "house" as const }],
    ["단위 역할 없는 합계액(겸용 파트 카드 등 — 종전대로)", { totalPropertyTransferPrice: 1_100_000_000 }],
  ])("대조 — %s → 분리 경로 밖(기준시가 없이도 막지 않고 «초과분 미분리» 고지)", (_n, over) => {
    const r = calculateTransferTax(baseTransferInput({ ...engineBase, ...over }), rates);
    expect(r.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(unseparated(r.warnings)).toBe(true);
  });
});

describe("#17-4 환산·감정·매매사례 취득도 초과분을 분리한다", () => {
  it.each([
    ["환산", { useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" }, "estimated", 14_336_406, 112_228_572],
    ["감정", { isAppraisalAcquisition: true, fixedAcquisitionPrice: "450000000" }, "appraisal", 11_077_892, 95_085_714],
    ["매매사례", { isSalesCaseAcquisition: true, fixedAcquisitionPrice: "", similarSalesValue: "480000000" }, "salesCase", 9_774_486, 88_228_572],
  ])("🔑 %s 취득 → 초과 200㎡ 분리 (수정 전: 총세액 0 + «초과분 미분리» 고지)", async (_n, over, mode, totalTax, nblGain) => {
    const r = await runCalc(single(over));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.landAcqMode).toBe(mode);
    expect(r.body.buildingAcqMode).toBe(mode);
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ excessArea: 200, gain: nblGain });
    expect(r.result.totalTax).toBe(totalTax);
    expect(unseparated(r.result.warnings)).toBe(false);
  });

  it("환산 — 토지분 + 건물분 환산취득가액 = 자산 전체 환산(10억 × 3억 ÷ 8억 = 3.75억)을 취득시 기준시가 4:3으로 나눈 값 (파트별 절사 1원)", async () => {
    const r = await runCalc(single({ useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000" }));
    const sd = r.result.splitDetail;
    expect(sd.land.acquisitionPrice).toBe(214_285_713);
    expect(sd.building.acquisitionPrice).toBe(160_714_286);
    expect(375_000_000 - (sd.land.acquisitionPrice + sd.building.acquisitionPrice)).toBe(1);
  });

  it("환산 + 기준시가 미입력 → ⑧이 배율 초과분 입력칸으로 막는다 (조용히 비과세로 끝내지 않는다)", async () => {
    const r = await runCalc(
      single({
        useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000",
        standardPricePerSqmAtAcq: "", buildingStandardPriceAtAcq: "", standardPricePerSqmAtTransfer: "", buildingStandardPriceAtTransfer: "",
      }),
    );
    const hit = r.issues.find((i) => i.message.includes("배율 한도를"));
    expect(hit?.field).toBe("standardPricePerSqmAtAcq");
  });

  it("범위 밖 — 환산 + 공익수용은 분리하지 않고 비과세 + «초과분 미분리» 고지 (종전과 같다)", async () => {
    const over = {
      useEstimatedAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtTransfer: "800000000", transferCause: "public_expropriation",
      housingCompensationTotal: "700000000", housingCompensationBasisTotal: "650000000",
    };
    expect(housingExcessNeedsLandSplit({ ...makeDefaultAsset(1), ...HOUSE, ...over } as unknown as AssetForm, TD, true)).toBe(false);
    const r = await runCalc(single(over));
    expect(r.issues.some((i) => i.message.includes("배율 한도를"))).toBe(false);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(unseparated(r.result.warnings)).toBe(true);
  });

  it("대조 — 실가 + 공익수용은 범위 안(특례가 환산 분모에만 걸린다)", () => {
    const a = { ...makeDefaultAsset(1), ...HOUSE, transferCause: "public_expropriation" } as unknown as AssetForm;
    expect(housingExcessNeedsLandSplit(a, TD, true)).toBe(true);
  });

  it("실가 + 잔존 파트 방식(별개취득을 켰다 끈 `landAcqMode`·`buildingAcqMode` = 환산) → 자산 단위 실가로 분리 (수정 전: ⑧ 통과 · API 400)", async () => {
    const r = await runCalc(single({ landAcqMode: "estimated", buildingAcqMode: "estimated" }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.landAcqMode).toBe("actual");
    expect(r.result.totalTax).toBe(9_296_570);
  });
});
