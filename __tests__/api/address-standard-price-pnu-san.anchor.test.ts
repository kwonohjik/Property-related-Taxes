/**
 * F-01 안전망 anchor — `/api/address/standard-price` 의 jibun→PNU 구성에서
 * 「산」 지번의 **대지구분(PNU 11번째 자리)** 을 잠근다.
 *
 * ## 왜 라우트 GET 을 직접 구동하는가
 * `buildPnu` 는 `app/api/address/standard-price/route.ts:93` 의 **non-export 함수**다
 * (해당 모듈의 export 는 `NedPriceItem`(:42) 과 `GET`(:217) 둘뿐).
 * 따라서 leaf 를 직접 호출할 수 없고, 실제 GET 핸들러를 구동해 **NED 호출 URL 의
 * `pnu` 쿼리를 캡처**하는 방식으로만 실측할 수 있다.
 * `global.fetch` 를 전면 mock 하므로 **네트워크 호출은 0건**이다.
 *
 * ## 구별력 실측 (mutation probe — 전부 「변형 → 측정 → git checkout 복원 → status 확인」)
 *
 * | 변형 | 결과 | 의미 |
 * |---|---|---|
 * | 무변형(현행) | **4 failed / 6 passed** | 결함이 살아 있다 (SAN-1·4·5·6) |
 * | `buildPnu` → `return "0000000000000000000"` | **10 failed / 1 passed** | 이 경로 전반에 구별력이 있다 (유일 생존 SAN-10 은 buildPnu 를 우회하는 케이스 — 설계대로) |
 * | 제안 수정: `else if (parts[parts.length - 2] === "산")` 추가 | **전건 통과** | 안커가 **도달 가능한 단계**를 본다 |
 * | 느슨한 수정: `jibun.includes("산")` | 3 failed (SAN-7·8·9) | 과탐지 가드가 실제로 문다 |
 *
 * 마지막 행이 이 안커 설계의 절반이다 — 「산」을 넓게 잡는 수정으로 가면
 * 「부**산**광역시」·「**산**북면」·「울**산**광역시」가 즉시 빨개진다.
 *
 * 기존 안전망은 **0건**이었다: `buildPnu` 무력화 상태에서 관련 기존 테스트
 * 71건(node 53 + dom 18)이 전부 통과했다. 본 파일이 첫 안전망이다.
 *
 * ## PNU 19자리 구조
 * 시군구5 + 읍면동3 + 리2 + **산여부1** + 본번4 + 부번4
 * (`lib/geo/pnu-sigungu.ts:4` 주석 · `lib/geo/pnu-building-register.ts:4-7`).
 * 산여부(=대지구분): "1" = 대지(일반토지) / "2" = 산(임야) — `route.ts:96` 주석.
 *
 * ## level4LC 는 10자리다
 * Vworld `structure.level4LC` = 법정동 10자리(시군구5 + 동5).
 * 근거: `app/api/address/reverse-geocode/route.ts:26` 주석 + `:127` `/^\d{10}$/` 하드 게이트,
 * `__tests__/api/reverse-geocode.route.test.ts:30` 픽스처.
 * ⇒ 산여부는 level4LC 에 **애초에 담겨 오지 않는다**. 유일한 출처가 jibun 문자열 파싱이다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/address/standard-price/route";

/**
 * 법정동 10자리(시·군·구 5 + 동 5). `__tests__/api/reverse-geocode.route.test.ts:30`
 * 픽스처와 같은 값이다. **어느 동인지는 무관** — 이 안커는 뒤 9자리(산여부·본번·부번)만 본다.
 */
const LEVEL4LC = "1168010500";

const ORIG_KEY = process.env.VWORLD_API_KEY;

interface Capture {
  /** NED 로 실제 전달된 pnu (첫 호출 기준) */
  pnu: string | null;
  /** Vworld 주소 API(getcoord) 호출 횟수 */
  addrCalls: number;
  status: number;
}

async function callRoute(query: Record<string, string>): Promise<Capture> {
  const cap: Capture = { pnu: null, addrCalls: 0, status: 0 };

  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.startsWith("https://api.vworld.kr/req/address")) {
      cap.addrCalls++;
      return {
        ok: true,
        json: async () => ({
          response: { status: "OK", refined: { structure: { level4LC: LEVEL4LC } } },
        }),
      } as unknown as Response;
    }
    // NED 데이터 API — pnu 캡처 후 빈 결과(가격 없음)를 돌려준다.
    if (cap.pnu === null) cap.pnu = new URL(url).searchParams.get("pnu");
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;

  const qs = new URLSearchParams({ propertyType: "land", year: "2025", ...query });
  const res = await GET(
    new NextRequest(`http://localhost:3000/api/address/standard-price?${qs}`),
  );
  cap.status = res.status;
  await res.json();
  return cap;
}

/** jibun 하나로 PNU 를 얻는다. PNU 가 구성되지 않으면 null. */
async function pnuOf(jibun: string): Promise<string | null> {
  return (await callRoute({ jibun })).pnu;
}

/** PNU 11번째 자리(index 10) = 대지구분. */
function landTypeOf(pnu: string | null): string | null {
  return pnu ? pnu[10] : null;
}

beforeEach(() => {
  process.env.VWORLD_API_KEY = "test-key";
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.VWORLD_API_KEY;
  else process.env.VWORLD_API_KEY = ORIG_KEY;
});

// ──────────────────────────────────────────────────────────────
// 결함 본체 — 「산」이 공백으로 분리된 표기
// ──────────────────────────────────────────────────────────────

describe("[SAN] 「산」 지번의 대지구분 인식", () => {
  it("SAN-1: 「… 역삼동 산 100」(공백 분리) → 대지구분 2(산)", async () => {
    const pnu = await pnuOf("서울특별시 강남구 역삼동 산 100");
    expect(pnu).not.toBeNull();
    expect(landTypeOf(pnu)).toBe("2");
  });

  it("SAN-2: 「… 역삼동 산100」(붙임 표기) → 대지구분 2(산)", async () => {
    const pnu = await pnuOf("서울특별시 강남구 역삼동 산100");
    expect(landTypeOf(pnu)).toBe("2");
  });

  it("SAN-3: 「… 역삼동 100」(일반 지번) → 대지구분 1(대지)", async () => {
    const pnu = await pnuOf("서울특별시 강남구 역삼동 100");
    expect(landTypeOf(pnu)).toBe("1");
  });

  it("SAN-4: 「산 100」과 「100」은 서로 다른 PNU 여야 한다 — 같으면 다른 필지가 조용히 조회된다", async () => {
    const san = await pnuOf("서울특별시 강남구 역삼동 산 100");
    const daeji = await pnuOf("서울특별시 강남구 역삼동 100");
    expect(san).not.toBeNull();
    expect(daeji).not.toBeNull();
    expect(san).not.toBe(daeji);
  });

  it("SAN-5: 「산 2-1」 → 대지구분 2 + 본번 0002 + 부번 0001", async () => {
    const pnu = await pnuOf("서울특별시 종로구 부암동 산 2-1");
    expect(pnu).not.toBeNull();
    expect(landTypeOf(pnu)).toBe("2");
    expect(pnu!.slice(11, 15)).toBe("0002");
    expect(pnu!.slice(15, 19)).toBe("0001");
  });

  it("SAN-6: 리(里)를 포함해 토큰이 5개인 주소도 동일 — 「… 수동면 답내리 산 1」", async () => {
    const pnu = await pnuOf("경기도 남양주시 수동면 답내리 산 1");
    expect(landTypeOf(pnu)).toBe("2");
    expect(pnu!.slice(11, 15)).toBe("0001");
  });

  it("SAN-6b: 「경기도 가평군 상면 행현리 산 100」 → 19자리 전체를 고정한다", async () => {
    const pnu = await pnuOf("경기도 가평군 상면 행현리 산 100");
    // 법정동 10자리(mock 고정) + 산여부 2 + 본번 0100 + 부번 0000
    expect(pnu).toBe(`${LEVEL4LC}2` + "0100" + "0000");
  });
});

// ──────────────────────────────────────────────────────────────
// 과탐지 방지 — 수정이 「산」을 너무 넓게 잡는 방향으로 가는 것을 막는다
// ──────────────────────────────────────────────────────────────

describe("[SAN-OVER] 동·면 이름에 「산」이 들어가도 대지구분은 1(대지)", () => {
  it("SAN-7: 「부산광역시 금정구 산성동 100」 → 대지구분 1", async () => {
    const pnu = await pnuOf("부산광역시 금정구 산성동 100");
    expect(landTypeOf(pnu)).toBe("1");
  });

  it("SAN-8: 「경상북도 문경시 산북면 대상리 100」 → 대지구분 1", async () => {
    const pnu = await pnuOf("경상북도 문경시 산북면 대상리 100");
    expect(landTypeOf(pnu)).toBe("1");
  });

  it("SAN-9: 「울산광역시 남구 신정동 100-1」 → 대지구분 1 + 부번 0001", async () => {
    const pnu = await pnuOf("울산광역시 남구 신정동 100-1");
    expect(landTypeOf(pnu)).toBe("1");
    expect(pnu!.slice(15, 19)).toBe("0001");
  });
});

// ──────────────────────────────────────────────────────────────
// pnu 우선 경로 — 호출부가 Vworld item.id(19자리)를 그대로 보낼 때
// ──────────────────────────────────────────────────────────────

describe("[SAN-PNU] pnu 파라미터가 오면 jibun 파싱을 타지 않는다", () => {
  it("SAN-10: pnu 직접 전달 → 주소 API 호출 0회 + 전달값 그대로 NED 로 간다", async () => {
    const given = "1168010500201000000"; // 대지구분 2(산)
    const cap = await callRoute({ pnu: given, jibun: "서울특별시 강남구 역삼동 100" });
    expect(cap.addrCalls).toBe(0);
    expect(cap.pnu).toBe(given);
  });
});
