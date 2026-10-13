/**
 * 양도세 계산 API 전송 — `transfer-tax-api.ts`에서 800줄 정책으로 분리했다(결정 #38-10 작업 중 776줄). 동작은 그대로다:
 * 본문을 `/api/calc/transfer`에 POST하고, 실패하면 필드 오류를 로그·포맷해 던진다.
 */
export async function postTransferCalc<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    const fieldErrors = json?.error?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const { logFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
      logFieldErrorsResponse(fieldErrors, json, body);
      const { formatFieldErrors } = await import("./transfer-tax-error-format");
      throw new Error(formatFieldErrors(fieldErrors, msg));
    }
    const { logNoFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
    const detailedMsg = logNoFieldErrorsResponse(json, res, body) ?? msg;
    throw new Error(detailedMsg);
  }
  return json.data as T;
}
