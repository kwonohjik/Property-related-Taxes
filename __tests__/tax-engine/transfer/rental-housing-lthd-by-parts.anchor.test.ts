/**
 * anchor: §155⑳ 장기임대 거주주택 특례의 장기보유특별공제를 **토지·건물 파트별 보유연수**로 구한다 (+ 기본통칙 95-0…1).
 *
 * [결함] 종전 특례 경로는 건물 취득일 하나로 만든 단일 보유연수를 주택분 양도차익 전체에 곱했다. 일반 경로는 파트 자신의 보유연수
 *   (§95④ — 취득일부터 양도일까지)를 쓰므로 토지가 건물보다 먼저 취득된 분리 취득 주택에서 특례 on/off 값이 갈렸다
 *   (토지 2008-07-01 · 건물 2014-09-01 · 양도 2024~2026 · 20억 · 660㎡: 총세액 on 116,574,000 / off 108,957,999 — 차이 7,616,001).
 *   같은 날 취득이면 정확히 일치했다.
 *
 * [수정] 두 경로 모두 파트별로 — 표1은 파트 자신의 보유연수, 표2는 건물 자신의 보유연수 · 토지 파트는 토지가 건물보다 오래되면
 *   기본통칙 95-0…1(표1 토지 전체 보유기간 vs 표2 주택 부수토지로서의 보유기간 중 큰 공제율). 파트 양도차익이 손실이면 그 파트 공제는 0(0 하한).
 *   같은 보유연수 파트는 종전 단일 산식(합계 한 번 floor)을 그대로 쓴다.
 *
 * 기대값은 엔진 출력을 베끼지 않고 정수 산식으로 독립 도출한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import {
  calculateGain95BothTables,
  calculateGain95BothTablesByParts,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/ltc-table-split";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const mulDiv = (a: number, b: number, c: number): number => Number((BigInt(a) * BigInt(b)) / BigInt(c));

const rentalA: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    },
  ],
};

interface Sample {
  S: number;
  landAcq?: string;
  bldAcq?: string;
  T?: string;
  res?: number;
  /** 토지 면적(㎡) — 300이면 배율 이내(초과 없음), 660이면 초과 60㎡ */
  area?: number;
  landAcquisitionPrice?: number;
  buildingAcquisitionPrice?: number;
  rhe?: boolean;
}
/** 토지:건물 = 80:20 양도가 · 토지 2억 + 건물 1억 취득가 — 기준시가는 양도가와 같은 비율. */
function house(o: Sample): TransferTaxInput {
  const landT = Math.floor(o.S * 0.8);
  const bldT = o.S - landT;
  return baseTransferInput({
    propertyType: "housing", transferPrice: o.S, acquisitionPrice: 300_000_000,
    landTransferPrice: landT, buildingTransferPrice: bldT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: bldT,
    landAcquisitionPrice: o.landAcquisitionPrice ?? 200_000_000, buildingAcquisitionPrice: o.buildingAcquisitionPrice ?? 100_000_000,
    acquisitionDate: D(o.bldAcq ?? "2014-09-01"), landAcquisitionDate: D(o.landAcq ?? "2008-07-01"), transferDate: D(o.T ?? "2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: o.area ?? 300, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: o.res ?? 60, isOneHousehold: true, householdHousingCount: 1,
    expenses: 0, annualBasicDeductionUsed: 0,
    ...(o.rhe ? { rentalHousingException: rentalA } : {}),
  } as Partial<TransferTaxInput>);
}
const hasNotice = (r: { warnings?: string[] }) => (r.warnings ?? []).some((w) => w.includes("기본통칙 95-0…1"));

// ══════════════════════════════════════════════════════════════════════
// 0. leaf — calculateGain95BothTablesByParts
// ══════════════════════════════════════════════════════════════════════
describe("§155⑳ leaf — calculateGain95BothTablesByParts", () => {
  const T = D("2026-06-01");

  it("같은 보유연수 파트는 종전 단일 산식과 1원도 다르지 않다 (합계 한 번 floor — 파트별 floor면 1원 어긋나는 시료)", () => {
    // gain × 56%의 소수부가 각각 .56이라 파트별 floor 합(672,000,000)과 합계 floor(672,000,001)가 1원 갈린다
    const parts = { land: { gain: 1_000_000_001, holdYears: 9 }, building: { gain: 200_000_001, holdYears: 9 } };
    expect(mulDiv(1_000_000_001, 56, 100) + mulDiv(200_000_001, 56, 100)).toBe(672_000_000);
    expect(mulDiv(1_200_000_002, 56, 100)).toBe(672_000_001);
    const byParts = calculateGain95BothTablesByParts(parts, 5, T);
    const legacy = calculateGain95BothTables(1_200_000_002, 9, 5, T);
    expect(byParts.ltcTable2).toBe(legacy.ltcTable2);
    expect(byParts.ltcTable1).toBe(legacy.ltcTable1);
    expect(byParts.gain95Table2).toBe(1_200_000_002 - 672_000_001);
    expect(byParts.gain95Table1).toBe(legacy.gain95Table1);
  });

  it("보유연수가 다른 파트 — 표1은 파트 자신의 연수, 표2는 건물 9년 56% (토지 15년 표1 30% < 56% → 통칙 표2), 파트별 floor 합", () => {
    const parts = { land: { gain: 1_400_000_000, holdYears: 15, houseHoldYears: 9 }, building: { gain: 300_000_000, holdYears: 9 } };
    const r = calculateGain95BothTablesByParts(parts, 5, T);
    // 표1: 토지 15년 30%, 건물 9년 18%
    expect(r.land.ltcTable1).toBe(mulDiv(1_400_000_000, 30, 100));
    expect(r.building.ltcTable1).toBe(mulDiv(300_000_000, 18, 100));
    // 표2: 토지 = max(30%, 36%+20%) = 56%, 건물 = 56% — 둘 다 56%라 종전 단일 산식(합계 floor)이 쓰인다
    expect(r.land.rateTable2).toBeCloseTo(0.56, 12);
    expect(r.ltcTable2).toBe(mulDiv(1_700_000_000, 56, 100));
    expect(r.land.appurtenant).toMatchObject({ houseHoldingYears: 9, table1Applied: false, changedFromOwnYears: true });
    expect(r.land.appurtenant!.table2Rate).toBeCloseTo(0.56, 12);
    expect(r.land.ltcTable2 + r.building.ltcTable2).toBe(r.ltcTable2); // 파트 echo 합 = 총액
  });

  it("건물 4년 · 거주 2년 · 토지 15년 — 토지분은 표1 30%가 이긴다(표2 24%), 건물분은 표2 24%", () => {
    const parts = { land: { gain: 1_400_000_000, holdYears: 15, houseHoldYears: 4 }, building: { gain: 300_000_000, holdYears: 4 } };
    const r = calculateGain95BothTablesByParts(parts, 2, T);
    expect(r.land.rateTable2).toBeCloseTo(0.3, 12);
    expect(r.building.rateTable2).toBeCloseTo(0.24, 12);
    expect(r.land.appurtenant).toMatchObject({ table1Applied: true, changedFromOwnYears: true });
    expect(r.ltcTable2).toBe(mulDiv(1_400_000_000, 30, 100) + mulDiv(300_000_000, 24, 100));
    // 표1: 토지 30% · 건물 4년 8%
    expect(r.ltcTable1).toBe(mulDiv(1_400_000_000, 30, 100) + mulDiv(300_000_000, 8, 100));
    expect(r.gain95Table2).toBe(1_700_000_000 - r.ltcTable2);
  });

  it("파트 손실 0 하한 — 토지 양도차손이면 토지 공제 0, 건물 공제만 (두 표 모두)", () => {
    const parts = { land: { gain: -100_000_000, holdYears: 15, houseHoldYears: 9 }, building: { gain: 500_000_000, holdYears: 9 } };
    const r = calculateGain95BothTablesByParts(parts, 5, T);
    expect(r.land.ltcTable1).toBe(0);
    expect(r.land.ltcTable2).toBe(0);
    expect(r.ltcTable2).toBe(mulDiv(500_000_000, 56, 100));
    expect(r.ltcTable1).toBe(mulDiv(500_000_000, 18, 100));
    // 양도소득금액 합계는 손실을 포함한다(공제만 0 하한)
    expect(r.gain95Table2).toBe(400_000_000 - mulDiv(500_000_000, 56, 100));
  });

  it("토지가 건물보다 짧으면 통칙을 쓰지 않는다 — 토지 자신의 보유연수 (일반 경로와 같다)", () => {
    const parts = { land: { gain: 800_000_000, holdYears: 9 }, building: { gain: 200_000_000, holdYears: 15 } };
    const r = calculateGain95BothTablesByParts(parts, 5, T);
    expect(r.land.appurtenant).toBeUndefined();
    expect(r.land.rateTable2).toBeCloseTo(0.56, 12);
    expect(r.building.rateTable2).toBeCloseTo(0.6, 12);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 1. A 시나리오 — 거주주택 양도 (A1 12억 이하 · A2 초과)
// ══════════════════════════════════════════════════════════════════════
describe("§155⑳ A — 토지 2008 · 건물 2014 시료: 특례 on = off (종전 7,616,001 차이)", () => {
  // 20억 · 토지 660㎡(초과 60㎡) — 재산세제과-915 회신 방식 경로
  for (const [bldAcq, T] of [
    ["2014-09-01", "2024-01-15"], ["2014-09-01", "2024-12-15"], ["2014-09-01", "2025-06-01"], ["2014-09-01", "2026-06-01"],
    ["2016-09-01", "2024-12-15"], ["2018-09-01", "2024-01-15"], ["2018-09-01", "2026-06-01"],
  ] as const) {
    it(`건물 ${bldAcq} · 양도 ${T} — on 총세액 = off 총세액`, () => {
      const on = calculateTransferTax(house({ S: 2_000_000_000, bldAcq, T, area: 660, rhe: true }), rates);
      const off = calculateTransferTax(house({ S: 2_000_000_000, bldAcq, T, area: 660, rhe: false }), rates);
      expect(on.rentalHousingExceptionDetail?.applied).toBe(true);
      expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
      expect(on.totalTax).toBe(off.totalTax);
    });
  }

  it("배율 초과 없음(300㎡) 일반 A2 — 파트별 공제의 합이 일반 경로와 같다(합계 안분 vs 파트 안분은 절사 순서 차이 ≤ 2원)", () => {
    for (const bldAcq of ["2014-09-01", "2018-09-01", "2018-03-01"]) {
      const on = calculateTransferTax(house({ S: 2_000_000_000, bldAcq, res: 60, rhe: true }), rates);
      const off = calculateTransferTax(house({ S: 2_000_000_000, bldAcq, res: 60, rhe: false }), rates);
      expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
      expect(Math.abs(on.totalTax - off.totalTax)).toBeLessThanOrEqual(2);
    }
  });

  it("건물 4년 · 거주 2년 · 토지 13년(2022 양도) — 표1(토지 26%)이 이긴다(표2 건물 4년 16% + 거주 8% = 24%): 과세대상 양도소득금액 = (양도차익 − 파트별 공제) × (S−12억)/S (종전 단일 4년 24% → 516,800,000)", () => {
    // 2019.2.12. 이후 취득 거주주택은 「생애 1회」 이력 입력이 필요해 그 전에 취득한 건물(2018-03-01)을 쓴다.
    const o = { S: 2_000_000_000, bldAcq: "2018-03-01", T: "2022-06-01", res: 24, rhe: true } as const;
    const on = calculateTransferTax(house(o), rates);
    const t = on.rentalHousingExceptionDetail!;
    expect(t.scenarioId).toBe("RH-A2");
    // 토지 양도차익 1.6B − 0.2B = 1.4B (토지 2008-07-01 → 13년 11개월) · 건물 0.4B − 0.1B = 0.3B (건물 2018-03-01 → 4년 3개월)
    const ded = mulDiv(1_400_000_000, 26, 100) + mulDiv(300_000_000, 24, 100); // 표2: 토지 max(표1 26%, 표2 24%) = 26% · 건물 24%
    expect(ded).toBe(436_000_000);
    expect(t.formulaTrace.gain95Table2).toBe(1_700_000_000 - ded);
    expect(t.taxableGain).toBe(mulDiv(1_700_000_000 - ded, 800_000_000, 2_000_000_000));
    expect(t.taxableGain).toBe(505_600_000);
    // 종전(단일 보유연수 4년 24%)은 516,800,000이었다
    expect(mulDiv(1_700_000_000 - mulDiv(1_700_000_000, 24, 100), 800_000_000, 2_000_000_000)).toBe(516_800_000);
    // 파트 echo(결과 카드) — 파트별 공제율·공제액
    expect(on.splitDetail!.land.longTermRate).toBeCloseTo(0.26, 12);
    expect(on.splitDetail!.building.longTermRate).toBeCloseTo(0.24, 12);
    expect(on.splitDetail!.land.longTermDeduction).toBe(mulDiv(1_400_000_000, 26, 100));
    expect(on.splitDetail!.building.longTermDeduction).toBe(mulDiv(300_000_000, 24, 100));
    expect(on.splitDetail!.land.appurtenantLthd).toMatchObject({ houseHoldingYears: 4, table1Applied: true, changedFromOwnYears: true });
    expect(on.longTermHoldingDeduction).toBe(ded);
    expect(hasNotice(on)).toBe(true);
    // 일반 경로(특례 off)의 파트별 공제율과 같은 파트 값
    const off = calculateTransferTax(house({ ...o, rhe: false }), rates);
    expect(off.splitDetail!.land.longTermRate).toBeCloseTo(0.26, 12);
    expect(off.splitDetail!.building.longTermRate).toBeCloseTo(0.24, 12);
    expect(Math.abs(on.totalTax - off.totalTax)).toBeLessThanOrEqual(2);
  });

  it("A1(12억 이하) — 전액 비과세(STEP 1a 조기반환): 파트별 공제는 세액에 닿지 않고 on/off 모두 0", () => {
    const o = { S: 1_100_000_000, bldAcq: "2018-03-01", T: "2022-06-01", res: 24 } as const;
    const on = calculateTransferTax(house({ ...o, rhe: true }), rates);
    const off = calculateTransferTax(house({ ...o, rhe: false }), rates);
    expect(on.isExempt).toBe(true);
    expect(on.totalTax).toBe(0);
    expect(off.totalTax).toBe(0);
  });

  it("토지가 건물보다 짧다(토지 2014 · 건물 2008) — 토지 자신의 보유연수(일반 경로와 같다)", () => {
    const o = { S: 2_000_000_000, landAcq: "2014-09-01", bldAcq: "2008-07-01" } as const;
    const on = calculateTransferTax(house({ ...o, rhe: true }), rates);
    const off = calculateTransferTax(house({ ...o, rhe: false }), rates);
    expect(on.splitDetail!.land.appurtenantLthd).toBeUndefined();
    expect(on.splitDetail!.land.longTermRate).toBeCloseTo(0.56, 12); // 토지 9년 36% + 거주 5년 20%
    expect(on.splitDetail!.building.longTermRate).toBeCloseTo(0.6, 12); // 건물 15년 40% + 20%
    expect(Math.abs(on.totalTax - off.totalTax)).toBeLessThanOrEqual(2);
    expect(hasNotice(on)).toBe(false);
  });

  it("같은 날 취득 — 종전 단일 산식 그대로(합계 한 번 floor): gain95(표2) = 합계 − floor(합계 × 56%)", () => {
    // 파트별 floor면 1원 어긋나는 시료(gl%25 = gb%25 = 1) — 같은 날 취득이므로 종전 값이어야 한다
    const o = {
      S: 1_500_000_000, landAcq: "2014-09-01", bldAcq: "2014-09-01", rhe: true,
      landAcquisitionPrice: 199_999_999, buildingAcquisitionPrice: 99_999_999,
    } as const;
    const on = calculateTransferTax(house(o), rates);
    expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
    expect(on.rentalHousingExceptionDetail!.formulaTrace.gain95Table2).toBe(1_200_000_002 - 672_000_001);
  });

  it("파트 손실 0 하한 — 토지 양도차손(12억 − 12.5억)이어도 토지 공제 0, 건물분만 공제하고 주택분 양도소득금액에서 손실은 그대로 상계된다", () => {
    const o = { S: 1_500_000_000, bldAcq: "2018-09-01", rhe: true, landAcquisitionPrice: 1_250_000_000 } as const;
    const on = calculateTransferTax(house(o), rates);
    expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
    // 토지 −50,000,000 · 건물 3억 − 1억 = 200,000,000 → 합계 150,000,000. 건물 2018-09-01 → 5년 3개월 → 표2 20% + 거주 5년 20% = 40%.
    const ded = mulDiv(200_000_000, 40, 100); // 토지 손실 파트 공제 0
    expect(on.splitDetail!.land.longTermDeduction).toBe(0);
    expect(on.splitDetail!.building.longTermDeduction).toBe(ded);
    expect(on.rentalHousingExceptionDetail!.formulaTrace.gain95Table2).toBe(150_000_000 - ded);
  });

  it("다건 합산(aggregate) 경로도 단건과 같은 세액", () => {
    const o = { S: 2_000_000_000, bldAcq: "2018-03-01", T: "2022-06-01", res: 24, rhe: true } as const;
    const single = calculateTransferTax(house(o), rates);
    expect(single.rentalHousingExceptionDetail?.applied).toBe(true);
    const item = { ...house(o), propertyId: "p1", propertyLabel: "p1" } as unknown as TransferTaxItemInput;
    const agg = calculateTransferTaxAggregate({ taxYear: 2022, properties: [item], annualBasicDeductionUsed: 0 }, rates);
    expect(agg.totalTax).toBe(single.totalTax);
  });

  it("단일 자산(토지·건물 분리 없음) — 종전 단일 보유연수 그대로, 파트 echo 없음", () => {
    const single = baseTransferInput({
      propertyType: "housing", transferPrice: 2_000_000_000, acquisitionPrice: 500_000_000,
      acquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
      residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1,
      rentalHousingException: rentalA, expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const on = calculateTransferTax(single, rates);
    expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A2");
    expect(on.rentalHousingExceptionDetail!.formulaTrace.partsLthd).toBeUndefined();
    // 양도차익 15억 · 보유 9년 36% + 거주 5년 20% = 56%
    expect(on.rentalHousingExceptionDetail!.formulaTrace.gain95Table2).toBe(1_500_000_000 - mulDiv(1_500_000_000, 56, 100));
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. B 시나리오 — 직전거주주택보유주택(§161) 양도
// ══════════════════════════════════════════════════════════════════════
describe("§155⑳ B — 표1·표2 모두 파트별 (§161④)", () => {
  const rentalB: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
        businessRegistrationDate: D("2014-01-01"), rentalRegistrationDate: D("2014-01-01"),
        rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: true,
        region: "seoul-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 500_000_000,
        hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: D("2016-08-25"),
    standardPriceAtAcquisition: 300_000_000,
    standardPriceAtPriorTransfer: 450_000_000,
    standardPriceAtTransfer: 500_000_000,
    postRegistrationResidenceMonths: 30,
  };
  const bHouse = (S: number, over: Partial<Sample> = {}) =>
    ({ ...house({ S, area: 300, res: 30, ...over }), rentalHousingException: rentalB }) as TransferTaxInput;

  it("B1(12억 이하) — 토지 2008(15년 표1 30%) · 건물 2014(9년 18%): gain95(표1) = 파트별 표1 공제 후, 과세 = × §161① 0.75", () => {
    const r = calculateTransferTax(bHouse(800_000_000), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.scenarioId).toBe("RH-B1");
    // 토지 6.4억 − 2억 = 4.4억 · 건물 1.6억 − 1억 = 6천만 → 합계 5억
    const landGain = 640_000_000 - 200_000_000;
    const bldGain = 160_000_000 - 100_000_000;
    const ltc1 = mulDiv(landGain, 30, 100) + mulDiv(bldGain, 18, 100);
    expect(t.formulaTrace.gain95Table1).toBe(landGain + bldGain - ltc1);
    expect(t.taxableGain).toBe(mulDiv(landGain + bldGain - ltc1, 150_000_000, 200_000_000));
    // 카드가 읽는 파트 echo는 실제 적용 표(B = 표1) 값
    expect(r.splitDetail!.land.longTermRate).toBeCloseTo(0.3, 12);
    expect(r.splitDetail!.building.longTermRate).toBeCloseTo(0.18, 12);
  });

  it("B2(12억 초과) — gain95(표1)·gain95(표2) 둘 다 파트별: 표1 토지 30%·건물 18% / 표2 토지 max(30%, 36%+거주 0%=36%) = 36%·건물 36%", () => {
    const r = calculateTransferTax(bHouse(2_000_000_000), rates);
    const t = r.rentalHousingExceptionDetail!;
    expect(t.scenarioId).toBe("RH-B2");
    const landGain = 1_600_000_000 - 200_000_000;
    const bldGain = 400_000_000 - 100_000_000;
    const sum = landGain + bldGain;
    // 거주 30개월 = 2년 → 표2 거주분 8%: 토지 max(표1 30%, 36% + 8% = 44%) = 44% · 건물 9년 36% + 8% = 44% — 둘 다 44%라 단일 산식(합계 floor)
    const ltc2 = mulDiv(sum, 44, 100);
    const ltc1 = mulDiv(landGain, 30, 100) + mulDiv(bldGain, 18, 100);
    expect(t.formulaTrace.gain95Table1).toBe(sum - ltc1);
    expect(t.formulaTrace.gain95Table2).toBe(sum - ltc2);
    expect(t.formulaTrace.partsLthd!.land.appurtenant).toMatchObject({ houseHoldingYears: 9, table1Applied: false });
  });
});
