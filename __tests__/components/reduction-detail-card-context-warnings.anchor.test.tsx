/**
 * anchor: 감면 상세 카드의 **컨텍스트 판정과 엔진 경고 표시** (결과탭 코드리뷰 Lane 4 — #044 #057).
 *
 * ## #044 — 일괄(bundled)이 `aggregatedContext`를 넘기지 않았다
 *
 * §77 계열 카드는 `aggregatedContext`가 false면 「⑤ 감면세액 = 산출세액 × 감면대상소득/과세표준」을
 * **자산별 참고값**으로 단정한다. 그런데 일괄·다건은 §133 합산 재계산 경로라 최종 감면세액을
 * 「합산 과세 내역」의 `reductionBreakdown` 행이 낸다. 다건(multi)은 이 prop을 넘겨 ⑤를 감췄지만
 * 일괄은 빠뜨려, 같은 성질의 화면 둘이 서로 다른 말을 했다.
 *
 * ## #057 — 엔진 경고의 렌더러가 0개였다
 *
 * §77·§77의2·§77의3 모듈은 `warnings: string[]`을 매 계산마다 채운다. 특히 §77의2는 **조건 없이**
 * 「현금 전환·현물출자 등 §77의2③ 사유 발생 시 감면세액 + 이자상당가산액이 추징됩니다」를 담는데,
 * 이 법정 사후관리 고지가 어느 결과탭에도 나오지 않았다.
 *
 * 법령: 조세특례제한법 §77 · §77의2③ · §77의3 · §133
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

const APPORTIONMENT = {
  apportioned: [],
  totalStandardAtTransfer: 0,
  residualAbsorbedBy: null,
  legalBasis: "소득세법 시행령 §166⑥",
  warnings: [],
};

const EXPROPRIATION = [
  {
    type: "public_expropriation" as const,
    cashCompensation: 900_000_000,
    bondCompensation: 0,
    bondHoldingYears: null,
    businessApprovalDate: D("2024-01-01"),
  },
];

/** §77의2 대토보상 — 추징 고지가 **조건 없이** 생성되는 유일한 경로다. */
const REPLACEMENT = [
  {
    type: "replacement_land_comp" as const,
    cashCompensation: 500_000_000,
    replacementLandComp: 500_000_000,
    businessApprovalDate: D("2023-06-01"),
  },
];

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    acquisitionDate: D("2012-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...o,
  } as Partial<TransferTaxInput>);
}

function agg2() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land({ reductions: EXPROPRIATION } as never), propertyId: "p1", propertyLabel: "토지 A" } as never,
        {
          ...land({
            reductions: EXPROPRIATION,
            transferPrice: 1_400_000_000,
            acquisitionPrice: 500_000_000,
          } as never),
          propertyId: "p2",
          propertyLabel: "토지 B",
        } as never,
      ],
    },
    rates,
  );
}

/** 「⑤ 감면세액 = 산출세액 × …」 단정 문구 — 집계 컨텍스트에서는 나오면 안 된다. */
const CLAIMS_FIFTH = "⑤ 감면세액 = 산출세액";
/** 집계 컨텍스트가 대신 그리는 문구. */
const DEFERS_TO_RECALC = "합산 재계산";
const CLAWBACK = "이자상당가산액이 추징됩니다";

// ── R-0 구별력 ──────────────────────────────────────────────────────
describe("R-0 격자 — §77 감면이 실제로 붙고 합산 재계산이 일어난다", () => {
  it("집계 격자", () => {
    const a = agg2();
    expect(a.reductionAmount, "감면 0이면 카드 자체가 안 뜬다").toBeGreaterThan(0);
    expect(
      a.reductionBreakdown.length,
      "합산 재계산 행이 없으면 ⑤를 감추는 것이 정보 소실이 된다",
    ).toBeGreaterThan(0);
    expect(a.properties.every((p) => !!p.publicExpropriationDetail)).toBe(true);
  });

  it("§77의2 격자 — 추징 고지가 엔진에 실제로 있다", () => {
    const r = calculateTransferTax(land({ reductions: REPLACEMENT } as never), rates);
    expect(r.replacementLandDetail?.isEligible).toBe(true);
    expect(r.replacementLandDetail?.warnings.some((w) => w.includes(CLAWBACK))).toBe(true);
  });
});

// ── R-1 #044 ────────────────────────────────────────────────────────
describe("R-1 일괄 결과뷰가 §77 카드에 집계 컨텍스트를 넘긴다", () => {
  it("🔴 「⑤ 감면세액 = 산출세액 × …」을 단정하지 않는다", () => {
    const { container } = render(
      <BundledAllocationCard
        apportionment={APPORTIONMENT as never}
        aggregated={agg2()}
        formData={createDefaultTransferFormData()}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("공익사업 수용 감면 상세");
    expect(text, "자산별 참고값으로 최종 감면세액을 단정하고 있다").not.toContain(CLAIMS_FIFTH);
    expect(text).toContain(DEFERS_TO_RECALC);
  });

  it("다건 결과뷰와 같은 문구를 낸다 (같은 성질의 화면은 같은 말을 한다)", () => {
    const a = agg2();
    // 아코디언은 접혀 있어도 인쇄 DOM에 남는다(Lane 2) — textContent로 읽을 수 있다.
    const multi = render(<PropertyBreakdownAccordion breakdown={a.properties[0]} />);
    const multiText = multi.container.textContent ?? "";
    expect(multiText).toContain("공익사업 수용 감면 상세");
    expect(multiText).not.toContain(CLAIMS_FIFTH);
    expect(multiText).toContain(DEFERS_TO_RECALC);
  });
});

// ── R-2 #057 ────────────────────────────────────────────────────────
describe("R-2 §77의2 추징 고지가 화면에 나온다", () => {
  it("🔴 「현금 전환·현물출자 시 감면세액 + 이자상당가산액 추징」", () => {
    const r = calculateTransferTax(land({ reductions: REPLACEMENT } as never), rates);
    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
      />,
    );
    expect(container.textContent ?? "").toContain(CLAWBACK);
  });

  it("카드가 이미 말한 사실은 중복되지 않는다 — 「연간 한도」 줄은 하나뿐", () => {
    // 감면세액이 §133 연간 한도를 넘도록 큰 격자를 만든다.
    const r = calculateTransferTax(
      land({
        transferPrice: 5_000_000_000,
        acquisitionPrice: 200_000_000,
        reductions: [{ ...EXPROPRIATION[0], cashCompensation: 5_000_000_000 }],
      } as never),
      rates,
    );
    expect(
      r.publicExpropriationDetail?.cappedByAnnualLimit,
      "한도가 안 걸리면 중복 자체가 발생하지 않아 이 테스트는 아무것도 재지 못한다",
    ).toBe(true);

    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
      />,
    );
    const hits = [...container.querySelectorAll("p")].filter((p) =>
      (p.textContent ?? "").includes("연간 한도"),
    );
    expect(hits.length, `「연간 한도」 문구가 ${hits.length}줄이다`).toBe(1);
    // 같은 카드에서 추징 고지는 §77의2 전용이라 여기서는 나오지 않는다 — 대조군.
    expect(container.textContent ?? "").not.toContain(CLAWBACK);
  });
});

// ── R-3 #045 §127⑦ 중복배제 ─────────────────────────────────────────
/** 자경(§69) + 공익수용(§77) 동시 선택 — 입력 UI가 라디오가 아니라 독립 체크박스라 정상 경로다. */
function dualReduction() {
  return calculateTransferTax(
    land({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 400_000_000,
      transferDate: D("2025-06-01"),
      reductions: [
        { type: "self_farming", farmingYears: 10, isResidenceRequirementMet: true },
        {
          type: "public_expropriation",
          cashCompensation: 2_000_000_000,
          bondCompensation: 0,
          bondHoldingYears: null,
          businessApprovalDate: D("2024-01-01"),
        },
      ],
    } as never),
    rates,
  );
}

describe("R-3 §127⑦로 배제된 후보가 자기 감면세액을 단정하지 않는다", () => {
  it("격자 — 자경이 채택되고 §77 detail도 적격으로 남는다 (구별력)", () => {
    const r = dualReduction();
    expect(r.reductionTypeApplied).toBe("self_farming");
    expect(r.publicExpropriationDetail?.isEligible, "배제된 후보가 없으면 잴 것이 없다").toBe(true);
    expect(r.publicExpropriationDetail?.rawReductionAmount).toBeGreaterThan(0);
    expect(
      r.publicExpropriationDetail?.rawReductionAmount,
      "두 금액이 같으면 오독 자체가 성립하지 않는다",
    ).not.toBe(r.reductionAmount);
  });

  it("🔴 §77 카드에 배제 고지가 붙고 ⑤ 단정이 사라진다", () => {
    const r = dualReduction();
    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
        appliedReductionType={r.reductionTypeApplied}
        appliedReductionAmount={r.reductionAmount}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("공익사업 수용 감면 상세");
    expect(text).toContain("§127⑦ 중복배제");
    expect(text).toContain("적용되지 않았습니다");
    expect(text, "배제된 후보가 감면세액 등식을 단정하고 있다").not.toContain(CLAIMS_FIFTH);
    expect(
      text,
      "배제된 후보의 감면세액이 화면에 남으면 두 감면이 합산된 것으로 오독된다",
    ).not.toContain((r.publicExpropriationDetail!.rawReductionAmount).toLocaleString());
  });

  it("채택된 감면(자경)에는 배제 고지가 붙지 않는다 — 대조군", () => {
    const r = dualReduction();
    const { container } = render(
      <ReductionDetailCards
        result={{ ...r, publicExpropriationDetail: undefined } as never}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
        appliedReductionType={r.reductionTypeApplied}
        appliedReductionAmount={r.reductionAmount}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("자경농지");
    expect(text).not.toContain("§127⑦ 중복배제");
  });
});

// ── R-4 #046 §133 5년 누적 한도 ─────────────────────────────────────
/** §77 단독 + 2023년 공익수용 250,000,000 사용 이력 → 5년 한도 3억의 잔여 5천만으로 잘린다. */
function fiveYearCapped() {
  return calculateTransferTax(
    land({
      transferPrice: 2_000_000_000,
      acquisitionPrice: 400_000_000,
      transferDate: D("2025-06-01"),
      reductions: [
        {
          type: "public_expropriation",
          cashCompensation: 2_000_000_000,
          bondCompensation: 0,
          bondHoldingYears: null,
          businessApprovalDate: D("2024-01-01"),
        },
      ],
      priorReductionUsage: [{ year: 2023, type: "public_expropriation", amount: 250_000_000 }],
    } as never),
    rates,
  );
}

describe("R-4 §133 5년 누적 한도가 카드에 반영된다", () => {
  it("격자 — 연간 한도가 아니라 **5년 누적**이 깎는다 (구별력)", () => {
    const r = fiveYearCapped();
    const d = r.publicExpropriationDetail!;
    expect(d.cappedByAnnualLimit, "연간 한도로 걸리면 종전 블록이 이미 설명한다").toBe(false);
    expect(d.reductionAmount, "detail은 연간 한도까지만 반영된 값이다").toBeGreaterThan(
      r.reductionAmount,
    );
    expect(r.reductionAmount).toBe(50_000_000);
  });

  it("🔴 카드가 실제 적용 감면세액을 밝힌다", () => {
    const r = fiveYearCapped();
    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
        appliedReductionType={r.reductionTypeApplied}
        appliedReductionAmount={r.reductionAmount}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("§133 종합한도(5년 누적)");
    expect(text).toContain(`적용 감면세액 (한도 후) = ${r.reductionAmount.toLocaleString()}`);
  });

  it("한도가 걸리지 않으면 그 행도 없다 — 대조군", () => {
    const r = calculateTransferTax(
      land({
        transferPrice: 2_000_000_000,
        acquisitionPrice: 400_000_000,
        transferDate: D("2025-06-01"),
        reductions: [
          {
            type: "public_expropriation",
            cashCompensation: 2_000_000_000,
            bondCompensation: 0,
            bondHoldingYears: null,
            businessApprovalDate: D("2024-01-01"),
          },
        ],
      } as never),
      rates,
    );
    const { container } = render(
      <ReductionDetailCards
        result={r}
        calculatedTax={r.calculatedTax}
        taxBase={r.taxBase}
        longTermHoldingDeduction={r.longTermHoldingDeduction}
        appliedReductionType={r.reductionTypeApplied}
        appliedReductionAmount={r.reductionAmount}
      />,
    );
    expect(container.textContent ?? "").not.toContain("§133 종합한도(5년 누적)");
  });
});
