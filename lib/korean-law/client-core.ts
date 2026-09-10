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
// 법제처 DRF API는 주말·공휴일·야간에 접속 차단되는 경향 → TTL 30일로 만료 실패 완화
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// 「오늘」(KST)은 today.ts 단일 소스. **client-core 는 fs/promises 를 import 하므로
// 클라이언트 번들에 들어가면 안 된다** — 그래서 날짜 헬퍼를 별도 파일로 분리했다.
export { todayKstDate, todayYmdKst } from "./today";

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
    // 재시도 예산은 **라우트 maxDuration 안에** 들어가야 한다.
    //   종전 15s × 3회 + 백오프 ≈ 47s 로, search-law(15s)·law-text(20s) 를 훌쩍 넘겨
    //   재시도가 끝나기 전에 라우트가 먼저 죽었다 — 예산을 쓸 수 없는 예산이었다.
    //   실측 정상 응답은 0.24~0.28s(한국 IP) 이므로 5s 는 20배 헤드룸이다.
    //   해외 IP 차단 시 증상은 `fetch failed`(즉시 실패)라 긴 타임아웃이 이득도 아니다.
    //   worst ≈ 5s + 0.6s(백오프) + 5s ≈ 10.6s.
    res = await fetchWithRetry(url, {
      timeout: 5_000,
      retries: 1,
      baseDelay: 400,
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

/** @param allowStale true면 TTL 만료 캐시도 반환 (법제처 접속 차단 시 fallback) */
export async function readCache<T>(key: string, allowStale = false): Promise<T | null> {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const stat = await fs.stat(file);
    if (!allowStale && Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2), "utf-8");
}

/**
 * 「0건 결과」인가 — 배열 0건 또는 `{ items: [] }` 페이지.
 *
 * 법제처는 일시 장애·해외 IP 차단 상태에서도 **정상 응답 형태로 0건**을 돌려주는 경우가
 * 있는데, 그것을 TTL 30일 캐시에 굳히면 해당 쿼리가 한 달 내내 "검색 결과 없음"으로
 * 고착된다. 게다가 빈 배열은 truthy 라 `if (cached)` 히트 검사를 그대로 통과하고,
 * searchLawMany 의 stale fallback(allowStale)까지 타면 진짜 upstream 에러마저 삼킨다.
 *
 * ⇒ 0건은 **기록하지도, 히트로 인정하지도 않는다**. 트레이드오프는 진짜 0건 쿼리의
 *   반복 호출인데, 30일 오답 고착보다 낫다(fetchLawVersions 가 이미 쓰던 정책).
 */
function isEmptyResult(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") {
    const items = (value as { items?: unknown }).items;
    if (Array.isArray(items)) return items.length === 0;
  }
  return false;
}

/** 0건 결과를 캐시 미스로 취급하는 readCache. */
export async function readCacheNonEmpty<T>(key: string, allowStale = false): Promise<T | null> {
  const cached = await readCache<T>(key, allowStale);
  return cached != null && !isEmptyResult(cached) ? cached : null;
}

/** 0건 결과는 기록하지 않는 writeCache. */
export async function writeCacheNonEmpty(key: string, data: unknown): Promise<void> {
  if (!isEmptyResult(data)) await writeCache(key, data);
}

// ────────────────────────────────────────────────────────────────────────────
// 범용 헬퍼
// ────────────────────────────────────────────────────────────────────────────

/**
 * 사건번호 정규화 — 출처별 표기 차를 흡수해 법제처가 받는 **평문 표기**로.
 *   "2021두59908" · "대법원-2021-두-59908" · "부산고등법원(울산)-2021-누-10817"
 *     → "2021두59908" · "2021두59908" · "2021누10817"
 *
 * 🔴 법제처 `nb`(사건번호 검색)는 평문만 받는다 — 실측: `nb=2025누972` 1건 /
 *    `nb=수원고등법원-2025-누-972` **0건**. 그런데 검색 결과 목록이 화면에 보여주는
 *    사건번호는 후자(출처별 표기)일 수 있어, 사용자가 우리 화면에서 복붙하면 0건이 된다.
 *    ⇒ 검색 옵션 조립(buildDomainParams)과 인용 역추적(cite-check) 양쪽이 이 함수를 공유한다.
 */
export function normalizeCaseNo(s: string): string {
  const flat = (s ?? "").replace(/\s/g, "");
  const m = flat.match(/(\d{2,4})-?([가-힣]{1,2})-?(\d{1,7})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : flat;
}

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
