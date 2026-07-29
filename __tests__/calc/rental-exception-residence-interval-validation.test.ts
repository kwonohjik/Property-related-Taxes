/**
 * §155⑳ 거주주택 거주기간 validation — interval 모드 회귀 (raw→derived 버그 수정)
 *
 * 버그: validation이 raw residencePeriodMonthsAsset(interval 모드에서 sync 안 됨·stale "0")로
 * 거주 2년을 오차단. 수정: deriveResidencePeriodMonths(엔진 동일 소스) 사용 → interval 구간 합산 인식.
 */

import { describe, it, expect } from "vitest";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

function validUnit(): AssetForm["rentalHousingException"]["rentalUnits"][number] {
  return {
    ...makeDefaultRentalUnit(),
    businessRegistrationDate: "2019-01-01",
    rentalRegistrationDate: "2019-01-01",
    rentalCategory: "long_general",
    rentalAcquisitionType: "purchase",
    standardPriceAtRentalStart: "300,000,000",
    requirementsConfirmed: true,
    rentalMonths: "120",
  };
}

function baseAsset(): AssetForm {
  const a = makeDefaultAsset(1);
  a.assetKind = "housing";
  a.acquisitionDate = "2018-01-01";
  a.rentalHousingException = {
    applyException: true,
    scenario: "A",
    rentalUnits: [validUnit()],
  };
  return a;
}

const TRANSFER = "2027-01-01"; // 취득(2018) ~ 양도: 730일+

describe("§155⑳ 거주기간 interval validation (raw→derived 회귀)", () => {
  it("interval 24+개월 + residencePeriodMonthsAsset stale '0' → 오차단 안 됨(null)", () => {
    const a = baseAsset();
    a.residenceInputMode = "interval";
    a.residencePeriods = [{ moveInDate: "2019-01-01", moveOutDate: "2022-01-01" }]; // 36개월
    a.residencePeriodMonthsAsset = "0"; // interval 모드에서 sync 안 된 stale 값 — 버그 트리거
    expect(validateRentalHousingException(a.rentalHousingException, a, "자산1", TRANSFER)).toBeNull();
  });

  it("interval 24개월 미만 → 차단(거주 2년 요건)", () => {
    const a = baseAsset();
    a.residenceInputMode = "interval";
    a.residencePeriods = [{ moveInDate: "2019-01-01", moveOutDate: "2020-06-01" }]; // 17개월
    a.residencePeriodMonthsAsset = "0";
    const msg = validateRentalHousingException(a.rentalHousingException, a, "자산1", TRANSFER);
    expect(msg).toContain("거주기간 2년");
  });

  it("direct 모드 30개월 → 통과(null)", () => {
    const a = baseAsset();
    a.residenceInputMode = "direct";
    a.residencePeriodMonthsAsset = "30";
    expect(validateRentalHousingException(a.rentalHousingException, a, "자산1", TRANSFER)).toBeNull();
  });

  it("rental interval 구간 겹침 → 차단(이중계산 방지)", () => {
    const a = baseAsset();
    a.residenceInputMode = "direct";
    a.residencePeriodMonthsAsset = "30";
    a.rentalHousingException.rentalUnits[0].rentalInputMode = "interval";
    a.rentalHousingException.rentalUnits[0].rentalPeriods = [
      { start: "2019-01-01", end: "2022-01-01" },
      { start: "2021-06-01", end: "2024-01-01" }, // 앞 구간과 겹침
    ];
    const msg = validateRentalHousingException(a.rentalHousingException, a, "자산1", TRANSFER);
    expect(msg).toContain("겹칩니다");
  });
});
