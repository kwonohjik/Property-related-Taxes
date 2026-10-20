/**
 * anchor — 고가주택 + 배율 초과 부수토지의 **토지 차손**(재산세제과-915 회신 산식 부호 대칭 · 사용자 결정 2026-10-20 A안)
 *          + §155⑳ 특례 A의 배율 초과분 분리 자산이 다건 차손 통산에서 파트 행으로 들어간다(계획서 `transfer-split-part-loss-offset-p2.plan.md` §9).
 *
 * [결함 ①] 비과세(전액·일부)이면 토지 양도차익을 `Math.max(0, …)`로 잘라 배율 초과분(비사업용 토지 — 비과세 대상 아님) 차손까지 사라졌다.
 *   20억 · 토지 차손 2억: 초과 면적 0㎡면 과세 양도차익 40,000,000인데 초과 60㎡가 생기면 120,000,000(세액 0 → 6,943,200).
 * [근거] 조심2016부0323 — 영 §160①의 「양도차익」에는 음수인 양도차손도 포함되고 고가주택 차손은 기준금액 초과분만 통산한다. 915 회신은 이익만 전제(차손 언급 없음).
 * [수정] 초과분 = floor(토지 차손 × 초과 비율)을 그대로 과세분 차손으로 두고, 기준면적 이내분 = min(0, 안분(전체 토지) − 초과분)(이익의 「없는 것으로 본다」와 대칭).
 *
 * [결함 ④] §155⑳ 특례 A의 배율 초과분 분리 자산은 다건 통산에서 자산 한 행이라 다른 자산 차손이 같은 세율 파트에 먼저 가지 않았다(on ≠ off).
 *   또 특례 경로는 토지 차손이거나 초과분이 자산 양도차익 이상이면 배율 초과분 분리를 포기해 비사업용 초과분까지 특례로 비과세했다.
 *
 * 기대값은 정수 산식으로 독립 도출한다(격자는 같은 사실의 일반 경로를 정본으로 한다).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const unit = {
  businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
  rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
  standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
};
const rentalA = { applyException: true, scenario: "A", rentalUnits: [unit] };

/** 분리 취득 1세대1주택 — 토지 80% · 건물 20% 양도가, 토지·건물 취득가는 양도가 대비 배수(lp·bp), 정착면적 60㎡ · 비도시(배율 10배 → 한도 600㎡). */
function house(S: number, lp: number, bp: number, area: number, o: { la?: string; rhe?: unknown } = {}): TransferTaxInput {
  const landT = Math.floor(S * 0.8);
  return baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: 1,
    landTransferPrice: landT, buildingTransferPrice: S - landT, landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: S - landT,
    landAcquisitionPrice: Math.floor(landT * lp), buildingAcquisitionPrice: Math.floor((S - landT) * bp),
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D(o.la ?? "2014-09-01"), transferDate: D("2024-06-01"),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: area, appurtenantLandZone: "non_urban" as const,
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    ...(o.rhe ? { rentalHousingException: o.rhe } : {}),
  } as never);
}
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (items: TransferTaxItemInput[]) => calculateTransferTaxAggregate({ taxYear: 2024, properties: items, annualBasicDeductionUsed: 0 }, rates);
const otherLand = (price: number, acq: string) =>
  baseTransferInput({
    propertyType: "land", transferPrice: price, acquisitionPrice: 300_000_000, acquisitionDate: D(acq), transferDate: D("2024-06-01"),
    isOneHousehold: false, householdHousingCount: 2, expenses: 0,
  } as Partial<TransferTaxInput>);

describe("① 일반 경로 — 토지 차손 + 배율 초과 (915 부호 대칭)", () => {
  // 20억 · 토지 16억 − 18억 = −2억 · 건물 4억 − 1억 = 3억 · 안분 비율 (20억 − 12억)/20억 = 0.4
  const input = (area: number) => house(2_000_000_000, 1.8e9 / 1.6e9, 0.25, area);

  it("초과 60㎡: 초과분 floor(−2억 × 60/660) = −18,181,819 · 이내분 −80,000,000 − (−18,181,819) = −61,818,181 · 건물 120,000,000 → 과세 양도차익 40,000,000", () => {
    const r = calculateTransferTax(input(660), rates);
    const landGain = -200_000_000;
    const excess = Math.floor((landGain * 60) / 660);
    expect(excess).toBe(-18_181_819);
    expect(r.splitDetail!.land.gain).toBe(landGain);
    expect(r.splitDetail!.nonBusinessLandPart!.gain).toBe(excess);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(Math.floor(landGain * 0.4) - excess);
    expect(r.splitDetail!.building.taxableGainAfterProration).toBe(120_000_000);
    expect(r.taxableGain).toBe(40_000_000);
  });

  it("초과 면적 유무로 과세 양도차익이 뛰지 않는다 — 300㎡(배율 이내)와 같은 40,000,000(종전 660㎡ 120,000,000 · 세액 6,943,200)", () => {
    const within = calculateTransferTax(input(300), rates);
    const over = calculateTransferTax(input(660), rates);
    expect(within.splitDetail!.nonBusinessLandPart).toBeUndefined();
    expect(within.taxableGain).toBe(40_000_000);
    expect(over.taxableGain).toBe(within.taxableGain);
    expect(over.totalTax).toBe(within.totalTax);
  });

  it("초과분 차손이 안분값보다 크면 이내분 0 — 이익의 「초과금액은 없는 것으로 본다」와 대칭(13억 · 900㎡ · 초과 비율 300/900)", () => {
    // 토지 10.4억 − 12.48억 = −2.08억 · 초과분 floor(−2.08억 × 300/900) = −69,333,334 · 안분 floor(−2.08억 × 1억/13억) = −16,000,000 → 이내분 min(0, +53,333,334) = 0
    const r = calculateTransferTax(house(1_300_000_000, 1.2, 0.1, 900), rates); // 건물 2.6억 − 2.6천만 = +2.34억 → 자산은 이익
    expect(r.splitDetail!.land.gain).toBe(-208_000_000);
    expect(r.splitDetail!.nonBusinessLandPart!.gain).toBe(-69_333_334);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
  });

  it("12억 이하(전액 비과세) — 이내 토지·건물은 0, 배율 초과분 차손은 과세분 차손으로 남는다", () => {
    // 10억 · 토지 8억 − 8.5억 = −5천만 · 건물 2억 − 1억 = 1억 · 초과분 floor(−5천만 × 60/660) = −4,545,455
    const r = calculateTransferTax(house(1_000_000_000, 8.5e8 / 8e8, 0.5, 660), rates);
    expect(r.splitDetail!.land.gain).toBe(-50_000_000);
    expect(r.splitDetail!.nonBusinessLandPart!.gain).toBe(-4_545_455);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
    expect(r.splitDetail!.building.taxableGainAfterProration).toBe(0);
    expect(r.taxableGain).toBe(-4_545_455);
    expect(r.totalTax).toBe(0);
  });
});

describe("① × ④ §155⑳ 특례 A — 단건 on = off = 다건 1건 (격자)", () => {
  it("양도가 4종 × 토지·건물 손익 6조합 × 면적 3종(이내 300㎡ · 초과 60㎡ · 초과 600㎡) — 총세액이 1원도 다르지 않다", () => {
    const bad: string[] = [];
    let applied = 0;
    let landLossWithExcess = 0;
    for (const S of [1_000_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000]) {
      for (const [lp, bp] of [[0.9, 1.2], [1.1, 0.5], [1.5, 0.5], [0.3, 1.5], [0.3, 5], [1.2, 1.5]] as const) {
        for (const area of [300, 660, 1200]) {
          const on = calculateTransferTax(house(S, lp, bp, area, { rhe: rentalA }), rates);
          const off = calculateTransferTax(house(S, lp, bp, area), rates);
          const agg = aggOf([asItem(house(S, lp, bp, area, { rhe: rentalA }), "p")]).totalTax;
          if (on.rentalHousingExceptionDetail?.applied) applied++;
          if ((on.splitDetail?.nonBusinessLandPart?.gain ?? 0) < 0) landLossWithExcess++;
          if (on.totalTax !== off.totalTax || agg !== on.totalTax) bad.push(`${S} ${lp}/${bp} ${area}㎡ on ${on.totalTax} off ${off.totalTax} 다건 ${agg}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(applied).toBeGreaterThanOrEqual(30);
    expect(landLossWithExcess).toBeGreaterThanOrEqual(4);
  });

  it("토지 이익 + 큰 건물 차손(초과분 ≥ 자산 양도차익 — 이 시료는 같다 40,000,000) — 특례 경로도 배율 초과분을 분리해 비사업용 초과분을 과세한다(종전 on 0 / off 6,946,500)", () => {
    const on = calculateTransferTax(house(1_000_000_000, 0.9, 1.2, 1200, { rhe: rentalA }), rates);
    const off = calculateTransferTax(house(1_000_000_000, 0.9, 1.2, 1200), rates);
    expect(on.rentalHousingExceptionDetail!.scenarioId).toBe("RH-A1");
    expect(on.splitDetail!.nonBusinessLandPart!.gain).toBeGreaterThanOrEqual(on.transferGain);
    expect(on.totalTax).toBeGreaterThan(0);
    expect(on.totalTax).toBe(off.totalTax);
  });
});

describe("④ 다른 자산과 함께 신고 — 특례 A 배율 초과 자산이 파트 행(이내 토지 · 건물 · 배율 초과분)으로 통산한다", () => {
  it("격자: 특례 on = off · 입력 순서 무관 (종전 30억 · 건물 차손 · 토지 4억: on 29,331,500 / off 42,564,500 류 22셀)", () => {
    const bad: string[] = [];
    let n = 0;
    for (const la of ["2008-07-01", "2014-09-01"]) {
      for (const S of [1_500_000_000, 2_000_000_000, 3_000_000_000]) {
        for (const [lp, bp] of [[0.3, 1.5], [0.3, 0.5], [1.2, 0.5], [0.3, 5]] as const) {
          for (const [op, oa] of [[400_000_000, "2019-01-10"], [400_000_000, "2024-01-10"], [200_000_000, "2019-01-10"]] as const) {
            const run = (rhe: unknown, rev = false) => {
              const xs = [asItem(house(S, lp, bp, 1200, { la, rhe }), "h"), asItem(otherLand(op, oa), "o")];
              return aggOf(rev ? xs.reverse() : xs).totalTax;
            };
            const on = run(rentalA);
            n++;
            if (on !== run(undefined) || on !== run(rentalA, true)) bad.push(`${la} ${S} ${lp}/${bp} o ${op}(${oa}) on ${on} off ${run(undefined)} 역순 ${run(rentalA, true)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(n).toBe(72);
  });

  it("독립 산식 — 30억 · 토지 이익 · 건물 차손(취득가 1.5배) + 같은 누진 세율 토지(+1억): 건물 차손 과세분이 그 토지에서 먼저 공제(1호)", () => {
    const h = house(3_000_000_000, 0.3, 1.5, 1200, { la: "2008-07-01", rhe: rentalA });
    const a = aggOf([asItem(h, "h"), asItem(otherLand(400_000_000, "2019-01-10"), "o")]);
    // 건물 6억 − 9억 = −3억 → 안분 floor(−3억 × 18/30) = −180,000,000(차손에 장특 없음)이 같은 누진인 o(+1억)와 h 이내 토지에 1호로 안분된다
    const rows = a.lossOffsetTable.filter((x) => x.fromPart === "building");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.scope === "same_group")).toBe(true);
    expect(rows.reduce((s, x) => s + x.amount, 0) + a.lossOffsetTable.filter((x) => x.fromPropertyId === "h" && x.toPropertyId === "h").length).toBeLessThanOrEqual(180_000_000);
    const off = aggOf([asItem(house(3_000_000_000, 0.3, 1.5, 1200, { la: "2008-07-01" }), "h"), asItem(otherLand(400_000_000, "2019-01-10"), "o")]);
    expect(a.totalTax).toBe(off.totalTax);
    expect(a.lossOffsetTable).toEqual(off.lossOffsetTable);
  });
});
