/**
 * anchor — [D1] MixedUseLegacyStdPrice가 부수토지 override를 반영한다.
 *
 * 회귀 대상: 이 컴포넌트는 `computeDerivedAreas`를 쓰지 않고 비율 로직을 자체 재구현해
 * `mixedResidentialLandAreaOverride`를 **읽지 않았다** → 용도변경(legacy) 경로에서 사용자가
 * 부수토지를 수정해도 기준시가 자동합계는 자동 안분값으로 계산됐다.
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.engine.design.md §4 E4
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { MixedUseLegacyStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseLegacyStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 용도변경 ON(legacy 경로) + 상가 공시지가 → 자동합계가 부수토지 면적에 비례. */
function renderLegacy(over: Partial<AssetForm> = {}) {
  const asset: AssetForm = {
    ...makeDefaultAsset(1),
    isMixedUseHouse: true,
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    usePreHousingDisclosure: false,
    mixedTransferLandPricePerSqm: "1000000", // 1,000,000원/㎡
    // 합계가 부수토지 기준시가와 같아지면 getByText가 다중 매칭으로 실패 → 건물분을 넣어 구분
    mixedTransferCommercialBuildingPrice: "7000000",
    ...over,
  };
  return render(
    <MixedUseLegacyStdPrice
      asset={asset}
      onChange={() => {}}
      transferDate="2025-09-01"
      useEstimatedAcquisition
      transferSectionNum={3}
      acqSectionNum={2}
    />,
  );
}

describe("[D1] Legacy 경로 — 부수토지 override 반영", () => {
  /** "상가부수토지 기준시가 (자동)" 행의 금액. 같은 금액이 합계 등 여러 곳에 나와 스코프 필수. */
  function transferLandStd(getByText: (t: string) => HTMLElement): string {
    const row = getByText("상가부수토지 기준시가 (자동)").parentElement as HTMLElement;
    return within(row).getAllByText(/^[0-9,]+$|^—$/)[0]?.textContent ?? "";
  }

  it("override 없음 → 자동 안분(상가 100㎡) × 1,000,000 = 100,000,000", () => {
    const { getByText } = renderLegacy();
    expect(transferLandStd(getByText)).toBe("100,000,000");
  });

  it("override=150(주택) → 상가 잔액 50㎡ × 1,000,000 = 50,000,000 (★D1 회귀)", () => {
    // 수정 전: override를 무시하고 자동 안분 100㎡ → 100,000,000 (버그)
    const { getByText } = renderLegacy({ mixedResidentialLandAreaOverride: "150" });
    expect(transferLandStd(getByText)).toBe("50,000,000");
  });

  it("PHD ON에서도 override 반영 (2026-07-15 배타 해제)", () => {
    // 종전에는 "PHD ON은 phdResidentialLandArea가 담당"이라며 override를 무시했으나,
    // 그 필드는 ⑫ Zod가 strip해 엔진에 도달한 적이 없다 → 배타는 지키는 게 없었다.
    // 표시(이 화면)와 엔진이 같은 override를 쓰도록 통일 — dual-truth 회피.
    const { getByText } = renderLegacy({
      usePreHousingDisclosure: true,
      mixedResidentialLandAreaOverride: "150",
    });
    expect(transferLandStd(getByText)).toBe("50,000,000");
  });
});
