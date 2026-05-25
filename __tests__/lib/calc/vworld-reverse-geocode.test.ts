/**
 * VRG-1 ~ VRG-10 — vworld-reverse-geocode.ts 클라이언트 헬퍼 anchor.
 *
 * 계획서: docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md v1 §3 S6-VRG
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  reverseGeocode,
  resolveSigunguCode,
  cacheKey,
  purgeExpiredCache,
  isReverseGeocodeError,
} from "@/lib/calc/vworld-reverse-geocode";
import { db, resetLocalDB } from "@/lib/storage/db";

beforeEach(async () => {
  await resetLocalDB();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(body: object): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as unknown as Response);
}

function mockFetchError(status: number, body: object): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response);
}

function mockFetchThrow(err: Error): void {
  global.fetch = vi.fn().mockRejectedValue(err);
}

describe("VRG-1: 좌표 → API 호출 → sigunguCode 반환", () => {
  it("VRG-1: fetch mock 정상 응답 → success object", async () => {
    mockFetchSuccess({
      sigunguCode: "1168000000",
      address: "서울특별시 강남구 역삼동",
      sidoName: "서울특별시",
      sigunguName: "강남구",
    });
    const r = await reverseGeocode(37.5, 127.05);
    expect(isReverseGeocodeError(r)).toBe(false);
    if (!isReverseGeocodeError(r)) {
      expect(r.sigunguCode).toBe("1168000000");
      expect(r.source).toBe("api");
    }
  });
});

describe("VRG-2·3: 캐시 hit·만료", () => {
  it("VRG-2: 동일 좌표 재호출 → fetch 미호출, source='cache'", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sigunguCode: "1168000000",
        address: "x",
        sidoName: "서울특별시",
        sigunguName: "강남구",
      }),
    } as unknown as Response);
    global.fetch = fetchSpy;

    const first = await reverseGeocode(37.5, 127.05);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    if (!isReverseGeocodeError(first)) expect(first.source).toBe("api");

    const second = await reverseGeocode(37.5, 127.05);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 캐시 hit으로 호출 안 함
    if (!isReverseGeocodeError(second)) expect(second.source).toBe("cache");
  });

  it("VRG-3: 7일 경과 expired → 재호출", async () => {
    // 만료된 캐시 직접 주입
    await db.reverseGeocodeCache.put({
      id: cacheKey(37.5, 127.05),
      sigunguCode: "1168000000",
      address: "old",
      sidoName: "서울특별시",
      sigunguName: "강남구",
      createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      expiresAt: Date.now() - 1 * 24 * 60 * 60 * 1000, // 1일 전 만료
    });
    mockFetchSuccess({
      sigunguCode: "1168000000",
      address: "new",
      sidoName: "서울특별시",
      sigunguName: "강남구",
    });
    const r = await reverseGeocode(37.5, 127.05);
    expect(global.fetch).toHaveBeenCalledTimes(1); // 만료로 API 호출
    if (!isReverseGeocodeError(r)) {
      expect(r.source).toBe("api");
      expect(r.address).toBe("new");
    }
  });
});

describe("VRG-4·5: fetch 실패·API_KEY 미설정", () => {
  it("VRG-4: HTTP 502 → error", async () => {
    mockFetchError(502, { error: { code: "VWORLD_FETCH_FAILED", message: "Vworld HTTP 500" } });
    const r = await reverseGeocode(37.5, 127.05);
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) expect(r.code).toBe("VWORLD_FETCH_FAILED");
  });

  it("VRG-5: HTTP 503 VWORLD_API_KEY_MISSING → error.code 그대로 전달", async () => {
    mockFetchError(503, { error: { code: "VWORLD_API_KEY_MISSING", message: ".env.local" } });
    const r = await reverseGeocode(37.5, 127.05);
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) expect(r.code).toBe("VWORLD_API_KEY_MISSING");
  });
});

describe("VRG-6·7: 좌표 sanity", () => {
  it("VRG-6: 한국 영역 외 (lat=50, lng=120) → 사전 차단 (API 미호출)", async () => {
    // 실제 API 라우트에서 OUT_OF_KOREA 반환하지만, 클라이언트는 fetch 결과를 그대로 처리.
    mockFetchError(400, { error: { code: "OUT_OF_KOREA", message: "한국 외" } });
    const r = await reverseGeocode(50, 120);
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) expect(r.code).toBe("OUT_OF_KOREA");
  });

  it("VRG-7: NaN 좌표 → INVALID_COORDINATES (fetch 미호출)", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const r = await reverseGeocode(NaN, 127);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) expect(r.code).toBe("INVALID_COORDINATES");
  });
});

describe("VRG-8·9·10: resolveSigunguCode 우선순위", () => {
  it("VRG-8: PNU만 입력 → fallback_pnu (API 미호출)", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const r = await resolveSigunguCode("1168010100", undefined, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    if (!isReverseGeocodeError(r)) {
      expect(r.sigunguCode).toBe("1168000000");
      expect(r.source).toBe("fallback_pnu");
    }
  });

  it("VRG-9: 좌표만 입력 → API 호출", async () => {
    mockFetchSuccess({
      sigunguCode: "1168000000",
      address: "x",
      sidoName: "서울특별시",
      sigunguName: "강남구",
    });
    const r = await resolveSigunguCode(undefined, 37.5, 127.05);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    if (!isReverseGeocodeError(r)) expect(r.source).toBe("api");
  });

  it("VRG-10: PNU·좌표 모두 미입력 → INVALID_COORDINATES", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    const r = await resolveSigunguCode(undefined, undefined, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) expect(r.code).toBe("INVALID_COORDINATES");
  });

  it("VRG-10b: PNU 5자리 미만 + 좌표 있음 → API fallback", async () => {
    mockFetchSuccess({
      sigunguCode: "1168000000",
      address: "x",
      sidoName: "서울특별시",
      sigunguName: "강남구",
    });
    const r = await resolveSigunguCode("123", 37.5, 127.05); // PNU 너무 짧음
    expect(global.fetch).toHaveBeenCalledTimes(1);
    if (!isReverseGeocodeError(r)) expect(r.source).toBe("api");
  });
});

describe("VRG-meta: cacheKey + purgeExpiredCache", () => {
  it("cacheKey: 좌표 5자리 정밀도", () => {
    expect(cacheKey(37.123456789, 127.987654321)).toBe("37.12346,127.98765");
  });

  it("purgeExpiredCache: 만료 entry 삭제, 유효 entry 보존", async () => {
    const now = Date.now();
    await db.reverseGeocodeCache.put({
      id: "expired",
      sigunguCode: "X",
      address: "",
      sidoName: "",
      sigunguName: "",
      createdAt: now - 8 * 24 * 60 * 60 * 1000,
      expiresAt: now - 1000,
    });
    await db.reverseGeocodeCache.put({
      id: "valid",
      sigunguCode: "Y",
      address: "",
      sidoName: "",
      sigunguName: "",
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });

    const deleted = await purgeExpiredCache();
    expect(deleted).toBe(1);
    expect(await db.reverseGeocodeCache.get("expired")).toBeUndefined();
    expect(await db.reverseGeocodeCache.get("valid")).toBeTruthy();
  });
});

describe("VRG-fetch-throw: 네트워크 예외", () => {
  it("VRG-fetch-throw: fetch가 throw → VWORLD_FETCH_FAILED", async () => {
    mockFetchThrow(new Error("Network unreachable"));
    const r = await reverseGeocode(37.5, 127.05);
    expect(isReverseGeocodeError(r)).toBe(true);
    if (isReverseGeocodeError(r)) {
      expect(r.code).toBe("VWORLD_FETCH_FAILED");
      expect(r.message).toContain("Network unreachable");
    }
  });
});
