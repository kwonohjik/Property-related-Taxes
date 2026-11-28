/**
 * ④ 국외자산 부동산 계산 호출 — `POST /api/calc/transfer/foreign` (소득세법 §118의2~§118의8).
 *
 * body는 순수 빌더(`buildForeignRealEstateBody`)가 만든다 — ⑧ 검증이 서버 refine을 돌리는 body와 같은 함수다(복제 금지).
 * 응답은 `{ data: ForeignRealEstateResult }`(mode 없음) — 국내 3종과 한 유니온(`TransferAPIResult`)으로 다루도록 여기서 `mode: "foreign"`을 붙인다.
 *
 * 오류: 400 `error.fieldErrors`(점 표기 경로)는 입력칸 앵커 이슈(`issues`)로 되돌린다.
 */
import type { ValidationIssue } from "./transfer-tax-validate";
import { buildForeignRealEstateBody } from "./transfer-foreign-body";
import { isForeignRealEstateForm } from "./transfer-foreign-scope";
import { foreignFieldErrorsToIssues } from "./transfer-tax-validate-foreign";
import type { ForeignTransferResult } from "./transfer-foreign-result";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

export const FOREIGN_API_PATH = "/api/calc/transfer/foreign";

export class ForeignCalcError extends Error {
  constructor(
    message: string,
    /** 입력칸으로 이동할 수 있는 서버 오류 목록 */
    readonly issues: ValidationIssue[],
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = "ForeignCalcError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> };
}

function toError(json: ErrorBody, taxOrigins: readonly { assetIndex: number; rowIndex: number }[]): ForeignCalcError {
  const err = json.error;
  const code = err?.code;
  const fieldErrors = err?.fieldErrors ?? {};
  const issues = foreignFieldErrorsToIssues(fieldErrors, taxOrigins);
  const message = issues.length > 0 ? "서버 검증에서 확인할 입력이 있습니다 — 아래 항목을 눌러 해당 칸으로 이동하세요." : (err?.message ?? "계산 중 오류가 발생했습니다.");
  return new ForeignCalcError(message, issues, code);
}

export async function callForeignRealEstateAPI(form: TransferFormData): Promise<ForeignTransferResult> {
  if (!isForeignRealEstateForm(form)) throw new Error("국외자산 폼이 아닙니다.");
  const { body, taxItemOrigins } = buildForeignRealEstateBody(form);
  const res = await fetch(FOREIGN_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as ErrorBody & { data?: ForeignRealEstateResult };
  if (!res.ok) throw toError(json, taxItemOrigins);
  if (!json.data) throw new ForeignCalcError("계산 결과를 받지 못했습니다.", [], undefined);
  return { mode: "foreign", result: json.data };
}
