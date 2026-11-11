/**
 * anchor — Q-23 (a-1, 사용자 결정 2026-11-11): 거주자·내국인·과밀 구분은 ⑫가 필수로 받는다 (API 직접 호출 방어).
 *
 * 종전: 화면(⑧)은 이 칸들을 반드시 받는데 ⑫는 optional이라, API에서 칸을 빼면 엔진이 `?? true`(거주자·내국인)·`=== true`(비과밀 100%)로 가정해
 * **조용히 낮은 세액**이 나왔다(예: §98의3 과밀억제권역인데 과밀 칸을 빼면 감면율 60%가 아니라 100%). 이제 400으로 막는다.
 * 엔진 기본값은 내부 호출·테스트의 안전망이라 그대로 둔다 — 화면은 폼 기본값·마이그레이션이 항상 채워 영향이 없다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

async function run(body: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = await res.json();
  return { status: res.status, json, issues: ((json.error?.details ?? json.details ?? []) as { path?: unknown[]; message?: string }[]) };
}

const BASE = {
  propertyType: "housing" as const,
  transferPrice: 800_000_000,
  transferDate: "2024-08-01",
  acquisitionPrice: 500_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  annualBasicDeductionUsed: 0,
};

// 취득 2009-12-01 · 양도 2024-08-01 — §98의3 시한 안. 필수 칸(거주 구분·과밀)만 바꿔 가며 본다.
const R983 = (over: Record<string, unknown> = {}) => ({
  type: "unsold_98_3" as const,
  houseType983: "purchased",
  contractDate983: "2009-06-15",
  isOutsideSeoulNotDesignated983: true,
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
  residencyType983: "resident",
  isOverconcentration983: false,
  ...over,
});
const OMIT = (r: Record<string, unknown>, key: string) => {
  const { [key]: _drop, ...rest } = r;
  void _drop;
  return rest;
};

describe("Q-23 ⑫ — 거주자·내국인·과밀 칸은 필수", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  const msgs = (issues: { message?: string }[]) => issues.map((i) => i.message ?? "").join(" | ");

  it("Q-1: 🔴 §98의3 과밀 칸을 빼면 400 — 종전에는 비과밀(100%)로 가정해 감면이 더 크게 나왔다", async () => {
    const body = { ...BASE, acquisitionDate: "2009-12-01", reductions: [OMIT(R983(), "isOverconcentration983")] };
    const { status, issues, json } = await run(body);
    expect(status).toBe(400);
    expect(msgs(issues) + JSON.stringify(json)).toContain("isOverconcentration983");
  });

  it("Q-2: §98의3 거주 구분 칸을 빼면 400", async () => {
    const { status, issues, json } = await run({ ...BASE, acquisitionDate: "2009-12-01", reductions: [OMIT(R983(), "residencyType983")] });
    expect(status).toBe(400);
    expect(msgs(issues) + JSON.stringify(json)).toContain("residencyType983");
  });

  it("Q-3: 칸을 채우면 통과 — 과밀 false(비과밀)·거주 구분 resident 모두 정상 계산(200)", async () => {
    const { status } = await run({ ...BASE, acquisitionDate: "2009-12-01", reductions: [R983()] });
    expect(status).toBe(200);
  });

  it("Q-4: 거주자 여부 칸 — §98·§98의2·§99·§99의3·§98의8과 내국인 여부 §98의7도 같다(빼면 400, false도 값이다)", async () => {
    const cases: Array<[string, string]> = [
      ["unsold_98", "isResident98"],
      ["unsold_98_2", "isResident982"],
      ["new_99", "isResident99"],
      ["new_99_3", "isResident993"],
      ["unsold_98_7", "isDomestic987"],
      ["unsold_98_8", "isResident988"],
    ];
    for (const [type, key] of cases) {
      const missing = await run({ ...BASE, acquisitionDate: "2012-06-01", reductions: [{ type }] });
      expect(missing.status, `${type} 칸 없음`).toBe(400);
      expect(msgs(missing.issues) + JSON.stringify(missing.json), `${type} 칸 없음`).toContain(key);
      // 칸이 있으면(false 포함) 이 칸 때문에는 막히지 않는다 — 다른 필수 입력 때문에 막힐 수는 있다
      const present = await run({ ...BASE, acquisitionDate: "2012-06-01", reductions: [{ type, [key]: false }] });
      expect(msgs(present.issues) + JSON.stringify(present.json), `${type} 칸 있음(false)`).not.toContain(`${key})가 필요합니다`);
    }
  });
});
