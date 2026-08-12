/**
 * @vitest-environment jsdom
 *
 * anchor: 일반건물 **일부 양도 × 증축**(계획서 §14 O-4)
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §15
 *
 * ## 왜 이 조합이 종전에 불가능했나
 *
 * 두 겹으로 막혀 있었다:
 *   1. `AREA_SCENARIOS_BY_ASSET_KIND`에 `general_building`이 **미등재** ⇒ 「면적 입력 방식」
 *      선택지 자체가 없어 `areaScenario`가 항상 `"same"`이었다.
 *   2. `CompanionAcqPurchaseBlock`의 안분 계산기 게이트에 `!gbHasExtension` (Q-3).
 *
 * ## 설계 — 면적은 「양도분 기준」 단일 축이다
 *
 * `building`은 `partial`을 **되돌렸다**(PR #912 · anchor A-6) — `acquisitionArea`/`transferArea`
 * **2칸**이 서로 다른 면적을 받아 환산비율이 왜곡됐기 때문이다(면적비가 단가비를 상쇄).
 * 일반건물은 `gbLandArea` **단일 필드**가 취득·양도 기준시가 양쪽의 곱셈 인자라
 * (`general-building-extension.ts:72·177`) 환산 산식에서 **약분**된다 ⇒ 그 회귀가 구조적으로 없다.
 *
 * 두 안분 축은 충돌하지 않고 **순차로 겹친다**:
 *   ① 안분 계산기가 전체 취득가액에서 **양도분**을 뽑고(취득 당시 가치 비율)
 *   ② 엔진이 그 값을 §166⑥ 취득시 기준시가 비율로 토지·건물1에 나눈다.
 *
 * ## 고정 계약
 *
 *   P1. 일반건물 면적 카드에 「일부 양도」 토글이 있다
 *   P2. ON이면 면적 라벨이 「양도분」으로 바뀐다
 *   P3. 축 A(`acquisitionArea`/`transferArea` 2칸)는 일반건물에서 **렌더되지 않는다** — 중복 입력 금지
 *   P4. 증축 ON + 일부양도 ON에서 안분 계산기가 뜬다 (Q-3 차단 해제)
 *   P5. validate가 「양도분 취득가액이 구분되는가」 선택을 강제한다 (2칸 축이 없어 죽어 있던 보호)
 *   P6. 자산유형을 바꾸면 stale `partial`이 정리된다
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssetAreaGeneralBuilding } from "@/components/calc/transfer/asset-sections/AssetAreaGeneralBuilding";
import {
  AssetAreaSection,
  areaResetPatchForAssetKind,
} from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function gbAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-06-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    gbZoneType: "commercial",
    ...over,
  } as AssetForm;
}

function renderAcqBlock(asset: AssetForm) {
  return render(
    <CompanionAcqPurchaseBlock
      assetKind="general_building"
      asset={asset}
      onAssetChange={() => {}}
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={() => {}}
      useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      isAppraisalAcquisition={asset.isAppraisalAcquisition}
      onIsAppraisalAcquisitionChange={() => {}}
      gbHasExtension={asset.gbHasExtension}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
      onFixedAcquisitionPriceChange={() => {}}
      standardPriceAtAcq={asset.standardPriceAtAcq}
      onStandardPriceAtAcqChange={() => {}}
      standardPriceAtTransfer={asset.standardPriceAtTransfer}
      onStandardPriceAtTransferChange={() => {}}
      transferDate="2024-06-01"
    />,
  );
}

// ── P1 · P2 — 일부 양도 토글과 라벨 ──────────────────────────────────────

describe("P1 — 일반건물 면적 카드에 「일부 양도」 토글이 있다", () => {
  it("토글이 렌더된다", () => {
    render(<AssetAreaGeneralBuilding asset={gbAsset()} onChange={() => {}} />);
    expect(screen.getByText("일부 양도")).toBeInTheDocument();
  });

  it("OFF에서는 안내 카드가 뜨지 않는다 (대조군)", () => {
    render(<AssetAreaGeneralBuilding asset={gbAsset()} onChange={() => {}} />);
    expect(screen.queryByText(/양도한 부분 기준/)).toBeNull();
  });
});

describe("P2 — ON이면 면적 라벨이 「양도분」으로 바뀐다", () => {
  it("토지·연면적 라벨 + 안내 카드", () => {
    render(
      <AssetAreaGeneralBuilding
        asset={gbAsset({ areaScenario: "partial" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("양도분 토지 면적")).toBeInTheDocument();
    expect(screen.getByText("양도분 건물 연면적")).toBeInTheDocument();
    expect(screen.getByText(/양도한 부분 기준/)).toBeInTheDocument();
  });

  /**
   * 🔑 **바닥면적 라벨은 바꾸지 않는다.** 「토지만 일부 양도」에서는 건물 전체 바닥면적이
   * 그대로 부수토지 한도의 기준이기 때문이다 — 실측으로 그것이 정확한 판정임을 확인했다
   * (토지 600→200, 바닥 90 유지 ⇒ 허용 270 ≥ 200이라 전부 사업용).
   * 라벨을 「양도분 바닥면적」으로 바꾸면 사용자를 틀린 입력으로 몬다.
   */
  it("🔑 바닥면적 라벨은 그대로다 — 토지만 일부 양도면 건물 전체 값이 맞다", () => {
    render(
      <AssetAreaGeneralBuilding
        asset={gbAsset({ areaScenario: "partial" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("건축물 바닥면적")).toBeInTheDocument();
    expect(screen.queryByText("양도분 바닥면적")).toBeNull();
  });
});

// ── P3 — 축 A 2칸은 일반건물에서 렌더되지 않는다 ─────────────────────────

/**
 * 🔴 `AREA_SCENARIOS_BY_ASSET_KIND`에 등재한 부작용을 막는 단언이다.
 *
 * 등재는 **허용 시나리오의 단일 소스**를 지키기 위한 것이고(P6가 그 이유),
 * 면적 입력은 전용 카드가 담당한다. 등재만 하고 축 A 게이트를 안 막으면
 * `acquisitionArea`/`transferArea`가 함께 떠 **같은 면적을 두 곳에서** 받는다.
 */
describe("P3 — 축 A(면적 입력 방식 Select)는 일반건물에서 뜨지 않는다", () => {
  it("「면적 입력 방식」 라벨이 없다", () => {
    render(
      <AssetAreaSection
        asset={gbAsset({ areaScenario: "partial" })}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(screen.queryByText("면적 입력 방식")).toBeNull();
  });

  it("전용 카드의 토글은 그 자리에 있다 (대조군 — 섹션 자체는 렌더됐다)", () => {
    render(
      <AssetAreaSection
        asset={gbAsset({ areaScenario: "partial" })}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(screen.getByText("일부 양도")).toBeInTheDocument();
  });
});

// ── P4 — 증축 × 일부양도에서 안분 계산기가 뜬다 ──────────────────────────

describe("P4 — 안분 계산기가 증축에서도 열린다 (Q-3 차단 해제)", () => {
  it("🔴 일부양도 + 증축 + 실거래가 ⇒ 「양도분 취득가액이 구분되는가」가 보인다", () => {
    renderAcqBlock(
      gbAsset({
        areaScenario: "partial",
        useEstimatedAcquisition: false,
        gbHasExtension: true,
      }),
    );
    expect(screen.getByText("구분됨")).toBeInTheDocument();
    expect(screen.getByText("불분명")).toBeInTheDocument();
  });

  it("증축 OFF에서도 종전대로 보인다 (회귀 0)", () => {
    renderAcqBlock(
      gbAsset({ areaScenario: "partial", useEstimatedAcquisition: false }),
    );
    expect(screen.getByText("구분됨")).toBeInTheDocument();
  });

  it("일부양도가 아니면 뜨지 않는다 (대조군)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false, gbHasExtension: true }));
    expect(screen.queryByText("구분됨")).toBeNull();
  });

  it("취득가액 hint가 증축 일괄 축을 함께 안내한다", () => {
    renderAcqBlock(
      gbAsset({
        areaScenario: "partial",
        useEstimatedAcquisition: false,
        gbHasExtension: true,
      }),
    );
    expect(screen.getByText(/토지·원건물 일괄 취득가액을 입력하세요/)).toBeInTheDocument();
  });
});

// ── P5 — validate가 안분 선택을 강제한다 ─────────────────────────────────

/**
 * 🔴 **2칸 축이 없어 죽어 있던 보호를 되살린다.**
 *
 * 종전 `partialConfirmed = acq > 0 && tr > 0 && acq > tr`는 `acquisitionArea`/`transferArea`를
 * 읽는데, 일반건물은 그 칸이 없어 `NaN > NaN` = **항상 false**였다. 즉 일부양도를 켜고
 * 전체 취득가액을 그대로 넣어도 아무도 막지 않는다(양도차익 과소).
 */
describe("P5 — 일반건물 일부양도는 「구분되는가」 선택을 강제한다", () => {
  /**
   * ⚠️ 일반건물 필수 필드를 **다 채운** 픽스처여야 한다 — `validateAssetAcquisition`은
   *    순차 검사라 기준시가가 비면 그쪽에서 먼저 return되어 이 단언이 **다른 이유로**
   *    실패한다(메모리 `feedback_anchor_observes_wrong_stage`).
   */
  const base = {
    areaScenario: "partial" as const,
    useEstimatedAcquisition: false,
    gbHasExtension: true,
    fixedAcquisitionPrice: "300,000,000",
    gbTransferLandPricePerSqm: "3,000,000",
    gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000",
    gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase" as const,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction" as const,
    gbExtensionAcquisitionMode: "estimated" as const,
    gbTransferExtensionBuildingStdPrice: "50,000,000",
    gbAcquisitionExtensionBuildingStdPrice: "40,000,000",
  };

  it("🔴 미선택이면 차단된다", () => {
    const err = validateAssetAcquisition(gbAsset(base), "자산1", "2024-06-01");
    expect(err).toMatch(/양도분 취득가액이 구분되는가/);
  });

  it("선택하면 통과한다 (거짓 차단 아님)", () => {
    const err = validateAssetAcquisition(
      gbAsset({ ...base, partialAcqDistinct: "yes" }),
      "자산1",
      "2024-06-01",
    );
    expect(err ?? "").not.toMatch(/양도분 취득가액이 구분되는가/);
  });

  it("일부양도가 아니면 요구하지 않는다 (대조군)", () => {
    const err = validateAssetAcquisition(
      gbAsset({ ...base, areaScenario: "same" }),
      "자산1",
      "2024-06-01",
    );
    expect(err ?? "").not.toMatch(/양도분 취득가액이 구분되는가/);
  });

  it("환산취득가 모드는 요구하지 않는다 — 면적·기준시가만으로 계산된다", () => {
    const err = validateAssetAcquisition(
      gbAsset({ ...base, useEstimatedAcquisition: true, fixedAcquisitionPrice: "" }),
      "자산1",
      "2024-06-01",
    );
    expect(err ?? "").not.toMatch(/양도분 취득가액이 구분되는가/);
  });
});

// ── P6 — 자산유형 전환 시 stale partial 정리 ─────────────────────────────

/**
 * 🔴 진입점이 늘면 새는 경로도 는다(메모리 `feedback_ui_gate_expansion_activates_latent_defect`).
 *
 * 안분 계산기 게이트는 `areaScenario === "partial"`만 보므로, 일반건물에서 켠 `partial`이
 * 상가로 넘어가면 **그 축이 없는 자산유형에서** 계산기가 뜬다.
 * 종전 `allowed.length === 0 → return {}`은 그것을 그대로 통과시켰다.
 */
describe("P6 — 자산유형을 바꾸면 stale partial이 정리된다", () => {
  it("🔴 일반건물(partial) → 상업용건물: same으로 리셋", () => {
    const patch = areaResetPatchForAssetKind(
      gbAsset({ areaScenario: "partial" }),
      "commercial_building",
    );
    expect(patch.areaScenario).toBe("same");
  });

  it("일반건물(partial) → 토지: partial 유지 (land도 허용 — 거짓 리셋 금지)", () => {
    const patch = areaResetPatchForAssetKind(gbAsset({ areaScenario: "partial" }), "land");
    expect(patch.areaScenario).toBeUndefined();
  });

  it("일반건물(partial) → 건물: same으로 리셋 (building은 same 단일)", () => {
    const patch = areaResetPatchForAssetKind(gbAsset({ areaScenario: "partial" }), "building");
    expect(patch.areaScenario).toBe("same");
  });
});
