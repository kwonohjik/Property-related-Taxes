/**
 * 약칭 주소 계산기 경로 anchor — 폼 → ⑧ → ④ → route → 엔진. 계획서 `docs/00-pm/regulated-area-abbrev-address.plan.md` §1.
 * 강남 주택 · 2018-03-02 취득 · 거주 0 · 법정동코드 없음(주소 직접 입력) · 토글 안 만짐.
 * 종전: 「서울 강남구 …」는 시·도 약칭이라 「데이터 미수록 → 아님」 — 1주택 0(비과세) · 2주택 230,967,000(중과 누락).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { runCalc, houseRow } from "./_helpers/redev-one-house-route";
import { HOUSE, form } from "./_helpers/g1-reverse-appurtenant-fixtures";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const mk = (addr: string, over: Partial<TransferFormData> = {}) =>
  ({
    ...(form({ ...HOUSE(0), addressJibun: addr, regionCode: "", acquisitionDate: "2018-03-02", residencePeriodMonthsAsset: "0" }) as object),
    ...over,
  }) as TransferFormData;
const TWO: Partial<TransferFormData> = { transferDate: "2026-08-01", householdHousingCount: "2", houses: [houseRow("x1", "2015-01-01")] };

describe("약칭 주소 = 정식 명칭 (세액)", () => {
  for (const addr of ["서울 강남구 테헤란로 123", "서울시 강남구 테헤란로 123", "(06236) 서울특별시 강남구 테헤란로 123"]) {
    it(`${addr} — 1주택 237,435,000 · 2주택 436,161,000`, async () => {
      const one = await runCalc(mk(addr));
      expect(one.issues).toEqual([]);
      expect([one.body.isRegulatedArea, one.body.wasRegulatedAtAcquisition]).toEqual([true, true]);
      expect(one.result.totalTax).toBe(237_435_000);
      const two = await runCalc(mk(addr, TWO));
      expect(two.result.totalTax).toBe(436_161_000);
    });
  }
});

describe("알아볼 수 없는 주소 — 조정대상지역으로 보고 계산(모름 = 혜택 불성립), 직접 고른 토글은 존중", () => {
  it("「강남구 테헤란로 123」(시·도 생략) → 조정대상지역 · 237,435,000", async () => {
    const r = await runCalc(mk("강남구 테헤란로 123"));
    expect([r.body.isRegulatedArea, r.body.wasRegulatedAtAcquisition]).toEqual([true, true]);
    expect(r.result.totalTax).toBe(237_435_000);
  });
  it("같은 주소 · 「아니오」를 직접 고르면 비과세 0", async () => {
    const r = await runCalc(
      mk("강남구 테헤란로 123", { isRegulatedAreaTouched: true, wasRegulatedAtAcquisitionTouched: true }),
    );
    expect([r.body.isRegulatedArea, r.body.wasRegulatedAtAcquisition]).toEqual([false, false]);
    expect(r.result.totalTax).toBe(0);
  });
});
