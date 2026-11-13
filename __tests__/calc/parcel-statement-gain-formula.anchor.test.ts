/**
 * anchor — 단건 다필지 명세서 «전체 양도차익» 산식 문구 (#3326 관찰 사항, Q-1 b) · 계획서 docs/00-pm/parcel-statement-gain-formula-text.plan.md
 *
 * 종전: 명세서가 `findStepByLabel(steps, "양도차익")`의 첫 일치 `[필지 1] 양도차익`(안분가 − 취득가 − 경비 = 197,000,000)을 잡아
 *       값(합계 394,000,000)과 문구가 어긋났다. 기대값은 실제 route 응답에서 읽는다.
 *
 *  · PF-1 필지 2개 — 엔진 합계 step 문구 + 명세서 항목(산식·근거 조문·값)이 같은 합
 *  · PF-2 필지 1개 — 문구가 그 필지 값 하나
 *  · PF-3 필지 3개(양도차손 필지 포함) — 음수 필지는 빼기로 적는다
 *  · PF-4 필지 아닌 일반 단건은 불변(「양도가액 − 취득가액 − 필요경비」 계열 · 합계 step 없음)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

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

const COMMON = {
  isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
  householdHousingCount: 2, residencePeriodMonths: 0, reductions: [] as unknown[], annualBasicDeductionUsed: 0,
};
const parcel = (id: string, acq = 200_000_000, exp = 3_000_000) => ({
  id, acquisitionDate: "2015-01-01", acquisitionMethod: "actual", acquisitionPrice: acq, acquisitionArea: 100, transferArea: 100, expenses: exp,
});
const LAND = {
  ...COMMON, propertyType: "land", transferPrice: 800_000_000, transferDate: "2026-03-01", acquisitionPrice: 400_000_000, acquisitionDate: "2015-01-01",
  expenses: 6_000_000, useEstimatedAcquisition: false, acquisitionCause: "purchase",
};
const req = (b: object) => new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const run = async (body: object) => {
  const res = await POST(req(body));
  expect(res.status).toBe(200);
  const j = await res.json();
  const result = j.data?.result ?? j.result ?? j.data;
  const statement = buildStatementItems(result, undefined, undefined, undefined, undefined).get("transferGain");
  return { result, steps: (result.steps ?? []) as Array<{ label: string; formula?: string; amount?: number; legalBasis?: string }>, statement };
};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

describe("PF 단건 다필지 명세서 «전체 양도차익» 산식", () => {
  it("PF-1 필지 2개 — 합계 step·명세서 모두 «필지 1 197,000,000 + 필지 2 197,000,000» (종전: 첫 필지 안분가 산식)", async () => {
    const { result, steps, statement } = await run({ ...LAND, parcels: [parcel("a"), parcel("b")] });
    expect(result.transferGain).toBe(394_000_000);
    const total = steps.find((s) => s.label === "양도차익 합계");
    expect(total?.formula).toBe("필지 1 197,000,000 + 필지 2 197,000,000");
    expect(statement?.value).toBe(394_000_000);
    expect(statement?.formula).toBe("필지 1 197,000,000 + 필지 2 197,000,000");
    expect(statement?.legalBasis).toBe(TRANSFER.TRANSFER_GAIN);
  });

  it("PF-2 필지 1개 — «필지 1 597,000,000»", async () => {
    const { result, statement } = await run({ ...LAND, parcels: [parcel("a")] });
    expect(result.transferGain).toBe(597_000_000);
    expect(statement?.formula).toBe("필지 1 597,000,000");
    expect(statement?.value).toBe(597_000_000);
  });

  it("PF-3 필지 3개 — 양도차손 필지는 빼기로 적고, 문구 합 = 값 (800M ÷ 3 = 266,666,666·잔여 2원은 마지막 필지 · 합 91,000,000 = 800M − 700M − 9M 손계산)", async () => {
    const { result, statement } = await run({ ...LAND, parcels: [parcel("a"), parcel("b"), parcel("c", 300_000_000, 3_000_000)] });
    expect(result.transferGain).toBe(91_000_000);
    expect(statement?.formula).toBe("필지 1 63,666,666 + 필지 2 63,666,666 - 필지 3 36,333,332");
    expect(63_666_666 + 63_666_666 - 36_333_332).toBe(statement?.value);
  });

  it("PF-5 첫 필지가 양도차손 — 맨 앞은 부호만 붙이고(필지 1 -36,333,334) 이후는 더한다 (합 91,000,000 · 잔여 2원은 마지막 필지 63,666,668)", async () => {
    const { result, statement } = await run({ ...LAND, parcels: [parcel("a", 300_000_000, 3_000_000), parcel("b"), parcel("c")] });
    expect(result.transferGain).toBe(91_000_000);
    expect(statement?.formula).toBe("필지 1 -36,333,334 + 필지 2 63,666,666 + 필지 3 63,666,668");
    expect(-36_333_334 + 63_666_666 + 63_666_668).toBe(statement?.value);
  });

  it("PF-4 다필지 아닌 단건은 불변 — 합계 step 없음, 산식은 일반 경로 문구", async () => {
    const { steps, statement } = await run({ ...LAND });
    expect(steps.some((s) => s.label === "양도차익 합계")).toBe(false);
    expect(statement?.formula).toBe(steps.find((s) => s.label === "양도차익 계산")?.formula);
  });
});
