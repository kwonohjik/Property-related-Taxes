/**
 * anchor — 부담부증여 × 이월과세: 이월과세 블록에 「증여자 취득가액」·「증여자 취득원인」 칸이 없다(일반건물 V-3과 같은 규칙을 부담부증여 전체로)
 *
 * 당초 증여자의 취득 당시 값은 「이월과세 — 「당초 증여자」 취득 당시 값」 블록이 정본이다(④·엔진 `carryoverDonorBasis`).
 * 수정 前: 주택·건물·토지·상업용건물 부담부증여는 이 칸을 그리고 ⑧이 요구했지만 결정세액은 그대로였다(2026-10-27 실측).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { bgAsset } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const fields = () => [...document.querySelectorAll("[data-field]")].map((e) => e.getAttribute("data-field"));
const asset = (over: Partial<AssetForm> = {}) =>
  bgAsset("converted", { donorBuilt: false }, {
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01" },
    ...over,
  } as Partial<AssetForm>);
const draw = (a: AssetForm) => render(<CarryoverGiftBlock asset={a} transferDate="2026-02-16" onChange={vi.fn()} />);

describe("부담부증여 — 증여자 취득가액 칸 대신 안내", () => {
  it.each(["housing", "building", "land", "commercial_building"])("%s", (kind) => {
    draw(asset({ assetKind: kind } as Partial<AssetForm>));
    expect(fields()).not.toContain("carryover.donorAcquisitionPrice");
    expect(screen.getByTestId("gb-bg-donor-basis-elsewhere")).toBeTruthy();
    expect(screen.queryByText("증여자 취득원인")).toBeNull();
  });

  it("환산취득가 사용이 남아 켜져 있으면 토글은 보인다 — 끌 유일한 경로(⑧이 막는다)", () => {
    draw(asset({ carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", useEstimatedAcquisition: true } } as Partial<AssetForm>));
    expect(screen.getByText("환산취득가 사용")).toBeTruthy();
    cleanup();
    draw(asset());
    expect(screen.queryByText("환산취득가 사용")).toBeNull();
  });
});

describe("회귀 — 일반 양도는 종전대로", () => {
  it("주택 이월과세 — 증여자 취득가액 칸 · 취득원인 · 환산 토글", () => {
    draw(asset({ transferType: "normal" } as Partial<AssetForm>));
    expect(fields()).toContain("carryover.donorAcquisitionPrice");
    expect(screen.queryByTestId("gb-bg-donor-basis-elsewhere")).toBeNull();
    expect(screen.getByText("증여자 취득원인")).toBeTruthy();
    expect(screen.getByText("환산취득가 사용")).toBeTruthy();
  });
});
