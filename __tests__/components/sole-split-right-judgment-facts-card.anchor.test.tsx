/**
 * @vitest-environment jsdom
 *
 * SC-8 — 지분 분할(축 B) 둘째 카드의 「판정 메뉴에서 넘겨받은 사실」 요약은 **첫 카드 선언**을 보여 준다.
 * ④가 같은 함수(`soleSplitRightJudgmentFacts`)로 첫 카드 값을 보내므로, 화면이 둘째 카드 자기 칸(빈 값)을 보여 주면
 * 엔진 값과 화면이 갈린다. (접힌 섹션 본문도 `hidden`으로 마운트돼 있어 펼치지 않고 조회한다.) 계획서 `docs/00-pm/second-share-card-redev-judgment-facts-copy.plan.md` §2.1.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const primary: AssetForm = {
  ...makeDefaultAsset(1),
  assetKind: "right_to_move_in",
  redevSubject: "right",
  acquisitionDate: "2008-01-01",
  redevExemptionEligibleAtApproval: "yes",
  redevPriorHouseResidenceMonths: "36",
};
// 지분 토글이 만드는 둘째 카드 — 저장 자산 종류는 기본값, 판정 선언은 빈 값.
const sibling: AssetForm = { ...makeDefaultAsset(2), redevSubject: "right", acquisitionDate: "2008-01-01" };

function renderSibling(splitMode: "fractional" | "companion", asset: AssetForm = sibling) {
  return render(
    <CompanionAssetCard
      index={1}
      asset={asset}
      primaryAsset={primary}
      bundledSaleMode="actual"
      onChange={() => {}}
      transferDate="2024-06-01"
      splitMode={splitMode}
      onFractionalToggle={() => {}}
      hasSiblings
    />,
  );
}

describe("SC-8 축 B 둘째 카드 — 입주권 판정 선언 요약", () => {
  it("첫 카드의 「충족 선언」과 거주월수를 보여 준다", () => {
    renderSibling("fractional");
    const facts = screen.getByTestId("imported-redev-right-facts");
    expect(within(facts).getByText("충족 선언")).toBeTruthy();
    expect(facts.textContent).toContain("36");
  });

  it("부정 — 함께 양도(다른 물건 입주권)는 덮지 않는다: 둘째 카드 자기 값(빈 값)이라 요약이 없다", () => {
    renderSibling("companion", { ...sibling, assetKind: "right_to_move_in" });
    expect(screen.getByTestId("redev-right-calc-card")).toBeTruthy();
    expect(screen.queryByTestId("imported-redev-right-facts")).toBeNull();
  });
});
