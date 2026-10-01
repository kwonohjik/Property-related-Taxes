/**
 * anchor: Q-1 — 가목2) 아파트 양도기한(§167조의3⑪, 대통령령 제36737호 2026.9.30. 공포·
 * 2026.10.1. 시행 신설)이 다주택 중과 배제(§167의3①2호)에 거는 게이트.
 *
 * 2주택(일반주택 h1 + 장기임대 아파트 h2) 구성에서 h2가 가목 요건을 충족하면 h1은
 * §167의10①10호(h2가 2호 주택)로 중과 배제된다. h2가 **아파트**이고 이 계산(= h1 양도)
 * 시점이 §167의3⑪ 기한(바닥 2027.12.31)을 연장 없이 지났다면, h2는 더 이상 가목 "장기임대주택"으로
 * 인정되지 않아 h1의 배제가 풀리고 중과가 걸린다 — 결정세액이 바뀐다(route-level before→after).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput } from "../_helpers/mock-rates";

/**
 * 가목 요건을 충족하는 장기임대 아파트(h2) — 2018.1.1 등록(가·다목 등록상한 2018.4.2 이내,
 * 다주택 전용 잔여 게이트 — check.ts 주석)·수도권 3억·5%룰·8년 임대.
 */
const GA_MOK_APT_RENTAL = {
  isLongTermRental: true,
  rentalType: "A" as const,
  isApartment: true,
  isRegisteredRental: true,
  rentalRegistrationDate: new Date("2018-01-01"),
  businessRegistrationDate: new Date("2018-01-01"),
  rentalStartOfficialPrice: 300_000_000,
  rentIncreaseUnder5Pct: true,
  rentalPeriodYears: 8,
};

function household(transferDate: Date, rentalIsLongTermRental = true): TransferTaxInput {
  const houses = [
    {
      id: "selling",
      acquisitionDate: new Date("2015-01-01"),
      officialPrice: 300_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    },
    {
      id: "rental",
      acquisitionDate: new Date("2018-01-01"),
      officialPrice: 300_000_000,
      region: "capital",
      regionCode: "11680",
      isInherited: false,
      isOfficetel: false,
      isUnsoldHousing: false,
      ...GA_MOK_APT_RENTAL,
      isLongTermRental: rentalIsLongTermRental,
    },
  ];
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2015-01-01"),
    transferDate,
    isRegulatedArea: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    houses: houses as TransferTaxInput["houses"],
    sellingHouseId: "selling",
  } as Partial<TransferTaxInput>);
}

const tax = (i: TransferTaxInput) => calculateTransferTax(i, loadFallbackTransferRates(i.transferDate)).totalTax;

describe("Q-1 — §167조의3⑪ 아파트 양도기한이 다주택 중과 배제에 거는 게이트 (route-level)", () => {
  it("2027.12.31(바닥 경계값 — 기한 내) 양도 → h2 가목 인정 → h1 중과 배제", () => {
    const before = tax(household(new Date("2027-12-31")));
    const noRental = tax(household(new Date("2027-12-31"), false));
    // 중과 배제 상태 — 일반(비임대) h2를 둔 경우보다 세액이 낮거나 같다(배제 vs 중과 비교 기준선).
    expect(before).toBeLessThan(noRental);
  });

  it("2028.1.1(바닥 다음날 — 연장 없이 기한 초과) 양도 → h2 가목 불인정 → h1 중과 → 결정세액 상승", () => {
    const beforeFloor = tax(household(new Date("2027-12-31")));
    const afterFloor = tax(household(new Date("2028-01-01")));
    expect(afterFloor).toBeGreaterThan(beforeFloor); // 구별력 가드 — 중과가 걸리면 세액이 오른다
  });
});
