/**
 * §154⑧3호 상속주택 자체 양도 — 동일세대 통산 토글 노출 (Tier 2-B UI).
 * CompanionAcqInheritanceBlock: assetKind === "housing" 일 때만 동일세대 토글 노출 → ON 시 개시일 DateInput.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";

afterEach(cleanup); // RTL 자동 cleanup 미설정 — 수동 (feedback_rtl_manual_cleanup_required)

const noop = () => {};

function blockProps(overrides: Record<string, unknown> = {}) {
  return {
    assetId: "a1",
    acquisitionDate: "2024-06-01",
    onAcquisitionDateChange: noop,
    decedentAcquisitionDate: "",
    onDecedentAcquisitionDateChange: noop,
    assetKind: "housing",
    decedentSameHouseholdBeforeInheritance: false,
    onDecedentSameHouseholdBeforeInheritanceChange: noop,
    decedentCohabitationHoldingStartDate: "",
    onDecedentCohabitationHoldingStartDateChange: noop,
    valuationMode: "manual" as const,
    onValuationModeChange: noop,
    inheritanceAssetKind: "house_individual" as const,
    onInheritanceAssetKindChange: noop,
    inheritanceDate: "2024-06-01",
    onInheritanceDateChange: noop,
    landAreaM2: "",
    publishedValueAtInheritance: "",
    onPublishedValueAtInheritanceChange: noop,
    fixedAcquisitionPrice: "",
    onFixedAcquisitionPriceChange: noop,
    ...overrides,
  };
}

const TOGGLE = /상속개시 당시 피상속인과 동일세대/;
const DATE_LABEL = /동일세대 거주·보유 개시일/;

describe("§154⑧3호 동일세대 통산 토글", () => {
  it("주택(housing) → 동일세대 토글 노출", () => {
    render(<CompanionAcqInheritanceBlock {...blockProps()} />);
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("토지(land) → 토글 미노출 (§154⑧3호 주택 전용)", () => {
    render(<CompanionAcqInheritanceBlock {...blockProps({ assetKind: "land" })} />);
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("일반건물(general_building) → 토글 미노출", () => {
    render(
      <CompanionAcqInheritanceBlock {...blockProps({ assetKind: "general_building" })} />,
    );
    expect(screen.queryByText(TOGGLE)).toBeNull();
  });

  it("주택 + 토글 ON → 동일세대 거주·보유 개시일 DateInput 노출", () => {
    render(
      <CompanionAcqInheritanceBlock
        {...blockProps({ decedentSameHouseholdBeforeInheritance: true })}
      />,
    );
    expect(screen.queryAllByText(DATE_LABEL).length).toBeGreaterThan(0);
  });

  it("주택 + 토글 OFF → 개시일 DateInput 미노출", () => {
    render(<CompanionAcqInheritanceBlock {...blockProps()} />);
    expect(screen.queryByText(DATE_LABEL)).toBeNull();
  });

  it("토글 OFF 전환 시 개시일 초기화 콜백 호출", () => {
    let cleared = false;
    render(
      <CompanionAcqInheritanceBlock
        {...blockProps({
          decedentSameHouseholdBeforeInheritance: true,
          onDecedentCohabitationHoldingStartDateChange: (v: string) => {
            if (v === "") cleared = true;
          },
        })}
      />,
    );
    const sw = screen.getByRole("switch", { name: TOGGLE });
    fireEvent.click(sw);
    expect(cleared).toBe(true);
  });
});
