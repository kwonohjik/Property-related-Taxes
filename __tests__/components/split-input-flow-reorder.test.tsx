/**
 * anchor: 별개취득 입력 흐름 재배치.
 *
 * 계획서: docs/02-design/features/transfer-split-input-flow-reorder.plan.md
 *
 * 🔴 결함①: 「토지·건물 취득일 다름」 토글(:226)을 켜도 그 아래에 아무것도 나타나지 않는다 —
 *   토지 취득일·양도가액 구분 UI가 약 490줄 아래(:717)에 렌더돼, 취득가액 산정 방식·취득가액·
 *   취득시 기준시가 블록 전체를 지나야 보인다.
 * 🔴 결함②: 양도가액 구분(규칙 ①)이 취득가액 파트별 입력(규칙 ②)**보다 뒤**에 온다 — 역순.
 * 🔴 결함③: 계산에 쓰이지 않는 「취득시 기준시가」가 "사용되지 않습니다" 안내와 함께 계속 떠 있다.
 *
 * 불변식:
 *   · 토글 직하에 [토지 취득일 | 건물 취득일] 2열 → 그 아래 양도가액 구분(축 A)
 *   · 취득가액 파트별(축 B)은 「취득가액 산정 방식」 뒤 유지 (2026-07-16 근거 보존)
 *   · 취득시 기준시가는 `requiresAcqStdPrice` 술어가 true일 때만 렌더 —
 *     **겸용·상가·일반건물·PHD 길잡이 문구는 게이트 밖**(숨기면 입력 위치를 알 수 없다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

type Init = Partial<AssetForm> & {
  useEstimatedAcquisition?: boolean;
  hasSeperateLandAcquisitionDate?: boolean;
};

function Harness({ init = {} }: { init?: Init }) {
  const { useEstimatedAcquisition = false, ...assetInit } = init;
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2025-01-08",
    hasSeperateLandAcquisitionDate: true,
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...assetInit,
  } as AssetForm);

  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));

  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
      onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
      standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
      standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
      onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
      assetKind={asset.assetKind}
      transferDate="2026-03-06"
      jibun={asset.addressJibun}
      acquisitionArea={asset.acquisitionArea}
      onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
      hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
      onHasSeperateLandAcquisitionDateChange={(v) =>
        patch({ hasSeperateLandAcquisitionDate: v })
      }
      landAcquisitionDate={asset.landAcquisitionDate}
      onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
      selfOwns={asset.selfOwns ?? "both"}
      onSelfOwnsChange={(v) => patch({ selfOwns: v })}
      landTransferPrice={asset.landTransferPrice ?? ""}
      onLandTransferPriceChange={(v) => patch({ landTransferPrice: v })}
      buildingTransferPrice={asset.buildingTransferPrice ?? ""}
      onBuildingTransferPriceChange={(v) => patch({ buildingTransferPrice: v })}
      landAcquisitionPrice={asset.landAcquisitionPrice ?? ""}
      onLandAcquisitionPriceChange={(v) => patch({ landAcquisitionPrice: v })}
      buildingAcquisitionPrice={asset.buildingAcquisitionPrice ?? ""}
      onBuildingAcquisitionPriceChange={(v) => patch({ buildingAcquisitionPrice: v })}
      landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer ?? ""}
      onLandStandardPriceAtTransferChange={(v) => patch({ landStandardPriceAtTransfer: v })}
      buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer ?? ""}
      onBuildingStandardPriceAtTransferChange={(v) =>
        patch({ buildingStandardPriceAtTransfer: v })
      }
      landDirectExpenses={asset.landDirectExpenses ?? ""}
      onLandDirectExpensesChange={(v) => patch({ landDirectExpenses: v })}
      buildingDirectExpenses={asset.buildingDirectExpenses ?? ""}
      onBuildingDirectExpensesChange={(v) => patch({ buildingDirectExpenses: v })}
      asset={asset}
      onAssetChange={patch}
    />
  );
}

/** 양쪽 실지거래가액 + 양도가액 구분 근거 有 → 취득시 기준시가 불요 (케이스 2) */
const CASE_2: Init = {
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "240000000",
  buildingAcquisitionPrice: "60000000",
  saleSplitMode: "actual",
  landTransferPrice: "400000000",
  buildingTransferPrice: "100000000",
};

const acqStdLabel = () => screen.queryAllByText(/^취득시 기준시가 \(원\)/);

describe("R1·R2 — 토글 직하 날짜 2열", () => {
  it("R1 토글 ON — 토지·건물 취득일이 같은 grid 안에 나란히", () => {
    render(<Harness />);
    const grid = screen.getByTestId("acq-date-split-grid");
    expect(grid.contains(screen.getByTestId("acq-date-land"))).toBe(true);
    expect(grid.contains(screen.getByTestId("acq-date-building"))).toBe(true);
    expect(grid.className).toMatch(/sm:grid-cols-2/);
  });

  it("R2 토글 OFF — 토지 취득일 미렌더, 건물 취득일 1개", () => {
    render(<Harness init={{ hasSeperateLandAcquisitionDate: false }} />);
    expect(screen.queryByTestId("acq-date-land")).toBeNull();
    expect(screen.getAllByTestId("acq-date-building")).toHaveLength(1);
  });

  it("R2-b 토글 ON — 건물 취득일이 정확히 1개 (OFF/ON 분기 중복 렌더 금지)", () => {
    render(<Harness />);
    expect(screen.getAllByTestId("acq-date-building")).toHaveLength(1);
  });

  it("R2-c 토글 chip은 grid 밖(앞)에 있다", () => {
    render(<Harness />);
    const chip = screen.getByText("토지·건물 취득일 다름");
    const grid = screen.getByTestId("acq-date-split-grid");
    expect(grid.contains(chip)).toBe(false);
    expect(
      grid.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });
});

describe("R3 — 축 A(양도가액 구분)가 축 B(취득가액 파트별)보다 앞", () => {
  it("규칙 ① 양도가액 구분 → 규칙 ② 취득가액 순서", () => {
    render(<Harness />);
    const sale = screen.getByTestId("sale-split-mode");
    const acq = screen.getByTestId("part-acq-mode-land");
    expect(
      sale.compareDocumentPosition(acq) & Node.DOCUMENT_POSITION_FOLLOWING,
      "축 A가 축 B보다 앞에 와야 한다",
    ).toBeTruthy();
  });
});

describe("R4~R7·R10 — 취득시 기준시가 표시 게이트", () => {
  it("R4 케이스 2(양쪽 실가 + 양도가액 구분) — 숨김", () => {
    render(<Harness init={CASE_2} />);
    expect(acqStdLabel()).toHaveLength(0);
    expect(screen.queryByTestId("acq-std-required-mark")).toBeNull();
  });

  it("R5 주택 + 건물 환산 — 표시 (라목 결합 총액이 역산 소스)", () => {
    render(<Harness init={{ ...CASE_2, assetKind: "housing", buildingAcqMode: "estimated" }} />);
    expect(
      acqStdLabel().length,
      "주택 건물분은 «결합 총액 − 토지분» 역산이 유일한 경로 — 숨기면 취득가액이 조용히 0",
    ).toBeGreaterThan(0);
  });

  it("R6 케이스 2 → 토지 환산 전환 시 재등장", () => {
    render(<Harness init={{ ...CASE_2, landAcqMode: "estimated" }} />);
    expect(acqStdLabel().length).toBeGreaterThan(0);
  });

  it("R7 케이스 3(일괄양도 + 양도시 기준시가 미입력) — 표시 (회귀 0)", () => {
    render(
      <Harness
        init={{ ...CASE_2, saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" }}
      />,
    );
    expect(acqStdLabel().length).toBeGreaterThan(0);
  });

  it("R10 분리 OFF + 환산 — 표시 (비분리 환산 경로 회귀 0)", () => {
    render(
      <Harness init={{ hasSeperateLandAcquisitionDate: false, useEstimatedAcquisition: true }} />,
    );
    expect(acqStdLabel().length).toBeGreaterThan(0);
  });
});

describe("R9 — 길잡이 문구는 게이트 밖 (숨기면 입력 위치를 알 수 없다)", () => {
  it("겸용주택은 「겸용주택 분리계산 영역에서 입력합니다」 문구가 그대로 렌더", () => {
    render(<Harness init={{ ...CASE_2, isMixedUseHouse: true }} />);
    expect(
      screen.getByText(/겸용주택 분리계산 영역에서 입력합니다/),
      "게이트를 5-way 분기 최상위에 걸면 이 길잡이까지 사라진다",
    ).toBeTruthy();
    // 겸용은 실입력 자체가 없다
    expect(acqStdLabel()).toHaveLength(0);
  });
});
