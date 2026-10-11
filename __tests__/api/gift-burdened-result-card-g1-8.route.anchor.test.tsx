/**
 * @vitest-environment jsdom
 *
 * 1h-G1-8 anchor — 부담부증여 결과 카드(BurdenedTransferTaxResultCard)가 비과세 결론과 함께 엔진 경고를 보여 주고,
 * 부분 비과세(고가주택) 사유와 장기보유특별공제 산식이 결과와 어긋나지 않는다.
 *
 * 종전: ① isExempt 조기 return이 경고(§155㉓ 기한 · §154⑤ 재기산 판정 보류)를 버렸다 ② isPartialExempt 참조가 0건이라
 * 고가주택 사유가 없었다 ③ 과세 경로의 경고는 접힌 `hidden print:block` 상세 안에만 있었다 ④ 장특 산식이 「양도차익 × N%」인데
 * 공제액은 과세 양도차익 × N%였다. 정책: 「모름 = 혜택 불성립 + 확인 필요」 고지는 결론과 함께 보인다(2026-10-04),
 * 형제 `gift-burdened-stock-result-warnings.anchor`(BG-WARN)가 같은 공용 카드를 요구한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { gift } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const rhe = () => ({
  applyException: true,
  scenario: "A" as const,
  rentalUnits: [
    {
      ...makeDefaultRentalUnit(),
      businessRegistrationDate: "2018-06-01",
      rentalRegistrationDate: "2018-06-01",
      standardPriceAtRentalStart: "300,000,000",
      rentalInputMode: "direct" as const,
      rentalMonths: "30",
      requirementsConfirmed: true,
      rentalAutoTermination: true,
      terminatedRegistrationType: "short_term" as const,
      registrationCancellationDate: "2021-03-03",
    },
  ],
  postRegistrationResidenceMonths: "",
  priorRentalExemptionHistory: "" as const,
  residenceTransitionUnderAddendum: false,
});

const render1 = (r: unknown) => render(<BurdenedTransferTaxResultCard transferTaxResults={[r as TransferTaxResult]} />);
const dom = (r: unknown) => render1(r).container.textContent ?? "";

describe("G1-8 부담부증여 결과 카드 — 비과세 결론과 함께 경고", () => {
  it("G1-8-A: §155⑳ 비과세 + §155㉓ 기한 경고 → 카드에 경고가 보인다", async () => {
    const a = await gift("2025-06-01", { acquisitionDate: new Date("2016-01-10"), residencePeriodMonths: 60, householdHousingCount: 2, rentalHousingException: rhe() } as never);
    expect(a.isExempt).toBe(true);
    const t = dom(a);
    expect(t).toContain("확인이 필요한 사항");
    expect(t).toContain("§155㉓");
    expect(t).toContain("2026-03-03");
    expect(t).toContain("입력한 임대주택만");
  });

  it("G1-8-B: 비과세 + §154⑤ 재기산 판정 보류 고지(2021-06-01 증여) → 카드에 고지가 보인다", async () => {
    const e = await gift("2021-06-01", { acquisitionDate: new Date("2015-01-01"), householdHousingCount: 1 });
    expect(e.isExempt).toBe(true);
    expect(dom(e)).toContain("최종 1주택 보유기간 재기산");
  });

  it("G1-8-C(긍정 짝): 경고가 없는 비과세 결과는 빈 경고 박스를 그리지 않는다", async () => {
    const r = await gift("2025-06-01", { acquisitionDate: new Date("2015-01-01"), residencePeriodMonths: 60, householdHousingCount: 1 });
    expect(r.isExempt).toBe(true);
    expect((r.warnings as string[] | undefined) ?? []).toEqual([]);
    expect(dom(r)).not.toContain("확인이 필요한 사항");
  });

  it("G1-8-D: 과세 경로 경고도 접힌 상세(hidden print:block) 밖에 보인다", () => {
    const taxable = {
      isExempt: false, isPartialExempt: false, transferGain: 100, taxableGain: 100, longTermHoldingDeduction: 0, longTermHoldingRate: 0,
      basicDeduction: 0, taxBase: 100, appliedRate: 0.06, progressiveDeduction: 0, calculatedTax: 6, reductionAmount: 0, determinedTax: 6,
      penaltyTax: 0, localIncomeTax: 0, totalTax: 6, warnings: ["테스트 경고 문구"],
    };
    const { container } = render1(taxable);
    const el = Array.from(container.querySelectorAll("li")).find((n) => n.textContent === "테스트 경고 문구");
    expect(el).toBeTruthy();
    expect(el!.closest(".hidden")).toBeNull();
  });
});

describe("G1-8 부분 비과세(고가주택) 사유 · 장특 산식", () => {
  const partial = () =>
    gift("2025-06-01", { acquisitionDate: new Date("2015-01-01"), residencePeriodMonths: 60, householdHousingCount: 1, standardPriceAtAcquisition: 500_000_000 }, { standardPrice: 1_500_000_000, debt: 300_000_000 });

  it("G1-8-E: 15억·채무 3억 1주택 → 카드에 「고가주택」 사유와 12억 초과분 과세 문구가 있다", async () => {
    const b = await partial();
    expect(b.isPartialExempt).toBe(true);
    const t = dom(b);
    expect(t).toContain("1세대1주택 특례 적용 — 1세대1주택 고가주택");
    expect(t).toContain("증여가액 12억원 초과분에 대해서만 과세됩니다");
  });

  it("G1-8-F: 장기보유특별공제 산식은 과세 양도차익 기준이다(공제액 = 과세 양도차익 × 공제율)", async () => {
    const b = await partial();
    const t = dom(b);
    const rate = Math.round((b.longTermHoldingRate as number) * 100);
    expect(t).toContain(`장기보유특별공제: 과세 양도차익 × ${rate}%`);
    expect(t).not.toMatch(/장기보유특별공제:\s*양도차익 ×/);
    expect(b.longTermHoldingDeduction).toBe(Math.floor((b.taxableGain as number) * (rate / 100)));
  });

  it("G1-8-G(긍정 짝): 전액 과세(고가주택 아님·1세대 아님)에는 부분 비과세 사유를 그리지 않는다", async () => {
    const r = await gift("2025-06-01", { acquisitionDate: new Date("2015-01-01"), residencePeriodMonths: 0, householdHousingCount: 2, isOneHousehold: false });
    expect(r.isPartialExempt).toBeFalsy();
    expect(dom(r)).not.toContain("초과분에 대해서만 과세됩니다");
  });
});
