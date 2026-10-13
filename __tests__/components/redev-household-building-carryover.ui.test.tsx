/** @vitest-environment jsdom */
/**
 * #12 ⑤ — 세대원 건물 출자 통산 칸. 노출 게이트(④·⑧과 같은 술어 `householdBuildingCarryoverInScope`) ·
 * 토글 ON/OFF가 보내는 patch(OFF는 취득일·거주 개월을 함께 비운다 — 남은 값이 엔진에 닿지 않게) · 입력 반영.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TITLE = "같은 세대의 세대원이 철거된 기존 건물을 소유했다";
const has = (c: HTMLElement, text: string) => (c.textContent ?? "").includes(text);

function apt(o: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionDate: "2007-02-01",
    redevApprovalDate: "2014-01-23",
    redevSettlementDirection: "pay",
    redevOriginalAssetType: "land",
    redevIsSuccessorMember: "no",
    ...o,
  };
}

describe("#12 ⑤ — 세대원 건물 출자 통산 칸의 노출 게이트", () => {
  it("🔑 토지 출자 + 원조합원 완공APT — 토글이 뜬다(OFF라 세부 칸은 닫혀 있다)", () => {
    const { container } = render(<RedevelopmentBlock asset={apt()} onChange={() => {}} isOneHouseSingle={true} />);
    expect(has(container, TITLE)).toBe(true);
    expect(screen.queryByTestId("redev-household-building-carryover")).not.toBeNull();
  });

  it("부정 짝 — 주택 출자 · 입주권 · 청산금 단독신고 · 승계조합원에는 없다", () => {
    for (const o of [
      { redevOriginalAssetType: "housing" as const },
      { assetKind: "right_to_move_in" as const, redevSubject: "right" as const },
      { redevSettlementDirection: "receive" as const, redevReceiveOnlyMode: "yes" as const, redevSettlementSaleDate: "2024-06-01" },
      { redevIsSuccessorMember: "yes" as const },
    ]) {
      const { container, unmount } = render(<RedevelopmentBlock asset={apt(o)} onChange={() => {}} isOneHouseSingle={true} />);
      expect(has(container, TITLE)).toBe(false);
      unmount();
    }
  });
});

describe("#12 ⑤ — 토글과 입력", () => {
  it("ON이면 취득일·거주 개월 칸이 열린다 · 값이 칸에 반영된다", () => {
    const { container } = render(
      <RedevelopmentBlock
        asset={apt({ redevHouseholdBuildingCarryover: "yes", redevHouseholdBuildingAcquisitionDate: "2010-05-01", redevHouseholdBuildingResidenceMonths: "36" })}
        onChange={() => {}}
        isOneHouseSingle={true}
      />,
    );
    expect(has(container, "세대원이 기존 건물을 취득한 날")).toBe(true);
    expect(has(container, "기존 건물에서 세대가 거주한 기간")).toBe(true);
    expect(screen.getAllByDisplayValue("2010").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("36")).not.toBeNull();
  });

  it("켜면 선언만 보낸다 · 끄면 취득일·거주 개월을 함께 비운다(남은 값이 엔진에 닿지 않게)", () => {
    const onChange = vi.fn();
    const { rerender } = render(<RedevelopmentBlock asset={apt()} onChange={onChange} isOneHouseSingle={true} />);
    const toggle = () => screen.getByTestId("redev-household-building-carryover").querySelector('[role="switch"], input[type="checkbox"], button') as HTMLElement;
    fireEvent.click(toggle());
    expect(onChange).toHaveBeenLastCalledWith({ redevHouseholdBuildingCarryover: "yes" });

    rerender(
      <RedevelopmentBlock
        asset={apt({ redevHouseholdBuildingCarryover: "yes", redevHouseholdBuildingAcquisitionDate: "2010-05-01", redevHouseholdBuildingResidenceMonths: "36" })}
        onChange={onChange}
        isOneHouseSingle={true}
      />,
    );
    fireEvent.click(toggle());
    expect(onChange).toHaveBeenLastCalledWith({
      redevHouseholdBuildingCarryover: "",
      redevHouseholdBuildingAcquisitionDate: "",
      redevHouseholdBuildingResidenceMonths: "",
    });
  });
});
