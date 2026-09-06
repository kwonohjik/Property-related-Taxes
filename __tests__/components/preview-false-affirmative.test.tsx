/**
 * anchor: 미리보기가 **모르는 것을 단정하지 않는다** (UI 리뷰 보통 #13·#11).
 *
 * - #13 재개발 거주개월 카드: 자산-수준 양도가액이 **입력칸조차 없는 모드**(지분 분할·안분)에서
 *   `tp = 0` → `isHighValue = false` → 「12억 이하 전액 비과세」를 초록으로 **단정**했다.
 *   실제 양도가액이 30억이어도 그렇게 떴다.
 * - #11 일반건물 증축 미리보기: 분리 취득 ON에서 실제 계산을 가르는 것은 파트별 라디오인데
 *   이 미리보기만 폐기된 자산-단위 `useEstimatedAcquisition`을 보고 「원건물 실가」로 안분했다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentResidenceSplitSection } from "@/components/calc/transfer/RedevelopmentResidenceSplitSection";
import { GeneralBuildingExtensionSection } from "@/components/calc/transfer/GeneralBuildingExtensionSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const redevAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    ...over,
  }) as AssetForm;

describe("재개발 거주개월 카드 — 양도가액을 모르면 단정하지 않는다 (#13)", () => {
  it("🔑 A-1: 양도가액 미입력이면 「판정 불가」다 (종전엔 「12억 이하 전액 비과세」)", () => {
    render(
      <RedevelopmentResidenceSplitSection
        asset={redevAsset({ actualSalePrice: "" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/판정 불가/)).toBeTruthy();
    expect(screen.queryByText(/12억 이하 전액 비과세/)).toBeNull();
  });

  it("A-2: 12억 이하를 실제로 입력하면 종전대로 「12억 이하 전액 비과세」다", () => {
    render(
      <RedevelopmentResidenceSplitSection
        asset={redevAsset({ actualSalePrice: "900000000" })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/12억 이하 전액 비과세/)).toBeTruthy();
  });

  it("A-3: 12억 초과는 종전대로 분기 안내를 낸다", () => {
    render(
      <RedevelopmentResidenceSplitSection
        asset={redevAsset({ actualSalePrice: "3000000000" })}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/12억 이하 전액 비과세/)).toBeNull();
    expect(screen.queryByText(/판정 불가/)).toBeNull();
  });
});

/** 증축 안분 미리보기가 실제로 뜨는 최소 입력 (실가 모드). */
const gbAsset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    gbHasExtension: true,
    gbLandArea: "200",
    gbTransferLandPricePerSqm: "3000000",
    gbTransferBuildingValue: "200000000",
    gbTransferExtensionBuildingStdPrice: "100000000",
    actualSalePrice: "1500000000",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "100000000",
    fixedAcquisitionPrice: "600000000",
    gbExtensionAcquisitionMode: "actual",
    gbExtensionActualAcquisitionPrice: "150000000",
    ...over,
  }) as AssetForm;

const gbView = (over: Partial<AssetForm> = {}) =>
  render(
    <GeneralBuildingExtensionSection
      asset={gbAsset(over)}
      onChange={() => {}}
      stdPriceAddress={{ road: "", jibun: "", pnu: "" } as never}
      transferYear={2024}
      isPartialTransfer={false}
    />,
  );

describe("일반건물 증축 미리보기 — 원건물 모드는 파트 축이다 (#11)", () => {
  it("A-4: 분리 취득이 없으면 종전대로 자산-단위 플래그에서 파생된다", () => {
    gbView({ useEstimatedAcquisition: false });
    expect(screen.getByText(/원건물 실가/)).toBeTruthy();
  });

  it("🔑 A-5: 두 파트를 환산으로 고르면 「원건물 환산」이다 (종전엔 「실가」)", () => {
    gbView({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      gbAcqBuildingValue: "100000000",
    });
    // ⚠️ 부정형만 두면 「미리보기가 아예 안 뜬 것」과 구별되지 않는다 — 실제로 뜨는지 함께 고정한다.
    expect(screen.getByText(/원건물 환산/)).toBeTruthy();
    expect(screen.queryByText(/원건물 실가/)).toBeNull();
  });

  it("🔑 A-6: 두 파트 모드가 서로 다르면 틀린 수 대신 미리보기를 내지 않는다", () => {
    gbView({
      useEstimatedAcquisition: false,
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
    });
    expect(screen.queryByText(/원건물 실가/)).toBeNull();
    expect(screen.queryByText(/원건물 환산/)).toBeNull();
  });
});
