/**
 * @vitest-environment jsdom
 *
 * anchor: 일반건물 증축 **4조합** UI 축 — 라디오·게이트·결과 배지
 *
 * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §6 Q-1 · §4 D-4~D-9
 *
 * ## 고정 계약
 *
 *   U1. 일반건물 「취득가액 산정 방식」은 **2옵션**이다 (「토지·건물 일괄 (증축분 별도)」 제거)
 *   U2. 증축 토글은 **취득가액 산정 방식과 무관하게** 항상 보인다 (dead-end 금지)
 *   U3. 원건물 실가 + 증축이면 취득가액 라벨이 「토지·건물 일괄 취득가액」 —
 *       **증축분 방식(실가/환산)과 무관**하다
 *   U4. 같은 조건에서 「토지·건물 일괄 취득 시 필요경비」 칸이 열린다
 *   U5. 결과 표 배지는 카드의 `usedEstimatedAcquisition`에서 파생된다 (하드코딩 금지)
 *
 * ⚠️ **대조군 쌍으로 읽을 것** — 조합 A만 통과하는 것은 구별력이 없다. 그것이 종전 결함의 모양이었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GeneralBuildingBlock } from "@/components/calc/transfer/GeneralBuildingBlock";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

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
    ...over,
  } as AssetForm;
}

/** `CompanionAcqPurchaseBlock`의 필수 props를 최소로 채운다. */
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

// ── U1 · 라디오 2옵션 ───────────────────────────────────────────────────

describe("U1 — 일반건물 취득가액 산정 방식은 2옵션이다", () => {
  it("「토지·건물 일괄 (증축분 별도)」 옵션이 없다", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false }));
    expect(screen.queryByText("토지·건물 일괄 (증축분 별도)")).toBeNull();
  });

  it("실거래가·환산취득가 두 옵션은 있다 (대조군 — 컴포넌트가 렌더되긴 했다)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false }));
    expect(screen.getByText("실거래가")).toBeInTheDocument();
    expect(screen.getByText("환산취득가")).toBeInTheDocument();
  });
});

// ── U2 · 증축 토글 진입점 ───────────────────────────────────────────────

/**
 * 🔴 3번째 라디오를 제거하면서 **증축을 켤 유일한 경로**가 이 토글이 됐다.
 * 종전 게이트(`isEstimated || gbHasExtension || bothPartsSuccession || isSeparateAcq`)를
 * 그대로 뒀다면 **매매 × 실거래가 × 분리 OFF**에서 증축이 dead-end가 됐다.
 */
describe("U2 — 증축 토글은 취득가액 산정 방식과 무관하게 보인다", () => {
  const cases: Array<[string, Partial<AssetForm>]> = [
    ["실거래가 · 증축 OFF (종전에 dead-end였던 조합)", { useEstimatedAcquisition: false }],
    ["환산취득가 · 증축 OFF", { useEstimatedAcquisition: true }],
    ["실거래가 · 증축 ON", { useEstimatedAcquisition: false, gbHasExtension: true }],
    ["환산취득가 · 증축 ON", { useEstimatedAcquisition: true, gbHasExtension: true }],
  ];

  for (const [label, over] of cases) {
    it(label, () => {
      render(
        <GeneralBuildingBlock asset={gbAsset(over)} onChange={() => {}} transferDate="2024-06-01" />,
      );
      expect(screen.getByText("증축 있음")).toBeInTheDocument();
    });
  }

  it("부담부증여에서는 숨긴다 (§159 자동 산정 — 비스코프)", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ transferType: "burdened_gift" } as Partial<AssetForm>)}
        onChange={() => {}}
        transferDate="2024-06-01"
      />,
    );
    expect(screen.queryByText("증축 있음")).toBeNull();
  });

  it("지분 카드에서는 숨긴다 (물건 사건 — 중복 입력 금지)", () => {
    render(
      <GeneralBuildingBlock
        asset={gbAsset({ gbHasExtension: true })}
        onChange={() => {}}
        transferDate="2024-06-01"
        shareAcquisitionOnly
      />,
    );
    expect(screen.queryByText("증축 있음")).toBeNull();
  });
});

// ── U3 · U4 · 취득가액 칸의 성격 ────────────────────────────────────────

describe("U3 — 취득가액 라벨은 증축분 방식과 무관하다", () => {
  it("원건물 실가 + 증축 **환산** → 「토지·건물 일괄 취득가액」", () => {
    renderAcqBlock(
      gbAsset({
        useEstimatedAcquisition: false,
        gbHasExtension: true,
        gbExtensionAcquisitionMode: "estimated",
      }),
    );
    expect(screen.getByText(/토지·건물 일괄 취득가액/)).toBeInTheDocument();
  });

  it("🔴 원건물 실가 + 증축 **실가** → 같은 라벨 (종전에는 「취득가액」으로 떨어졌다)", () => {
    renderAcqBlock(
      gbAsset({
        useEstimatedAcquisition: false,
        gbHasExtension: true,
        gbExtensionAcquisitionMode: "actual",
      }),
    );
    expect(screen.getByText(/토지·건물 일괄 취득가액/)).toBeInTheDocument();
  });

  it("증축이 없으면 일반 라벨이다 (대조군)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false, gbHasExtension: false }));
    expect(screen.queryByText(/토지·건물 일괄 취득가액/)).toBeNull();
  });
});

describe("U4 — 일괄 필요경비 칸도 증축분 방식과 무관하게 열린다", () => {
  for (const mode of ["estimated", "actual"] as const) {
    it(`원건물 실가 + 증축 ${mode === "actual" ? "실가" : "환산"}`, () => {
      renderAcqBlock(
        gbAsset({
          useEstimatedAcquisition: false,
          gbHasExtension: true,
          gbExtensionAcquisitionMode: mode,
        }),
      );
      expect(screen.getByText(/토지·건물 일괄 취득 시 필요경비/)).toBeInTheDocument();
    });
  }

  it("증축이 없으면 열리지 않는다 (대조군)", () => {
    renderAcqBlock(gbAsset({ useEstimatedAcquisition: false, gbHasExtension: false }));
    expect(screen.queryByText(/토지·건물 일괄 취득 시 필요경비/)).toBeNull();
  });
});

// ── U5 · 결과 표 배지 ───────────────────────────────────────────────────

/** 3-way 표가 요구하는 최소 형태의 `aggregated`. */
function makeAggregated(modes: {
  land: boolean;
  building1: boolean;
  building2: boolean;
}): AggregateTransferResult {
  const prop = (propertyId: string, propertyLabel: string) => ({
    propertyId,
    propertyLabel,
    isExempt: false,
    transferPrice: 100_000_000,
    acquisitionPrice: 50_000_000,
    necessaryExpense: 1_000_000,
    capitalExpenditureForDisplay: 0,
    determinedTax: 0,
    transferGain: 49_000_000,
    longTermHoldingDeduction: 0,
    income: 49_000_000,
    rateGroup: "progressive" as const,
    lossOffsetFromSameGroup: 0,
    lossOffsetFromOtherGroup: 0,
    incomeAfterOffset: 49_000_000,
    allocatedBasicDeduction: 0,
    taxBaseShare: 0,
  });
  return {
    properties: [
      prop("land", "토지(1001)"),
      prop("building1", "건물(3001)"),
      prop("building2", "증축건물(3002)"),
    ],
    generalBuildingValuationDetail: {
      assetCards: [
        { propertyId: "land", usedEstimatedAcquisition: modes.land },
        { propertyId: "building1", usedEstimatedAcquisition: modes.building1 },
        { propertyId: "building2", usedEstimatedAcquisition: modes.building2 },
      ],
    },
  } as unknown as AggregateTransferResult;
}

describe("U5 — 결과 표 배지는 카드에서 파생된다 (하드코딩 금지)", () => {
  it("조합 A(원건물 실가 + 증축 환산) — 건물2 「(환산)」·「(개산공제 §163⑥)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: false, building1: false, building2: true })}
      />,
    );
    expect(screen.getAllByText("(실거래가)")).toHaveLength(2); // 토지·건물1
    expect(screen.getByText("(환산)")).toBeInTheDocument(); // 건물2
    expect(screen.getByText("(개산공제 §163⑥)")).toBeInTheDocument();
  });

  it("🔴 조합 B(원건물 실가 + 증축 실가) — 건물2도 「(실거래가)」·「(실제 필요경비)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: false, building1: false, building2: false })}
      />,
    );
    expect(screen.getAllByText("(실거래가)")).toHaveLength(3);
    expect(screen.queryByText("(환산)")).toBeNull();
    expect(screen.getByText("(실제 필요경비)")).toBeInTheDocument();
    expect(screen.queryByText("(개산공제 §163⑥)")).toBeNull();
  });

  it("🔴 조합 C(원건물 환산 + 증축 환산) — 세 자산 모두 「(환산)」", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: true })}
      />,
    );
    expect(screen.getAllByText("(환산)")).toHaveLength(3);
    expect(screen.queryByText("(실거래가)")).toBeNull();
  });

  it("🔴 조합 D(원건물 환산 + 증축 실가) — 토지·건물1 환산, 건물2 실거래가", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: false })}
      />,
    );
    expect(screen.getAllByText("(환산)")).toHaveLength(2);
    expect(screen.getByText("(실거래가)")).toBeInTheDocument();
    expect(screen.getByText("(실제 필요경비)")).toBeInTheDocument();
  });

  it("설명문에 모드 서술이 남아 있지 않다 (「건물1(3001, 실가)」 하드코딩 제거)", () => {
    render(
      <GeneralBuilding3WayTable
        aggregated={makeAggregated({ land: true, building1: true, building2: false })}
      />,
    );
    expect(screen.queryByText(/건물1\(3001, 실가\)/)).toBeNull();
  });
});
