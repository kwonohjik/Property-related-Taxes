/**
 * anchor — 「증축한 부분의 감정가액」 ⑤ 입력 칸 (통상 경로 §114조의2① 감정가액 × 증축).
 *
 * 칸 노출은 호출부가 ⑧·④와 같은 술어(`generalExtensionAppraisalApplies`)로 판정해 `showExtensionAppraisal`로 넘긴다.
 * 이 파일은 (1) SelfBuiltSection이 그 신호대로 칸을 그리고 지우는지, (2) 블록이 실제로 술어를 연결했는지(통합)를 잰다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { SelfBuiltSection } from "@/components/calc/transfer/SelfBuiltSection";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const noop = () => {};
function section(over: Partial<React.ComponentProps<typeof SelfBuiltSection>> = {}) {
  return (
    <SelfBuiltSection
      isSelfBuilt
      onIsSelfBuiltChange={noop}
      buildingType="extension"
      onBuildingTypeChange={noop}
      constructionDate="2021-01-01"
      onConstructionDateChange={noop}
      extensionFloorArea="120"
      onExtensionFloorAreaChange={noop}
      extensionStdPriceAtAcquisition="40,000,000"
      onExtensionStdPriceAtAcquisitionChange={noop}
      showExtensionAppraisal
      extensionAppraisalValue="60,000,000"
      onExtensionAppraisalValueChange={noop}
      {...over}
    />
  );
}

describe("SelfBuiltSection — 증축한 부분의 감정가액 칸", () => {
  it("증축 × 신호 참 → 칸이 뜨고 값이 보인다", () => {
    render(section());
    const input = screen.getByTestId("extension-appraisal-value") as HTMLInputElement;
    expect(input.value).toBe("60,000,000");
    expect(document.querySelector('[data-field="extensionAppraisalValue"]')).toBeTruthy();
  });

  it("값을 바꾸면 onChange가 새 값으로 불린다", () => {
    const onChange = vi.fn();
    render(section({ onExtensionAppraisalValueChange: onChange, extensionAppraisalValue: "" }));
    fireEvent.change(screen.getByTestId("extension-appraisal-value"), { target: { value: "70000000" } });
    expect(onChange).toHaveBeenCalled();
    expect(String(onChange.mock.calls.at(-1)?.[0]).replace(/,/g, "")).toBe("70000000");
  });

  it.each([
    ["신호 거짓", { showExtensionAppraisal: false }],
    ["신축", { buildingType: "new" as const }],
    ["콜백 없음", { onExtensionAppraisalValueChange: undefined }],
  ])("🔴 구별력 — %s → 칸이 없다", (_n, over) => {
    render(section(over));
    expect(screen.queryByTestId("extension-appraisal-value")).toBeNull();
  });

  it("신축·증축 토글을 끄면 값도 비운다", () => {
    const clear = vi.fn();
    render(section({ onExtensionAppraisalValueChange: clear }));
    fireEvent.click(screen.getByRole("switch"));
    expect(clear).toHaveBeenCalledWith("");
  });
});

describe("블록 통합 — CompanionAcqPurchaseBlock이 술어를 연결한다", () => {
  const asset = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2021-01-01",
      isAppraisalAcquisition: true,
      fixedAcquisitionPrice: "300,000,000",
      isSelfBuilt: true,
      buildingType: "extension",
      constructionDate: "2021-01-01",
      extensionFloorArea: "120",
      extensionStdPriceAtAcquisition: "40,000,000",
      extensionAppraisalValue: "60,000,000",
      ...over,
    }) as AssetForm;

  // 블록의 필수 props가 많다 — 이 테스트는 신축·증축 영역만 잰다(나머지는 렌더에 필요하지 않다).
  const renderBlock = (a: AssetForm, transferDate = "2024-03-01") =>
    render(
      <CompanionAcqPurchaseBlock
        {...({
          asset: a,
          onAssetChange: noop,
          assetKind: "housing",
          transferDate,
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
          extensionAppraisalValue: a.extensionAppraisalValue,
          onExtensionAppraisalValueChange: noop,
        } as unknown as React.ComponentProps<typeof CompanionAcqPurchaseBlock>)}
      />,
    );

  it("감정가액 × 증축 × 5년 이내 → 칸이 뜬다", () => {
    renderBlock(asset());
    expect(screen.getByTestId("extension-appraisal-value")).toBeTruthy();
  });

  it.each([
    ["환산", { isAppraisalAcquisition: false, useEstimatedAcquisition: true }],
    ["5년 초과", { constructionDate: "2015-01-01" }],
    ["85㎡ 이하", { extensionFloorArea: "85" }],
    ["신축", { buildingType: "new" as const }],
    ["부담부증여", { transferType: "burdened_gift" as const }],
  ])("🔴 구별력 — %s → 칸이 없다", (_n, over) => {
    renderBlock(asset(over as Partial<AssetForm>));
    expect(screen.queryByTestId("extension-appraisal-value")).toBeNull();
  });
});
