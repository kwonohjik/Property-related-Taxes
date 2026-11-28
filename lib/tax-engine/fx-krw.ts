/**
 * 외화 → 원화 정수 환산 공용 leaf (소득세법 시행령 §178의5① — 수령 또는 지출한 날 현재 기준환율 또는 재정환율).
 *
 * 국외 부동산(`foreign-realestate/fx.ts`가 이 파일을 re-export)과 국외주식(`stock-transfer/foreign-stock*.ts` · 화면 미리보기)이
 * **같은 함수**로 환산한다. 한쪽만 부동소수 `Math.floor`를 쓰면 같은 환율·같은 금액이 자산별로 다른 원화가 된다.
 *
 * 부동소수 `Math.floor(외화 × 환율)`은 1원 과소가 난다(실측 `400000 × 1300.10` → 520,039,999, 정확값 520,040,000).
 * 그래서 두 입력을 소수 4자리 이하 십진수(정수 N ÷ 10^k)로 복원해 BigInt로 곱한 뒤 floor 한다.
 * 환산 원 미만은 항목별 절사(계획서 엔진 V-13 — 법령 무규정, 사용자 승인 대기 중인 선례 규약).
 *
 * `quantity`(주식 수 — 0 이상 안전 정수)는 BigInt 곱에 **함께** 들어간다. `단가 × 수량`을 먼저 부동소수로 곱해 넘기면
 * 그 곱(`0.1 × 3`)이 이미 어긋난다.
 *
 * 클라이언트 안전(순수 함수 — DB·서버 의존 0). 화면 미리보기는 던지지 않는 `toKrwOrNull`을 쓴다.
 */
import { decimalizeRatio } from "./tax-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";

/** 외화액·환율의 소수 최대 자릿수 (계획서 엔진 K-27 — ⑫ Zod와 같은 값을 쓴다) */
export const FX_MAX_DECIMALS = 4;
/** 외화액 상한 — 4자리 스케일 정수가 2^53 아래(≈9.0e15)에 머물러 십진 복원이 정확한 범위 */
export const FX_MAX_FOREIGN_AMOUNT = 1e11;
/** 환율 상한 (원/외화 1단위) */
export const FX_MAX_EXCHANGE_RATE = 1e7;

/** 위반 대상 — `product`는 환산 원화가 안전 정수 범위를 넘는 경우 */
export type FxViolationTarget = "amount" | "rate" | "quantity" | "product";

export interface FxViolation {
  target: FxViolationTarget;
  /** 한국어 사유 — 오류 메시지의 `{path}: ` 뒤와 같다 */
  reason: string;
  code: TaxErrorCode;
  value?: number;
}

type Scaled = { n: bigint; k: number };

/** 십진 복원 — 소수 4자리 초과·비십진·비유한은 null. */
function scaled(x: number): Scaled | null {
  const dec = decimalizeRatio(x);
  return !dec || dec.k > FX_MAX_DECIMALS ? null : dec;
}

function bad(target: FxViolationTarget, reason: string, value?: number): FxViolation {
  return { target, reason, code: TaxErrorCode.INVALID_INPUT, value };
}

/**
 * 환산 가능 여부와 값을 한 번에 — `toKrw`·`tryToKrw`·`toKrwOrNull`·`fxViolation`이 모두 이 함수 하나에서 파생된다.
 * 검사 순서는 종전 `toKrw`와 같다(음수 → 환율>0 → 외화액 상한 → 환율 상한 → 외화액 소수 → 환율 소수 → 수량 → 오버플로).
 */
function compute(amountForeign: number, exchangeRate: number, quantity: number): { krw: number } | { violation: FxViolation } {
  if (amountForeign < 0) return { violation: bad("amount", "음수일 수 없습니다", amountForeign) };
  if (!(exchangeRate > 0)) return { violation: bad("rate", "0보다 커야 합니다 (환율 미입력 불가)", exchangeRate) };
  if (amountForeign > FX_MAX_FOREIGN_AMOUNT) {
    return { violation: bad("amount", `${FX_MAX_FOREIGN_AMOUNT.toLocaleString("en-US")} 이하여야 합니다`, amountForeign) };
  }
  if (exchangeRate > FX_MAX_EXCHANGE_RATE) {
    return { violation: bad("rate", `${FX_MAX_EXCHANGE_RATE.toLocaleString("en-US")} 이하여야 합니다`, exchangeRate) };
  }
  if (!Number.isFinite(amountForeign)) return { violation: bad("amount", "유한한 숫자여야 합니다", amountForeign) };
  const a = scaled(amountForeign);
  if (!a) return { violation: bad("amount", `소수 ${FX_MAX_DECIMALS}자리 이하만 입력할 수 있습니다`, amountForeign) };
  if (!Number.isFinite(exchangeRate)) return { violation: bad("rate", "유한한 숫자여야 합니다", exchangeRate) };
  const r = scaled(exchangeRate);
  if (!r) return { violation: bad("rate", `소수 ${FX_MAX_DECIMALS}자리 이하만 입력할 수 있습니다`, exchangeRate) };
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return { violation: bad("quantity", "0 이상 정수여야 합니다", quantity) };
  }
  const krw = (a.n * r.n * BigInt(quantity)) / 10n ** BigInt(a.k + r.k); // 비음수 — BigInt 나눗셈 = floor
  if (krw > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { violation: { target: "product", reason: "환산 원화가 안전 정수 범위를 넘습니다", code: TaxErrorCode.CALCULATION_OVERFLOW } };
  }
  return { krw: Number(krw) };
}

const SUFFIX: Record<Exclude<FxViolationTarget, "product">, string> = {
  amount: ".amountForeign",
  rate: ".exchangeRate",
  quantity: ".quantity",
};

function toError(v: FxViolation, path: string): TaxCalculationError {
  if (v.target === "product") return new TaxCalculationError(v.code, `${path}: ${v.reason}`, { path });
  const p = `${path}${SUFFIX[v.target]}`;
  return new TaxCalculationError(v.code, `${p}: ${v.reason}`, { path: p, value: v.value });
}

/**
 * `amountForeign`(외화, ≥ 0) × `exchangeRate`(원/외화, > 0) [× `quantity`(주식 수)]를 원 미만 절사한 정수 원으로 환산한다.
 * @param path 오류 메시지·details에 싣는 입력 경로(예: "assets[0].transfer")
 */
export function toKrw(amountForeign: number, exchangeRate: number, path = "toKrw", quantity = 1): number {
  const r = compute(amountForeign, exchangeRate, quantity);
  if ("violation" in r) throw toError(r.violation, path);
  return r.krw;
}

/**
 * `toKrw`와 같은 검증·환산을 하되 던지지 않고 오류를 돌려준다 — API Zod(⑩⑫)가 엔진과 **같은 함수**로 환율·외화액을 막는다.
 * 오류 객체는 `toKrw`가 던질 것과 동일(코드·메시지·`details.path`)하다.
 */
export function tryToKrw(
  amountForeign: number,
  exchangeRate: number,
  path = "toKrw",
  quantity = 1,
): { krw: number } | { error: TaxCalculationError } {
  const r = compute(amountForeign, exchangeRate, quantity);
  return "violation" in r ? { error: toError(r.violation, path) } : { krw: r.krw };
}

/** 화면 미리보기용 — 환산할 수 없으면(한도 위반·빈 칸) `null`. 렌더 중 던지지 않는다. */
export function toKrwOrNull(amountForeign: number, exchangeRate: number, quantity = 1): number | null {
  const r = compute(amountForeign, exchangeRate, quantity);
  return "violation" in r ? null : r.krw;
}

/**
 * 환산 위반 사유(없으면 null) — ⑧ validate·⑫ Zod가 **엔진과 같은 판정**으로 칸 단위 메시지를 만든다.
 * 외화액이 0이면 환산하지 않으므로(`toKrwUnlessZero`) 환율을 보지 않는다 — 비어 있는 칸의 stale 환율을 막지 않는다.
 */
export function fxViolation(amountForeign: number, exchangeRate: number, quantity = 1): FxViolation | null {
  if (amountForeign === 0) return null;
  const r = compute(amountForeign, exchangeRate, quantity);
  return "violation" in r ? r.violation : null;
}

/**
 * 외화액이 0이면 환율과 무관하게 0원, 아니면 `toKrw`.
 * 필요경비·외국세처럼 «금액이 없으면 환율 칸이 비어 있는» 항목에 쓴다(`fxViolation`과 같은 규칙).
 */
export function toKrwUnlessZero(amountForeign: number, exchangeRate: number, path = "toKrw", quantity = 1): number {
  return amountForeign === 0 ? 0 : toKrw(amountForeign, exchangeRate, path, quantity);
}
