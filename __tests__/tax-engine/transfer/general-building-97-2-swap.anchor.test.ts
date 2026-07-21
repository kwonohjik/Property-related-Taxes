/**
 * anchor A2 — 일반건물(토지+건물 다중카드) 환산 §97②2호 단서 swap 자산총액 판정 (Phase 2 G2 배선).
 *
 * 계획서: docs/00-pm/general-commercial-estimated-97-2-swap.plan.md §5.2(안 A).
 *
 * 갭(수정 전): GeneralBuildingInput에 capex 필드가 없어 자본적지출+양도비가 엔진에 도달 못 함 →
 *   환산 카드는 개산공제 고정, §97②2호 단서 swap 미발동(자본적지출>개산공제 시 과다과세).
 *
 * 수정(안 A 자산총액): 환산 카드 estimatedSide 합(가목) vs 나목(자본+양도비) 판정 1회,
 *   나목>가목이면 전 환산 카드 swap(환산가 미차감·나목을 estimatedSide 비율 배분·잔액 흡수).
 *
 * 베이스: 사례 31(서울 동작구 사당동). 실측(probe):
 *   land 카드 환산가 233,908,636 + 개산공제 7,140,000 / building 27,660,876 + 844,341
 *   → estimatedSideTotal = 269,553,853. baseline gain = 925,000,000 − 269,553,853 = 655,446,147.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const BASE: GeneralBuildingInput = {
  totalTransferPrice: 925_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
};

const EST_TOTAL = 269_553_853; // 환산 카드 estimatedSide 합 (가목)

describe("anchor A2 — 일반건물 환산 §97②2호 단서 swap 자산총액(안 A, Phase 2 G2)", () => {
  it("baseline — capex 없음: 본문(개산공제), swap 미발동", () => {
    const r = calculateGeneralBuildingTransfer(BASE, 2023, 0, [], rates);
    expect(r.aggregated.totalTransferGain).toBe(655_446_147);
    expect(r.aggregated.swapApplied ?? false).toBe(false);
  });

  it("나목(자본 8억+양도비 1천만=8.1억) > 가목 → swap: gain = 925,000,000 − 810,000,000", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...BASE, capitalExpenditure: 800_000_000, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    // 자산총액 판정: 가목 269,553,853 < 나목 810,000,000 → 나목 채택, 환산가 미차감
    expect(r.aggregated.totalTransferGain).toBe(115_000_000);
    expect(r.aggregated.swapApplied).toBe(true);
    expect(r.aggregated.swapComparison).toEqual({
      estimatedSide: EST_TOTAL,
      directSide: 810_000_000,
      chosen: "direct",
    });
  });

  it("나목 배분 불변식 — Σ(카드 필요경비) = directSide (잔액 흡수)", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...BASE, capitalExpenditure: 800_000_000, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    // 각 swap 카드 gain = cardTransferPrice − 0 − 배분나목 → Σ gain = 총양도가 − directSide.
    // Σ(카드 양도가) = 925,000,000, Σ gain = 115,000,000 ⇒ Σ 배분나목 = 810,000,000.
    const sumGain = r.aggregated.properties.reduce((s, p) => s + p.transferGain, 0);
    expect(925_000_000 - sumGain).toBe(810_000_000);
  });

  it("F9 배분 basis = estimatedSide 비율 (보유기간 상이에도 불변) — 토지 724,342,809 / 건물 85,657,191", () => {
    // 건물 취득일을 2020으로 늦춰 토지(1999)와 보유기간을 다르게 해도, 나목 배분은
    // estimatedSide 비율(land 241,048,636 : building 28,505,217)로 고정 — 보유기간 무관(F9 확정).
    const r = calculateGeneralBuildingTransfer(
      {
        ...BASE,
        buildingAcquisitionDate: new Date("2020-06-01"),
        capitalExpenditure: 800_000_000,
        transferExpense: 10_000_000,
      },
      2023, 0, [], rates,
    );
    const land = r.aggregated.properties.find((p) => p.propertyId === "land");
    const bld = r.aggregated.properties.find((p) => p.propertyId === "building");
    expect(land?.necessaryExpense).toBe(724_342_809);
    expect(bld?.necessaryExpense).toBe(85_657_191); // 잔액 흡수: 810,000,000 − 724,342,809
  });

  it("음성 경계 — 나목(1.1억) < 가목(2.69억) → 본문 유지, swap 미발동", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...BASE, capitalExpenditure: 100_000_000, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.totalTransferGain).toBe(655_446_147);
    expect(r.aggregated.swapApplied ?? false).toBe(false);
  });
});

// ── G4: NBL 초과분 분할(사업용·비사업용 토지 + 건물 = 3카드) + swap ──
// landArea 1000 > 인정면적 → §104의3 초과분 토지 2장 분할. 3 환산 카드 전체가 swap 대상(안 A).
const NBL: GeneralBuildingInput = {
  totalTransferPrice: 1_200_000_000,
  transferDate: new Date("2023-02-19"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 1000,
  buildingArea: 180.96,
  buildingFootprintArea: 90.48,
  transferLandPricePerSqm: 1_000_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 400_000,
  acquisitionBuildingStdPrice: 28_144_700,
  zoneType: "commercial",
  isMetropolitan: true,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: new Date("1999-05-24"),
};

// ── G3: 증축(토지·건물1·건물2 = 3카드, 원건물·증축 모두 환산) + swap(capitalExpenditure만) ──
// 증축 케이스는 transferExpense가 bundledExpenses(F1)로 소비될 수 있어 swap 나목=capitalExpenditure 단독.
const EXT: GeneralBuildingInput = {
  ...BASE,
  extensionInfo: {
    extensionDate: new Date("2015-06-01"),
    transferExtensionBuildingStdPrice: 8_000_000,
    acquisitionExtensionBuildingStdPrice: 6_000_000,
    extensionAcquisitionCause: "newConstruction",
    acquisitionMode: "estimated",
  },
};

describe("anchor A3 — 일반건물 증축(3카드) + §97②2호 swap (G3, capitalExpenditure만)", () => {
  it("증축 3 환산 카드(land·building1·building2) swap: gain = 925,000,000 − 673,376,413", () => {
    // estimatedSideTotal 273,376,413 < 나목(자본 673,376,413) → swap. 양도비 제외(F1).
    const r = calculateGeneralBuildingTransfer(
      { ...EXT, capitalExpenditure: 673_376_413 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.totalTransferGain).toBe(251_623_587);
    expect(r.aggregated.swapApplied).toBe(true);
    expect(r.aggregated.swapComparison).toEqual({
      estimatedSide: 273_376_413,
      directSide: 673_376_413,
      chosen: "direct",
    });
    expect(r.aggregated.properties).toHaveLength(3);
  });

  it("증축 음성 경계 — 자본(2억) < 가목(2.73억) → 본문 유지", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...EXT, capitalExpenditure: 200_000_000 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.swapApplied ?? false).toBe(false);
  });
});

describe("anchor A4 — 일반건물 NBL 분할(3카드) + §97②2호 swap (G4)", () => {
  it("3 환산 카드(land_business·land_nbl·building) 전체 swap: gain = 1,200,000,000 − 1,026,233,347", () => {
    // estimatedSideTotal 516,233,347 < 나목 1,026,233,347 → swap, 나목 3카드 estimatedSide 비율 배분.
    const r = calculateGeneralBuildingTransfer(
      { ...NBL, capitalExpenditure: 1_016_233_347, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.totalTransferGain).toBe(173_766_653);
    expect(r.aggregated.swapApplied).toBe(true);
    expect(r.aggregated.swapComparison).toEqual({
      estimatedSide: 516_233_347,
      directSide: 1_026_233_347,
      chosen: "direct",
    });
  });

  it("3카드 배분 불변식 — Σ(카드 필요경비) = directSide", () => {
    const r = calculateGeneralBuildingTransfer(
      { ...NBL, capitalExpenditure: 1_016_233_347, transferExpense: 10_000_000 },
      2023, 0, [], rates,
    );
    expect(r.aggregated.properties).toHaveLength(3);
    const sumNabok = r.aggregated.properties.reduce((s, p) => s + p.necessaryExpense, 0);
    expect(sumNabok).toBe(1_026_233_347);
    // swap 카드는 환산취득가 미차감 → 취득가액 0.
    r.aggregated.properties.forEach((p) => expect(p.acquisitionPrice).toBe(0));
  });
});
