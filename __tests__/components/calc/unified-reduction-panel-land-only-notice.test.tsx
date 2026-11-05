/**
 * NH-08 — 토지만 본인 소유(소유자 분리) 카드에서 §99·§99의3을 고르면 계산 전에 불성립 안내를 보인다(선택은 막지 않는다).
 * 문구는 엔진 평가기와 같은 단일 소스(`landOnlyOwnerMessage`)다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { landOnlyOwnerMessage } from "@/lib/tax-engine/transfer-reductions/new-99-land-only-owner";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2003-09-01", ...over }) as AssetForm;
const renderPanel = (a: AssetForm) => render(<UnifiedReductionPanel asset={a} transferDate="2022-08-01" onChange={vi.fn()} />);

describe("NH-08 UI 안내", () => {
  it("land_only × §99의3 → 안내 표시 (엔진 문구와 동일)", () => {
    renderPanel(asset({ selfOwns: "land_only", reductions: [getReductionDefault("new_99_3")] as never }));
    expect(screen.getByTestId("land-only-owner-notice-new_99_3").textContent).toBe(landOnlyOwnerMessage("new_99_3"));
    expect(screen.queryByTestId("land-only-owner-notice-new_99")).toBeNull();
  });
  it("land_only × §99 → «확인 필요» 안내", () => {
    renderPanel(asset({ selfOwns: "land_only", acquisitionDate: "1999-01-01", reductions: [getReductionDefault("new_99")] as never }));
    expect(screen.getByTestId("land-only-owner-notice-new_99").textContent).toContain("확인 필요");
  });
  it.each(["both", "building_only"] as const)("%s → 안내 없음", (selfOwns) => {
    renderPanel(asset({ selfOwns, reductions: [getReductionDefault("new_99_3")] as never }));
    expect(screen.queryByTestId("land-only-owner-notice-new_99_3")).toBeNull();
  });
  it("land_only여도 감면을 고르지 않았으면 안내 없음", () => {
    renderPanel(asset({ selfOwns: "land_only", reductions: [] }));
    expect(screen.queryByTestId("land-only-owner-notice-new_99_3")).toBeNull();
  });
  it("토지 자산(소유자 분리 범위 밖)에 남은 land_only 잔재는 both로 읽어 안내 없음", () => {
    renderPanel(asset({ assetKind: "land", selfOwns: "land_only", reductions: [getReductionDefault("new_99_3")] as never }));
    expect(screen.queryByTestId("land-only-owner-notice-new_99_3")).toBeNull();
  });
});
