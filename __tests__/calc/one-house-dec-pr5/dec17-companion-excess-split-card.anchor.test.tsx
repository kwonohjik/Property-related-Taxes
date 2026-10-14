/**
 * #17-1 ⑤ — 함께 양도 주택 카드(컴패니언)에도 배율 초과분 분리 입력 카드(기준시가 5칸)가 같은 술어로 뜬다.
 * 종전에는 `isFirst`(주 자산) 게이트로 컴패니언 주택 카드에는 카드가 없었다 — ⑧이 5칸을 요구하는데 칸이 없는 막다른 길을 만들지 않으려면 ⑤⑧④가 같은 술어여야 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAssetsSection } from "@/components/calc/transfer/CompanionAssetsSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const HOUSE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  areaScenario: "same",
  acquisitionArea: "250",
  transferArea: "250",
};
const mk = (n: number, over: Partial<AssetForm> = {}) => ({ ...makeDefaultAsset(n), ...HOUSE, ...over }) as AssetForm;

function renderSection(assets: AssetForm[]) {
  return render(
    <CompanionAssetsSection
      assets={assets}
      bundledSaleMode="actual"
      onChange={() => {}}
      transferDate="2026-02-16"
      splitMode="companion"
      onFractionalToggle={() => {}}
    />,
  );
}

describe("#17-1 컴패니언 주택 카드 — 배율 초과분 분리 카드 노출", () => {
  it("🔑 주 자산(한도 이내) + 컴패니언 주택(초과 200㎡) → 카드가 컴패니언 하나에만 뜬다 (수정 전: 0개)", () => {
    renderSection([mk(1), mk(2, { acquisitionArea: "500", transferArea: "500" })]);
    expect(screen.getAllByTestId("housing-excess-split-card")).toHaveLength(1);
  });

  it("주 자산·컴패니언 모두 초과면 카드가 둘 — 주 자산 판정은 종전과 같다", () => {
    renderSection([mk(1, { acquisitionArea: "500", transferArea: "500" }), mk(2, { acquisitionArea: "500", transferArea: "500" })]);
    expect(screen.getAllByTestId("housing-excess-split-card")).toHaveLength(2);
  });

  it("대조 — 컴패니언이 한도 이내거나 범위 밖(1990-08-30 전 취득)이면 카드가 없다", () => {
    renderSection([mk(1), mk(2)]);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
    cleanup();
    renderSection([mk(1), mk(2, { acquisitionArea: "500", transferArea: "500", acquisitionDate: "1989-06-01" })]);
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });
});
