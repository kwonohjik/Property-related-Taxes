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
 *
 * ## rev.3 (2026-08-05) — 기준시가 배치 축을 시점 → 자산으로
 *
 * ①emerald(양도시 토지+건물) ②amber(취득시 토지+건물)가 ①slate(토지) ②slate(건물)로 바뀌고,
 * **시점 tone(취득=amber·양도=emerald)은 각 그룹 안쪽 박스가 승계**한다. 톤 회귀 감시가
 * 끊기지 않도록 아래 단언을 안쪽 박스 기준으로 옮긴다(사라진 계약이 아니라 이동한 계약).
 * anchor(순서·게이트): `gb-stdprice-asset-major-layout.anchor.test.tsx`
 *
 * ## rev.4 (2026-08-11) — 비사업용토지 판정 카드도 ① 기본정보로 이전
 *
 * rev.2의 면적 카드와 같은 이동이다. rose 톤·`titleExtra`(§ 배지)·noDark 계약은
 * `AssetAreaSection`(① 기본정보) 쪽 describe가 이어받는다. 이 블록에서는 **없어야**
 * 한다는 단언으로 뒤집는다 — 두 곳에 동시에 남는 중복 회귀를 잡기 위함이다.
 * ⚠️ 종전 `sectionNum="③"` 번호배지는 제거했다(① 안에서는 ③이 취득정보로 오독된다) —
 *    제목형 카드가 됐으므로 배지 존재를 단언하지 않는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { AssetAreaGeneralBuilding } from "@/components/calc/transfer/asset-sections/AssetAreaGeneralBuilding";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
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
  it("①② 섹션 제목이 톤별로 렌더된다", () => {
    const { getByText, getAllByText } = renderBlock();
    // ①② 그룹은 중립(slate), 시점 tone은 안쪽 박스가 승계 — 취득 2개(토지·건물)·양도 2개.
    expect(getByText("토지 공시지가 (토지기준시가)").className).toContain("text-slate-700");
    expect(getByText("건물 기준시가").className).toContain("text-slate-700");
    const acqTitles = getAllByText("취득시");
    const transferTitles = getAllByText("양도시");
    expect(acqTitles).toHaveLength(2);
    expect(transferTitles).toHaveLength(2);
    for (const t of acqTitles) expect(t.className).toContain("text-amber-700");
    for (const t of transferTitles) expect(t.className).toContain("text-emerald-700");
  });

  it("면적 카드는 이 블록에 없다 — ① 기본정보로 이전 (중복 0)", () => {
    renderBlock();
    expect(screen.queryByText("면적·규모")).toBeNull();
  });

  it("비사업용토지 판정·주택→상가 용도변경도 이 블록에 없다 — ① 기본정보로 이전 (중복 0)", () => {
    renderBlock();
    expect(screen.queryByText("비사업용토지 판정")).toBeNull();
    expect(screen.queryByText("(§104의3①4호나목 · 지방세령 §101)")).toBeNull();
    expect(screen.queryByText("주택 → 상가 용도변경")).toBeNull();
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
    expect(getByText("토지 면적")).toBeTruthy();
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
    expect(screen.getByText("토지 면적")).toBeTruthy();
    expect(screen.getByText("건물 연면적")).toBeTruthy();
    expect(screen.getByText("건축물 바닥면적")).toBeTruthy();
  });
});

/**
 * rev.4 — 이전된 비사업용토지 판정 카드가 ① 기본정보(`AssetAreaSection`)에서 렌더되는지.
 *
 * 위 describe의 「이 블록에 없다」 단언과 **짝**이다. 두 단언이 함께 있어야 "옮겼다"가
 * 증명된다 — 없음 단언만 두면 컴포넌트가 아예 렌더 불가가 돼도 통과한다
 * ([[feedback_negative_assertion_needs_mutation_probe]]).
 */
describe("AssetAreaSection — 이전된 비사업용토지 판정·용도변경 카드 (① 기본정보)", () => {
  function renderArea() {
    return render(
      <AssetAreaSection
        asset={makeGbAsset()}
        onChange={() => {}}
        transferDate="2025-01-01"
      />,
    );
  }

  it("면적·규모 바로 아래에 비사업용토지 판정 카드가 rose 톤으로 렌더된다", () => {
    const { getByText } = renderArea();
    expect(getByText("면적·규모").className).toContain("text-sky-700");
    expect(getByText("비사업용토지 판정").className).toContain("text-rose-700");
  });

  it("titleExtra(§ 배지)가 보존된다", () => {
    // 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 → 「지방세법 시행령」 §101 소관.
    expect(renderArea().getByText("(§104의3①4호나목 · 지방세령 §101)")).toBeTruthy();
  });

  it("용도지역 라디오와 허가·사용승인 미이행 토글이 함께 온다 — 유일 입력 경로 보존", () => {
    const { getByText } = renderArea();
    // gbZoneType·gbUnapprovedBuilding는 이 카드가 **유일한** 쓰기 지점이다.
    expect(getByText("용도지역 (필수)")).toBeTruthy();
    expect(getByText("허가·사용승인 미이행 건축물")).toBeTruthy();
  });

  it("주택 → 상가 용도변경 카드도 함께 렌더된다", () => {
    expect(renderArea().getByText("주택 → 상가 용도변경")).toBeTruthy();
  });

  it("번호배지 없는 제목형이다 — ① 안에서 ③은 취득정보로 오독된다", () => {
    const title = renderArea().getByText("비사업용토지 판정");
    // ToneCard: sectionNum 有 → 제목 앞 형제로 배지 <span>이 붙는다.
    expect(title.parentElement?.textContent).not.toContain("③");
  });
});
