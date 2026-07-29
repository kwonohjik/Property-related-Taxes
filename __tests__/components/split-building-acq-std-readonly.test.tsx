/**
 * anchor: 일반건물 별개취득 — 자산 전체 취득시 기준시가 블록을 **읽기 전용 파생**으로 전환 (D5).
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md §6 Phase 3
 *
 * 🔴 결함: `toPropertyKind`가 `building → building_non_residential`이라 자산 전체 블록이
 *   area 모드(㎡당 단가 + 면적 + 총액)로 렌더된다. 파트 토지 카드도 **같은 폼 필드**
 *   (`standardPricePerSqmAtAcq`·`acquisitionArea`)를 입력받아 한 화면에 같은 값이 두 번 노출된다.
 *   게다가 별개취득 + 건물분 명시 입력 시 엔진(`calcAcqStdPair`, split-gain.ts:52-56)은
 *   결합 총액을 **아예 참조하지 않으므로**, 사용자는 쓰이지도 않는 총액 칸을 채우게 된다.
 *
 * 불변식:
 *   · **입력 정본은 파트 카드** — 자산 전체 블록은 파생값 읽기 전용 표시로만 남는다
 *   · 파생 산식은 엔진과 동일 절사(`Math.floor(sqm × area)`) — UI 재계산 드리프트 금지
 *   · 주택(라목)은 대상 아님 — 결합 공시가 정본이라 총액 입력이 계속 필요
 *   · 비-별개취득(겸용·소유자분리 취득일 동일)은 종전 입력형 유지
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function Harness({ init = {} }: { init?: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2015-01-08",
    hasSeperateLandAcquisitionDate: true,
    addressJibun: "서울특별시 강남구 삼성동 100",
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: "111564000",
    buildingStandardPriceAtTransfer: "100835280",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={false}
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

/** 자산 전체 블록의 입력 칸 — 읽기 전용 전환 후에는 존재하지 않아야 한다 */
const assetTotalAreaInput = () =>
  Array.from(document.querySelectorAll("label")).filter((l) => l.textContent?.trim() === "면적 (㎡)");
const readonlyPanel = () => screen.queryAllByTestId("split-acq-std-readonly");
const partAreaInput = () => screen.queryAllByTestId("split-land-std-acq-area");

const FILLED: Partial<AssetForm> = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "200",
  buildingStandardPriceAtAcq: "350000000",
};

describe("H1 — 중복 입력 제거", () => {
  it("H1 일반건물 별개취득 — 자산 전체 블록의 ㎡당·면적 입력 칸이 사라지고 파트 카드에만 존재", () => {
    render(<Harness init={FILLED} />);
    expect(
      assetTotalAreaInput(),
      "같은 폼 필드(acquisitionArea)를 한 화면에서 두 번 입력받으면 안 된다",
    ).toHaveLength(0);
    expect(partAreaInput(), "입력 정본은 파트 카드").toHaveLength(1);
  });
});

describe("H2 — 읽기 전용 파생 표시", () => {
  it("H2-a 토지분·건물분·합계가 파트 입력값에서 파생돼 표시된다", () => {
    render(<Harness init={FILLED} />);
    const panel = readonlyPanel()[0];
    expect(panel).toBeTruthy();
    // 토지분 = floor(1,000,000 × 200) = 200,000,000 / 건물분 350,000,000 / 합계 550,000,000
    expect(panel.textContent).toContain("200,000,000");
    expect(panel.textContent).toContain("350,000,000");
    expect(panel.textContent).toContain("550,000,000");
  });

  it("H2-b 엔진과 동일한 floor 절사 (표시값 ≠ 계산값 드리프트 금지)", () => {
    // 12,345 × 33.33 = 411,458.85 → floor 411,458. 반올림하면 411,459로 엔진과 어긋난다.
    render(<Harness init={{ ...FILLED, standardPricePerSqmAtAcq: "12345", acquisitionArea: "33.33" }} />);
    const panel = readonlyPanel()[0];
    expect(panel.textContent).toContain("411,458");
    expect(panel.textContent).not.toContain("411,459");
  });

  it("H2-c 미입력이면 '자동 계산' 안내 (0원으로 표시하지 않는다)", () => {
    render(<Harness init={{ buildingStandardPriceAtAcq: "350000000" }} />);
    const panel = readonlyPanel()[0];
    expect(panel.textContent).toContain("자동 계산");
  });
});

describe("H3·H5 — 범위 한정 (회귀 0)", () => {
  it("H3 주택은 대상 아님 — 결합 공시 총액 입력 칸 유지", () => {
    render(<Harness init={{ ...FILLED, assetKind: "housing" }} />);
    expect(readonlyPanel(), "라목 결합 공시가 정본이라 총액을 사용자가 입력한다").toHaveLength(0);
    expect(screen.queryAllByText(/^취득시 기준시가 \(원\)/).length).toBeGreaterThan(0);
  });

  it("H5 비-별개취득(취득일 동일)은 종전 입력형 유지", () => {
    render(<Harness init={{ ...FILLED, landAcquisitionDate: "2025-08-29" }} />);
    expect(readonlyPanel()).toHaveLength(0);
  });
});
