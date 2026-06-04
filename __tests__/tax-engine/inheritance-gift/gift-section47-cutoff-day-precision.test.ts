/**
 * §47 증여 경로 cutoff 일(日) 단위 정합 anchor — G-H1 수정 검증
 *
 * 대상 함수:
 *   aggregatePriorGiftsForGift (gift-prior-aggregation.ts, 3-arg) — 실제 증여 엔진 실행 경로
 *   calcGiftTax — 전체 파이프라인 종합 검증
 *
 * 수정 배경:
 *   §47②: "해당 증여일 전 10년 이내에 동일인으로부터 받은 증여재산가액"
 *   민법 §160②: boundary = subYears(증여일, 10) — 경계일 당일 포함, 전일 제외
 *
 * 버그: gift-prior-aggregation.ts:112-113
 *   elapsedYears = differenceInYears(current, new Date(gift.giftDate)) — 만(滿) 연수 절사
 *   if (elapsedYears > 10) continue;
 *   → 10년+1일~364일 도과 사전증여가 합산에 잘못 포함
 *
 * 수정: isBefore(new Date(gift.giftDate), subYears(current, 10)) — 일(日) 단위 비교
 *
 * KoreanLaw MCP 검증: §47② (mst 276123, 2026-01-02 시행)
 */

import { describe, it, expect } from "vitest";
import { aggregatePriorGiftsForGift } from "@/lib/tax-engine/gift-prior-aggregation";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

// ─────────────────────────────────────────────────────────
// PRE-DO anchor: 현재 buggy 동작을 먼저 드러내고 수정 후 GREEN
// 테스트 기준: giftDate(현재 증여일) = 2026-05-21
//   boundary47 = subYears(2026-05-21, 10) = 2016-05-21
//   - 2016-05-21: 경계일 당일 → 포함 (§47② "이내")
//   - 2016-05-20: 경계일 전일 → 제외 (10년 1일 도과)
// ─────────────────────────────────────────────────────────

const GIFT_DATE = "2026-05-21";
const BOUNDARY_INCLUDE = "2016-05-21"; // 경계일 포함
const BOUNDARY_EXCLUDE = "2016-05-20"; // 도과 1일 → 제외

// ============================================================
// (1) aggregatePriorGiftsForGift 3-arg 직접 anchor
// ============================================================
describe("G-H1: aggregatePriorGiftsForGift(3-arg) §47 일(日) 단위 경계 — 실제 증여 경로", () => {
  /**
   * CUTOFF-G1: 경계일(2016-05-21) 사전증여 → 포함
   * 수정 전(buggy): differenceInYears(2026-05-21, 2016-05-21)=10 → 10>10=false → 포함(우연히 정답)
   * 수정 후(정합): isBefore(2016-05-21, 2016-05-21)=false → !isBefore=true → 포함 (동일)
   * → 경계일 포함은 양쪽 모두 PASS — 도과일 테스트가 핵심
   */
  it("CUTOFF-G1: 경계일(2016-05-21) 사전증여 200M → 합산 포함 (§47② 이내)", () => {
    const priorGifts: PriorGift[] = [
      {
        giftDate: BOUNDARY_INCLUDE,
        isHeir: false,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        donor: "father",
      },
    ];
    const result = aggregatePriorGiftsForGift(priorGifts, GIFT_DATE, "father");
    expect(result.totalAmount).toBe(200_000_000);
  });

  /**
   * CUTOFF-G2: 도과일(2016-05-20) 사전증여 300M → 제외해야 정합
   * 수정 전(buggy): differenceInYears(2026-05-21, 2016-05-20)=10 → 10>10=false → 포함(버그)
   *   → result.totalAmount = 300_000_000 (잘못된 합산)
   * 수정 후(정합): isBefore(2016-05-20, 2016-05-21)=true → continue → 제외
   *   → result.totalAmount = 0
   *
   * 이 테스트는 수정 전에 FAIL, 수정 후에 PASS.
   */
  it("CUTOFF-G2: 도과일(2016-05-20) 사전증여 300M → 합산 제외 (10년+1일 도과)", () => {
    const priorGifts: PriorGift[] = [
      {
        giftDate: BOUNDARY_EXCLUDE,
        isHeir: false,
        giftAmount: 300_000_000,
        giftTaxPaid: 0,
        donor: "father",
      },
    ];
    const result = aggregatePriorGiftsForGift(priorGifts, GIFT_DATE, "father");
    // 버그 상태: 300M 포함(잘못) → 수정 후 0이 되어야 함
    expect(result.totalAmount).toBe(0);
  });

  /**
   * CUTOFF-G3: 도과+경계 혼합 — 도과 300M 제외, 경계 200M만 포함
   */
  it("CUTOFF-G3: 도과(300M)+경계(200M) 혼합 → 경계일만 합산 = 200M", () => {
    const priorGifts: PriorGift[] = [
      {
        giftDate: BOUNDARY_EXCLUDE, // 도과 → 제외
        isHeir: false,
        giftAmount: 300_000_000,
        giftTaxPaid: 0,
        donor: "father",
      },
      {
        giftDate: BOUNDARY_INCLUDE, // 경계 → 포함
        isHeir: false,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        donor: "father",
      },
    ];
    const result = aggregatePriorGiftsForGift(priorGifts, GIFT_DATE, "father");
    // 버그 상태: 300M + 200M = 500M(잘못) → 수정 후 200M
    expect(result.totalAmount).toBe(200_000_000);
  });
});

// ============================================================
// (2) calcGiftTax 종합 파이프라인 anchor
//     도과 사전증여가 aggregatedGiftValue·과세표준·산출세액에 미치는 영향 동결
// ============================================================
describe("G-H1: calcGiftTax §47 도과 사전증여 제외 — 과세표준·산출세액 정합", () => {
  /**
   * 시나리오:
   *   현재 증여: 부모→성년자녀, 금번 2026-05-21, 현금 3억(300M)
   *   사전증여1: 2016-05-21(경계일, 200M) → 합산 포함
   *   사전증여2: 2016-05-20(도과, 100M) → 합산 제외
   *
   * 정합 계산:
   *   aggregatedGiftValue = 300M(금번) + 200M(경계포함) = 500M
   *   증여재산공제(직계존속→성년) = 50M (10년 한도)
   *   과세표준 = 500M - 50M = 450M (천원 절사 불필요, 정수)
   *   산출세액 = floor(450M × 0.2) - 10M(누진공제) = 90M - 10M = 80M
   *   신고공제(3%) = floor(80M × 0.03) = 2,400,000
   *   최종납부 = 80M - 2.4M = 77,600,000
   *
   * 버그 상태(도과 포함 시):
   *   aggregatedGiftValue = 300M + 200M + 100M = 600M
   *   과세표준 = 600M - 50M = 550M
   *   산출세액 = floor(550M × 0.2) - 10M = 110M - 10M = 100M
   *   신고공제 = floor(100M × 0.03) = 3,000,000
   *   최종납부 = 100M - 3M = 97,000,000 (과대)
   */
  const giftTaxInput = {
    giftDate: GIFT_DATE,
    donorRelation: "lineal_ascendant_adult" as const,
    donor: "father" as const,
    isGenerationSkip: false,
    isMinorDonee: false,
    giftItems: [
      {
        id: "item1",
        category: "cash" as const,
        name: "현금",
        marketValue: 300_000_000,
      },
    ],
    priorGiftsWithin10Years: [
      {
        giftDate: BOUNDARY_INCLUDE, // 경계일 → 포함
        isHeir: false,
        giftAmount: 200_000_000,
        giftTaxPaid: 0,
        donor: "father" as const,
      },
      {
        giftDate: BOUNDARY_EXCLUDE, // 도과 → 제외
        isHeir: false,
        giftAmount: 100_000_000,
        giftTaxPaid: 0,
        donor: "father" as const,
      },
    ],
    deductionInput: {
      donorRelation: "lineal_ascendant_adult" as const,
      // 성년 직계존속 공제 50M — 이전 증여 기적용분 0 가정
    },
    creditInput: {
      isFiledOnTime: true,
    },
  };

  it("CUTOFF-G4: aggregatedGiftValue = 500M (도과 100M 제외 정합)", () => {
    const result = calcGiftTax(giftTaxInput);
    // 버그: 600M, 정합: 500M
    expect(result.aggregatedGiftValue).toBe(500_000_000);
  });

  it("CUTOFF-G5: taxBase = 450,000,000 (과세표준 도과분 제외 정합)", () => {
    const result = calcGiftTax(giftTaxInput);
    // 버그: 550M, 정합: 450M
    expect(result.taxBase).toBe(450_000_000);
  });

  it("CUTOFF-G6: computedTax = 80,000,000 (산출세액 정합)", () => {
    // 정합: 450M × 20% - 10M = 80M
    // 버그: 550M × 20% - 10M = 100M
    const result = calcGiftTax(giftTaxInput);
    expect(result.computedTax).toBe(80_000_000);
  });

  it("CUTOFF-G7: finalTax = 77,600,000 (신고공제 후 최종납부 정합)", () => {
    // 정합: 80M - floor(80M × 0.03) = 80M - 2,400,000 = 77,600,000
    // 버그: 100M - floor(100M × 0.03) = 100M - 3M = 97,000,000
    const result = calcGiftTax(giftTaxInput);
    expect(result.finalTax).toBe(77_600_000);
  });
});
