/**
 * 신고서 split-2col × 배율 초과 부수토지(비사업용 토지 파트) 시료 — #17-2 anchor(`dec17-2-high-value-excess-915`)와 같은 입력 축.
 *
 * `sameDay` = 같은 날 취득(2012-01-02) 주택 · 토지 `area`㎡ · 정착 100㎡ · 수도권 주거지역(한도 300㎡) · 기준시가 안분.
 * `landFirst` = 토지 2008-07-01 먼저 · 건물 2014-09-01 · 도시지역 밖(배율 10) 660㎡ 정착 60㎡ → 초과 60㎡ · 실거래 구분 입력.
 * 값은 엔진을 실제로 돌린 결과(echo)다 — 표 값은 이 echo와 대조한다.
 */
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns, type RowDef } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

export const rates = makeMockRates();
const D = (s: string) => new Date(s);

export function sameDayInput(td: string, price: number, area: number, over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferDate: D(td), acquisitionDate: D("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0,
    useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
    buildingFootprintArea: 100, acquisitionArea: area, appurtenantLandZone: "metropolitan_residential",
    landAcquisitionDate: D("2012-01-02"),
    standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000, buildingStandardPriceAtAcquisition: 150_000_000,
    landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
    transferPrice: price, ...over,
  } as never);
}

export function landFirstInput(price: number, td = "2024-06-01"): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing", transferPrice: price, acquisitionPrice: 300_000_000,
    landTransferPrice: price * 0.8, buildingTransferPrice: price * 0.2,
    landStandardPriceAtTransfer: price * 0.8, buildingStandardPriceAtTransfer: price * 0.2,
    landAcquisitionPrice: 200_000_000, buildingAcquisitionPrice: 100_000_000,
    acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2008-07-01"), transferDate: D(td),
    isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
    buildingFootprintArea: 60, acquisitionArea: 660, appurtenantLandZone: "non_urban",
    residencePeriodMonths: 60, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
  } as never);
}

export const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);

export type Calc = ReturnType<typeof calc>;

/** 신고서 표의 행 → 열(total·land·building) 값 */
export function filingRows(result: Calc, price: number): Map<string, Record<string, number | string | null>> {
  const { mode } = deriveColumns(result);
  const rows: RowDef[] = buildRows(result, mode, undefined, undefined, price);
  return new Map(rows.map((r) => [r.label, r.values]));
}

export const LABEL = {
  gain: "전체 양도차익",
  exempt: "비과세 양도차익",
  taxable: "과세대상 양도차익",
  lt: "장기보유특별공제",
  hold: " 보유 기간분 장특",
  res: " 거주 기간분 장특",
  income: "양도소득금액",
} as const;
