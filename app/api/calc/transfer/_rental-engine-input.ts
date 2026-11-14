/**
 * §155⑳ 장기임대주택 거주주택 특례 — 단건 route Zod 데이터 → 엔진 input 매핑 (⑭).
 *
 * route.ts 800줄 정책 분리(C4). 다건(multi/route.ts)은 date-coerce(toDate)를 쓰므로 별도.
 */

import type { z } from "zod";
import type { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema";
import type { RentalHousingExceptionInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { toDate } from "@/lib/api/date-coerce";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { toEngineAptDeadlineExtension } from "@/lib/api/transfer-route-multi-house";

type RentalHousingExceptionData = z.infer<typeof rentalHousingExceptionSchema>;

export function toRentalHousingExceptionEngineInput(
  rhe: RentalHousingExceptionData | undefined,
): RentalHousingExceptionInput | undefined {
  if (!rhe) return undefined;
  return {
    applyException: rhe.applyException,
    scenario: rhe.scenario,
    rentalUnits: rhe.rentalUnits.map((u) => ({
      businessRegistrationDate: toDate(u.businessRegistrationDate, "businessRegistrationDate"),
      rentalRegistrationDate: toDate(u.rentalRegistrationDate, "rentalRegistrationDate"),
      rentalRegisteredDate: toOptionalDate(u.rentalRegisteredDate), // V-3
      rentalCategory: u.rentalCategory,
      rentalAcquisitionType: u.rentalAcquisitionType,
      isApartment: u.isApartment,
      isUrbanLifeHousingApartment: u.isUrbanLifeHousingApartment, // 가목2) 괄호 — 양도기한 게이트만
      region: u.region,
      regionCode: u.regionCode, // 영 §167의3①1호 지역기준(결정 #20 C 후속)
      officialPriceAtTransfer: u.officialPriceAtTransfer, // 영 §167의3①1호 양도 당시 기준시가
      isExcluded918Rule: u.isExcluded918Rule,
      hasContractDepositProof: u.hasContractDepositProof,
      isExcludedShortToLongChange: u.isExcludedShortToLongChange,
      standardPriceAtRentalStart: u.standardPriceAtRentalStart,
      acquisitionOfficialPrice: u.acquisitionOfficialPrice,
      isNationalSizeHousing: u.isNationalSizeHousing,
      landAreaM2: u.landAreaM2,
      totalFloorAreaM2: u.totalFloorAreaM2,
      hasMinimum2Units: u.hasMinimum2Units,
      hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity,
      firstSaleContractDate: toOptionalDate(u.firstSaleContractDate),
      rentalMonths: u.rentalMonths,
      succession: u.succession, // G-3·G-5 승계 echo·고지(개월은 rentalMonths에 이미 합산)
      donorRegistration: u.donorRegistration
        ? {
            businessRegistrationDate: toDate(u.donorRegistration.businessRegistrationDate, "donorRegistration.businessRegistrationDate"),
            rentalRegistrationDate: toDate(u.donorRegistration.rentalRegistrationDate, "donorRegistration.rentalRegistrationDate"),
            rentalRegisteredDate: toOptionalDate(u.donorRegistration.rentalRegisteredDate),
          }
        : undefined, // G-3 증여자 등록 기준
      halfDutyRentalMonths: u.halfDutyRentalMonths, // V-5 §155㉓1호 1/2(지자체 등록일 기산)
      rentalAutoTermination: u.rentalAutoTermination,
      registrationCancellationDate: toOptionalDate(u.registrationCancellationDate), // I-4 §155㉓
      terminatedRegistrationType: u.terminatedRegistrationType,
      terminationReason: u.terminationReason, // 다주택 중과 §167의3①2호 단서
      aptDeadlineExtension: toEngineAptDeadlineExtension(u.aptDeadlineExtension), // §167의3⑪
      mergeOrigin: u.mergeOrigin, // 혼인합가 1199
      requirementsConfirmed: u.requirementsConfirmed,
    })),
    priorResidenceTransferDate: toOptionalDate(rhe.priorResidenceTransferDate),
    standardPriceAtAcquisition: rhe.standardPriceAtAcquisitionForPhrp,
    standardPriceAtPriorTransfer: rhe.standardPriceAtPriorTransfer,
    standardPriceAtTransfer: rhe.standardPriceAtTransferForPhrp,
    postRegistrationResidenceMonths: rhe.postRegistrationResidenceMonths,
    priorRentalExemptionHistory: rhe.priorRentalExemptionHistory,
    counterpartHouseResidedTwoYears: rhe.counterpartHouseResidedTwoYears,
    residenceTransitionUnderAddendum: rhe.residenceTransitionUnderAddendum,
    residenceTransitionBasis: rhe.residenceTransitionBasis,
    // §154⑩ 표준 경로(I-5) — rentalUnits 0호일 때만 엔진이 참조한다.
    wasRegisteredRentalOrChildcare: rhe.wasRegisteredRentalOrChildcare,
  };
}
