/**
 * anchor: GeneralBuildingBlock — 인라인 섹션카드 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 5호(건물 파트 재개).
 *   헤더의 법조문 모달·§ 배지는 titleExtra prop으로 보존. dark:0 → noDark.
 *   /50-60·100/60 서브박스는 인라인 유지.
 *
 * ## rev.2 (2026-08-04) — 면적 카드 ① 기본정보로 이전
 *
 * 종전 구성은 ①sky(면적·규모) ②emerald ③amber ④rose였다. 면적 3필드가
 * `asset-sections/AssetAreaGeneralBuilding.tsx`로 이전되면서 이 블록은
 * ①emerald ②amber ③rose가 된다. **sky 톤·noDark 계약은 이전된 컴포넌트로 승계**된다
 * — 아래 별도 describe가 이어받아 톤 회귀 감시에 공백이 생기지 않게 한다.
 *
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { AssetAreaGeneralBuilding } from "@/components/calc/transfer/asset-sections/AssetAreaGeneralBuilding";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

function makeGbAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    useEstimatedAcquisition: true, // ② 취득시 기준시가 노출
  };
}

function renderBlock() {
  return render(
    <GeneralBuildingBlock asset={makeGbAsset()} onChange={() => {}} transferDate="2025-01-01" />,
  );
}

describe("GeneralBuildingBlock — 섹션카드 <ToneCard> 전환 (회귀 0)", () => {
  it("①②③ 섹션 제목이 톤별로 렌더 + ③ titleExtra(§ 배지) 보존", () => {
    const { getByText } = renderBlock();
    expect(getByText("양도시 기준시가 (토지·건물 안분 비율)").className).toContain("text-emerald-700");
    expect(getByText("취득시 기준시가 (환산 분자 + 개산공제 기준)").className).toContain("text-amber-700");
    expect(getByText("비사업용토지 판정").className).toContain("text-rose-700");
    // ③ titleExtra(§ 배지) — 헤더 인라인 요소 보존.
    // 🔄 2026-07-30: 인용 정정. GB 부수토지 배율은 「소득세법 시행령」 §168의12(주택)가 아니라
    //   「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 「지방세법 시행령」 §101 소관이다
    //   (Phase D 배율 정정의 UI 잔재 제거 — anchor `gb-footprint-max-floor-area.anchor.test.tsx`).
    expect(getByText("(§104의3①4호나목 · 지방세령 §101)")).toBeTruthy();
  });

  it("면적 카드는 이 블록에 없다 — ① 기본정보로 이전 (중복 0)", () => {
    renderBlock();
    expect(screen.queryByText("면적·규모")).toBeNull();
  });
});

/**
 * 이전된 면적 카드가 sky 톤·noDark 계약을 그대로 유지하는지 — 위 describe에서 넘어온 계약.
 * 이전이 "스타일 회귀 없는 위치 이동"임을 고정한다.
 */
describe("AssetAreaGeneralBuilding — 이전된 면적 카드의 sky·noDark 계약 승계", () => {
  function renderArea() {
    return render(<AssetAreaGeneralBuilding asset={makeGbAsset()} onChange={() => {}} />);
  }

  it("제목이 sky 톤으로 렌더된다", () => {
    expect(renderArea().getByText("면적·규모").className).toContain("text-sky-700");
  });

  it("sky light 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    // 제목 <p> → 헤더 flex div → ToneCard 외곽 div
    const card = renderArea().getByText("면적·규모").parentElement?.parentElement as HTMLElement;
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("환산 모드에서 면적 3필드가 모두 렌더된다", () => {
    const { getByText } = renderArea();
    expect(getByText("취득·양도 당시 토지 면적")).toBeTruthy();
    expect(getByText("건물 연면적")).toBeTruthy();
    expect(getByText("건축물 바닥면적")).toBeTruthy();
  });

  /**
   * 🔄 **의도적으로 뒤집힌 anchor** (2026-08-05) — 종전: "실가 모드에서 연면적이 숨는다".
   *
   * 실거래가 모드에서도 연면적을 쓴다 — 항상 표시되는 「양도시 기준시가」의 건물 기준시가
   * 계산기가 이 값을 prefill로 받는다(`GeneralBuildingBlock.tsx:266`). 게이트 때문에
   * 그 모드에서는 prefill이 늘 비어 사용자가 모달 안에서 같은 값을 다시 쳤다.
   * anchor: `area-card-row-layout.anchor.test.tsx` A1
   */
  it("실가 모드에서도 면적 3필드가 모두 렌더된다 — isEstimated 게이트 제거", () => {
    render(
      <AssetAreaGeneralBuilding
        asset={{ ...makeGbAsset(), useEstimatedAcquisition: false }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("취득·양도 당시 토지 면적")).toBeTruthy();
    expect(screen.getByText("건물 연면적")).toBeTruthy();
    expect(screen.getByText("건축물 바닥면적")).toBeTruthy();
  });
});
