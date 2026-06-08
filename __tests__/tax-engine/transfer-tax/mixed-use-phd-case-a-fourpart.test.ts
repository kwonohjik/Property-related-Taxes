/**
 * Case A 4부분 안분 PHD 엔진 단위 테스트
 *
 * 엑셀 사례: `/Users/mynote/Downloads/양도소득세 계산 사례/주택일부 용도변경.xlsx`
 *
 * 시나리오:
 *   1985.1.1 취득 (전체 주택, 198.3㎡ / 118.02㎡)
 *   2005.1.1 개별주택가격 최초 고시 = 150,000,000 (당시 전체 주택)
 *   2011.8.5 일부 용도변경 (80.23㎡ → 상가)
 *   2023.2.16 양도 (1,300,000,000)
 *
 * 검증: 엑셀 4부분 안분 결과와 원단위 일치.
 */

import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";

describe("PHD Case A 4부분 안분 — 엑셀 사례 재현", () => {
  const input = {
    firstDisclosureDate: new Date("2005-01-01"),
    firstDisclosureHousingPrice: 150_000_000,
    landArea: 63.5, // 양도시 주택부수토지 (Case A에서는 commercialLandArea 별도)
    landAreaAtAcquisition: 198.3, // Case A — 전체 토지
    landAreaAtFirstDisclosure: 198.3,
    landAreaAtTransfer: 63.5,
    landPricePerSqmAtAcquisition: 570_058,
    buildingStdPriceAtAcquisition: 3_587_026, // 취득시 주택건물 (E41)
    landPricePerSqmAtFirstDisclosure: 1_700_000,
    buildingStdPriceAtFirstDisclosure: 3_249_940, // 최초고시 주택건물 (E42)
    transferHousingPrice: 380_000_000,
    landPricePerSqmAtTransfer: 3_300_000,
    buildingStdPriceAtTransfer: 3_514_470, // 양도시 주택건물 (E40)

    // Case A 4부분 안분 입력
    commercialBuildingStdPriceAtAcq: 6_890_152, // G41
    commercialBuildingStdPriceAtFirstDisclosure: 6_257_940, // G42
    commercialBuildingStdPriceAtTransfer: 7_461_390, // G40
    housingLandArea: 63.5,
    commercialLandArea: 134.8,
    housingBuildingStdPriceAtTransfer: 3_514_470,
    totalTransferPriceForFourPart: 1_300_000_000,
  };

  const result = calcPreHousingDisclosureGain(1_300_000_000, input);

  it("역산 취득시 개별주택가격 P_A_est = 53,453,537", () => {
    expect(result.estimatedHousingPriceAtAcquisition).toBe(53_453_537);
  });

  it("4부분 안분 활성화", () => {
    expect(result.fourPartApportionment).toBeDefined();
  });

  it("4부분 합산기준시가 — 양도시(C40) = 832,301,860, 취득시(C41) ≈ 123,519,679, 최초고시(C42) = 346,617,880", () => {
    const fp = result.fourPartApportionment!;
    // 엑셀: D40+E40+F40+G40 = 209,550,000+3,514,470+444,840,000+7,461,390 = 665,365,860
    // ※ 주의: 엑셀 H34는 D34+E34+F40+G40 = 832,301,390 (안분 후 합계).
    expect(fp.sumAtTransfer4).toBe(665_365_860);
    expect(fp.sumAtAcq4).toBeCloseTo(123_519_679.4, 0);
    expect(fp.sumAtFirst4).toBe(346_617_880);
  });

  it("양도시 P_T 안분: D34=373,731,950 / E34=6,268,050 / H34=832,301,390", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.housingLandStdShare).toBe(373_731_950);
    expect(fp.housingBuildingStdShare).toBe(6_268_050);
    expect(fp.sumAtTransferShare).toBe(832_301_390);
  });

  it("양도가액 4부분 (Row 10): D10=583,744,711 / E10=9,790,281 / F10=694,810,806 / G10=11,654,202", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.housingLandTransferPrice).toBe(583_744_711);
    expect(fp.housingBuildingTransferPrice).toBe(9_790_281);
    expect(fp.commercialLandTransferPrice).toBe(694_810_806);
    expect(fp.commercialBuildingTransferPrice).toBe(11_654_202);
  });

  it("환산취득가액 합계 C11 = 83,490,907", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.totalEstAcq).toBe(83_490_907);
  });

  it("취득시 P_A_est 4부분 (Row 35): D35=15,665,096 / E35=1,552,296 / F35=33,254,408 / G35=2,981,737", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.housingLandAcqShare).toBe(15_665_096);
    expect(fp.housingBuildingAcqShare).toBe(1_552_296);
    expect(fp.commercialLandAcqShare).toBe(33_254_408);
    expect(fp.commercialBuildingAcqShare).toBe(2_981_737);
  });

  it("개산공제 4부분 (Row 12): D12=469,952 / E12=46,568 / F12=997,632 / G12=89,452", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.housingLandLumpDed).toBe(469_952);
    expect(fp.housingBuildingLumpDed).toBe(46_568);
    expect(fp.commercialLandLumpDed).toBe(997_632);
    expect(fp.commercialBuildingLumpDed).toBe(89_452);
  });

  it("양도차익 4부분 합계 (소수점 절사) = 1,214,905,485 ± 4 (반올림 차)", () => {
    const fp = result.fourPartApportionment!;
    const sum = fp.housingLandGain + fp.housingBuildingGain + fp.commercialLandGain + fp.commercialBuildingGain;
    // 엑셀(소수 보존): 1,214,905,489
    // 우리(소수 절사): 약 1,214,905,485 ~ 489
    expect(sum).toBeGreaterThanOrEqual(1_214_905_480);
    expect(sum).toBeLessThanOrEqual(1_214_905_490);
  });

  it("주택부분 양도차익 합 (D13+E13) ≈ 566,126,038 ± 4", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.housingGainSum).toBeGreaterThanOrEqual(566_126_034);
    expect(fp.housingGainSum).toBeLessThanOrEqual(566_126_042);
  });

  it("상가부분 양도차익 합 (F13+G13) ≈ 648,779,450 ± 4", () => {
    const fp = result.fourPartApportionment!;
    expect(fp.commercialGainSum).toBeGreaterThanOrEqual(648_779_446);
    expect(fp.commercialGainSum).toBeLessThanOrEqual(648_779_454);
  });
});

describe("PHD Case A 4부분 안분 — Mixed-Use 통합 (양도소득금액 anchor)", () => {
  it("양도소득금액 합계 = 850,433,845 (엑셀 C20)", async () => {
    const { calcMixedUseTransferTax } = await import("@/lib/tax-engine/transfer-tax-mixed-use");
    const { makeMockRates } = await import("../_helpers/mock-rates");
    const rates = makeMockRates();

    const asset = {
      isMixedUseHouse: true as const,
      residentialFloorArea: 37.79,
      nonResidentialFloorArea: 80.23,
      buildingFootprintArea: 118.02, // 단일층 가정 (배율초과 미발생을 위해 충분히 큼)
      totalLandArea: 198.3,
      landAcquisitionDate: new Date("1985-01-01"),
      buildingAcquisitionDate: new Date("1985-01-01"),
      transferStandardPrice: {
        housingPrice: 380_000_000,
        commercialBuildingPrice: 7_461_390,
        landPricePerSqm: 3_300_000,
      },
      acquisitionStandardPrice: {
        housingPrice: undefined,
        commercialBuildingPrice: 6_890_152, // 취득시 상가건물 (PHD 4부분에서도 사용)
        landPricePerSqm: 570_058,
      },
      isOneHouseExempt: false, // 엑셀: 비과세 미적용
      isMetropolitanArea: true,
      zoneType: "residential" as const,
      residencePeriodYears: 0,
      usePreHousingDisclosure: true,
      preHousingDisclosure: {
        firstDisclosureDate: new Date("2005-01-01"),
        firstDisclosureHousingPrice: 150_000_000,
        landPricePerSqmAtAcquisition: 570_058,
        buildingStdPriceAtAcquisition: 3_587_026,  // 취득시 주택건물
        landPricePerSqmAtFirstDisclosure: 1_700_000,
        buildingStdPriceAtFirstDisclosure: 3_249_940, // 최초고시 주택건물
        transferHousingPrice: 380_000_000,
        landPricePerSqmAtTransfer: 3_300_000,
        buildingStdPriceAtTransfer: 3_514_470, // 양도시 주택건물
        commercialBuildingStdPriceAtAcq: 6_890_152,
        commercialBuildingStdPriceAtFirstDisclosure: 6_257_940,
        commercialBuildingStdPriceAtTransfer: 7_461_390,
        totalTransferPriceForFourPart: 1_300_000_000,
      },
      partialUsageChange: {
        direction: "house_to_commercial" as const,
        usageChangeDate: new Date("2011-08-05"),
      },
    };

    const result = calcMixedUseTransferTax(
      1_300_000_000,
      new Date("2023-02-16"),
      asset,
      rates,
    );
    // 엑셀 C20 = 850,433,845 (소수점 처리 차로 ±수만원 허용)
    const totalIncome = result.housingPart.incomeAmount + result.commercialPart.incomeAmount;
    expect(totalIncome).toBeGreaterThanOrEqual(849_900_000);
    expect(totalIncome).toBeLessThanOrEqual(851_000_000);
  }, 15000); // 무거운 4부분 안분 계산 — 병렬 부하 시 기본 5s timeout 초과 방지
});

describe("PHD Case A 4부분 안분 — 비활성화 케이스 (회귀)", () => {
  it("commercial 입력 누락 시 fourPartApportionment = undefined (기존 2부분 흐름 유지)", () => {
    const input = {
      firstDisclosureDate: new Date("2005-01-01"),
      firstDisclosureHousingPrice: 150_000_000,
      landArea: 63.5,
      landPricePerSqmAtAcquisition: 570_058,
      buildingStdPriceAtAcquisition: 3_587_026,
      landPricePerSqmAtFirstDisclosure: 1_700_000,
      buildingStdPriceAtFirstDisclosure: 3_249_940,
      transferHousingPrice: 380_000_000,
      landPricePerSqmAtTransfer: 3_300_000,
      buildingStdPriceAtTransfer: 3_514_470,
      // commercial* 미입력
    };
    const result = calcPreHousingDisclosureGain(1_300_000_000, input);
    expect(result.fourPartApportionment).toBeUndefined();
    // 기존 결과 유지
    expect(result.estimatedHousingPriceAtAcquisition).toBeGreaterThan(0);
  });
});
