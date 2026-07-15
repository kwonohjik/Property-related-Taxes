/**
 * 겸용주택 상가부수토지 취득시 공시지가 연도 = 토지 취득일 기준 앵커.
 *
 * 계획서: docs/02-design/features/mixed-use-commercial-land-price-year-acq-date.plan.md
 * 버그: 상가부수토지 취득시 공시지가 연도가 건물 취득일(1997) 기준으로 추천됨(주택분은 토지 취득일 기준 정상).
 * 수정: 상가부수토지 취득시 LandPriceLookupField referenceDate = landAcquisitionDate || acquisitionDate.
 *
 * 연도 자동 라벨은 LandPriceLookupField의 Select 트리거 span "${year}년 (자동)"로 렌더된다.
 * 토지 1991-08 / 건물 1997-08 → 상가 취득시 = 1991(자동)이어야 함(수정 전엔 1997 → RED).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

afterEach(cleanup);

function mixedAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    isMixedUseHouse: true,
    // 토지·건물 취득일 상이
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "1997-08-01", // 건물 취득일
    landAcquisitionDate: "1991-08-01", // 토지 취득일
    // 면적(상가부수토지 산정용)
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    // 상가 취득시 공시지가(값이 있어야 조회연도 라벨 확인 용이)
    mixedAcqLandPricePerSqm: "2280000",
    mixedTransferLandPricePerSqm: "6100000",
  };
}

describe("겸용 상가부수토지 취득시 공시지가 연도 (Pre-Do anchor)", () => {
  it("A1: 토지 1991 / 건물 1997 → 상가 취득시 공시지가 연도 = 1991(자동)", () => {
    const { getAllByText } = render(
      <MixedUseAssetMajorStdPrice
        asset={mixedAsset()}
        onChange={() => {}}
        transferDate="2022-08-01"
        useEstimatedAcquisition
      />,
    );
    // 상가 취득시 부수토지 연도 = 토지 취득일 기준 1991
    expect(getAllByText(/1991년 \(자동\)/).length).toBeGreaterThan(0);
  });

  it("A2 fallback 무회귀: 토지 취득일 미입력 → 상가 취득시 = 건물 취득일 1997(자동)", () => {
    const asset = {
      ...mixedAsset(),
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "", // 미입력 → acquisitionDate(1997) fallback
    };
    const { getAllByText, queryByText } = render(
      <MixedUseAssetMajorStdPrice
        asset={asset}
        onChange={() => {}}
        transferDate="2022-08-01"
        useEstimatedAcquisition
      />,
    );
    // fallback → 상가 취득시 = 1997(자동), 1991은 없음
    expect(getAllByText(/1997년 \(자동\)/).length).toBeGreaterThan(0);
    expect(queryByText(/1991년 \(자동\)/)).toBeNull();
  });
});
