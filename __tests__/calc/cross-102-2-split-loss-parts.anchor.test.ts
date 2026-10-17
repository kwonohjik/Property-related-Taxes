/**
 * anchor: 부동산 ↔ 기타자산 §102② 크로스 통산 — 차손을 **파트 단위**로 통산하는 비주택 split 자산(Q-F3a)은
 * 크로스 레이어도 **같은 파트 행**으로 통산한다.
 *
 * [결함] 부동산 엔진은 split 자산을 토지·건물 두 행으로 통산하는데, 크로스 레이어(`buildCrossLossRows`)는 자산 한 행
 *   (`solo` 키)으로 통산해 기타자산에 주입할 통산 후 소득을 정했다. 두 배분이 달라 차손 3억이 318,918,918만큼
 *   공제됐다(이중 공제 18,918,918 — 리뷰 실측). 크로스 배선의 전제(「같은 배열 · 같은 순서라 두 결과가 일치」 —
 *   `cross-102-2-wiring.predo.anchor.test.ts`)가 깨진 것이다.
 *
 * [수정] 엔진이 자산별 결과에 파트 행(`lossOffsetParts`)을 내보내고, 크로스 레이어가 그 행으로 통산한 뒤 자산 단위로 접는다.
 * 대조 기준은 같은 split 자산을 토지 자산 + 건물 자산으로 따로 신고한 값이다.
 */
import { describe, it, expect } from "vitest";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { buildCrossInjection } from "@/lib/calc/cross-102-2-apply";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2023-03-20";

/** 비주택 split — 토지 8개월(차익 50,000,000 · 50%) · 건물 5년(차익 300,000,000 · 장특 10%). */
const split = () =>
  baseTransferInput({
    propertyType: "building", transferPrice: 850_000_000, transferDate: D(T),
    acquisitionPrice: 500_000_000, acquisitionDate: D("2018-03-20"), landAcquisitionDate: D("2022-07-20"),
    isOneHousehold: false, householdHousingCount: 1, isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landTransferPrice: 250_000_000, buildingTransferPrice: 600_000_000, landStandardPriceAtTransfer: 250_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 300_000_000, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
const separated = () => [
  baseTransferInput({
    propertyType: "land", transferPrice: 250_000_000, acquisitionPrice: 200_000_000, acquisitionDate: D("2022-07-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 0, isNonBusinessLand: false, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>),
  baseTransferInput({
    propertyType: "building", transferPrice: 600_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2018-03-20"), transferDate: D(T),
    isOneHousehold: false, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>),
];
/** 주택 차손 −300,000,000(2주택 · 6년 1개월 · 누진). */
const houseLoss = () =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 1_700_000_000, acquisitionPrice: 2_000_000_000, acquisitionDate: D("2017-02-20"),
    transferDate: D(T), isOneHousehold: false, householdHousingCount: 2, expenses: 0, annualBasicDeductionUsed: 0,
  } as Partial<TransferTaxInput>);
/** 기타자산(특정주식 — 누진) 양도소득금액 100,000,000 — 크로스 레이어가 읽는 필드만. */
const otherAsset = {
  basicDeductionGroup: "real_estate_and_other_asset",
  taxCategory: "other_asset_block_shareholder",
  isShortTermHolding: false,
  transferIncome: 100_000_000,
  isExempt: false,
} as unknown as StockTransferResult;

const asItem = (i: TransferTaxInput, id: string) => ({ ...i, propertyId: id, propertyLabel: id }) as unknown as TransferTaxItemInput;
const run = (items: TransferTaxInput[], external?: { id: string; income: number; rateKey: string; exempt: boolean }[]) =>
  calculateTransferTaxAggregate(
    {
      taxYear: 2023,
      properties: items.map((x, i) => asItem(x, `A${i}`)),
      annualBasicDeductionUsed: 2_500_000,
      ...(external ? { crossLossOffsetExternal: external } : {}),
    },
    rates,
  );

/** 1패스 → 주입 → 2패스. 부동산 흡수액(차손 자산 제외 Σ(통산 전 − 통산 후))과 기타자산 통산 후 소득. */
function cross(items: TransferTaxInput[]) {
  const injection = buildCrossInjection(run(items), otherAsset);
  if (!injection.ok) throw new Error(injection.reason);
  const pass2 = run(items, injection.injection.realEstateExternalRows);
  const realEstateAbsorbed = pass2.properties
    .filter((p) => p.income > 0)
    .reduce((s, p) => s + (p.income - p.incomeAfterOffset), 0);
  return { realEstateAbsorbed, otherAssetIncome: injection.injection.otherAssetIncome, outcome: injection.injection.outcome };
}

describe("크로스 통산 × split 파트 행", () => {
  it("차손 3억이 정확히 3억만 공제된다 — 부동산 218,918,918 + 기타자산 81,081,082 = 분리 신고", () => {
    const s = cross([split(), houseLoss()]);
    expect(s.realEstateAbsorbed + (100_000_000 - s.otherAssetIncome)).toBe(300_000_000);
    const sep = cross([...separated(), houseLoss()]);
    expect(sep.realEstateAbsorbed).toBe(218_918_918);
    expect(sep.otherAssetIncome).toBe(18_918_918);
    expect([s.realEstateAbsorbed, s.otherAssetIncome]).toEqual([sep.realEstateAbsorbed, sep.otherAssetIncome]);
  });

  it("화면 내역은 자산 단위 — split 자산은 한 줄이고 흡수액이 엔진 값과 같다", () => {
    const s = cross([split(), houseLoss()]);
    const rows = s.outcome.assets.filter((a) => a.id === "A0");
    expect(rows).toHaveLength(1);
    expect(rows[0].absorbed).toBe(s.realEstateAbsorbed);
  });
});
