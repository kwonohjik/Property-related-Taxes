/**
 * 1h-G1-11 anchor(부담부증여 × 다주택 중과) — 「한시 유예 기준으로 산정」 고지는 유예가 실제로 적용된 결과에서만 붙는다.
 *
 * 근거: 「소득세법 시행령」 §167의10①12의2 가목은 보유기간 2년 이상인 주택을 「2026년 5월 9일까지 양도하는 주택」으로 중과
 * 대상에서 뺀다(1세대 2주택 · MST 290841 원문 확인). §167의3①12의2 가목이 3주택 이상의 같은 규정이다. 따라서 유예 밖
 * (2022.5.9. 이전 · 2026.5.10. 이후) 양도일에 엔진이 중과를 적용하는 것은 맞고, 종전의 「Phase 2 비스코프 — 결과는 한시 유예
 * 기준으로 산정되었습니다」 고지(날짜 게이트 없음)가 사실과 달랐다 — 한 결과 안에서 「…1세대 2주택 중과를 적용했습니다」와 모순됐다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { gift } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const BGT = { acquisitionDate: new Date("2015-03-01"), householdHousingCount: 2, isRegulatedArea: true, isOneHousehold: true, standardPriceAtAcquisition: 300_000_000 };
const OPTS = { standardPrice: 800_000_000, debt: 300_000_000 };
const ws = (r: Record<string, unknown>) => (r.warnings as string[] | undefined) ?? [];

describe("G1-11 부담부증여 × 다주택 중과 — 유예 고지는 유예 적용 결과에만", () => {
  for (const d of ["2021-06-01", "2022-05-09", "2026-05-10", "2026-10-01"]) {
    it(`G1-11-A: 유예 밖 ${d} — 중과가 적용되고 「한시 유예」 고지·개발 용어가 없다`, async () => {
      const r = await gift(d, BGT, OPTS);
      expect(r.surchargeType).toBe("multi_house_2");
      expect(r.isSurchargeSuspended).toBe(false);
      expect(ws(r).some((w) => /한시 유예|한시 배제|Phase 2|비스코프|별도 PR/.test(w))).toBe(false);
    });
  }

  for (const d of ["2022-05-10", "2024-03-01", "2026-05-09"]) {
    it(`G1-11-B(긍정 짝): 유예 창 안 ${d} — 유예가 적용되고 정확한 조문으로 고지한다`, async () => {
      const r = await gift(d, BGT, OPTS);
      expect(r.isSurchargeSuspended).toBe(true);
      const notice = ws(r).find((w) => w.includes("한시 배제를 적용했습니다"));
      expect(notice).toBeTruthy();
      expect(notice).toContain("제167조의10 제1항 제12호의2 가목");
      expect(notice).not.toMatch(/Phase 2|비스코프|별도 PR/);
    });
  }

  it("G1-11-C: 조정 OFF(중과 대상 아님)는 고지가 없다(대조)", async () => {
    const r = await gift("2026-10-01", { ...BGT, isRegulatedArea: false }, OPTS);
    expect(ws(r).some((w) => /한시/.test(w))).toBe(false);
  });
});
