/**
 * 상속인별 배부(STEP 13) 직접배부 §53 증여재산공제 자동 도출 anchor
 *
 * 배경:
 *   상속세 모드 UI(GiftRowEditor)는 giftTaxBase 입력란이 없어 항상 undefined.
 *   그 결과 `sumPriorGiftsByDonee`의 `giftTaxBase ?? giftAmount` fallback이
 *   항상 작동해 직접배부에 §53 공제 미반영(이미지 53: 배우자 760M → 정답 160M).
 *
 *   `derivePriorGiftTaxBase`(inheritance-prior-gift-taxbase.ts)가 doneeId 단위로
 *   §53 관계공제를 자동 도출하여 이를 정정.
 *
 * 검증 핵심:
 *   fixture에서 priorGift의 giftTaxBase만 제거(doneeId 유지)한 입력 —
 *   실제 상속세 UI 상태를 모사 — 으로 calcInheritanceTax를 호출해도
 *   derive가 §53 공제를 자동 도출하여 기존 comprehensive-case-pdf.test.ts의
 *   정답 배부값과 동일하게 나와야 한다.
 *
 * 법령: 상증법 §53 (10년 통산 관계별 공제)
 *       상증법 §3·§28 (상속인별 산출세액 배부)
 */

import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { derivePriorGiftTaxBase } from "@/lib/tax-engine/inheritance-prior-gift-taxbase";
import {
  EXAMPLE_INPUT,
  HEIR_ID,
} from "./fixtures/comprehensive-case-pdf.fixture";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

// ────────────────────────────────────────────────────
// 공통 헬퍼 — giftTaxBase 제거 (상속세 UI 상태 모사)
// ────────────────────────────────────────────────────

/** 상속세 모드 UI 상태 모사: giftTaxBase를 모두 제거하여 undefined로 만든다 */
const stripGiftTaxBase = (
  gifts: PriorGift[],
): PriorGift[] =>
  gifts.map((g) => {
    const { giftTaxBase: _omit, ...rest } = g;
    return rest;
  });

const STRIPPED_INPUT = {
  ...EXAMPLE_INPUT,
  preGiftsWithin10Years: stripGiftTaxBase(
    EXAMPLE_INPUT.preGiftsWithin10Years,
  ),
};

// ────────────────────────────────────────────────────
// AL-1 (메인): giftTaxBase 미입력 시 derive가 §53 공제 자동 반영
// ────────────────────────────────────────────────────

describe("AL-1 giftTaxBase 미입력 → §53 자동 도출 후 배부값 동일", () => {
  const result = calcInheritanceTax(STRIPPED_INPUT);
  const perHeir = result.heirAllocationResult!.perHeir;

  it("엔진 결정세액(result.finalTax) = 1,033,760,232 (배부표 ⑮ 합 = 영리법인 면제·§69 정합)", () => {
    // 결정세액 = 산출 + 할증 − 영리법인 면제(§3의2② 150M) − 세액공제(§28 442M + §69 31,971,966).
    // (구 anchor 1,179,260,233은 영리법인 면제 미차감 버그값 — 동일 테스트 line 64 per-heir 합과
    //  자기모순이었음. inheritance-filing-credit-corporate-exemption.plan.md 정정.)
    expect(result.finalTax).toBe(1_033_760_232);
  });

  it("상속인별 자진납부세액 합 = BASE(giftTaxBase 명시)와 완전 동일 (도출=명시 정합)", () => {
    // 핵심 불변식: giftTaxBase를 명시하든 derive로 도출하든 경제실질 동일 → 배부값 전부 일치.
    const base = calcInheritanceTax(EXAMPLE_INPUT).heirAllocationResult!.perHeir;
    const sum = (
      p: typeof perHeir,
    ): number =>
      p[HEIR_ID.spouse]!.finalTax +
      p[HEIR_ID.son]!.finalTax +
      p[HEIR_ID.son2]!.finalTax +
      p[HEIR_ID.granddaughter]!.finalTax;
    expect(sum(perHeir)).toBe(sum(base));
    expect(sum(perHeir)).toBe(1_033_760_232); // 실측 anchor (BASE perHeir 자진납부 합)
  });

  it("간접배부 분자 = 1,865,000,000 (무변경)", () => {
    // §53 공제 도출 후 직접배부 합계가 동일해야 분자도 동일
    expect(result.heirAllocationResult!.indirectNumerator).toBe(
      1_865_000_000,
    );
  });

  describe("배우자 (갑)", () => {
    it("배우자 직접배부 = 160,000,000 (760M − §53 배우자공제 600M)", () => {
      expect(perHeir[HEIR_ID.spouse]!.directTaxBaseShare).toBe(160_000_000);
    });

    it("배우자 간접배부 = 941,319,862", () => {
      expect(perHeir[HEIR_ID.spouse]!.indirectTaxBaseShare).toBe(
        941_319_862,
      );
    });

    it("배우자 과세표준상당액 = 1,101,319,862", () => {
      expect(perHeir[HEIR_ID.spouse]!.taxBaseShare).toBe(1_101_319_862);
    });
  });

  describe("장남 (을)", () => {
    it("장남 직접배부 = 1,450,000,000 (1,500M − §53 직계비속 50M)", () => {
      expect(perHeir[HEIR_ID.son]!.directTaxBaseShare).toBe(1_450_000_000);
    });

    it("장남 간접배부 ≈ 208,469,476 (PDF ±1원 tolerance)", () => {
      expect(
        Math.abs(perHeir[HEIR_ID.son]!.indirectTaxBaseShare - 208_469_476),
      ).toBeLessThanOrEqual(1);
    });
  });

  describe("차남 (병)", () => {
    it("차남 간접배부 = 554,849,527 (직접 0)", () => {
      expect(perHeir[HEIR_ID.son2]!.indirectTaxBaseShare).toBe(554_849_527);
    });
  });

  describe("손녀 (정) — 수유자", () => {
    it("손녀 간접배부 = 160,361,135 (직접 0)", () => {
      expect(perHeir[HEIR_ID.granddaughter]!.indirectTaxBaseShare).toBe(
        160_361_135,
      );
    });
  });

  describe("영리법인 (M사)", () => {
    it("영리법인 finalTax = 0 (§3의2② 면제)", () => {
      expect(perHeir[HEIR_ID.corporate]!.finalTax).toBe(0);
    });
  });
});

// ────────────────────────────────────────────────────
// AL-2 (회귀): 원본 giftTaxBase 명시 입력도 동일 결과 — 무변경 확인
// ────────────────────────────────────────────────────

describe("AL-2 회귀 — giftTaxBase 명시 원본(EXAMPLE_INPUT) 무변경", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);
  const perHeir = result.heirAllocationResult!.perHeir;

  it("배우자 직접배부 = 160,000,000 (giftTaxBase 명시 → 1순위 보존)", () => {
    expect(perHeir[HEIR_ID.spouse]!.directTaxBaseShare).toBe(160_000_000);
  });

  it("간접배부 분자 = 1,865,000,000 (무변경)", () => {
    expect(result.heirAllocationResult!.indirectNumerator).toBe(
      1_865_000_000,
    );
  });

  it("장남 직접배부 = 1,450,000,000", () => {
    expect(perHeir[HEIR_ID.son]!.directTaxBaseShare).toBe(1_450_000_000);
  });
});

// ────────────────────────────────────────────────────
// AL-3 (corporate): corporate 사전증여 derive 미개입 — giftAmount 유지
// ────────────────────────────────────────────────────

describe("AL-3 corporate — derive가 §53 미적용, giftAmount 700M 유지", () => {
  const result = calcInheritanceTax(STRIPPED_INPUT);

  it("영리법인 finalTax = 0 (§3의2② 면제 유지)", () => {
    expect(result.heirAllocationResult!.perHeir[HEIR_ID.corporate]!.finalTax).toBe(0);
  });

  it("영리법인 corporateExemption.amount = 150,000,000 (derive 간섭 없음)", () => {
    expect(result.corporateExemption?.amount).toBe(150_000_000);
  });

  it("영리법인 priorGiftAmount = 700,000,000 (gross 보존)", () => {
    expect(
      result.heirAllocationResult!.perHeir[HEIR_ID.corporate]!.priorGiftAmount,
    ).toBe(700_000_000);
  });
});

// ────────────────────────────────────────────────────
// AL-4 (다건): 동일 doneeId 2건 — §53 공제 1회만 차감 (건별 중복 아님)
// ────────────────────────────────────────────────────

describe("AL-4 동일 doneeId 다건 — §53 공제 doneeId 단위 1회", () => {
  // 장남에게 2건(각 750M, giftTaxBase 없음)으로 교체:
  //   합산 1,500M → §53 직계비속 50M 1회 차감 → directTaxBaseShare = 1,450M
  const input = {
    ...EXAMPLE_INPUT,
    preGiftsWithin10Years: [
      // corporate 건은 유지 (giftTaxBase 명시)
      EXAMPLE_INPUT.preGiftsWithin10Years[0],
      // spouse 건은 유지 (giftTaxBase 명시)
      EXAMPLE_INPUT.preGiftsWithin10Years[1],
      // 장남 건 → 2건 750M씩 분리, giftTaxBase 없음
      {
        giftDate: "2018-08-17",
        isHeir: true,
        giftAmount: 750_000_000,
        // giftTaxBase 없음 — derive 대상
        giftTaxPaid: 210_000_000,
        doneeId: HEIR_ID.son,
        beneficiaryType: "heir" as const,
      },
      {
        giftDate: "2019-03-10",
        isHeir: true,
        giftAmount: 750_000_000,
        // giftTaxBase 없음 — derive 대상
        giftTaxPaid: 210_000_000,
        doneeId: HEIR_ID.son,
        beneficiaryType: "heir" as const,
      },
    ],
  };

  const result = calcInheritanceTax(input);
  const perHeir = result.heirAllocationResult!.perHeir;

  it("장남 2건 합산 gross = 1,500M → §53 50M 1회 차감 → directTaxBaseShare = 1,450,000,000", () => {
    // 건별 중복 차감이면 2건 × 50M = 100M → 1,400M (오류)
    // 정답: doneeId 단위 1회 → 50M → 1,450M
    expect(perHeir[HEIR_ID.son]!.directTaxBaseShare).toBe(1_450_000_000);
  });
});

// ────────────────────────────────────────────────────
// AL-5 (orphan): doneeId가 heirs에 없는 경우 — 크래시 없이 §53 미적용
// ────────────────────────────────────────────────────

describe("AL-5 orphan doneeId — 크래시 없음, §53 미적용(giftAmount 유지)", () => {
  // 장남 사전증여의 doneeId를 heirs에 없는 임의값으로 교체
  const orphanGift: PriorGift = {
    ...EXAMPLE_INPUT.preGiftsWithin10Years[2], // 장남 건
    doneeId: "nonexistent_heir_xyz",
    // giftTaxBase 없음 — orphan이므로 derive 불가
  };
  const { giftTaxBase: _omit, ...orphanGiftNoBase } = orphanGift;

  const input = {
    ...EXAMPLE_INPUT,
    preGiftsWithin10Years: [
      ...stripGiftTaxBase(
        EXAMPLE_INPUT.preGiftsWithin10Years.slice(0, 2),
      ),
      orphanGiftNoBase,
    ],
  };

  it("calcInheritanceTax 크래시 없이 완료", () => {
    expect(() => calcInheritanceTax(input)).not.toThrow();
  });

  it("orphan 건은 §53 미적용 — giftAmount(1,500M)가 직접 사용됨 (heirs 없음)", () => {
    // orphan doneeId는 heirs Map에 없음 → derive 불가 → giftAmount fallback
    // 결과적으로 해당 doneeId의 perHeir 항목 없음
    const result = calcInheritanceTax(input);
    const orphanPerHeir = result.heirAllocationResult?.perHeir["nonexistent_heir_xyz"];
    // orphan은 heirs 배열에 없으므로 perHeir 항목 생성 안 됨
    expect(orphanPerHeir).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────
// 단위 헬퍼 직접 테스트 — derivePriorGiftTaxBase
// ────────────────────────────────────────────────────

describe("derivePriorGiftTaxBase 단위 헬퍼", () => {
  const MOCK_HEIRS = [
    {
      id: "h_spouse",
      relation: "spouse" as const,
      name: "배우자",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    },
    {
      id: "h_child",
      relation: "child" as const,
      name: "자녀",
      isHeir: true,
      isGenerationSkipBeneficiary: false,
    },
    {
      id: "h_legatee",
      relation: "legatee" as const,
      name: "수유자",
      isHeir: false,
      isGenerationSkipBeneficiary: true,
    },
    {
      id: "h_corp",
      relation: "corporate" as const,
      name: "법인",
      isHeir: false,
    },
  ];

  it("giftTaxBase 명시 건 → 그대로 보존 (1순위)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2022-01-01",
        isHeir: true,
        giftAmount: 760_000_000,
        giftTaxBase: 160_000_000, // 명시
        giftTaxPaid: 22_000_000,
        doneeId: "h_spouse",
        beneficiaryType: "heir",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    // 명시 보존 → 160M 그대로
    expect(result[0].giftTaxBase).toBe(160_000_000);
  });

  it("doneeRelation='spouse' + giftTaxBase 없음 → giftTaxBase = max(0, 760M − 600M) = 160M", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2022-01-01",
        isHeir: true,
        giftAmount: 760_000_000,
        // giftTaxBase 없음
        giftTaxPaid: 22_000_000,
        doneeRelation: "spouse", // 명시 doneeRelation
        beneficiaryType: "heir",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    expect(result[0].giftTaxBase).toBe(160_000_000);
  });

  it("doneeId='h_spouse' (Heir relation=spouse) + giftTaxBase 없음 → 동일하게 160M 도출", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2022-01-01",
        isHeir: true,
        giftAmount: 760_000_000,
        // giftTaxBase 없음
        giftTaxPaid: 22_000_000,
        doneeId: "h_spouse",
        beneficiaryType: "heir",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    expect(result[0].giftTaxBase).toBe(160_000_000);
  });

  it("doneeId='h_child' + 1,500M → giftTaxBase = 1,500M − 50M = 1,450M", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2018-01-01",
        isHeir: true,
        giftAmount: 1_500_000_000,
        // giftTaxBase 없음
        giftTaxPaid: 420_000_000,
        doneeId: "h_child",
        beneficiaryType: "heir",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    expect(result[0].giftTaxBase).toBe(1_450_000_000);
  });

  it("legatee → §53 공제 대상 아님, giftTaxBase 미도출 (undefined 유지)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2022-01-01",
        isHeir: false,
        giftAmount: 500_000_000,
        // giftTaxBase 없음
        giftTaxPaid: 0,
        doneeId: "h_legatee",
        beneficiaryType: "legatee",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    // legatee → undefined 유지 (§53 공제 대상 아님)
    expect(result[0].giftTaxBase).toBeUndefined();
  });

  it("corporate → §53 공제 대상 아님, giftTaxBase 미도출 (undefined 유지)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2021-01-01",
        isHeir: false,
        giftAmount: 700_000_000,
        giftTaxBase: 700_000_000, // 명시 (법인은 공제 없음 — 명시 보존)
        giftTaxPaid: 0,
        doneeId: "h_corp",
        beneficiaryType: "corporate",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    // 명시 보존 → 700M 그대로
    expect(result[0].giftTaxBase).toBe(700_000_000);
  });

  it("corporate giftTaxBase 없음 → undefined 유지 (§53 공제 미적용)", () => {
    const gifts: PriorGift[] = [
      {
        giftDate: "2021-01-01",
        isHeir: false,
        giftAmount: 700_000_000,
        // giftTaxBase 없음
        giftTaxPaid: 0,
        doneeId: "h_corp",
        beneficiaryType: "corporate",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    // corporate는 §53 공제 대상 아님 → undefined (giftAmount fallback은 sumPriorGiftsByDonee에서)
    expect(result[0].giftTaxBase).toBeUndefined();
  });

  it("빈 배열 → 빈 배열 반환 (크래시 없음)", () => {
    const result = derivePriorGiftTaxBase([], MOCK_HEIRS);
    expect(result).toHaveLength(0);
  });

  it("공제 한도 초과 — giftAmount < 공제 한도 → giftTaxBase = 0 (max 0)", () => {
    // 배우자 공제 600M, 증여액 300M → max(0, 300M - 600M) = 0
    const gifts: PriorGift[] = [
      {
        giftDate: "2022-01-01",
        isHeir: true,
        giftAmount: 300_000_000, // 공제 한도 600M 이내
        // giftTaxBase 없음
        giftTaxPaid: 0,
        doneeId: "h_spouse",
        beneficiaryType: "heir",
      },
    ];
    const result = derivePriorGiftTaxBase(gifts, MOCK_HEIRS);
    expect(result[0].giftTaxBase).toBe(0);
  });
});
