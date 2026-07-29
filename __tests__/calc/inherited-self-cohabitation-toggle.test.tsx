/**
 * §154⑧3호 상속주택 자체 양도 — 동일세대 통산 토글 노출 (통합 셸 CompanionAcqInheritanceBlock).
 * assetKind === "housing" 일 때만 동일세대 토글 노출 → ON 시 개시일 DateInput.
 * P2b 통합: props가 asset 스타일({ asset, onChange, transferDate })로 전환됨.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동 (feedback_rtl_manual_cleanup_required)

const noop = () => {};

function blockAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "2024-06-01",
    inheritanceStartDate: "2024-06-01",
    inheritanceAssetKind: "house_individual",
    decedentSameHouseholdBeforeInheritance: false,
    decedentCohabitationHoldingStartDate: "",
    decedentCohabitationResidenceMonths: "",
    ...overrides,
  };
}

const TOGGLE = /상속개시 당시 피상속인과 동일세대/;
const DATE_LABEL = /동일세대 거주·보유 개시일/;
const MONTHS_LABEL = /동일세대 통산 거주기간/;

describe("§154⑧3호 동일세대 통산 토글 (통합 셸)", () => {
  it("주택(housing) → 동일세대 토글 노출", () => {
    render(<CompanionAcqInheritanceBlock asset={blockAsset()} onChange={noop} />);
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("토지(land) → 토글 미노출 (§154⑧3호 주택 전용)", () => {
    render(<CompanionAcqInheritanceBlock asset={blockAsset({ assetKind: "land" })} onChange={noop} />);
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("일반건물(general_building) → 토글 미노출", () => {
    render(<CompanionAcqInheritanceBlock asset={blockAsset({ assetKind: "general_building" })} onChange={noop} />);
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("주택 + 토글 ON → 동일세대 거주·보유 개시일 DateInput 노출", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={blockAsset({ decedentSameHouseholdBeforeInheritance: true })}
        onChange={noop}
      />,
    );
    expect(screen.queryAllByText(DATE_LABEL).length).toBeGreaterThan(0);
  });

  it("주택 + 토글 OFF → 개시일 DateInput 미노출", () => {
    render(<CompanionAcqInheritanceBlock asset={blockAsset()} onChange={noop} />);
    expect(screen.queryByText(DATE_LABEL)).toBeNull();
  });

  it("주택 + 토글 ON → 동일세대 통산 거주기간(개월) 입력 노출", () => {
    render(
      <CompanionAcqInheritanceBlock
        asset={blockAsset({ decedentSameHouseholdBeforeInheritance: true })}
        onChange={noop}
      />,
    );
    expect(screen.queryAllByText(MONTHS_LABEL).length).toBeGreaterThan(0);
  });

  it("주택 + 토글 OFF → 통산 거주기간 입력 미노출", () => {
    render(<CompanionAcqInheritanceBlock asset={blockAsset()} onChange={noop} />);
    expect(screen.queryByText(MONTHS_LABEL)).toBeNull();
  });

  it("토글 OFF 전환 시 개시일·통산 거주기간 모두 초기화 패치", () => {
    const onChange = vi.fn();
    render(
      <CompanionAcqInheritanceBlock
        asset={blockAsset({
          decedentSameHouseholdBeforeInheritance: true,
          decedentCohabitationResidenceMonths: "24",
        })}
        onChange={onChange}
      />,
    );
    const sw = screen.getByRole("switch", { name: TOGGLE });
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        decedentCohabitationHoldingStartDate: "",
        decedentCohabitationResidenceMonths: "",
      }),
    );
  });
});
