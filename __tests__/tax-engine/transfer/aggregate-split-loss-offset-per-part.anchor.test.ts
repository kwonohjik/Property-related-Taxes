/**
 * anchor: 다건 §102② 차손 통산 — 비주택 토지·건물 분리취득(split) 자산은 **파트 단위**로 「같은 세율을 적용받는 자산」
 * (「소득세법 시행령」 §167의2①1호)을 판정한다 (Q-F3a, 2026-10-16).
 *
 * [결함] 두 겹이었다.
 *   ① split 자산은 단건 결과에 호(`rateClause`)가 없어 통산 키가 `solo`가 되고, 「같은 세율 먼저」(1호)에서 늘 빠져
 *     2호(소득 비율 안분)로만 차손을 받았다.
 *   ② 받은 차손을 토지·건물 파트에 세율과 무관하게 **통산 전 파트 소득 비율**로 나눴다.
 *   토지 자산 + 건물 자산으로 따로 신고한 값과 양방향으로 갈렸다(차손 짝 격자 8,064셀 중 1,914셀, 최대 76,534,002).
 *
 * [수정] 비주택 split 자산을 통산 코어 앞에서 토지·건물 두 행으로 펼치고(파트마다 세율 키), 통산 후 파트 소득을
 *   다건 세액의 파트 안분 가중치로 넘긴다(`splitPartsForLossOffset` · `partIncomeWeights`). 코어는 그대로다.
 *   근거: 조세심판원 국심2007중3718(같은 거래의 토지·건물을 §102② 통산의 각각의 자산으로 봄) · 엔진의 파트별 세율(G-1)·
 *   다건 파트 유지(#2224)와의 정합. 계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-followups.plan.md` §3.
 *
 * 공통 구성: 양도일 2023-03-20 · 기본공제 기사용(연 한도 소진) · 모의 세율표(누진 8구간 · 1년 미만 50% · 1~2년 40%).
 */
import { describe, it, expect } from "vitest";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";

/** 비주택 split — 토지 `landOn`(차익 landSale − 200,000,000) · 건물 2018-03-20(5년, 차익 300,000,000 · 장특 10%). */
const split = (landOn: string, landSale: number) =>
  baseTransferInput({
    propertyType: "building", transferPrice: landSale + 600_000_000, transferDate: D(T),
    acquisitionPrice: 500_000_000, acquisitionDate: D("2018-03-20"), landAcquisitionDate: D(landOn),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: landSale, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: landSale, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
const separated = (landOn: string, landSale: number) => [
  baseTransferInput({
    propertyType: "land", transferPrice: landSale, acquisitionPrice: 200_000_000, acquisitionDate: D(landOn), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>),
  baseTransferInput({
    propertyType: "building", transferPrice: 600_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2018-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>),
];
/** 차손 짝 — 주택(2주택 · 6년 1개월 · 누진 1호). */
const houseLoss = (loss: number) =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 2_000_000_000 - loss, acquisitionPrice: 2_000_000_000, acquisitionDate: D("2017-02-20"),
    transferDate: D(T), isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 차손 짝 — 건물 8개월(1년 미만 50%). */
const bld50Loss = (loss: number) =>
  baseTransferInput({
    propertyType: "building", transferPrice: 2_000_000_000 - loss, acquisitionPrice: 2_000_000_000, acquisitionDate: D("2022-07-20"),
    transferDate: D(T), isOneHousehold: false, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const agg = (items: TransferTaxInput[]) =>
  calculateTransferTaxAggregate(
    { taxYear: 2023, properties: items.map((x, i) => asItem(x, `A${i}`)), annualBasicDeductionUsed: 2_500_000 },
    rates,
  );
const bothOrders = (p: TransferTaxInput, q: TransferTaxInput) => [agg([p, q]).totalTax, agg([q, p]).totalTax];

describe("F3-1 토지 8개월(50%) + 건물 5년(누진) split", () => {
  const P = () => split("2022-07-20", 250_000_000);
  const sep = () => separated("2022-07-20", 250_000_000);

  it("주택 누진 차손 3억 → 같은 세율(누진)인 건물을 먼저 지운다: 11,000,000 = 분리 신고 (종전 3,117,125)", () => {
    // 건물 270,000,000 ← 차손 270,000,000(1호 · 같은 세율) · 남은 30,000,000 → 토지 50,000,000 − 30,000,000 = 20,000,000
    // 토지 20,000,000 × 50% = 10,000,000 → 지방소득세 포함 11,000,000
    expect(bothOrders(P(), houseLoss(300_000_000))).toEqual([11_000_000, 11_000_000]);
    expect(agg([...sep(), houseLoss(300_000_000)]).totalTax).toBe(11_000_000);
  });

  it("건물 50% 차손 3억 → 같은 세율(50%)인 토지를 먼저 지운다: 1,914,000 = 분리 신고 (종전 3,117,125 — 방향이 반대)", () => {
    // 토지 50,000,000 ← 차손 50,000,000(1호) · 남은 250,000,000 → 건물 270,000,000 − 250,000,000 = 20,000,000
    // 건물 누진(20,000,000) = 14,000,000 × 6% + 6,000,000 × 15% = 1,740,000 → 1,914,000
    expect(bothOrders(P(), bld50Loss(300_000_000))).toEqual([1_914_000, 1_914_000]);
    expect(agg([...sep(), bld50Loss(300_000_000)]).totalTax).toBe(1_914_000);
  });

  it("통산 표는 자산 단위 — 파트 행이 같은 자산 쌍이면 한 줄로 합친다", () => {
    const r = agg([P(), houseLoss(300_000_000)]);
    expect(r.lossOffsetTable).toEqual([
      expect.objectContaining({ fromPropertyId: "A1", toPropertyId: "A0", amount: 270_000_000, scope: "same_group" }),
      expect.objectContaining({ fromPropertyId: "A1", toPropertyId: "A0", amount: 30_000_000, scope: "other_group" }),
    ]);
  });
});

describe("F3-2 대조 — 차손 짝이 없으면 종전 그대로", () => {
  it("이익 짝만 있는 신고는 파트 행으로 펼쳐도 통산이 없어 값이 같다(분리 신고와 같음)", () => {
    const gain = baseTransferInput({
      propertyType: "land", transferPrice: 700_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2010-01-01"), transferDate: D(T),
      isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0,
    } as Partial<TransferTaxInput>);
    const s = split("2022-07-20", 250_000_000);
    expect(agg([s, gain]).totalTax).toBe(agg([...separated("2022-07-20", 250_000_000), gain]).totalTax);
    expect(agg([s, gain]).lossOffsetTable).toEqual([]);
  });
});
