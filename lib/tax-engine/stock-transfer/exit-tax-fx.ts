/**
 * 국외전출세 2027.1.1. 개정 — 국외주식 외화·환율 정수 환산 (순수 leaf)
 *
 * 법령: 소득세법 §118의10②(필요경비는 §97에 따라 계산)·시행령 §178의9②3호(국외주식등 시가는 §178의3).
 * §118의9~ 체계에는 **외화 환산 위임·환산 기준일 문언이 없다**(계획 V-2). 그래서 v1은 사용자가 입력한
 * 기준환율(취득가액=취득일, 출국일 시가=출국일)을 그대로 곱하고, 결과에 «확인 필요»를 고지한다.
 * 이 파일은 그 환산의 **정수 산술**만 책임진다.
 *
 * 왜 부동소수 곱이 아닌가: `Math.floor(10,000 × 40 × 1,300.10)`은 520,039,999다(double 1300.10 < 1300.10).
 * 정확값 520,040,000과 1원이 갈리고, 5억 경계(영 §178의8②1호)에서는 과세/제외가 바뀐다.
 * 소수 4자리 이하 환율을 정수 스케일로 복원해 BigInt로 곱한다(`decimalizeRatio` `tax-utils.ts` 방식).
 *
 * 계획서: docs/02-design/features/stock-transfer-exit-tax-2027.engine.plan.md §3.4·§4(K-9·K-10)
 */

import type {
  ExitTaxHolding,
  ExitTaxHoldingResult,
} from "./types/exit-tax.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { decimalizeRatio } from "@/lib/tax-engine/tax-utils";

/** 기준환율 소수 자릿수 상한 — 고시환율은 소수 2자리(재정환율 4자리까지). 5자리 이상은 입력 오류로 본다 */
export const FX_RATE_MAX_DECIMALS = 4;

/** 환산 기준일은 법령에 명시가 없다(계획 V-2) — 결과 warnings에 싣는 고지문 */
export const FX_BASIS_NOTICE =
  "외화 환산은 입력한 기준환율을 그대로 적용했습니다 — 취득가액은 취득일, 출국일 시가는 출국일 기준환율을 쓰는 것으로 처리했으나 환산 기준일은 법령(소득세법 §118의10②)에 명시가 없어 확인 필요";

function invalid(message: string, path: string): TaxCalculationError {
  return new TaxCalculationError(TaxErrorCode.INVALID_INPUT, message, { path });
}

/** 외화 시가 모드인가 (`foreign_market_price` · `foreign_decree_178_3`) */
export function isForeignValuationMode(mode: ExitTaxHolding["departureDayValuationMode"]): boolean {
  return mode === "foreign_market_price" || mode === "foreign_decree_178_3";
}

/** 외화 경로 전용 필드(외화 단가·환율 4개)가 하나라도 들어왔는가 */
export function hasForeignFxFields(h: ExitTaxHolding): boolean {
  return (
    h.departureDayPriceForeign != null ||
    h.departureExchangeRate != null ||
    h.perShareAcquisitionPriceForeign != null ||
    h.acquisitionExchangeRate != null
  );
}

/** 기준환율의 정수 스케일 복원. 소수 5자리 이상·비유한·0 이하는 사유 문자열을 돌려준다. */
function decimalizeRate(rate: number): { n: bigint; k: number } | string {
  if (!Number.isFinite(rate)) return "기준환율이 유한한 수가 아닙니다";
  if (rate <= 0) return "기준환율은 0보다 커야 합니다";
  const dec = decimalizeRatio(rate);
  if (dec == null || dec.k > FX_RATE_MAX_DECIMALS) {
    return `기준환율은 소수 ${FX_RATE_MAX_DECIMALS}자리까지만 입력할 수 있습니다`;
  }
  return dec;
}

/** 기준환율 입력 오류 사유 — 없으면 null. 종목 단위 검증이 같은 문구를 쓰도록 노출한다. */
export function fxRateProblem(rate: number): string | null {
  const r = decimalizeRate(rate);
  return typeof r === "string" ? r : null;
}

/**
 * 외화 금액 × 환율 → 원화, **원 미만 절사**(1회).
 *
 * - `amount`는 외화 **1단위 금액**(예: 1주당 외화 단가). `quantity`(주수)를 곱한 총액에서 한 번만 절사한다.
 *   `toKrwExact(단가 × 주수, 환율)`과 같은 값이되 단가×주수의 부동소수 곱 오차까지 없앤다.
 * - 환율은 소수 4자리 이하, 금액은 소수 10자리 이하(`decimalizeRatio` 한도).
 * - 비유한·음수 금액, 비유한·0 이하 환율, 소수 5자리 이상 환율, 주수 ≤ 0·비정수, 결과가 안전정수 밖이면 `INVALID_INPUT`.
 */
export function toKrwExact(amount: number, rate: number, quantity = 1): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw invalid("외화 금액은 0 이상의 유한한 수여야 합니다", "amount");
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw invalid("환산 수량은 1 이상의 정수여야 합니다", "quantity");
  }
  const r = decimalizeRate(rate);
  if (typeof r === "string") throw invalid(r, "exchangeRate");
  const a = decimalizeRatio(amount);
  if (a == null) throw invalid("외화 금액은 소수 10자리까지만 입력할 수 있습니다", "amount");

  const scaled = a.n * r.n * BigInt(quantity);
  const divisor = 10n ** BigInt(a.k + r.k);
  const krw = Number(scaled / divisor); // 모두 0 이상이라 BigInt 나눗셈 = floor
  if (!Number.isSafeInteger(krw)) throw invalid("환산한 원화 금액이 처리 범위를 넘습니다", "amount");
  return krw;
}

/** 종목 결과의 `fx` echo 타입 (`ExitTaxHoldingResult["fx"]`) */
export type ExitTaxFxEcho = NonNullable<ExitTaxHoldingResult["fx"]>;

function requireNumber(h: ExitTaxHolding, key: keyof ExitTaxHolding, label: string): number {
  const v = h[key];
  if (typeof v !== "number") {
    throw invalid(`국외주식 「${h.stockName}」: ${label}이(가) 필요합니다`, `holdings.${h.id}.${String(key)}`);
  }
  return v;
}

function convert(h: ExitTaxHolding, priceKey: keyof ExitTaxHolding, rateKey: keyof ExitTaxHolding, priceLabel: string, rateLabel: string) {
  const price = requireNumber(h, priceKey, priceLabel);
  const rate = requireNumber(h, rateKey, rateLabel);
  if (!Number.isFinite(price) || price < 0) {
    throw invalid(`국외주식 「${h.stockName}」: ${priceLabel}은(는) 0 이상이어야 합니다`, `holdings.${h.id}.${String(priceKey)}`);
  }
  const problem = fxRateProblem(rate);
  if (problem) {
    throw invalid(`국외주식 「${h.stockName}」: ${rateLabel} — ${problem}`, `holdings.${h.id}.${String(rateKey)}`);
  }
  return { price, rate, krw: toKrwExact(price, rate, h.shareCount) };
}

/**
 * 외화 경로 종목 1건의 원화 환산 — 종목당 총액에서 **1회만** 절사한다.
 *   출국일 시가 총액 = 절사(출국일 외화 단가 × 주수 × 출국일 기준환율)
 *   취득가액 총액   = 절사(취득 외화 단가 × 주수 × 취득일 기준환율)
 * 외화 단가·환율 4개가 모두 있어야 하고, 원화 단가 경로 필드와 섞이면 거부한다(조용한 fallback 금지).
 */
export function resolveForeignHoldingKrw(h: ExitTaxHolding): {
  departureDayValue: number;
  departureDayValuePerShare: number;
  acquisitionCost: number;
  fx: ExitTaxFxEcho;
} {
  if (h.marketType !== "foreign_stock") {
    throw invalid(`「${h.stockName}」: 외화 환산은 국외주식(foreign_stock)에서만 쓸 수 있습니다`, `holdings.${h.id}.marketType`);
  }
  if (!Number.isSafeInteger(h.shareCount) || h.shareCount <= 0) {
    throw invalid(`국외주식 「${h.stockName}」: 주식 수는 1 이상의 정수여야 합니다`, `holdings.${h.id}.shareCount`);
  }
  if ((h.departureDayMarketPrice ?? 0) !== 0 || (h.perShareAcquisitionPrice ?? 0) !== 0) {
    throw invalid(
      `국외주식 「${h.stockName}」: 원화 단가와 외화 단가를 한 종목에 섞을 수 없습니다 — 외화 경로는 원화 단가(0)를 비워 두세요`,
      `holdings.${h.id}`,
    );
  }
  const dep = convert(h, "departureDayPriceForeign", "departureExchangeRate", "출국일 외화 시가(1주당)", "출국일 기준환율");
  const acq = convert(h, "perShareAcquisitionPriceForeign", "acquisitionExchangeRate", "외화 취득가액(1주당)", "취득일 기준환율");
  return {
    departureDayValue: dep.krw,
    // 표시용 환산 단가(절사) — 계산에는 쓰지 않는다. 총액은 위처럼 1회 절사한 값이 정본이다.
    departureDayValuePerShare: toKrwExact(dep.price, dep.rate),
    acquisitionCost: acq.krw,
    fx: {
      ...(h.foreignCurrencyCode ? { currency: h.foreignCurrencyCode } : {}),
      departureForeign: dep.price,
      departureRate: dep.rate,
      departureValueKrw: dep.krw,
      acquisitionForeign: acq.price,
      acquisitionRate: acq.rate,
      acquisitionCostKrw: acq.krw,
    },
  };
}
