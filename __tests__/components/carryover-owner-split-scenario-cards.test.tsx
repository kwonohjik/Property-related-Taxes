/**
 * 이월과세 × 소유자 분리 — 채택되지 않은 시나리오 카드·비교 카드가 본인 파트 양도가액·취득가액을 적는다(계획서 `carryover-owner-split-display-gift-tax.plan.md` V-4·V-1).
 * 값은 route anchor(`transfer.route.carryover-owner-split-gift-tax.anchor.test.ts`)가 고정한 엔진 echo — B 채택(증여자 취득가액 10억) · 건물만 본인.
 * 수정 전 A 카드: 양도가액 1,200,000,000 · 취득가액 1,000,000,000 · 양도차익 120,000,000(등식 불성립).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverScenarioAFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioAFilingCard";
import { CarryoverScenarioBFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioBFilingCard";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { scenarioAcqLabel } from "@/components/calc/results/TransferTaxResultView";
import type { CarryoverScenarioADetail, CarryoverScenarioBDetail, CarryoverTaxationDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

afterEach(cleanup);

const A: CarryoverScenarioADetail = {
  acquisitionPrice: 1_000_000_000, holdingPeriodYears: 10, giftTaxAddedToExpense: 0, giftTaxLimitApplied: false, giftTaxLimitCap: 0,
  donorCapexAddedToExpense: 0, donorCapexGuardApplied: false, effectiveCapex: 0, transferGain: 120_000_000, determinedTax: 1,
  ownerSplitPart: { transferPrice: 720_000_000, acquisitionPrice: 600_000_000 },
};
const B: CarryoverScenarioBDetail = {
  acquisitionPrice: 900_000_000, holdingPeriodYears: 2, transferGain: 180_000_000, determinedTax: 2,
  ownerSplitPart: { transferPrice: 720_000_000, acquisitionPrice: 540_000_000 },
};

describe("시나리오 요약 카드 — 본인 파트 값", () => {
  it("A 카드(비교용): 양도가액 720,000,000 · 취득가액 600,000,000 — 자산 전체 값은 적지 않는다", () => {
    render(<CarryoverScenarioAFilingCard scenarioA={A} adopted={false} transferPrice={1_200_000_000} transferDate="2025-06-30" donorAcquisitionDate="2015-06-01" />);
    expect(screen.getByText("720,000,000")).toBeTruthy();
    expect(screen.getByText("600,000,000")).toBeTruthy();
    expect(screen.queryByText("1,200,000,000")).toBeNull();
    expect(screen.queryByText("1,000,000,000")).toBeNull();
  });

  it("B 카드(비교용): 취득가액 540,000,000 (수정 전 900,000,000)", () => {
    render(<CarryoverScenarioBFilingCard scenarioB={B} adopted={false} transferPrice={1_200_000_000} transferDate="2025-06-30" giftRegistryDate="2023-03-01" />);
    expect(screen.getByText("540,000,000")).toBeTruthy();
    expect(screen.queryByText("900,000,000")).toBeNull();
  });

  it("echo 없음(소유자 같음·옛 이력) — 종전 값 그대로", () => {
    render(<CarryoverScenarioAFilingCard scenarioA={{ ...A, ownerSplitPart: undefined }} adopted={false} transferPrice={1_200_000_000} />);
    expect(screen.getByText("1,200,000,000")).toBeTruthy();
    expect(screen.getByText("1,000,000,000")).toBeTruthy();
  });
});

describe("이월과세 비교 카드 — A·B 취득가액 행", () => {
  it("본인 파트 취득가액 600,000,000 · 540,000,000", () => {
    const detail: CarryoverTaxationDetail = { isEligible: true, applicablePeriodYears: 10, scenarioA: A, scenarioB: B, adoptedScenario: "B", comparisonExclusion: true, exclusionReason: "tax_comparison" };
    render(<CarryoverComparisonCard detail={detail} />);
    expect(screen.getByText("600,000,000")).toBeTruthy();
    expect(screen.getByText("540,000,000")).toBeTruthy();
    expect(screen.queryByText("1,000,000,000")).toBeNull();
  });
});

describe("채택 서식 부제 — 취득가액", () => {
  it("소유자 분리면 본인 파트 값 · echo 없으면 종전 값", () => {
    expect(scenarioAcqLabel(A)).toBe("취득가액 600,000,000 (본인 소유 파트)");
    expect(scenarioAcqLabel({ ...B, ownerSplitPart: undefined })).toBe("취득가액 900,000,000");
  });
});
