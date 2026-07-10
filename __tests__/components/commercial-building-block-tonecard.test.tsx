/**
 * anchor: CommercialBuildingBlock — 인라인 섹션카드 4개(①sky ②emerald ③④amber) → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 2호. noDark: 원래 light 전용 → dark 미도입, 양 모드 class-equivalent.
 *   /70·100/60 서브박스(불투명도 다름)는 인라인 유지. (#560 prefill 변경과 무충돌)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CommercialBuildingBlock } from "../../components/calc/transfer/CommercialBuildingBlock";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

function renderBlock(era: "pre_disclosure" | "post_disclosure" = "post_disclosure") {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building" as const,
    useEstimatedAcquisition: true,
    cbEra: era,
  };
  return render(
    <CommercialBuildingBlock asset={asset} transferDate="2025-01-01" onChange={() => {}} />,
  );
}

describe("CommercialBuildingBlock — 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("섹션 제목·배지가 톤별로 렌더 (①sky ②emerald ③amber)", () => {
    const { getByText } = renderBlock("pre_disclosure");
    expect(getByText("면적 정보 (㎡)").className).toContain("text-sky-700");
    expect(getByText("호별 ㎡당 고시가 (원/㎡)").className).toContain("text-emerald-700");
    expect(getByText("건물 기준시가 — 3시점 (원, 총액)").className).toContain("text-amber-700");
    expect(getByText("1").className).toContain("bg-sky-200");
    expect(getByText("2").className).toContain("bg-emerald-200");
  });

  it("① 섹션카드 sky light 클래스 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const badge = renderBlock().getByText("1");
    expect(badge.className).not.toContain("dark:");
    const card = badge.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("④ pre_disclosure = 3시점 라벨 (동적 title)", () => {
    expect(renderBlock("pre_disclosure").getByText(/개별공시지가 — 3시점/)).toBeTruthy();
  });
  it("④ post_disclosure = 2시점 라벨 (동적 title)", () => {
    expect(renderBlock("post_disclosure").getByText(/개별공시지가 — 2시점/)).toBeTruthy();
  });
});
