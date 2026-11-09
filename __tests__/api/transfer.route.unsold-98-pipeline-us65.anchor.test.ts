/**
 * anchor — US-65 §98 시리즈 풀 파이프라인(route: ⑫ Zod → ⑭ 매퍼 → 엔진) 원 단위 고정.
 *
 * 조문별 배선(hoType986 · isOverconcentration983 · unsold986Detail 2-pass 농특세 · §98의2 1세대1주택 표2 분기)이
 * ⑫·⑭ 또는 엔진 매핑 어느 층에서 끊겨도 아래 값이 바뀐다. 값은 엔진 출력이 아니라 손계산(각 케이스 주석)으로 정했다.
 * 세율: makeMockRates() 2024년 8구간(1,400만 6%·5,000만 15%·8,800만 24%·1.5억 35%·3억 38%…).
 * 양도일은 모두 2019 이후(장특 표1 연혁 영향 없음). 감면 전 산출세액 = 과세표준 × 세율 − 누진공제.
 *
 * 법령(조세특례제한법 현행 MST 284389): §98의6① 5년 후 = 5년간 발생한 양도소득금액의 100분의 50 차감,
 * §98의3① 5년 후 과밀억제권역 = 100분의 60, §98의2①1호 = 표2(1세대1주택 단서는 배제 대상 아님).
 * 농특세: 농특세법 시행령 §5② = (차감 전 세액 − 차감 후 세액) × 20% (§98의3은 시행령 §4⑦1호 열거라 0, §98의6은 과세).
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
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  return { status: res.status, r: json.data?.result as Record<string, unknown> | undefined, json };
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

const STD986 = {
  standardPriceAtAcquisition986: 200_000_000,
  standardPriceAt5Years986: 300_000_000,
  standardPriceAtTransfer986: 400_000_000, // 5년간 안분율 (300−200)/(400−200) = 0.5
};
const R986_COMMON = {
  type: "unsold_98_6" as const,
  stdPriceSumAtBase986: 550_000_000,
  floorAreaSqm986: 84.5,
  isUnsoldAfterCompletion986: true,
  isFirstContract986: true,
  isNotOccupiedAfterCompletion986: true,
  isNotRecontract986: true,
  ...STD986,
};

describe("US-65 — §98 시리즈 route 풀 파이프라인 anchor", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  /*
   * 공통 손계산(§98의6, 취득 2011-09-01 · 양도 2024-08-01 · 차익 300,000,000 · 2주택):
   *  보유 12년 11개월 → 12년 → 표1 24% → 장특 72,000,000, 양도소득금액 228,000,000
   *  5년 후 차감 = 228,000,000 × 0.5(5년 안분) × 50% = 57,000,000
   *  과세표준 = 228,000,000 − 57,000,000 − 2,500,000 = 168,500,000
   *   → 168,500,000 × 38% − 19,940,000 = 44,090,000 (결정세액)
   *  감면 전 = (228,000,000 − 2,500,000) × 38% − 19,940,000 = 65,750,000
   *  농특세 = (65,750,000 − 44,090,000) × 20% = 4,332,000
   *  지방소득세 = 44,090,000 × 10% = 4,409,000 → 총 52,831,000
   */
  it("US-65-1: §98의6 2호(buyer_rented) 5년 후 — 총 52,831,000 (hoType986·2-pass 농특세 배선)", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2011-09-01",
      reductions: [
        {
          ...R986_COMMON,
          hoType986: "buyer_rented",
          rentalContractDate986: "2011-10-01",
          rentalStartDate986: "2011-11-01",
          businessRegistrationDate986: "2011-10-15",
          rentalRegistrationDate986: "2011-10-20",
        },
      ],
    });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(72_000_000);
    expect(r!.calculatedTax).toBe(44_090_000);
    expect(r!.ruralSurtax).toBe(4_332_000);
    expect(r!.localIncomeTax).toBe(4_409_000);
    expect(r!.totalTax).toBe(52_831_000);
  });

  it("US-65-2: §98의6 1호(seller_rented) 5년 후 — 위와 같은 52,831,000", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2011-09-01",
      reductions: [{ ...R986_COMMON, hoType986: "seller_rented", sellerRented2Years986: true }],
    });
    expect(status).toBe(200);
    expect(r!.calculatedTax).toBe(44_090_000);
    expect(r!.ruralSurtax).toBe(4_332_000);
    expect(r!.totalTax).toBe(52_831_000);
  });

  /*
   * §98의3 과밀억제권역·사업주체 취득 5년 후 (취득 2009-12-01 · 양도 2024-08-01 · 차익 300,000,000):
   *  보유 14년 8개월 → 14년 → 표1 28% → 장특 84,000,000, 양도소득금액 216,000,000
   *  차감 = 216,000,000 × 0.5 × 60%(과밀) = 64,800,000  (비과밀이면 100% → 108,000,000)
   *  과세표준 = 216,000,000 − 64,800,000 − 2,500,000 = 148,700,000
   *   → 148,700,000 × 35% − 15,440,000 = 36,605,000
   *  농특세 0(농특세법 시행령 §4⑦1호) · 지방소득세 3,660,500 → 총 40,265,500
   */
  it("US-65-3: §98의3 과밀 사업주체 취득 5년 후 — 총 40,265,500 (isOverconcentration983 배선)", async () => {
    const { status, r } = await run({
      ...BASE,
      acquisitionDate: "2009-12-01",
      reductions: [
        {
          type: "unsold_98_3",
          residencyType983: "resident",
          houseType983: "purchased",
          contractDate983: "2009-06-15",
          isOutsideSeoulNotDesignated983: true,
          isOverconcentration983: true,
          landAreaSqm983: 400,
          floorAreaSqm983: 120,
          isUnsoldConfirmed983: true,
          isFirstContract983: true,
          isNotOccupiedAtContract983: true,
          isNotRecontract983: true,
          standardPriceAtAcquisition983: 200_000_000,
          standardPriceAt5Years983: 300_000_000,
          standardPriceAtTransfer983: 400_000_000,
        },
      ],
    });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(84_000_000);
    expect(r!.calculatedTax).toBe(36_605_000);
    expect(r!.ruralSurtax ?? 0).toBe(0);
    expect(r!.localIncomeTax).toBe(3_660_500);
    expect(r!.totalTax).toBe(40_265_500);
  });

  /*
   * §98의2 + 1세대1주택 고가(양도 15억 · 취득 10억 · 취득 2009-06-15 · 양도 2024-08-01 · 거주 120개월):
   *  과세 양도차익 = 500,000,000 × (15억 − 12억)/15억 = 100,000,000
   *  장특 = 표2 보유 40% + 거주 40% = 80% → 80,000,000 → 소득금액 20,000,000
   *  과세표준 = 20,000,000 − 2,500,000 = 17,500,000 → 17,500,000 × 15% − 1,260,000 = 1,365,000
   *  지방소득세 136,500 → 총 1,501,500
   *  (1세대1주택 분기가 없어 표2 보유 40%만 남으면: 60,000,000 − 2,500,000 = 57,500,000 → ×24% − 5,760,000 = 8,040,000, 총 8,844,000)
   */
  const R982 = {
    type: "unsold_98_2" as const,
    isNonCapitalUnsold982: true,
    isFirstOrFcfsContract982: true,
    occupiedAtContract982: "no" as const,
    contractDate982: "2009-06-01",
  };
  const ONE_HOUSE = {
    ...BASE,
    transferPrice: 1_500_000_000,
    acquisitionPrice: 1_000_000_000,
    acquisitionDate: "2009-06-15",
    householdHousingCount: 1,
    isOneHousehold: true,
  };

  it("US-65-4: §98의2 + 1세대1주택 거주 10년 — 장특 80%, 총 1,501,500 (isOneHouseSpecial982 분기)", async () => {
    const { status, r } = await run({ ...ONE_HOUSE, residencePeriodMonths: 120, reductions: [R982] });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(80_000_000);
    expect(r!.calculatedTax).toBe(1_365_000);
    expect(r!.totalTax).toBe(1_501_500);
  });

  it("US-65-5: 대조군 — 거주 12개월이면 표2 보유 단독 40%, 총 8,844,000", async () => {
    const { status, r } = await run({ ...ONE_HOUSE, residencePeriodMonths: 12, reductions: [R982] });
    expect(status).toBe(200);
    expect(r!.longTermHoldingDeduction).toBe(40_000_000);
    expect(r!.calculatedTax).toBe(8_040_000);
    expect(r!.totalTax).toBe(8_844_000);
  });
});
