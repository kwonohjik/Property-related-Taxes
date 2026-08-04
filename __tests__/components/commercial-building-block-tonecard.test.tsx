/**
 * anchor: CommercialBuildingBlock — 인라인 섹션카드 → <ToneCard noDark> 전환(회귀 0).
 *   색상 ToneCard 점진 채택 2호. noDark: 원래 light 전용 → dark 미도입, 양 모드 class-equivalent.
 *   /70·100/60 서브박스(불투명도 다름)는 인라인 유지. (#560 prefill 변경과 무충돌)
 *
 * ## rev.2 (2026-08-04) — 면적 카드 ① 기본정보로 이전
 *
 * 종전 구성은 ①sky(면적) ②emerald ③④amber였다. 면적 3필드가
 * `asset-sections/AssetAreaCommercial.tsx`로 이전되면서 이 블록은 ①emerald ②③amber가 된다.
 * **sky 톤·noDark 계약은 사라진 것이 아니라 이전된 컴포넌트로 옮겨졌다** — 아래 별도
 * describe가 그 계약을 이어받는다(톤 회귀 감시 공백 방지).
 *
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { CommercialBuildingBlock } from "../../components/calc/transfer/CommercialBuildingBlock";
import { AssetAreaCommercial } from "../../components/calc/transfer/asset-sections/AssetAreaCommercial";
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
  it("섹션 제목·배지가 톤별로 렌더 (①emerald ②amber)", () => {
    const { getByText } = renderBlock("pre_disclosure");
    expect(getByText("호별 ㎡당 고시가 (원/㎡)").className).toContain("text-emerald-700");
    expect(getByText("건물 기준시가 — 3시점 (원, 총액)").className).toContain("text-amber-700");
    expect(getByText("1").className).toContain("bg-emerald-200");
    expect(getByText("2").className).toContain("bg-amber-200");
  });

  it("면적 카드는 이 블록에 없다 — ① 기본정보로 이전 (중복 0)", () => {
    renderBlock("pre_disclosure");
    expect(screen.queryByText("면적 정보 (㎡)")).toBeNull();
  });

  it("① 섹션카드 emerald light 클래스 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const badge = renderBlock().getByText("1");
    expect(badge.className).not.toContain("dark:");
    const card = badge.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-emerald-200");
    expect(card.className).toContain("bg-emerald-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("③ pre_disclosure = 3시점 라벨 (동적 title)", () => {
    expect(renderBlock("pre_disclosure").getByText(/개별공시지가 — 3시점/)).toBeTruthy();
  });
  it("③ post_disclosure = 2시점 라벨 (동적 title)", () => {
    expect(renderBlock("post_disclosure").getByText(/개별공시지가 — 2시점/)).toBeTruthy();
  });
});

/**
 * 이전된 면적 카드가 sky 톤·noDark 계약을 그대로 유지하는지 — 위 describe에서 넘어온 계약.
 * 이전이 "스타일 회귀 없는 위치 이동"임을 고정한다.
 */
describe("AssetAreaCommercial — 이전된 면적 카드의 sky·noDark 계약 승계", () => {
  function renderArea() {
    return render(
      <AssetAreaCommercial
        asset={{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building" as const,
        }}
        onChange={() => {}}
      />,
    );
  }

  it("제목이 sky 톤으로 렌더된다", () => {
    expect(renderArea().getByText("면적 정보 (㎡)").className).toContain("text-sky-700");
  });

  it("sky light 클래스 유지 + dark: 미도입 (noDark 회귀 0)", () => {
    const title = renderArea().getByText("면적 정보 (㎡)");
    expect(title.className).not.toContain("dark:");
    const card = title.parentElement?.parentElement as HTMLElement; // ToneCard 외곽
    expect(card.className).toContain("border-sky-200");
    expect(card.className).toContain("bg-sky-50/40");
    expect(card.className).not.toContain("dark:");
  });

  it("면적 3필드가 모두 렌더된다", () => {
    const { getByPlaceholderText } = renderArea();
    expect(getByPlaceholderText("전용면적 입력")).toBeTruthy();
    expect(getByPlaceholderText("공유면적 입력")).toBeTruthy();
    expect(getByPlaceholderText("대지면적 입력")).toBeTruthy();
  });
});
