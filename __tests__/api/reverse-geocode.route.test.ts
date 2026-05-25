/**
 * API-1 ~ API-5 — /api/address/reverse-geocode 라우트 anchor.
 *
 * 계획서: docs/00-pm/inheritance-farming-vworld-reverse-geocode.plan.md v1 §3 S6-API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/address/reverse-geocode/route";

const ORIG_ENV = process.env.VWORLD_API_KEY;

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/address/reverse-geocode?${query}`);
}

function mockVworldFetchSuccess(): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      response: {
        status: "OK",
        result: [
          {
            text: "서울특별시 강남구 역삼동 631",
            structure: {
              level1: "서울특별시",
              level2: "강남구",
              level4L: "삼성동",
              level4LC: "1168010500", // 법정동 10자리 (시·군·구 5 + 동 5)
            },
          },
        ],
      },
    }),
  } as unknown as Response);
}

function mockVworldFetchStatusNotOK(): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      response: { status: "ERROR", error: { text: "INVALID_PARAMETER" } },
    }),
  } as unknown as Response);
}

function mockVworldFetchNoLevel4LC(): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      response: {
        status: "OK",
        result: [
          {
            text: "x",
            structure: { level1: "서울", level2: "강남구" /* level4LC 누락 */ },
          },
        ],
      },
    }),
  } as unknown as Response);
}

beforeEach(() => {
  process.env.VWORLD_API_KEY = "test-key";
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIG_ENV === undefined) delete process.env.VWORLD_API_KEY;
  else process.env.VWORLD_API_KEY = ORIG_ENV;
});

describe("API-1: 정상 좌표 → 200 + sigunguCode", () => {
  it("API-1: 좌표 + API_KEY + Vworld 성공 → 200", async () => {
    mockVworldFetchSuccess();
    const res = await GET(req("lat=37.5&lng=127.05"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sigunguCode).toBe("1168000000");
    expect(data.sidoName).toBe("서울특별시");
    expect(data.sigunguName).toBe("강남구");
  });
});

describe("API-2: 좌표 형식 오류 → 400 INVALID_COORDINATES", () => {
  it("API-2a: lat 누락 → 400", async () => {
    const res = await GET(req("lng=127.05"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_COORDINATES");
  });

  it("API-2b: lat=abc → 400", async () => {
    const res = await GET(req("lat=abc&lng=127.05"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("INVALID_COORDINATES");
  });

  it("API-2c: 한국 영역 외 (lat=50) → 400 OUT_OF_KOREA", async () => {
    const res = await GET(req("lat=50&lng=120"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe("OUT_OF_KOREA");
  });
});

describe("API-3: VWORLD_API_KEY 미설정 → 503", () => {
  it("API-3: env 미설정 → 503 VWORLD_API_KEY_MISSING", async () => {
    delete process.env.VWORLD_API_KEY;
    const res = await GET(req("lat=37.5&lng=127.05"));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error.code).toBe("VWORLD_API_KEY_MISSING");
  });
});

describe("API-4: Vworld status != OK → 502 VWORLD_API_ERROR", () => {
  it("API-4: Vworld 응답 status='ERROR' → 502", async () => {
    mockVworldFetchStatusNotOK();
    const res = await GET(req("lat=37.5&lng=127.05"));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe("VWORLD_API_ERROR");
  });
});

describe("API-5: level4LC 형식 오류 → 502 NO_SIGUNGU_CODE", () => {
  it("API-5: level4LC 누락 → 502", async () => {
    mockVworldFetchNoLevel4LC();
    const res = await GET(req("lat=37.5&lng=127.05"));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe("NO_SIGUNGU_CODE");
  });
});

describe("API-fetch-throw: fetch 예외 → 502 VWORLD_FETCH_FAILED", () => {
  it("API-fetch-throw: 네트워크 실패 → 502", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network unreachable"));
    const res = await GET(req("lat=37.5&lng=127.05"));
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error.code).toBe("VWORLD_FETCH_FAILED");
  });
});
