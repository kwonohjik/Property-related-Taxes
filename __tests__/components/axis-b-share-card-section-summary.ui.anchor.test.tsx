/**
 * @vitest-environment jsdom
 *
 * 축 B 둘째 지분 카드의 섹션 요약은 ③ 섹션이 렌더하는 값(첫 카드 자산 종류)으로 만든다 — 계획서 `docs/00-pm/sidebar-axis-b-share-asset-kind.plan.md` S2.
 * 종전에는 저장값 «주택»으로 요약해, 첫 카드가 토지·분양권이어도 내용 없는 ⑤ 「기타 특례 — 장기임대 거주주택 특례」 섹션이 떴다(브라우저 실측).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const sibling: AssetForm = { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-01-02" };

function renderSibling(kind: AssetForm["assetKind"], splitMode: "fractional" | "companion" = "fractional") {
  return render(
    <CompanionAssetCard
      index={1}
      asset={sibling}
      primaryAsset={{ ...makeDefaultAsset(1), assetKind: kind, acquisitionDate: "2014-01-02" }}
      bundledSaleMode="actual"
      onChange={() => {}}
      transferDate="2026-02-16"
      splitMode={splitMode}
      onFractionalToggle={() => {}}
      hasSiblings
    />,
  );
}

describe("축 B 둘째 지분 카드 — 섹션 요약은 첫 카드 자산 종류", () => {
  it("AC-1 ★ 첫 카드가 토지·분양권이면 ⑤ 「장기임대 거주주택 특례」 섹션이 없다", () => {
    for (const kind of ["land", "presale_right"] as const) {
      renderSibling(kind);
      expect(screen.queryByText("장기임대 거주주택 특례"), kind).toBeNull();
      cleanup();
    }
  });

  it("AC-2 짝 — 첫 카드가 주택이면 그대로 있다", () => {
    renderSibling("housing");
    expect(screen.getByText("장기임대 거주주택 특례")).toBeTruthy();
  });

  it("AC-3 ③ 칩 — 일반건물(전용 블록 자산)은 산정방식 없이 원인만", () => {
    renderSibling("general_building");
    expect(screen.getAllByText("매매").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^매매 · /)).toBeNull();
  });

  it("AC-4 부정 짝 — 함께 양도(다른 물건)는 자기 저장값(주택)으로 요약한다", () => {
    renderSibling("land", "companion");
    expect(screen.getByText("장기임대 거주주택 특례")).toBeTruthy();
  });
});
