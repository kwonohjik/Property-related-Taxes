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
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import {
  stockTransferInputSchema,
  stockTransferAggregateInputSchema,
  addStockRefines,
  foreignStockInputSchema,
} from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ExitTaxInput, ExitTaxHolding } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";

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
  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
  "judgmentDateOverride",
  // 분할 매수·분할 양도 (Plan v2.2) — coerceDates dot-notation 배열 표기
  "acquisitionLots[].acquisitionDate",
  "acquisitionLots[].decedentAcquisitionDate",
  "acquisitionLots[].preMergerAcquisitionDate",
  "transferLots[].transferDate",
  // R-1' 매매사례가액 거래일
  "acquisitionMarketSampleDate",
  "transferMarketSampleDate",
  // R-2 자본조정 발생일
  "capitalAdjustments[].eventDate",
] as const;

export async function POST(req: NextRequest) {
  // Rate limit (분당 30회)
  const ip = getClientIp(req);
  const rateLimitResult = await checkRateLimit(ip, {
    bypass: shouldBypassRateLimit(req),
  });
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

  // ⑨ PR-4A 해외주식 분기 (marketType === "foreign_stock")
  if (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).marketType === "foreign_stock"
  ) {
    return handleForeignStock(body);
  }

  // ⑨ PR-4B 국외전출세 분기 (marketType === "exit_tax")
  if (
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).marketType === "exit_tax"
  ) {
    return handleExitTax(body);
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

  // 엔진 input 조립 — 단건·다자산 공통 매핑(buildEngineInput) 단일 진실 사용.
  // (과거 단건/다자산 인라인 중복으로 7필드 silent strip 발생 → 단일화로 근본 차단)
  const engineInput: StockTransferInput = buildEngineInput(coerced);

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
    isOnMarketTransaction: coerced.isOnMarketTransaction as boolean,
    // F-15·F-16 (2026-05-19) §157 2013.2.15.~ — 대차/사모펀드 자동 가산
    lentSharesCount: coerced.lentSharesCount as number,
    pefIndirectSharesCount: coerced.pefIndirectSharesCount as number,
    // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
    judgmentDateOverride: coerced.judgmentDateOverride as Date | undefined,
    judgmentBasis: coerced.judgmentBasis as "merger" | "split" | "split_new_entity" | "incorporation" | undefined,
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
    transferActualInputMode: coerced.transferActualInputMode as StockTransferInput["transferActualInputMode"],
    perShareTransferPrice: coerced.perShareTransferPrice as number | undefined,
    transferTotalPrice: coerced.transferTotalPrice as number | undefined,
    exchangePropertyValue: coerced.exchangePropertyValue as number | undefined,
    exchangeDebtRelief: coerced.exchangeDebtRelief as number | undefined,
    exchangeCash: coerced.exchangeCash as number | undefined,
    acquisitionMode: coerced.acquisitionMode as StockTransferInput["acquisitionMode"],
    perShareAcquisitionPrice: coerced.perShareAcquisitionPrice as number | undefined,
    transferDatePriceAvg1Month: coerced.transferDatePriceAvg1Month as number | undefined,
    acquisitionDatePriceAvg1Month: coerced.acquisitionDatePriceAvg1Month as number | undefined,
    transferStdInputMode: coerced.transferStdInputMode as "direct" | "daily" | undefined,
    listingDate: coerced.listingDate as Date | undefined,
    listingDatePriceAvg1Month: coerced.listingDatePriceAvg1Month as number | undefined,
    acquiredBeforeListing: coerced.acquiredBeforeListing as boolean,
    postListingDetail: coerced.postListingDetail as import("@/lib/tax-engine/stock-transfer/types/stock-transfer.types").PostListingDetailInput | undefined,
    tradingHaltAtTransfer: coerced.tradingHaltAtTransfer as boolean,
    transferYearNetIncomePerShare: coerced.transferYearNetIncomePerShare as number | undefined,
    transferYearNetAssetPerShare: coerced.transferYearNetAssetPerShare as number | undefined,
    listingYearNetIncomePerShare: coerced.listingYearNetIncomePerShare as number | undefined,
    listingYearNetAssetPerShare: coerced.listingYearNetAssetPerShare as number | undefined,
    acquisitionYearNetIncomePerShare: coerced.acquisitionYearNetIncomePerShare as number | undefined,
    acquisitionYearNetAssetPerShare: coerced.acquisitionYearNetAssetPerShare as number | undefined,
    bookLost: coerced.bookLost as boolean,
    faceValuePerShare: coerced.faceValuePerShare as number | undefined,
    // [사례 49] 취득시 장부분실 액면가 + 양도시 §165④ 보충 평가
    acqFaceValueOnly: coerced.acqFaceValueOnly as boolean | undefined,
    acqFaceValuePerShare: coerced.acqFaceValuePerShare as number | undefined,
    netAssetOnlyReason: coerced.netAssetOnlyReason as StockTransferInput["netAssetOnlyReason"],
    expenseMode: coerced.expenseMode as StockTransferInput["expenseMode"],
    actualExpenses: coerced.actualExpenses as number | undefined,
    filingType: coerced.filingType as StockTransferInput["filingType"],
    filingDate: coerced.filingDate as Date,
    isElectronicFiling: coerced.isElectronicFiling as boolean,
    filingViolation: coerced.filingViolation as StockTransferInput["filingViolation"],
    isFraudulent: coerced.isFraudulent as boolean,
    isInternationalTransaction: coerced.isInternationalTransaction as boolean,
    // R-1' 매매사례가액
    acquisitionMarketSamplePrice: coerced.acquisitionMarketSamplePrice as number | undefined,
    acquisitionMarketSampleDate: coerced.acquisitionMarketSampleDate as Date | undefined,
    acquisitionMarketSampleCounterparty: coerced.acquisitionMarketSampleCounterparty as string | undefined,
    transferMarketSamplePrice: coerced.transferMarketSamplePrice as number | undefined,
    transferMarketSampleDate: coerced.transferMarketSampleDate as Date | undefined,
    transferMarketSampleCounterparty: coerced.transferMarketSampleCounterparty as string | undefined,
    // R-2 자본조정
    capitalAdjustments: coerced.capitalAdjustments as StockTransferInput["capitalAdjustments"],
    realEstateGroupBasicDeductionUsed: coerced.realEstateGroupBasicDeductionUsed as number,

    // ── split 모드 (분할 매수·분할 양도 + lots-only 모드 합성) ──
    // ⑭ 동기화 지점 — TypeScript 미감지
    acquisitionLots: coerced.acquisitionLots as StockTransferInput["acquisitionLots"],
    transferLots: coerced.transferLots as StockTransferInput["transferLots"],
    costAllocationMethod: coerced.costAllocationMethod as StockTransferInput["costAllocationMethod"],
    specificMatchings: coerced.specificMatchings as StockTransferInput["specificMatchings"],
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

// ============================================================
// ⑭ PR-4A 해외주식 Route 핸들러
// ============================================================

/** ⑭ 해외주식 Date 필드 목록 (coerceDates 적용 — 평면 필드만) */
const FOREIGN_STOCK_DATE_FIELDS = [
  "transferDate",
  "acquisitionDate",
] as const;

/**
 * handleForeignStock — PR-4A §118의2~§118의8 해외주식 핸들러
 *
 * ⑭ Route handler 엔진 input 매핑 + coerceDates
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   환율·외화 단가 미입력 시 Zod superRefine에서 차단.
 */
async function handleForeignStock(body: unknown): Promise<NextResponse> {
  // ⑫ Zod 검증 (foreignStockInputSchema)
  const parsed = foreignStockInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // ⑭ Date 직렬화 변환 (string → Date)
  const rawInput = parsed.data as Record<string, unknown>;
  const coerced = coerceDates(rawInput, [...FOREIGN_STOCK_DATE_FIELDS]);

  // ⑭ FS-09: transferInstallmentReceipts[] 내 receiptDate 개별 toDate() 변환
  // 배열 내 Date는 평면 coerceDates로 미변환 — 배열 map으로 별도 처리 (디자인 R2-04 패턴)
  type RawReceipt = { receiptDate: unknown; amountForeign: number; exchangeRate: number };
  const rawReceipts = coerced.transferInstallmentReceipts as RawReceipt[] | undefined;
  const installmentReceipts = rawReceipts?.map((r) => ({
    receiptDate: toDate(r.receiptDate, "transferInstallmentReceipts[].receiptDate"),
    amountForeign: r.amountForeign,
    exchangeRate: r.exchangeRate,
  }));

  // ⑭ 엔진 input 매핑
  const engineInput: ForeignStockInput = {
    marketType: "foreign_stock",

    yearsResidentInKorea: coerced.yearsResidentInKorea as number,

    isListedForeignCorp: coerced.isListedForeignCorp as boolean,
    stockName: coerced.stockName as string,
    countryCode: coerced.countryCode as string,

    shareCount: coerced.shareCount as number,
    transferDate: coerced.transferDate as Date,
    transferPriceMode: coerced.transferPriceMode as ForeignStockInput["transferPriceMode"],
    perShareTransferPriceForeign: coerced.perShareTransferPriceForeign as number | undefined,
    totalTransferPriceForeign: coerced.totalTransferPriceForeign as number | undefined,
    transferCurrencyCode: coerced.transferCurrencyCode as string,
    transferExchangeRate: coerced.transferExchangeRate as number,

    // FS-09 §178의5② 분할 수령 — ⑭ 매핑
    transferReceiptMode: (coerced.transferReceiptMode as ForeignStockInput["transferReceiptMode"]) ?? "single",
    transferInstallmentReceipts: installmentReceipts,

    acquisitionDate: coerced.acquisitionDate as Date,
    acquisitionMode: coerced.acquisitionMode as ForeignStockInput["acquisitionMode"],
    perShareAcquisitionPriceForeign: coerced.perShareAcquisitionPriceForeign as number | undefined,
    acquisitionCurrencyCode: coerced.acquisitionCurrencyCode as string,
    acquisitionExchangeRate: coerced.acquisitionExchangeRate as number,

    capitalExpenditureForeign: coerced.capitalExpenditureForeign as number,
    transferCostForeign: coerced.transferCostForeign as number,

    hasForeignTax: coerced.hasForeignTax as boolean,
    foreignTaxPaidForeign: coerced.foreignTaxPaidForeign as number | undefined,
    foreignTaxCurrencyCode: coerced.foreignTaxCurrencyCode as string | undefined,
    foreignTaxExchangeRate: coerced.foreignTaxExchangeRate as number | undefined,
    foreignTaxMethod: coerced.foreignTaxMethod as ForeignStockInput["foreignTaxMethod"],

    isElectronicFiling: coerced.isElectronicFiling as boolean,
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
// ⑭ PR-4B 국외전출세 Route 핸들러
// ============================================================

/** ⑭ 국외전출세 평면 Date 필드 목록 (coerceDates 적용) */
const EXIT_TAX_DATE_FIELDS = [
  "departureDate",
  "actualTransferDate",
] as const;

/**
 * handleExitTax — PR-4B §118의9~§118의16 국외전출세 핸들러
 *
 * ⑭ Route handler 엔진 input 매핑 + coerceDates
 *
 * 주의 (디자인 §6.2 R2-04, 12.2):
 *   holdings[] 배열 내 acquisitionDate는 평면 coerceDates 미처리 대상.
 *   holdings.map() 내에서 toDate() 개별 변환 필수.
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   모드별 시가 미입력은 Zod superRefine에서 차단.
 */
async function handleExitTax(body: unknown): Promise<NextResponse> {
  // ⑫ Zod 검증 (exitTaxInputSchema)
  const parsed = exitTaxInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // ⑭ 평면 Date 직렬화 변환 (departureDate, actualTransferDate)
  const rawInput = parsed.data as Record<string, unknown>;
  const coerced = coerceDates(rawInput, [...EXIT_TAX_DATE_FIELDS]);

  // ⑭ holdings[] 배열 내 acquisitionDate 개별 Date 변환
  // (평면 coerceDates로 배열 내부 미변환 — 디자인 R2-04 정정)
  const rawHoldings = (coerced.holdings ?? []) as Array<Record<string, unknown>>;
  const holdings: ExitTaxHolding[] = rawHoldings.map((h) => ({
    id: h.id as string,
    stockName: h.stockName as string,
    marketType: h.marketType as ExitTaxHolding["marketType"],
    shareCount: h.shareCount as number,
    acquisitionDate: toDate(h.acquisitionDate, "holdings[].acquisitionDate"),
    perShareAcquisitionPrice: h.perShareAcquisitionPrice as number,
    departureDayValuationMode: h.departureDayValuationMode as ExitTaxHolding["departureDayValuationMode"],
    departureDayMarketPrice: h.departureDayMarketPrice as number | undefined,
    priorYearEndMonthAvg: h.priorYearEndMonthAvg as number | undefined,
    unlistedSamplePrice: h.unlistedSamplePrice as number | undefined,
    unlistedStdPricePerShare: h.unlistedStdPricePerShare as number | undefined,
  }));

  // ⑭ 엔진 input 매핑 (ExitTaxInput)
  const engineInput: ExitTaxInput = {
    marketType: "exit_tax",

    yearsResidentLast10: coerced.yearsResidentLast10 as number,
    departureDate: coerced.departureDate as Date,

    isMajorShareholder: coerced.isMajorShareholder as boolean,

    holdings,

    deferralRequested: coerced.deferralRequested as boolean,
    deferralReason: coerced.deferralReason as ExitTaxInput["deferralReason"],

    actualTransferDate: toOptionalDate(coerced.actualTransferDate),
    actualTransferPricePerShare: coerced.actualTransferPricePerShare as number | undefined,

    foreignTaxPaid: coerced.foreignTaxPaid as number | undefined,
    foreignTaxExclusionReason: coerced.foreignTaxExclusionReason as ExitTaxInput["foreignTaxExclusionReason"],

    domesticSourceTaxWithheld: coerced.domesticSourceTaxWithheld as number | undefined,

    hasFiledHoldingsReport: coerced.hasFiledHoldingsReport as boolean,
    totalFaceValue: coerced.totalFaceValue as number | undefined,
  };

  try {
    const result = calculateStockTransferTax(engineInput);
    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
