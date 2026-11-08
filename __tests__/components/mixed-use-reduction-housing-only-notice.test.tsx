/**
 * 겸용주택 감면 패널 안내 — 주택분 차감 조문(§99·§99의3·§98의3~§98의8)을 고르면 기준시가를 「주택부분 + 부수토지」로 넣으라고 알린다
 * (A1 · §99 리뷰 NH-33 · §98 시리즈 리뷰 US-13 · Q-14 (a)). 일반 주택이나 계산하지 않는 조문이면 띄우지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { UnifiedReductionPanel } from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const asset = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2009-08-01", ...over }) as AssetForm;
const shown = (a: AssetForm) => {
  render(<UnifiedReductionPanel asset={a} transferDate="2022-02-16" onChange={() => {}} />);
  return screen.queryByTestId("mixed-use-reduction-housing-only-notice") !== null;
};

describe("겸용 감면 패널 — 주택부분 기준시가 안내", () => {
  it("겸용 + §98의3 → 안내", () => {
    expect(shown(asset({ isMixedUseHouse: true, reductions: [getReductionDefault("unsold_98_3")] as never }))).toBe(true);
  });
  it("겸용 + §99의3 → 안내(NH-33과 같은 규약)", () => {
    expect(shown(asset({ isMixedUseHouse: true, reductions: [getReductionDefault("new_99_3")] as never }))).toBe(true);
  });
  it("겸용 + §98(세율 특칙 — 계산하지 않음) → 안내 없음", () => {
    expect(shown(asset({ isMixedUseHouse: true, reductions: [getReductionDefault("unsold_98")] as never }))).toBe(false);
  });
  it("일반 주택 + §98의3 → 안내 없음", () => {
    expect(shown(asset({ isMixedUseHouse: false, reductions: [getReductionDefault("unsold_98_3")] as never }))).toBe(false);
  });
});
