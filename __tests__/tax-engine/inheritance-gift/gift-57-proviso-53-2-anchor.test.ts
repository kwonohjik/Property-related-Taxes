/**
 * Anchor — §57① 단서 + §53의2 기공제 누적 차감 구현 검증
 *
 * Pre-Do anchor 파일(pre-do-anchor-gift-57-53-2.test.ts)을 기대값으로 승격한 정식 anchor.
 *
 * 갭 A: §57① 단서 — 최근친 직계비속 사망 시 할증 배제
 *   - isSubstituteGift=true → additionalGenerationSkipSurcharge=0, detail=null
 *   - isSubstituteGift=false/undefined → 기존 30%/40% 할증 동작 보존
 *
 * 갭 B: §53의2③ 기공제 누적 차감
 *   - priorUsedMarriageBirthDeduction 입력 시 잔여 공제만 적용
 *   - 미입력(undefined) 시 기존 동작 100% 보존
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import {
  calcMarriageBirthDeduction,
  calcGiftDeductions,
} from "@/lib/tax-engine/deductions/gift-deductions";
import type {
  GiftTaxInput,
  EstateItem,
  GiftDeductionInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function cashItem(id: string, amount: number): EstateItem {
  return { id, category: "cash", name: `현금-${id}`, marketValue: amount };
}

/** 기본 증여세 입력 팩토리 (donorGroup=B, 조부→손자) */
function makeGrandparentGiftInput(overrides: Partial<GiftTaxInput> = {}): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation: "lineal_descendant",
    donor: "grandparent",
    giftItems: [cashItem("g1", 300_000_000)],
    priorGiftsWithin10Years: [],
    isGenerationSkip: true,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: true },
    ...overrides,
  };
}

// ============================================================
// 앵커 A — §57① 단서: 최근친 직계비속 사망 시 할증 배제
// ============================================================

describe("[ANCHOR A] §57① 단서 — 할증 배제 구현 검증", () => {
  /**
   * A-M2 케이스 (단서 미적용 기준값):
   *   조부→손자(성년), 300M 증여, 공제 5천만 후 과세표준 250M
   *   산출세액 = 250M × 20% - 10M = 40,000,000
   *   단서 없음 → 할증 = 40M × 30% = 12,000,000
   */
  it("[A-M2] isSubstituteGift=false → 30% 할증 정상 적용 (기존 동작 보존)", () => {
    const input = makeGrandparentGiftInput({ isSubstituteGift: false });
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("B");
    expect(result.computedTax).toBe(40_000_000);
    expect(result.additionalGenerationSkipSurcharge).toBe(12_000_000);
    expect(result.generationSkipSurchargeDetail).not.toBeNull();
    expect(result.generationSkipProvisoApplied).toBeUndefined(); // 단서 미적용 시 undefined
  });

  it("[A-M2b] isSubstituteGift=undefined → 30% 할증 정상 적용 (기존 동작 보존)", () => {
    const input = makeGrandparentGiftInput(); // isSubstituteGift 미입력
    const result = calcGiftTax(input);

    expect(result.additionalGenerationSkipSurcharge).toBe(12_000_000);
    expect(result.generationSkipProvisoApplied).toBeUndefined();
  });

  /**
   * A-M5 케이스 (단서 적용 — 핵심):
   *   조부→손자, 부(父) 사망으로 §57① 단서 적용
   *   isSubstituteGift=true → 할증 = 0
   */
  it("[A-M5] isSubstituteGift=true → §57① 단서 적용, 할증 0 (구현 핵심)", () => {
    const input = makeGrandparentGiftInput({ isSubstituteGift: true });
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("B");
    expect(result.computedTax).toBe(40_000_000);
    // 단서 적용 → 할증 0
    expect(result.additionalGenerationSkipSurcharge).toBe(0);
    expect(result.generationSkipSurchargeDetail).toBeNull();
    // echo 필드 — 단서 적용 시 true
    expect(result.generationSkipProvisoApplied).toBe(true);
    // 산출세액과 동일한 최종세액 (할증 없음)
    // 신고공제 3% 차감 후: floor(40M × 0.97) = 38,800,000
    expect(result.finalTax).toBe(38_800_000);
  });

  /**
   * A-M6 케이스:
   *   isSubstituteGift=true + 미성년 수증자 + 20억 초과
   *   단서가 미성년·금액 조건보다 우선 → 여전히 할증 0
   */
  it("[A-M6] isSubstituteGift=true + 미성년 + 20억 초과 → 단서 우선, 할증 0", () => {
    const input = makeGrandparentGiftInput({
      giftItems: [cashItem("g1", 2_100_000_000)], // 21억
      isMinorDonee: true,
      isSubstituteGift: true,
    });
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("B");
    expect(result.additionalGenerationSkipSurcharge).toBe(0);
    expect(result.generationSkipSurchargeDetail).toBeNull();
    expect(result.generationSkipProvisoApplied).toBe(true);
  });

  /**
   * A-M3 케이스 (단서 없음 + 미성년 + 20억 초과 → 40% 할증):
   *   증여가액 21억, 공제 5천만 → 과세표준 2,050M
   *   산출세액 = 2,050M × 50% - 4.6억 = 2,050M × 0.5 - 460M = 565,000,000
   *   할증 = 565M × 40% = 226,000,000
   */
  it("[A-M3] isSubstituteGift=false + 미성년 + 20억 초과 → 40% 할증 정상 (기존 동작)", () => {
    const input = makeGrandparentGiftInput({
      giftItems: [cashItem("g1", 2_100_000_000)],
      isMinorDonee: true,
      isSubstituteGift: false,
    });
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("B");
    expect(result.generationSkipSurchargeDetail).not.toBeNull();
    expect(result.generationSkipSurchargeDetail?.surchargeRate).toBe(0.4);
    expect(result.additionalGenerationSkipSurcharge).toBeGreaterThan(0);
  });

  /**
   * A-M1 케이스: donorGroup=A (부모→자녀) → §57 비대상 → 할증 0
   */
  it("[A-M1] donorGroup=A → §57 비대상, 단서 관계없이 할증 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      donor: "father",   // 그룹 A
      giftItems: [cashItem("g1", 300_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      isSubstituteGift: true, // 단서 플래그가 있어도 그룹A는 §57 비대상
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("A");
    expect(result.additionalGenerationSkipSurcharge).toBe(0);
    expect(result.generationSkipSurchargeDetail).toBeNull();
  });
});

// ============================================================
// 앵커 B — §53의2③ 기공제 누적 차감
// ============================================================

describe("[ANCHOR B] §53의2③ 기공제 누적 차감 구현 검증", () => {

  // ── calcMarriageBirthDeduction 직접 단위 테스트 ──

  it("[B-M2] priorUsedMB=0, 혼인 5천만 → 공제 5천만 (기존 동작)", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      50_000_000,
      undefined,
      0,
    );
    expect(deduction).toBe(50_000_000);
  });

  it("[B-M3] priorUsedMB=0, 혼인 1억 → 공제 1억 (기존 동작)", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      0,
    );
    expect(deduction).toBe(100_000_000);
  });

  it("[B-M4] priorUsedMB=0, 혼인 6천만 + 출산 6천만 → 합산 캡 1억", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      60_000_000,
      60_000_000,
      0,
    );
    expect(deduction).toBe(100_000_000); // 합산 캡 1억
  });

  /**
   * B-M5 — 핵심: 기공제 6천만 후 혼인 1억 신청 → 잔여 4천만만 공제
   * 잔여 = max(0, 1억 − 6천만) = 4천만
   * 신청 = 1억 → min(1억, 4천만) = 4천만
   */
  it("[B-M5] priorUsedMB=6천만, 혼인 1억 신청 → 잔여 4천만만 공제 (구현 핵심)", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      60_000_000,
    );
    expect(deduction).toBe(40_000_000);
  });

  /**
   * B-M6: 기공제 1억 (소진) → 공제 0
   */
  it("[B-M6] priorUsedMB=1억 (소진) → 공제 0", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      100_000_000,
    );
    expect(deduction).toBe(0);
  });

  /**
   * B-M7: 기공제 6천만, 혼인 5천만 + 출산 5천만
   * 잔여 = 4천만
   * 신청 = min(5천만 + 5천만, 1억) = 1억
   * 실공제 = min(1억, 4천만) = 4천만
   */
  it("[B-M7] priorUsedMB=6천만, 혼인5천만+출산5천만 신청 → 잔여 4천만 공제", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      50_000_000,
      50_000_000,
      60_000_000,
    );
    expect(deduction).toBe(40_000_000);
  });

  it("[B-M9] donorRelation=spouse → §53의2 비적격, 공제 0", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "spouse",
      200_000_000,
      100_000_000,
      undefined,
      0,
    );
    expect(deduction).toBe(0);
  });

  it("[B-M10] donorRelation=lineal_descendant → §53의2 비적격, 공제 0", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_descendant",
      200_000_000,
      100_000_000,
      undefined,
      0,
    );
    expect(deduction).toBe(0);
  });

  // ── priorUsedMarriageBirthDeduction undefined → 기존값 완전 동일 ──

  it("[B-compat] priorUsedMarriageBirthDeduction 미입력(undefined) → 기존 동작 100% 보존", () => {
    // 4번째 파라미터 미입력 버전과 0 입력 버전이 동일해야 함
    const { deduction: withUndefined } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      undefined, // 미입력
    );
    const { deduction: withZero } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      0,
    );
    expect(withUndefined).toBe(100_000_000);
    expect(withZero).toBe(100_000_000);
    expect(withUndefined).toBe(withZero);
  });

  // ── calcGiftDeductions 통합 경로 ──

  /**
   * B-M5 통합 경로:
   * 직계존속→성년자녀, grossGiftValue=150M
   * §53 관계공제: 5천만 (기사용 0)
   * §53의2 혼인공제: 기공제 6천만 → 잔여 4천만 → 공제 4천만
   * 합계 = 5천만 + 4천만 = 9천만
   */
  it("[B-M5-통합] calcGiftDeductions — 기공제 6천만, 혼인 1억 신청 → 공제 9천만", () => {
    const deductionInput: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
      priorUsedMarriageBirthDeduction: 60_000_000,
    };

    const result = calcGiftDeductions(deductionInput, 150_000_000);

    expect(result.relationDeduction).toBe(50_000_000);
    expect(result.marriageBirthDeduction).toBe(40_000_000); // 기공제 차감 후 잔여
    expect(result.totalDeduction).toBe(90_000_000);
  });

  it("[B-M6-통합] calcGiftDeductions — 기공제 1억 (소진) → 혼인공제 0, 합계 5천만", () => {
    const deductionInput: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
      priorUsedMarriageBirthDeduction: 100_000_000,
    };

    const result = calcGiftDeductions(deductionInput, 150_000_000);

    expect(result.relationDeduction).toBe(50_000_000);
    expect(result.marriageBirthDeduction).toBe(0);
    expect(result.totalDeduction).toBe(50_000_000);
  });

  it("[B-compat-통합] priorUsedMarriageBirthDeduction 미입력 → 기존 동작 (1억 전액)", () => {
    const deductionInput: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
      // priorUsedMarriageBirthDeduction 미입력
    };

    const result = calcGiftDeductions(deductionInput, 150_000_000);

    expect(result.relationDeduction).toBe(50_000_000);
    expect(result.marriageBirthDeduction).toBe(100_000_000); // 미입력 → 기존과 동일
    expect(result.totalDeduction).toBe(150_000_000); // grossGiftValue 캡
  });
});

// ============================================================
// Pre-Do anchor 5건 — 기대값으로 변경된 검증
// ============================================================

describe("[ANCHOR PRE-DO → 정식 변환] 5건 기대값 검증", () => {
  it("[A-1] donorGroup=B + 단서 플래그 없음 → 30% 할증 적용됨 (기존 동작 확인)", () => {
    const input = makeGrandparentGiftInput(); // isSubstituteGift 미입력
    const result = calcGiftTax(input);

    expect(result.donorGroup).toBe("B");
    expect(result.computedTax).toBe(40_000_000);
    expect(result.additionalGenerationSkipSurcharge).toBe(12_000_000);
  });

  it("[A-2] isSubstituteGift=true 입력 → 할증 0 (단서 구현 확인)", () => {
    const input = makeGrandparentGiftInput({ isSubstituteGift: true });
    const result = calcGiftTax(input);

    // 기대값: 0 (단서 구현 완료)
    expect(result.additionalGenerationSkipSurcharge).toBe(0);
    expect(result.generationSkipSurchargeDetail).toBeNull();
  });

  it("[B-1] 기공제 없음 → 1억 전액 공제 (기존 동작)", () => {
    const { deduction } = calcMarriageBirthDeduction(
      "lineal_ascendant_adult",
      200_000_000,
      100_000_000,
      undefined,
      // priorUsedMarriageBirthDeduction 미입력
    );
    expect(deduction).toBe(100_000_000);
  });

  it("[B-2] priorUsedMarriageBirthDeduction 필드 존재 + 기공제 6천만 → 4천만 공제", () => {
    // 타입에 필드가 추가됨 — @ts-expect-error 불필요
    const input: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
      priorUsedMarriageBirthDeduction: 60_000_000,
    };

    const { deduction } = calcMarriageBirthDeduction(
      input.donorRelation,
      200_000_000,
      input.marriageExemption,
      input.birthExemption,
      input.priorUsedMarriageBirthDeduction,
    );

    // 기대값: 4천만 (잔여 공제)
    expect(deduction).toBe(40_000_000);
  });

  it("[B-3] calcGiftDeductions 통합 — 기공제 6천만, 혼인 1억 → 공제 4천만", () => {
    const deductionInput: GiftDeductionInput = {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 0,
      marriageExemption: 100_000_000,
      priorUsedMarriageBirthDeduction: 60_000_000,
    };

    const result = calcGiftDeductions(deductionInput, 150_000_000);

    expect(result.relationDeduction).toBe(50_000_000);
    // 기대값: 4천만 (기공제 6천만 차감)
    expect(result.marriageBirthDeduction).toBe(40_000_000);
    expect(result.totalDeduction).toBe(90_000_000);
  });
});
