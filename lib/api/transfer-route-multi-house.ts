/**
 * transfer-route-multi-house.ts — 다주택 중과 입력의 Route handler Date 변환 헬퍼 (⑭)
 *
 * route.ts(800줄 정책)에서 분리. Zod 파싱 결과(string 날짜) → 엔진 input(Date) 변환.
 * date-coerce 헬퍼로 string→Date silent false 함정 차단.
 */

import type { z } from "zod";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import type { houseSchema, presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { HouseInfo, MultiHouseGracePeriodInput, PresaleRight } from "@/lib/tax-engine/multi-house-surcharge";

type HouseInput = z.infer<typeof houseSchema>;
type PresaleRightInput = z.infer<typeof presaleRightSchema>;
type GracePeriodInput = {
  contractDate: string;
  isLandPermitArea: boolean;
  hasTenantInResidence: boolean;
  areaDesignatedDate?: string;
};

/** Zod houses[] → 엔진 HouseInfo[] (신규 필드 Date 변환 포함) */
export function mapHousesToEngine(houses: HouseInput[] | undefined): HouseInfo[] | undefined {
  if (!houses) return undefined;
  return houses.map((h) => ({
    id: h.id,
    region: h.region,
    acquisitionDate: new Date(h.acquisitionDate),
    officialPrice: h.officialPrice,
    isInherited: h.isInherited,
    isLongTermRental: h.isLongTermRental,
    isApartment: h.isApartment,
    isOfficetel: h.isOfficetel,
    isUnsoldHousing: h.isUnsoldHousing,
    // ⑬ 소형신축·준공후미분양 특례 (§167의3①12가·나목) — completionDate는 Date 변환
    acquisitionPrice: h.acquisitionPrice,
    exclusiveArea: h.exclusiveArea,
    isUnsoldNewHouse: h.isUnsoldNewHouse,
    completionDate: toOptionalDate(h.completionDate),
    inheritedDate: toOptionalDate(h.inheritedDate),
    isRegisteredRental: h.isRegisteredRental,
    rentalRegistrationDate: toOptionalDate(h.rentalRegistrationDate),
    businessRegistrationDate: toOptionalDate(h.businessRegistrationDate),
    rentalPeriodYears: h.rentalPeriodYears,
    rentalCancelledDate: toOptionalDate(h.rentalCancelledDate),
    // ⑭ 장기임대 9유형 매트릭스 18필드 — 폼/Zod 이름(rentalLandArea·rentalTotalFloorArea) →
    // 엔진 HouseInfo 이름(landArea·totalFloorArea)으로 매핑. 날짜는 Date 변환. (누락 시 엔진 미도달=과다산정)
    rentalType: h.rentalType,
    rentIncreaseUnder5Pct: h.rentIncreaseUnder5Pct,
    isNationalSizeHousing: h.isNationalSizeHousing,
    hasMinimum2Units: h.hasMinimum2Units,
    hasMinimum5UnitsInCity: h.hasMinimum5UnitsInCity,
    landArea: h.rentalLandArea,
    totalFloorArea: h.rentalTotalFloorArea,
    isConvertedToSale: h.isConvertedToSale,
    firstSaleContractDate: toOptionalDate(h.firstSaleContractDate),
    acquisitionOfficialPrice: h.acquisitionOfficialPrice,
    rentalStartOfficialPrice: h.rentalStartOfficialPrice,
    hasHalfDutyPeriodMet: h.hasHalfDutyPeriodMet,
    isSoldWithin1YearOfCancellation: h.isSoldWithin1YearOfCancellation,
    rentalCancellationDate: toOptionalDate(h.rentalCancellationDate),
    isExcluded918Rule: h.isExcluded918Rule,
    isExcludedAfter20200711Apt: h.isExcludedAfter20200711Apt,
    isExcludedShortToLongChange: h.isExcludedShortToLongChange,
    hasContractDepositProof: h.hasContractDepositProof,
    // P2 특수 배제 (other-house 2주택·인구감소) — 날짜 Date 변환
    isUnavoidableReason: h.isUnavoidableReason,
    unavoidableResidenceYears: h.unavoidableResidenceYears,
    unavoidableReasonResolvedDate: toOptionalDate(h.unavoidableReasonResolvedDate),
    isLitigationHousing: h.isLitigationHousing,
    litigationAcquisitionDate: toOptionalDate(h.litigationAcquisitionDate),
    isRedevelopmentZone: h.isRedevelopmentZone,
    isPopulationDeclineArea: h.isPopulationDeclineArea,
    isSecondHomeRegistered: h.isSecondHomeRegistered,
    // P2 특수 배제 (selling-house 3주택+)
    isMortgageExecution: h.isMortgageExecution,
    isEmployeeHousing: h.isEmployeeHousing,
    freeProvisionYears: h.freeProvisionYears,
    isTaxSpecialExemption: h.isTaxSpecialExemption,
    isCulturalHeritage: h.isCulturalHeritage,
    isDayCareCenter: h.isDayCareCenter,
    dayCareOperationYears: h.dayCareOperationYears,
  }));
}

/** Zod presaleRights → 엔진 PresaleRight[] (취득일 string→Date) */
export function mapPresaleRightsToEngine(
  rights: PresaleRightInput[] | undefined,
): PresaleRight[] | undefined {
  if (!rights) return undefined;
  return rights.map((r) => ({
    id: r.id,
    type: r.type,
    acquisitionDate: new Date(r.acquisitionDate),
    region: r.region,
  }));
}

/** Zod gracePeriod → 엔진 MultiHouseGracePeriodInput (string→Date) */
export function mapGracePeriodToEngine(
  gp: GracePeriodInput | undefined,
): MultiHouseGracePeriodInput | undefined {
  if (!gp) return undefined;
  return {
    contractDate: toDate(gp.contractDate, "gracePeriod.contractDate"),
    isLandPermitArea: gp.isLandPermitArea,
    hasTenantInResidence: gp.hasTenantInResidence,
    areaDesignatedDate: toOptionalDate(gp.areaDesignatedDate),
  };
}
