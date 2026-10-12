/**
 * Pre-Do anchor — NED(`/ned/data/*`)가 요청을 거부하면(인증키 오류 등) 「공시가격 없음(404)」으로 위장된다.
 *
 * NED 는 `req/*` 계열과 달리 `response.status` 가 없다. 2026-10-12 한국 IP 실측(전부 HTTP 200):
 *   - 정상     `{"indvdLandPrices":{"field":[…],"resultCode":"","totalCount":"2"}}`
 *   - 자료 없음 `{"response":{"pageNo":"1","resultCode":"","totalCount":"0","numOfRows":"5","resultMsg":""}}`
 *   - 키 오류   `{"indvdLandPrices":{"resultCode":"INVALID_KEY","resultMsg":"등록되지 않은 인증키입니다."}}`
 *
 * 결함 위치: `app/api/address/standard-price/route.ts` `callNedAllPages` — 키 오류 응답은 컨테이너가 있고
 * `field` 가 없어 items [] → `failed=false` → 호출부가 404 PRICE_NOT_FOUND 를 낸다.
 * `req/*` 3라우트는 PR #2061 에서 502 `VWORLD_API_ERROR` + 원문으로 갈랐다 — NED 만 남았다.
 *
 * ⇒ 컨테이너(또는 `response`)의 `resultCode` 가 비어 있지 않으면 거부로 보고 502 + 원문을 올린다.
 *
 * 법령: 외부 API 오류 처리(법령 쟁점 없음).
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor 다. §2 는 수정 전후 불변.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/address/standard-price/route";

const ORIG_KEY = process.env.VWORLD_API_KEY;
const realFetch = globalThis.fetch;
const PNU = "1114010300100310000";

/** 실측 원문(2026-10-12) */
const REJECTED = (container: string) => ({
  [container]: { resultCode: "INVALID_KEY", resultMsg: "등록되지 않은 인증키입니다." },
});
const NOT_FOUND = {
  response: { pageNo: "1", resultCode: "", totalCount: "0", numOfRows: "1000", resultMsg: "" },
};
const LAND_OK = {
  indvdLandPrices: {
    field: [
      {
        mnnmSlno: "31", pblntfDe: "2025-04-30", stdLandAt: "N", stdrYear: "2025", pnu: PNU,
        lastUpdtDt: "2025-06-18", ldCode: "1114010300", ldCodeNm: "서울특별시 중구 태평로1가",
        regstrSeCodeNm: "일반", stdrMt: "01", pblntfPclnd: "62570000", regstrSeCode: "1",
      },
    ],
    pageNo: "1", resultCode: "", totalCount: "1", numOfRows: "1000",
  },
};

/** endpoint 이름 → 응답 본문 */
function mockNed(bodies: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ep = Object.keys(bodies).find((k) => url.includes(`/ned/data/${k}?`));
    const body = ep ? bodies[ep] : NOT_FOUND;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const req = (propertyType: "land" | "housing") =>
  new NextRequest(
    `http://localhost:3000/api/address/standard-price?pnu=${PNU}&year=2025&propertyType=${propertyType}`,
  );

beforeEach(() => {
  process.env.VWORLD_API_KEY = "test-key";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIG_KEY === undefined) delete process.env.VWORLD_API_KEY;
  else process.env.VWORLD_API_KEY = ORIG_KEY;
  vi.restoreAllMocks();
});

describe("§1 NED 요청 거부 — 「없음」이 아니라 502 + 원문 (수정 전 실패)", () => {
  it("NA-1 토지: 인증키 오류는 404 가 아니라 502 VWORLD_API_ERROR + 원문", async () => {
    mockNed({ getIndvdLandPriceAttr: REJECTED("indvdLandPrices") });
    const res = await GET(req("land"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("등록되지 않은 인증키입니다.");
    expect(json.error.message).toContain("INVALID_KEY");
    expect(json.error.message).not.toMatch(/없음/);
  });

  it("NA-2 주택: 공동주택·개별주택 둘 다 거부되면 502 VWORLD_API_ERROR + 원문", async () => {
    mockNed({
      getApartHousingPriceAttr: REJECTED("apartHousingPrices"),
      getIndvdHousingPriceAttr: REJECTED("indvdHousingPrices"),
    });
    const res = await GET(req("housing"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("INVALID_KEY");
  });

  it("NA-2b 주택: 공동주택은 「자료 없음」이고 개별주택만 거부돼도 502 + 원문", async () => {
    mockNed({
      getApartHousingPriceAttr: NOT_FOUND,
      getIndvdHousingPriceAttr: REJECTED("indvdHousingPrices"),
    });
    const res = await GET(req("housing"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("VWORLD_API_ERROR");
    expect(json.error.message).toContain("INVALID_KEY");
  });

  it("NA-3 거부가 최상위 `response` 로 와도 502 (모르는 형태를 「없음」으로 단정하지 않는다)", async () => {
    mockNed({
      getIndvdLandPriceAttr: {
        response: { resultCode: "INVALID_KEY", resultMsg: "등록되지 않은 인증키입니다.", totalCount: "0" },
      },
    });
    const res = await GET(req("land"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("VWORLD_API_ERROR");
  });
});

describe("§2 역방향 가드 (수정 전후 불변)", () => {
  it("NR-1 토지: 실측 「자료 없음」(resultCode \"\")은 종전대로 404 PRICE_NOT_FOUND", async () => {
    mockNed({ getIndvdLandPriceAttr: NOT_FOUND });
    const res = await GET(req("land"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("PRICE_NOT_FOUND");
  });

  it("NR-2 주택: 두 엔드포인트 모두 「자료 없음」이면 404 PRICE_NOT_FOUND", async () => {
    mockNed({ getApartHousingPriceAttr: NOT_FOUND, getIndvdHousingPriceAttr: NOT_FOUND });
    const res = await GET(req("housing"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("PRICE_NOT_FOUND");
  });

  it("NR-3 정상 응답(컨테이너 resultCode \"\")은 200 + 가격", async () => {
    mockNed({ getIndvdLandPriceAttr: LAND_OK });
    const res = await GET(req("land"));
    expect(res.status).toBe(200);
    expect((await res.json()).price).toBe(62570000);
  });

  it("NR-4 공동주택만 거부돼도 개별주택에 자료가 있으면 200 (종전 동작)", async () => {
    mockNed({
      getApartHousingPriceAttr: REJECTED("apartHousingPrices"),
      getIndvdHousingPriceAttr: {
        indvdHousingPrices: {
          field: [{ pnu: PNU, stdrYear: "2025", housePc: "512000000", ldCodeNm: "서울특별시 중구 태평로1가" }],
          resultCode: "", totalCount: "1",
        },
      },
    });
    const res = await GET(req("housing"));
    expect(res.status).toBe(200);
    expect((await res.json()).price).toBe(512000000);
  });
});
