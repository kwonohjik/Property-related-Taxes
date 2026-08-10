/**
 * anchor: **일반건물 이월과세 카드 배선** — 증축(ⓐ) · 토지 비사업용 분할(ⓑ)
 *
 * A-2(영 §163의2② 후단 한도 단위)를 조사하다 그 아래에서 나온 결함 둘을 고정한다.
 * A-2 본 질문은 예규로 닫혔다 — **사전-2025-법규재산-0366 [법규과-1290]**(2025.6.18.):
 *
 * > 필요경비에 산입하는 증여세 상당액은 **해당 자산에 대한 양도차익**을 한도로 …
 *
 * 양도세에서 토지와 건물은 **별개 자산**(「소득세법」 제94조 제1항 제1호 「토지 **또는** 건물」)
 * 이므로 카드 단위 = 「해당 자산」 단위다. 구조는 맞았고, 그 안의 배선이 틀렸다.
 *
 * ## ⓐ 증축이 있으면 건물 이월과세가 통째로 사라졌다
 *
 * `general-building-extension.ts`의 `building1`·`building2` 카드에 `carryoverTaxation`
 * 주입이 **아예 없었다**(토지만 있었다). 증축이 없는 경로에는 정상적으로 실린다.
 * ⇒ 입력은 받는데 계산에 도달하지 않는 [[feedback_api_trigger_without_input_path_is_noop]]의 엔진판.
 *
 * ⚠️ **`building2`(증축분)는 대상이 아니다** — `extensionAcquisitionCause`가 타입상
 *    `"purchase" | "newConstruction"` 뿐이라 이월과세를 취득원인으로 가질 수 없다.
 *    둘 다 주면 ⓑ와 같은 이중계상을 새로 만든다.
 *
 * ## ⓑ 토지가 사업용·비사업용으로 갈리면 이월과세 **금액이 2배**로 들어갔다
 *
 * 두 카드가 `landCarryoverTaxation`을 **통째로**(안분 없이) 받았다. 취득가액·증여 당시
 * 평가액·증여세가 전부 각 카드에 전액 ⇒ 합계가 입력의 2배.
 *
 * 🔑 잔액 흡수로 **합계가 원 단위까지 정확히 일치**해야 한다([[feedback_floor_residual_absorption]]).
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { CarryoverTaxationDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

const rates = makeMockRates();

const DONOR_ACQ_PRICE = 50_000_000;
const GIFT_VALUATION = 200_000_000;
const GIFT_TAX = 50_000_000;

const CT = {
  giftRegistryDate: new Date("2020-03-17"),
  donorAcquisitionDate: new Date("1995-06-15"),
  donorAcquisitionPrice: DONOR_ACQ_PRICE,
  useEstimatedAcquisition: false,
  giftTaxAmount: GIFT_TAX,
  giftDateValuation: GIFT_VALUATION,
};

/** 배율 이내(57㎡) — 토지 1장. 배율 초과(570㎡)면 사업용·비사업용 2장으로 갈린다. */
const BASE = {
  totalTransferPrice: 330_000_000,
  transferDate: new Date("2022-10-11"),
  buildingArea: 83.73,
  buildingFootprintArea: 57,
  transferLandPricePerSqm: 5_956_000,
  transferBuildingStdPrice: 12_308_310,
  acquisitionLandPricePerSqm: 1_400_000,
  acquisitionBuildingStdPrice: 16_997_190,
  zoneType: "general_residential",
  isMetropolitan: true,
};

const EXTENSION = {
  extensionDate: new Date("2007-07-24"),
  extensionArea: 83.72,
  transferExtensionBuildingStdPrice: 54_501_720,
  acquisitionExtensionBuildingStdPrice: 40_604_200,
  extensionAcquisitionCause: "purchase" as const,
  actualBundledAcquisitionPrice: 200_000_000,
  actualBundledExpenses: 8_000_000,
};

function run(over: Record<string, unknown>) {
  const { aggregated } = calculateGeneralBuildingTransfer(
    { ...BASE, ...over } as never,
    2022,
    0,
    [],
    rates,
  );
  return {
    determinedTax: aggregated.determinedTax,
    card: (id: string) => aggregated.properties.find((p) => p.propertyId === id),
  };
}

// ────────────────────────────────────────────────────────────
// ⓐ 증축 × 건물 이월과세
// ────────────────────────────────────────────────────────────

/** 건물 이월과세 · 토지는 배율 이내(분할 없음)라 ⓑ와 섞이지 않는다. */
const BUILDING_CO = {
  landArea: 57,
  acquisitionDate: new Date("2002-01-01"),
  landAcquisitionCause: "purchase" as const,
  buildingAcquisitionDate: new Date("2020-03-17"),
  buildingAcquisitionCause: "carryover_gift" as const,
  buildingCarryoverTaxation: CT,
};
const BUILDING_PLAIN = {
  ...BUILDING_CO,
  buildingAcquisitionCause: "purchase" as const,
  buildingCarryoverTaxation: undefined,
};

describe("GX — 증축이 있어도 건물 이월과세가 계산에 도달한다", () => {
  it("GX-1 증축 O — 이월과세 선언이 **세액을 움직인다**", () => {
    const off = run({ ...BUILDING_PLAIN, extensionInfo: EXTENSION }).determinedTax;
    const on = run({ ...BUILDING_CO, extensionInfo: EXTENSION }).determinedTax;

    // 종전에는 두 값이 **완전히 같았다**(6,480,952) — 입력이 버려졌다는 뜻이다.
    expect(on).not.toBe(off);
  });

  it("GX-2 증축 O — 원건물 카드가 증여자 취득가액을 쓴다", () => {
    const b1 = run({ ...BUILDING_CO, extensionInfo: EXTENSION }).card("building1");
    expect(b1?.carryoverTaxationDetail).toBeDefined();
    expect(b1?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(DONOR_ACQ_PRICE);
    expect(b1?.carryoverTaxationDetail?.scenarioB.acquisitionPrice).toBe(GIFT_VALUATION);
  });

  it("GX-3 증축분(building2)은 이월과세 대상이 **아니다** — 이중계상 방지", () => {
    // `extensionAcquisitionCause`에 carryover_gift가 없다. 여기에도 실으면 금액이 2배가 된다.
    const b2 = run({ ...BUILDING_CO, extensionInfo: EXTENSION }).card("building2");
    expect(b2).toBeDefined();
    expect(b2?.carryoverTaxationDetail).toBeUndefined();
  });

  it("GX-4 【양성 대조군】 증축 X 경로는 종전대로 동작한다", () => {
    const off = run(BUILDING_PLAIN).determinedTax;
    const on = run(BUILDING_CO).determinedTax;
    expect(on).not.toBe(off);
    expect(run(BUILDING_CO).card("building")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice)
      .toBe(DONOR_ACQ_PRICE);
  });
});

// ────────────────────────────────────────────────────────────
// ⓑ 토지 비사업용 분할 × 이월과세
// ────────────────────────────────────────────────────────────

/** 570㎡ — 정착면적 57㎡의 배율을 크게 넘어 사업용·비사업용 2장으로 갈린다. */
const LAND_SPLIT_CO = {
  landArea: 570,
  acquisitionDate: new Date("2020-03-17"),
  buildingAcquisitionDate: new Date("2002-01-01"),
  buildingAcquisitionCause: "purchase" as const,
  landAcquisitionCause: "carryover_gift" as const,
  landCarryoverTaxation: CT,
};

function landDetails() {
  const out = run(LAND_SPLIT_CO);
  const biz = out.card("land_business")?.carryoverTaxationDetail;
  const nbl = out.card("land_nbl")?.carryoverTaxationDetail;
  return { biz, nbl, out };
}

describe("LS — 토지가 둘로 갈려도 이월과세 금액 합계는 입력과 같다", () => {
  it("LS-0 픽스처가 실제로 두 장으로 갈린다 [전제 확인]", () => {
    const { out } = landDetails();
    expect(out.card("land_business")).toBeDefined();
    expect(out.card("land_nbl")).toBeDefined();
  });

  /**
   * 🔑 **합계만 보면 안 된다.** 「사업용에 전액, 비사업용에 0」도 합계는 맞는다 —
   *    실제로 안분을 항등함수로 되돌린 mutation probe가 **합계 단언 3건을 모두 통과**했다.
   *    그래서 아래는 **카드별 실값**과, 그 값이 양도가액 분할과 **같은 비율**인지를 함께 본다.
   *    (메모리 `feedback_negative_assertion_needs_mutation_probe`)
   */
  it("LS-1 시나리오 A 취득가액 — 카드별 실값 + 합계", () => {
    const { biz, nbl } = landDetails();
    // 사업용 인정면적 비율 40% (양도가액 131,523,161 : 197,284,743과 같은 비율).
    expect(biz?.scenarioA.acquisitionPrice).toBe(20_000_000);
    expect(nbl?.scenarioA.acquisitionPrice).toBe(30_000_000);
    // 종전: 두 카드 각각 50,000,000 → 합계 1억(2배).
    expect(
      (biz?.scenarioA.acquisitionPrice ?? 0) + (nbl?.scenarioA.acquisitionPrice ?? 0),
    ).toBe(DONOR_ACQ_PRICE);
  });

  it("LS-2 시나리오 B 취득가액 — 카드별 실값 + 합계", () => {
    const { biz, nbl } = landDetails();
    expect(biz?.scenarioB.acquisitionPrice).toBe(80_000_000);
    expect(nbl?.scenarioB.acquisitionPrice).toBe(120_000_000);
    expect(
      (biz?.scenarioB.acquisitionPrice ?? 0) + (nbl?.scenarioB.acquisitionPrice ?? 0),
    ).toBe(GIFT_VALUATION);
  });

  it("LS-1b 안분 비율이 **양도가액 분할과 같다** [술어·인자 동일성]", () => {
    const { out } = landDetails();
    const bizCard = out.card("land_business");
    const nblCard = out.card("land_nbl");
    const priceRatio =
      (bizCard?.transferPrice ?? 0) /
      ((bizCard?.transferPrice ?? 0) + (nblCard?.transferPrice ?? 0));
    const coRatio =
      (bizCard?.carryoverTaxationDetail?.scenarioA.acquisitionPrice ?? 0) / DONOR_ACQ_PRICE;
    // 다른 기준을 쓰면 카드 안에서 분자와 분모가 갈린다.
    expect(coRatio).toBeCloseTo(priceRatio, 4);
  });

  it("LS-3 증여세 산입 **합계**가 입력 증여세를 넘지 않는다", () => {
    const { biz, nbl } = landDetails();
    const added = (d?: CarryoverTaxationDetail) =>
      d?.adoptedScenario === "A" ? d.scenarioA.giftTaxAddedToExpense : 0;
    // 종전: 두 카드 각각 50,000,000 산입 → 합계 1억. 한도(§163의2② 후단)는 카드별로 걸리므로
    // 합계가 입력을 **넘지 않기만** 하면 된다(한도에 걸려 더 작아질 수는 있다).
    expect(added(biz) + added(nbl)).toBeLessThanOrEqual(GIFT_TAX);
  });

  it("LS-4 【양성 대조군】 분할이 없으면 단일 카드가 **전액**을 받는다", () => {
    const single = run({ ...LAND_SPLIT_CO, landArea: 57 });
    const d = single.card("land")?.carryoverTaxationDetail;
    expect(single.card("land_business")).toBeUndefined();
    expect(d?.scenarioA.acquisitionPrice).toBe(DONOR_ACQ_PRICE);
    expect(d?.scenarioB.acquisitionPrice).toBe(GIFT_VALUATION);
  });

  it("LS-5 안분은 **잔액 흡수**라 원 단위까지 맞는다 (나누어떨어지지 않는 면적)", () => {
    // 570 → 사업용 인정면적이 정수로 나누어떨어지지 않는 조합에서도 합계가 정확해야 한다.
    const out = run({ ...LAND_SPLIT_CO, landArea: 571, buildingFootprintArea: 57 });
    const biz = out.card("land_business")?.carryoverTaxationDetail;
    const nbl = out.card("land_nbl")?.carryoverTaxationDetail;
    // 두 몫이 **모두 0이 아니어야** 「한쪽에 전액」이 아님이 확인된다.
    expect(biz?.scenarioA.acquisitionPrice).toBeGreaterThan(0);
    expect(nbl?.scenarioA.acquisitionPrice).toBeGreaterThan(0);
    expect(
      (biz?.scenarioA.acquisitionPrice ?? 0) + (nbl?.scenarioA.acquisitionPrice ?? 0),
    ).toBe(DONOR_ACQ_PRICE);
    expect(
      (biz?.scenarioB.acquisitionPrice ?? 0) + (nbl?.scenarioB.acquisitionPrice ?? 0),
    ).toBe(GIFT_VALUATION);
  });
});
