/**
 * Vworld reverseGeocoding 클라이언트 헬퍼.
 *
 * 좌표 (lat·lng) → 행안부 표준 시·군·구 10자리 코드 자동 변환.
 *
 * 우선순위 (resolveSigunguCode):
 *   1. PNU 파싱 (lib/geo/pnu-sigungu.ts) — API 미호출, 쿼터 절약
 *   2. Dexie 캐시 hit (소수점 5자리 정밀도, 7일 TTL)
 *   3. API 호출 (/api/address/reverse-geocode)
 *   4. 캐시 저장 (7일 TTL)
 *   5. 실패 시 error 객체 반환 (사용자 수동 입력 fallback UX)
 *
 * 계획서: docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md v1 §3 S4
 */

import { db, type ReverseGeocodeCacheRecord } from "@/lib/storage/db";
import { extractSigunguCodeFromPnu } from "@/lib/geo/pnu-sigungu";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

export type ReverseGeocodeErrorCode =
  | "INVALID_COORDINATES"
  | "OUT_OF_KOREA"
  | "VWORLD_API_KEY_MISSING"
  | "VWORLD_API_ERROR"
  | "VWORLD_FETCH_FAILED"
  | "NO_SIGUNGU_CODE";

export interface ReverseGeocodeError {
  code: ReverseGeocodeErrorCode;
  message: string;
}

export interface ReverseGeocodeSuccess {
  sigunguCode: string;
  address: string;
  sidoName: string;
  sigunguName: string;
  /** 결과 출처 — cache 적중 / API 호출 / PNU fallback */
  source: "cache" | "api" | "fallback_pnu";
}

export type ReverseGeocodeOutcome = ReverseGeocodeSuccess | ReverseGeocodeError;

export function isReverseGeocodeError(
  outcome: ReverseGeocodeOutcome,
): outcome is ReverseGeocodeError {
  return "code" in outcome;
}

/**
 * 좌표 → 시·군·구 코드. 캐시 우선 + API fallback.
 *
 * - 무효 좌표 (NaN·undefined) → error.code="INVALID_COORDINATES"
 * - IndexedDB 무력 시 (Safari private mode 등) 캐시 단계 skip, 매번 API 호출
 * - HTTP 200 + sigunguCode → 캐시 저장 (7일)
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeOutcome> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { code: "INVALID_COORDINATES", message: "lat·lng 형식 오류 (NaN 또는 undefined)" };
  }

  const key = cacheKey(lat, lng);
  const now = Date.now();

  // 1. 캐시 조회
  try {
    const cached = await db.reverseGeocodeCache.get(key);
    if (cached && cached.expiresAt > now) {
      return {
        sigunguCode: cached.sigunguCode,
        address: cached.address,
        sidoName: cached.sidoName,
        sigunguName: cached.sigunguName,
        source: "cache",
      };
    }
  } catch {
    /* IndexedDB 무력 — 캐시 단계 skip, API 진입 */
  }

  // 2. API 호출
  let res: Response;
  try {
    res = await fetch(`/api/address/reverse-geocode?lat=${lat}&lng=${lng}`, {
      method: "GET",
    });
  } catch (err) {
    return { code: "VWORLD_FETCH_FAILED", message: String(err) };
  }

  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      (data as { error?: ReverseGeocodeError })?.error ??
      ({ code: "VWORLD_FETCH_FAILED", message: `HTTP ${res.status}` } as ReverseGeocodeError);
    return err;
  }

  const success = data as Omit<ReverseGeocodeSuccess, "source">;
  if (!success.sigunguCode) {
    return { code: "NO_SIGUNGU_CODE", message: "응답에 sigunguCode 없음" };
  }

  // 3. 캐시 저장 (IndexedDB 무력 시 silent skip)
  try {
    const record: ReverseGeocodeCacheRecord = {
      id: key,
      sigunguCode: success.sigunguCode,
      address: success.address,
      sidoName: success.sidoName,
      sigunguName: success.sigunguName,
      createdAt: now,
      expiresAt: now + CACHE_TTL_MS,
    };
    await db.reverseGeocodeCache.put(record);
  } catch {
    /* IndexedDB 무력 — 캐시 저장 skip */
  }

  return { ...success, source: "api" };
}

/**
 * PNU 우선 + 좌표 fallback 통합 진입점.
 *
 * - PNU 파싱 성공 시 즉시 반환 (Vworld API 미호출)
 * - PNU 미지원 시 좌표 reverseGeocode 호출
 * - 좌표도 미입력 시 INVALID_COORDINATES 반환
 */
export async function resolveSigunguCode(
  pnu: string | undefined,
  lat: number | undefined,
  lng: number | undefined,
): Promise<ReverseGeocodeOutcome> {
  // 1. PNU 파싱 시도 (단일 진실 source)
  const pnuCode = extractSigunguCodeFromPnu(pnu);
  if (pnuCode) {
    return {
      sigunguCode: pnuCode,
      address: "",
      sidoName: "",
      sigunguName: "",
      source: "fallback_pnu",
    };
  }

  // 2. 좌표 reverseGeocode
  if (lat === undefined || lng === undefined) {
    return { code: "INVALID_COORDINATES", message: "PNU·좌표 모두 미입력" };
  }
  return reverseGeocode(lat, lng);
}

/**
 * 캐시 key 생성 — 소수점 5자리 (~1m 해상도).
 * 동일 시·군·구 내 미세 좌표 차이는 캐시 hit 보장.
 */
export function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * 만료된 캐시 entry 청소 (선택 호출 — 매 호출 시 자동 skip).
 * 호출 시점: 앱 시작 시 또는 사용자 액션 후 idle 시.
 */
export async function purgeExpiredCache(): Promise<number> {
  const now = Date.now();
  try {
    return await db.reverseGeocodeCache.where("expiresAt").below(now).delete();
  } catch {
    return 0;
  }
}
