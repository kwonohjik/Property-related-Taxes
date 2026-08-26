/**
 * F-20 Pre-Do anchor — NED 페이지 수집 루프의 빈 catch 가 네트워크 실패를 「공시가격 없음」으로 바꾼다.
 *
 * 결함 위치: `app/api/address/standard-price/route.ts` `callNedAllPages`
 *   } catch { break; }          // ← 예외를 로그 없이 삼키고 그때까지 모은 배열을 정상 결과처럼 반환
 *
 * 실패 신호가 없어 라우트 바깥 catch(500)도 이 실패를 보지 못하고,
 * 호출부는 `hit` 이 없다는 이유로 **404 PRICE_NOT_FOUND** 를 낸다.
 * 사용자에게는 「개별공시지가 없음 (PNU: …, 2025년)」이라는 **사실 단정**이 도달한다.
 *
 * ⇒ 같은 Vworld API 를 쓰는 형제 라우트 `reverse-geocode` 는 동일 실패를
 *   **502 `VWORLD_FETCH_FAILED`** 로 가른다 — `standard-price` 만 예외였다.
 *
 * 부분 실패도 위험하다: 1페이지는 성공하고 중간 페이지가 실패하면 200 OK 인데 units 가 잘리고,
 * 사용자 세대가 뒷부분이면 다시 404 가 된다(둘 다 로그 0건이라 운영에서도 관측되지 않는다).
 *
 * ⇒ 수집 결과를 `{ items, failed }` 로 갈라, **조회 실패 + 미발견**이면 404 가 아니라 502 를 낸다.
 *
 * 법령: 외부 API 오류 처리(법령 쟁점 없음). 반환값은 「소득세법 시행령」 제164조 기준시가 및
 *   재산세·종합부동산세 공시가격 입력으로 흘러간다.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/address/standard-price/route";

const ORIG_KEY = process.env.VWORLD_API_KEY;
const realFetch = globalThis.fetch;

/** 주소검색(법정동코드) 은 성공시키고 NED 만 실패시킨다 */
function mockFetch(nedBehavior: "throw" | "ok-empty") {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/req/search")) {
      return new Response(
        JSON.stringify({
          response: {
            status: "OK",
            result: { items: [{ id: "1168010500101000000", address: { parcel: "역삼동 100" } }] },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/ned/data")) {
      if (nedBehavior === "throw") throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ indvdLandPrices: { field: [], totalCount: "0" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const req = (q: string) =>
  new NextRequest(`http://localhost:3000/api/address/standard-price?${q}`);

beforeEach(() => {
  process.env.VWORLD_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIG_KEY === undefined) delete process.env.VWORLD_API_KEY;
  else process.env.VWORLD_API_KEY = ORIG_KEY;
  vi.restoreAllMocks();
});

describe("F-20 NED 조회 실패 — §1 「없음」과 구분한다 (수정 전 실패)", () => {
  it("네트워크 실패는 404 가 아니라 502 다", async () => {
    mockFetch("throw");
    const res = await GET(req("pnu=1168010500101000000&year=2025&propertyType=land"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error?.code).toBe("NED_FETCH_FAILED");
  });

  it("실패 메시지는 「없음」이라고 단정하지 않는다", async () => {
    mockFetch("throw");
    const json = await (
      await GET(req("pnu=1168010500101000000&year=2025&propertyType=land"))
    ).json();
    expect(json.error?.message ?? "").not.toMatch(/없음/);
  });
});

describe("F-20 — §2 역방향 가드 (수정 후에도 불변)", () => {
  it("정상 응답인데 자료가 없으면 종전대로 404 PRICE_NOT_FOUND", async () => {
    mockFetch("ok-empty");
    const res = await GET(req("pnu=1168010500101000000&year=2025&propertyType=land"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error?.code).toBe("PRICE_NOT_FOUND");
  });
});
