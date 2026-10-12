/**
 * §155⑳ 임대주택 카드의 호 → 다주택 중과 판정용 명부 행 (결정 #20 C · G8-1 후속).
 *
 * ⑳이 **불성립**하면 임대주택은 그냥 주택이라 중과 주택 수에도 들어간다(영 §167의3① 본문 · §167의10① 본문 —
 * 주택 수에서 빼는 것은 1호·12호뿐, 조심 2021서1571). 그중 영 §167의3①2호 장기임대주택은 중과 대상에서 빠지고,
 * 그것을 빼고 남은 주택이 양도 주택 하나뿐이면 양도 주택이 10호(§167의3①10호 · §167의10①10호)로 배제된다.
 *
 * 2호 여부는 **중과 술어**로 판정한다(사용자 결정 2026-10-12) — ⑳의 호별 판정과 같지 않다(가목 1) 2018.3.31.
 * 등록기한 · 마목 1) 조정대상지역 신규 취득 · ㉓ 말소 특례가 다르다). 그래서 카드의 사실을 명부 장기임대 행과
 * 같은 필드로 옮기고, 목은 등록 시기로 정하지 않고 그 구분에 해당할 수 있는 목을 차례로 대 본다 — 어느 목이든
 * 2호(또는 §167의3④ 의무기간 충족 전)를 통과하면 그 목으로 둔다. 하나도 통과하지 못하면 첫 목으로 둔다(2호 아님).
 *
 * 영 §167의3①1호(지방 3억 이하 주택 수 불산입)는 카드의 소재지 법정동코드와 「거주주택 양도 당시 기준시가」로 판정한다 —
 * 명부 행과 같은 필드(`regionCriteria` · `transferOfficialPrice`)로 옮겨 중과 엔진의 같은 분기를 탄다(`rentalUnitLowPriceFacts`).
 *
 * 카드에 없는 사실은 **불리한 쪽**으로 둔다(사용자 결정 2026-10-04):
 * - 소재지 코드 또는 (가액기준 지역이면) 양도 당시 기준시가 → 모른다 → 지역기준(REGION, 무조건 산입 — 1호 불산입을 주지 않는다).
 * - 취득일 → 모른다 → 양도일(§167의3⑨ 합가 차감 단서 「혼인 후 취득」에 걸리는 쪽).
 * - 말소 선언인데 말소일이 없다 → 양도일에 말소된 것으로 본다(2호 아님).
 */
import type { HouseInfo, RentalHousingType } from "./types/multi-house-surcharge.types";
import type { RentalUnitInput } from "./transfer-tax/rental-housing-exception/types";
import {
  classifyRegionCriteriaByCode,
  isLongTermRentalDutyPeriodPending,
  isLongTermRentalHousingExempt,
} from "./multi-house-surcharge-count";

/**
 * 영 §167의3①1호 판정 사실 — 가액기준 지역(그 밖의 지방)이고 거주주택 양도 당시 기준시가를 알 때만 가액기준으로 판정한다.
 * `known: false`는 1호 해당 여부를 몰라 산입한 호다(코드 없음 · 비수도권 + 기준시가 없음) — 고지 대상.
 */
export function rentalUnitLowPriceFacts(
  unit: Pick<RentalUnitInput, "regionCode" | "officialPriceAtTransfer" | "region">,
): { criteria: "REGION" | "VALUE"; price: number; known: boolean } {
  const code = unit.regionCode && unit.regionCode.length >= 10 ? unit.regionCode : undefined;
  if (code && classifyRegionCriteriaByCode(code) === "REGION") return { criteria: "REGION", price: 0, known: true };
  if (code && unit.officialPriceAtTransfer != null) {
    return { criteria: "VALUE", price: unit.officialPriceAtTransfer, known: true };
  }
  /**
   * 코드가 있고 가액기준인데 기준시가가 없거나, 코드 없이 비수도권이면 1호 해당 여부를 모른다.
   * 코드 없이 수도권이면 지역기준으로 본다 — 수도권 중 가액기준은 강화·옹진·연천·가평·양평 5개 군뿐이라 고지하지 않는다
   * (주소를 넣으면 코드로 정확히 판정한다).
   */
  return { criteria: "REGION", price: 0, known: !code && unit.region === "seoul-metro" };
}

/**
 * ⑳ 임대구분 → 그 구분이 해당할 수 있는 2호 목(유형 A~I · `ARTICLE_BY_RENTAL_TYPE`).
 * 장기일반은 가목(2018.3.31.까지 등록, 5년)·마목(10년) 중 하나다 — 등록기한은 중과 술어가 따진다.
 * 구 임대주택법 구분(⑳ 「구법」)은 2호에 따로 목이 없다 — 매입 가목·건설 다목으로 본다.
 */
function candidateRentalTypes(unit: RentalUnitInput): RentalHousingType[] {
  const construction = unit.rentalAcquisitionType === "construction";
  switch (unit.rentalCategory) {
    case "long_general":
      return construction ? ["C", "F"] : ["A", "E"];
    case "short_6y":
      return construction ? ["I"] : ["H"];
    case "existing_business":
      return ["B"];
    case "unsold_08_09":
      return ["D"];
    case "pre_2018":
      return construction ? ["C"] : ["A"];
  }
}

function rowFor(unit: RentalUnitInput, index: number, transferDate: Date, rentalType: RentalHousingType): HouseInfo {
  const capital = unit.region === "seoul-metro";
  const lowPrice = rentalUnitLowPriceFacts(unit);
  return {
    id: `임대주택 ${index + 1}호`,
    acquisitionDate: transferDate,
    officialPrice: lowPrice.price,
    ...(lowPrice.criteria === "VALUE" ? { transferOfficialPrice: lowPrice.price } : {}),
    region: capital ? "capital" : "non_capital",
    regionCriteria: lowPrice.criteria,
    isCapitalArea: capital,
    isInherited: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    isApartment: unit.isApartment,
    isLongTermRental: true,
    isRegisteredRental: true,
    rentalType,
    businessRegistrationDate: unit.businessRegistrationDate,
    rentalRegistrationDate: unit.rentalRegistrationDate,
    rentalPeriodYears: unit.rentalMonths / 12,
    rentIncreaseUnder5Pct: unit.requirementsConfirmed,
    rentalStartOfficialPrice: unit.standardPriceAtRentalStart,
    acquisitionOfficialPrice: unit.acquisitionOfficialPrice,
    isNationalSizeHousing: unit.isNationalSizeHousing,
    landArea: unit.landAreaM2,
    totalFloorArea: unit.totalFloorAreaM2,
    hasMinimum2Units: unit.hasMinimum2Units,
    hasMinimum5UnitsInCity: unit.hasMinimum5UnitsInCity,
    firstSaleContractDate: unit.firstSaleContractDate,
    isExcluded918Rule: unit.isExcluded918Rule,
    hasContractDepositProof: unit.hasContractDepositProof,
    isExcludedShortToLongChange: unit.isExcludedShortToLongChange,
    rentalAptDeadlineExtension: unit.aptDeadlineExtension,
    ...(unit.rentalAutoTermination ? { rentalCancelledDate: unit.registrationCancellationDate ?? transferDate } : {}),
  };
}

/** 카드의 임대 호 → 중과 판정용 명부 장기임대 행(호마다 1행). */
export function rentalCardSurchargeRows(units: readonly RentalUnitInput[], transferDate: Date): HouseInfo[] {
  return units.map((unit, i) => {
    const rows = candidateRentalTypes(unit).map((type) => rowFor(unit, i, transferDate, type));
    return (
      rows.find(
        (row) => isLongTermRentalHousingExempt(row, transferDate) || isLongTermRentalDutyPeriodPending(row, transferDate),
      ) ?? rows[0]
    );
  });
}
