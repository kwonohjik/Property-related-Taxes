/**
 * anchor — 일체 주택 본인 신축 «건물분 가산세 base» ⑤ 입력 카드 (Q-12 PR-2).
 *
 * 노출은 `selfBuiltHousingScope` 하나 — ④ 전송·⑧ 필수와 같은 술어다. 이 파일은 (1) 카드가 술어대로 칸을 그리고 지우는지,
 * (2) 입력이 onChange 로만 쓰이는지(useEffect → store 미러링 없음), (3) `CompanionAcqPurchaseBlock`(첫 자산·함께 양도 자산·지분 카드 공용)이 실제로 카드를 마운트하는지를 잰다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { SelfBuiltHousingShareBlock } from "@/components/calc/transfer/SelfBuiltHousingShareBlock";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const noop = () => {};
const TD = "2026-03-01";
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2022-01-10",
    useEstimatedAcquisition: true,
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: "2022-01-10",
    acquisitionArea: "100",
    transferArea: "100",
    ...over,
  }) as AssetForm;
const APPRAISAL = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, fixedAcquisitionPrice: "300,000,000" } as Partial<AssetForm>;
const block = (a: AssetForm, onChange: (p: Partial<AssetForm>) => void = noop, isNonPrimary = false) =>
  render(<SelfBuiltHousingShareBlock asset={a} onChange={onChange} transferDate={TD} isNonPrimary={isNonPrimary} />);

describe("SelfBuiltHousingShareBlock — 술어대로 칸을 그린다", () => {
  it("환산 → (가) 취득 3칸 + (나) 양도 칸이 뜨고 앵커가 각 1개다(S3-1·#17 카드와 data-field 중복 없음)", () => {
    block(asset());
    expect(screen.getByTestId("self-built-housing-share")).toBeTruthy();
    expect(screen.getByTestId("self-built-housing-acq")).toBeTruthy();
    for (const key of ["standardPricePerSqmAtAcq", "buildingStandardPriceAtAcq", "standardPricePerSqmAtTransfer", "buildingStandardPriceAtTransfer"]) {
      expect(document.querySelectorAll(`[data-field="${key}"]`).length, key).toBe(1);
    }
    expect(screen.getByTestId("sale-split-mode")).toBeTruthy();
    expect(screen.queryByTestId("self-built-building-appraisal")).toBeNull();
    expect(screen.queryByTestId("self-built-appraisal-nosplit")).toBeNull();
  });

  it("감정 → 기본은 건물 감정가액 한 칸(취득·양도 칸 없음) · 「구분 표시 없음」을 켜면 취득 3칸으로 바뀐다", () => {
    const { rerender } = block(asset(APPRAISAL));
    expect(screen.getByTestId("self-built-building-appraisal")).toBeTruthy();
    expect(screen.getByTestId("self-built-appraisal-nosplit")).toBeTruthy();
    expect(screen.queryByTestId("self-built-housing-acq")).toBeNull();
    expect(screen.queryByTestId("sale-split-mode")).toBeNull();
    rerender(<SelfBuiltHousingShareBlock asset={asset({ ...APPRAISAL, selfBuiltAppraisalNoSplit: true })} onChange={noop} transferDate={TD} />);
    expect(screen.queryByTestId("self-built-building-appraisal")).toBeNull();
    expect(screen.getByTestId("self-built-housing-acq")).toBeTruthy();
  });

  it.each([
    ["본인 신축 토글 OFF", { isSelfBuilt: false }],
    ["증축", { buildingType: "extension" as const }],
    ["실지거래가액", { useEstimatedAcquisition: false }],
    ["비주택", { assetKind: "building" as const }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["부담부증여", { transferType: "burdened_gift" as const }],
    ["PHD", { usePreHousingDisclosure: true }],
    ["토지·건물 취득일 분리", { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-01-01" }],
    ["공익수용 특례", { transferCause: "public_expropriation" as const }],
  ])("🔴 구별력 — %s → 카드가 없다", (_n, over) => {
    block(asset(over as Partial<AssetForm>));
    expect(screen.queryByTestId("self-built-housing-share")).toBeNull();
  });

  it("5년 경과 → 카드가 없다", () => {
    render(<SelfBuiltHousingShareBlock asset={asset()} onChange={noop} transferDate="2027-01-11" />);
    expect(screen.queryByTestId("self-built-housing-share")).toBeNull();
  });

  it("일부 양도(partial) → 전체 토지 면적 기준 안내가 뜬다(V-3)", () => {
    block(asset({ areaScenario: "partial", transferArea: "50" }));
    expect(screen.getByTestId("self-built-housing-partial-note").textContent).toContain("100");
  });
});

describe("입력은 onChange 로만 쓴다 (useEffect → store 미러링 없음)", () => {
  it("렌더만으로는 onChange 가 불리지 않는다 — 빈 칸을 자동으로 채우지 않는다", () => {
    const onChange = vi.fn();
    block(asset(), onChange);
    block(asset(APPRAISAL), onChange);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("건물 감정가액 입력 → selfBuiltBuildingAppraisal 패치", () => {
    const onChange = vi.fn();
    block(asset(APPRAISAL), onChange);
    fireEvent.change(screen.getByTestId("self-built-building-appraisal"), { target: { value: "110000000" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(String(onChange.mock.calls[0][0].selfBuiltBuildingAppraisal).replace(/,/g, "")).toBe("110000000");
  });

  it("「구분 표시 없음」 토글 → selfBuiltAppraisalNoSplit 한 키만(다른 칸을 지우지 않는다 — 복귀 시 값 복원)", () => {
    const onChange = vi.fn();
    block(asset({ ...APPRAISAL, selfBuiltBuildingAppraisal: "110,000,000" }), onChange);
    fireEvent.click(screen.getByTestId("self-built-appraisal-nosplit").querySelector('[role="switch"]')!);
    expect(onChange).toHaveBeenCalledWith({ selfBuiltAppraisalNoSplit: true });
  });
});

describe("블록 통합 — CompanionAcqPurchaseBlock 이 본인 신축 토글 본문에 카드를 마운트한다", () => {
  const renderBlock = (a: AssetForm, isNonPrimaryAsset = false) =>
    render(
      <CompanionAcqPurchaseBlock
        {...({
          asset: a,
          onAssetChange: noop,
          assetKind: "housing",
          transferDate: TD,
          isNonPrimaryAsset,
          isSelfBuilt: a.isSelfBuilt,
          onIsSelfBuiltChange: noop,
          buildingType: a.buildingType,
          onBuildingTypeChange: noop,
          constructionDate: a.constructionDate,
          onConstructionDateChange: noop,
          extensionFloorArea: a.extensionFloorArea,
          onExtensionFloorAreaChange: noop,
          extensionStdPriceAtAcquisition: a.extensionStdPriceAtAcquisition,
          onExtensionStdPriceAtAcquisitionChange: noop,
        } as unknown as React.ComponentProps<typeof CompanionAcqPurchaseBlock>)}
      />,
    );

  it("환산 × 신축 × 5년 이내 → 카드가 뜬다(첫 자산·함께 양도 자산 모두)", () => {
    renderBlock(asset());
    expect(screen.getByTestId("self-built-housing-share")).toBeTruthy();
    cleanup();
    renderBlock(asset(), true);
    expect(screen.getByTestId("self-built-housing-share")).toBeTruthy();
  });

  it("PHD 잔재가 있어도 함께 양도 자산은 카드가 뜬다(첫 자산은 PHD 가 축이라 안 뜬다) — isNonPrimaryAsset 이 술어까지 전달된다", () => {
    renderBlock(asset({ usePreHousingDisclosure: true }), true);
    expect(screen.getByTestId("self-built-housing-share")).toBeTruthy();
    cleanup();
    renderBlock(asset({ usePreHousingDisclosure: true }), false);
    expect(screen.queryByTestId("self-built-housing-share")).toBeNull();
  });

  it.each([
    ["본인 신축 토글 OFF", { isSelfBuilt: false }],
    ["증축", { buildingType: "extension" as const }],
    ["실지거래가액", { useEstimatedAcquisition: false }],
  ])("🔴 구별력 — %s → 카드가 없다", (_n, over) => {
    renderBlock(asset(over as Partial<AssetForm>));
    expect(screen.queryByTestId("self-built-housing-share")).toBeNull();
  });
});
