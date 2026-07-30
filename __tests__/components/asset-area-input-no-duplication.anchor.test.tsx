/**
 * Phase 3 — 자산유형별 면적 입력 칸 중복 0 계약
 *
 * Phase 3의 성공 기준은 "같은 자산 화면에서 면적 입력 칸 중복 0"이었다.
 * 실측 결과 **이미 충족 상태**이며, 그 이유는 전용 면적 섹션들이 상호배타 게이트 아래 있기 때문이다:
 *
 *   상가   AssetSectionAcquisition.tsx:293  acquisitionCause !== "inheritance" → CommercialBuildingBlock
 *          CommercialInheritanceStdPriceSection.tsx:38~44  === "inheritance" → 상속 전용 섹션
 *          → 두 「면적 정보 (㎡)」 카드는 동시에 렌더되지 않는다.
 *   재개발  RedevelopmentValuationSection.tsx:174  `isLand ? <LandContrib…> : <main>` 삼항
 *   GB     GeneralBuildingBlock.tsx:299~313  단일 위치
 *   land·housing  기본정보 면적 섹션(AssetSectionBasic) 단독 — Phase 2에서 확대
 *
 * 따라서 Phase 3은 "이동"이 아니라 **이 상호배타성을 회귀로부터 지키는 계약**으로 완결한다.
 * 게이트를 잘못 완화하면(예: 상속 조건 제거) 같은 필드를 두 곳에서 입력받게 되고,
 * 사용자는 어느 값이 반영되는지 알 수 없다.
 *
 * 관련 설계: transfer-asset-area-basic-info.{plan,ui.design}.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function renderAcquisition(over: Partial<AssetForm>) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionDate: "2003-05-01",
    ...over,
  };

  return render(
    <AssetSectionAcquisition
      asset={asset}
      onChange={vi.fn()}
      transferDate="2026-05-01"
      isNewConstruction={false}
      isPrimary
      splitMode="none"
      onFractionalToggle={vi.fn()}
      isFirst
      hasSiblings={false}
    />,
  );
}

/** 「면적 정보 (㎡)」 ToneCard 제목 개수 — 상가 두 경로가 공유하는 제목이다. */
function areaCardCount() {
  return screen.queryAllByText("면적 정보 (㎡)").length;
}

describe("상가 — 취득원인별 면적 카드가 상호배타 (중복 0)", () => {
  it("매매 취득: 면적 정보 카드가 정확히 1개", () => {
    renderAcquisition({ acquisitionCause: "purchase", cbEra: "post_disclosure", useEstimatedAcquisition: true });
    expect(areaCardCount()).toBe(1);
  });

  it("상속 취득(2005.1.1. 전): 면적 정보 카드가 정확히 1개", () => {
    renderAcquisition({
      acquisitionCause: "inheritance",
      acquisitionDate: "2003-05-01",
    });
    expect(areaCardCount()).toBe(1);
  });

  it("어느 취득원인에서도 면적 정보 카드가 2개 이상 렌더되지 않는다", () => {
    for (const cause of ["purchase", "inheritance", "gift"] as const) {
      cleanup();
      renderAcquisition({ acquisitionCause: cause, cbEra: "post_disclosure", useEstimatedAcquisition: true });
      expect(areaCardCount()).toBeLessThanOrEqual(1);
    }
  });
});
