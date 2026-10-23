/**
 * @vitest-environment jsdom
 *
 * 일반건물 지분 분할(축 B) — 최초공시(§99-164-10) 토글의 노출 축 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-share-mode-mix-and-inherited-estimate-guard.plan.md` S-1 §4.
 * 최초공시는 물건 사건이라 주 자산 카드에서 한 번 받고 ④가 전 지분에 복사한다. ④는 환산 지분에만 싣는다 ⇒
 * 토글은 「환산 지분이 하나라도 있으면」 주 자산 카드에 열린다. 종전: 주 자산이 실가면 지분 2가 환산이어도 칸이 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const TITLE = "주택으로 최초공시 후 상가로 용도변경 (환산취득가)";
const gb = (n: number, over: Partial<AssetForm>) =>
  ({
    ...makeDefaultAsset(n),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    acquisitionDate: "2010-05-01",
    gbLandArea: "205",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "135",
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    ...over,
  }) as AssetForm;
const ACTUAL = { useEstimatedAcquisition: false, fixedAcquisitionPrice: "600000000" };
const EST = { useEstimatedAcquisition: true };

function renderPrimary(primary: AssetForm, fractionalShares?: AssetForm[]) {
  render(<GeneralBuildingBlock asset={primary} onChange={() => {}} transferDate="2026-02-16" fractionalShares={fractionalShares} />);
}

describe("최초공시 토글 — 주 자산 카드", () => {
  it("🔴 주 자산 실가 + 지분 2 환산 → 토글이 뜬다(종전: 없음)", () => {
    const primary = gb(1, ACTUAL);
    renderPrimary(primary, [primary, gb(2, EST)]);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it("전 지분 실가 → 토글 없음", () => {
    const primary = gb(1, ACTUAL);
    renderPrimary(primary, [primary, gb(2, ACTUAL)]);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("지분 분할이 아니면(지분 목록 없음) 이 자산의 산정방식만 본다 — 종전과 같다", () => {
    renderPrimary(gb(1, ACTUAL));
    expect(screen.queryByText(TITLE)).toBeNull();
    cleanup();
    renderPrimary(gb(1, EST));
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it("둘째 이후 지분 카드에는 지분 목록이 와도 뜨지 않는다(물건 사건은 주 자산에서만)", () => {
    const second = gb(2, EST);
    render(<GeneralBuildingBlock asset={second} onChange={() => {}} transferDate="2026-02-16" shareAcquisitionOnly fractionalShares={[gb(1, ACTUAL), second]} />);
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

describe("배선 — 자산 목록(Step1) → 주 자산 카드", () => {
  const renderSection = (assets: AssetForm[], splitMode: "fractional" | "companion") =>
    render(
      <CompanionAssetsSection
        assets={assets}
        bundledSaleMode="actual"
        onChange={() => {}}
        transferDate="2026-02-16"
        splitMode={splitMode}
        onFractionalToggle={() => {}}
      />,
    );

  it("🔴 지분 분할 · 주 자산 실가 + 지분 2 환산 → 화면에 토글 하나(주 자산 카드)", () => {
    renderSection([gb(1, ACTUAL), gb(2, EST)], "fractional");
    expect(screen.getAllByText(TITLE)).toHaveLength(1);
  });

  it("함께 양도(지분 분할 아님)면 자산마다 자기 산정방식 — 환산인 자산 2 카드에만", () => {
    renderSection([gb(1, ACTUAL), gb(2, EST)], "companion");
    expect(screen.getAllByText(TITLE)).toHaveLength(1);
  });
});
