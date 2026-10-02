/**
 * anchor — 「소득세법」 §97③ 감가상각비 취득가액 공제 (엔진 축)
 *
 * 계획서: `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §3.2 (Phase B)
 *
 * 양도자산 보유기간에 그 자산의 감가상각비로서 각 과세기간의 사업소득금액 계산 시 필요경비에
 * 산입했거나 산입할 금액은 **취득가액에서 공제**한다(시행규칙 별지 제84호서식 부표3 ④ 차감항목).
 * 실가·감정·매매사례·환산 모두에 적용된다(조심2013서4988 — 「환산가액을 적용하는 경우라 하여
 * 이를 달리 적용한다는 규정이 없다」).
 *
 * §97②2호 단서(swap) 비교는 **차감 후** 취득가액으로 한다(사용자 결정 2026-10-02, 해석례 미확보).
 * swap이 채택되면 환산취득가액을 차감하지 않으므로(양도차익 = 양도가액 − 나목) 감가상각비도
 * 따로 빼지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

const BASE: Partial<TransferTaxInput> = {
  propertyType: "building",
  transferDate: new Date("2026-06-03"),
  acquisitionDate: new Date("2019-09-10"),
  isOneHousehold: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isNonBusinessLand: false,
};

const calc = (over: Partial<TransferTaxInput>) =>
  calculateTransferTax(baseTransferInput({ ...BASE, ...over } as Partial<TransferTaxInput>), rates);

// ── 실가 ────────────────────────────────────────────────────────────
describe("B0-1 실가 — 양도차익 = 양도가액 − (취득가액 − 감가상각비) − 필요경비", () => {
  const ACTUAL = {
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    capitalExpenditure: 10_000_000,
    transferExpense: 2_000_000,
    expenses: 12_000_000,
  };

  it("🔴 감가상각비 40,000,000 → 양도차익 228,000,000", () => {
    const r = calc({ ...ACTUAL, depreciationAmount: 40_000_000 });
    // 500 − (300 − 40) − 12 = 228
    expect(r.transferGain).toBe(228_000_000);
    expect(r.depreciationAmount).toBe(40_000_000);
    expect(r.expenses, "필요경비는 감가상각비와 무관").toBe(12_000_000);
  });

  it("🔴 긍정 짝 — 감가상각비 0·미입력이면 종전과 같다", () => {
    const none = calc(ACTUAL);
    const zero = calc({ ...ACTUAL, depreciationAmount: 0 });
    expect(none.transferGain).toBe(188_000_000); // 500 − 300 − 12
    expect(zero.transferGain).toBe(none.transferGain);
    expect(zero.determinedTax).toBe(none.determinedTax);
    expect(none.depreciationAmount).toBeUndefined();
    expect(zero.depreciationAmount).toBeUndefined();
  });

  it("차익이 커진 만큼 세액이 커진다(표시가 아니라 계산이 바뀐다)", () => {
    const base = calc(ACTUAL);
    const dep = calc({ ...ACTUAL, depreciationAmount: 40_000_000 });
    expect(dep.taxableGain).toBe(base.taxableGain + 40_000_000);
    expect(dep.determinedTax).toBeGreaterThan(base.determinedTax);
  });

  it("취득가액을 넘는 감가상각비는 취득가액까지로 절삭된다(음수 취득가액 방지)", () => {
    const r = calc({ ...ACTUAL, depreciationAmount: 999_000_000 });
    expect(r.depreciationAmount).toBe(300_000_000);
    expect(r.transferGain).toBe(500_000_000 - 0 - 12_000_000);
  });

  it("음수 입력은 0으로 본다", () => {
    const r = calc({ ...ACTUAL, depreciationAmount: -5_000_000 });
    expect(r.transferGain).toBe(188_000_000);
    expect(r.depreciationAmount).toBeUndefined();
  });

  it("산출근거 문자열이 자기 값을 만든다 — 취득가에서 감가상각비를 공제한 표기", () => {
    const r = calc({ ...ACTUAL, depreciationAmount: 40_000_000 });
    const step = r.steps?.find((s) => s.label === "양도차익 계산");
    expect(step?.formula).toContain("취득가(300,000,000 − 감가상각비 40,000,000)");
  });
});

// ── 환산·감정·매매사례 ───────────────────────────────────────────────
describe("B0-2 추계 취득가액 — 환산·감정·매매사례 모두 공제한다", () => {
  const TRANSFER = 400_000_000;
  const EST_BASE = 200_000_000; // 400 × (150 / 300)
  const EST_DED = 4_500_000; // 150,000,000 × 3%
  const EST = {
    transferPrice: TRANSFER,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 150_000_000,
    standardPriceAtTransfer: 300_000_000,
  };

  it("🔴 환산 본문 — 400 − (200 − 20) − 4.5 = 215.5", () => {
    const r = calc({ ...EST, depreciationAmount: 20_000_000 });
    expect(r.swapApplied).toBeFalsy();
    expect(r.estimatedBase, "환산취득가액 자체는 차감 전 값을 유지(가산세 base·환산식 표시)").toBe(EST_BASE);
    expect(r.estimatedDeduction, "개산공제는 취득 당시 기준시가 기준이라 감가상각비와 무관").toBe(EST_DED);
    expect(r.transferGain).toBe(TRANSFER - (EST_BASE - 20_000_000) - EST_DED);
    expect(r.depreciationAmount).toBe(20_000_000);
  });

  it("🔴 감정가액 — 같은 공제", () => {
    const r = calc({
      transferPrice: TRANSFER,
      acquisitionMethod: "appraisal",
      appraisalValue: EST_BASE,
      acquisitionPrice: EST_BASE,
      standardPriceAtAcquisition: 150_000_000,
      depreciationAmount: 20_000_000,
    });
    expect(r.usedEstimatedAcquisition).toBe(true);
    expect(r.transferGain).toBe(TRANSFER - (EST_BASE - 20_000_000) - EST_DED);
  });

  it("🔴 매매사례가액 — 같은 공제", () => {
    const r = calc({
      transferPrice: TRANSFER,
      acquisitionMethod: "salesCase",
      similarSalesValue: EST_BASE,
      acquisitionPrice: EST_BASE,
      standardPriceAtAcquisition: 150_000_000,
      depreciationAmount: 20_000_000,
    });
    expect(r.usedEstimatedAcquisition).toBe(true);
    expect(r.transferGain).toBe(TRANSFER - (EST_BASE - 20_000_000) - EST_DED);
  });

  it("긍정 짝 — 환산 + 감가상각비 0이면 종전과 같다", () => {
    const r = calc(EST);
    expect(r.transferGain).toBe(TRANSFER - EST_BASE - EST_DED);
    expect(r.depreciationAmount).toBeUndefined();
  });
});

// ── §97②2호 단서(swap) 경계 ─────────────────────────────────────────
describe("B0-3 §97②2호 단서 — 비교는 차감 후 값으로 한다", () => {
  const TRANSFER = 400_000_000;
  const SWAP_BASE = {
    transferPrice: TRANSFER,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 150_000_000,
    standardPriceAtTransfer: 300_000_000,
    capitalExpenditure: 190_000_000,
    transferExpense: 0,
    expenses: 190_000_000,
  };

  it("대조 — 감가상각비 없으면 204.5 > 190이라 본문(swap 아님)", () => {
    const r = calc(SWAP_BASE);
    expect(r.swapApplied).toBeFalsy();
    expect(r.transferGain).toBe(TRANSFER - 200_000_000 - 4_500_000);
  });

  it("🔴 경계 — 감가상각비 20,000,000이면 가목 184.5 < 나목 190 → swap으로 뒤집힌다", () => {
    const r = calc({ ...SWAP_BASE, depreciationAmount: 20_000_000 });
    expect(r.swapApplied).toBe(true);
    expect(r.swapComparison).toEqual({
      estimatedSide: 184_500_000, // (200 − 20) + 4.5
      directSide: 190_000_000,
      chosen: "direct",
      depreciation: 20_000_000,
    });
    // swap — 환산취득가액을 차감하지 않으므로 감가상각비도 따로 빼지 않는다: 양도차익 = 양도가액 − 나목
    expect(r.transferGain).toBe(TRANSFER - 190_000_000);
    expect(r.depreciationAmount, "swap이면 취득가액에서 공제되지 않는다").toBeUndefined();
  });

  it("본문 채택 시 비교 근거에 감가상각비가 실린다", () => {
    const r = calc({ ...SWAP_BASE, capitalExpenditure: 100_000_000, expenses: 100_000_000, depreciationAmount: 20_000_000 });
    expect(r.swapApplied).toBeFalsy();
    expect(r.swapComparison).toEqual({
      estimatedSide: 184_500_000,
      directSide: 100_000_000,
      chosen: "estimated",
      depreciation: 20_000_000,
    });
    expect(r.depreciationAmount).toBe(20_000_000);
  });
});

// ── 상가 환산(STEP 0.35 재구성) — 이중 차감 없음 ─────────────────────
describe("B0-4 상업용건물 환산 — step 재구성에서 한 번만 공제한다", () => {
  /** 상가 환산 — 환산취득가 400,000,000 · 개산공제 6,000,000 (commercial-building-97-2-swap.anchor 와 같은 fixture) */
  const cb = (over: Partial<TransferTaxInput> = {}) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "commercial_building",
        transferPrice: 1_000_000_000,
        transferDate: new Date("2020-06-01"),
        acquisitionDate: new Date("2010-06-01"),
        acquisitionPrice: 0,
        isOneHousehold: false,
        householdHousingCount: 0,
        residencePeriodMonths: 0,
        useEstimatedAcquisition: true,
        transferCause: "general",
        commercialBuildingValuation: {
          isPreDisclosure: false,
          exclusiveArea: 150,
          commonArea: 50,
          unitPriceAtTransfer: 2_500_000,
          unitPriceAtAcquisition: 1_000_000,
        },
        ...over,
      } as Partial<TransferTaxInput>),
      rates,
    );

  it("🔴 본문 — 1,000 − (400 − 50) − 6 = 644 (한 번만 공제)", () => {
    const r = cb({ depreciationAmount: 50_000_000 });
    expect(r.swapApplied ?? false).toBe(false);
    expect(r.transferGain).toBe(644_000_000);
    expect(r.depreciationAmount).toBe(50_000_000);
  });

  it("긍정 짝 — 감가상각비 없으면 종전 594,000,000", () => {
    expect(cb().transferGain).toBe(594_000_000);
  });

  it("🔴 경계 — 나목 300 : 감가상각비 없으면 본문, 110이면 가목 296 < 300이라 swap", () => {
    const direct = { capitalExpenditure: 290_000_000, transferExpense: 10_000_000 };
    const plain = cb(direct);
    expect(plain.swapApplied ?? false).toBe(false);
    expect(plain.transferGain).toBe(594_000_000);

    const flipped = cb({ ...direct, depreciationAmount: 110_000_000 });
    expect(flipped.swapApplied).toBe(true);
    expect(flipped.swapComparison).toEqual({
      estimatedSide: 296_000_000,
      directSide: 300_000_000,
      chosen: "direct",
      depreciation: 110_000_000,
    });
    // swap — 환산취득가액을 차감하지 않으니 감가상각비도 따로 빼지 않는다(이중 차감 없음)
    expect(flipped.transferGain).toBe(1_000_000_000 - 300_000_000);
    expect(flipped.depreciationAmount).toBeUndefined();
  });
});

// ── 다건 집계 echo 항등식 ───────────────────────────────────────────
describe("B0-5 다건(aggregate) — 엔진 echo가 항등식을 지킨다", () => {
  const item = (id: string, over: Partial<TransferTaxInput>) => ({
    ...(baseTransferInput({ ...BASE, ...over } as Partial<TransferTaxInput>) as never as Record<string, unknown>),
    propertyId: id,
    propertyLabel: id,
  });

  function agg(over: Partial<TransferTaxInput>) {
    return calculateTransferTaxAggregate(
      { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [item("A1", over)] } as never,
      rates,
    );
  }

  it("🔴 실가 — 취득가액 echo는 공제 후 값이고 필요경비 역산이 오염되지 않는다", () => {
    const a = agg({
      transferPrice: 500_000_000,
      acquisitionPrice: 300_000_000,
      capitalExpenditure: 10_000_000,
      transferExpense: 2_000_000,
      expenses: 12_000_000,
      depreciationAmount: 40_000_000,
    });
    const p = a.properties[0];
    expect(p.acquisitionPrice).toBe(260_000_000);
    expect(p.necessaryExpense).toBe(12_000_000);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
  });

  it("🔴 환산 본문 — 같은 항등식", () => {
    const a = agg({
      transferPrice: 400_000_000,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 150_000_000,
      standardPriceAtTransfer: 300_000_000,
      depreciationAmount: 20_000_000,
    });
    const p = a.properties[0];
    expect(p.acquisitionPrice).toBe(180_000_000);
    expect(p.necessaryExpense).toBe(4_500_000);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
  });
});

// ── 이월과세·부담부증여 — 미지원 경로에서 이중 차감 없음 ────────────
describe("B0-6 이월과세 — 수증자 감가상각비로 증여자 취득가액을 깎지 않는다", () => {
  it("depreciationAmount가 있어도 시나리오 A 양도차익은 변하지 않는다", () => {
    const co = {
      propertyType: "housing" as const,
      transferPrice: 700_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionPrice: 444_654_088,
      acquisitionDate: new Date("2006-05-21"),
      transferExpense: 1_000_000,
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 1,
      acquisitionCause: "carryover_gift" as const,
      carryoverTaxation: {
        giftRegistryDate: new Date("2021-06-19"),
        donorAcquisitionDate: new Date("2006-05-21"),
        useEstimatedAcquisition: false,
        donorAcquisitionPrice: 444_654_088,
        giftTaxAmount: 30_000_000,
        giftDateValuation: 666_000_000,
      },
    };
    const without = calculateTransferTax(baseTransferInput(co as Partial<TransferTaxInput>), rates);
    const withDep = calculateTransferTax(
      baseTransferInput({ ...co, depreciationAmount: 50_000_000 } as Partial<TransferTaxInput>),
      rates,
    );
    expect(without.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(withDep.transferGain).toBe(without.transferGain);
  });
});

// ── 일반건물 카드 — §97②2호 단서 비교(자산총액·파트)는 공제 후 값 ───────
import { resolveGeneralBuildingSwap } from "@/lib/tax-engine/general-building-swap";
import { attachBuildingDepreciation, cardDepreciation } from "@/lib/tax-engine/general-building-depreciation";
import type { AssetCardForAggregate } from "@/lib/tax-engine/types/general-building.types";

describe("B0-7 일반건물 카드 — 감가상각비는 원건물 카드에만, swap 비교는 공제 후", () => {
  const card = (id: string, type: "land" | "general_building_unit", acq: number, exp: number): AssetCardForAggregate =>
    ({
      propertyId: id,
      propertyLabel: id,
      propertyType: type,
      transferPrice: 100_000_000,
      acquisitionPrice: acq,
      expenses: exp,
      usedEstimatedAcquisition: true,
      estimatedBase: acq,
      estimatedDeduction: exp,
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2026-06-03"),
      isNonBusinessLand: false,
    }) as AssetCardForAggregate;
  const cards = () => [
    card("land_business", "land", 100_000_000, 3_000_000),
    card("building", "general_building_unit", 200_000_000, 6_000_000),
    card("building2", "general_building_unit", 50_000_000, 1_500_000),
  ];

  it("🔴 원건물 카드에만 싣는다 — 토지·증축분(building2)은 불변", () => {
    const out = attachBuildingDepreciation(cards(), 20_000_000);
    expect(out.find((c) => c.propertyId === "building")?.depreciationAmount).toBe(20_000_000);
    expect(out.find((c) => c.propertyId === "land_business")?.depreciationAmount).toBeUndefined();
    expect(out.find((c) => c.propertyId === "building2")?.depreciationAmount).toBeUndefined();
  });

  it("지분 접미사 카드(building#0)도 원건물로 본다", () => {
    const shared = [card("building#0", "general_building_unit", 100_000_000, 3_000_000)];
    expect(attachBuildingDepreciation(shared, 5_000_000)[0].depreciationAmount).toBe(5_000_000);
  });

  it("긍정 짝 — 0·미지정이면 카드 배열을 그대로 돌려준다(회귀 0)", () => {
    const c = cards();
    expect(attachBuildingDepreciation(c, 0)).toBe(c);
    expect(attachBuildingDepreciation(c, undefined)).toBe(c);
  });

  it("카드 공제액은 취득가액까지로 절삭한다", () => {
    expect(cardDepreciation({ depreciationAmount: 999, acquisitionPrice: 100 })).toBe(100);
    expect(cardDepreciation({ depreciationAmount: undefined, acquisitionPrice: 100 })).toBe(0);
  });

  it("🔴 자산총액 판정 — 가목 (200+6+100+3) = 309 : 나목 305는 본문, 공제 20이면 289 < 305라 swap", () => {
    const base = [cards()[0], cards()[1]];
    const plain = resolveGeneralBuildingSwap(base, 305_000_000, 0);
    expect(plain.swapApplied).toBe(false);
    expect(plain.estimatedSideTotal).toBe(309_000_000);

    const withDep = resolveGeneralBuildingSwap(attachBuildingDepreciation(base, 20_000_000), 305_000_000, 0);
    expect(withDep.swapApplied).toBe(true);
    expect(withDep.estimatedSideTotal).toBe(289_000_000);
  });

  it("🔴 파트 판정 — 건물 파트 가목 206 : 나목 205는 본문, 공제 5면 201 < 205라 그 파트만 swap", () => {
    const base = [cards()[0], cards()[1]];
    const axis = {
      land: { direct: 0, mode: "estimated" as const },
      building: { direct: 205_000_000, mode: "estimated" as const },
    };
    const plain = resolveGeneralBuildingSwap(base, undefined, undefined, axis);
    expect(plain.perPart?.building?.swapApplied).toBe(false);
    expect(plain.perPart?.building?.estimatedSide).toBe(206_000_000);

    const withDep = resolveGeneralBuildingSwap(attachBuildingDepreciation(base, 5_000_000), undefined, undefined, axis);
    expect(withDep.perPart?.building?.swapApplied).toBe(true);
    expect(withDep.perPart?.building?.estimatedSide).toBe(201_000_000);
    expect(withDep.perPart?.land?.swapApplied ?? false).toBe(false);
  });
});

// ── 차손 경로 — echo가 비어 있으면 집계 역산 필요경비가 E − D로 오염된다 ─────
describe("B0-8 양도차손 — 조기반환 경로도 감가상각비 echo를 싣는다", () => {
  const LOSS = {
    transferPrice: 100_000_000,
    acquisitionPrice: 200_000_000,
    expenses: 0,
  };

  it("🔴 단건 — echo가 있다 (차익은 공제 후 값: 100 − (200 − 30) = −70)", () => {
    const r = calc({ ...LOSS, depreciationAmount: 30_000_000 });
    expect(r.transferGain).toBe(-70_000_000);
    expect(r.depreciationAmount).toBe(30_000_000);
  });

  it("🔴 다건 — 취득가액 echo는 공제 후이고 필요경비가 음수로 오염되지 않는다", () => {
    const a = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 0,
        properties: [
          {
            ...(baseTransferInput({ ...BASE, ...LOSS, depreciationAmount: 30_000_000 } as Partial<TransferTaxInput>) as never as Record<string, unknown>),
            propertyId: "A1",
            propertyLabel: "A1",
          },
        ],
      } as never,
      rates,
    );
    const p = a.properties[0];
    expect(p.acquisitionPrice).toBe(170_000_000);
    expect(p.necessaryExpense, "역산 필요경비 = 입력 경비(0) — E − D(−30,000,000)가 아니다").toBe(0);
    expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
  });
});
