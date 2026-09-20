/**
 * 일반건물 개산공제율 — **표시 층 배선**. 엔진 echo만 고정하면 표시 층이 계속 「3%」를 박아도
 * 초록이다(`feedback_library_anchor_does_not_prove_component_uses_it`). 이 anchor가 그 갭을 막는다.
 *
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-18 · §28.
 *
 * §163⑥1호 단서 — 미등기양도자산은 3/1000. 미등기 자산에서 화면이 「× 3%」라 적으면
 * **적힌 산식이 적힌 값을 만들어내지 못한다**(실측 base 238,000,000 · 개산공제 714,000).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingValuationDetailCard } from "@/components/calc/results/GeneralBuildingValuationDetailCard";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

afterEach(cleanup);

const BASE = {
  totalTransferPrice: 2_000_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 180.96,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 2_814_470,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (over: Record<string, unknown> = {}) => buildGeneralBuildingAssetCards({ ...BASE, ...over } as any);

const prop = (propertyId: string, necessaryExpense: number): PerPropertyBreakdown =>
  ({ propertyId, necessaryExpense, capitalExpenditureForDisplay: 0 }) as PerPropertyBreakdown;

describe("⑦ 결과 카드 — 개산공제율 라벨", () => {
  it("D-1 등기 자산은 「× 3%」로 적는다", () => {
    render(<GeneralBuildingValuationDetailCard detail={run()} totalTransferPrice={BASE.totalTransferPrice} />);
    expect(screen.getByText(/취득시 토지 기준시가 × 3%/)).toBeTruthy();
  });

  it("D-2 토지 미등기면 토지만 「× 0.3%」 — 건물은 3% 그대로", () => {
    render(
      <GeneralBuildingValuationDetailCard
        detail={run({ unregisteredLand: true })}
        totalTransferPrice={BASE.totalTransferPrice}
      />,
    );
    expect(screen.getByText(/취득시 토지 기준시가 × 0\.3%/)).toBeTruthy();
    expect(screen.getByText(/취득시 건물기준시가 × 3%/)).toBeTruthy();
    expect(screen.queryByText(/취득시 토지 기준시가 × 3%/)).toBeNull();
  });

  it("D-2b 율 echo가 없는 옛 결과(이력)는 등기 3%로 떨어진다 — 종전과 같은 표시", () => {
    const gb = run();
    const legacy = {
      ...gb,
      estimatedDeduction: { ...gb.estimatedDeduction, landRate: undefined, buildingRate: undefined },
    };
    const { container } = render(
      <GeneralBuildingValuationDetailCard detail={legacy} totalTransferPrice={BASE.totalTransferPrice} />,
    );
    expect(container.textContent).toContain("취득시 토지 기준시가 × 3%");
    expect(container.textContent).not.toContain("× 0.3%");
  });

  it("D-3 두 축의 율이 다르면 섹션 제목에 하나의 율을 적지 않는다", () => {
    const { container } = render(
      <GeneralBuildingValuationDetailCard
        detail={run({ unregisteredLand: true })}
        totalTransferPrice={BASE.totalTransferPrice}
      />,
    );
    expect(container.textContent).toContain("개산공제 (시행령 §163⑥)");
    expect(container.textContent).not.toContain("§163⑥, 3%");
  });
});

describe("⑦ 상세명세서 산식 — 개산공제율 라벨", () => {
  it("D-4 토지 미등기 — 적힌 base × 적힌 율이 적힌 값을 만든다", () => {
    const gb = run({ unregisteredLand: true });
    const f = buildGbExpenseFormula(prop("land", gb.estimatedDeduction.land), gb);
    expect(f).toContain("× 0.3%");
    // 238,000,000 × 0.003 = 714,000 — 산식이 자기 값을 재현한다.
    expect(f).toContain("238,000,000");
    expect(f).toContain("714,000");
  });

  it("D-5 건물 미등기 — 건물 산식만 0.3%", () => {
    const gb = run({ unregisteredBuilding: true });
    const land = buildGbExpenseFormula(prop("land", gb.estimatedDeduction.land), gb);
    const bld = buildGbExpenseFormula(prop("building", gb.estimatedDeduction.building), gb);
    expect(land).toContain("× 3%");
    expect(bld).toContain("× 0.3%");
  });

  it("D-6 (긍정 짝) 등기 자산은 종전과 같이 「× 3%」", () => {
    const gb = run();
    expect(buildGbExpenseFormula(prop("land", gb.estimatedDeduction.land), gb)).toContain("× 3%");
    expect(buildGbExpenseFormula(prop("building", gb.estimatedDeduction.building), gb)).toContain("× 3%");
  });

  it("D-7 율 echo가 없는 옛 결과(이력)는 등기 3%로 떨어진다 — 종전과 같은 표시", () => {
    // IndexedDB 이력은 이 변경 **전에** 저장된 결과를 그대로 복원한다. 그 결과에는 율 echo가
    // 없으므로 fallback이 필요하다. 미등기로 떨어지면 등기 자산의 산식이 조용히 0.3%가 된다.
    const gb = run();
    const legacy = {
      ...gb,
      estimatedDeduction: { ...gb.estimatedDeduction, landRate: undefined, buildingRate: undefined },
    };
    const f = buildGbExpenseFormula(prop("land", gb.estimatedDeduction.land), legacy);
    expect(f).toContain("× 3%");
    expect(f).not.toContain("× 0.3%");
  });
});
