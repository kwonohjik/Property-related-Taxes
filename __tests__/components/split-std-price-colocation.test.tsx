/**
 * 양도시 기준시가 **배치** — "쓰는 섹션 아래"에만 노출 (사용자 이미지 6·7).
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md
 * UI 설계: 같은 이름 `.ui.design.md` §1 케이스 인벤토리
 *
 * 배치 규칙(`saleStdPlacement` 단일 소스):
 *   · 일괄양도 → 축 A 한 카드(토지+건물) — 양도가액 안분 비율은 양도가액 축의 값
 *   · 구분양도 + 파트 환산 → 그 파트 섹션에 개별 카드 — 환산 분모는 파트의 값
 *   · 그 외 → 노출 없음(엔진이 소비하지 않는다)
 *
 * 불변식: 같은 testid가 화면에 **0 또는 1개**. `getAllBy*`는 0건에 throw하므로 `queryAllBy*`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

type Init = Partial<AssetForm>;

function Harness({ init }: { init: Init }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    hasSeperateLandAcquisitionDate: true,
    // 별개 취득 — 토지·건물 취득일 상이
    acquisitionDate: "2015-03-10",
    landAcquisitionDate: "2010-07-12",
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
      onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
      standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
      standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
      onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
      standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq ?? ""}
      onStandardPricePerSqmAtAcqChange={(v) => patch({ standardPricePerSqmAtAcq: v })}
      assetKind={asset.assetKind}
      transferDate="2026-03-06"
      jibun={asset.addressJibun}
      acquisitionArea={asset.acquisitionArea}
      onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
      hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
      onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
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
      onBuildingStandardPriceAtTransferChange={(v) => patch({ buildingStandardPriceAtTransfer: v })}
      landDirectExpenses={asset.landDirectExpenses ?? ""}
      onLandDirectExpensesChange={(v) => patch({ landDirectExpenses: v })}
      buildingDirectExpenses={asset.buildingDirectExpenses ?? ""}
      onBuildingDirectExpensesChange={(v) => patch({ buildingDirectExpenses: v })}
      asset={asset}
      onAssetChange={patch}
    />
  );
}

// 카드 wrapper 셀렉터 — 내부 필드로 카드 존재를 대리 판정하면 "카드는 남고 칸만 빠진" 거짓 통과.
const saleAxisCard = () => screen.queryAllByTestId("split-sale-std-card");
const landPartCard = () => screen.queryAllByTestId("split-land-std-transfer-card");
const buildingPartCard = () => screen.queryAllByTestId("split-building-std-transfer-card");
const buildingStdInput = () => screen.queryAllByTestId("split-building-std-transfer");
const landStdTotal = () => screen.queryAllByTestId("split-land-std-transfer");
const landStdPerSqm = () => screen.queryAllByTestId("split-land-std-transfer-persqm");
const transferCalcButton = () => screen.queryAllByRole("button", { name: "양도시 건물 기준시가 계산" });

const SPLIT_ACTUAL: Init = {
  saleSplitMode: "actual",
  landTransferPrice: "400,000,000",
};

describe("이미지 6 — 구분양도 + 토지만 환산 (매트릭스 #5)", () => {
  const CASE5: Init = {
    ...SPLIT_ACTUAL,
    landAcqMode: "estimated",
    buildingAcqMode: "actual",
    buildingAcquisitionPrice: "100,000,000",
  };

  it("축 A(양도가액 결정 방식)에는 양도시 기준시가 카드가 없다", () => {
    render(<Harness init={CASE5} />);
    expect(saleAxisCard(), "구분양도에서는 안분 비율이 필요 없다").toHaveLength(0);
  });

  it("토지 섹션에 토지 양도시 기준시가 카드가 있다", () => {
    render(<Harness init={CASE5} />);
    expect(landPartCard()).toHaveLength(1);
    expect(landStdPerSqm()).toHaveLength(1);
    expect(landStdTotal()).toHaveLength(1);
  });

  it("🔴 건물 기준시가 계산 기능은 화면 어디에도 없다", () => {
    render(<Harness init={CASE5} />);
    expect(buildingPartCard()).toHaveLength(0);
    expect(
      buildingStdInput(),
      "건물이 실지거래가액이면 건물 양도시 기준시가는 계산에 등장하지 않는다",
    ).toHaveLength(0);
    expect(transferCalcButton()).toHaveLength(0);
  });
});

describe("이미지 7 — 구분양도 + 건물만 환산 (매트릭스 #6)", () => {
  const CASE6: Init = {
    ...SPLIT_ACTUAL,
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "150,000,000",
  };

  it("축 A에는 양도시 기준시가 카드가 없다", () => {
    render(<Harness init={CASE6} />);
    expect(saleAxisCard()).toHaveLength(0);
  });

  it("건물 섹션에 건물 양도시 기준시가 카드 + 계산 런처가 있다", () => {
    render(<Harness init={CASE6} />);
    expect(buildingPartCard()).toHaveLength(1);
    expect(buildingStdInput()).toHaveLength(1);
    expect(transferCalcButton()).toHaveLength(1);
  });

  it("🔴 토지 양도시 기준시가 기능은 노출되지 않는다", () => {
    render(<Harness init={CASE6} />);
    expect(landPartCard()).toHaveLength(0);
    expect(landStdPerSqm()).toHaveLength(0);
  });
});

describe("배치 불변식 — 같은 카드가 두 곳에 동시 노출되지 않는다", () => {
  const cases: Array<[string, Init]> = [
    ["#1 일괄양도 + 양쪽 실가", { saleSplitMode: "apportioned", landAcqMode: "actual", buildingAcqMode: "actual" }],
    ["#3 일괄양도 + 양쪽 환산", { saleSplitMode: "apportioned", landAcqMode: "estimated", buildingAcqMode: "estimated" }],
    ["#4 구분양도 + 양쪽 실가", { ...SPLIT_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual" }],
    ["#5 구분양도 + 토지 환산", { ...SPLIT_ACTUAL, landAcqMode: "estimated", buildingAcqMode: "actual" }],
    ["#6 구분양도 + 건물 환산", { ...SPLIT_ACTUAL, landAcqMode: "actual", buildingAcqMode: "estimated" }],
    ["#7 구분양도 + 양쪽 환산", { ...SPLIT_ACTUAL, landAcqMode: "estimated", buildingAcqMode: "estimated" }],
    ["#8 구분양도 + 감정가액", { ...SPLIT_ACTUAL, landAcqMode: "appraisal", buildingAcqMode: "actual" }],
  ];

  it.each(cases)("%s — 각 testid는 0 또는 1개", (_name, init) => {
    render(<Harness init={init} />);
    for (const q of [saleAxisCard, landPartCard, buildingPartCard, buildingStdInput, landStdTotal, landStdPerSqm]) {
      expect(q().length).toBeLessThanOrEqual(1);
    }
    // 축 A와 파트 카드는 상호배타 — 동시에 뜨면 같은 필드를 두 곳에서 편집하게 된다.
    expect(saleAxisCard().length && (landPartCard().length || buildingPartCard().length)).toBeFalsy();
  });

  it("#1 일괄양도 → 축 A 카드 1개, 파트 카드 0개", () => {
    render(<Harness init={{ saleSplitMode: "apportioned", landAcqMode: "actual", buildingAcqMode: "actual" }} />);
    expect(saleAxisCard()).toHaveLength(1);
    expect(landPartCard()).toHaveLength(0);
    expect(buildingPartCard()).toHaveLength(0);
  });

  it("#4 구분양도 + 양쪽 실가 → 어떤 양도시 기준시가 카드도 없다", () => {
    render(<Harness init={{ ...SPLIT_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual" }} />);
    expect(saleAxisCard()).toHaveLength(0);
    expect(landPartCard()).toHaveLength(0);
    expect(buildingPartCard()).toHaveLength(0);
  });

  it("#7 구분양도 + 양쪽 환산 → 파트 카드 2개(서로 다른 섹션), 축 A 0개", () => {
    render(<Harness init={{ ...SPLIT_ACTUAL, landAcqMode: "estimated", buildingAcqMode: "estimated" }} />);
    expect(saleAxisCard()).toHaveLength(0);
    expect(landPartCard()).toHaveLength(1);
    expect(buildingPartCard()).toHaveLength(1);
  });
});

describe("건물 계산 런처 라벨 — 취득시·양도시 구분", () => {
  it("일반건물 + 양쪽 환산 → 두 런처의 라벨이 시점으로 구분된다", () => {
    render(
      <Harness
        init={{
          ...SPLIT_ACTUAL,
          assetKind: "building",
          landAcqMode: "estimated",
          buildingAcqMode: "estimated",
        }}
      />,
    );
    expect(
      screen.queryAllByRole("button", { name: "취득시 건물 기준시가 계산" }),
      "기본 라벨 「건물 기준시가 계산」이면 부분일치 셀렉터가 두 버튼을 모두 잡는다",
    ).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "양도시 건물 기준시가 계산" })).toHaveLength(1);
  });
});
