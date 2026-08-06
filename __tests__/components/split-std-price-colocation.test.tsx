/**
 * 양도시 기준시가 **배치** — 항상 축 A (Phase 1-D).
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md
 *        · general-building-sale-split-mode.plan.md §12.7 (R-7)
 * UI 설계: 같은 이름 `.ui.design.md` §1 케이스 인벤토리
 *
 * ## 🔴 2026-08-06 (Phase 1-D) — 배치 규칙이 **뒤집혔다**
 *
 * 종전(2026-07-30 co-location):
 *   · 일괄양도 → 축 A 한 카드(토지+건물)
 *   · 구분양도 + 파트 환산 → 그 파트 섹션에 개별 카드 — **환산 분모는 파트의 값**
 *   · 그 외 → 노출 없음(엔진이 소비하지 않는다)
 *
 * 「소득세법」 제100조 **제3항**이 구분 기장 가액을 **안분계산한 가액과 비교**하도록 요구하고,
 * 안분값은 양도시 토지·건물 기준시가 **양쪽**에서 나온다 ⇒ 「구분양도에서 이 값은 환산 분모
 * 전용」이라는 전제가 깨졌다. **실가 파트의 기준시가도 판정에 등장한다.**
 *
 * ⇒ **모든 조합에서 축 A 한 카드**(`saleStdPlacement` — 인자 없는 상수).
 *
 * ⏳ **부수 효과**: 건물 기준시가 계산 런처가 시점별로 2개가 된다(축 A 「양도시…」 + 파트 섹션
 *    「취득시…」). 종전 co-location에서만 2시점 통합 런처 1개였고, **일괄양도에서는 이미 2개**였다
 *    — 1-D는 구분양도를 일괄양도와 같은 모양으로 통일한 것이다(신규 회귀 유형이 아니다).
 *    통합 런처 복원은 Phase 1-E(⑤ UI)에서 판단한다.
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
// 취득시·양도시가 한 카드에 오면 런처는 2시점 통합 모달 1개다("건물 기준시가 계산").
const bothCalcButton = () => screen.queryAllByRole("button", { name: "건물 기준시가 계산" });
const transferOnlyCalcButton = () => screen.queryAllByRole("button", { name: "양도시 건물 기준시가 계산" });

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

  it("🔴 축 A에 양도시 기준시가 카드가 **있다** (종전 계약의 반대)", () => {
    render(<Harness init={CASE5} />);
    expect(saleAxisCard(), "구분양도에서도 §100③ 판정에 안분값이 필요하다").toHaveLength(1);
  });

  it("토지 파트 섹션에는 양도시 카드가 없다 — 축 A로 통합됐다", () => {
    render(<Harness init={CASE5} />);
    expect(landPartCard()).toHaveLength(0);
    // 축 A 카드 안에 토지 2요소(㎡당 공시지가·총액)가 들어 있다.
    expect(landStdPerSqm()).toHaveLength(1);
    expect(landStdTotal()).toHaveLength(1);
  });

  it("🔴 건물이 실가여도 건물 양도시 기준시가 입력이 **제공된다**", () => {
    render(<Harness init={CASE5} />);
    expect(buildingPartCard()).toHaveLength(0);
    expect(
      buildingStdInput(),
      "실가 파트의 기준시가도 §100③ 안분값의 분모로 등장한다 — 없으면 판정 자체가 불가능하다",
    ).toHaveLength(1);
    // 축 A 카드의 런처는 양도시 전용이다(취득시 런처는 파트 섹션에 따로 있다).
    expect(transferOnlyCalcButton()).toHaveLength(1);
  });
});

describe("이미지 7 — 구분양도 + 건물만 환산 (매트릭스 #6)", () => {
  const CASE6: Init = {
    ...SPLIT_ACTUAL,
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "150,000,000",
  };

  it("🔴 축 A에 양도시 기준시가 카드가 있다", () => {
    render(<Harness init={CASE6} />);
    expect(saleAxisCard()).toHaveLength(1);
  });

  it("건물 양도시 기준시가는 축 A 카드에 있고 런처는 시점 전용이다", () => {
    render(<Harness init={CASE6} />);
    expect(buildingPartCard()).toHaveLength(0);
    expect(buildingStdInput()).toHaveLength(1);
    // ⏳ 통합 런처(2시점)는 co-location 배치에서만 성립했다 — 위 헤더 「부수 효과」 참조.
    expect(transferOnlyCalcButton(), "축 A 카드의 런처는 양도시 전용").toHaveLength(1);
  });

  it("🔴 토지가 실가여도 토지 양도시 기준시가 기능이 제공된다", () => {
    render(<Harness init={CASE6} />);
    expect(landPartCard()).toHaveLength(0);
    expect(landStdPerSqm(), "안분값 분모에 토지분이 필요하다").toHaveLength(1);
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

  it("🔴 #4 구분양도 + 양쪽 실가 → 축 A 카드 1개 (우회 경로를 남기지 않는다)", () => {
    render(<Harness init={{ ...SPLIT_ACTUAL, landAcqMode: "actual", buildingAcqMode: "actual" }} />);
    expect(
      saleAxisCard(),
      "이 조합에서 카드를 숨기면 칸을 비워 두는 것만으로 §100③ 가드를 우회할 수 있다",
    ).toHaveLength(1);
    expect(landPartCard()).toHaveLength(0);
    expect(buildingPartCard()).toHaveLength(0);
  });

  it("🔴 #7 구분양도 + 양쪽 환산 → 축 A 1개, 파트 카드 0개", () => {
    render(<Harness init={{ ...SPLIT_ACTUAL, landAcqMode: "estimated", buildingAcqMode: "estimated" }} />);
    expect(saleAxisCard()).toHaveLength(1);
    expect(landPartCard()).toHaveLength(0);
    expect(buildingPartCard()).toHaveLength(0);
  });
});

/**
 * 이미지 8·9 — 주택 별개취득도 **건물분 취득시 기준시가를 파트별 독립 입력**한다.
 *
 * 종전에는 주택을 라목 결합 공시 역산 전용으로 두어 건물 섹션에 입력·표시가 없었다.
 * §163⑥2호가목은 "라목의 주택 **취득당시**의 라목 가액 × 3/100"이라 **취득 당시 라목 주택으로서의
 * 가액이 존재**해야 적용된다 — 토지를 먼저 취득하고 건물을 나중에 신축·취득했다면 토지 취득
 * 당시엔 주택이 없어 라목 결합 공시가 애초에 없다(§163⑥1호·2호가 각각 적용).
 */
describe("이미지 8·9 — 주택 별개취득 건물분 취득시 기준시가 파트 독립", () => {
  const CASE9: Init = {
    ...SPLIT_ACTUAL,
    assetKind: "housing",
    landAcqMode: "actual",
    buildingAcqMode: "estimated",
    landAcquisitionPrice: "150,000,000",
  };

  const acqCard = () => screen.queryAllByTestId("split-building-std-acq-card");
  const acqInput = () => screen.queryAllByTestId("split-building-std-acq");

  it("🔴 주택도 건물 취득시 기준시가 입력 카드가 노출된다", () => {
    render(<Harness init={CASE9} />);
    expect(acqCard(), "별개취득에는 라목 결합 공시가 없어 파트 독립이 정본").toHaveLength(1);
    expect(acqInput()).toHaveLength(1);
  });

  it("⏳ 런처가 시점별로 분리된다 — 취득시(파트 섹션) + 양도시(축 A)", () => {
    render(<Harness init={CASE9} />);
    // 종전에는 co-location 덕에 한 카드에 두 시점이 모여 통합 런처 1개였다. 1-D가 양도시를
    // 축 A로 옮기면서 시점별 런처가 됐다 — **일괄양도에서는 이미 이 모양**이었다(신규 유형 아님).
    expect(screen.queryAllByRole("button", { name: "건물 기준시가 계산" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "취득시 건물 기준시가 계산" })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "양도시 건물 기준시가 계산" })).toHaveLength(1);
  });

  it("양도시 칸이 없는 조합(감정가액)에서는 취득시 전용 런처", () => {
    render(<Harness init={{ ...CASE9, buildingAcqMode: "appraisal" }} />);
    expect(screen.queryAllByRole("button", { name: "취득시 건물 기준시가 계산" })).toHaveLength(1);
  });

  it("역산 안내(dangling reference)는 더 이상 표시하지 않는다", () => {
    render(<Harness init={CASE9} />);
    expect(screen.queryAllByTestId("split-housing-building-derived-note")).toHaveLength(0);
  });

  it("취득시 기준시가가 계산에 불필요하면(양쪽 실가) 카드도 없다", () => {
    render(<Harness init={{ ...CASE9, buildingAcqMode: "actual", buildingAcquisitionPrice: "100,000,000" }} />);
    expect(acqCard()).toHaveLength(0);
  });
});

describe("⏳ 건물 계산 런처 — 시점별 분리 (Phase 1-D)", () => {
  it("일반건물 + 양쪽 환산 → 취득시·양도시 런처 각 1개", () => {
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
    // 통합 런처(2시점)는 co-location 배치에서만 성립했다. 양도시 값이 축 A로 옮겨져 시점별로
    // 나뉘었고, **일괄양도에서는 이미 이 모양**이었다 — 통합 복원 여부는 1-E(⑤ UI)에서 판단한다.
    expect(screen.queryAllByRole("button", { name: "건물 기준시가 계산" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "취득시 건물 기준시가 계산" })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "양도시 건물 기준시가 계산" })).toHaveLength(1);
  });
});
