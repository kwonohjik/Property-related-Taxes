"use client";

/**
 * KiwoomFetchErrorBadge — 키움 자동조회 실패 표시 (FieldCard trailing 슬롯 공용).
 *
 * 종전에는 종목명 자동완성·종목코드 blur 조회가 실패를 모두 삼켜(setMatches([]) / return)
 * 사용자에게 「인증 실패」와 「검색 결과 없음」이 동일한 화면으로 보였다.
 * 본 배지는 그 둘을 가른다 — 실패했을 때만 렌더되고, 결과 0건에는 렌더되지 않는다.
 *
 * Plan: docs/00-pm/stock-security-field-swap-kiwoom-name-lookup.plan.md §5.C
 */

/** API 오류 코드 (app/api/kiwoom/search/route.ts handleKiwoomError 기준) */
export type KiwoomFetchErrorCode =
  | "auth_failed"
  | "missing_env"
  | "rate_limited"
  | "stock_not_found"
  | "network"
  | "unknown";

export interface KiwoomFetchError {
  code: KiwoomFetchErrorCode;
  /** 서버 message 원문 — 사용자 문구를 대체하지 않고 title 속성으로만 노출 */
  detail?: string;
}

/**
 * 오류 코드 → **짧은** 배지 문구 (두 필드 공용 단일 소스).
 *
 * 배지는 FieldCard `trailing` 슬롯에 들어가는데, 그 슬롯은 입력과 같은 행을 나눠 쓴다
 * (`FieldCard.tsx:76-81` — 입력이 flex-1, 배지가 shrink-0). 문구가 길면 입력창 폭을 잠식하므로
 * 배지는 신호만 주고, 조치 안내는 폭 여유가 있는 hint 줄(ERROR_DETAILS)이 맡는다.
 */
const ERROR_LABELS: Record<KiwoomFetchErrorCode, string> = {
  auth_failed: "인증 실패",
  missing_env: "설정 없음",
  rate_limited: "한도 초과",
  stock_not_found: "종목 없음",
  network: "조회 실패",
  unknown: "조회 실패",
};

/** 오류 코드 → 원인·조치 상세 (FieldCard hint 줄에 표시) */
export const KIWOOM_ERROR_DETAILS: Record<KiwoomFetchErrorCode, string> = {
  auth_failed: "키움 인증 실패 — .env.local의 KIWOOM_APP_KEY·KIWOOM_APP_SECRET을 확인하세요.",
  missing_env: "키움 자격증명이 설정되지 않았습니다 — .env.local을 확인하세요.",
  rate_limited: "키움 요청 한도를 초과했습니다 — 잠시 후 다시 시도하세요.",
  stock_not_found: "해당 종목코드를 키움 마스터에서 찾을 수 없습니다.",
  network: "키움 조회에 실패했습니다 — 네트워크 연결을 확인하세요.",
  unknown: "키움 조회에 실패했습니다.",
};

/** HTTP status + 응답 error 코드를 KiwoomFetchErrorCode로 정규화 */
export function toKiwoomFetchErrorCode(raw: unknown): KiwoomFetchErrorCode {
  if (typeof raw === "string" && raw in ERROR_LABELS) {
    return raw as KiwoomFetchErrorCode;
  }
  return "unknown";
}

export function KiwoomFetchErrorBadge({ error }: { error?: KiwoomFetchError | null }) {
  if (!error) return null;
  return (
    <div
      role="status"
      title={error.detail ?? KIWOOM_ERROR_DETAILS[error.code]}
      className="inline-flex items-center gap-1 text-micro text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5"
    >
      <span aria-hidden>⚠</span>
      <span>{ERROR_LABELS[error.code]}</span>
    </div>
  );
}
