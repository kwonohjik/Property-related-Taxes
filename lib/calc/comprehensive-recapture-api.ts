/**
 * 합산배제 추징 계산기 — ④ 폼 → API body 변환 · ⑬ `/api/calc/comprehensive-recapture` 호출
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.5
 *
 * - 변환은 **전사 함수**다 — 빈칸·잘못된 값도 던지지 않고 ⑫ Zod가 거부하는 값(`undefined`·`""`)으로 옮긴다.
 *   그래서 ⑧ 검증을 통과하지 못한 폼은 API도 통과하지 못한다(⑧↔⑫ 격자 테스트가 같은 입력으로 대조).
 *   빈 금액을 0으로, 빈 연도를 0으로 바꾸는 자동 보정은 하지 않는다.
 * - 사유별 칸은 그 사유의 것만 보낸다(다른 호의 잔여 입력이 새어 나가지 않는다).
 * - `rows[].id`는 React key라 보내지 않는다.
 */
import type { RecaptureFormState } from "@/components/calc/comprehensive-recapture/shared";
import { asksApplicationDate } from "@/components/calc/comprehensive-recapture/shared";
import type { RecaptureResult } from "@/lib/tax-engine/types/comprehensive-recapture.types";

/** ⑫ Zod 입력(`z.input`)과 같은 모양 — 빈칸을 표현하려고 값 타입을 느슨하게 둔다 */
export interface RecaptureRequestBody {
  noticeDate: string;
  rows: { taxYear: number | undefined; amount: number | undefined }[];
  exemption: Record<string, unknown>;
}

function digitsToNumber(s: string): number | undefined {
  return /^\d+$/.test(s) ? Number(s) : undefined;
}

function yesNo(v: "" | "yes" | "no"): boolean | undefined {
  return v === "yes" ? true : v === "no" ? false : undefined;
}

function toExemption(form: RecaptureFormState): Record<string, unknown> {
  switch (form.reason) {
    case "other":
      return { reason: "other" };
    case "rent_over_5pct":
      return {
        reason: "rent_over_5pct",
        registrationType: form.registrationType,
        rentalStartDate: form.rentalStartDate,
        // 신청일은 그 유형이 물을 때만 · 빈칸이면 생략(엔진이 10년 + 확인 필요)
        rentalApplicationDate: asksApplicationDate(form.registrationType) ? form.rentalApplicationDate || undefined : undefined,
        rentalRegistrationDate: form.rentalRegistrationDate,
        ceasedDate: form.ceasedDate,
      };
    case "registration_cancelled":
      return { reason: "registration_cancelled", cancelClause: form.cancelClause };
    case "replacement_housing":
      return {
        reason: "replacement_housing",
        cause: form.cause,
        originalKind: form.originalKind,
        newHousing: {
          completionDate: form.completionDate,
          isApartment: yesNo(form.isApartment),
          registeredAsRental: yesNo(form.registeredAsRental),
          application:
            form.applicationKind === "" // 미선택 — 보내지 않는다(⑧이 차단)
              ? undefined
              : form.applicationKind === "none"
                ? null
                : { kind: form.applicationKind, date: form.applicationDate },
        },
      };
  }
}

/** ④ — 폼 상태 → 요청 body */
export function toRecaptureBody(form: RecaptureFormState): RecaptureRequestBody {
  return {
    noticeDate: form.noticeDate,
    rows: form.rows.map((r) => ({ taxYear: digitsToNumber(r.taxYear), amount: digitsToNumber(r.amount) })),
    exemption: toExemption(form),
  };
}

/** ⑬ — 호출. 실패는 서버 메시지(`error.message` · 검증 오류는 첫 항목)로 던진다 */
export async function callComprehensiveRecaptureApi(body: RecaptureRequestBody): Promise<RecaptureResult> {
  const res = await fetch("/api/calc/comprehensive-recapture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const first = Array.isArray(err?.error?.details) ? err.error.details[0]?.message : undefined;
    throw new Error(first ?? err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as RecaptureResult;
}
