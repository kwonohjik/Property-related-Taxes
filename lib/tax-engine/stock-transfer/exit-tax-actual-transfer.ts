/**
 * 국외전출세 — 종목별 실제 양도(경정청구 일반화) 입력 검증·계산 (순수 leaf, PR-7a)
 *
 * 법령(소득세법 2027.1.1. 시행본, KoreanLaw MCP 2026-11-27 실독):
 *   §118의12① 「실제 양도가액이 제118조의10제1항에 따른 양도가액보다 낮은 때」 [양도가액 − 실제 양도가액] × 「제118조의11에 따른 세율」을 산출세액에서 공제
 *   §118의13① 「해당 자산의 양도소득에 대하여 외국정부에 납부한 세액」 × [양도가액(§118의12①이면 실제 양도가액) − 필요경비] ÷ (실제 양도가액 − 필요경비),
 *             한도 = 「산출세액에서 조정공제액을 공제한 금액」
 *   §118의14① 「제119조제11호에 따른 비거주자의 국내원천소득으로 국내에서 과세되는 경우」 §156①7 금액을 한도 내 공제 · ② ①을 하면 §118의13① 적용 배제
 *   §119 11호 가목 내국법인 발행 주식 · 나목 외국법인 발행 주식(증권시장에 상장된 것만)
 *
 * 설계(사용자 결정 2026-11-27, 계획서 §2.2):
 *  - 종목마다 «실제 양도 주수 + 1주당 양도가»를 받는다. 양도하지 않은 주식은 계산에 넣지 않는다.
 *  - 조정공제는 **구분별 세율**: 구분 b마다 `산출세액(TB_b) − 산출세액(TB_b − 구분 b의 가액 하락분)` (1호 누진표 · 2호 스칼라). 단일 구분이면 종전 식과 같다.
 *  - 외국납부세액은 **종목별**로 받아 §118의13① 식을 종목마다 적용한다(총액을 종목에 자동 안분하지 않는다). 한도는 총액 기준(구분 간 귀속 규정 없음).
 *
 * 양도한 주수의 출국일 양도가액·필요경비 — **안분 나눗셈이 필요 없다**:
 *   국내 종목 = 1주당 시가(취득가액) × 양도 주수 (단가가 정수면 정확값),
 *   외화 경로 국외주식 = 외화 단가 × 양도 주수 × 환율을 **한 번만** 절사(`toKrwExact`) — 「출국일 시가 총액 × 양도주수 ÷ 보유주수」로 나누면
 *   이미 절사된 총액을 다시 나누므로 1원이 갈릴 수 있다. 양도 주수 = 보유 주수이면 종전 종목 총액(`departureDayValue`·`acquisitionCost`)과 정확히 같다.
 *   실제 양도가액도 같은 방식이다(국내 단가 × 주수 / 외화 단가 × 주수 × 실제 양도일 기준환율 1회 절사).
 *   외국납부세액 안분식(곱셈이 2^53을 넘을 수 있음)만 BigInt다(`apportionForeignTax`).
 *
 * 하락분 비교는 **종목별**이다(§118의13①이 「해당 자산」별이고 §118의12①이 종목 간 상계를 정하지 않음 — 확인 필요 고지).
 * 환산 기준일은 법령에 명시가 없다(계획 V-9) — 결과가 «확인 필요»를 고지한다.
 */

import type { ExitTaxBucketDetail } from "./types/exit-tax.types";
import type { ExitTaxHolding } from "./types/exit-tax.types";
import type { ExitTaxHoldingActualTransfer } from "./types/exit-tax.types";
import type { ExitTaxHoldingResult } from "./types/exit-tax.types";
import type { ExitTaxInput } from "./types/exit-tax.types";
import type { ExitTaxRateBucket } from "./types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { isValid, startOfDay } from "@/lib/tax-engine/utc-date";
import { STOCK_EXIT_TAX } from "@/lib/tax-engine/legal-codes/stock";
import { STOCK_EXIT_TAX_2027 } from "@/lib/tax-engine/legal-codes/stock-exit-tax-2027";
import { fxRateProblem } from "./exit-tax-fx";
import { toKrwExact } from "./exit-tax-fx";
import { calcBucketTax } from "./exit-tax-bucket";
import { apportionForeignTax } from "./exit-tax-credit";

/** 실제 양도가 외화 환산의 기준일은 법령에 명시가 없다(계획 V-9) — 결과 warnings에 싣는 고지문 */
export const ACTUAL_FX_BASIS_NOTICE =
  "국외주식 실제 양도가는 입력한 실제 양도일 기준환율로 환산했습니다 — 환산 기준일은 법령(소득세법 §118의12·§118의13)에 명시가 없어 확인 필요";

const BUCKET_LABEL: Record<ExitTaxRateBucket, string> = {
  clause1: "1호",
  clause2a: "2호가목",
  clause2b: "2호나목",
};

function invalid(message: string, path: string): TaxCalculationError {
  return new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { path });
}

const isForeign = (h: ExitTaxHolding): boolean => h.marketType === "foreign_stock";

/** 종목별 실제 양도가 하나라도 입력됐는가 — «종목별 모드» */
export function hasHoldingActualTransfer(input: ExitTaxInput): boolean {
  return input.holdings.some((h) => h.actualTransfer != null);
}

/** 전역 경정청구 입력(종목 공통 단가·외국납부세액·원천징수액)이 하나라도 있는가 */
export function hasGlobalAdjustmentInput(input: ExitTaxInput): boolean {
  return (
    (input.actualTransferPricePerShare ?? 0) > 0 ||
    input.actualTransferDate != null ||
    (input.foreignTaxPaid ?? 0) > 0 ||
    (input.foreignTaxPaidForeign ?? 0) > 0 ||
    (input.domesticSourceTaxWithheld ?? 0) > 0
  );
}

/** §119 11호 가목(내국법인 발행) 해당 여부 — 국내 종목과 내국법인 발행 국외주식(`isListedForeignCorp=false`). 외국법인 발행(기본값)은 나목이라 근거가 불명확해 대상에서 뺀다. */
function isDomesticIssuer(h: ExitTaxHolding): boolean {
  return !isForeign(h) || h.isListedForeignCorp === false;
}

function nonNegative(v: number | undefined, label: string, path: string): void {
  if (v != null && (!Number.isFinite(v) || v < 0)) throw invalid(`${label}은(는) 0 이상이어야 합니다`, path);
}

function validateLot(h: ExitTaxHolding, detail: ExitTaxHoldingResult | undefined, input: ExitTaxInput): void {
  const at = h.actualTransfer as ExitTaxHoldingActualTransfer;
  const base = `holdings.${h.id}.actualTransfer`;
  const name = `「${h.stockName}」`;

  if (detail?.scope === "excluded") {
    throw invalid(
      `${name}은(는) 국외전출세 과세 대상에서 제외된 종목이라 실제 양도를 입력할 수 없습니다 — 제외된 종목은 계산에 넣지 않으므로 입력을 비우세요`,
      base,
    );
  }
  if (!Number.isInteger(at.shareCount) || at.shareCount < 1) {
    throw invalid(`${name}: 실제 양도 주식 수는 1 이상의 정수여야 합니다`, `${base}.shareCount`);
  }
  if (at.shareCount > h.shareCount) {
    throw invalid(
      `${name}: 실제 양도 주식 수 ${at.shareCount.toLocaleString()}주가 보유 주식 수 ${h.shareCount.toLocaleString()}주보다 많습니다`,
      `${base}.shareCount`,
    );
  }

  if (isForeign(h)) {
    if (at.pricePerShare != null) {
      throw invalid(
        `국외주식 ${name}: 실제 양도가는 외화 1주당 양도가와 실제 양도일 기준환율로 입력합니다 — 원화 단가(pricePerShare)는 쓸 수 없습니다`,
        `${base}.pricePerShare`,
      );
    }
    if (at.priceForeign == null || !Number.isFinite(at.priceForeign) || at.priceForeign <= 0) {
      throw invalid(`국외주식 ${name}: 외화 1주당 실제 양도가(priceForeign)가 필요합니다`, `${base}.priceForeign`);
    }
    if (at.exchangeRate == null) {
      throw invalid(`국외주식 ${name}: 실제 양도일 기준환율(exchangeRate)이 필요합니다`, `${base}.exchangeRate`);
    }
    const problem = fxRateProblem(at.exchangeRate);
    if (problem) throw invalid(`국외주식 ${name}: 실제 양도일 기준환율 — ${problem}`, `${base}.exchangeRate`);
  } else {
    if (at.priceForeign != null || at.exchangeRate != null) {
      throw invalid(
        `국내 종목 ${name}: 실제 양도가는 원화 1주당 양도가(pricePerShare)로 입력합니다 — 외화 단가·환율은 국외주식에서만 쓸 수 있습니다`,
        `${base}.priceForeign`,
      );
    }
    if (at.pricePerShare == null || !Number.isFinite(at.pricePerShare) || at.pricePerShare <= 0) {
      throw invalid(`${name}: 1주당 실제 양도가(pricePerShare)가 필요합니다`, `${base}.pricePerShare`);
    }
  }

  // 외국납부세액 — 원화 또는 외화+환율 중 한쪽만. 둘을 같이 넣으면 어느 쪽이 우선인지 조용히 정하지 않고 거부한다.
  nonNegative(at.foreignTaxPaid, "외국납부세액(원화)", `${base}.foreignTaxPaid`);
  nonNegative(at.foreignTaxPaidForeign, "외국납부세액(외화)", `${base}.foreignTaxPaidForeign`);
  nonNegative(at.domesticSourceTaxWithheld, "비거주자 원천징수액", `${base}.domesticSourceTaxWithheld`);
  const hasKrwTax = (at.foreignTaxPaid ?? 0) > 0;
  const hasFxTax = (at.foreignTaxPaidForeign ?? 0) > 0;
  if (hasKrwTax && hasFxTax) {
    throw invalid(
      `${name}: 외국납부세액은 원화 또는 외화+기준환율 중 한쪽만 입력하세요 — 둘 다 있으면 어느 쪽을 쓸지 정할 수 없습니다`,
      `${base}.foreignTaxPaidForeign`,
    );
  }
  if (hasFxTax) {
    if (at.foreignTaxExchangeRate == null) {
      throw invalid(`${name}: 외국납부세액(외화)의 납세일 기준환율이 필요합니다`, `${base}.foreignTaxExchangeRate`);
    }
    const problem = fxRateProblem(at.foreignTaxExchangeRate);
    if (problem) throw invalid(`${name}: 외국납부세액 기준환율 — ${problem}`, `${base}.foreignTaxExchangeRate`);
  } else if (at.foreignTaxExchangeRate != null) {
    throw invalid(
      `${name}: 외국납부세액 기준환율만 있고 외화 금액이 없습니다 — 외화 금액을 입력하거나 환율을 비우세요`,
      `${base}.foreignTaxPaidForeign`,
    );
  }

  // §118의14① — 소득세법 §119 11호 가목(내국법인 발행)만. 외국법인 발행(나목: 「증권시장에 상장된 것만」)은 국내 과세 여부를 판정할 근거가 불명확해 차단한다.
  if ((at.domesticSourceTaxWithheld ?? 0) > 0 && !isDomesticIssuer(h)) {
    throw invalid(
      `국외주식 ${name}: 외국법인이 발행한 주식은 소득세법 §119 11호 나목(증권시장에 상장된 것만)에 해당할 때만 국내원천소득이라 비거주자 세액공제(§118의14①) 대상인지 판정할 수 없어 차단합니다 — 외국정부에 낸 세액이면 외국납부세액(§118의13①)으로 입력하세요`,
      `${base}.domesticSourceTaxWithheld`,
    );
  }

  if (at.transferDate != null) {
    if (!isValid(at.transferDate)) throw invalid(`${name}: 실제 양도일이 올바른 날짜가 아닙니다`, `${base}.transferDate`);
    if (startOfDay(at.transferDate).getTime() < startOfDay(input.departureDate).getTime()) {
      throw invalid(
        `${name}: 실제 양도일이 출국일보다 앞입니다 — §118의12①은 출국한 후 실제 양도한 경우에 적용합니다`,
        `${base}.transferDate`,
      );
    }
  }
}

/**
 * 종목별 모드 입력 검증. 종목별 입력이 없으면 아무것도 하지 않는다.
 * - 전역 경정청구 입력과 동시에 오면 거부(어느 쪽을 쓸지 정할 수 없다).
 * - 제외된 종목에 실제 양도가 오면 거부(조용히 무시하지 않는다).
 * 호출 시점: 분류(`classifyExitTaxHoldings`) 직후, 전부 제외 조기 반환 **전**.
 */
export function assertHoldingActualInputs(input: ExitTaxInput, details: ExitTaxHoldingResult[]): void {
  if (!hasHoldingActualTransfer(input)) return;
  if (hasGlobalAdjustmentInput(input)) {
    throw invalid(
      "종목별 실제 양도(holdings[].actualTransfer)와 전역 경정청구 입력(실제 양도 단가·양도일·외국납부세액·원천징수액)을 동시에 쓸 수 없습니다 — 한쪽만 입력하세요",
      "actualTransferPricePerShare",
    );
  }
  const detailById = new Map(details.map((d) => [d.id, d]));
  for (const h of input.holdings) {
    if (h.actualTransfer != null) validateLot(h, detailById.get(h.id), input);
  }
}

// ============================================================
// 계산
// ============================================================

type Lot = {
  h: ExitTaxHolding;
  bucket: ExitTaxRateBucket;
  /** 양도한 주수의 출국일 양도가액 (§118의10①) */
  departureSold: number;
  /** 양도한 주수의 필요경비 (§118의10②) */
  costSold: number;
  /** 실제 양도가액 */
  actual: number;
  /** max(0, 출국일 양도가액 − 실제 양도가액) */
  drop: number;
  foreignTaxPaidKrw: number;
  domesticWithheld: number;
};

function safeProduct(a: number, b: number, path: string): number {
  const v = a * b;
  if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) {
    throw invalid("금액이 처리 범위를 넘습니다", path);
  }
  return v;
}

function buildLot(h: ExitTaxHolding, d: ExitTaxHoldingResult): Lot {
  const at = h.actualTransfer as ExitTaxHoldingActualTransfer;
  const s = at.shareCount;
  const base = `holdings.${h.id}.actualTransfer`;

  // 양도한 주수의 출국일 양도가액·필요경비 — 외화 경로는 외화 단가 × 주수 × 환율 1회 절사, 원화 경로는 단가 × 주수
  const departureSold = d.fx
    ? toKrwExact(d.fx.departureForeign, d.fx.departureRate, s)
    : safeProduct(d.departureDayValuePerShare, s, base);
  const costSold = d.fx
    ? toKrwExact(d.fx.acquisitionForeign, d.fx.acquisitionRate, s)
    : safeProduct(h.perShareAcquisitionPrice, s, base);

  const actual = isForeign(h)
    ? toKrwExact(at.priceForeign as number, at.exchangeRate as number, s)
    : safeProduct(at.pricePerShare as number, s, base);

  const foreignTaxPaidKrw =
    (at.foreignTaxPaidForeign ?? 0) > 0
      ? toKrwExact(at.foreignTaxPaidForeign as number, at.foreignTaxExchangeRate as number)
      : (at.foreignTaxPaid ?? 0);

  return {
    h,
    bucket: d.rateBucket ?? "clause1",
    departureSold,
    costSold,
    actual,
    drop: actual < departureSold ? departureSold - actual : 0,
    foreignTaxPaidKrw,
    domesticWithheld: at.domesticSourceTaxWithheld ?? 0,
  };
}

export type HoldingActualResult = {
  /** 구분별 조정공제 합 (§118의12①) — 종목별 입력이 있으면 0이어도 값이 있다 */
  adjustmentDeduction: number;
  /** 구분별 조정공제·하락분 echo */
  bucketAdjustments: Map<ExitTaxRateBucket, { adjustmentDeduction: number; priceDrop: number }>;
  /** 종목별 echo (입력한 종목만) */
  lotEchoes: Map<string, NonNullable<ExitTaxHoldingResult["actualTransfer"]>>;
  /** 외국납부세액 입력(원화 환산 합)이 있고 산출세액 > 0 일 때만 값이 있다 */
  foreignTaxCreditApplied?: number;
  /** 입력한 외국납부세액의 원화 환산 합 (0이면 echo하지 않는다) */
  foreignTaxPaidKrw: number;
  /** 원천징수액 입력이 있고 산출세액 > 0 일 때만 값이 있다 */
  domesticTaxCreditApplied?: number;
  warnings: string[];
  appliedRules: string[];
};

/**
 * 종목별 실제 양도 → 구분별 조정공제 · 종목별 외국납부세액공제 · 비거주자 세액공제.
 *
 * @param details 분류된 종목 결과(scope·rateBucket·fx 포함)
 * @param bucketDetails 구분별 산출세액(`calcBuckets`)
 * @param incomeTax 산출세액(구분별 합)
 */
export function calcHoldingActualTransfers(
  input: ExitTaxInput,
  details: ExitTaxHoldingResult[],
  bucketDetails: ExitTaxBucketDetail[],
  incomeTax: number,
): HoldingActualResult {
  const detailById = new Map(details.map((d) => [d.id, d]));
  const lots: Lot[] = [];
  for (const h of input.holdings) {
    const d = detailById.get(h.id);
    if (h.actualTransfer != null && d?.scope !== "excluded") lots.push(buildLot(h, d as ExitTaxHoldingResult));
  }

  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // §118의12① 구분별 조정공제 = 구분 산출세액(TB_b) − 구분 산출세액(TB_b − 구분 하락분)
  const bucketAdjustments = new Map<ExitTaxRateBucket, { adjustmentDeduction: number; priceDrop: number }>();
  let adjustmentDeduction = 0;
  for (const b of bucketDetails) {
    const priceDrop = lots.filter((l) => l.bucket === b.bucket).reduce((sum, l) => sum + l.drop, 0);
    let adj = 0;
    if (priceDrop > 0 && b.taxBase > 0) {
      const reduced = Math.max(0, b.taxBase - priceDrop);
      adj = Math.min(Math.max(0, b.calculatedTax - calcBucketTax(b.bucket, reduced).tax), b.calculatedTax);
    }
    bucketAdjustments.set(b.bucket, { adjustmentDeduction: adj, priceDrop });
    adjustmentDeduction += adj;
  }
  if (adjustmentDeduction > 0) appliedRules.push(STOCK_EXIT_TAX.SECTION_118_12_ADJUSTMENT);

  // 한도 = 산출세액 − 조정공제액 (총액 기준 — 구분 간 귀속 규정이 없다)
  const limit = Math.max(0, incomeTax - adjustmentDeduction);

  // §118의14① 비거주자 세액공제 — ②가 §118의13①을 배제하므로 먼저 판정한다
  const withheldTotal = lots.reduce((sum, l) => sum + l.domesticWithheld, 0);
  let domesticTaxCreditApplied: number | undefined;
  if (withheldTotal > 0) appliedRules.push(STOCK_EXIT_TAX_2027.NONRESIDENT_SOURCE_119_11);
  if (withheldTotal > 0 && incomeTax > 0) {
    domesticTaxCreditApplied = Math.min(withheldTotal, limit);
    if (domesticTaxCreditApplied > 0) appliedRules.push(STOCK_EXIT_TAX.SECTION_118_14_DOMESTIC_CREDIT);
  }
  const section118_14_2_excludes = (domesticTaxCreditApplied ?? 0) > 0;

  // §118의13① 외국납부세액공제 — 종목마다 안분식, 한도는 총액
  const paidTotal = lots.reduce((sum, l) => sum + l.foreignTaxPaidKrw, 0);
  const apportionedByLot = new Map<string, number>();
  let foreignTaxCreditApplied: number | undefined;
  if (paidTotal > 0 && incomeTax > 0) {
    if (section118_14_2_excludes) {
      foreignTaxCreditApplied = 0;
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_14_2_FOREIGN_CREDIT_EXCLUDED);
      warnings.push(STOCK_EXIT_TAX.SECTION_118_14_2_EXCLUSION_MESSAGE);
    } else if (input.foreignTaxExclusionReason !== "none") {
      foreignTaxCreditApplied = 0;
      appliedRules.push(STOCK_EXIT_TAX.SECTION_118_13_2_EXCLUSION);
      warnings.push(
        input.foreignTaxExclusionReason === "credit_allowed"
          ? STOCK_EXIT_TAX.EXCLUSION_REASON_1_MESSAGE
          : STOCK_EXIT_TAX.EXCLUSION_REASON_2_MESSAGE,
      );
    } else {
      let sum = 0;
      for (const l of lots) {
        if (l.foreignTaxPaidKrw <= 0) continue;
        // §118의12①에 해당하면(실제 양도가액 < 출국일 양도가액) 분자의 양도가액도 실제 양도가액이다
        const numerator = (l.actual < l.departureSold ? l.actual : l.departureSold) - l.costSold;
        const denominator = l.actual - l.costSold;
        const apportioned =
          numerator <= 0 || denominator <= 0 ? 0 : apportionForeignTax(l.foreignTaxPaidKrw, numerator, denominator);
        apportionedByLot.set(l.h.id, apportioned);
        sum += apportioned;
      }
      foreignTaxCreditApplied = Math.min(sum, limit);
      if (foreignTaxCreditApplied > 0) appliedRules.push(STOCK_EXIT_TAX.SECTION_118_13_FOREIGN_TAX_CREDIT);
    }
  }

  // 고지
  if (lots.some((l) => isForeign(l.h))) warnings.push(ACTUAL_FX_BASIS_NOTICE);
  const partial = lots.filter((l) => (l.h.actualTransfer?.shareCount ?? 0) < l.h.shareCount);
  if (partial.length > 0) {
    warnings.push(
      `일부만 양도한 종목(${partial
        .map((l) => `${l.h.stockName} ${l.h.actualTransfer?.shareCount.toLocaleString()}/${l.h.shareCount.toLocaleString()}주`)
        .join(", ")})은 양도한 주식 수만큼만 조정공제·외국납부세액공제를 계산했고 양도하지 않은 주식은 계산에 넣지 않았습니다`,
    );
  }
  if (bucketDetails.length >= 2 && lots.length > 0) {
    warnings.push(
      `조정공제는 구분별 세율로 계산했습니다(${[...bucketAdjustments]
        .map(([b, v]) => `${BUCKET_LABEL[b]} ${v.adjustmentDeduction.toLocaleString()}원`)
        .join(", ")}) — §118의12①이 「제118조의11에 따른 세율」이라고만 하고 호가 섞일 때의 적용 방식을 정하지 않아 확인 필요`,
    );
  }
  if (lots.length >= 2 && lots.some((l) => l.actual > l.departureSold)) {
    warnings.push(
      "실제 양도가액과 출국일 양도가액의 비교는 종목별로 했습니다 — 실제 양도가액이 더 높은 종목의 차액은 다른 종목의 하락분과 상계하지 않았으며, 법문이 종목 간 상계 여부를 정하지 않아 확인 필요",
    );
  }
  if (bucketDetails.length >= 2 && (foreignTaxCreditApplied ?? 0) + (domesticTaxCreditApplied ?? 0) > 0) {
    warnings.push(
      "외국납부세액·비거주자 세액공제의 한도(산출세액 − 조정공제액)는 구분별로 나누지 않고 총액으로 적용했습니다 — 법령에 구분 간 한도 귀속 규정이 없어 확인 필요",
    );
  }

  const lotEchoes = new Map<string, NonNullable<ExitTaxHoldingResult["actualTransfer"]>>();
  for (const l of lots) {
    lotEchoes.set(l.h.id, {
      soldShareCount: l.h.actualTransfer?.shareCount ?? 0,
      departureValueSold: l.departureSold,
      acquisitionCostSold: l.costSold,
      actualTransferValue: l.actual,
      priceDrop: l.drop,
      ...(l.foreignTaxPaidKrw > 0
        ? {
            foreignTaxPaidKrw: l.foreignTaxPaidKrw,
            ...(apportionedByLot.has(l.h.id) ? { foreignTaxApportioned: apportionedByLot.get(l.h.id) } : {}),
          }
        : {}),
    });
  }

  return {
    adjustmentDeduction,
    bucketAdjustments,
    lotEchoes,
    ...(foreignTaxCreditApplied != null ? { foreignTaxCreditApplied } : {}),
    foreignTaxPaidKrw: paidTotal,
    ...(domesticTaxCreditApplied != null ? { domesticTaxCreditApplied } : {}),
    warnings,
    appliedRules,
  };
}
