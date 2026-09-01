/**
 * anchor: PR-1 c8 — 공익수용 프리필이 NBL 입력 UI 렌더 게이트와 일치해야 한다
 *
 * 발견 A2-01 · U3-01 · V10-e (docs/reviews/nbl-code-review-2026-09.md)
 *
 * 결함: `TransferModeBlock`의 공익수용 프리필은 `nblUseDetailedJudgment`만 켰다.
 *       그런데 NBL 입력 섹션의 렌더 게이트(`AssetSectionExtras`)는
 *       `isNonBusinessLand && nblUseDetailedJudgment` **둘 다**를 요구한다.
 *       ⑧ validate와 ④ raw 빌더는 `nblUseDetailedJudgment` 하나만 보고 지목을 요구하므로,
 *       컴패니언 자산은 「지목을 선택하세요」로 차단되는데 입력 칸이 화면에 없다
 *       (자산1은 Step4 토글로 탈출 가능 — 컴패니언에는 그 토글이 없다).
 *
 * 3중 패턴: 렌더 게이트 ↔ ④ raw 빌더 ↔ ⑧ validate가 같은 조건을 봐야 한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TRANSFER = "2024-05-01";

function landAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(2), assetKind: "land", ...overrides } as AssetForm;
}

/** 「공익수용·협의매수」 라디오를 눌러 프리필 패치를 회수한다. */
function selectExpropriation(asset: AssetForm): Partial<AssetForm> {
  const onChange = vi.fn();
  render(<TransferModeBlock asset={asset} onChange={onChange} transferDate={TRANSFER} />);
  const radio = screen
    .getAllByRole("radio")
    .find((el) => (el.closest("label")?.textContent ?? "").includes("공익수용"));
  if (!radio) throw new Error("공익수용 라디오를 찾지 못했습니다");
  radio.click();
  expect(onChange).toHaveBeenCalled();
  return onChange.mock.calls[0][0] as Partial<AssetForm>;
}

describe("[c8] 공익수용 프리필 ↔ NBL 입력 렌더 게이트 (A2-01·U3-01·V10-e)", () => {
  it("🔴 토지 프리필이 isNonBusinessLand도 함께 켠다 — 켜지 않으면 입력 칸이 렌더되지 않는다", () => {
    const patch = selectExpropriation(landAsset());
    expect(patch.nblUseDetailedJudgment).toBe(true);
    expect(patch.isNonBusinessLand).toBe(true);
  });

  it("프리필 결과 자산에 NBL 입력 섹션이 실제로 렌더된다 (컴패니언 dead-end 해소)", () => {
    const patch = selectExpropriation(landAsset());
    cleanup();
    const asset = landAsset(patch);
    render(<AssetSectionExtras asset={asset} onChange={() => {}} transferDate={TRANSFER} />);
    // NblSectionContainer가 렌더되면 「토지 지목」 선택 필드가 존재한다.
    expect(screen.getByText("토지 지목")).toBeTruthy();
  });

  it("토지가 아닌 자산에는 NBL 프리필이 붙지 않는다 (기존 동작 보존)", () => {
    const patch = selectExpropriation(landAsset({ assetKind: "housing" }));
    expect(patch.nblUseDetailedJudgment).toBeUndefined();
    expect(patch.isNonBusinessLand).toBeUndefined();
  });

  it("일반 양도로 되돌리면 프리필로 켠 두 플래그가 함께 정리된다 (잔존 차단 방지)", () => {
    const onChange = vi.fn();
    const asset = landAsset({
      transferType: "regular",
      transferCause: "public_expropriation",
      isNonBusinessLand: true,
      nblUseDetailedJudgment: true,
    });
    render(<TransferModeBlock asset={asset} onChange={onChange} transferDate={TRANSFER} />);
    const radio = screen
      .getAllByRole("radio")
      .find((el) => (el.closest("label")?.textContent ?? "").includes("일반"));
    if (!radio) throw new Error("일반 양도 라디오를 찾지 못했습니다");
    radio.click();
    const patch = onChange.mock.calls[0][0] as Partial<AssetForm>;
    expect(patch.nblUseDetailedJudgment).toBe(false);
    expect(patch.isNonBusinessLand).toBe(false);
  });
});
