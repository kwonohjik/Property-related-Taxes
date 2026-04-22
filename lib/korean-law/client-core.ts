/**
 * korean-law 내부 공유 유틸
 * LawApiError, fetchJson, 파일 캐시, strip/toArray 헬퍼
 */

import fs from "fs/promises";
import path from "path";
import {
  fetchWithRetry,
  maskSensitiveUrl,
  checkHtmlError,
} from "./fetch-with-retry";

// ────────────────────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────────────────────

export const API_BASE = "https://www.law.go.kr/DRF";
export const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// 에러 클래스
// ────────────────────────────────────────────────────────────────────────────

export type LawApiErrorCode =
  | "API_KEY_MISSING"
  | "UPSTREAM"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "PARSE";

export class LawApiError extends Error {
  code: LawApiErrorCode;
  constructor(message: string, code: LawApiErrorCode) {
    super(message);
    this.name = "LawApiError";
    this.code = code;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// API 키
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.KOREAN_LAW_OC ?? "";
  if (!key) {
    throw new LawApiError(
      "법제처 Open API 키(OC)가 설정되지 않았습니다. .env.local 에 KOREAN_LAW_OC=... 를 추가하세요.",
      "API_KEY_MISSING"
    );
  }
  return key;
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP fetch (재시도 포함)
// ────────────────────────────────────────────────────────────────────────────

export async function fetchJson<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const oc = getApiKey();
  const qs = new URLSearchParams({ OC: oc, ...params, type: "JSON" }).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  let res: Response;
  try {
    // timeout 15s · retry 2회
    res = await fetchWithRetry(url, {
      timeout: 15_000,
      retries: 2,
      baseDelay: 500,
      retryOn: [429, 503, 504],
    });
  } catch (err) {
    throw new LawApiError(
      err instanceof Error ? err.message : `법제처 API 호출 실패`,
      "UPSTREAM"
    );
  }
  if (!res.ok) {
    const isBadRequest = res.status === 400 || res.status === 404;
    throw new LawApiError(
      isBadRequest
        ? `법제처가 쿼리를 해석하지 못했습니다. 법령명·조문번호를 확인하세요.`
        : `법제처 API 오류 (${res.status}) — ${maskSensitiveUrl(url)}`,
      isBadRequest ? "BAD_REQUEST" : "UPSTREAM"
    );
  }

  const bodyText = await res.text();
  if (checkHtmlError(bodyText)) {
    throw new LawApiError(
      `법제처 API가 HTML 오류 페이지를 반환했습니다 (파라미터 오류 가능) — ${maskSensitiveUrl(url)}`,
      "UPSTREAM"
    );
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText) as Record<string, unknown>;
  } catch (parseErr) {
    throw new LawApiError(
      `법제처 응답 파싱 실패: ${parseErr instanceof Error ? parseErr.message : "JSON parse error"}`,
      "UPSTREAM"
    );
  }
  if (typeof json["result"] === "string" && json["result"].includes("실패")) {
    throw new LawApiError(`법제처 API 인증 오류: ${json["result"]}`, "UPSTREAM");
  }
  return json as T;
}

// ────────────────────────────────────────────────────────────────────────────
// 파일 캐시
// ────────────────────────────────────────────────────────────────────────────

export function safeCacheKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
}

export async function readCache<T>(key: string): Promise<T | null> {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2), "utf-8");
}

// ────────────────────────────────────────────────────────────────────────────
// 범용 헬퍼
// ────────────────────────────────────────────────────────────────────────────

/** HTML 태그·엔티티를 제거한 순수 텍스트 반환 */
export function strip(raw: string): string {
  return raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * 법제처 API는 XML→JSON 변환 시 결과 1건이면 배열 대신 단일 객체를,
 * 0건이면 undefined를 반환한다. 항상 배열로 정규화.
 */
export function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}
