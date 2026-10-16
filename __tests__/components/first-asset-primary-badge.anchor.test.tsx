/**
 * @vitest-environment jsdom
 *
 * 「주 자산」 판정은 카드 위치(index)로 한다 — 계획서 `docs/00-pm/first-asset-removal-primary-reindex.plan.md` §4-1.
 * 저장 필드 `isPrimaryForHouseholdFlags`는 첫 자산 삭제·옛 저장분에서 어긋날 수 있다(삭제 후 `[false, false]` 실측).
 * 어긋나면 첫 카드에서 배지가 사라지고, 첫 자산에서는 ④가 보내지 않는 「토지 세율 수동 지정」이 뜬다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const landAsset = (flag: boolean): AssetForm => ({
  ...makeDefaultAsset(2),
  assetKind: "land",
  acquisitionDate: "2015-03-01",
  isPrimaryForHouseholdFlags: flag,
});

function renderCard(index: number, asset: AssetForm) {
  return render(
    <CompanionAssetCard
      index={index}
      asset={asset}
      bundledSaleMode="actual"
      onChange={() => {}}
      transferDate="2024-03-01"
      splitMode="companion"
      onFractionalToggle={() => {}}
      hasSiblings
    />,
  );
}

describe("주 자산 배지 — index 판정", () => {
  it("B-1: 첫 카드는 저장 플래그가 false여도 「주 자산」 배지를 단다", () => {
    renderCard(0, landAsset(false));
    expect(screen.getByText("주 자산")).toBeTruthy();
  });

  it("B-2: 첫 카드 토지에는 컴패니언 전용 「토지 세율 수동 지정」을 띄우지 않는다", () => {
    renderCard(0, landAsset(false));
    expect(screen.queryByText("토지 세율 수동 지정")).toBeNull();
  });

  it("B-3: 둘째 카드는 저장 플래그가 true여도 배지가 없고, 토지면 수동 지정 토글이 뜬다", () => {
    renderCard(1, landAsset(true));
    expect(screen.queryByText("주 자산")).toBeNull();
    expect(screen.getByText("토지 세율 수동 지정")).toBeTruthy();
  });
});
