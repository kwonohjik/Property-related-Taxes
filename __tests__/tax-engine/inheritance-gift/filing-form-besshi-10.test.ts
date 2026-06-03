/**
 * 별지 제10호서식 [2020.03.13. 개정] 행 빌더 anchor 테스트
 * "증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)"
 *
 * 입력: PDF 사례 1 C1-3 (3차 합산 — 모 → 장남 아파트 510M, 1차/2차 합산)
 *   ⑰ 510M / ㉓ 1,010M / ㉔ 1,520M / ㉖ 50M / ㉚ 1,470M / ㉛ 40%
 *   ㉜ 428M / ㉞ 428M / ㊲ 234M / ㊳ 228M / ㊵ 6M / ㊺ 194M
 *
 * 디자인 문서: docs/02-design/features/gift-tax-filing-form-besshi-10.engine.design.md §6
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  PriorGift,
  FilingFormRow,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function realEstateItem(id: string, amount: number): EstateItem {
  return {
    id,
    category: "real_estate_apartment",
    name: `재산${id}`,
    marketValue: amount,
  };
}

function findRow(rows: FilingFormRow[], number: string): FilingFormRow | undefined {
  return rows.find((r) => r.number === number);
}

function findRowByLabel(
  rows: FilingFormRow[],
  label: string,
): FilingFormRow | undefined {
  return rows.find((r) => r.label === label);
}

describe("별지 제10호서식 — PDF 사례 1 C1-3 anchor", () => {
  // ──────────────────────────────────────────────
  // 입력: 사례 1 C1-3 (case-1-redonation-spouse.test.ts 동일 입력)
  // ──────────────────────────────────────────────
  const prior: PriorGift[] = [
    {
      giftDate: "2021-05-10",
      isHeir: false,
      giftAmount: 350_000_000,
      giftTaxPaid: 48_500_000,
      donor: "father",
      computedTax: 50_000_000,
      giftTaxBase: 300_000_000,
    },
    {
      giftDate: "2022-07-20",
      isHeir: false,
      giftAmount: 660_000_000,
      giftTaxPaid: 172_660_000,
      donor: "mother",
      computedTax: 228_000_000,
      giftTaxBase: 960_000_000,
    },
  ];
  const input: GiftTaxInput = {
    giftDate: "2023-04-20",
    donorRelation: "lineal_descendant",
    donor: "mother",
    giftItems: [realEstateItem("c1-3", 510_000_000)],
    priorGiftsWithin10Years: prior,
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_descendant" },
    creditInput: { isFiledOnTime: true },
  };
  const result = calcGiftTax(input);
  const rows = result.besshi10Rows;

  // ──────────────────────────────────────────────
  // 값 anchor (B10-1 ~ B10-12)
  // ──────────────────────────────────────────────
  it("B10-1: ⑰ 증여재산가액 = 510,000,000", () => {
    expect(findRow(rows, "⑰")?.amount).toBe(510_000_000);
  });
  it("B10-2: ㉓ 증여재산가산액(사전증여 합산분) = 1,010,000,000", () => {
    expect(findRow(rows, "㉓")?.amount).toBe(1_010_000_000);
  });
  it("B10-3: ㉔ 증여세과세가액 = 1,520,000,000", () => {
    expect(findRow(rows, "㉔")?.amount).toBe(1_520_000_000);
  });
  it("B10-4: ㉖ 직계존비속 공제 = 50,000,000 (mother → 장남)", () => {
    expect(findRow(rows, "㉖")?.amount).toBe(50_000_000);
  });
  it("B10-5: ㉚ 과세표준 = 1,470,000,000", () => {
    expect(findRow(rows, "㉚")?.amount).toBe(1_470_000_000);
  });
  it("B10-6: ㉛ 세율 라벨 = 40%", () => {
    expect(findRow(rows, "㉛")?.formula).toBe("40%");
  });
  it("B10-7: ㉜ 산출세액 = 428,000,000", () => {
    expect(findRow(rows, "㉜")?.amount).toBe(428_000_000);
  });
  it("B10-8: ㉞ 산출세액계 = 428,000,000 (세대생략 0)", () => {
    expect(findRow(rows, "㉞")?.amount).toBe(428_000_000);
  });
  it("B10-9: ㊲ 세액공제 합계 = 234,000,000", () => {
    expect(findRow(rows, "㊲")?.amount).toBe(234_000_000);
  });
  it("B10-10: ㊳ 기납부세액 = 228,000,000", () => {
    expect(findRow(rows, "㊳")?.amount).toBe(228_000_000);
  });
  it("B10-11: ㊵ 신고세액공제 = 6,000,000", () => {
    expect(findRow(rows, "㊵")?.amount).toBe(6_000_000);
  });
  it("B10-12: ㊺ 자진납부할 세액(합계액) = 194,000,000", () => {
    expect(findRow(rows, "㊺")?.amount).toBe(194_000_000);
  });

  // ──────────────────────────────────────────────
  // 산식 자기일관성 anchor (B10-SC1 ~ B10-SC4)
  // ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹ 모두 0이라 PDF 산식 ≡ 엔진 산식
  // ──────────────────────────────────────────────
  it("B10-SC1: ㉔ = ⑰ − ⑱ − ⑲ − ⑳ − ㉑ − ㉒ + ㉓", () => {
    const lhs = findRow(rows, "㉔")!.amount;
    const rhs =
      findRow(rows, "⑰")!.amount -
      findRow(rows, "⑱")!.amount -
      findRow(rows, "⑲")!.amount -
      findRow(rows, "⑳")!.amount -
      findRow(rows, "㉑")!.amount -
      findRow(rows, "㉒")!.amount +
      findRow(rows, "㉓")!.amount;
    expect(lhs).toBe(rhs);
  });
  it("B10-SC2: ㉚ = ㉔ − ㉕ − ㉖ − ㉗ − ㉘ − ㉙", () => {
    const lhs = findRow(rows, "㉚")!.amount;
    const rhs =
      findRow(rows, "㉔")!.amount -
      findRow(rows, "㉕")!.amount -
      findRow(rows, "㉖")!.amount -
      findRow(rows, "㉗")!.amount -
      findRow(rows, "㉘")!.amount -
      findRow(rows, "㉙")!.amount;
    expect(lhs).toBe(rhs);
  });
  it("B10-SC3: ㉞ = ㉜ + ㉝", () => {
    const lhs = findRow(rows, "㉞")!.amount;
    const rhs = findRow(rows, "㉜")!.amount + findRow(rows, "㉝")!.amount;
    expect(lhs).toBe(rhs);
  });
  it("B10-SC4: ㊺ = ㉞ + ㉟ − ㊱ − ㊲ + ㊷ + ㊸ + ㊹", () => {
    const lhs = findRow(rows, "㊺")!.amount;
    const rhs =
      findRow(rows, "㉞")!.amount +
      findRow(rows, "㉟")!.amount -
      findRow(rows, "㊱")!.amount -
      findRow(rows, "㊲")!.amount +
      findRow(rows, "㊷")!.amount +
      findRow(rows, "㊸")!.amount +
      findRow(rows, "㊹")!.amount;
    expect(lhs).toBe(rhs);
  });

  // ──────────────────────────────────────────────
  // 산식 자기일관성 실효화 케이스 (B10-SC5)
  // SC3 실효: 세대생략 할증이 있으면 ㉝ = 12,000,000 (비-0) → ㉞ = ㉜ + ㉝ 회귀 실효
  // SC1·SC2·SC4의 ⑲⑳㉑㉒㉘㉙㉟㊱㊷㊸㊹는 현 엔진이 항상 0으로 고정(별도 입력 경로 없음)
  // → 해당 항들의 SC 중간 회귀는 엔진 변경 없이 테스트로 실효화 불가 (프로덕션 코드 수정 금지 정책)
  // → SC3만 본 케이스로 실효화 / SC1·SC2·SC4는 기존 trivial anchor 유지
  // ──────────────────────────────────────────────
  describe("B10-SC5 세대생략 할증 케이스 — SC3 실효화 (㉝ 비-0)", () => {
    // E14 케이스: 직계비속 3억, 세대생략(성인), 신고세액공제 있음
    // ㉜ = 40,000,000 / ㉝ = 12,000,000(비-0) / ㉞ = 52,000,000
    const inputSkip: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      donor: "grandparent",
      giftItems: [
        { id: "sc5-1", category: "financial", name: "예금", marketValue: 300_000_000 },
      ],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const resultSkip = calcGiftTax(inputSkip);
    const rowsSkip = resultSkip.besshi10Rows;

    it("B10-SC5a: ㉝ 세대생략가산세 = 12,000,000 (비-0 — SC3 실효 근거)", () => {
      expect(findRow(rowsSkip, "㉝")?.amount).toBe(12_000_000);
    });

    it("B10-SC5b: SC3 실효 — ㉞ = ㉜ + ㉝ = 40M + 12M = 52M", () => {
      const lhs = findRow(rowsSkip, "㉞")!.amount;
      const rhs =
        findRow(rowsSkip, "㉜")!.amount + findRow(rowsSkip, "㉝")!.amount;
      expect(lhs).toBe(rhs);
      expect(lhs).toBe(52_000_000); // 항등식이면서 값도 고정 (double-lock)
    });

    it("B10-SC5c: ㊺ 자진납부 = 50,440,000 (산출세액계 − 세액공제)", () => {
      // 결정세액 = 52M − 신고공제 floor(52M×0.03=1,560,000) = 50,440,000
      expect(findRow(rowsSkip, "㊺")?.amount).toBe(50_440_000);
    });
  });

  // ──────────────────────────────────────────────
  // 구조 anchor
  // ──────────────────────────────────────────────
  it("좌측 컬럼 20행 (⑰~㊱)", () => {
    const left = rows.filter((r) => r.column === "left");
    expect(left.length).toBe(20);
  });
  it("우측 컬럼 13행 (㊲~㊺ 9행 + 납부방법 헤더 1 + ㊻㊼ 2 + 신고납부 1)", () => {
    const right = rows.filter((r) => r.column === "right");
    expect(right.length).toBe(13);
  });
  it("납부방법 헤더 행이 우측에 1개 존재 (display='header')", () => {
    const header = rows.filter((r) => r.display === "header");
    expect(header.length).toBe(1);
    expect(header[0].label).toBe("납부방법");
    expect(header[0].column).toBe("right");
  });
  it("신고납부 도출 = ㊺ − ㊻ − ㊼ = 194,000,000 (㊻=㊼=0)", () => {
    const reportPay = findRowByLabel(rows, "신고납부");
    expect(reportPay?.amount).toBe(194_000_000);
  });
});
