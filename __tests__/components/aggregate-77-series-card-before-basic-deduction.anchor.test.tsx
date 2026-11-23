/**
 * anchor: 다건·일괄 §77·§77의2·§77의3 카드의 중간값은 **기본공제 전**이다 (2026-11-23 · 결과뷰 리뷰 후속 2번 · 사용자 결정 1)
 *
 * ── 결함 ───────────────────────────────────────────────────────────
 * 집계는 자산별 엔진을 `skipBasicDeduction: true`로 부른다. 그래서 카드가 읽는 detail의 기본공제는 0이고,
 * 기본공제(「소득세법」 §90①의 C)는 「감면세액 합산 재계산」이 신고 단위에서 한 번 뺀다. 그런데 카드는
 * 「(보상분 소득 − 기본공제)」·「기본공제 배정 후」·「기본공제 차감」이라 적고 0을 빼, 합산 재계산 카드와 어긋났다.
 *
 * ── 실측 (토지 6억 1건 · 다건 경로) ────────────────────────────────
 * | 카드 | 카드 값 | 합산 재계산(C = 2,500,000) |
 * |---|---|---|
 * | §77 현금 6억 ④ | (288,000,000 − 0) × 10% = 28,800,000 | 28,550,000 |
 * | §77의2 대토 6억 ② | 288,000,000 | 285,500,000 |
 * | §77의3 1호 ② | 280,000,000 × 40% = 112,000,000 | 111,000,000 |
 *
 * ── 처방 (표시만) ──────────────────────────────────────────────────
 * `aggregatedContext`면 「기본공제 전」으로 적고 C는 합산 재계산이 뺀다고 밝힌다. 값·세액은 그대로다.
 * 단건(aggregatedContext 없음)은 종전 문구를 유지한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { PublicExpropriationDetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { GbDesignatedLand77_3DetailCard } from "@/components/calc/results/transfer/GbDesignatedLand77_3DetailCard";
import { ReplacementLand77_2DetailCard } from "@/components/calc/results/transfer/ReplacementLand77_2DetailCard";
import {
  RATED_REDUCIBLE_INCOME_LABEL,
  ELIGIBLE_INCOME_VS_FORM_NOTE,
  AGGREGATE_RATED_REDUCIBLE_INCOME_LABEL,
  AGGREGATE_BASIC_DEDUCTION_NOTE,
} from "@/components/calc/results/transfer/reduction-eligible-income";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

afterEach(cleanup);

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 다건 경로 1건 — 카드가 받는 자산별 결과와 합산 재계산 항목을 함께 돌려준다. */
function aggregate(reduction: Record<string, unknown>, acquisitionDate = "2010-01-01") {
  const s0 = baseTransferInput({
    propertyType: "land",
    isOneHousehold: false,
    householdHousingCount: 0,
    transferPrice: 600_000_000,
    acquisitionPrice: 200_000_000,
    acquisitionDate: D(acquisitionDate),
    transferDate: D("2024-06-01"),
    reductions: [reduction],
  } as never);
  const r = calculateTransferTaxAggregate(
    {
      taxYear: 2024,
      annualBasicDeductionUsed: 0,
      properties: [{ ...s0, propertyId: "A", propertyLabel: "A" }] as unknown as TransferTaxItemInput[],
    } as AggregateTransferInput,
    rates,
  );
  return { card: r.properties[0], entry: r.reductionBreakdown[0] };
}

describe("다건 §77 계열 카드 — 기본공제 전으로 적는다", () => {
  it("A1: §77 현금 6억 — ④는 「기본공제 전」, 「− 0」을 적지 않는다", () => {
    const { card, entry } = aggregate({
      type: "public_expropriation",
      cashCompensation: 600_000_000,
      bondCompensation: 0,
      businessApprovalDate: D("2013-01-01"),
    });
    const d = card.publicExpropriationDetail!;
    // 전제 실측 — 카드 값은 C를 빼기 전, 합산 재계산은 C를 뺀 값이다.
    expect(d.breakdown.basicDeductionOnCash).toBe(0);
    expect(d.breakdown.reducibleIncome).toBe(28_800_000);
    expect(entry.basicDeductionApplied).toBe(2_500_000);
    expect(entry.reducibleIncomeAfterBasicDeduction).toBe(28_550_000);

    const text = render(<PublicExpropriationDetailCard detail={d} aggregatedContext />).container.textContent ?? "";
    expect(text).toContain("④ 자산별 감면금액 = 보상분 소득 × 감면율 (기본공제 전)");
    expect(text).toContain("현금 = 288,000,000 × 10% = 28,800,000");
    expect(text).not.toContain("− 0)");
    expect(text).toContain(AGGREGATE_RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).not.toContain(RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(AGGREGATE_BASIC_DEDUCTION_NOTE);
  });

  it("A2: §77의2 대토 6억 — ②는 「기본공제 전」", () => {
    const { card, entry } = aggregate({
      type: "replacement_land_comp",
      transferCause: "public_expropriation",
      cashCompensation: 0,
      replacementLandComp: 600_000_000,
      businessApprovalDate: D("2013-01-01"),
    });
    const d = card.replacementLandDetail!;
    expect(d.replacementTaxableIncome).toBe(288_000_000);
    expect(entry.basicDeductionApplied).toBe(2_500_000);

    const text = render(<ReplacementLand77_2DetailCard detail={d} aggregatedContext />).container.textContent ?? "";
    expect(text).toContain("② 대토보상분 소득 (기본공제 전)");
    expect(text).not.toContain("기본공제 배정 후");
    expect(text).toContain(AGGREGATE_RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(AGGREGATE_BASIC_DEDUCTION_NOTE);
  });

  it("A3: §77의3 1호 — ②는 「양도소득금액 × 감면율 (기본공제 전)」", () => {
    const { card, entry } = aggregate(
      {
        type: "gb_designated_land",
        branch: "purchase",
        designationDate: D("2005-01-01"),
        triggerDate: D("2024-01-01"),
        residedFromAcqToTrigger: true,
      },
      "2000-01-01",
    );
    const d = card.gbDesignatedLandDetail!;
    expect(d.taxableIncome).toBe(280_000_000);
    expect(entry.basicDeductionApplied).toBe(2_500_000);

    const text = render(<GbDesignatedLand77_3DetailCard detail={d} aggregatedContext />).container.textContent ?? "";
    expect(text).toContain("양도소득금액 × 감면율 (기본공제 전)");
    expect(text).toContain("280,000,000 × 40% = 112,000,000");
    expect(text).not.toContain("(양도소득금액 − 기본공제)");
    expect(text).toContain(AGGREGATE_BASIC_DEDUCTION_NOTE);
  });

  it("A4: 단건 문맥(aggregatedContext 없음)은 종전 문구 그대로", () => {
    const { card } = aggregate({
      type: "public_expropriation",
      cashCompensation: 600_000_000,
      bondCompensation: 0,
      businessApprovalDate: D("2013-01-01"),
    });
    const text = render(<PublicExpropriationDetailCard detail={card.publicExpropriationDetail!} />).container.textContent ?? "";
    expect(text).toContain("④ 자산별 감면금액 = (보상분 소득 − 기본공제) × 감면율");
    expect(text).toContain(RATED_REDUCIBLE_INCOME_LABEL);
    expect(text).toContain(ELIGIBLE_INCOME_VS_FORM_NOTE);
    expect(text).not.toContain(AGGREGATE_BASIC_DEDUCTION_NOTE);
  });
});
