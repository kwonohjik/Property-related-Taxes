/**
 * anchor: Vworld 「요청 거부(status ERROR)」를 「자료 없음」으로 위장하지 않는다.
 *
 * 실측(2026-09-18): `VWORLD_API_KEY` 만료 시 Vworld 는 HTTP 200 으로
 *   {"response":{"status":"ERROR","error":{"level":"1","code":"EXPIRE_KEY","text":"인증키가 만료되었습니다."}}}
 * 를 준다. 종전 세 라우트는 `status !== "OK"` 를 전부 빈 결과로 흡수했다:
 *   - search          → 200 `{ results: [] }` → 화면 「검색 결과가 없습니다. 주소를 정확히 입력해 주세요」
 *   - standard-price  → 404 DONG_CODE_NOT_FOUND 「지번 주소를 확인해 주세요」
 *   - land-use-zone   → 200 verdict "unknown"
 * 사용자는 자기 입력을 의심하고 서버 로그에도 원인이 남지 않았다.
 *
 * ⇒ ERROR 는 502 VWORLD_API_ERROR + Vworld 원문(text·code)을 그대로 올리고,
 *   NOT_FOUND 는 종전 「없음」 동작을 유지한다(역방향 가드).
 *
 * 법령 쟁점 없음 — 외부 API 오류 처리. 조회값은 소령 §164 기준시가·재산세 공시가격 입력으로 흐른다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as searchGET } from "@/app/api/address/search/route";
import { GET as stdPriceGET } from "@/app/api/address/standard-price/route";
import { GET as zoneGET } from "@/app/api/address/land-use-zone/route";
import { classifyVworldStatus } from "@/lib/address/vworld-status";

const EXPIRE = {
  response: {
    status: "ERROR",
    error: { level: "1", code: "EXPIRE_KEY", text: "인증키가 만료되었습니다." },
  },
};
const NOT_FOUND = { response: { status: "NOT_FOUND" } };

type Body = Record<string, unknown> | "throw";

const ORIG_KEY = process.env.VWORLD_API_KEY;
const realFetch = globalThis.fetch;

/** URL 조각 → 응답 본문. 먼저 일치한 규칙을 쓴다. */
function mockVworld(rules: Array<[string, Body]>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = rules.find(([frag]) => url.includes(frag));
    if (!hit) throw new Error(`unmocked url: ${url}`);
    if (hit[1] === "throw") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(hit[1]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const req = (path: string) => new NextRequest(`http://localhost:3000/api/address/${path}`);

beforeEach(() => {
  process.env.VWORLD_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIG_KEY === undefined) delete process.env.VWORLD_API_KEY;
  else process.env.VWORLD_API_KEY = ORIG_KEY;
  vi.restoreAllMocks();
});

describe("classifyVworldStatus", () => {
  it("OK / NOT_FOUND / ERROR 를 가른다", () => {
    expect(classifyVworldStatus({ response: { status: "OK" } })).toEqual({ kind: "ok" });
    expect(classifyVworldStatus(NOT_FOUND)).toEqual({ kind: "not_found" });
    expect(classifyVworldStatus(EXPIRE)).toEqual({
      kind: "error",
      code: "EXPIRE_KEY",
      text: "인증키가 만료되었습니다.",
    });
  });

  it("status 누락·미지 값은 「없음」이 아니라 오류다", () => {
    expect(classifyVworldStatus({}).kind).toBe("error");
    expect(classifyVworldStatus({ response: { status: "WEIRD" } })).toMatchObject({
      kind: "error",
      code: "STATUS_WEIRD",
    });
  });
});

describe("search — 주소 검색", () => {
  const q = `search?q=${encodeURIComponent("금곡로212번길 25")}`;

  it("VS-1 인증키 만료는 502 + Vworld 원문(EXPIRE_KEY)을 올린다", async () => {
    mockVworld([["/req/search", EXPIRE]]);
    const res = await searchGET(req(q));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("인증키가 만료되었습니다.");
    expect(json.error.message).toContain("EXPIRE_KEY");
    expect(json.results).toBeUndefined();
  });

  it("VS-2 연결 실패는 502 VWORLD_FETCH_FAILED", async () => {
    mockVworld([["/req/search", "throw"]]);
    const res = await searchGET(req(q));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("VWORLD_FETCH_FAILED");
  });

  it("VS-3 (역방향) NOT_FOUND 는 종전대로 200 빈 결과", async () => {
    mockVworld([["/req/search", NOT_FOUND]]);
    const res = await searchGET(req(q));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it("VS-4 한쪽 category 만 실패하고 다른 쪽에 결과가 있으면 결과를 살린다", async () => {
    mockVworld([
      ["category=road", EXPIRE],
      [
        "category=parcel",
        {
          response: {
            status: "OK",
            result: { items: [{ id: "4111710100100250000", title: "t", address: { parcel: "금곡동 25" } }] },
          },
        },
      ],
    ]);
    const res = await searchGET(req(q));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toHaveLength(1);
    expect(json.results[0].pnu).toBe("4111710100100250000");
  });
});

describe("standard-price — jibun → 법정동코드", () => {
  const q = `standard-price?jibun=${encodeURIComponent("경기도 수원시 장안구 정자동 100")}&propertyType=land&year=2025`;

  it("VP-1 인증키 만료는 「지번을 확인하라」(404)가 아니라 502 + 원문", async () => {
    mockVworld([["/req/address", EXPIRE]]);
    const res = await stdPriceGET(req(q));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("EXPIRE_KEY");
    expect(json.error.message).not.toMatch(/지번 주소를 확인/);
  });

  it("VP-2 (역방향) NOT_FOUND 는 종전대로 404 DONG_CODE_NOT_FOUND", async () => {
    mockVworld([["/req/address", NOT_FOUND]]);
    const res = await stdPriceGET(req(q));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DONG_CODE_NOT_FOUND");
  });
});

describe("land-use-zone — 용도지역", () => {
  const q = `land-use-zone?jibun=${encodeURIComponent("경기도 수원시 장안구 정자동 100")}`;
  const COORD_OK = { response: { status: "OK", result: { point: { x: "127.0", y: "37.3" } } } };

  it("VZ-1 좌표 조회 단계의 인증키 만료는 502 + 원문", async () => {
    mockVworld([["/req/address", EXPIRE]]);
    const res = await zoneGET(req(q));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("EXPIRE_KEY");
  });

  it("VZ-2 용도지역 조회 단계의 인증키 만료도 502", async () => {
    mockVworld([
      ["/req/address", COORD_OK],
      ["/req/data", EXPIRE],
    ]);
    const res = await zoneGET(req(q));
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toContain("EXPIRE_KEY");
  });

  it("VZ-3 (역방향) 좌표 NOT_FOUND 는 종전대로 200 unknown", async () => {
    mockVworld([["/req/address", NOT_FOUND]]);
    const res = await zoneGET(req(q));
    expect(res.status).toBe(200);
    expect((await res.json()).verdict).toBe("unknown");
  });

  it("VZ-4 (역방향) 용도지역 NOT_FOUND 는 종전대로 200 unknown", async () => {
    mockVworld([
      ["/req/address", COORD_OK],
      ["/req/data", NOT_FOUND],
    ]);
    const res = await zoneGET(req(q));
    expect(res.status).toBe(200);
    expect((await res.json()).verdict).toBe("unknown");
  });
});
