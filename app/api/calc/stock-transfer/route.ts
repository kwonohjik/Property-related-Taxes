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
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";
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
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { finiteJson } from "@/lib/api/non-finite-guard";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { AggregateStockItemInput } from "@/lib/tax-engine/stock-transfer/foreign-stock-aggregate-adapter";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildExitTaxEngineInput } from "@/lib/api/stock-transfer-exit-tax-engine-input";
import { taxCalculationErrorResponse } from "@/lib/api/tax-error-response";
import { toDate } from "@/lib/api/date-coerce";

// ⑭ Route handler 엔진 Date 필드 목록 — 단일 소스는 `lib/api/stock-transfer-date-fields.ts`

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
    return finiteJson({ result }, { status: 200 });
  } catch (err) {
    // 엔진 입력 오류(예: 가업상속 lot이 법정량 종류와 다른 시대의 매도에 배정) — 422 · 문구 그대로
    if (err instanceof TaxCalculationError) return NextResponse.json({ error: err.message }, { status: 422 });
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ============================================================
// 다자산 합산 핸들러
// ============================================================


async function handleAggregate(body: unknown): Promise<NextResponse> {
  const parsed = stockTransferAggregateInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items: rawItems, deductionMode, preliminaryPaidTax, preliminaryPaidLocalTax } =
    parsed.data;

  // ⑭ 각 종목 Date 변환 — 국내/국외를 **종목마다** 갈라 매핑한다.
  //    `marketType`이 종목 축이라 한 배열에 국내주식과 국외주식이 섞일 수 있다
  //    (§102①2호 통산·§103①2호 공동 기본공제가 그것을 요구한다).
  const engineInputs: AggregateStockItemInput[] = rawItems.map((item) => {
    const raw = item as Record<string, unknown>;
    if (raw.marketType === "foreign_stock") return buildForeignEngineInput(raw);
    return buildEngineInput(coerceDates(raw, [...STOCK_DATE_FIELDS]));
  });

  try {
    // ⑭ §111③ 신고 단위 기납부세액 — 종목 배열이 아니라 **신고 옵션**으로 넘긴다.
    //    여기서 빠뜨리면 Zod를 통과한 값이 엔진에 도달하지 못해 정산이 조용히 사라진다.
    const result = calculateStockTransferTaxAggregate(engineInputs, deductionMode, {
      preliminaryPaidTax,
      preliminaryPaidLocalTax,
    });
    return finiteJson({ result, mode: "aggregate" }, { status: 200 });
  } catch (err) {
    if (err instanceof TaxCalculationError) return NextResponse.json({ error: err.message }, { status: 422 });
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
  // §97의2① 이월과세 — 증여자 취득일. 누락하면 문자열이 엔진에 도달해 ⓒⓓ 비교가 **조용히 false**가 된다
  //   (국외는 국내 `STOCK_DATE_FIELDS`가 아니라 이 목록을 쓴다)
  "donorAcquisitionDate",
  // 가산세 §47조의4 — 경과일수 기산에 쓰인다
  "paymentDeadline",
  "actualPaymentDate",
] as const;

/**
 * handleForeignStock — 해외주식 핸들러 (§94①3호다목 · §118②이 준용하는 §118의2~§118의4·§118의6)
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

  const engineInput = buildForeignEngineInput(parsed.data as Record<string, unknown>);

  try {
    const result = calculateStockTransferTax(engineInput);
    return finiteJson({ result }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * ⑭ 국외주식 Zod 출력 → 엔진 input 매핑 (Date 변환 포함).
 *
 * 🔑 **단건 `handleForeignStock`과 다종목 `handleAggregate`가 공유한다.** 이 매핑을 복제하면
 *   두 경로의 ⑭가 갈라져, 한쪽에만 새 필드가 도달하는 침묵 stripping이 생긴다
 *   ([[feedback_api_zod_schema_sync]]).
 */
function buildForeignEngineInput(rawInput: Record<string, unknown>): ForeignStockInput {
  // ⑭ Date 직렬화 변환 (string → Date)
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

  return {
    marketType: "foreign_stock",

    yearsResidentInKorea: coerced.yearsResidentInKorea as number,

    isListedForeignCorp: coerced.isListedForeignCorp as boolean,
    // ⑭ §104①12호가목 중소기업 10% (영 §157의3 2호 — 내국법인 해외상장 전용)
    isSmallMediumEnterprise: coerced.isSmallMediumEnterprise as boolean | undefined,
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
    capitalExpenditureExchangeRate: coerced.capitalExpenditureExchangeRate as number | undefined,
    transferCostForeign: coerced.transferCostForeign as number,
    transferCostExchangeRate: coerced.transferCostExchangeRate as number | undefined,

    // 신고축(가산세) — 국외주식도 같은 양도소득세 신고다(§110① **직접** 적용 · §118의8 아님)
    filingViolation: coerced.filingViolation as ForeignStockInput["filingViolation"],
    isFraudulent: coerced.isFraudulent as boolean | undefined,
    isInternationalTransaction: coerced.isInternationalTransaction as boolean | undefined,
    originalFiledTax: coerced.originalFiledTax as number | undefined,
    priorPaidTax: coerced.priorPaidTax as number | undefined,
    interestSurcharge: coerced.interestSurcharge as number | undefined,
    fraudulentPortion: coerced.fraudulentPortion as number | undefined,
    unpaidTax: coerced.unpaidTax as number | undefined,
    paymentDeadline: coerced.paymentDeadline as Date | undefined,
    actualPaymentDate: coerced.actualPaymentDate as Date | undefined,

    hasForeignTax: coerced.hasForeignTax as boolean,
    foreignTaxPaidForeign: coerced.foreignTaxPaidForeign as number | undefined,
    foreignTaxCurrencyCode: coerced.foreignTaxCurrencyCode as string | undefined,
    foreignTaxExchangeRate: coerced.foreignTaxExchangeRate as number | undefined,
    foreignTaxMethod: coerced.foreignTaxMethod as ForeignStockInput["foreignTaxMethod"],

    // ⑭ §97의2① 이월과세 — 필드를 하나씩 명시 매핑한다(빠지면 Zod를 통과해도 엔진에 도달하지 않는다).
    //    엔진 내부 전용 `carryover*`는 Zod가 strip하므로 여기서도 만들지 않는다.
    acquisitionCause: coerced.acquisitionCause as ForeignStockInput["acquisitionCause"],
    donorRelation: coerced.donorRelation as ForeignStockInput["donorRelation"],
    donorDeceased: coerced.donorDeceased as boolean | undefined,
    donorAcquisitionDate: coerced.donorAcquisitionDate as Date | undefined,
    donorAcquisitionMode: coerced.donorAcquisitionMode as ForeignStockInput["donorAcquisitionMode"],
    donorPerShareAcquisitionPriceForeign: coerced.donorPerShareAcquisitionPriceForeign as number | undefined,
    donorAcquisitionCurrencyCode: coerced.donorAcquisitionCurrencyCode as string | undefined,
    donorAcquisitionExchangeRate: coerced.donorAcquisitionExchangeRate as number | undefined,
    donorCapitalExpenditureForeign: coerced.donorCapitalExpenditureForeign as number | undefined,
    donorCapitalExpenditureExchangeRate: coerced.donorCapitalExpenditureExchangeRate as number | undefined,
    giftTaxAmount: coerced.giftTaxAmount as number | undefined,
    transferredAssetValue: coerced.transferredAssetValue as number | undefined,
    giftTaxableValue: coerced.giftTaxableValue as number | undefined,

    isElectronicFiling: coerced.isElectronicFiling as boolean,
  };
}

// ============================================================
// ⑭ PR-4B 국외전출세 Route 핸들러
// ============================================================

/**
 * handleExitTax — PR-4B §118의9~§118의16 국외전출세 핸들러
 *
 * ⑭ Route handler 엔진 input 매핑 + Date 변환 — 매핑은 `stock-transfer-exit-tax-engine-input.ts`가 소유한다
 * (⑫ Zod의 입력 결함 판정이 같은 매핑을 쓰므로 한 곳에 둔다).
 *
 * 주의 (디자인 §6.2 R2-04, 12.2):
 *   holdings[] 배열 내 acquisitionDate는 평면 coerceDates 미처리 대상 — 매핑이 holdings.map()에서 toDate() 개별 변환.
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   모드별 시가 미입력은 Zod superRefine에서 차단.
 *
 * 오류 응답: 엔진의 `TaxCalculationError(INVALID_INPUT)`는 400(`taxCalculationErrorResponse`) — Zod 최상위 refine이
 *   같은 엔진 판정으로 먼저 거르므로 이 분기는 refine이 놓친 조합의 안전망이다.
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

  // ⑭ 엔진 input 매핑 (ExitTaxInput) + Date 직렬화 변환
  const engineInput: ExitTaxInput = buildExitTaxEngineInput(parsed.data as Record<string, unknown>);

  try {
    const result = calculateStockTransferTax(engineInput);
    return finiteJson({ result }, { status: 200 });
  } catch (err) {
    if (err instanceof TaxCalculationError) return taxCalculationErrorResponse(err);
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
