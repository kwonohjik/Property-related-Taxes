/**
 * transfer-tax-api-houses.ts — 세대 보유 주택 목록 API 페이로드 빌더 (④⑬)
 *
 * transfer-tax-api.ts 800줄 정책 초과로 분리 (2026-06-16).
 * houses 인라인 map + 장기임대 9유형 매트릭스 18필드 게이트를 담당.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { isHousingLike } from "./transfer-tax-api-helpers";

/**
 * 양도주택(selling) + 보유주택 목록 → Zod houseSchema 배열 페이로드 빌드.
 * isLongTermRental=true && rentalType 설정 시에만 9유형 18필드를 게이트.
 * sellingExclusion: 양도 주택 3주택+ 전용 배제 특례(저당권·사원주택·문화재·어린이집 등) — selling 객체에 주입.
 */
export function buildHousesPayload(
  primary: AssetForm,
  sellingHouseRegion: "capital" | "non_capital",
  houses: HouseEntry[],
  presaleRightsCount: number,
  sellingExclusion?: TransferFormData["sellingHouseExclusion"],
): object[] | undefined {
  const hasMultiHouseEntries = houses.length > 0 || presaleRightsCount > 0;
  if (!isHousingLike(primary.assetKind) || !hasMultiHouseEntries) return undefined;

  const se = sellingExclusion;
  const sellingHouse = {
    id: "selling",
    region: sellingHouseRegion,
    // ④⑬ 법정동코드 — 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정, 미제공 시 boolean fallback
    regionCode: primary.regionCode || undefined,
    acquisitionDate: primary.acquisitionDate,
    officialPrice: parseAmount(primary.standardPriceAtTransfer) || 0,
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    // P2 양도 주택 3주택+ 전용 배제 특례
    isMortgageExecution: se?.isMortgageExecution,
    isEmployeeHousing: se?.isEmployeeHousing,
    freeProvisionYears:
      se?.isEmployeeHousing && se.freeProvisionYears ? parseFloat(se.freeProvisionYears) : undefined,
    isTaxSpecialExemption: se?.isTaxSpecialExemption,
    isCulturalHeritage: se?.isCulturalHeritage,
    isDayCareCenter: se?.isDayCareCenter,
    dayCareOperationYears:
      se?.isDayCareCenter && se.dayCareOperationYears ? parseFloat(se.dayCareOperationYears) : undefined,
  };

  const otherHouses = houses
    .filter((h) => h.acquisitionDate)
    .map((h) => ({
      id: h.id,
      region: h.region,
      acquisitionDate: h.acquisitionDate,
      officialPrice: parseInt(h.officialPrice) || 0,
      isInherited: h.isInherited,
      isLongTermRental: h.isLongTermRental,
      isApartment: h.isApartment,
      isOfficetel: h.isOfficetel,
      isUnsoldHousing: h.isUnsoldHousing,
      // ⑬ 소형신축·준공후미분양 특례 (§167의3①12가·나목)
      acquisitionPrice: parseAmount(h.acquisitionPrice || "") || undefined,
      exclusiveArea: h.exclusiveArea ? parseFloat(h.exclusiveArea) : undefined,
      isUnsoldNewHouse: h.isUnsoldNewHouse,
      completionDate: h.completionDate || undefined,
      // #2a 배우자 단독 보유 (§167의3⑨ 혼인 차감) — 양도주택(selling)은 본인 소유라 미설정
      isSpouseOwned: h.isSpouseOwned,
      // 상속 5년 배제 — isInherited=true 일 때만 기산일 전달
      inheritedDate: h.isInherited ? h.inheritedDate || undefined : undefined,
      // §155③ 공동상속 (2-A2) — isInherited=true 일 때만 전달
      isCoInherited: h.isInherited ? h.isCoInherited : undefined,
      isLargestCoInheritedShareholder:
        h.isInherited && h.isCoInherited ? h.isLargestCoInheritedShareholder : undefined,
      // §155② 단서·순위 게이트 — isInherited=true 일 때만 전달. 동거봉양 예외는 동일세대일 때만.
      decedentSameHouseholdAtInheritance: h.isInherited
        ? h.decedentSameHouseholdAtInheritance
        : undefined,
      parentalCareMergeInheritedHouse:
        h.isInherited && h.decedentSameHouseholdAtInheritance
          ? h.parentalCareMergeInheritedHouse
          : undefined,
      isRankingDisqualifiedInheritedHouse: h.isInherited
        ? h.isRankingDisqualifiedInheritedHouse
        : undefined,
      // 장기임대 legacy 등록 경로 — isLongTermRental=true 일 때만 등록정보 전달
      isRegisteredRental: h.isLongTermRental ? h.isRegisteredRental : undefined,
      rentalRegistrationDate: h.isLongTermRental ? h.rentalRegistrationDate || undefined : undefined,
      businessRegistrationDate: h.isLongTermRental ? h.businessRegistrationDate || undefined : undefined,
      rentalPeriodYears:
        h.isLongTermRental && h.rentalPeriodYears ? parseFloat(h.rentalPeriodYears) : undefined,
      rentalCancelledDate: h.isLongTermRental ? h.rentalCancelledDate || undefined : undefined,
      // P2 특수 배제 (2주택 전용·인구감소) — 독립 플래그, 토글 ON 시 부속값 전달
      isUnavoidableReason: h.isUnavoidableReason,
      unavoidableResidenceYears:
        h.isUnavoidableReason && h.unavoidableResidenceYears
          ? parseFloat(h.unavoidableResidenceYears)
          : undefined,
      unavoidableReasonResolvedDate: h.isUnavoidableReason
        ? h.unavoidableReasonResolvedDate || undefined
        : undefined,
      isLitigationHousing: h.isLitigationHousing,
      litigationAcquisitionDate: h.isLitigationHousing
        ? h.litigationAcquisitionDate || undefined
        : undefined,
      isRedevelopmentZone: h.isRedevelopmentZone,
      isPopulationDeclineArea: h.isPopulationDeclineArea,
      isSecondHomeRegistered: h.isPopulationDeclineArea ? h.isSecondHomeRegistered : undefined,
      populationAreaType: h.isPopulationDeclineArea ? h.populationAreaType : undefined,
      // ④⑬ 장기임대 9유형 매트릭스 — isLongTermRental=true && rentalType 설정 시에만 전달
      ...(h.isLongTermRental && h.rentalType
        ? {
            rentalType: h.rentalType,
            rentIncreaseUnder5Pct: h.rentIncreaseUnder5Pct,
            isNationalSizeHousing: h.isNationalSizeHousing,
            hasMinimum2Units: h.hasMinimum2Units,
            hasMinimum5UnitsInCity: h.hasMinimum5UnitsInCity,
            rentalLandArea: h.rentalLandArea ? parseFloat(h.rentalLandArea) : undefined,
            rentalTotalFloorArea: h.rentalTotalFloorArea ? parseFloat(h.rentalTotalFloorArea) : undefined,
            isConvertedToSale: h.isConvertedToSale,
            firstSaleContractDate: h.firstSaleContractDate || undefined,
            acquisitionOfficialPrice: h.acquisitionOfficialPrice
              ? parseInt(h.acquisitionOfficialPrice)
              : undefined,
            rentalStartOfficialPrice: h.rentalStartOfficialPrice
              ? parseInt(h.rentalStartOfficialPrice)
              : undefined,
            hasHalfDutyPeriodMet: h.hasHalfDutyPeriodMet,
            isSoldWithin1YearOfCancellation: h.isSoldWithin1YearOfCancellation,
            rentalCancellationDate: h.rentalCancellationDate || undefined,
            isExcluded918Rule: h.isExcluded918Rule,
            isExcludedAfter20200711Apt: h.isExcludedAfter20200711Apt,
            isExcludedShortToLongChange: h.isExcludedShortToLongChange,
            hasContractDepositProof: h.hasContractDepositProof,
          }
        : {}),
    }));

  return [sellingHouse, ...otherHouses];
}
