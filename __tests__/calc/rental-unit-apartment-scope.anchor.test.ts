/**
 * anchor: SYNC-3 — 단기 6년(아·자목)에서 화면이 묻지 않는 「아파트」 값이 엔진에 닿지 않는다
 * (계획서 `docs/00-pm/rental-155-20-review-fixes.plan.md` PR-4 · C-17). ⑤ `RentalUnitCard`·④ `toRentalHousingExceptionApi`가
 * 같은 술어 `rentalUnitApartmentInScope`를 쓴다. 종전에는 다른 구분에서 고른 「아파트」가 남아 아·자목 아파트 일괄 배제로 ⑳이 불성립했다.
 */
import { describe, it, expect } from "vitest";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitApartmentInScope } from "@/lib/calc/rental-unit-apartment-scope";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

const payloadApt = (rentalCategory: "short_6y" | "long_general") => {
  const a = makeDefaultAsset(1);
  a.assetKind = "housing";
  a.rentalHousingException = {
    ...a.rentalHousingException,
    applyException: true,
    scenario: "A",
    rentalUnits: [{ ...makeDefaultRentalUnit(), rentalCategory, isApartment: true, businessRegistrationDate: "2025-07-01", rentalRegistrationDate: "2025-07-01" }],
  };
  const p = toRentalHousingExceptionApi(a) as { rentalUnits: { isApartment: boolean }[] } | undefined;
  return p?.rentalUnits[0].isApartment;
};

describe("SYNC-3 아파트 문항 범위 — ⑤·④ 같은 술어", () => {
  it("C-17 단기 6년(아·자목) + 남은 isApartment=true → ④는 false를 보낸다", () => {
    expect(rentalUnitApartmentInScope({ rentalCategory: "short_6y" })).toBe(false);
    expect(payloadApt("short_6y")).toBe(false);
  });
  it("[짝] 장기일반은 묻는 문항이라 그대로 보낸다", () => {
    expect(rentalUnitApartmentInScope({ rentalCategory: "long_general" })).toBe(true);
    expect(payloadApt("long_general")).toBe(true);
  });
});
