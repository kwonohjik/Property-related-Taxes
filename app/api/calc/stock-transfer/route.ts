/**
 * 주식 양도소득세 계산 API Route (14지점 ⑪⑭)
 *
 * POST /api/calc/stock-transfer
 *
 * Layer 1 (Orchestrator):
 *   Rate limit → Zod 검증 → coerceDates → calculateStockTransferTax → 결과 반환
 *
 * 법령: 소득세법 2026.4.21. 시행
 */

import { NextRequest, NextResponse } from "next/server";
import {
  calculateStockTransferTax,
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import {
  stockTransferInputSchema,
  stockTransferAggregateInputSchema,
  addStockRefines,
} from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ⑭ Route handler 엔진 Date 필드 목록 (coerceDates 전수 적용)
const STOCK_DATE_FIELDS = [
  "acquisitionDate",
  "transferDate",
  "priorYearEndDate",
  "listingDate",
  "filingDate",
  "decedentAcquisitionDate",
  "donorAcquisitionDate",
  "preMergerAcquisitionDate",
  // 분할 매수·분할 양도 (Plan v2.2) — coerceDates dot-notation 배열 표기
  "acquisitionLots[].acquisitionDate",
  "acquisitionLots[].decedentAcquisitionDate",
  "acquisitionLots[].preMergerAcquisitionDate",
  "transferLots[].transferDate",
] as const;

export async function POST(req: NextRequest) {
  // Rate limit (분당 30회)
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 다자산 합산 분기 감지 (items 배열이 있으면 aggregate 모드)
  if (typeof body === "object" && body !== null && "items" in body) {
    return handleAggregate(body);
  }

  // ⑨ Zod 검증 + ⑩ addStockRefines
  const refinedSchema = addStockRefines(stockTransferInputSchema);
  const parsed = refinedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // ⑭ Date 직렬화 변환 (string → Date)
  const rawInput = parsed.data as Record<string, unknown>;
  const coerced = coerceDates(rawInput, [...STOCK_DATE_FIELDS]);

  // ⑪ acquisitionDate fallback (body 직접 입력 또는 자산-수준 매핑)
  if (!coerced.acquisitionDate) {
    return NextResponse.json(
      { error: "acquisitionDate is required" },
      { status: 400 },
    );
  }

  // 엔진 input 조립
  const engineInput: StockTransferInput = {
    marketType: coerced.marketType as StockTransferInput["marketType"],
    isMajorShareholder: coerced.isMajorShareholder as boolean,
    selfShareRatio: coerced.selfShareRatio as number,
    selfMarketCap: coerced.selfMarketCap as number,
    isLargestShareholderGroup: coerced.isLargestShareholderGroup as boolean,
    combinedShareRatio: coerced.combinedShareRatio as number,
    combinedMarketCap: coerced.combinedMarketCap as number,
    priorYearEndDate: coerced.priorYearEndDate as Date,

    isQualifyingBlockShareholder: coerced.isQualifyingBlockShareholder as boolean,
    isHeavyRealEstateForRate: coerced.isHeavyRealEstateForRate as boolean,
    isHeavyRealEstateForValuation: coerced.isHeavyRealEstateForValuation as boolean,

    isSmallMediumEnterprise: coerced.isSmallMediumEnterprise as boolean,
    isMidsizeEnterprise: coerced.isMidsizeEnterprise as boolean,
    isListedSmallShareholder: coerced.isListedSmallShareholder as boolean,
    isVentureCompany: coerced.isVentureCompany as boolean,
    isKOTCTrading: coerced.isKOTCTrading as boolean,

    acquisitionDate: coerced.acquisitionDate as Date,
    transferDate: coerced.transferDate as Date,
    shareCount: coerced.shareCount as number,
    totalIssuedShares: coerced.totalIssuedShares as number,

    acquisitionCause: coerced.acquisitionCause as StockTransferInput["acquisitionCause"],
    decedentAcquisitionDate: coerced.decedentAcquisitionDate as Date | undefined,
    donorAcquisitionDate: coerced.donorAcquisitionDate as Date | undefined,
    preMergerAcquisitionDate: coerced.preMergerAcquisitionDate as Date | undefined,

    cumulativeTransferRatio: coerced.cumulativeTransferRatio as number | undefined,

    transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
    perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
    exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
    exchangeDebtRelief: coerced.exchangeDebtRelief as number | undefined,
    exchangeCash: coerced.exchangeCash as number | undefined,

    acquisitionMode: coerced.acquisitionMode as StockTransferInput["acquisitionMode"],
    perShareAcquisitionPrice: coerced.perShareAcquisitionPrice as number | undefined,

    transferDatePriceAvg1Month: coerced.transferDatePriceAvg1Month as number | undefined,
    listingDate: coerced.listingDate as Date | undefined,
    listingDatePriceAvg1Month: coerced.listingDatePriceAvg1Month as number | undefined,
    acquiredBeforeListing: coerced.acquiredBeforeListing as boolean,
    tradingHaltAtTransfer: coerced.tradingHaltAtTransfer as boolean,

    transferYearNetIncomePerShare: coerced.transferYearNetIncomePerShare as number | undefined,
    transferYearNetAssetPerShare: coerced.transferYearNetAssetPerShare as number | undefined,
    listingYearNetIncomePerShare: coerced.listingYearNetIncomePerShare as number | undefined,
    listingYearNetAssetPerShare: coerced.listingYearNetAssetPerShare as number | undefined,
    acquisitionYearNetIncomePerShare: coerced.acquisitionYearNetIncomePerShare as number | undefined,
    acquisitionYearNetAssetPerShare: coerced.acquisitionYearNetAssetPerShare as number | undefined,

    bookLost: coerced.bookLost as boolean,
    faceValuePerShare: coerced.faceValuePerShare as number | undefined,

    netAssetOnlyReason: coerced.netAssetOnlyReason as StockTransferInput["netAssetOnlyReason"],

    expenseMode: coerced.expenseMode as StockTransferInput["expenseMode"],
    actualExpenses: coerced.actualExpenses as number | undefined,

    filingType: coerced.filingType as StockTransferInput["filingType"],
    filingDate: coerced.filingDate as Date,
    isElectronicFiling: coerced.isElectronicFiling as boolean,
    isFraudulent: coerced.isFraudulent as boolean,
    isInternationalTransaction: coerced.isInternationalTransaction as boolean,

    realEstateGroupBasicDeductionUsed: coerced.realEstateGroupBasicDeductionUsed as number,
  };

  try {
    const result = calculateStockTransferTax(engineInput);
    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// 다자산 합산 핸들러
// ============================================================

function buildEngineInput(coerced: Record<string, unknown>): StockTransferInput {
  return {
    marketType: coerced.marketType as StockTransferInput["marketType"],
    isMajorShareholder: coerced.isMajorShareholder as boolean,
    selfShareRatio: coerced.selfShareRatio as number,
    selfMarketCap: coerced.selfMarketCap as number,
    isLargestShareholderGroup: coerced.isLargestShareholderGroup as boolean,
    combinedShareRatio: coerced.combinedShareRatio as number,
    combinedMarketCap: coerced.combinedMarketCap as number,
    priorYearEndDate: coerced.priorYearEndDate as Date,
    isQualifyingBlockShareholder: coerced.isQualifyingBlockShareholder as boolean,
    isHeavyRealEstateForRate: coerced.isHeavyRealEstateForRate as boolean,
    isHeavyRealEstateForValuation: coerced.isHeavyRealEstateForValuation as boolean,
    isSmallMediumEnterprise: coerced.isSmallMediumEnterprise as boolean,
    isMidsizeEnterprise: coerced.isMidsizeEnterprise as boolean,
    isListedSmallShareholder: coerced.isListedSmallShareholder as boolean,
    isVentureCompany: coerced.isVentureCompany as boolean,
    isKOTCTrading: coerced.isKOTCTrading as boolean,
    acquisitionDate: coerced.acquisitionDate as Date,
    transferDate: coerced.transferDate as Date,
    shareCount: coerced.shareCount as number,
    totalIssuedShares: coerced.totalIssuedShares as number,
    acquisitionCause: coerced.acquisitionCause as StockTransferInput["acquisitionCause"],
    decedentAcquisitionDate: coerced.decedentAcquisitionDate as Date | undefined,
    donorAcquisitionDate: coerced.donorAcquisitionDate as Date | undefined,
    preMergerAcquisitionDate: coerced.preMergerAcquisitionDate as Date | undefined,
    cumulativeTransferRatio: coerced.cumulativeTransferRatio as number | undefined,
    transferPriceMode: coerced.transferPriceMode as StockTransferInput["transferPriceMode"],
    perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
    exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
    exchangeDebtRelief: coerced.exchangeDebtRelief as number | undefined,
    exchangeCash: coerced.exchangeCash as number | undefined,
    acquisitionMode: coerced.acquisitionMode as StockTransferInput["acquisitionMode"],
    perShareAcquisitionPrice: coerced.perShareAcquisitionPrice as number | undefined,
    transferDatePriceAvg1Month: coerced.transferDatePriceAvg1Month as number | undefined,
    listingDate: coerced.listingDate as Date | undefined,
    listingDatePriceAvg1Month: coerced.listingDatePriceAvg1Month as number | undefined,
    acquiredBeforeListing: coerced.acquiredBeforeListing as boolean,
    tradingHaltAtTransfer: coerced.tradingHaltAtTransfer as boolean,
    transferYearNetIncomePerShare: coerced.transferYearNetIncomePerShare as number | undefined,
    transferYearNetAssetPerShare: coerced.transferYearNetAssetPerShare as number | undefined,
    listingYearNetIncomePerShare: coerced.listingYearNetIncomePerShare as number | undefined,
    listingYearNetAssetPerShare: coerced.listingYearNetAssetPerShare as number | undefined,
    acquisitionYearNetIncomePerShare: coerced.acquisitionYearNetIncomePerShare as number | undefined,
    acquisitionYearNetAssetPerShare: coerced.acquisitionYearNetAssetPerShare as number | undefined,
    bookLost: coerced.bookLost as boolean,
    faceValuePerShare: coerced.faceValuePerShare as number | undefined,
    netAssetOnlyReason: coerced.netAssetOnlyReason as StockTransferInput["netAssetOnlyReason"],
    expenseMode: coerced.expenseMode as StockTransferInput["expenseMode"],
    actualExpenses: coerced.actualExpenses as number | undefined,
    filingType: coerced.filingType as StockTransferInput["filingType"],
    filingDate: coerced.filingDate as Date,
    isElectronicFiling: coerced.isElectronicFiling as boolean,
    isFraudulent: coerced.isFraudulent as boolean,
    isInternationalTransaction: coerced.isInternationalTransaction as boolean,
    realEstateGroupBasicDeductionUsed: coerced.realEstateGroupBasicDeductionUsed as number,
  };
}

async function handleAggregate(body: unknown): Promise<NextResponse> {
  const parsed = stockTransferAggregateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items: rawItems, deductionMode } = parsed.data;

  // ⑭ 각 종목 Date 변환
  const engineInputs: StockTransferInput[] = rawItems.map((item) => {
    const coerced = coerceDates(item as Record<string, unknown>, [...STOCK_DATE_FIELDS]);
    return buildEngineInput(coerced);
  });

  try {
    const result = calculateStockTransferTaxAggregate(engineInputs, deductionMode);
    return NextResponse.json({ result, mode: "aggregate" }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
