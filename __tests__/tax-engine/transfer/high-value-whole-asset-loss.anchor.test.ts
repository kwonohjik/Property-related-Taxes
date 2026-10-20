/**
 * anchor — 1세대1주택 **고가주택 자산 전체 양도차손**은 기준금액 초과분만 다른 자산과 통산한다.
 *
 * [근거] 조심2016부0323(본문 확인): 고가주택은 양도차익이 나면 기준금액 이하분이 과세되지 않으므로 차손이 나도 그 이하분을 공제하는 것은 형평에 맞지 않고,
 *   영 §160의 「양도차익」에는 음수인 양도차손도 포함된다 — 고가주택 양도차손 중 기준금액 초과분만 다른 자산의 양도소득금액에서 공제한다.
 *   사용자 결정 Q-1(「12억 초과분에 대한 양도차손은 12억 초과분에 대한 양도차익과 통산 — 과세분만」)과 같다.
 * [결함] 차손 조기 반환이 `taxableGain = transferGain`(전액)이라 다건이 차손 전액을 통산했다(15억 · 차손 1억 → 다른 자산에서 1억 공제).
 *   또 자산 전체는 차손이어도 과세분이 양수인 경우(비과세 건물 차손 + 비사업용 배율 초과분 이익)를 단건이 세액 0으로 끝냈다.
 * [수정] 비과세·고가 판정이 난 차손 자산은 차익 경로와 같은 `resolveTaxableGain`으로 과세분을 정하고, 그 값이 양수면 정상 경로로 과세한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const oneHouse = (S: number, A: number) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: S, acquisitionPrice: A, acquisitionDate: D("2015-01-10"), transferDate: D("2024-06-01"),
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0,
  } as Partial<TransferTaxInput>);
/** 같은 해 토지(누진) — 양도 5억 · 취득 3억 */
const land = baseTransferInput({
  propertyType: "land", transferPrice: 500_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2019-01-10"), transferDate: D("2024-06-01"),
  isOneHousehold: false, householdHousingCount: 2, expenses: 0,
} as Partial<TransferTaxInput>);
const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const aggOf = (items: TransferTaxItemInput[]) => calculateTransferTaxAggregate({ taxYear: 2024, properties: items, annualBasicDeductionUsed: 0 }, rates);

describe("고가주택 자산 전체 차손 — 기준금액(12억) 초과분만 통산", () => {
  it("15억 · 차손 1억 → 과세 차손 floor(−1억 × 3억/15억) = −20,000,000 — 다른 자산에서 2천만만 공제(종전 1억)", () => {
    const s = calculateTransferTax(oneHouse(1_500_000_000, 1_600_000_000), rates);
    expect(s.transferGain).toBe(-100_000_000);
    expect(s.isPartialExempt).toBe(true);
    expect(s.taxableGain).toBe(-20_000_000);
    expect(s.totalTax).toBe(0);
    const a = aggOf([asItem(oneHouse(1_500_000_000, 1_600_000_000), "h"), asItem(land, "o")]);
    expect(a.properties[0].income).toBe(-20_000_000);
    expect(a.lossOffsetTable).toEqual([{ fromPropertyId: "h", toPropertyId: "o", amount: 20_000_000, scope: "same_group" }]);
    // 다른 자산 단독 신고와 비교 — 과세표준이 정확히 2천만 줄었다
    const alone = aggOf([asItem(land, "o")]);
    expect((alone as unknown as { taxBase: number }).taxBase - (a as unknown as { taxBase: number }).taxBase).toBe(20_000_000);
  });

  it("20억 · 차손 5억 → 과세 차손 −5억 × 8억/20억 = −200,000,000 — 다른 자산 소득(1.8억)을 전부 상쇄하고 남는 2천만은 소멸", () => {
    const s = calculateTransferTax(oneHouse(2_000_000_000, 2_500_000_000), rates);
    expect(s.taxableGain).toBe(-200_000_000);
    const a = aggOf([asItem(oneHouse(2_000_000_000, 2_500_000_000), "h"), asItem(land, "o")]);
    const o = a.properties[1];
    expect(a.lossOffsetTable).toEqual([{ fromPropertyId: "h", toPropertyId: "o", amount: o.income, scope: "same_group" }]);
    expect(o.income).toBeLessThan(200_000_000);
    expect(a.totalTax).toBe(0);
  });

  it("12억 이하(전액 비과세) 차손은 통산하지 않는다(상속증여세과-209) — 종전과 같다", () => {
    const a = aggOf([asItem(oneHouse(1_000_000_000, 1_100_000_000), "h"), asItem(land, "o")]);
    expect(a.properties[0].income).toBe(0);
    expect(a.lossOffsetTable).toEqual([]);
    expect(a.totalTax).toBe(aggOf([asItem(land, "o")]).totalTax);
  });

  it("입력 순서와 무관하다", () => {
    for (const [S, A] of [[1_500_000_000, 1_600_000_000], [2_000_000_000, 2_500_000_000]] as const) {
      const x = aggOf([asItem(oneHouse(S, A), "h"), asItem(land, "o")]).totalTax;
      const y = aggOf([asItem(land, "o"), asItem(oneHouse(S, A), "h")]).totalTax;
      expect(x).toBe(y);
    }
  });
});

describe("자산 전체는 차손이어도 과세분이 양수 — 비과세 건물 차손 + 비사업용 배율 초과분 이익", () => {
  // 10억(전액 비과세 대상) · 토지 8억 − 2.4억 = +5.6억 · 건물 2억 − 10억 = −8억 → 자산 −2.4억. 면적 1,200㎡(정착 60㎡ · 비도시 10배 한도 600㎡ → 초과 1/2)
  const house = () =>
    baseTransferInput({
      propertyType: "housing", transferPrice: 1_000_000_000, acquisitionPrice: 1, landTransferPrice: 800_000_000, buildingTransferPrice: 200_000_000,
      landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 200_000_000, landAcquisitionPrice: 240_000_000, buildingAcquisitionPrice: 1_000_000_000,
      acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
      isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual", buildingFootprintArea: 60, acquisitionArea: 1_200, appurtenantLandZone: "non_urban",
      residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
    } as never);

  it("배율 초과분 2.8억만 과세(건물 차손은 비과세분이라 통산하지 않는다) — 단건이 세액 0으로 끝나지 않는다 · 다건 1건 = 단건", () => {
    const s = calculateTransferTax(house(), rates);
    expect(s.transferGain).toBe(-240_000_000);
    expect(s.splitDetail!.nonBusinessLandPart!.gain).toBe(280_000_000);
    expect(s.splitDetail!.land.taxableGainAfterProration).toBe(0);
    expect(s.splitDetail!.building.taxableGainAfterProration).toBe(0);
    expect(s.taxableGain).toBe(280_000_000);
    // 장특 표1(토지 보유 9년 18%) 50,400,000 → 소득 229,600,000 · 기본공제 2,500,000 → 과세표준 227,100,000
    expect(s.longTermHoldingDeduction).toBe(50_400_000);
    expect(s.taxBase).toBe(227_100_000);
    expect(s.totalTax).toBeGreaterThan(0);
    expect(aggOf([asItem(house(), "h")]).totalTax).toBe(s.totalTax);
  });
});
