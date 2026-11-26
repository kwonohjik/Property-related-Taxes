/**
 * 지분 × 가업상속공제 화면 — ⑤ 안내·확인 토글·환산 표·미리보기, ⑦ 결과 카드 지분 캡션·번들 고지 (transfer-fb-share UI 계획 §4.2·§4.7)
 * 미리보기 = 엔진 = 결과 카드: 교재 × 지분 1/2 → 지분분 250,000,000 / 750,000,000 · 의제 400,000,000 (엔진 계획서 §3.4 손계산).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { FamilyBusinessInheritanceTransferSection } from "@/components/calc/transfer/FamilyBusinessInheritanceTransferSection";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { FamilyBusinessCgtDetail } from "@/lib/tax-engine/transfer-tax-family-business";

afterEach(cleanup);

const FB = {
  decedentAcquisitionPrice: 500_000_000,
  inheritanceMarketValue: 1_500_000_000,
  fbDeductionAppliedRate: 0.7,
  inheritanceDate: "2022-04-10",
  fbRateBasis: { kind: "deduction_ratio" as const, deductionAmount: 700_000_000, businessEstateValue: 1_000_000_000 },
};
const asset = (share: boolean, confirmed = false): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "land",
    acquisitionCause: "inheritance",
    acquisitionDate: "2022-04-10",
    ...(share ? { ownershipNumerator: "1", ownershipDenominator: "2" } : {}),
    fbShareBasisConfirmed: confirmed,
    familyBusinessInheritance: FB,
  }) as unknown as AssetForm;

describe("⑤ 지분 블록", () => {
  it("지분 1/2 — 안내·확인 토글·환산 표 · 라벨 «물건 전체 기준» · 미리보기는 지분분 400,000,000", () => {
    render(<FamilyBusinessInheritanceTransferSection asset={asset(true)} onChange={vi.fn()} transferDate="2026-10-15" />);
    expect(screen.getByTestId("fb-share-basis")).toBeInTheDocument();
    expect(screen.getByTestId("fb-share-scale-decedent").textContent).toContain("500,000,000 × 50% = 250,000,000");
    expect(screen.getByTestId("fb-share-scale-market").textContent).toContain("1,500,000,000 × 50% = 750,000,000");
    expect(screen.queryByTestId("fb-share-scale-capex")).toBeNull();
    expect(screen.getByText("피상속인 원취득가액 (원) — 물건 전체 기준")).toBeInTheDocument();
    expect(screen.getByText(/내 지분 50% 분/)).toBeInTheDocument();
    expect(screen.getByText("400,000,000")).toBeInTheDocument();
  });
  it("확인 토글 — onChange로 fbShareBasisConfirmed를 직접 쓴다", () => {
    const onChange = vi.fn();
    render(<FamilyBusinessInheritanceTransferSection asset={asset(true)} onChange={onChange} transferDate="2026-10-15" />);
    fireEvent.click(within(screen.getByTestId("fb-share-basis-confirm")).getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ fbShareBasisConfirmed: true });
  });
  it("100% — 지분 블록 없음 · 미리보기 800,000,000(회귀 0)", () => {
    render(<FamilyBusinessInheritanceTransferSection asset={asset(false)} onChange={vi.fn()} transferDate="2026-10-15" />);
    expect(screen.queryByTestId("fb-share-basis")).toBeNull();
    expect(screen.getByText("피상속인 원취득가액 (원)")).toBeInTheDocument();
    expect(screen.getByText("800,000,000")).toBeInTheDocument();
  });
});

const detail = (share: boolean): FamilyBusinessCgtDetail => ({
  imputedAcquisitionPrice: share ? 400_000_000 : 800_000_000,
  cgtUnderSection97_2_4: 115_980_000,
  cgtUnderSection97: 20_540_000,
  creditAmount: 95_440_000,
  appliedRate: 0.7,
  appliedRateBasis: FB.fbRateBasis,
  decedentAcquisitionPrice: share ? 250_000_000 : 500_000_000,
  inheritanceMarketValue: share ? 750_000_000 : 1_500_000_000,
  ...(share ? { ownershipRatio: 0.5, wholeInput: { decedentAcquisitionPrice: 500_000_000, inheritanceMarketValue: 1_500_000_000 } } : {}),
});

describe("⑦ 결과 카드", () => {
  it("지분 echo — 캡션 · 행 «물건 전체 × 지분» · 값은 지분분", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(true)} />);
    expect(screen.getByTestId("fb-share-caption").textContent).toContain("내 지분 50% 기준");
    expect(screen.getByText("피상속인 원취득가액 (물건 전체 500,000,000 × 지분 50%)")).toBeInTheDocument();
    expect(screen.getByText("상속개시일 자산 평가액 (물건 전체 1,500,000,000 × 지분 50%)")).toBeInTheDocument();
    expect(screen.getByText("250,000,000")).toBeInTheDocument();
    expect(screen.queryByTestId("fb-bundled-credit-note")).toBeNull();
  });
  it("100% — 캡션·접미 없음", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(false)} />);
    expect(screen.queryByTestId("fb-share-caption")).toBeNull();
    expect(screen.getByText("피상속인 원취득가액")).toBeInTheDocument();
  });
  it("번들 — 자산 라벨 · «단독으로 본 공제액» 확인 필요 한 줄", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detail(true)} itemLabel="자산 2" bundled />);
    expect(screen.getByText("자산 2")).toBeInTheDocument();
    expect(screen.getByTestId("fb-bundled-credit-note").textContent).toContain("확인 필요");
  });
});
