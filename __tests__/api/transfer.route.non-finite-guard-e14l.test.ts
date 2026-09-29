/**
 * E-14l 전역 가드 — 양도세 route가 **NaN·Infinity가 든 결과를 200으로 내보내지 않는다**.
 *
 * `NextResponse.json`은 NaN을 `null`로 직렬화한다. 그래서 E-14l(일반건물 건물 카드 전 필드 NaN)은
 * 200으로 통과했고, `status === 200`만 보는 테스트가 그것을 놓쳤다. route가 반환 직전에
 * `assertFiniteResponse`로 끊으면 **모든 기존 route 테스트의 200 단언이 NaN 검출기**가 된다.
 *
 * 엔진을 부분 mock해 NaN을 주입한다 — 가드가 **route 층에서** 동작함을 본다(엔진 anchor로는
 * route 배선을 증명하지 못한다 — 메모리 `feedback_library_anchor_does_not_prove_component_uses_it`).
 * 도입 시점 실측: vitest node 프로젝트 전건(1903파일)의 route 응답 중 NaN을 담은 것은 E-14l 1건뿐이었다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { findNonFiniteNumbers } from "@/lib/api/non-finite-guard";

const inject = vi.hoisted(() => ({ single: undefined as number | undefined, multi: undefined as number | undefined }));

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/tax-engine/transfer-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax")>();
  return {
    ...actual,
    calculateTransferTax: (...args: Parameters<typeof actual.calculateTransferTax>) => {
      const r = actual.calculateTransferTax(...args);
      return inject.single === undefined ? r : { ...r, determinedTax: inject.single };
    },
  };
});
vi.mock("@/lib/tax-engine/transfer-tax-aggregate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/transfer-tax-aggregate")>();
  return {
    ...actual,
    calculateTransferTaxAggregate: (
      ...args: Parameters<typeof actual.calculateTransferTaxAggregate>
    ) => {
      const r = actual.calculateTransferTaxAggregate(...args);
      return inject.multi === undefined ? r : { ...r, totalTax: inject.multi };
    },
  };
});

import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  inject.single = undefined;
  inject.multi = undefined;
});

const HOUSE = {
  propertyType: "housing" as const,
  transferPrice: 500_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  residencePeriodMonths: 0,
};

const postSingle = async () => {
  const res = await POST_SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...HOUSE, annualBasicDeductionUsed: 0 }),
    }),
  );
  return { status: res.status, json: await res.json() };
};
const postMulti = async () => {
  const res = await POST_MULTI(
    new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taxYear: 2024,
        properties: [{ ...HOUSE, propertyId: "p1", propertyLabel: "p1" }],
        annualBasicDeductionUsed: 0,
      }),
    }),
  );
  return { status: res.status, json: await res.json() };
};

describe("findNonFiniteNumbers", () => {
  it("중첩 객체·배열의 NaN·±Infinity 경로를 모두 찾는다", () => {
    expect(
      findNonFiniteNumbers({ a: 1, b: NaN, c: [0, Infinity, { d: -Infinity }], e: "NaN", f: null }),
    ).toEqual([".b", ".c.1", ".c.2.d"]);
  });
  it("유한한 숫자·null·undefined·Date·문자열은 통과", () => {
    expect(findNonFiniteNumbers({ a: 0, b: -1.5, c: null, d: undefined, e: new Date(NaN), f: "x" })).toEqual([]);
    expect(findNonFiniteNumbers(NaN)).toEqual(["(root)"]);
  });
});

describe("route 가드 — NaN 결과는 200이 아니다", () => {
  it("단건 🟢 대조군: 주입 없으면 200", async () => {
    const r = await postSingle();
    expect(r.status).toBe(200);
    expect(typeof r.json.data.result.determinedTax).toBe("number");
  });

  it.each([NaN, Infinity])("단건 🔴 결정세액 %s → 500 + 경로 안내", async (v) => {
    inject.single = v;
    const r = await postSingle();
    expect(r.status).toBe(500);
    expect(r.json.error.message).toContain(".data.result.determinedTax");
  });

  it("다건 🟢 대조군: 주입 없으면 200", async () => {
    const r = await postMulti();
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(typeof r.json.data.totalTax).toBe("number");
  });

  it("다건 🔴 총세액 NaN → 500", async () => {
    inject.multi = NaN;
    const r = await postMulti();
    expect(r.status).toBe(500);
  });

  it("단건 route의 성공 응답 5곳이 전부 `okJson`을 거친다 (위 행동 테스트는 단건 분기 1곳만 친다)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/calc/transfer/route.ts", "utf8");
    // 200 리터럴은 `okJson` 본문 1곳뿐이어야 한다 — 새 분기가 NextResponse.json으로 직접 200을
    // 내면 가드를 우회한다.
    expect(src.match(/status:\s*200/g)?.length).toBe(1);
    expect(src.match(/return okJson\(/g)?.length).toBe(5);
  });
});
