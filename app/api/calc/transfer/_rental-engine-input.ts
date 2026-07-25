/**
 * §155⑳ 장기임대주택 거주주택 특례 — 단건 route Zod 데이터 → 엔진 input 매핑 (⑭).
 *
 * route.ts 800줄 정책 분리(C4). 다건(multi/route.ts)은 date-coerce(toDate)를 쓰므로 별도.
 */

import type { z } from "zod";
import type { rentalHousingExceptionSchema } from "@/lib/api/transfer-tax-schema";
import type { RentalHousingExceptionInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

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
      requirementsConfirmed: u.requirementsConfirmed,
    })),
    priorResidenceTransferDate: rhe.priorResidenceTransferDate
      ? new Date(rhe.priorResidenceTransferDate)
      : undefined,
    standardPriceAtAcquisition: rhe.standardPriceAtAcquisitionForPhrp,
    standardPriceAtPriorTransfer: rhe.standardPriceAtPriorTransfer,
    standardPriceAtTransfer: rhe.standardPriceAtTransferForPhrp,
  };
}
