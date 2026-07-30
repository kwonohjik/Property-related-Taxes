/**
 * anchor: 별개취득 — 자산 전체 취득시 기준시가 UI **완전 숨김** (2026-07-30 사용자 확정).
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-part-gating.plan.md §2
 *
 * 종전 설계(`transfer-split-part-std-card-gating.plan.md` §6 Phase 3 — "입력형 → 읽기 전용
 * 파생 표시로 전환")는 **폐기**됐다. 파생 표시조차 두지 않는다:
 *   · 그 패널의 "합계 = 개산공제·안분 비율의 base" 안내가 **거짓**이었다 — 실제 개산공제 base는
 *     합계가 아니라 **각 파트 자기 기준시가**다(소득령 §163⑥1호 토지·2호 건물이 별개 호).
 *   · 엔진도 별개취득에서 결합 총액을 참조하지 않는다(`calcAcqStdPair` 파트 독립 분기).
 *
 * 불변식:
 *   · 별개취득이면 자산 전체 레벨에 취득시 기준시가 UI가 **0개**(입력형·읽기전용 모두)
 *   · 입력 정본은 **파트 카드**뿐 — 같은 폼 필드를 한 화면에서 두 번 입력받지 않는다
 *   · 자산 종류 무관(주택도 동일) — 별개취득엔 라목 결합 공시가 존재하지 않는다
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

/** 자산 전체 블록의 면적 입력 칸 — 별개취득에서는 존재하지 않아야 한다 */
const assetTotalAreaInput = () =>
  Array.from(document.querySelectorAll("label")).filter((l) => l.textContent?.trim() === "면적 (㎡)");
/** 폐기된 읽기 전용 3열 패널 — 어떤 조합에서도 0개여야 한다 */
const readonlyPanel = () => screen.queryAllByTestId("split-acq-std-readonly");
/** 자산 전체 입력형 총액 블록의 필수 표식 — 별개취득에서는 0개 */
const assetTotalStdBlock = () => screen.queryAllByTestId("acq-std-required-mark");
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

describe("H2 — 자산 전체 취득시 기준시가 UI 0개 (완전 숨김)", () => {
  it("H2-a 읽기 전용 파생 패널이 존재하지 않는다 (폐기)", () => {
    render(<Harness init={FILLED} />);
    expect(readonlyPanel(), "파생 표시조차 두지 않는다 — 합계는 개산공제 base가 아니다").toHaveLength(0);
  });

  it("H2-b 입력형 총액 블록도 존재하지 않는다 (재출현 회귀 방지)", () => {
    render(<Harness init={FILLED} />);
    expect(assetTotalStdBlock()).toHaveLength(0);
  });

  it("H2-c 파트 카드는 그대로 존재한다 (입력 경로 dead-end 방지)", () => {
    render(<Harness init={FILLED} />);
    expect(screen.queryAllByTestId("split-land-std-acq-card")).toHaveLength(1);
    expect(screen.queryAllByTestId("split-building-std-acq-card")).toHaveLength(1);
  });

  it("H2-d 파트 기준시가 미입력이어도 자산 전체 UI는 되살아나지 않는다", () => {
    render(<Harness init={{}} />);
    expect(readonlyPanel()).toHaveLength(0);
    expect(assetTotalStdBlock()).toHaveLength(0);
  });
});

describe("H3·H5 — 범위 한정 (회귀 0)", () => {
  /**
   * 2026-07-30 — **주택도 별개취득이면 자산 전체 블록을 숨긴다.**
   * 별개취득에는 라목 결합 공시가 존재하지 않으므로(§163⑥2호가목 "취득당시" 요건) 총액은
   * 사용자가 입력할 대상 자체가 아니다.
   */
  it("H3 주택도 별개취득이면 자산 전체 UI 0개", () => {
    render(<Harness init={{ ...FILLED, assetKind: "housing" }} />);
    expect(readonlyPanel(), "별개취득에는 라목 결합 공시가 없다").toHaveLength(0);
    expect(assetTotalStdBlock()).toHaveLength(0);
  });

  it("H5 비-별개취득(취득일 동일)은 종전 입력형 유지", () => {
    render(<Harness init={{ ...FILLED, landAcquisitionDate: "2025-08-29" }} />);
    expect(readonlyPanel()).toHaveLength(0);
    expect(assetTotalStdBlock(), "총액이 실재하므로 입력형 블록이 필요하다").toHaveLength(1);
  });
});

describe("H6 — 파트별 게이팅 (2026-07-30)", () => {
  it("H6-a 토지 실거래가 + 건물 환산 → 토지 카드는 prefill 소스로 노출되되 안내가 붙는다", () => {
    render(<Harness init={{ ...FILLED, landAcqMode: "actual", buildingAcqMode: "estimated" }} />);
    expect(screen.queryAllByTestId("split-land-std-acq-card")).toHaveLength(1);
    expect(
      screen.queryAllByTestId("split-land-std-calc-unused-note"),
      "실가 파트 기준시가는 취득가액 계산에 쓰이지 않는다",
    ).toHaveLength(1);
  });

  it("H6-b 양쪽 환산이면 안내 없이 정상 필수 카드", () => {
    render(<Harness init={FILLED} />);
    expect(screen.queryAllByTestId("split-land-std-calc-unused-note")).toHaveLength(0);
  });

  it("H6-c 양쪽 실가 + 양도가액 구분 → 토지·건물 카드 모두 미노출", () => {
    render(
      <Harness
        init={{
          landAcqMode: "actual",
          buildingAcqMode: "actual",
          landAcquisitionPrice: "300000000",
          buildingAcquisitionPrice: "250000000",
          landTransferPrice: "600000000",
          buildingTransferPrice: "400000000",
          saleSplitMode: "actual",
        }}
      />,
    );
    expect(screen.queryAllByTestId("split-land-std-acq-card")).toHaveLength(0);
    expect(screen.queryAllByTestId("split-building-std-acq-card")).toHaveLength(0);
  });
});
