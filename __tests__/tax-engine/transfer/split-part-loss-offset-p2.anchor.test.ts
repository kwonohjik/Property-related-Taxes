/**
 * anchor: 파트 양도차손 통산 P2 — 계획서 `docs/02-design/features/transfer-split-part-loss-offset-p2.plan.md`
 *
 * A1 배율 초과·나중 취득 부수토지 경로가 파트 차손을 0으로 잘랐다(`applyHousingLandExclusions`) — 이제 **과세분만** 남겨
 *    「소득세법 시행령」 §167의2① 순서(1호 같은 세율 → 2호 다른 세율 안분)로 다른 파트에서 공제한다.
 *    12억 초과 고가주택이면 차손도 양도차익과 같은 비율로 안분해 과세분만 통산한다(사용자 결정 Q-1 — 비과세분 차손은 과세분과 통산하지 않는다, 상속증여세과-209).
 * B  다건에서 건물 차손은 자기 토지보다 **신고 전체의 같은 세율 자산**부터 공제된다(국심2007중3718 — 토지·건물은 각각의 자산).
 *    감면 자산의 차손 파트는 자산 안에서 먼저 통산한다(Q-2). 같은 자산 안 파트끼리의 통산은 통산 표·받은 차손에 싣지 않는다.
 *
 * 기대값은 독립 산식(모의 세율표 누진 8구간 `prog`)과 파트 소득금액으로 도출한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const item = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const multi = (year: number, items: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: year, properties: items, annualBasicDeductionUsed: 0 }, rates);
const stepOf = (r: ReturnType<typeof calculateTransferTax>) => r.steps.find((x) => x.label.includes("산출세액"))?.formula ?? "";

/** 주택 · 토지 2010 · 건물 2024-12-01(1년 미만 70%) · 양도 2025-09-01 · 정착 60㎡ / 1,200㎡ non_urban(배율 초과 600㎡) · 토지 +500,000,000 */
const excess = (buildingAcq: number, o: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 100_000_000 + buildingAcq, acquisitionCause: "purchase",
    acquisitionDate: D("2024-12-01"), isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 600_000_000, buildingTransferPrice: 400_000_000, landStandardPriceAtTransfer: 600_000_000, buildingStandardPriceAtTransfer: 400_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: buildingAcq, landAcquisitionDate: D("2010-01-01"), expenses: 0,
    buildingFootprintArea: 60, acquisitionArea: 1200, appurtenantLandZone: "non_urban", ...o,
  } as Partial<TransferTaxInput>);

describe("A1 배율 초과 경로 — 파트 차손을 자르지 않는다", () => {
  it("건물 차손 −50,000,000: 과세표준 347,500,000 → 297,500,000 (차손만큼 줄어든다)", () => {
    const base = calculateTransferTax(excess(400_000_000), rates);
    const r = calculateTransferTax(excess(450_000_000), rates);
    expect(base.taxBase).toBe(347_500_000);
    expect(r.splitDetail!.building.gain).toBe(-50_000_000);
    expect(r.taxBase).toBe(base.taxBase - 50_000_000);
    expect(stepOf(r)).toContain("건물 양도차손 50,000,000을 토지 양도소득금액에서 공제");
  });
  it("건물 차손 −200,000,000: 1호 같은 70% 배율 내 토지 175,000,000 → 2호 배율 초과 토지 25,000,000 · 남은 배율 초과분만 과세", () => {
    const r = calculateTransferTax(excess(600_000_000), rates);
    expect(r.taxBase).toBe(147_500_000);
    const f = stepOf(r);
    expect(f).toContain("건물 양도차손 175,000,000을 토지 양도소득금액에서 공제");
    expect(f).toContain("건물 양도차손 25,000,000을 배율 초과 토지(비사업용) 양도소득금액에서 공제");
    // 1호를 먼저 다 쓴다 — 2호부터 안분하면(175:250 비율) 배율 내 토지에 소득이 남는다
    expect(f).toContain("토지 70% 0");
  });
  it("자산 전체 차손이면 산출세액 0", () => {
    expect(calculateTransferTax(excess(900_000_000), rates).calculatedTax).toBe(0);
  });
  it("토지 차손 −100,000,000(배율 내 −50,000,000 · 배율 초과 −50,000,000)도 자르지 않는다 — 건물 +300,000,000에서 공제 · 과세표준 197,500,000", () => {
    const r = calculateTransferTax(excess(100_000_000, { landAcquisitionPrice: 700_000_000, acquisitionPrice: 800_000_000 }), rates);
    expect(r.taxBase).toBe(197_500_000);
    expect(r.calculatedTax).toBe(Math.floor(197_500_000 * 0.7));
    expect(stepOf(r)).toContain("토지 양도차손 50,000,000을 건물 양도소득금액에서 공제");
    expect(stepOf(r)).toContain("배율 초과 토지(비사업용) 양도차손 50,000,000을 건물 양도소득금액에서 공제");
  });
});

describe("Q-1 12억 초과 고가주택 — 차손도 안분해 과세분만 통산 (정상 경로: 배율 초과 없음)", () => {
  /** 1세대1주택 · 양도 24억(12억 초과 비율 1/2) · 토지 2010 · 건물 2024-12-01 · 토지 +1,400,000,000 · 건물 −200,000,000 */
  const highValue = (): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing", transferPrice: 2_400_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 1_200_000_000, acquisitionCause: "purchase",
      acquisitionDate: D("2015-01-01"), isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 0, isSeparateAcquisition: true,
      landAcqMode: "actual", buildingAcqMode: "actual", landTransferPrice: 1_600_000_000, buildingTransferPrice: 800_000_000,
      landStandardPriceAtTransfer: 1_600_000_000, buildingStandardPriceAtTransfer: 800_000_000, landAcquisitionPrice: 200_000_000,
      buildingAcquisitionPrice: 1_000_000_000, landAcquisitionDate: D("2010-01-01"), expenses: 0,
    } as Partial<TransferTaxInput>);
  it("파트 과세 양도차익 = 양도차익 × 1/2 (차손 파트 포함) · Σ파트 = 자산 과세 양도차익", () => {
    const r = calculateTransferTax(highValue(), rates);
    expect(r.isPartialExempt).toBe(true);
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(700_000_000);
    expect(r.splitDetail!.building.taxableGainAfterProration).toBe(-100_000_000);
    expect(r.splitDetail!.land.taxableGainAfterProration! + r.splitDetail!.building.taxableGainAfterProration!).toBe(r.taxableGain);
  });
});

/** M-1 — 구주택 멸실·신축 통산 자산(토지 기본세율 · 건물 8개월 70% · 건물 −9,000,000) + 1년 미만 주택 +100,000,000(70%) */
const rebuild = baseTransferInput({
  propertyType: "housing", transferPrice: 1_000_000_000, transferDate: D("2025-09-01"), acquisitionPrice: 450_000_000, acquisitionCause: "purchase",
  acquisitionDate: D("2025-01-01"), isOneHousehold: false, householdHousingCount: 2, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "estimated",
  landTransferPrice: 700_000_000, buildingTransferPrice: 300_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 300_000_000,
  landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 250_000_000, landAcquisitionDate: D("2022-01-01"),
  standardPricePerSqmAtAcquisition: 1_000_000, acquisitionArea: 200, standardPriceAtAcquisition: 500_000_000, buildingStandardPriceAtAcquisition: 300_000_000,
  landRebuildPriorHouse: { startMode: "since_land", footprintUnchanged: true, demolitionDate: D("2023-05-31") },
} as Partial<TransferTaxInput>);
const shortHouse = baseTransferInput({
  propertyType: "housing", transferPrice: 600_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2025-03-01"), transferDate: D("2025-09-01"),
  isOneHousehold: false, householdHousingCount: 2, expenses: 0,
} as Partial<TransferTaxInput>);

describe("B 다건 — 건물 차손은 신고 전체의 같은 세율 자산부터", () => {
  const r = multi(2025, [item(rebuild, "a"), item(shortHouse, "b")]);
  it("통산 표: [a 건물] → [b] 9,000,000 (1호 같은 세율) · 같은 자산 안 행 없음", () => {
    expect(r.lossOffsetTable).toEqual([{ fromPropertyId: "a", fromPart: "building", toPropertyId: "b", amount: 9_000_000, scope: "same_group" }]);
  });
  it("통산 후 소득: a는 토지 470,000,000 그대로(자산 안에서 공제하지 않음) · b는 100,000,000 − 9,000,000", () => {
    expect(r.properties.map((p) => p.incomeAfterOffset)).toEqual([470_000_000, 91_000_000]);
    const a = r.properties[0];
    expect(a.income).toBe(461_000_000);
    expect(a.lossOffsetFromSameGroup + a.lossOffsetFromOtherGroup).toBe(0);
  });
  it("산출세액 = 토지 prog(과세표준) + b 70% — 자산 안에서 먼저 통산(A) 226,710,000보다 작다", () => {
    expect(r.calculatedTax).toBe(224_009_999);
  });
  it("자산 1건이면 단건과 같다(통산할 다른 자산 없음 → 자기 토지)", () => {
    expect(multi(2025, [item(rebuild, "a")]).calculatedTax).toBe(calculateTransferTax(rebuild, rates).calculatedTax);
  });
});

describe("B 경계 — 같은 세율 자산이 다 못 받는 차손 · 순손실 자산 · 주고받기", () => {
  it("S1 같은 세율 b의 소득(5,000,000)이 부족하면 나머지 4,000,000은 자기 토지(2호)에서 — 자기 행은 표·받은 차손에 없다", () => {
    const r = multi(2025, [item(rebuild, "a"), item(baseTransferInput({ ...shortHouse, transferPrice: 505_000_000 } as Partial<TransferTaxInput>), "b")]);
    expect(r.lossOffsetTable).toEqual([{ fromPropertyId: "a", fromPart: "building", toPropertyId: "b", amount: 5_000_000, scope: "same_group" }]);
    const a = r.properties[0];
    expect(a.lossOffsetFromSameGroup + a.lossOffsetFromOtherGroup).toBe(0);
    expect(a.incomeAfterOffset).toBe(466_000_000);
    expect(r.calculatedTax).toBe(159_460_000);
  });
  it("S2 a가 자산 전체로는 400,000뿐이어도 건물 차손 9,000,000이 b로 가면 토지 9,400,000이 남아 토지 세율로 과세", () => {
    const r = multi(2025, [item(baseTransferInput({ ...rebuild, landAcquisitionPrice: 690_000_000 } as Partial<TransferTaxInput>), "a"), item(shortHouse, "b")]);
    expect(r.properties.map((p) => [p.income, p.incomeAfterOffset])).toEqual([[400_000, 9_400_000], [100_000_000, 91_000_000]]);
    expect(r.calculatedTax).toBe(62_513_999);
  });
  it("S2b a가 자산 전체로 순손실(토지 +5,000,000 · 건물 −9,000,000 = −4,000,000)이어도 건물 차손이 b로 가면 토지 5,000,000이 남아 토지 세율로 과세 — 자산 단위(건물 70%)로 후퇴하지 않는다", () => {
    const r = multi(2025, [item(baseTransferInput({ ...rebuild, landAcquisitionPrice: 695_000_000 } as Partial<TransferTaxInput>), "a"), item(shortHouse, "b")]);
    expect(r.properties.map((p) => [p.income, p.incomeAfterOffset])).toEqual([[-4_000_000, 5_000_000], [100_000_000, 91_000_000]]);
    const a = r.properties[0] as unknown as { splitDetail?: { partRateBasisApplied?: boolean } };
    expect(a.splitDetail?.partRateBasisApplied).toBe(true);
    // 독립 산식: b (100,000,000 − 9,000,000 − 기본공제 2,500,000) × 70% = 61,950,000 + a 토지 5,000,000 × 6% = 300,000 → 62,250,000.
    //   1원 차이는 `applyRate`의 소수 세율 부동소수 절사(memory `feedback_applyrate_fractional_rate_one_won_error`) — 자산 단위(건물 70%)였다면 5,000,000에도 70%가 붙는다.
    expect(r.calculatedTax).toBe(62_249_999);
  });
  it("S3 a가 c의 차손 20,000,000을 받고(토지 — 같은 누진 세율) 자기 건물 차손 9,000,000을 b에 준다 — 461 − 20 + 9 = 450(백만)", () => {
    const lossLong = baseTransferInput({
      propertyType: "housing", transferPrice: 480_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2015-03-01"), transferDate: D("2025-09-01"),
      isOneHousehold: false, householdHousingCount: 2, expenses: 0,
    } as Partial<TransferTaxInput>);
    const r = multi(2025, [item(rebuild, "a"), item(shortHouse, "b"), item(lossLong, "c")]);
    expect(r.lossOffsetTable).toEqual([
      { fromPropertyId: "c", toPropertyId: "a", amount: 20_000_000, scope: "same_group" },
      { fromPropertyId: "a", fromPart: "building", toPropertyId: "b", amount: 9_000_000, scope: "same_group" },
    ]);
    expect(r.properties[0].incomeAfterOffset).toBe(450_000_000);
    expect(r.calculatedTax).toBe(216_009_999);
  });
});

describe("B 비주택 — 1년 6개월 건물 차손이 다른 1년 6개월 건물(40%)에서 먼저 공제", () => {
  const nonHouse = baseTransferInput({
    propertyType: "building", transferPrice: 1_000_000_000, transferDate: D("2023-03-20"), acquisitionPrice: 650_000_000, acquisitionDate: D("2021-09-20"),
    landAcquisitionDate: D("2010-03-20"), isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 650_000_000, buildingTransferPrice: 350_000_000, landStandardPriceAtTransfer: 650_000_000, buildingStandardPriceAtTransfer: 350_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 450_000_000, expenses: 0,
  } as Partial<TransferTaxInput>);
  const other = baseTransferInput({
    propertyType: "building", transferPrice: 400_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2021-09-20"), transferDate: D("2023-03-20"),
    isOneHousehold: false, householdHousingCount: 1, expenses: 0,
  } as Partial<TransferTaxInput>);
  it("[a 건물] → [b] 100,000,000 · a 토지 333,000,000 그대로 · 산출세액 106,260,000 (A였으면 107,600,000)", () => {
    const r = multi(2023, [item(nonHouse, "a"), item(other, "b")]);
    expect(r.lossOffsetTable).toEqual([{ fromPropertyId: "a", fromPart: "building", toPropertyId: "b", amount: 100_000_000, scope: "same_group" }]);
    expect(r.properties.map((p) => p.incomeAfterOffset)).toEqual([333_000_000, 0]);
    expect(r.calculatedTax).toBe(106_260_000);
  });
  it("Q-2 감면 자산(§77)의 차손 파트는 자산 안에서 먼저 통산 — 표에 파트 행이 없고 단건 감면소득과 같다", () => {
    const E77 = { type: "public_expropriation", cashCompensation: 1_000_000_000, bondCompensation: 0, businessApprovalDate: D("2022-06-01") };
    const reduced = baseTransferInput({ ...nonHouse, reductions: [E77] } as Partial<TransferTaxInput>);
    const r = multi(2023, [item(reduced, "a"), item(other, "b")]);
    expect(r.lossOffsetTable.some((row) => row.fromPart !== undefined)).toBe(false);
    expect(r.properties[0].income).toBe(233_000_000);
  });
});
