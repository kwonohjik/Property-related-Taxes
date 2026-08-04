/**
 * 자산유형별 면적 입력 칸 중복 0 계약 (rev.2 — 2026-08-04 위치 이전 반영)
 *
 * ## 계약 변경 이력
 *
 * **rev.1 (2026-07-30, Phase 3)**: "전용 면적 섹션들이 **상호배타 게이트** 아래 있어
 * 중복이 0"임을 고정했다. 상가는 취득원인에 따라 두 컴포넌트가 나눠 렌더했다:
 *   `CommercialBuildingBlock`(비상속) / `CommercialInheritanceStdPriceSection`(상속)
 *
 * **rev.2 (2026-08-04, 위치 통일 P2)**: 면적 3필드를 **① 기본정보로 이전**했다.
 * 상호배타에 의존하던 계약이 **단일 위치 계약**으로 바뀐다:
 *
 *   ① 기본정보(`AssetSectionBasic`)      → 면적 카드 **정확히 1개** (취득원인 무관)
 *   ③ 취득정보(`AssetSectionAcquisition`) → 면적 카드 **0개**
 *
 * 계약이 강해졌다 — rev.1은 "두 곳 중 한 곳에만 나온다"였고, rev.2는 "항상 같은
 * 한 곳에 나온다"이다. 사용자가 취득원인을 바꿔도 면적 입력 위치가 움직이지 않는다.
 *
 * ## ⛔ 되돌리지 말 것
 *
 * 전용 블록에 면적 칸을 다시 추가하면 ①과 중복된다. 면적이 필요한 새 자산유형은
 * `AssetSectionBasic`에 위젯을 추가한다(`asset-sections/AssetAreaCommercial.tsx` 참조).
 *
 * 계획: `docs/00-pm/transfer-area-unification-all-asset-kinds.plan.md` P2
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssetSectionAcquisition } from "@/components/calc/transfer/asset-sections/AssetSectionAcquisition";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// RTL cleanup은 프로젝트 규약상 수동 등록 (memory feedback_rtl_manual_cleanup_required)
afterEach(() => cleanup());

function buildAsset(over: Partial<AssetForm>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "commercial_building",
    acquisitionDate: "2003-05-01",
    ...over,
  };
}

function renderAcquisition(over: Partial<AssetForm>) {
  return render(
    <AssetSectionAcquisition
      asset={buildAsset(over)}
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

function renderBasic(over: Partial<AssetForm>) {
  return render(
    <AssetSectionBasic
      asset={buildAsset(over)}
      onChange={vi.fn()}
      isMultiBundled={false}
      onAddAsset={vi.fn()}
      showFormDates={false}
      transferDate="2026-05-01"
      filingDate=""
      filingOverdue={false}
      filingDeadline=""
      onFormChange={vi.fn()}
    />,
  );
}

/** 「면적 정보 (㎡)」 ToneCard 제목 개수 */
function areaCardCount() {
  return screen.queryAllByText("면적 정보 (㎡)").length;
}

/** 상가 면적 3필드가 실제로 입력 가능한지 — placeholder로 식별 */
function areaInputCount() {
  return [
    ...screen.queryAllByPlaceholderText("전용면적 입력"),
    ...screen.queryAllByPlaceholderText("공유면적 입력"),
    ...screen.queryAllByPlaceholderText("대지면적 입력"),
  ].length;
}

const CAUSES = ["purchase", "inheritance", "gift"] as const;

describe("상가 면적 — ① 기본정보 단일 위치 (rev.2)", () => {
  it.each(CAUSES)(
    "%s 취득: ① 기본정보에 면적 카드가 정확히 1개",
    (cause) => {
      renderBasic({ acquisitionCause: cause });
      expect(areaCardCount()).toBe(1);
    },
  );

  it.each(CAUSES)("%s 취득: ① 기본정보에 면적 3필드가 모두 입력 가능", (cause) => {
    renderBasic({ acquisitionCause: cause });
    expect(areaInputCount()).toBe(3);
  });

  it("취득원인을 바꿔도 ①의 면적 입력 위치가 움직이지 않는다", () => {
    for (const cause of CAUSES) {
      cleanup();
      renderBasic({ acquisitionCause: cause });
      expect(areaCardCount()).toBe(1);
    }
  });
});

describe("상가 면적 — ③ 취득정보에서 제거됨 (중복 0)", () => {
  it("매매 취득(환산 ON): ③에 면적 카드가 0개", () => {
    renderAcquisition({
      acquisitionCause: "purchase",
      cbEra: "post_disclosure",
      useEstimatedAcquisition: true,
    });
    expect(areaCardCount()).toBe(0);
  });

  it("상속 취득(2005.1.1. 전): ③에 면적 카드가 0개", () => {
    renderAcquisition({
      acquisitionCause: "inheritance",
      acquisitionDate: "2003-05-01",
    });
    expect(areaCardCount()).toBe(0);
  });

  it.each(CAUSES)("%s: ③에 면적 입력 필드가 0개", (cause) => {
    renderAcquisition({
      acquisitionCause: cause,
      cbEra: "post_disclosure",
      useEstimatedAcquisition: true,
    });
    expect(areaInputCount()).toBe(0);
  });
});
