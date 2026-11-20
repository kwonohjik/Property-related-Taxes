/**
 * D-45 route anchor — 원조합원 완공APT(종전 2018-01-10 강남·조정, 준공 2022-03-10, 2024-03-11 10억 양도)에 신축 거주
 * 2022-03-10~2024-03-09(정확히 2년)를 카드로 넣은 옛 기록(첫날을 빼 「23」으로 저장)이 정본 셈(24)으로 다시 도출돼 §154① 거주요건을 채운다.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, shouldBypassRateLimit: vi.fn().mockReturnValue(true) };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const form = (end: string, storedMonths: string) =>
  redevAptForm({
    price: "1000000000",
    assetOver: {
      acquisitionDate: "2018-01-10",
      regionCode: "1168010100",
      redevApprovalDate: "2019-06-01",
      redevCompletionDate: "2022-03-10",
      redevNewResidenceStartDate: "2022-03-10",
      redevNewResidenceEndDate: end,
      redevNewHouseResidenceMonths: storedMonths,
      residencePeriods: [],
    },
    formOver: { transferDate: "2024-03-11", filingDate: "2024-05-31", residencePeriodMonths: "0", wasRegulatedAtAcquisition: true } as never,
  });

describe("D-45 계산기 — 카드 거주 개월은 날짜에서 다시 도출", () => {
  it("2022-03-10~2024-03-09 + 저장 「23」(옛 카드) → 24개월로 읽어 비과세", async () => {
    const r = await runCalc(form("2024-03-09", "23"));
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
  });

  it("대조 — 하루 모자란 2024-03-08(23개월)은 과세", async () => {
    const r = await runCalc(form("2024-03-08", "23"));
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });
});
