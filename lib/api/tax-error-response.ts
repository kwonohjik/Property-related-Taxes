/**
 * 양도세 계열 route의 `TaxCalculationError` 응답 매핑 (2026-09-30 결정 — 계획서
 * `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.3).
 *
 * `INVALID_INPUT`은 **호출자 입력의 결함**이다(엔진·route 헬퍼가 필요한 값이 없거나 서로 맞지 않음).
 * 종전에는 500으로 응답해 서버 결함과 구별되지 않았다 ⇒ **400**으로 응답한다. ⑫ refine은 그대로 둔다
 * (이중 방어 — refine은 정확한 경로를 싣고, 이 매핑은 refine이 놓친 조합의 안전망이다).
 *
 * 던지는 쪽이 `details.path`(점 표기 문자열)를 실으면 Zod 400과 같은 `fieldErrors` 형태로 싣는다.
 * 그 밖의 코드(세율 누락·스키마 불일치 등)는 종전대로 500이다.
 */
import { NextResponse } from "next/server";
import { TaxErrorCode, type TaxCalculationError } from "@/lib/tax-engine/tax-errors";

export function taxCalculationErrorResponse(err: TaxCalculationError): NextResponse {
  const path = typeof err.details?.path === "string" ? err.details.path : undefined;
  const error = {
    code: err.code,
    message: err.message,
    ...(path ? { fieldErrors: { [path]: [err.message] } } : {}),
  };
  if (err.code === TaxErrorCode.INVALID_INPUT) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ error }, { status: 500 });
}
