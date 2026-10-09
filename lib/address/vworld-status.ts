/**
 * Vworld `req/*` API(검색·주소·데이터) 응답 status 판정 — 「자료 없음」과 「API 오류」를 가른다.
 *
 * Vworld 2.0 응답은 HTTP 200 안에 `response.status` 로 결과를 싣는다:
 *   - "OK"        정상
 *   - "NOT_FOUND" 정상 처리됐으나 결과 없음
 *   - "ERROR"     요청 거부 — `response.error = { level, code, text }`
 *
 * 🔴 종전 라우트들은 `status !== "OK"` 를 전부 빈 결과로 흡수했다. 인증키 만료(실측 2026-09-18:
 *    `{"status":"ERROR","error":{"code":"EXPIRE_KEY","text":"인증키가 만료되었습니다."}}`) 가
 *    「검색 결과가 없습니다. 주소를 정확히 입력해 주세요」로 바뀌어 사용자는 자기 입력을 의심하고,
 *    서버 로그에도 원인이 남지 않았다. 형제 라우트 `reverse-geocode` 만 `error.text` 를 올렸다.
 *
 * ⇒ NOT_FOUND 만 「없음」으로 보고, 그 밖의 status(ERROR·누락·미지 값)는 오류로 올린다 —
 *    모르는 값을 「없음」으로 단정하는 쪽이 같은 위장을 되풀이한다.
 *
 * ⚠️ NED(`/ned/data/*`)는 응답 형식이 다른 API 계열이라 이 판정을 쓰지 않는다.
 */

export interface VworldStatusEnvelope {
  response?: {
    status?: string;
    error?: { level?: string; code?: string; text?: string };
  };
}

export type VworldStatus =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "error"; code: string; text: string };

export function classifyVworldStatus(data: VworldStatusEnvelope | null | undefined): VworldStatus {
  const status = data?.response?.status;
  if (status === "OK") return { kind: "ok" };
  if (status === "NOT_FOUND") return { kind: "not_found" };
  const err = data?.response?.error;
  return {
    kind: "error",
    code: err?.code ?? (status ? `STATUS_${status}` : "NO_STATUS"),
    text: err?.text ?? `Vworld 응답 status=${status ?? "(없음)"}`,
  };
}

/** 사용자·로그에 그대로 노출할 오류 문장 — 원인 코드(예: EXPIRE_KEY)를 숨기지 않는다 */
export function vworldErrorMessage(service: string, err: { code: string; text: string }): string {
  return `${service} 오류: ${err.text} (${err.code})`;
}
