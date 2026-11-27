/**
 * 국외자산 양도소득 개인지방소득세 — 지방세법 §103·§103의3③·§92①, 지방세기본법 §59.
 *
 * 2026-11-27 KoreanLaw MCP 실독으로 확정한 근거:
 *  1. 과세표준: 지방세법 §103③ — 국외자산 양도소득의 개인지방소득세 과세표준은 「소득세법」 제118조의3·제118조의4·제118조의6부터
 *     제118조의8까지에 따라 계산한 **소득세의 과세표준과 동일**하다. 외국납부세액 세액공제방법(§118의6①1호)은 세액공제라 과세표준이
 *     바뀌지 않는다(필요경비 산입방법만 과세표준을 바꾼다).
 *  2. 세율: 지방세법 §103의3③ — 국외 §118의2 1·2·5호 자산의 표준세율은 「제92조제1항에 따른 세율과 같다」.
 *     지방세법 §92①의 표는 그 시행본의 소득세법 §55①을 10분의 1로 줄인 값이다(시행본 2020.01.01·2021.06.01·2022.01.13·
 *     2023.03.14·2026.01.01 실독 — 예: 2026본 3억 초과 5억 이하 「940만6천원 + 3억원 초과액의 1천분의 40」 = 소득세
 *     「25,940,000 + 40%」의 1/10). 2023.3.14. 개정은 부칙 제2조로 2023.1.1. 이후 납세의무 성립분부터이며 과세기간 개시가
 *     2023.1.1. 전이면 종전 표(부칙 제11조 — §103의3③ 적용 경우 포함)라 §55① 표의 시행 축과 같다.
 *     그래서 호출자가 넘긴 양도일 시점 §55① 구간의 세율을 1/10, 누진공제를 1/10 한 값으로 계산한다
 *     (`floor(과세표준 × 세율 ÷ 10) − 누진공제 ÷ 10`은 표의 「기준액 + 초과액 × n/1000」과 정수 산술에서 항등).
 *  3. 절사: 지방세기본법 §59 「지방자치단체의 징수금의 끝수 계산에 관하여는 「국고금 관리법」 제47조를 준용한다」 →
 *     국고금 관리법 §47① 「10원 미만의 끝수가 있을 때에는 그 끝수는 계산하지 아니하고」. 단서의 대통령령(국고금 관리법 시행령
 *     §109의2 — 분할 징수·수납 때 끝수를 최초 금액에 합산)은 분할 납부가 아닌 이 계산에 해당하지 않는다.
 *
 * 국내 양도소득세 지방소득세(`transfer-tax-finalize.ts` 「결정세액 × 10% 원 미만」)와 절사 단위가 다르다 — 이 모듈은 국외 전용이다.
 */
import { applyRateFraction } from "../tax-utils";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import type { ForeignRealEstateBracket } from "./types";

/** `calculateProgressiveTax`와 같은 구간 선택(첫 매칭, 모두 넘으면 마지막) — max 오름차순 가정은 `assertSortedBrackets`가 강제한다. */
export function selectBracket(
  taxBase: number,
  brackets: readonly ForeignRealEstateBracket[],
): ForeignRealEstateBracket {
  for (const b of brackets) {
    if (taxBase <= (b.max ?? Infinity)) return b;
  }
  return brackets[brackets.length - 1];
}

/** 순회 첫 매칭 방식이라 max 오름차순이 깨지면 세액이 조용히 틀린다 — 빈 배열·역순을 던진다. */
export function assertSortedBrackets(brackets: readonly ForeignRealEstateBracket[]): void {
  if (brackets.length === 0) {
    throw new TaxCalculationError(TaxErrorCode.RATE_SCHEMA_MISMATCH, "누진세율 구간이 비어 있습니다");
  }
  let prev = -Infinity;
  for (const b of brackets) {
    const max = b.max ?? Infinity;
    if (!(max > prev)) {
      throw new TaxCalculationError(TaxErrorCode.RATE_SCHEMA_MISMATCH, "누진세율 구간이 max 오름차순이 아닙니다");
    }
    prev = max;
  }
}

/** 국고금 관리법 §47① — 10원 미만 절사 */
export function floorToTenWon(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

/**
 * 개인지방소득세 = 10원 미만 절사( floor(과세표준 × 세율/10) − 누진공제/10 ).
 * 세율이 1천분율 정수가 아니거나 누진공제가 10의 배수가 아니면(= §92① 표로 환원되지 않으면) 던진다 — 근사하지 않는다.
 */
export function calcForeignRealEstateLocalIncomeTax(
  taxBase: number,
  brackets: readonly ForeignRealEstateBracket[],
): number {
  if (taxBase <= 0) return 0;
  assertSortedBrackets(brackets);
  const b = selectBracket(taxBase, brackets);
  const rateMilli = Math.round(b.rate * 1000);
  if (Math.abs(b.rate * 1000 - rateMilli) > 1e-9 || b.deduction % 10 !== 0) {
    throw new TaxCalculationError(
      TaxErrorCode.RATE_SCHEMA_MISMATCH,
      "소득세 §55① 구간이 지방세법 §92① 표(세율 1/10·누진공제 1/10)로 환원되지 않습니다",
      { rate: b.rate, deduction: b.deduction },
    );
  }
  const gross = applyRateFraction(taxBase, rateMilli, 10_000); // floor(taxBase × rate ÷ 10)
  return floorToTenWon(Math.max(0, gross - b.deduction / 10));
}
