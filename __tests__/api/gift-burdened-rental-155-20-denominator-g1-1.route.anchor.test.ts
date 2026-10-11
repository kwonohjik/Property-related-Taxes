/**
 * 1h-G1-1 anchor(부담부증여 × §155⑳) — 12억 판정·안분 분모는 채무 안분 양도가액 B가 아니라 증여가액 C다.
 *
 * 근거: 「소득세법 시행령」 §155⑳은 거주주택을 「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을
 * 적용」한다(MST 290841). 그래서 「소득세법」 §89①3호 괄호(고가주택 제외)·「소득세법 시행령」 §160①(안분)이
 * 일반 1세대1주택과 같은 축으로 걸린다. 부담부증여의 분모는 증여가액이다(서면4팀-1692: 이전방식에 관계없이 1주택의
 * 전체가액 기준 — 검토 인용). 일반 경로(`calcOneHouseProration`)는 이미 C를 쓴다 — 대조 X2.
 *
 * 종전에는 이 경로만 `transferPrice`(= §159 B)를 분모로 써서, 증여 15억·채무 3억 거주주택(B = 3억 이하)이
 * RH-A1 전액 비과세로 빠졌다. F07-BG1 동결 가드의 해제 조건(도달성·해석 B 적용 여부 확정)은 E-1 잔여 C로 충족됐다.
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { gift, type Obj } from "./_gift-burdened-pr7-harness";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

const rhe = (scenario: "A" | "B" = "A") => ({
  applyException: true,
  scenario,
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
const BASE = {
  acquisitionDate: new Date("2016-01-10"),
  residencePeriodMonths: 60,
  householdHousingCount: 2,
  standardPriceAtAcquisition: 500_000_000,
};
const bgt = { ...BASE, rentalHousingException: rhe() } as never;
type RH = { scenarioId: string; taxableGain: number; formulaTrace: Obj };
const rh = (r: Obj) => r.rentalHousingExceptionDetail as RH;

describe("G1-1 부담부증여 × §155⑳ — 12억 분모 = 증여가액 C", () => {
  it("G1-1-A: 증여 15억 · 채무 3억 → RH-A2 · 안분 (C−12억)/C = 0.2 · 과세분 86,680,000 × 3/15", async () => {
    const r = await gift("2025-06-01", bgt, { standardPrice: 1_500_000_000, debt: 300_000_000 });
    expect(r.isExempt).toBe(false);
    expect(rh(r).scenarioId).toBe("RH-A2");
    expect(rh(r).formulaTrace.ratioHighValue).toBeCloseTo(0.2, 12);
    // 표2 장특 후 gain95Table2 × 3/15 — 리뷰의 산술(86,680,000 × 3/15)을 실측 trace로 확정
    const t2 = rh(r).formulaTrace.gain95Table2 as number;
    expect(t2).toBe(86_680_000);
    expect(rh(r).taxableGain).toBe(17_336_000);
  });
  it("G1-1-B: 증여 15억 · 채무 13억 → B 분모(1/13)가 아니라 C 분모 0.2", async () => {
    const r = await gift("2025-06-01", bgt, { standardPrice: 1_500_000_000, debt: 1_300_000_000 });
    expect(rh(r).scenarioId).toBe("RH-A2");
    expect(rh(r).formulaTrace.ratioHighValue).toBeCloseTo(0.2, 12);
  });
  it("G1-1-C(긍정 짝): 증여 11억 → 12억 이하라 RH-A1 전액 비과세", async () => {
    const r = await gift("2025-06-01", bgt, { standardPrice: 1_100_000_000, debt: 300_000_000 });
    expect(r.isExempt).toBe(true);
    expect(rh(r).scenarioId).toBe("RH-A1");
  });
  it("G1-1-D(긍정 짝): 증여 12억 정확히 → 고가주택 아님(초과분 0) — 전액 비과세", async () => {
    const r = await gift("2025-06-01", bgt, { standardPrice: 1_200_000_000, debt: 300_000_000 });
    expect(r.isExempt).toBe(true);
    expect(rh(r).scenarioId).toBe("RH-A1");
  });

  describe("시나리오 B(직전거주주택보유주택 — §161) 도 같은 분모를 받는다", () => {
    const rheB = {
      applyException: true,
      scenario: "B" as const,
      rentalUnits: [
        {
          ...makeDefaultRentalUnit(),
          businessRegistrationDate: "2015-06-01",
          rentalRegistrationDate: "2015-06-01",
          standardPriceAtRentalStart: "250,000,000",
          rentalInputMode: "direct" as const,
          rentalMonths: "120",
          requirementsConfirmed: true,
        },
      ],
      priorResidenceTransferDate: "2021-08-25",
      standardPriceAtAcquisitionForPhrp: "300,000,000",
      standardPriceAtPriorTransfer: "450,000,000",
      standardPriceAtTransferForPhrp: "500,000,000",
      postRegistrationResidenceMonths: "36",
      priorRentalExemptionHistory: "" as const,
      residenceTransitionUnderAddendum: false,
    };
    const bgtB = { ...BASE, rentalHousingException: rheB } as never;

    it("G1-1-E: 증여 15억 · 채무 3억 → RH-B2 · ratioHighValue 0.2 · 과세분 = 1호분 121,155,000 + 2호분 86,680,000 × 25% × 3/15", async () => {
      const r = await gift("2025-06-01", bgtB, { standardPrice: 1_500_000_000, debt: 300_000_000 });
      expect(rh(r).scenarioId).toBe("RH-B2");
      expect(rh(r).formulaTrace.ratioHighValue).toBeCloseTo(0.2, 12);
      expect(rh(r).formulaTrace.part1).toBe(121_155_000);
      expect(rh(r).formulaTrace.part2).toBe(4_334_000);
      expect(rh(r).taxableGain).toBe(125_489_000);
    });
    it("G1-1-F: 증여 15억 · 채무 13억 → 안분 비율 0.2(C 분모)", async () => {
      const r = await gift("2025-06-01", bgtB, { standardPrice: 1_500_000_000, debt: 1_300_000_000 });
      expect(rh(r).scenarioId).toBe("RH-B2");
      expect(rh(r).formulaTrace.ratioHighValue).toBeCloseTo(0.2, 12);
      // 375,613,334 × 25% × 0.2 = 18,780,666.7 → 원 미만 절사
      expect(rh(r).formulaTrace.part2).toBe(18_780_666);
    });
    it("G1-1-G(긍정 짝): 증여 11억 → RH-B1(12억 이하 — 고가 안분 없음)", async () => {
      const r = await gift("2025-06-01", bgtB, { standardPrice: 1_100_000_000, debt: 300_000_000 });
      expect(rh(r).scenarioId).toBe("RH-B1");
    });
  });
});
