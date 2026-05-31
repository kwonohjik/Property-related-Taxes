/**
 * §24 종합한도 — 사전증여 증여재산공제 자동 도출 anchor
 *
 * 계획: docs/00-pm/inheritance-section24-gift-deduction-autoderive.plan.md
 * 법령: 상증법 §24 3호 (KoreanLaw mst 276123) — 가산 증여재산가액 − (§53·§53의2·§54 공제),
 *       단서: 제3호는 과세가액 5억원 초과 시에만 적용.
 *
 * 버그: §24 한도가 증여재산공제(배우자 600M + 직계비속 50M = 650M)를 차감하지 않아
 *   ceiling 과소(5,315M, 정답 5,965M). 수동 입력 priorGiftDeductionTotal 미입력 시 0이던 dual-truth.
 */
import { describe, it, expect } from "vitest";
import {
  computePriorGiftDeductionForLimit,
  applyDeductionLimit,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { EXAMPLE_INPUT } from "./fixtures/comprehensive-case-pdf.fixture";
import type {
  PriorGift,
  InheritanceTaxInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const DEATH = "2024-06-10";

describe("§24 자동 도출 — computePriorGiftDeductionForLimit", () => {
  it("S24-1: giftTaxBase 경로 — Σ(giftAmount − giftTaxBase) = 650M (배우자600+장남50+법인0)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2021-08-10", isHeir: false, giftAmount: 700_000_000, giftTaxBase: 700_000_000 },
      { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000, giftTaxBase: 160_000_000 },
      { giftDate: "2018-08-17", isHeir: true, giftAmount: 1_500_000_000, giftTaxBase: 1_450_000_000 },
    ] as PriorGift[];
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(650_000_000);
  });

  it("S24-2: doneeRelation 경로(giftTaxBase 없음) — §53 관계공제 자동 = 650M", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000, doneeRelation: "spouse" },
      { giftDate: "2018-08-17", isHeir: true, giftAmount: 1_500_000_000, doneeRelation: "lineal_descendant" },
    ] as PriorGift[];
    // 배우자 min(600M, 760M)=600M + 직계비속 min(50M, 1,500M)=50M = 650M
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(650_000_000);
  });

  it("S24-3: §13 cutoff 도과 건 제외 (비상속인 5년 초과 → 그 건 공제 무시)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2015-01-01", isHeir: false, giftAmount: 700_000_000, giftTaxBase: 600_000_000 },
      { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000, giftTaxBase: 160_000_000 },
    ] as PriorGift[];
    // 첫 건(2015, 비상속인 9년>5년) 제외 → 둘째만 600M
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(600_000_000);
  });

  it("S24-4: 같은 관계 복수 건 — 관계별 그룹 합산 후 한도 1회 (건별 중복 차단)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2022-01-01", isHeir: true, giftAmount: 400_000_000, doneeRelation: "spouse" },
      { giftDate: "2023-01-01", isHeir: true, giftAmount: 300_000_000, doneeRelation: "spouse" },
    ] as PriorGift[];
    // 배우자 합 7억 → 한도 6억 1회 적용 (건별이면 400+300=700M 오류)
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(600_000_000);
  });

  it("S24-5: 빈 배열·undefined → 0", () => {
    expect(computePriorGiftDeductionForLimit([], DEATH)).toBe(0);
    expect(computePriorGiftDeductionForLimit(undefined, DEATH)).toBe(0);
  });

  it("S24-6: giftTaxBase·doneeRelation 둘 다 미입력 → 0 (보수적)", () => {
    const gifts: PriorGift[] = [
      { giftDate: "2022-06-10", isHeir: true, giftAmount: 760_000_000 },
    ] as PriorGift[];
    expect(computePriorGiftDeductionForLimit(gifts, DEATH)).toBe(0);
  });
});

describe("§24 단서 — 과세가액 5억 초과 시에만 3호(사전증여) 차감", () => {
  const ceilingFor = (taxable: number) =>
    applyDeductionLimit(taxable, taxable, 0, {
      totalPriorGiftAmount: 200_000_000,
      priorGiftDeductionTotal: 0,
      legateeAmountNonHeir: 0,
    }).ceiling;

  it("S24-7: 과세가액 6억(>5억) → 사전증여 2억 차감 → ceiling 4억", () => {
    expect(ceilingFor(600_000_000)).toBe(400_000_000);
  });

  it("S24-8: 과세가액 4억(≤5억) → 사전증여 차감 0(단서) → ceiling 4억", () => {
    expect(ceilingFor(400_000_000)).toBe(400_000_000);
  });

  it("S24-9: 과세가액 정확히 5억 → 차감 0 (초과 아님) → ceiling 5억", () => {
    expect(ceilingFor(500_000_000)).toBe(500_000_000);
  });
});

describe("§24 통합 — EXAMPLE_INPUT 자동 도출 (dual-truth 차단)", () => {
  it("S24-10: priorGiftDeductionTotal 미입력 → 자동 650M → ceiling 5,965M (교재)", () => {
    const result = calcInheritanceTax(EXAMPLE_INPUT);
    const d = result.deductionDetail.deductionLimitDetail;
    expect(d?.priorGiftDeductionTotal).toBe(650_000_000);
    // 8,775M − 500M − (2,960M − 650M) = 8,775M − 500M − 2,310M = 5,965M
    expect(d?.ceiling).toBe(5_965_000_000);
  });

  it("S24-11: priorGiftDeductionTotal 명시 700M override → ceiling 6,015M", () => {
    const input: InheritanceTaxInput = {
      ...EXAMPLE_INPUT,
      deductionInput: {
        ...EXAMPLE_INPUT.deductionInput,
        priorGiftDeductionTotal: 700_000_000,
      },
    };
    const d = calcInheritanceTax(input).deductionDetail.deductionLimitDetail;
    expect(d?.priorGiftDeductionTotal).toBe(700_000_000);
    // 8,775M − 500M − (2,960M − 700M) = 8,775M − 500M − 2,260M = 6,015M
    expect(d?.ceiling).toBe(6_015_000_000);
  });
});
