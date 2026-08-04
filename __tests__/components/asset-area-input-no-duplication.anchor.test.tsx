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
import { RedevelopmentValuationSection } from "@/components/calc/transfer/RedevelopmentValuationSection";
import { MixedUseExpandedPanel } from "@/components/calc/transfer/MixedUseSection";
import { shouldShowRedevValuationSection } from "@/components/calc/transfer/asset-sections/AssetAreaRedevelopment";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
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

// ══════════════════════════════════════════════════════════
// 재개발·입주권 — 두 갈래(isLand 삼항)가 같은 필드를 각각 렌더하던 것을 ①로 통합
// ══════════════════════════════════════════════════════════

/** 재개발 토지 면적 라벨 개수 */
function redevAreaLabelCount() {
  return screen.queryAllByText("취득·양도 당시 토지 면적 (㎡)").length;
}

function renderRedevBasic(over: Partial<AssetForm>) {
  return render(
    <AssetSectionBasic
      asset={{
        ...makeDefaultAsset(1),
        assetKind: "redevelopment_apt",
        acquisitionCause: "purchase",
        ...over,
      }}
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

describe("재개발·입주권 면적 — ① 단일 위치 + 게이트 술어 공유", () => {
  it("토지 출자(isLand): ①에 면적 라벨이 정확히 1개", () => {
    renderRedevBasic({ redevOriginalAssetType: "land" });
    expect(redevAreaLabelCount()).toBe(1);
  });

  it("주택 출자(비-isLand): ①에 면적 라벨이 정확히 1개", () => {
    renderRedevBasic({ redevOriginalAssetType: "housing" });
    expect(redevAreaLabelCount()).toBe(1);
  });

  it("입주권(right_to_move_in)도 ①에 면적 라벨이 1개", () => {
    renderRedevBasic({ assetKind: "right_to_move_in" });
    expect(redevAreaLabelCount()).toBe(1);
  });

  /**
   * 게이트 술어 `shouldShowRedevValuationSection`이 ①과 ③에서 **같은 함수**여야 한다.
   * 복제해서 갈리면 면적 입력 dead-end(③은 열렸는데 ①이 닫힘) 또는
   * 쓰이지 않는 값 입력(①은 열렸는데 ③이 닫힘)이 된다.
   */
  it("승계조합원: 소비 경로가 닫히므로 ①의 면적도 노출되지 않는다", () => {
    renderRedevBasic({ redevIsSuccessorMember: "yes" });
    expect(redevAreaLabelCount()).toBe(0);
  });

  it("단독주택 출자 §164⑤ 분기: 전용 카드를 쓰므로 ①의 면적도 노출되지 않는다", () => {
    renderRedevBasic({
      assetKind: "right_to_move_in",
      redevOriginalAssetType: "housing",
      redevSettlementDirection: "receive",
      useEstimatedAcquisition: true,
    });
    expect(redevAreaLabelCount()).toBe(0);
  });

  /**
   * 게이트가 UI만 닫고 validate는 면적을 요구하면 **입력 불가 dead-end**가 된다.
   * probe 실측(2026-08-04): 승계조합원은 validate가 준공일 분기로 빠져 면적을
   * 요구하지 않는다 — UI 미노출과 정합. 이 동치를 계약으로 고정한다.
   * (`feedback_ui_gate_removes_sole_input_path` ★★★)
   */
  it("승계조합원: UI가 닫히는 만큼 validate도 면적을 요구하지 않는다 (dead-end 0)", () => {
    const asset = {
      ...makeDefaultAsset(1),
      assetKind: "redevelopment_apt" as const,
      redevSubject: "apt",
      redevApprovalDate: "2020-01-01",
      acquisitionDate: "2015-01-01",
      redevIsSuccessorMember: "yes",
      useEstimatedAcquisition: true,
      redevLandArea: "",
    } as AssetForm;
    // UI: 면적 미노출
    expect(shouldShowRedevValuationSection(asset)).toBe(false);
    // validate: 면적을 요구하지 않는다(다른 필수 항목으로 유도)
    const msg = validateRedevelopmentAsset(asset, "자산1");
    expect(msg == null || !/면적/.test(msg)).toBe(true);
  });

  /** ③ 환산 섹션의 두 갈래(isLand 삼항) 모두에서 면적 칸이 사라졌는지 */
  it.each([
    ["토지 출자", "land"],
    ["주택 출자", "housing"],
  ] as const)("③ 환산 섹션(%s)에 면적 칸이 0개", (_label, originalType) => {
    render(
      <RedevelopmentValuationSection
        asset={{
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          redevOriginalAssetType: originalType,
          useEstimatedAcquisition: true,
        }}
        onChange={vi.fn()}
      />,
    );
    expect(redevAreaLabelCount()).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════
// 겸용주택 — 안분 카드를 **통째로** ①로 이전
// ══════════════════════════════════════════════════════════

/**
 * 겸용은 1칸만 떼지 않았다. `mixedUseTotalLandArea`가 주택/상가 부수토지 안분의
 * **분모**이고(`mixed-use-derived-areas.ts:66-73`) 결과 6칸이 같은 카드에 있어,
 * 쪼개면 "부수토지 합 = 전체 토지" validate를 맞추려 ①↔③을 오가야 한다.
 * 이 계약은 **카드 응집**을 지킨다 — 분모와 결과가 항상 같은 화면에 있어야 한다.
 */
function mixedAreaCardCount() {
  return screen.queryAllByText(/^(양도시 )?면적 \(건축물대장 기준\)$/).length;
}

function makeMixedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    ...over,
  };
}

/** ① 기본정보를 겸용 자산으로 렌더 */
function renderMixedBasic(over: Partial<AssetForm> = {}) {
  return render(
    <AssetSectionBasic
      asset={makeMixedAsset(over)}
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

describe("겸용주택 면적 — 안분 카드가 ① 단일 위치", () => {
  it("① 기본정보에 안분 카드가 정확히 1개", () => {
    renderMixedBasic();
    expect(mixedAreaCardCount()).toBe(1);
  });

  it("① 안에 분모(전체 토지)와 결과(주택·상가 부수토지)가 함께 있다 — 응집 계약", () => {
    renderMixedBasic();
    expect(screen.getByText("전체 토지 면적 (㎡)")).toBeTruthy();
    expect(screen.getByText("주택 부수토지 (㎡)")).toBeTruthy();
    expect(screen.getByText("상가 부수토지 (㎡)")).toBeTruthy();
  });

  it("③ 겸용 확장 패널에 안분 카드가 0개", () => {
    render(
      <MixedUseExpandedPanel
        asset={makeMixedAsset()}
        onChange={vi.fn()}
        transferDate="2026-05-01"
      />,
    );
    expect(mixedAreaCardCount()).toBe(0);
  });

  it("1-A(취득시점 자산 구성)는 ③에 남는다 — 양도시/취득시 분업", () => {
    render(
      <MixedUseExpandedPanel
        asset={makeMixedAsset({ hasPartialUsageChange: true })}
        onChange={vi.fn()}
        transferDate="2026-05-01"
      />,
    );
    expect(screen.getByText("1-A")).toBeTruthy();
  });
});
