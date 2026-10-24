/**
 * #17-5 ① ⑤ — §164⑦ PHD 환산 주택은 배율 초과분 분리 경로를 타지만 취득시 기준시가 5칸을 받지 않는다 — 카드는 입력칸 없이 안내만 그린다.
 * 노출 술어는 `housingExcessUsesPhdSplit`(분리 경로 ∧ PHD) · 5칸 카드는 `housingExcessNeedsLandSplit`(분리 경로 ∧ ¬PHD) — 둘은 상보다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { vi } from "vitest";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { HousingExcessSplitCard } from "@/components/calc/transfer/HousingExcessSplitCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const BASE: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2000-03-01",
  useEstimatedAcquisition: true,
  usePreHousingDisclosure: true,
  addressJibun: "서울 테스트동 1",
  buildingFootprintArea: "53",
  appurtenantLandZone: "metropolitan_residential",
  areaScenario: "same",
  acquisitionArea: "212",
  transferArea: "212",
};
const make = (over: Partial<AssetForm> = {}) => ({ ...makeDefaultAsset(1), ...BASE, ...over }) as AssetForm;
const noop = () => {};

describe("HousingExcessSplitCard — PHD 환산 안내 카드", () => {
  it("🔑 PHD 환산 첫 자산 + 초과 53㎡ → 입력칸 없는 안내 카드만 뜬다(5칸 카드 없음)", () => {
    render(<HousingExcessSplitCard asset={make()} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.getByTestId("housing-excess-phd-card")).toBeTruthy();
    expect(screen.getByText(/53\.00㎡/)).toBeTruthy();
    expect(screen.getByText(/§164⑦ 3시점 환산/)).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
    expect(screen.queryByTestId("housing-excess-acq-total")).toBeNull();
  });

  it("대조 — 면적이 한도 이내면 카드가 없다", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionArea: "150", transferArea: "150" })} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.queryByTestId("housing-excess-phd-card")).toBeNull();
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });

  it("대조 — 실가(환산 아님) + 1990-08-30 전 취득은 분리 경로 밖이라 두 카드 모두 없다", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionDate: "1989-06-01", useEstimatedAcquisition: false, usePreHousingDisclosure: false })} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.queryByTestId("housing-excess-phd-card")).toBeNull();
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });

  it("#17-5 ① 후속 — 실가 + 1990-08-30 이후 2005-04-30 전 취득은 5칸 카드이되 취득시 개별주택가격 칸이 영 §164⑦ 환산 개별주택가격을 받는다", () => {
    // 주택 종류 신호가 없으면 두 이름을 함께 적는다 — 이 단언은 단독·다가구를 명시 선택한 자산으로 본다
    render(<HousingExcessSplitCard asset={make({ useEstimatedAcquisition: false, usePreHousingDisclosure: false, inheritanceAssetKind: "house_individual" })} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-phd-card")).toBeNull();
    expect(screen.getByTestId("housing-excess-acq-total")).toBeTruthy();
    expect(screen.getByText(/영 §164⑦ 환산 개별주택가격/)).toBeTruthy();
    expect(screen.getByText(/최초 공시 개별주택가격에, 취득 당시 토지\+건물 기준시가 합계를/)).toBeTruthy();
  });

  it("대조 — 2005-04-30 이후 취득은 일반 문구(§164⑦ 안내 없음)", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionDate: "2012-01-02", useEstimatedAcquisition: false, usePreHousingDisclosure: false })} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.getByTestId("housing-excess-acq-total")).toBeTruthy();
    expect(screen.queryByText(/영 §164⑦ 환산 개별주택가격/)).toBeNull();
  });

  it("함께 양도 카드(isNonPrimary) — PHD 플래그가 남아 있어도 PHD 안내가 아니라 5칸 카드다(2005-04-30 이후 취득)", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionDate: "2012-01-02" })} onChange={noop} transferDate="2023-02-16" isNonPrimary />);
    expect(screen.queryByTestId("housing-excess-phd-card")).toBeNull();
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
  });

  it("첫 자산 + PHD 환산 + 2005-04-30 이후 취득(PHD 최초 공시가 더 늦은 지역) → PHD 안내 카드 — 5칸 카드가 아니다", () => {
    render(<HousingExcessSplitCard asset={make({ acquisitionDate: "2012-01-02" })} onChange={noop} transferDate="2023-02-16" />);
    expect(screen.getByTestId("housing-excess-phd-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });
});

describe("① 기본정보(AssetSectionBasic) → 면적 → 배율 초과 카드 — 첫 자산 여부(isFirst)가 끝까지 전달된다", () => {
  const renderBasic = (isFirst: boolean) =>
    render(
      <AssetSectionBasic
        asset={make({ acquisitionDate: "2012-01-02" })}
        onChange={vi.fn()}
        isMultiBundled={false}
        onAddAsset={vi.fn()}
        showFormDates={false}
        transferDate="2023-02-16"
        filingDate=""
        filingOverdue={false}
        filingDeadline=""
        onFormChange={vi.fn()}
        isFirst={isFirst}
      />,
    );

  it("첫 자산 + PHD 환산 → PHD 안내 카드 (5칸 카드 없음)", () => {
    renderBasic(true);
    expect(screen.getByTestId("housing-excess-phd-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-split-card")).toBeNull();
  });

  it("🔑 첫 자산이 아니면(함께 양도 카드) PHD 잔재 플래그가 있어도 5칸 카드 — 안내만 뜨고 칸이 없으면 ⑧이 요구하는 칸이 화면에 없다", () => {
    renderBasic(false);
    expect(screen.getByTestId("housing-excess-split-card")).toBeTruthy();
    expect(screen.queryByTestId("housing-excess-phd-card")).toBeNull();
  });
});
