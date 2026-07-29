/**
 * anchor: GeneralBuildingBlock — 인라인 섹션카드 4개(①sky ②emerald ③amber ④rose)
 *   → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 점진 채택 5호(건물 파트 재개).
 *   ③④ 헤더의 법조문 모달·§ 배지는 titleExtra prop으로 보존. dark:0 → noDark.
 *   /50-60·100/60 서브박스는 인라인 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

function renderBlock() {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    useEstimatedAcquisition: true, // ③ 취득시 기준시가 노출
  };
  return render(<GeneralBuildingBlock asset={asset} onChange={() => {}} transferDate="2025-01-01" />);
}

describe("GeneralBuildingBlock — 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("①②③④ 섹션 제목이 톤별로 렌더 + ④ titleExtra(§ 배지) 보존", () => {
    const { getByText } = renderBlock();
    expect(getByText("면적·규모").className).toContain("text-sky-700");
    expect(getByText("양도시 기준시가 (토지·건물 안분 비율)").className).toContain("text-emerald-700");
    expect(getByText("취득시 기준시가 (환산 분자 + 개산공제 기준)").className).toContain("text-amber-700");
    expect(getByText("비사업용토지 판정").className).toContain("text-rose-700");
    // ④ titleExtra(§ 배지) — 헤더 인라인 요소 보존
    expect(getByText("(§104의3·§168의12)")).toBeTruthy();
  });

  it("① 섹션카드 sky light 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    // 제목 <p> → 헤더 flex div → ToneCard 외곽 div
    const card = renderBlock().getByText("면적·규모").parentElement?.parentElement as HTMLElement;
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });
});
