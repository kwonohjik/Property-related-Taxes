/**
 * 외화 → 원화 정수 환산 (소득세법 시행령 §178의5① — 수령 또는 지출한 날 현재 기준환율 또는 재정환율).
 *
 * 부동소수 `Math.floor(외화 × 환율)`은 1원 과소가 난다(실측 `400000 × 1300.10` → 520,039,999, 정확값 520,040,000).
 * 그래서 두 입력을 소수 4자리 이하 십진수(정수 N ÷ 10^k)로 복원해 BigInt로 곱한 뒤 floor 한다.
 * 환산 원 미만은 항목별 절사(계획서 엔진 V-13 — 법령 무규정, 사용자 승인 대기 중인 선례 규약).
 */
import { decimalizeRatio } from "../tax-utils";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";

/** 외화액·환율의 소수 최대 자릿수 (계획서 엔진 K-27 — ⑫ Zod와 같은 값을 쓴다) */
export const FX_MAX_DECIMALS = 4;
/** 외화액 상한 — 4자리 스케일 정수가 2^53 아래(≈9.0e15)에 머물러 십진 복원이 정확한 범위 */
const MAX_FOREIGN_AMOUNT = 1e11;
/** 환율 상한 (원/외화 1단위) */
const MAX_EXCHANGE_RATE = 1e7;

function invalid(path: string, value: number, reason: string): TaxCalculationError {
  return new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `${path}: ${reason}`, { path, value });
}

/** 십진 복원 — 소수 4자리 초과·비십진·비유한은 거부. */
function scaled(x: number, path: string): { n: bigint; k: number } {
  if (!Number.isFinite(x)) throw invalid(path, x, "유한한 숫자여야 합니다");
  const dec = decimalizeRatio(x);
  if (!dec || dec.k > FX_MAX_DECIMALS) {
    throw invalid(path, x, `소수 ${FX_MAX_DECIMALS}자리 이하만 입력할 수 있습니다`);
  }
  return dec;
}

/**
 * `amountForeign`(외화, ≥ 0) × `exchangeRate`(원/외화, > 0)를 원 미만 절사한 정수 원으로 환산한다.
 * @param path 오류 메시지·details에 싣는 입력 경로(예: "assets[0].transfer")
 */
export function toKrw(amountForeign: number, exchangeRate: number, path = "toKrw"): number {
  if (amountForeign < 0) throw invalid(`${path}.amountForeign`, amountForeign, "음수일 수 없습니다");
  if (!(exchangeRate > 0)) throw invalid(`${path}.exchangeRate`, exchangeRate, "0보다 커야 합니다 (환율 미입력 불가)");
  if (amountForeign > MAX_FOREIGN_AMOUNT) {
    throw invalid(`${path}.amountForeign`, amountForeign, `${MAX_FOREIGN_AMOUNT.toLocaleString("en-US")} 이하여야 합니다`);
  }
  if (exchangeRate > MAX_EXCHANGE_RATE) {
    throw invalid(`${path}.exchangeRate`, exchangeRate, `${MAX_EXCHANGE_RATE.toLocaleString("en-US")} 이하여야 합니다`);
  }
  const a = scaled(amountForeign, `${path}.amountForeign`);
  const r = scaled(exchangeRate, `${path}.exchangeRate`);
  const krw = (a.n * r.n) / 10n ** BigInt(a.k + r.k); // 비음수 — BigInt 나눗셈 = floor
  if (krw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TaxCalculationError(TaxErrorCode.CALCULATION_OVERFLOW, `${path}: 환산 원화가 안전 정수 범위를 넘습니다`, { path });
  }
  return Number(krw);
}

/**
 * `toKrw`와 같은 검증·환산을 하되 던지지 않고 오류를 돌려준다 — API Zod(⑩⑫)가 엔진과 **같은 함수**로 환율·외화액을 막는다.
 * 오류 객체는 `toKrw`가 던질 것과 동일(코드·메시지·`details.path`)하다.
 */
export function tryToKrw(
  amountForeign: number,
  exchangeRate: number,
  path = "toKrw",
): { krw: number } | { error: TaxCalculationError } {
  try {
    return { krw: toKrw(amountForeign, exchangeRate, path) };
  } catch (e) {
    if (e instanceof TaxCalculationError) return { error: e };
    throw e;
  }
}
