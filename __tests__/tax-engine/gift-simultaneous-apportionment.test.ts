/**
 * 동시증여 증여재산공제 안분 (상증령 §46①2호) — anchor
 *
 * 트리거 사례(교재): 갑(성년)이 2023.2.1. 부 90,000천 + 모 40,000천(동일인 합산 130,000천)
 * + 할아버지 70,000천을 동시 증여.
 *   - 부모 신고:   50,000천 × 130,000 ÷ 200,000 = 32,500천
 *   - 할아버지 신고: 50,000천 × 70,000 ÷ 200,000 = 17,500천
 *
 * 안분 그룹 키 = donorRelation. simultaneousGifts 각 항목 = 다른 동일인 그룹의 합산 과세가액.
 */

import { describe, it, expect } from "vitest";
import {
  calcRelationDeduction,
  calcGiftDeductions,
} from "@/lib/tax-engine/deductions/gift-deductions";
import type { GiftDeductionInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const makeInput = (
  partial: Partial<GiftDeductionInput> & { donorRelation: GiftDeductionInput["donorRelation"] },
): GiftDeductionInput => ({
  priorUsedDeduction: 0,
  ...partial,
});

describe("동시증여 증여재산공제 안분 — calcRelationDeduction (상증령 §46①2호)", () => {
  it("[C1] 이미지 부모 신고: 50,000천 × 130,000 ÷ 200,000 = 32,500,000", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_adult", taxableValue: 70_000_000 }],
    });
    const { relationDeduction, apportionment } = calcRelationDeduction(input, 130_000_000);
    expect(relationDeduction).toBe(32_500_000);
    expect(apportionment?.denominator).toBe(200_000_000);
    expect(apportionment?.binding).toBe(true);
  });

  it("[C2] 이미지 할아버지 신고: 50,000천 × 70,000 ÷ 200,000 = 17,500,000", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_adult", taxableValue: 130_000_000 }],
    });
    const { relationDeduction } = calcRelationDeduction(input, 70_000_000);
    expect(relationDeduction).toBe(17_500_000);
  });

  it("[C3] 직계비속 자녀A: 50,000천 × 60,000 ÷ 100,000 = 30,000,000", () => {
    const input = makeInput({
      donorRelation: "lineal_descendant",
      simultaneousGifts: [{ donorRelation: "lineal_descendant", taxableValue: 40_000_000 }],
    });
    const { relationDeduction } = calcRelationDeduction(input, 60_000_000);
    expect(relationDeduction).toBe(30_000_000);
  });

  it("[C4] 직계비속 자녀B: 50,000천 × 40,000 ÷ 100,000 = 20,000,000", () => {
    const input = makeInput({
      donorRelation: "lineal_descendant",
      simultaneousGifts: [{ donorRelation: "lineal_descendant", taxableValue: 60_000_000 }],
    });
    const { relationDeduction } = calcRelationDeduction(input, 40_000_000);
    expect(relationDeduction).toBe(20_000_000);
  });

  it("[C5] 미성년 부모 신고: 20,000천 × 130,000 ÷ 200,000 = 13,000,000", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_minor",
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_minor", taxableValue: 70_000_000 }],
    });
    const { relationDeduction } = calcRelationDeduction(input, 130_000_000);
    expect(relationDeduction).toBe(13_000_000);
  });

  it("[C6] 다른 한도그룹(기타친족) 비안분: 직계존속 신고는 분모 제외 → 전액 50,000,000", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      simultaneousGifts: [{ donorRelation: "other_relative", taxableValue: 30_000_000 }],
    });
    const { relationDeduction, apportionment } = calcRelationDeduction(input, 100_000_000);
    expect(relationDeduction).toBe(50_000_000);
    expect(apportionment).toBeUndefined();
  });

  it("[C7] 한도 미구속(합<한도): 안분액>과세가액 → min 캡 → 전액 20,000,000, binding=false", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_adult", taxableValue: 10_000_000 }],
    });
    const { relationDeduction, apportionment } = calcRelationDeduction(input, 20_000_000);
    expect(relationDeduction).toBe(20_000_000);
    expect(apportionment?.binding).toBe(false);
  });

  it("[C8] 회귀(동시증여 없음): 기존 단건 공제 불변 50,000,000, apportionment undefined", () => {
    const input = makeInput({ donorRelation: "lineal_ascendant_adult" });
    const { relationDeduction, apportionment } = calcRelationDeduction(input, 100_000_000);
    expect(relationDeduction).toBe(50_000_000);
    expect(apportionment).toBeUndefined();
  });
});

describe("§53의2 가드 — calcGiftDeductions (동시증여 + 혼인공제 동시)", () => {
  it("[C-guard] 동시증여 안분 + 혼인공제 요청 → 혼인공제 미적용(0) + marriageBirthSkipped", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      marriageExemption: 100_000_000,
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_adult", taxableValue: 70_000_000 }],
    });
    const result = calcGiftDeductions(input, 130_000_000);
    expect(result.relationDeduction).toBe(32_500_000);
    expect(result.marriageBirthDeduction).toBe(0);
    expect(result.apportionment?.marriageBirthSkipped).toBe(true);
    expect(result.totalDeduction).toBe(32_500_000);
  });

  it("[C-guard2] 동시증여 없으면 혼인공제 정상 적용 (회귀)", () => {
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      marriageExemption: 100_000_000,
    });
    const result = calcGiftDeductions(input, 300_000_000);
    expect(result.relationDeduction).toBe(50_000_000);
    expect(result.marriageBirthDeduction).toBe(100_000_000);
    expect(result.apportionment).toBeUndefined();
  });
});

describe("동시증여 안분 분자·분모 = 현재 순 과세가액 (사전증여 제외, H-1)", () => {
  it("[C9-fix] 사전증여 동반 시: 분자·분모는 currentNet(100M), gross(300M)는 캡에만", () => {
    // 금번 순 과세가액 100M + 동일인 사전증여 200M → gross 300M. 동시(타 동일인) 100M, 한도 50M.
    const input = makeInput({
      donorRelation: "lineal_ascendant_adult",
      simultaneousGifts: [{ donorRelation: "lineal_ascendant_adult", taxableValue: 100_000_000 }],
    });
    // calcGiftDeductions(input, grossGiftValue=300M, currentNetGiftValue=100M)
    const result = calcGiftDeductions(input, 300_000_000, 100_000_000);
    // 분모 = 100M(현재) + 100M(동시) = 200M, 안분 = 50M × 100M ÷ 200M = 25M
    expect(result.apportionment?.denominator).toBe(200_000_000);
    expect(result.relationDeduction).toBe(25_000_000);
    expect(result.apportionment?.currentTaxableValue).toBe(100_000_000);
  });
});
