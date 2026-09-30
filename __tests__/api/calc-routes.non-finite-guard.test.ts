/**
 * 계산 route 전역 NaN 가드 — 양도세 외 route 확장 (2026-09-30).
 *
 * `NextResponse.json`은 NaN·Infinity를 `null`로 직렬화해 **200**으로 내보낸다(E-14l, #1873).
 * 양도세 단건·다건 route는 #1873에서 가드를 걸었다(`transfer.route.non-finite-guard-e14l.test.ts`).
 * 나머지 계산 route는 성공 응답을 `finiteJson`으로만 만든다 — 본문에 NaN·Infinity가 있으면
 * 던지고, 그 route의 `catch`가 500으로 응답한다.
 *
 * 정적 검사: 아래 route 소스에서 `NextResponse.json(`을 직접 부르는 곳은 **오류 응답(4xx·5xx)뿐**이어야
 * 한다. 새 분기가 성공 응답을 `NextResponse.json`으로 직접 만들면 가드를 우회하므로 여기서 실패한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { finiteJson } from "@/lib/api/non-finite-guard";

const inject = vi.hoisted(() => ({ value: undefined as number | undefined }));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/tax-engine/acquisition-tax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tax-engine/acquisition-tax")>();
  return {
    ...actual,
    calcAcquisitionTax: (...args: Parameters<typeof actual.calcAcquisitionTax>) => {
      const r = actual.calcAcquisitionTax(...args);
      return inject.value === undefined ? r : { ...r, totalTax: inject.value };
    },
  };
});

import { POST as POST_ACQ } from "@/app/api/calc/acquisition/route";

const ROUTES = [
  "app/api/calc/acquisition/route.ts",
  "app/api/calc/property/route.ts",
  "app/api/calc/comprehensive/route.ts",
  "app/api/calc/inheritance/route.ts",
  "app/api/calc/gift/route.ts",
  "app/api/calc/gift-deemed/route.ts",
  "app/api/calc/stock-transfer/route.ts",
  "app/api/calc/one-house-exemption/route.ts",
  "app/api/calc/cross-104-5/route.ts",
];

/** `NextResponse.json(` 호출마다 괄호 짝이 맞는 인자 문자열을 돌려준다. */
function nextResponseJsonCalls(src: string): string[] {
  const out: string[] = [];
  const marker = "NextResponse.json(";
  let from = 0;
  for (;;) {
    const start = src.indexOf(marker, from);
    if (start < 0) return out;
    let depth = 1;
    let i = start + marker.length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    out.push(src.slice(start + marker.length, i - 1));
    from = i;
  }
}

describe("finiteJson", () => {
  it("유한한 본문은 그대로 응답한다", async () => {
    const res = finiteJson({ data: { tax: 1, nested: [0, -1.5, null] } }, { status: 200 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { tax: 1, nested: [0, -1.5, null] } });
  });
  it.each([NaN, Infinity, -Infinity])("본문에 %s가 있으면 던진다(경로 안내)", (v) => {
    expect(() => finiteJson({ data: { rows: [{ tax: v }] } })).toThrow(".data.rows.0.tax");
  });
});

describe("route 소스 — 성공 응답은 `finiteJson`만 쓴다", () => {
  it.each(ROUTES)("%s", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/return finiteJson\(/);
    const direct = nextResponseJsonCalls(src).filter((args) => !/status:\s*[45]\d\d/.test(args));
    expect(direct, `오류 상태 없이 NextResponse.json을 직접 부른 곳: ${direct.join(" | ")}`).toEqual([]);
  });
});

describe("route 행동 — NaN 결과는 200이 아니다 (취득세 route)", () => {
  beforeEach(() => {
    inject.value = undefined;
  });
  const post = async () => {
    const res = await POST_ACQ(
      new NextRequest("http://localhost/api/calc/acquisition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyType: "housing",
          acquisitionCause: "purchase",
          acquiredBy: "individual",
          reportedPrice: 500_000_000,
          acquisitionDate: "2024-03-01",
          areaSqm: 84,
          houseCountAfter: 1,
          isRegulatedArea: false,
          isFirstHome: false,
          isMetropolitan: true,
        }),
      }),
    );
    return { status: res.status, json: await res.json() };
  };
  it("🟢 대조군: 주입 없으면 200", async () => {
    const r = await post();
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(typeof r.json.data.totalTax).toBe("number");
  });
  it("🔴 totalTax NaN → 500", async () => {
    inject.value = NaN;
    const r = await post();
    expect(r.status).toBe(500);
  });
});
