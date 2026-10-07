/**
 * §155⑳ 장기임대주택 거주주택 특례 — 단건 route Zod 데이터 → 엔진 input 매핑 (⑭).
 *
 * route.ts 800줄 정책 분리(C4). 다건(multi/route.ts)은 date-coerce(toDate)를 쓰므로 별도.
 */

import type { z } from "zod";
import type { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema";
import type { RentalHousingExceptionInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
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
      businessRegistrationDate: new Date(u.businessRegistrationDate),
      rentalRegistrationDate: new Date(u.rentalRegistrationDate),
      rentalCategory: u.rentalCategory,
      rentalAcquisitionType: u.rentalAcquisitionType,
      isApartment: u.isApartment,
      region: u.region,
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
      firstSaleContractDate: u.firstSaleContractDate ? new Date(u.firstSaleContractDate) : undefined,
      rentalMonths: u.rentalMonths,
      rentalAutoTermination: u.rentalAutoTermination,
      registrationCancellationDate: toOptionalDate(u.registrationCancellationDate), // I-4 §155㉓
      terminatedRegistrationType: u.terminatedRegistrationType,
      aptDeadlineExtension: toEngineAptDeadlineExtension(u.aptDeadlineExtension), // §167의3⑪
      mergeOrigin: u.mergeOrigin, // 혼인합가 1199
      requirementsConfirmed: u.requirementsConfirmed,
    })),
    priorResidenceTransferDate: rhe.priorResidenceTransferDate
      ? new Date(rhe.priorResidenceTransferDate)
      : undefined,
    standardPriceAtAcquisition: rhe.standardPriceAtAcquisitionForPhrp,
    standardPriceAtPriorTransfer: rhe.standardPriceAtPriorTransfer,
    standardPriceAtTransfer: rhe.standardPriceAtTransferForPhrp,
    postRegistrationResidenceMonths: rhe.postRegistrationResidenceMonths,
    priorRentalExemptionHistory: rhe.priorRentalExemptionHistory,
    residenceTransitionUnderAddendum: rhe.residenceTransitionUnderAddendum,
    residenceTransitionBasis: rhe.residenceTransitionBasis,
    // §154⑩ 표준 경로(I-5) — rentalUnits 0호일 때만 엔진이 참조한다.
    wasRegisteredRentalOrChildcare: rhe.wasRegisteredRentalOrChildcare,
  };
}
