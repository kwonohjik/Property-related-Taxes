/**
 * #17 후속(K1) — 일괄양도 1세대1주택 단위에서 **배율 한도(정착면적 × 배율)를 주택 카드와 부수토지 카드가 함께 쓴다.**
 *
 * ## 결함 (수정 전 실측)
 * `resolveCompanionSplit`이 부수토지 카드의 면적만으로 한도 전체를 다시 재어, 주택 카드 토지가 이미 쓴 한도를 또 썼다.
 * 주택 카드 토지 500㎡ · 정착 100㎡ · 수도권 주거 3배(한도 300㎡) + 부수토지 카드 100㎡ → 주택 카드는 초과 200㎡를 분리하는데
 * 부수토지 카드는 «배율 이내»(`appurtenant_land`)로 남았다. 합계 초과 300㎡ 중 200㎡만 비사업용 토지였고, 그 카드는 짝 주택 판정
 * (주택 카드가 초과분 때문에 `isExempt: false`)을 받아 비과세도 아니면서 표2 장특(80%)을 받았다.
 *
 * ## 규칙
 * 영 §154⑦·§167의5·§168의12는 «정착면적 × 배율 이내»의 면적 범위만 정하고 필지 사이 소진 순서·안분 명문이 없다(2026-10-13 본문 확인).
 * 주택 카드의 초과분은 엔진이 그 카드 토지만으로 판정한다(#17) — 그 판정을 그대로 두고 **남은 한도**를 부수토지 카드에 주며,
 * 부수토지 카드끼리는 단건 분리 경로와 같은 **면적 비율**이다. 땅값·취득일이 필지마다 같으면 전체를 한 필지로 본 단건 분리와 세액이 같다(parity).
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 주택 500㎡ + 부수토지 카드 100㎡ (2012-01-02 취득) | 카드 «배율 이내» · 장특 40,000,000(표2) · 총세액 11,936,570 | 카드 전부 초과분(비사업용 토지) · 장특 14,000,000(표1 28%) · 19,673,500 |
 * | 같은 사실을 단건 600㎡로 (2012-01-02) | 단건 17,693,500 ≠ 일괄 11,559,428 | 둘 다 17,693,500 |
 * | 같은 사실을 단건 600㎡로 (2014-01-02 — 중과 유예 밖) | 단건 30,147,070 ≠ 일괄 | 둘 다 30,147,070 · 카드 §104①8호 |
 * | 주택 200㎡ + 부수토지 카드 200㎡ (남은 한도 100㎡) | 카드 전부 비과세 · 총세액 0 | 한도 내 100㎡ 비과세 + 초과 100㎡ 과세 · 1,171,500 |
 *
 * | 같은 사실을 단건 600㎡로 (2003-01-02 — 주택 카드 **분리 범위 밖**) | 단건 0 = 일괄 0 | 단건 0 ≠ 일괄 6,176,500 — **일부러 다르다**(아래) |
 *
 * 분리 범위 밖(2005-04-30 전 취득 등 — `housingExcessSplitAppliesToInput` false)이면 엔진은 주택 카드의 초과분을 입력 경로 부재로 분리하지
 * 못하고 «초과분 미분리(과소 가능)»를 고지한다. 부수토지 카드는 제 금액을 따로 들고 있어 초과분을 가를 수 있으므로 한도 공유를 그대로 적용한다
 * — 초과분은 법상 비사업용 토지다(§104의3①5호). 단건이 과소인 것이지 일괄이 과대인 것이 아니다(2026-10-13 검토 지적 — (a)안 채택).
 *
 * 2012-01-02 취득은 법률 제9270호 부칙 §14①(2009.3.16.~2012.12.31. 취득분 비사업용 토지 중과 배제)이라 초과분도 기본세율이다 — 단건 분리 경로가 같은 처리다.
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
import { appurtenantLimitShareOf, resolveCompanionSplit } from "@/app/api/calc/transfer/bundled-companion-split";

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
  standardPriceAtTransfer: "800000000",
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
const form = (total: string, ...assets: Record<string, unknown>[]) =>
  ({
    ...createDefaultTransferFormData(), ...household, contractTotalPrice: total,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a })),
  }) as never;

type Prop = {
  propertyId: string; isExempt: boolean; transferPrice: number; transferGain: number; longTermHoldingDeduction: number;
  rateClause?: string; rateGroup?: string; nblSurchargeExcluded?: boolean;
};
type Agg = { totalTax: number; properties: Prop[] };
const aggOf = (r: Awaited<ReturnType<typeof runCalc>>) => r.json.data.aggregated as Agg;
const landCards = (agg: Agg) => agg.properties.filter((p) => p.propertyId !== "primary");

/** 같은 사실을 단건 한 필지(600㎡)로 — ㎡당 양도가 100만 · ㎡당 취득가 571,428.57 · 건물 취득가 214,285,714 */
const SINGLE_600 = { acquisitionArea: "600", transferArea: "600", fixedAcquisitionPrice: "557142857", actualSalePrice: "1100000000", standardPriceAtTransfer: "880000000" };
/** 일괄 쪽 부수토지 카드의 취득가를 같은 ㎡당 단가로 */
const LAND_PARITY = { fixedAcquisitionPrice: "57142857" };

describe("K1 — 주택 카드 토지가 이미 한도를 넘었으면 부수토지 카드는 전부 초과분", () => {
  it("🔑 보고 시료 — 카드가 비사업용 토지 단독 카드로 바뀌고 장특은 표1 (수정 전: «배율 이내» · 장특 40,000,000 · 총세액 11,936,570)", async () => {
    const r = await runCalc(form("1100000000", HOUSE, LAND));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    const agg = aggOf(r);
    const cards = landCards(agg);
    // 값 0의 «한도 내» 카드를 만들지 않는다
    expect(cards.map((c) => c.propertyId.replace(/^.*__/, ""))).toEqual(["excess"]);
    expect(cards[0]).toMatchObject({ isExempt: false, transferPrice: 100_000_000, transferGain: 50_000_000, longTermHoldingDeduction: 14_000_000 });
    // 2012-01-02 취득 — 법률 제9270호 부칙 §14① 중과 배제가 걸린 비사업용 토지 경로(단건 분리와 같다)
    expect(cards[0].nblSurchargeExcluded).toBe(true);
    expect(agg.totalTax).toBe(19_673_500);
  });

  it("parity — 같은 사실을 단건 600㎡로 넣은 분리 경로와 총세액이 같다 (2012 취득: 17,693,500 · 수정 전 일괄 11,559,428)", async () => {
    const single = await runCalc(form("1100000000", { ...HOUSE, ...SINGLE_600 }));
    expect(single.result.splitDetail.nonBusinessLandPart).toMatchObject({ excessArea: 300, gain: 128_571_429 });
    expect(single.result.totalTax).toBe(17_693_500);
    const bundle = aggOf(await runCalc(form("1100000000", HOUSE, { ...LAND, ...LAND_PARITY })));
    expect(bundle.totalTax).toBe(single.result.totalTax);
  });

  it("parity — 중과 유예 밖(2014 취득): 카드가 §104①8호(비사업용 토지) · 표1 24% · 단건과 같은 30,147,070", async () => {
    const A14 = { acquisitionDate: "2014-01-02" };
    const single = await runCalc(form("1100000000", { ...HOUSE, ...A14, ...SINGLE_600 }));
    expect(single.result.totalTax).toBe(30_147_070);
    const bundle = aggOf(await runCalc(form("1100000000", { ...HOUSE, ...A14 }, { ...LAND, ...A14, ...LAND_PARITY })));
    const [card] = landCards(bundle);
    expect(card).toMatchObject({ rateClause: "104-1-8", rateGroup: "non_business_land", transferGain: 42_857_143, longTermHoldingDeduction: 10_285_714 });
    expect(bundle.totalTax).toBe(single.result.totalTax);
  });
});

describe("K1 — 주택 카드가 분리 범위 밖이어도 한도는 주택 카드 토지가 먼저 쓴다 (단건과 일부러 다르다)", () => {
  const A03 = { acquisitionDate: "2003-01-02" };
  it("🔑 2003 취득 — 단건 600㎡는 전액 미분리 · 비과세 0, 일괄은 주택 카드 비과세 + 카드 100㎡만 초과분 과세 6,176,500 (수정 전 일괄 0)", async () => {
    const single = await runCalc(form("1100000000", { ...HOUSE, ...A03, ...SINGLE_600 }));
    expect(single.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(single.result.totalTax).toBe(0);
    expect((single.result.warnings as string[]).some((w) => w.includes("초과분 미분리(과소 가능)") && w.includes("300.00㎡"))).toBe(true);

    const r = await runCalc(form("1100000000", { ...HOUSE, ...A03 }, { ...LAND, ...A03, ...LAND_PARITY }));
    const agg = aggOf(r) as Agg & { warnings: string[] };
    expect(agg.properties.find((p) => p.propertyId === "primary")?.isExempt).toBe(true);
    const cards = landCards(agg);
    expect(cards.map((c) => c.propertyId.replace(/^.*__/, ""))).toEqual(["excess"]);
    // 2003 취득은 중과 유예(2009.3.16.~2012.12.31.) 밖 — §104①8호 · 표1 30%
    expect(cards[0]).toMatchObject({ isExempt: false, transferGain: 42_857_143, longTermHoldingDeduction: 12_857_142, rateClause: "104-1-8" });
    expect(agg.totalTax).toBe(6_176_500);
    // 주택 카드 초과 200㎡는 미분리로 고지된다 — 카드 100㎡는 과세되므로 고지 면적은 주택 카드분만이다
    expect(agg.warnings.some((w) => w.includes("[주 자산(주택)]") && w.includes("200.00㎡") && w.includes("초과분 미분리"))).toBe(true);
  });
});

describe("K1 — 주택 카드 토지가 한도 안이면 남은 한도만 부수토지 카드에", () => {
  const HOUSE_200 = {
    ...HOUSE, acquisitionArea: "200", transferArea: "200",
    standardPricePerSqmAtAcq: "", buildingStandardPriceAtAcq: "", standardPricePerSqmAtTransfer: "", buildingStandardPriceAtTransfer: "",
  };
  it("🔑 주택 200㎡ + 카드 200㎡(남은 한도 100㎡) → 한도 내 100㎡ 비과세 + 초과 100㎡ 과세 (수정 전: 카드 전부 비과세 · 총세액 0)", async () => {
    const r = await runCalc(form("1100000000", HOUSE_200, { ...LAND, acquisitionArea: "200", transferArea: "200" }));
    expect(r.issues).toEqual([]);
    const agg = aggOf(r);
    const cards = landCards(agg);
    expect(cards.map((c) => [c.propertyId.replace(/^.*__/, ""), c.isExempt, c.transferPrice])).toEqual([
      ["appurtenant", true, 50_000_000],
      ["excess", false, 50_000_000],
    ]);
    expect(agg.totalTax).toBe(1_171_500);
  });

  it("긍정 짝 — 주택 100㎡ + 카드 200㎡(합계가 한도 300㎡ 이내) → 카드 전부 비과세 · 총세액 0", async () => {
    const r = await runCalc(form("1100000000", { ...HOUSE_200, acquisitionArea: "100", transferArea: "100" }, { ...LAND, acquisitionArea: "200", transferArea: "200" }));
    const agg = aggOf(r);
    expect(landCards(agg).map((c) => [c.propertyId.includes("__"), c.isExempt])).toEqual([[false, true]]);
    expect(agg.totalTax).toBe(0);
  });
});

describe("K1 — 판정 leaf", () => {
  const primary = {
    propertyType: "housing" as const, holdingMonths: 168, buildingFootprintArea: 100,
    appurtenantLandZone: "metropolitan_residential" as const,
  };
  const card = (areaM2: number) => ({ assetId: "c", assetLabel: "c", assetKind: "land" as const, areaM2, landNature: "appurtenant_to_housing" as const });
  const td = new Date(TD);

  it("주택 카드 토지가 없으면 종전과 같다 — 카드 500㎡ → 한도 300 · 초과 200", () => {
    expect(resolveCompanionSplit(card(500), primary, td)).toEqual({ applied: true, limitArea: 300, excessArea: 200, appurtenantRatio: 0.6, excessRatio: 0.4 });
    expect(resolveCompanionSplit(card(300), primary, td)).toEqual({ applied: false, withinLimit: true });
  });

  it("부수토지 카드끼리는 남은 한도를 면적 비율로 — 주택 150㎡ · 카드 100㎡ + 200㎡(남은 한도 150 · 초과 150)", () => {
    const share = { houseLandAreaM2: 150, appurtenantCardsAreaM2: 300 };
    expect(resolveCompanionSplit(card(100), { ...primary, ...share }, td)).toMatchObject({ applied: true, limitArea: 50, excessArea: 50, excessRatio: 0.5 });
    expect(resolveCompanionSplit(card(200), { ...primary, ...share }, td)).toMatchObject({ applied: true, limitArea: 100, excessArea: 100, excessRatio: 0.5 });
  });

  it("주택 카드 토지는 «토지·건물 모두 본인 소유» 주택일 때만 센다 · 카드 합계는 분리 진입 조건을 통과한 카드만", () => {
    const cs = [
      { assetKind: "land", landNature: "appurtenant_to_housing" as const, areaM2: 100 },
      { assetKind: "land", landNature: "appurtenant_to_housing" as const, areaM2: 50, manualHoldingPeriodOverride: "progressive" as const },
      { assetKind: "land", landNature: "non_appurtenant" as const, areaM2: 70 },
      { assetKind: "housing", areaM2: 40 },
    ];
    expect(appurtenantLimitShareOf({ propertyType: "housing", acquisitionArea: 500 }, cs)).toEqual({ houseLandAreaM2: 500, appurtenantCardsAreaM2: 100 });
    expect(appurtenantLimitShareOf({ propertyType: "housing", selfOwns: "building_only", acquisitionArea: 500 }, cs).houseLandAreaM2).toBeUndefined();
    expect(appurtenantLimitShareOf({ propertyType: "land", acquisitionArea: 500 }, cs).houseLandAreaM2).toBeUndefined();
  });
});
