/**
 * §71⑦ — 감면받은 농지의 §47② 동일인 합산: 과세부분(㉯)만 합산 (3차+ 증여)
 *
 * 법령: 조특법 §71⑦ — "증여세를 감면받은 농지등은 §47②에 따라 해당 증여일 전 10년 이내에
 *   자경농민으로부터 증여받아 합산하는 증여재산가액에 포함시키지 아니한다."
 * 예규: 재산세과-2450·법규재산-2314 — 감면받은 농지 ㉮ 합산 제외, 과세부분(㉯)만 10년 일반증여와 합산.
 *   "3차 증여분 중 과세부분은 ... 일반증여재산과 '2차 증여분 중 과세부분(㉯)'을 합산하여 과세."
 *
 * 구현(opt-in): PriorGift.farmlandReductionApplied=true + farmlandTaxablePortion(㉯) 설정 시
 *   §47② 합산에서 giftAmount(전액) 대신 ㉯ 사용. 미설정이면 전액(FR-1 2차 = 재재산-1454 불변).
 *
 * anchor: 부친→자녀, 금번 현금 3억(비농지), 직전 농지B(감면) ㉯=5억(전액 8.13066억).
 *   합산 증여가액 = 금번 3억 + 직전 ㉯ 5억 = 8억 (현행 버그: 3억 + 전액 8.13066억 = 11.13066억).
 *   (aggregatedGiftValue는 증여공제 차감 전 — 공제 10년누계 무관하게 ㉯ 합산만 격리.)
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// 직전 농지B (감면 회차) — §47② 합산은 과세부분 ㉯=5억만 (감면부분 제외)
const priorFarmlandB: PriorGift = {
  giftDate: "2021-01-01",
  donor: "father",
  isHeir: false,
  giftAmount: 813_066_000, // 전액(평가액)
  giftTaxPaid: 0,
  computedTax: 0, // §58 격리 (본 anchor는 §47② 합산 검증 전용)
  giftTaxBase: 0,
  farmlandReductionApplied: true,
  farmlandTaxablePortion: 500_000_000, // ㉯ 과세부분 — 이 값으로 합산
};

const current: GiftTaxInput = {
  giftDate: "2024-01-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [{ id: "c", category: "cash", name: "현금", marketValue: 300_000_000 }],
  priorGiftsWithin10Years: [priorFarmlandB],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("§71⑦ — 감면농지 prior는 과세부분(㉯)만 §47② 합산", () => {
  const r = calcGiftTax(current);

  it("합산 증여가액 = 금번 3억 + 직전 ㉯ 5억 = 8억 (전액 8.13066억 아님)", () => {
    expect(r.aggregatedGiftValue).toBe(800_000_000);
  });

  it("무회귀 — farmlandTaxablePortion 미설정 prior는 전액(giftAmount) 합산", () => {
    const r2 = calcGiftTax({
      ...current,
      priorGiftsWithin10Years: [
        { ...priorFarmlandB, farmlandTaxablePortion: undefined },
      ],
    });
    // ㉯ 미설정 → 전액 813,066,000 합산 → 3억 + 8.13066억 = 11.13066억
    expect(r2.aggregatedGiftValue).toBe(1_113_066_000);
  });

  it("무회귀 — farmlandReductionApplied 아닌 일반 prior는 ㉯ 무시·전액 합산", () => {
    const r3 = calcGiftTax({
      ...current,
      priorGiftsWithin10Years: [
        { ...priorFarmlandB, farmlandReductionApplied: false },
      ],
    });
    expect(r3.aggregatedGiftValue).toBe(1_113_066_000);
  });
});
