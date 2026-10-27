/**
 * anchor — 주택·건물 부담부증여 × 토지·건물 취득일 다름: ⑤ 파트 칸 (V-4 PR-B · 설계서 §5.2 · Q-2 a · Q-3 a)
 *
 * 설계서 `docs/00-pm/bg-house-building-split.design.md`. 화면이 묻는 칸 = ④가 싣는 칸 = ⑧이 요구하는 칸(3중 패턴).
 * 수정 前: 부담부증여 주택은 실지취득가액 총액 한 칸뿐이고 파트 칸·평가액 파트 칸이 없었다 · 토글 C는 켜면 「아직 계산하지 못합니다」.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { CarryoverDonorSplitToggle } from "@/components/calc/transfer/CarryoverDonorSplitToggle";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { AssetSectionTransfer } from "@/components/calc/transfer/asset-sections/AssetSectionTransfer";
import { bgAsset } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const fields = () => [...document.querySelectorAll("[data-field]")].map((e) => e.getAttribute("data-field"));
const own = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    acquisitionCause: "purchase", acquisitionDate: "2022-01-10", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2000-06-01",
    bgAcquisitionMethod: "actual", ...over,
  } as Partial<AssetForm>);
const drawBg = (a: AssetForm) => render(<BurdenedGiftBlock asset={a} onChange={vi.fn()} transferDate="2026-02-16" />);

describe("본인 취득 · 날짜 다름 — 부담부증여 블록", () => {
  it("시가 · K-4 → 토지·건물 실지취득가액 두 칸(총액 칸 없음) · 토지분·건물분 평가액 칸", () => {
    drawBg(own());
    const f = fields();
    expect(f).toEqual(expect.arrayContaining(["bgActualAcquisitionLand", "bgActualAcquisitionBuilding", "bgMarketValueLand", "bgMarketValueBuilding"]));
    expect(f).not.toContain("bgActualAcquisitionTotal");
  });

  it("기준시가 평가 → 양도시 토지·건물 기준시가 · 취득시 토지·건물 기준시가 칸(파트 A·취득가액 근거)", () => {
    drawBg(own({ bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" }));
    expect(fields()).toEqual(expect.arrayContaining(["standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer", "standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq"]));
    expect(fields()).not.toContain("bgMarketValueLand");
  });

  it("회귀 — 같은 날이면 종전대로 실지취득가액 총액 한 칸", () => {
    drawBg(own({ landAcquisitionDate: "2022-01-10" }));
    expect(fields()).toContain("bgActualAcquisitionTotal");
    expect(fields()).not.toContain("bgActualAcquisitionLand");
    expect(fields()).not.toContain("bgMarketValueLand");
  });
});

describe("이월과세 · 토글 C", () => {
  const carry = () =>
    bgAsset("converted", { donorBuilt: false }, {
      carryoverDonorSplit: true, bgAcquisitionMethod: "actual",
      carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01" },
    } as Partial<AssetForm>);

  it("토글을 켜도 「아직 계산하지 못합니다」가 없다", () => {
    render(<CarryoverDonorSplitToggle asset={carry()} onChange={vi.fn()} />);
    expect(screen.queryByTestId("carryover-donor-split-bg-blocked")).toBeNull();
  });

  it("이월과세 블록 — 「토지분 증여자 취득일」 + 「건물분 증여자 취득일」 · 당초 증여자 토지·건물 실지취득가액", () => {
    render(<CarryoverGiftBlock asset={carry()} transferDate="2026-02-16" onChange={vi.fn()} />);
    expect(fields()).toContain("buildingCarryover.donorAcquisitionDate");
    expect(screen.getByText("토지분 증여자 취득일")).toBeTruthy();
    cleanup();
    drawBg(carry());
    expect(fields()).toEqual(expect.arrayContaining(["bgCoDonorActualAcquisitionLand", "bgCoDonorActualAcquisitionBuilding", "bgActualAcquisitionLand", "bgActualAcquisitionBuilding"]));
    expect(fields()).not.toContain("bgCoDonorActualAcquisitionTotal");
  });

  it("함께 양도 둘째 자산 — 토글 C 저장값이 남아도 꺼진 것으로 그린다(④와 같다 · 2026-10-27 실측 회귀)", () => {
    render(<CarryoverGiftBlock asset={carry()} transferDate="2026-02-16" onChange={vi.fn()} isNonPrimaryAsset hasCompanions />);
    expect(fields()).not.toContain("buildingCarryover.donorAcquisitionDate");
    cleanup();
    render(<TransferModeBlock asset={carry()} onChange={vi.fn()} transferDate="2026-02-16" isCompanionBundle isNonPrimaryAsset />);
    expect(fields()).toEqual(expect.arrayContaining(["bgActualAcquisitionTotal", "bgCoDonorActualAcquisitionTotal"]));
    expect(fields()).not.toContain("bgCoDonorActualAcquisitionLand");
    cleanup();
    // 자산 카드 — 첫 자산 여부(`isPrimary`)를 부담부증여 블록까지 내려보낸다.
    const card = (isPrimary: boolean) =>
      render(<AssetSectionTransfer asset={carry()} onChange={vi.fn()} bundledSaleMode="actual" transferDate="2026-02-16" isCompanionBundle isPrimary={isPrimary} />);
    card(false);
    expect(fields()).toContain("bgCoDonorActualAcquisitionTotal");
    cleanup();
    card(true);
    expect(fields()).not.toContain("bgCoDonorActualAcquisitionTotal");
  });
});
