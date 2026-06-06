/**
 * 상속세 영리법인 배부 표 ⑩b·⑩c numeric 갭
 *
 * GAP-1: ⑩b 공제 한도 합계열(corporateExemptionLimitDisplay)이 세대생략 할증을 포함 →
 *        영리법인열(corpLimit, 할증 미포함)과 불일치. 영리법인은 §27 할증 무관(세대 개념 없음).
 *        → 합계열도 할증 미포함이어야 함 (PDF 책 1866 정합).
 * GAP-2: ⑩c 공제할 증여세액 perHeir가 모든 corporate 행에 corporateExemption.amount(전체) 중복 →
 *        다수 영리법인 시 법인별 perCorporateBreakdown.exemptionAmount로 분리해야 함.
 *
 * 계획: docs/00-pm/inheritance-corporate-10bc-gaps.plan.md
 * 설계: docs/02-design/features/inheritance-corporate-10bc-gaps.engine.design.md
 *
 * ★ Pre-Do anchor (2026-06-07): CORP-10B-1·10C-1은 현행 버그 "실패 확보" 목적.
 */
import { describe, it, expect } from "vitest";
import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { buildSummaryTable } from "@/lib/calc/heir-allocation-summary";
import type {
  InheritanceTaxInput,
  Heir,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const CHILD: Heir = {
  id: "child1",
  relation: "child",
  name: "자녀",
  birthDate: "1970-01-01",
  isHeir: true,
};
const corp = (id: string): Heir => ({
  id,
  relation: "corporate",
  name: `영리법인${id}`,
  isHeir: false,
  isForProfit: true,
});

const corpGift = (doneeId: string, base: number, computedTax: number): PriorGift => ({
  giftDate: "2023-05-21",
  giftAmount: base,
  giftTaxBase: base,
  giftTaxPaid: 0,
  isHeir: false,
  beneficiaryType: "corporate",
  corporateGiftComputedTax: computedTax,
  doneeId,
});

function baseInput(over: Partial<InheritanceTaxInput> = {}): InheritanceTaxInput {
  return {
    decedentType: "resident",
    deathDate: "2026-05-21",
    estateItems: [
      { id: "e1", category: "cash", name: "현금", marketValue: 10_000_000_000 },
    ],
    funeralExpense: 0,
    funeralIncludesBongan: false,
    debts: 0,
    preGiftsWithin10Years: [],
    heirs: [CHILD],
    deductionInput: { heirs: [CHILD], deathDate: "2026-05-21" },
    creditInput: { isFiledOnTime: true },
    ...over,
  };
}

// ──────────────────────────────────────────────────────────────────
// GAP-1 (⑩b 합계열 할증) — BLOCKER 보류 (2026-06-07)
//   합계열 corporateExemptionLimitDisplay(할증 포함) ≠ perHeir corpLimit(할증 미포함).
//   영리법인 §27 할증 무관(법령 논리)은 미포함을 지지하나, 기존 anchor AN-8·A4-6이
//   PDF 책 1866 표8 합계=할증 포함(277,943,123)을 명시 anchor([[feedback_pdf_example_test_anchoring]]).
//   두 PDF 해석 모순 → 원본 확인/사용자 판단 필요. CORP-10B anchor는 PDF 확정 후 추가.
// ──────────────────────────────────────────────────────────────────

describe("CORP-10C §3의2② ⑩c 공제할 증여세액 perHeir 법인별 분리", () => {
  function tenC(result: ReturnType<typeof calcInheritanceTax>, heirs: Heir[]) {
    const table = buildSummaryTable(result, heirs);
    return table.rows.find((r) => r.rowId === "row-10c-corpCredit")?.perHeir ?? {};
  }

  it("CORP-10C-1: 영리법인 2개(taxBase 상이) → ⑩c perHeir 각 행 법인별(서로 다름)", () => {
    const heirs = [CHILD, corp("corp1"), corp("corp2")];
    const gifts = [
      corpGift("corp1", 700_000_000, 150_000_000),
      corpGift("corp2", 300_000_000, 60_000_000),
    ];
    const result = calcInheritanceTax(
      baseInput({
        heirs,
        deductionInput: { heirs, deathDate: "2026-05-21" },
        preGiftsWithin10Years: gifts,
        creditInput: { isFiledOnTime: true, priorGifts: gifts },
      }),
    );
    const perHeir = tenC(result, heirs);
    // 법인별 면제액이 서로 달라야 함 (전체 amount 중복 아님)
    expect(perHeir["corp1"]).not.toBe(perHeir["corp2"]);
    // 각 행은 perCorporateBreakdown의 법인별 exemptionAmount와 일치
    const bd = result.corporateExemption?.perCorporateBreakdown ?? [];
    expect(perHeir["corp1"]).toBe(
      bd.find((c) => c.corporateId === "corp1")?.exemptionAmount ?? -1,
    );
    expect(perHeir["corp2"]).toBe(
      bd.find((c) => c.corporateId === "corp2")?.exemptionAmount ?? -1,
    );
  });

  it("CORP-10C-2 (회귀): 영리법인 1개 → ⑩c perHeir == 전체 면제액", () => {
    const heirs = [CHILD, corp("corp1")];
    const gifts = [corpGift("corp1", 700_000_000, 150_000_000)];
    const result = calcInheritanceTax(
      baseInput({
        heirs,
        deductionInput: { heirs, deathDate: "2026-05-21" },
        preGiftsWithin10Years: gifts,
        creditInput: { isFiledOnTime: true, priorGifts: gifts },
      }),
    );
    const perHeir = tenC(result, heirs);
    expect(perHeir["corp1"]).toBe(result.corporateExemption?.amount ?? 0);
  });
});
