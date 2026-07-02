/**
 * 증여세 대납(代納) Gross-up 순환계산 anchor 테스트 (C-1~C-12)
 *
 * 법령 근거: 상증법 §36(채무면제 증여)·§47②(10년 합산)·§4의2⑥(연대납세의무)·§57(할증)·§69②(신고세액공제)
 *
 * Pre-Do anchor:
 *   C-1: calcGiftTax baseline finalTax=77,600,000 (기존 함수로 실패 없이 통과 — 회귀 방어)
 *   C-2: calcGiftTaxWithDonorPaidTax 대납 ON → donorPaidTax≈102,609,309 (신규 함수 없으면 실패)
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax, calcGiftTaxWithDonorPaidTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";

// ──────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────

function financialItem(id: string, amount: number): EstateItem {
  return { id, category: "financial", name: `예금${id}`, marketValue: amount };
}

/**
 * C-1·C-2·C-3·C-9·C-10 기반 공통 입력: 부모→성년자녀 현금 5억
 * 비과세 없음 / 채무 없음 / 사전증여 없음 / 세대생략 없음 / 신고기한 내
 */
const baseParentChildInput: GiftTaxInput = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [financialItem("1", 500_000_000)],
  exemptions: [],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
};

// ──────────────────────────────────────────────────────────────
// C-1: 비대납 baseline (기존 calcGiftTax 회귀 — Pre-Do anchor)
// ──────────────────────────────────────────────────────────────

describe("C-1: 비대납 baseline — calcGiftTax()", () => {
  it("[C-1] 부모→성년자녀 현금 5억, 대납 없음 → finalTax=77,600,000", () => {
    /**
     * 과세표준 = 500,000,000 - 50,000,000(§53 성년 공제) = 450,000,000
     * §26 세율 "1억 초과~5억 이하": 20% × 450,000,000 - 1,000만 = 80,000,000
     * §69② 신고공제 = floor(80,000,000 × 0.03) = 2,400,000
     * finalTax = 80,000,000 - 2,400,000 = 77,600,000
     */
    const result = calcGiftTax(baseParentChildInput);
    expect(result.taxBase).toBe(450_000_000);
    expect(result.computedTax).toBe(80_000_000);
    expect(result.creditDetail.filingCredit).toBe(2_400_000);
    expect(result.finalTax).toBe(77_600_000);
    // donorPaidTaxGrossUp은 undefined (기존 함수 변경 없음)
    expect(result.donorPaidTaxGrossUp).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────
// C-2: 전형 대납 케이스 — calcGiftTaxWithDonorPaidTax() (Pre-Do anchor — 신규 함수 없으면 실패)
// ──────────────────────────────────────────────────────────────

describe("C-2: 전형 대납 gross-up 수렴", () => {
  it("[C-2] 부모→성년자녀 현금 5억, 비연대 대납 ON → donorPaidTax≈102,609,309 ±1", () => {
    /**
     * 수렴 고정점 검산 (설계서 A-2):
     *   A = netCurrentGiftValue = 500,000,000 (비과세/채무 없음)
     *   수렴 후 aggregatedGiftValue V* = A + donorPaidTax
     *   수렴 과세표준 = V* - 50,000,000(공제) = V* - 50,000,000
     *
     *   구간 교차: baseline 450,000,000 (20% 구간) → 수렴 후 30% 구간 돌입
     *   고정점 (30% 구간 가정):
     *     T(V*) = floor((V* - 50M) × 0.3 - 60M) × 0.97
     *   자기일관: T* ≈ 102,609,309, V* ≈ 602,609,309
     *   확인: floor((602,609,309 - 50,000,000) × 0.3 - 60,000,000) × 0.97
     *         = floor(552,609,309 × 0.3 - 60,000,000) × 0.97
     *         = floor(165,782,792 - 60,000,000) × 0.97
     *         = 105,782,792 × 0.97 = 102,609,508.44 → floor = 102,609,508
     *   ※ 정수 연산(floor 중간 절사) 때문에 반복식 실제값과 ±수 차이 가능 → 실측 기준
     */
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(true);
    expect(result.donorPaidTaxGrossUp!.originalNetGift).toBe(500_000_000);
    expect(result.donorPaidTaxGrossUp!.baselineTax).toBe(77_600_000);
    expect(result.donorPaidTaxGrossUp!.iterations).toBeLessThanOrEqual(20);

    // 수렴값 ±1 원 허용 (floor 누적)
    const donorPaidTax = result.donorPaidTaxGrossUp!.donorPaidTax;
    expect(donorPaidTax).toBeGreaterThanOrEqual(102_609_300);
    expect(donorPaidTax).toBeLessThanOrEqual(102_609_320);

    // grossedUpNetGift = A + donorPaidTax 자기일관성
    expect(result.donorPaidTaxGrossUp!.grossedUpNetGift).toBe(500_000_000 + donorPaidTax);

    // finalTax = donorPaidTax (수렴 고정점: 수증자 납부액 = 대납액)
    expect(result.finalTax).toBe(donorPaidTax);
  });
});

// ──────────────────────────────────────────────────────────────
// C-3: 연대납세의무 ON → gross-up 미적용
// ──────────────────────────────────────────────────────────────

describe("C-3: 연대납세의무(§4의2⑥) ON → gross-up 미적용", () => {
  it("[C-3] donorHasJointLiability=true → applied=false, finalTax=77,600,000", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: true,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(false);
    expect(result.donorPaidTaxGrossUp!.reasonNotApplied).toBe("joint_liability");
    expect(result.finalTax).toBe(77_600_000);
  });
});

// ──────────────────────────────────────────────────────────────
// C-4: 대납 토글 OFF → calcGiftTax 동일 결과 (회귀 확인)
// ──────────────────────────────────────────────────────────────

describe("C-4: 대납 토글 OFF → 기존 calcGiftTax 결과 동일", () => {
  it("[C-4] donorPaysGiftTax=false → applied=false, finalTax=77,600,000", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(false);
    expect(result.donorPaidTaxGrossUp!.reasonNotApplied).toBe("toggle_off");
    expect(result.finalTax).toBe(77_600_000);
  });

  it("[C-4b] donorPaysGiftTax undefined → applied=false, finalTax=77,600,000", () => {
    const result = calcGiftTaxWithDonorPaidTax(baseParentChildInput);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(false);
    expect(result.finalTax).toBe(77_600_000);
  });
});

// ──────────────────────────────────────────────────────────────
// C-5: 50% 최고구간 수렴 — MAX_ITER 내 수렴 확인
// ──────────────────────────────────────────────────────────────

describe("C-5: 최고구간(50%) 현금 30억, 대납 ON — MAX_ITER 내 수렴", () => {
  it("[C-5] 현금 30억, 배우자(6억 공제), 비연대, 신고기한 내 → iterations≤100, tolerance≤1", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "spouse",
      donor: "spouse",
      giftItems: [financialItem("1", 3_000_000_000)],
      exemptions: [],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "spouse" },
      creditInput: { isFiledOnTime: true },
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(true);
    expect(result.donorPaidTaxGrossUp!.iterations).toBeLessThanOrEqual(100);
    // 수렴 확인: finalTax == donorPaidTax
    expect(result.finalTax).toBe(result.donorPaidTaxGrossUp!.donorPaidTax);
  });
});

// ──────────────────────────────────────────────────────────────
// C-6: 사전증여 합산 동반 — §58 상호작용
// ──────────────────────────────────────────────────────────────

describe("C-6: 사전증여 합산 동반 — §58 한도 상호작용", () => {
  it("[C-6] 3년 전 2,000만 사전증여 + 현금 5억 대납 → 수렴 자기일관성", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",
          donor: "father",
          giftAmount: 20_000_000,
          giftTaxPaid: 0, // 공제 한도 내 세금 없음
          isHeir: false,
        },
      ],
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    expect(result.donorPaidTaxGrossUp).toBeDefined();
    expect(result.donorPaidTaxGrossUp!.applied).toBe(true);
    // 자기일관성: finalTax == donorPaidTax
    expect(result.finalTax).toBe(result.donorPaidTaxGrossUp!.donorPaidTax);
    // grossedUpNetGift = originalNetGift(A=500M) + donorPaidTax
    expect(result.donorPaidTaxGrossUp!.grossedUpNetGift).toBe(
      500_000_000 + result.donorPaidTaxGrossUp!.donorPaidTax,
    );
  });
});

// ──────────────────────────────────────────────────────────────
// C-7: 2-스트림(가업특례) + 대납 → 입력 검증 차단
// ──────────────────────────────────────────────────────────────

describe("C-7: 2-스트림 특례 + 대납 → Zod 차단", () => {
  it("[C-7] specialTreatment=family_business + donorPaysGiftTax=true → safeParse 실패", () => {
    const body = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      donor: "lineal_descendant",  // "son"→"lineal_descendant" (giftDonorRelationSchema enum)
      giftItems: [{ id: "s1", category: "financial", name: "주식", marketValue: 500_000_000 }],
      exemptions: [],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: {
        isFiledOnTime: true,
        specialTreatment: "family_business",
      },
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("가업·창업 특례"))).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// C-8: 세대생략(donorGroup=B) + 대납 → 입력 검증 차단
// ──────────────────────────────────────────────────────────────

describe("C-8: 세대생략(donorGroup=B) + 대납 → Zod 차단", () => {
  it("[C-8] donor=grandparent + donorPaysGiftTax=true → safeParse 실패", () => {
    const body = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_ascendant_adult",
      donor: "grandparent",  // "grandfather"→"grandparent" (giftDonorRelationSchema enum)
      giftItems: [{ id: "g1", category: "financial", name: "예금", marketValue: 500_000_000 }],
      exemptions: [],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_ascendant_adult" },
      creditInput: { isFiledOnTime: true },
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("세대생략"))).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// C-9: 공제 동결 확인 — 각 회차 deduction 불변
// ──────────────────────────────────────────────────────────────

describe("C-9: 공제 동결 — netCurrentGiftValue(A) 기준 1회 동결", () => {
  it("[C-9] 대납 ON 시 totalDeduction이 비대납과 동일(aggregatedGiftValue 주입으로 공제 미변경)", () => {
    const baselineResult = calcGiftTax(baseParentChildInput);

    const inputWithDonorPay: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const grossUpResult = calcGiftTaxWithDonorPaidTax(inputWithDonorPay);

    // 공제액은 netCurrentGiftValue(A) 기준으로 고정 — 대납 전·후 동일
    expect(grossUpResult.totalDeduction).toBe(baselineResult.totalDeduction);
  });
});

// ──────────────────────────────────────────────────────────────
// C-10: besshi10 ㉓ 오귀속 방지
// ──────────────────────────────────────────────────────────────

describe("C-10: besshi10 ㉓ 증여재산가산액 오귀속 방지", () => {
  it("[C-10] 사전증여 없는 C-2 케이스에서 ㉓ 증여재산가산액(priorGiftAddition row) = 0", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);

    // besshi10Rows에서 ㉓ 증여재산가산액 행 찾기
    const row23 = result.besshi10Rows.find(
      (r) => r.label?.includes("증여재산가산액") || r.label?.includes("㉓"),
    );

    // 사전증여 없으므로 ㉓ = 0 (대납 gross-up분은 미포함)
    if (row23) {
      expect(row23.amount).toBe(0);
    }

    // ㉔ 증여세과세가액 = gross-up 후 aggregatedGiftValue (500M + donorPaidTax)
    const donorPaidTax = result.donorPaidTaxGrossUp!.donorPaidTax;
    expect(result.aggregatedGiftValue).toBe(500_000_000 + donorPaidTax);
  });

  it("[C-10b] 대납(D>0) 시 ㉔ 산식 라벨에 대납 재차증여(§36) 명시 — 자기정합 (리뷰 #15)", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const result = calcGiftTaxWithDonorPaidTax(input);
    const row24 = result.besshi10Rows.find((r) => r.number === "㉔");
    expect(row24).toBeDefined();
    // ㉓는 순수 §47②(대납 미포함)이므로 ㉔ formula가 대납분 D를 명시해야 표시값 ↔ 산식 자기정합.
    expect(row24!.formula).toContain("대납");
    expect(row24!.amount).toBe(result.aggregatedGiftValue);
  });
});

// ──────────────────────────────────────────────────────────────
// C-11: 동시증여(simultaneousGifts) + 대납 → 입력 검증 차단
// ──────────────────────────────────────────────────────────────

describe("C-11: 동시증여 + 대납 → Zod 차단", () => {
  it("[C-11] simultaneousGifts 있음 + donorPaysGiftTax=true → safeParse 실패", () => {
    const body = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_ascendant_adult",
      donor: "father",
      giftItems: [{ id: "f1", category: "financial", name: "예금", marketValue: 500_000_000 }],
      exemptions: [],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_ascendant_adult",
        simultaneousGifts: [
          { donorRelation: "lineal_ascendant_adult", taxableValue: 100_000_000 },
        ],
      },
      creditInput: { isFiledOnTime: true },
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
    };
    const parsed = giftTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("동시증여"))).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────
// C-12: 의제증여 유형 수증 후 대납 → 항상 재차증여 (연대의무 성립 불가)
// ──────────────────────────────────────────────────────────────

describe("C-12: 의제증여 유형 수증 후 대납 → 연대의무 불가 → gross-up 적용", () => {
  it("[C-12] §4의2⑥ 단서 열거 조문 해당 유형 — donorHasJointLiability 입력 불문 gross-up 적용은 MVP 제외(C-12는 UI 쪽 처리), Zod 통과 확인", () => {
    // MVP에서 C-12 구분은 UI 레이어 처리(의제증여 유형 시 연대의무 토글 잠금).
    // 엔진 측에서는 donorHasJointLiability=false일 때 gross-up이 적용됨을 확인.
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false, // 의제증여 유형: 연대의무 성립 불가 → false 고정
    };
    const result = calcGiftTaxWithDonorPaidTax(input);
    expect(result.donorPaidTaxGrossUp!.applied).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// 부분 대납 (수증자 일부 납부 + 증여자 부족분 대납) — doneePaidGiftTax
// 모델: addition = max(0, finalTax − P). P=0 → 전액 대납(회귀).
// ──────────────────────────────────────────────────────────────

describe("부분 대납 (doneePaidGiftTax)", () => {
  it("[A-1 회귀] P=0(미입력) → 전액 대납과 동일 (donorPaidTax=102,609,309)", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
      // doneePaidGiftTax 미입력 → 전액 대납
    };
    const g = calcGiftTaxWithDonorPaidTax(input).donorPaidTaxGrossUp!;
    expect(g.applied).toBe(true);
    expect(g.donorPaidTax).toBe(102_609_309);
    expect(g.totalGiftTax).toBe(102_609_309); // P=0 → D == T*
    expect(g.doneePaidTax).toBe(0);
    expect(g.grossedUpNetGift).toBe(602_609_309);
  });

  it("[A-2] 수증자 5천만 납부 → 증여자 부족분만 대납 (자기일관·캡)", () => {
    /**
     * 닫힌형(20% 구간): finalTax=(0.2(V−50M)−10M)·0.97=0.194V−19,400,000
     * addition=finalTax−50M, 0.806V=430,600,000 → V*≈534,243,176
     * 총세액 T*≈84,243,176, 증여자 대납 D≈34,243,176
     */
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
      doneePaidGiftTax: 50_000_000,
    };
    const g = calcGiftTaxWithDonorPaidTax(input).donorPaidTaxGrossUp!;
    expect(g.applied).toBe(true);
    expect(g.doneePaidTax).toBe(50_000_000); // P < T* → 캡 안 됨
    // 자기일관: D + P == T*, V* == A + D
    expect(g.donorPaidTax + g.doneePaidTax!).toBe(g.totalGiftTax);
    expect(g.grossedUpNetGift).toBe(g.originalNetGift + g.donorPaidTax);
    // 닫힌형 검산값 (Pre-Do 실측 고정)
    expect(g.donorPaidTax).toBe(34_243_176);
    expect(g.totalGiftTax).toBe(84_243_176);
    expect(g.grossedUpNetGift).toBe(534_243_176);
    // 전액 대납(102,609,309)보다 증여자 부담 감소
    expect(g.donorPaidTax).toBeLessThan(102_609_309);
  });

  it("[A-3] P ≥ 총세액(2억) → 증여자 대납 0, doneePaidTax 세액 캡, V*=A", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: true,
      donorHasJointLiability: false,
      doneePaidGiftTax: 200_000_000, // baseline 77,600,000 초과
    };
    const g = calcGiftTaxWithDonorPaidTax(input).donorPaidTaxGrossUp!;
    expect(g.applied).toBe(true);
    expect(g.donorPaidTax).toBe(0); // 대납 없음
    expect(g.totalGiftTax).toBe(77_600_000); // baseline 유지(가산 없음)
    expect(g.doneePaidTax).toBe(77_600_000); // min(2억, 7,760만) 캡 → 자기일관
    expect(g.donorPaidTax + g.doneePaidTax!).toBe(g.totalGiftTax);
    expect(g.grossedUpNetGift).toBe(500_000_000); // V* = A
  });

  it("[A-4 회귀] 대납 OFF → doneePaidGiftTax 무시, gross-up 미적용", () => {
    const input: GiftTaxInput = {
      ...baseParentChildInput,
      donorPaysGiftTax: false,
      doneePaidGiftTax: 50_000_000, // 무시되어야 함
    };
    const r = calcGiftTaxWithDonorPaidTax(input);
    expect(r.donorPaidTaxGrossUp!.applied).toBe(false);
    expect(r.finalTax).toBe(77_600_000);
  });

  it("[Zod] doneePaidGiftTax 음수 → 검증 오류", () => {
    const parsed = giftTaxInputSchema.safeParse({
      ...baseParentChildInput,
      giftItems: [{ id: "1", category: "financial", name: "예금", marketValue: 500_000_000 }],
      donorPaysGiftTax: true,
      doneePaidGiftTax: -1,
    });
    expect(parsed.success).toBe(false);
  });
});
