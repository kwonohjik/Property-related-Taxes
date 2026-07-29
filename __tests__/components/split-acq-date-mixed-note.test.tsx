/**
 * anchor: 겸용주택 취득일 2열 자동 강제 시 안내 + PHD 3시점 「계산 제외」 입력 위치 명시 (A안).
 *
 * 계획서: docs/02-design/features/e2e-preexisting-failures-4.plan.md §4 Phase 2
 *
 * 🔴 D-C: 겸용주택 토글이 `hasSeperateLandAcquisitionDate`를 **강제 ON** 하면
 *   (`MixedUseSection.tsx:44-50`) 취득일이 `[토지 | 건물]` 2열이 되는데 **왜 두 칸인지 안내가 없다**.
 *   사용자가 앞 칸(토지)만 채우면 건물 취득일이 비어, PHD 3시점 모달이
 *   "취득시 (연도 미상) — 계산 제외"로 취득 시점을 통째로 빼고 환산취득가 산정이 조용히 축소된다.
 *   그 문구도 **어디를 채워야 하는지** 알려주지 않는다.
 *
 * 불변식:
 *   · 2열 렌더 조건은 **불변** — 겸용 엔진이 토지 취득일을 실제로 소비하므로
 *     (`transfer-tax-mixed-use.ts:136-139` LTHD 기산 등) 단일 칸으로 되돌리면 기능 제거가 된다
 *   · 안내는 **의도하지 않은 강제**(겸용)에만 — 사용자가 직접 켠 경우는 이미 의도 표명이라 노이즈
 *   · 단언은 **testid**로 — 문구 매칭은 재배치 때 또 깨진다(D-B가 그 사례)
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqDateSection } from "@/components/calc/transfer/CompanionAcqDateSection";
import {
  PhdBuildingStdPriceModalButton,
  type PointMeta,
} from "@/components/calc/building-std-price/PhdBuildingStdPriceModalButton";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { BlockProps } from "@/components/calc/transfer/CompanionAcqPurchaseBlock.types";

afterEach(cleanup);

function DateHarness({
  isMixedUse,
  isSplit = true,
}: {
  isMixedUse: boolean;
  isSplit?: boolean;
}) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    landAcquisitionDate: "2005-06-10",
    hasSeperateLandAcquisitionDate: isSplit,
    isMixedUseHouse: isMixedUse,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));

  const block = {
    acquisitionDate: asset.acquisitionDate,
    onAcquisitionDateChange: (v: string) => patch({ acquisitionDate: v }),
    landAcquisitionDate: asset.landAcquisitionDate,
    onLandAcquisitionDateChange: (v: string) => patch({ landAcquisitionDate: v }),
    hasSeperateLandAcquisitionDate: asset.hasSeperateLandAcquisitionDate,
    onHasSeperateLandAcquisitionDateChange: (v: boolean) =>
      patch({ hasSeperateLandAcquisitionDate: v }),
    asset,
    onAssetChange: patch,
    transferDate: "2026-03-06",
    assetKind: asset.assetKind,
  } as unknown as BlockProps;

  return (
    <CompanionAcqDateSection
      block={block}
      isSplitable
      isSplit={isSplit}
      isMixedUse={isMixedUse}
      acqDateLabel={isSplit ? "건물 취득일" : "취득일"}
      saleStdInSaleAxis
    />
  );
}

const mixedNote = () => screen.queryAllByTestId("split-acq-date-mixed-note");

describe("E1·E2 — 겸용 자동 강제 2열 안내 (A-1)", () => {
  it("E1 겸용주택 — 2열 유지 + 안내 노출", () => {
    render(<DateHarness isMixedUse />);
    // 렌더 조건 불변 — 2열이 사라지면 토지 취득일 입력 경로가 없어진다(B안 기각 근거)
    expect(screen.getAllByTestId("acq-date-land")).toHaveLength(1);
    expect(screen.getAllByTestId("acq-date-building")).toHaveLength(1);
    expect(mixedNote(), "왜 두 칸인지 알려주지 않으면 사용자는 한 칸만 채운다").toHaveLength(1);
    expect(mixedNote()[0].textContent).toMatch(/각각/);
  });

  it("E2 겸용 아님(사용자가 직접 켠 분리) — 안내 미노출", () => {
    render(<DateHarness isMixedUse={false} />);
    expect(screen.getAllByTestId("acq-date-land")).toHaveLength(1);
    expect(
      mixedNote(),
      "직접 켠 것은 «취득일이 다르다»는 의도 표명 — 안내는 의도하지 않은 강제에만 붙인다",
    ).toHaveLength(0);
  });

  it("E2-b 분리 OFF — 안내 미노출", () => {
    render(<DateHarness isMixedUse isSplit={false} />);
    expect(mixedNote()).toHaveLength(0);
  });
});

// ── PHD 3시점 모달 (A-2) ────────────────────────────────────────
const POINTS_NO_ACQ: PointMeta[] = [
  { key: "acquisition", label: "취득시", year: undefined, landPricePerM2: "" },
  { key: "firstDisclosure", label: "최초공시일", year: 2015, landPricePerM2: "" },
  { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
];
const POINTS_ALL: PointMeta[] = [
  { key: "acquisition", label: "취득시", year: 2010, landPricePerM2: "" },
  { key: "firstDisclosure", label: "최초공시일", year: 2015, landPricePerM2: "" },
  { key: "transfer", label: "양도시", year: 2025, landPricePerM2: "" },
];

function ModalHarness({ points }: { points: PointMeta[] }) {
  return <PhdBuildingStdPriceModalButton points={points} onApply={() => {}} />;
}

const excludedNote = () => screen.queryAllByTestId("phd-point-excluded-note");

describe("E3·E4 — PHD 3시점 「계산 제외」 안내 (A-2)", () => {
  it("E3 건물 취득일 미입력 → 계산 제외 안내에 **입력 위치**가 있다", () => {
    render(<ModalHarness points={POINTS_NO_ACQ} />);
    fireEvent.click(screen.getByRole("button", { name: /3시점 건물기준시가 일괄 계산/ }));

    expect(excludedNote(), "연도 미상 시점은 1개(취득)").toHaveLength(1);
    expect(
      excludedNote()[0].textContent,
      "어디를 채워야 하는지 알려주지 않으면 사용자가 결함을 해소할 수 없다",
    ).toMatch(/건물 취득일/);
  });

  it("E4 3시점 연도 모두 확정 → 계산 제외 안내 없음 (회귀 가드)", () => {
    render(<ModalHarness points={POINTS_ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /3시점 건물기준시가 일괄 계산/ }));

    expect(excludedNote()).toHaveLength(0);
    expect(screen.getAllByText(/취득당시/).length, "취득 시점 행이 산출 대상에 든다").toBeGreaterThan(0);
  });
});

// ── 겸용주택 축 A 미노출 (N-2) ──────────────────────────────────
//
// 🔴 겸용은 `hasSeperateLandAcquisitionDate`가 강제 ON이라 `isSplit`이 true가 되고,
//   축 A(양도가액 구분 + 양도시 기준시가 카드)가 함께 렌더됐다. 그러나 실측 결과
//   **겸용에서 축 A 입력은 소비되지 않는다**:
//     · `app/api/calc/transfer/route.ts:568` 겸용 분기가 **early-return** —
//       `calculateTransferTax`(→ calcTransferGain → calcSplitGain)를 호출조차 하지 않는다
//     · `transfer-tax-mixed-use*.ts`가 `landTransferPrice`·`saleSplitMode`·
//       `buildingStandardPriceAtTransfer`를 읽는 지점 0건 (양도가액은 자체 4부분 안분으로 산출)
//   게다가 겸용은 이미 `MixedUseStdPrice`에서 3시점 기준시가를 입력받아 **중복 노출**이었다.
//   (사용자 보고 D1 "필요 없는 UI가 함께 보여 혼란"과 같은 클래스)
//
// ⚠️ 취득일 2열은 **유지**한다 — 겸용 엔진이 `landAcquisitionDate`를 실제로 소비한다
//    (transfer-tax-mixed-use.ts:136-139 LTHD 기산 등). 축 A만 숨긴다.
describe("E6 — 겸용주택은 축 A(양도가액 구분) 미노출", () => {
  it("E6-a 겸용 — 축 A 미렌더, 취득일 2열은 유지", () => {
    render(<DateHarness isMixedUse />);
    expect(
      screen.queryAllByTestId("sale-split-mode"),
      "겸용은 4부분 안분이 양도가액을 지배 — 축 A 입력은 엔진에 도달하지 않는다",
    ).toHaveLength(0);
    expect(screen.getAllByTestId("acq-date-land"), "취득일 2열은 엔진이 소비하므로 유지").toHaveLength(1);
    expect(screen.getAllByTestId("acq-date-building")).toHaveLength(1);
  });

  it("E6-b 비-겸용 분리 — 축 A 종전대로 노출 (회귀 가드)", () => {
    render(<DateHarness isMixedUse={false} />);
    expect(screen.getAllByTestId("sale-split-mode")).toHaveLength(1);
  });
});

// ── 겸용주택 축 B 미노출 (N-3) ──────────────────────────────────
//
// 🔴 축 A와 **같은 클래스**. 겸용 엔진 input 타입(`MixedUseAssetInput`,
//   `types/transfer-mixed-use.types.ts:45`)에는 `landAcqMode`·`landAcquisitionPrice`·
//   `landDirectExpenses` 같은 파트 필드가 **아예 정의되어 있지 않다**
//   (`landTransferPrice`는 결과 타입 `MixedUseHousingPart`의 "산식 표시용" 필드).
//   겸용 취득가액은 상단 총액을 §100② 기준시가 비율로 안분하고, 자본적지출은
//   「실제 필요경비」 칸(`MixedUseAssetMajorStdPrice.tsx:161·183` → `housingInheritedExpense`)
//   에서 따로 받는다 → 축 B는 중복이자 무용이었다(실측: 겸용에서 라디오 2·금액칸·자본적지출 전부 렌더).
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";

function PurchaseHarness({ isMixedUse }: { isMixedUse: boolean }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    landAcquisitionDate: "2005-06-10",
    hasSeperateLandAcquisitionDate: true,
    isMixedUseHouse: isMixedUse,
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
      assetKind={asset.assetKind}
      transferDate="2026-03-06"
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

describe("E7 — 겸용주택은 축 B(파트별 취득가액) 미노출", () => {
  it("E7-a 겸용 — 축 B 전부 미렌더", () => {
    render(<PurchaseHarness isMixedUse />);
    expect(screen.queryAllByTestId("part-acq-mode-land")).toHaveLength(0);
    expect(screen.queryAllByTestId("part-acq-mode-building")).toHaveLength(0);
    expect(
      screen.queryAllByText(/토지 자본적지출/),
      "겸용 자본적지출은 「실제 필요경비」 칸이 정본 — 축 B 칸은 엔진에 도달하지 않는다",
    ).toHaveLength(0);
  });

  it("E7-b 겸용 — 상단 총액 취득가액은 유지 (§100② 피안분액)", () => {
    render(<PurchaseHarness isMixedUse />);
    expect(
      screen.queryAllByText(/취득가액 산정 방식/).length,
      "총액 입력이 사라지면 겸용 안분의 피안분액이 없어진다",
    ).toBeGreaterThan(0);
  });

  it("E7-c 비-겸용 분리 — 축 B 종전대로 노출 (회귀 가드)", () => {
    render(<PurchaseHarness isMixedUse={false} />);
    expect(screen.queryAllByTestId("part-acq-mode-land")).toHaveLength(1);
    expect(screen.queryAllByTestId("part-acq-mode-building")).toHaveLength(1);
  });
});
