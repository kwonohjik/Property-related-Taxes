/**
 * 확인 필요 ① 표시 — 겸용 합산 세액 섹션이 파트 양도차손 통산 행을 싣고, 합산 양도소득금액 산식이 「통산 후 합계」임을 밝힌다
 * (계획서 `transfer-split-part-loss-offset-p3.plan.md` §1). 파트 소득금액은 통산 전 값이라 단순 합과 합산 값이 다르다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MixedUseTotalTaxSection } from "@/components/calc/results/mixed-use/MixedUseTotalTaxSection";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRatesWithHouseEngine } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const asset = (building: number) =>
  ({
    isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
    landAcquisitionDate: D("2005-06-10"), buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: {
      housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000,
    },
    residencePeriodYears: 0, isMetropolitanArea: true, zoneType: "general_residential", isOneHouseExempt: false,
    separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 500_000_000, buildingAcquisitionPrice: building },
  }) as unknown as MixedUseAssetInput;
const breakdownOf = (building: number) => calcMixedUseTransferTax(3_000_000_000, D("2024-08-20"), asset(building), makeMockRatesWithHouseEngine());

afterEach(cleanup);

describe("겸용 합산 세액 — 파트 양도차손 통산 표시", () => {
  it("주택분 · 상가 건물 차손 → 통산 행 2개와 「통산한 뒤의 합계」 산식", () => {
    render(<MixedUseTotalTaxSection breakdown={breakdownOf(1_500_000_000)} open onToggle={() => {}} />);
    expect(screen.getByText("양도차손 통산 — 주택부분 → 상가 부수토지")).toBeTruthy();
    expect(screen.getByText("양도차손 통산 — 상가 건물 → 상가 부수토지")).toBeTruthy();
    expect(screen.getByText(/부분별 양도차손을 위와 같이 통산한 뒤의 합계/)).toBeTruthy();
  });

  it("차손이 없으면 통산 행 · 문구가 없다", () => {
    render(<MixedUseTotalTaxSection breakdown={breakdownOf(400_000_000)} open onToggle={() => {}} />);
    expect(screen.queryByText(/양도차손 통산 —/)).toBeNull();
    expect(screen.queryByText(/통산한 뒤의 합계/)).toBeNull();
  });
});
