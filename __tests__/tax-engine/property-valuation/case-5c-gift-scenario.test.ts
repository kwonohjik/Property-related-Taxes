/**
 * PR-B 후속 anchor — 증여세 사례 6 시나리오
 *
 * 검증 대상 (계획서 §3 PR-B + 디자인 §1 B-1):
 *   사례 6의 비상장주식 1주당 최종 평가액(할증후) 13,092원 + 수증 주식수 26,000주
 *   = 증여재산가액 340,392,000원을 직계비속 성년에게 증여하는 시나리오.
 *
 *   본 PR 비상장주식 V2 평가 모듈(property-valuation)이 사례 6 안정적으로 산출하는 13,092 →
 *   증여세 파이프라인(과세표준 → 누진세율 → 신고세액공제) 정합 검증.
 *
 * 시나리오:
 *   증여재산가액   = 340,392,000  (사례 6 V2 평가 결과를 marketValue로 직접 주입)
 *   증여공제      = 50,000,000   (§53①1호 — 직계비속 성년)
 *   과세표준      = 290,392,000  (5억 이하 구간)
 *   산출세액      = 290,392,000 × 20% − 1천만 누진공제 = 48,078,400  (상증법 §26)
 *   신고세액공제   = 48,078,400 × 3% = 1,442,352  (상증법 §69)
 *   결정세액      = 46,636,048
 *
 * 본 PR 비상장주식 V2 평가는 inheritance / gift 양쪽 공용 모듈이므로 사례 6 동일 입력 시
 * 1주당 평가액 13,092원이 동일하게 산출됨. 증여세 시나리오 anchor는 가장 단순한 형태로
 * 증여세 결정세액까지 도달함을 보장.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md §3 PR-B
 * Design: docs/02-design/features/inheritance-unlisted-stock-valuation-followup.design.md §1 B-1
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 사례 6: 13,092 × 26,000 = 340,392,000
const CASE_6_GIFT_AMOUNT = 340_392_000;

/**
 * 사례 6 비상장주식 1주당 평가액(할증후) × 수증 주식수의 합계를 단일 평가액으로 입력.
 * 비상장주식 V2 자체 평가 정합성은 case-3·case-4·case-5a-integration anchor에서 별도 검증.
 * 본 PR-B 시나리오는 증여세 파이프라인 (공제 → 누진세율 → 신고세액공제) 정합 검증에 집중.
 */
function case6StockItem(amount: number): EstateItem {
  return {
    id: "case6-stock",
    category: "financial",
    name: "(주)향기 비상장주식 평가액",
    marketValue: amount,
  };
}

// ============================================================
// B-1 — 사례 6 직계비속 성년 시나리오
// ============================================================

describe("[B-1] 사례 6 — 직계비속 성년 증여 시나리오", () => {
  it("B-1: 증여재산가액 340,392,000 → 결정세액 46,636,048", () => {
    const input: GiftTaxInput = {
      giftDate: "2024-01-20", // 사례 6 평가기준일
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [case6StockItem(CASE_6_GIFT_AMOUNT)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };

    const result = calcGiftTax(input);

    // 증여재산가액 = 평가액 (시가 직접 입력)
    expect(result.grossGiftValue).toBe(340_392_000);

    // 직계비속 성년 공제 5천만 (§53①1호)
    expect(result.totalDeduction).toBe(50_000_000);

    // 과세표준 = 340,392,000 − 50,000,000 = 290,392,000
    expect(result.taxBase).toBe(290_392_000);

    // 산출세액 (§26): 1억 이하 10% + 1~5억 구간 20%
    // = floor(290,392,000 × 0.2 − 10,000,000) = floor(58,078,400 − 10,000,000) = 48,078,400
    expect(result.computedTax).toBe(48_078_400);

    // 신고세액공제 (§69): floor(48,078,400 × 3%) = 1,442,352
    expect(result.creditDetail.filingCredit).toBe(1_442_352);

    // 결정세액 = 48,078,400 − 1,442,352 = 46,636,048
    expect(result.finalTax).toBe(46_636_048);

    // 세대생략 X
    expect(result.generationSkipSurcharge).toBe(0);
  });
});

// ============================================================
// B-2 — 세대생략 (조부 → 손자, ×30% 할증)
// ============================================================

describe("[B-2] 사례 6 변형 — 세대생략 (조부 → 손자 성년)", () => {
  it("B-2: 동일 340,392,000 + 세대생략 → 산출세액 ×130% + 신고세액공제", () => {
    /**
     * 세대생략 산출세액:
     *   기본 산출세액 = 48,078,400
     *   세대생략 할증 (§57 본문, 성년 일반): floor(48,078,400 × 0.3) = 14,423,520
     *   할증 후 산출세액 = 48,078,400 + 14,423,520 = 62,501,920
     *   신고세액공제 = floor(62,501,920 × 0.03) = 1,875,057
     *   결정세액 = 62,501,920 − 1,875,057 = 60,626,863
     */
    const input: GiftTaxInput = {
      giftDate: "2024-01-20",
      donorRelation: "lineal_descendant",
      donor: "grandparent", // 조부 → 손자
      giftItems: [case6StockItem(CASE_6_GIFT_AMOUNT)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };

    const result = calcGiftTax(input);

    expect(result.taxBase).toBe(290_392_000);
    expect(result.computedTax).toBe(48_078_400);

    // 세대생략 할증 (성년 일반 30%): floor(48,078,400 × 0.3) = 14,423,520
    expect(result.generationSkipSurcharge).toBe(14_423_520);

    // 결정세액 양수 검증 (할증 후 세액 > 기본)
    expect(result.finalTax).toBeGreaterThan(46_636_048);
  });
});

// ============================================================
// B-3 — 사전증여 5천만 합산
// ============================================================

describe("[B-3] 사례 6 변형 — 사전증여 5천만 합산", () => {
  it("B-3: 금번 340,392,000 + 사전 50,000,000 → 공제 잔여 0, 과세표준 340,392,000", () => {
    /**
     * aggregatedGiftValue = 340,392,000 + 50,000,000 = 390,392,000
     * 관계공제 = 50,000,000 − 50,000,000(기사용) = 0
     * 과세표준 = 390,392,000 − 0 = 390,392,000 (5억 이하)
     * 산출세액 = floor(390,392,000 × 0.2 − 10,000,000) = 68,078,400
     * 기납부세액공제 (사전증여 50,000,000에 대한 산출세액):
     *   사전 단독: 50,000,000 − 50,000,000 = 0 → 기납부 0
     * 신고세액공제 = floor(68,078,400 × 0.03) = 2,042,352
     * 결정세액 ≈ 68,078,400 − 2,042,352 = 66,036,048 (기납부 0 기준)
     */
    const input: GiftTaxInput = {
      giftDate: "2024-01-20",
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [case6StockItem(CASE_6_GIFT_AMOUNT)],
      priorGiftsWithin10Years: [
        {
          giftDate: "2020-01-20",
          isHeir: false,
          giftAmount: 50_000_000,
          giftTaxPaid: 0,
          donor: "father",
        },
      ],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 50_000_000, // 기사용 5천만
      },
      creditInput: { isFiledOnTime: true },
    };

    const result = calcGiftTax(input);

    expect(result.aggregatedGiftValue).toBe(390_392_000);
    expect(result.totalDeduction).toBe(0); // 공제 소진
    expect(result.taxBase).toBe(390_392_000);

    // 산출세액 = floor(390,392,000 × 0.2 − 10,000,000) = 68,078,400
    expect(result.computedTax).toBe(68_078_400);

    // 결정세액은 기납부세액공제 차감 후이므로 단독 시나리오(46,636,048)보다 큰 양수 보장
    expect(result.finalTax).toBeGreaterThan(46_636_048);
  });
});

// ============================================================
// B-4 — 비교: 동일 가액을 기타친족 증여 시 (공제 1천만)
// ============================================================

describe("[B-4] 사례 6 변형 — 기타친족 증여 (공제 1천만, 더 높은 세액)", () => {
  it("B-4: 동일 340,392,000 + 기타친족 → 과세표준 330,392,000, 결정세액 약 60M", () => {
    /**
     * 기타친족 공제 = 10,000,000 (§53①4호)
     * 과세표준 = 340,392,000 − 10,000,000 = 330,392,000
     * 산출세액 = floor(330,392,000 × 0.2 − 10,000,000) = 56,078,400
     * 신고세액공제 = floor(56,078,400 × 0.03) = 1,682,352
     * 결정세액 = 56,078,400 − 1,682,352 = 54,396,048
     */
    const input: GiftTaxInput = {
      giftDate: "2024-01-20",
      donorRelation: "other_relative",
      donor: "other_relative",
      giftItems: [case6StockItem(CASE_6_GIFT_AMOUNT)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "other_relative" },
      creditInput: { isFiledOnTime: true },
    };

    const result = calcGiftTax(input);

    expect(result.totalDeduction).toBe(10_000_000);
    expect(result.taxBase).toBe(330_392_000);
    expect(result.computedTax).toBe(56_078_400);
    expect(result.creditDetail.filingCredit).toBe(1_682_352);
    expect(result.finalTax).toBe(54_396_048);
  });
});
