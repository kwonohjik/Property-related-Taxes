/**
 * anchor(⑤) — 부담부증여 주택·건물의 토글 C(당초 증여자가 토지·건물을 다른 날 취득) (V-4 PR-1 · Q-1 a)
 *
 * 계획서 `docs/00-pm/bg-carryover-non-gb-building-date.plan.md` §4.1.
 * 수정 前: 부담부증여면 토글을 켤 수 없고(끌 수만), 저장값 ON은 「자산 전체를 하나의 증여자 취득으로 계산합니다」로 조용히 무시됐다.
 * 수정 後: 켤 수 있고, 켜면 ⑧이 막는다는 사실을 토글 아래에 바로 알린다. 부담부증여 분리 안내(`split-burdened-note`)도 실제 동작대로 고친다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CarryoverDonorSplitToggle } from "@/components/calc/transfer/CarryoverDonorSplitToggle";
import { LandBuildingSaleSplitSection } from "@/components/calc/transfer/LandBuildingSaleSplitSection";
import { bgAsset } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const carry = (over: Partial<AssetForm> = {}) => bgAsset("converted", { donorBuilt: false }, over);

describe("토글 C — 부담부증여", () => {
  it("꺼져 있어도 켤 수 있다(잠금 해제)", () => {
    const onChange = vi.fn();
    render(<CarryoverDonorSplitToggle asset={carry()} onChange={onChange} />);
    expect(screen.getByTestId("carryover-donor-split-toggle").getAttribute("data-disabled")).toBeNull();
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ carryoverDonorSplit: true });
  });
  it("켜져 있으면 「아직 계산하지 못합니다」 안내 · 「이월과세로 계산합니다」(조용한 무시) 문구는 없다", () => {
    render(<CarryoverDonorSplitToggle asset={carry({ carryoverDonorSplit: true } as Partial<AssetForm>)} onChange={() => {}} />);
    expect(screen.getByTestId("carryover-donor-split-bg-blocked").textContent).toContain("아직 계산하지 못합니다");
    expect(screen.queryByTestId("carryover-donor-split-inactive")).toBeNull();
  });
  it("회귀 — 소유자 분리는 종전대로 잠금", () => {
    render(<CarryoverDonorSplitToggle asset={carry({ selfOwns: "building_only" } as Partial<AssetForm>)} onChange={() => {}} />);
    expect(screen.getByTestId("carryover-donor-split-toggle").getAttribute("data-disabled")).toBe("true");
  });
});

describe("부담부증여 분리 안내", () => {
  it("「기준시가 비율로 안분됩니다」(실제로는 나눠 계산하지 않는다) 대신 취득일이 다르면 계산하지 못한다고 알린다", () => {
    render(<LandBuildingSaleSplitSection {...({ isBurdenedGift: true } as never)} />);
    const note = screen.getByTestId("split-burdened-note").textContent ?? "";
    expect(note).not.toContain("기준시가 비율로 안분");
    expect(note).toContain("아직 계산하지 못합니다");
  });
});
