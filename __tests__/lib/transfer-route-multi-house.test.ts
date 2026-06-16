/**
 * ⑭ Route handler 엔진 input 매핑 — 다주택 houses[]·gracePeriod Date 변환 단위 테스트
 *
 * lib/api/transfer-route-multi-house.ts (route.ts 800줄 분리 헬퍼) 검증:
 *  - string 날짜 → Date 변환 (date-coerce)
 *  - 신규 필드(inheritedDate·임대 legacy 5필드) 누락 없이 매핑
 */

import { describe, it, expect } from "vitest";
import { mapHousesToEngine, mapGracePeriodToEngine, mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";

describe("mapHousesToEngine", () => {
  it("undefined → undefined", () => {
    expect(mapHousesToEngine(undefined)).toBeUndefined();
  });

  it("string 날짜 신규 필드 → Date 변환 + 전체 필드 매핑", () => {
    const result = mapHousesToEngine([
      {
        id: "h1",
        region: "non_capital",
        acquisitionDate: "2020-03-15",
        officialPrice: 250_000_000,
        isInherited: true,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: true,
        inheritedDate: "2021-06-01",
        isRegisteredRental: true,
        rentalRegistrationDate: "2019-01-10",
        businessRegistrationDate: "2019-01-05",
        rentalPeriodYears: 8,
        rentalCancelledDate: "2024-02-20",
      },
    ]);

    expect(result).toHaveLength(1);
    const h = result![0];
    expect(h.id).toBe("h1");
    expect(h.region).toBe("non_capital");
    expect(h.acquisitionDate).toBeInstanceOf(Date);
    expect(h.acquisitionDate.toISOString().slice(0, 10)).toBe("2020-03-15");
    expect(h.officialPrice).toBe(250_000_000);
    expect(h.isInherited).toBe(true);
    expect(h.isUnsoldHousing).toBe(true);
    // 신규 필드 Date 변환
    expect(h.inheritedDate).toBeInstanceOf(Date);
    expect(h.inheritedDate!.toISOString().slice(0, 10)).toBe("2021-06-01");
    expect(h.isRegisteredRental).toBe(true);
    expect(h.rentalRegistrationDate!.toISOString().slice(0, 10)).toBe("2019-01-10");
    expect(h.businessRegistrationDate!.toISOString().slice(0, 10)).toBe("2019-01-05");
    expect(h.rentalPeriodYears).toBe(8);
    expect(h.rentalCancelledDate!.toISOString().slice(0, 10)).toBe("2024-02-20");
  });

  it("9유형 매트릭스 필드 매핑 — rentalLandArea→landArea·rentalTotalFloorArea→totalFloorArea 이름 변환 + 날짜 Date", () => {
    const result = mapHousesToEngine([
      {
        id: "h1",
        region: "capital",
        acquisitionDate: "2020-01-01",
        officialPrice: 500_000_000,
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        rentalType: "F",
        rentIncreaseUnder5Pct: true,
        hasMinimum2Units: true,
        rentalLandArea: 250,
        rentalTotalFloorArea: 140,
        isConvertedToSale: false,
        rentalStartOfficialPrice: 600_000_000,
        isExcludedShortToLongChange: false,
        firstSaleContractDate: "2009-01-01",
        rentalCancellationDate: "2021-05-01",
      },
    ]);
    const h = result![0];
    expect(h.rentalType).toBe("F");
    // 폼 이름(rentalLandArea) → 엔진 이름(landArea) 변환 — 침묵 strip이면 undefined가 되어 실패
    expect(h.landArea).toBe(250);
    expect(h.totalFloorArea).toBe(140);
    expect(h.rentIncreaseUnder5Pct).toBe(true);
    expect(h.hasMinimum2Units).toBe(true);
    expect(h.firstSaleContractDate).toBeInstanceOf(Date);
    expect(h.rentalCancellationDate!.toISOString().slice(0, 10)).toBe("2021-05-01");
  });

  it("P2 특수 배제 필드 — 날짜 Date 변환(other) + selling 플래그 passthrough", () => {
    const result = mapHousesToEngine([
      {
        id: "h2",
        region: "capital",
        acquisitionDate: "2020-01-01",
        officialPrice: 250_000_000,
        isInherited: false,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
        // other-house P2
        isUnavoidableReason: true,
        unavoidableResidenceYears: 2,
        unavoidableReasonResolvedDate: "2023-03-01",
        isLitigationHousing: true,
        litigationAcquisitionDate: "2022-06-01",
        isRedevelopmentZone: false,
        isPopulationDeclineArea: true,
        isSecondHomeRegistered: true,
        // selling-house P2
        isEmployeeHousing: true,
        freeProvisionYears: 10,
        isDayCareCenter: true,
        dayCareOperationYears: 5,
        isCulturalHeritage: true,
      },
    ]);
    const h = result![0];
    expect(h.isUnavoidableReason).toBe(true);
    expect(h.unavoidableResidenceYears).toBe(2);
    expect(h.unavoidableReasonResolvedDate).toBeInstanceOf(Date);
    expect(h.litigationAcquisitionDate!.toISOString().slice(0, 10)).toBe("2022-06-01");
    expect(h.isPopulationDeclineArea).toBe(true);
    expect(h.isSecondHomeRegistered).toBe(true);
    expect(h.isEmployeeHousing).toBe(true);
    expect(h.freeProvisionYears).toBe(10);
    expect(h.dayCareOperationYears).toBe(5);
    expect(h.isCulturalHeritage).toBe(true);
  });

  it("신규 선택 필드 미제공 → undefined (silent strip 없음)", () => {
    const result = mapHousesToEngine([
      {
        id: "h2",
        region: "capital",
        acquisitionDate: "2022-01-01",
        officialPrice: 500_000_000,
        isInherited: false,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ]);
    const h = result![0];
    expect(h.inheritedDate).toBeUndefined();
    expect(h.rentalRegistrationDate).toBeUndefined();
    expect(h.rentalPeriodYears).toBeUndefined();
  });
});

describe("mapGracePeriodToEngine", () => {
  it("undefined → undefined", () => {
    expect(mapGracePeriodToEngine(undefined)).toBeUndefined();
  });

  it("string contractDate → Date + 불리언·optional 매핑", () => {
    const gp = mapGracePeriodToEngine({
      contractDate: "2024-05-01",
      isLandPermitArea: true,
      hasTenantInResidence: true,
      areaDesignatedDate: "2025-11-01",
    });
    expect(gp!.contractDate).toBeInstanceOf(Date);
    expect(gp!.contractDate.toISOString().slice(0, 10)).toBe("2024-05-01");
    expect(gp!.isLandPermitArea).toBe(true);
    expect(gp!.hasTenantInResidence).toBe(true);
    expect(gp!.areaDesignatedDate!.toISOString().slice(0, 10)).toBe("2025-11-01");
  });

  it("areaDesignatedDate 미제공 → undefined", () => {
    const gp = mapGracePeriodToEngine({
      contractDate: "2023-12-01",
      isLandPermitArea: false,
      hasTenantInResidence: false,
    });
    expect(gp!.areaDesignatedDate).toBeUndefined();
  });
});

describe("mapPresaleRightsToEngine", () => {
  it("undefined → undefined", () => {
    expect(mapPresaleRightsToEngine(undefined)).toBeUndefined();
  });

  it("string 취득일 → Date 변환 + 종류·지역 매핑", () => {
    const result = mapPresaleRightsToEngine([
      { id: "p1", type: "redevelopment_right", acquisitionDate: "2022-03-01", region: "capital" },
    ]);
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("p1");
    expect(result![0].type).toBe("redevelopment_right");
    expect(result![0].acquisitionDate).toBeInstanceOf(Date);
    expect(result![0].acquisitionDate.toISOString().slice(0, 10)).toBe("2022-03-01");
    expect(result![0].region).toBe("capital");
  });
});
