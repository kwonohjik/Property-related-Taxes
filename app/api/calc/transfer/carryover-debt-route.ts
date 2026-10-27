/**
 * 양도소득세 route 5-a-4 — 이월과세(소득세법 §97의2) × 당초 증여 때 인수한 채무 부분(매입분).
 *
 * 단건 route(5-b)는 `calculateTransferTax`를 직접 불러 집계를 거치지 않는다. 채무 부분을 시나리오 A에서 증여분·매입분 두 자산으로 나누려면
 * §103②·§104⑤·§102②가 한 곳에서 도는 신고 단위 집계가 필요하다 — 단건을 카드 1장짜리 집계 입력으로 바꿔 집계에 보내고, 응답을
 * `mode:"bundled"`로 돌려준다(조각은 집계의 파생 단위 — `transfer-tax-aggregate-debt-units.ts`). 설계서 §2.
 *
 * 채무가 없으면(`carryoverDebtShareOf === null`) `null`을 돌려주어 route가 5-b로 넘어간다(회귀 0).
 * ⚠️ 성공 응답은 route가 `okJson`으로 감싼다 — 여기서 `NextResponse`를 만들지 않는다(E-14l 비유한 값 가드).
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregateWithUnits, type AggregateTransferInput, type AggregateTransferResult, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { carryoverDebtShareOf } from "@/lib/tax-engine/carryover-debt-pieces";
import { aggregateWithSameDayRightWarning } from "@/lib/tax-engine/one-house/same-day-right";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { BundledApportionmentResult } from "@/lib/tax-engine/types/bundled-sale.types";

const KIND = { housing: "housing", land: "land", building: "building" } as const;
const LABEL = { housing: "주 자산(주택)", land: "주 자산(토지)", building: "주 자산" } as const;

/** 표시 전용 안분 표 — 최종 카드에서 만든다(채택이 B면 한 행, A면 증여분·매입분 두 행). 세액에는 쓰이지 않는다. */
function buildApportionment(aggregated: AggregateTransferResult, engineInput: TransferTaxInput): BundledApportionmentResult {
  const kind = KIND[engineInput.propertyType as keyof typeof KIND] ?? "building";
  const total = aggregated.properties.reduce((s, p) => s + p.transferPrice, 0);
  return {
    apportioned: aggregated.properties.map((p) => ({
      assetId: p.propertyId,
      assetLabel: p.propertyLabel ?? "",
      assetKind: kind,
      allocatedSalePrice: p.transferPrice,
      allocatedAcquisitionPrice: p.acquisitionPrice,
      allocatedExpenses: p.necessaryExpense ?? 0,
      displayRatio: total > 0 ? p.transferPrice / total : 1,
      standardPriceAtTransfer: engineInput.standardPriceAtTransfer ?? 0,
      standardPriceAtAcquisition: engineInput.standardPriceAtAcquisition,
      saleMode: "actual" as const,
    })),
    totalStandardAtTransfer: 0,
    residualAbsorbedBy: null,
    legalBasis: TRANSFER.CARRYOVER_DEBT_PURCHASED_PART,
    warnings: [],
  };
}

export function calculateCarryoverDebtTransfer(engineInput: TransferTaxInput, rates: TaxRatesMap, transferDate: Date) {
  if (engineInput.acquisitionCause !== "carryover_gift" || !carryoverDebtShareOf(engineInput.carryoverTaxation)) return null;

  const item = {
    ...engineInput,
    propertyId: "primary",
    propertyLabel: LABEL[engineInput.propertyType as keyof typeof LABEL] ?? "주 자산",
    // 가산세는 신고서 단위로만 부과한다 — 아래 집계 입력에 직접 넘긴다(자산-수준에도 실리면 둘 다 부과된다).
    filingPenaltyDetails: undefined,
    delayedPaymentDetails: undefined,
  } as unknown as TransferTaxItemInput;

  const aggregateInput: AggregateTransferInput = {
    taxYear: transferDate.getFullYear(),
    properties: [item],
    annualBasicDeductionUsed: engineInput.annualBasicDeductionUsed,
    priorReductionUsage: engineInput.priorReductionUsage ?? [],
    amendment: engineInput.amendment,
    filingPenaltyDetails: engineInput.filingPenaltyDetails,
    delayedPaymentDetails: engineInput.delayedPaymentDetails,
    // 같은 날 양도 조각 사이 기본공제 동순위 — 일괄양도와 같은 규약(한계세율 높은 자산 → 자산 번호).
    sameDayEqualTaxOrder: "marginalRateThenAssetNumber",
  };
  const calc = calculateTransferTaxAggregateWithUnits(aggregateInput, rates, undefined, []);
  const aggregated = aggregateWithSameDayRightWarning(engineInput, calc.result, [item], (heldItems) =>
    calculateTransferTaxAggregateWithUnits({ ...aggregateInput, properties: heldItems }, rates, undefined, []).result,
  );
  return { mode: "bundled" as const, apportionment: buildApportionment(aggregated, engineInput), aggregated };
}
