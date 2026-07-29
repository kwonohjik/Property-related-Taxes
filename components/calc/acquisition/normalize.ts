/**
 * 취득세 마법사 폼 상태 마이그레이션·정규화
 *
 * - sessionStorage에 저장된 구버전 FormState (18 필드 legacy)를
 *   신버전 FormState (~78 필드)로 안전하게 업그레이드
 * - currentStep 4단계 → 6단계 인덱스 변환
 *
 * P5UI-3: normalize.ts 신설
 */

import { INITIAL_FORM, type FormState, type OwnedHouseInfo } from "./shared";

// ============================================================
// Legacy 폼 (18 필드 구버전) 타입
// ============================================================

/**
 * 4단계 마법사의 구버전 폼 상태 (P5UI 이전 버전)
 * 런타임에서 sessionStorage 값이 이 형태일 수 있음
 */
export interface LegacyFormState {
  propertyType?: string;
  acquisitionCause?: string;
  acquiredBy?: string;
  reportedPrice?: string;
  marketValue?: string;
  standardValue?: string;
  encumbrance?: string;
  constructionCost?: string;
  houseCountAfter?: string;
  isRegulatedArea?: boolean;
  isLuxuryProperty?: boolean;
  isRelatedParty?: boolean;
  isFirstHome?: boolean;
  isMetropolitan?: boolean;
  areaSqm?: string;
  balancePaymentDate?: string;
  registrationDate?: string;
  contractDate?: string;
  usageApprovalDate?: string;
  jibun?: string;
  road?: string;
  building?: string;
  // 구버전에는 없는 필드들 — undefined로 허용
  [key: string]: unknown;
}

// ============================================================
// currentStep 마이그레이션 (4단계 → 6단계)
// ============================================================

/**
 * 구버전 4단계 인덱스 → 신버전 6단계 인덱스 매핑
 *
 * 구버전 단계 구조:
 *   0: 취득 정보
 *   1: 물건 상세
 *   2: 주택 현황
 *   3: 감면 확인
 *
 * 신버전 단계 구조:
 *   0: 취득 정보
 *   1: 물건 상세
 *   2: 주택 현황
 *   3: 중과 분기
 *   4: 법인·특수
 *   5: 감면 확인
 */
export const LEGACY_STEP_MIGRATION: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 5, // 구버전 감면 → 신버전 감면 (스텝 5)
};

export function migrateStepIndex(legacyStep: number): number {
  return LEGACY_STEP_MIGRATION[legacyStep] ?? 0;
}

// ============================================================
// 폼 상태 정규화 함수
// ============================================================

/**
 * 구버전 또는 부분적 FormState를 최신 FormState로 정규화
 *
 * - 알 수 없는 필드는 INITIAL_FORM default 사용
 * - 기존 필드는 보존
 * - 신규 필드는 INITIAL_FORM 기본값으로 초기화
 */
export function normalizeAcquisitionForm(
  legacy: Partial<LegacyFormState> | null | undefined
): FormState {
  if (!legacy) return { ...INITIAL_FORM };

  // 기본값에서 시작하여 legacy 값으로 덮어쓰기
  const form: FormState = {
    ...INITIAL_FORM,

    // 기존 18 필드 — legacy 값 우선 (있으면 사용, 없으면 INITIAL_FORM default)
    propertyType: (legacy.propertyType as string) || INITIAL_FORM.propertyType,
    acquisitionCause: (legacy.acquisitionCause as string) || INITIAL_FORM.acquisitionCause,
    acquiredBy: (legacy.acquiredBy as string) || INITIAL_FORM.acquiredBy,
    reportedPrice: (legacy.reportedPrice as string) ?? INITIAL_FORM.reportedPrice,
    marketValue: (legacy.marketValue as string) ?? INITIAL_FORM.marketValue,
    standardValue: (legacy.standardValue as string) ?? INITIAL_FORM.standardValue,
    encumbrance: (legacy.encumbrance as string) ?? INITIAL_FORM.encumbrance,
    constructionCost: (legacy.constructionCost as string) ?? INITIAL_FORM.constructionCost,
    houseCountAfter: (legacy.houseCountAfter as string) || INITIAL_FORM.houseCountAfter,
    isRegulatedArea: typeof legacy.isRegulatedArea === "boolean"
      ? legacy.isRegulatedArea
      : INITIAL_FORM.isRegulatedArea,
    isLuxuryProperty: typeof legacy.isLuxuryProperty === "boolean"
      ? legacy.isLuxuryProperty
      : INITIAL_FORM.isLuxuryProperty,
    isRelatedParty: typeof legacy.isRelatedParty === "boolean"
      ? legacy.isRelatedParty
      : INITIAL_FORM.isRelatedParty,
    isFirstHome: typeof legacy.isFirstHome === "boolean"
      ? legacy.isFirstHome
      : INITIAL_FORM.isFirstHome,
    isMetropolitan: typeof legacy.isMetropolitan === "boolean"
      ? legacy.isMetropolitan
      : INITIAL_FORM.isMetropolitan,
    areaSqm: (legacy.areaSqm as string) ?? INITIAL_FORM.areaSqm,
    balancePaymentDate: (legacy.balancePaymentDate as string) ?? INITIAL_FORM.balancePaymentDate,
    registrationDate: (legacy.registrationDate as string) ?? INITIAL_FORM.registrationDate,
    contractDate: (legacy.contractDate as string) ?? INITIAL_FORM.contractDate,
    usageApprovalDate: (legacy.usageApprovalDate as string) ?? INITIAL_FORM.usageApprovalDate,
    jibun: (legacy.jibun as string) ?? INITIAL_FORM.jibun,
    road: (legacy.road as string) ?? INITIAL_FORM.road,
    building: (legacy.building as string) ?? INITIAL_FORM.building,

    // 신규 필드 — legacy에 있으면 사용, 없으면 INITIAL_FORM 기본값
    isRuralRegion: typeof legacy.isRuralRegion === "boolean"
      ? (legacy.isRuralRegion as boolean)
      : INITIAL_FORM.isRuralRegion,
    isSmallHouseFirstHome: typeof legacy.isSmallHouseFirstHome === "boolean"
      ? (legacy.isSmallHouseFirstHome as boolean)
      : INITIAL_FORM.isSmallHouseFirstHome,

    isUrbanRegenerationArea: typeof legacy.isUrbanRegenerationArea === "boolean"
      ? (legacy.isUrbanRegenerationArea as boolean)
      : INITIAL_FORM.isUrbanRegenerationArea,
    isTemporaryTwoHouse: typeof legacy.isTemporaryTwoHouse === "boolean"
      ? (legacy.isTemporaryTwoHouse as boolean)
      : INITIAL_FORM.isTemporaryTwoHouse,
    previousHouseAcquisitionDate: (legacy.previousHouseAcquisitionDate as string) ?? INITIAL_FORM.previousHouseAcquisitionDate,
    previousHouseRegion: (legacy.previousHouseRegion as string) ?? INITIAL_FORM.previousHouseRegion,
    newHouseRegion: (legacy.newHouseRegion as string) ?? INITIAL_FORM.newHouseRegion,
    wholeHouseStandardValue: (legacy.wholeHouseStandardValue as string) ?? INITIAL_FORM.wholeHouseStandardValue,
    isMetropolitanRegion: typeof legacy.isMetropolitanRegion === "boolean"
      ? (legacy.isMetropolitanRegion as boolean)
      : INITIAL_FORM.isMetropolitanRegion,

    giftRelation: (legacy.giftRelation as string) ?? INITIAL_FORM.giftRelation,
    giftorRelation: (legacy.giftorRelation as string) ?? INITIAL_FORM.giftorRelation,
    giftorIs1HHHolder: typeof legacy.giftorIs1HHHolder === "boolean"
      ? (legacy.giftorIs1HHHolder as boolean)
      : INITIAL_FORM.giftorIs1HHHolder,

    contractDateBeforeRegulation: typeof legacy.contractDateBeforeRegulation === "boolean"
      ? (legacy.contractDateBeforeRegulation as boolean)
      : INITIAL_FORM.contractDateBeforeRegulation,
    regulationDesignationDate: (legacy.regulationDesignationDate as string) ?? INITIAL_FORM.regulationDesignationDate,
    hasContractDepositProof: typeof legacy.hasContractDepositProof === "boolean"
      ? (legacy.hasContractDepositProof as boolean)
      : INITIAL_FORM.hasContractDepositProof,

    isCorpMetroSurcharge: typeof legacy.isCorpMetroSurcharge === "boolean"
      ? (legacy.isCorpMetroSurcharge as boolean)
      : INITIAL_FORM.isCorpMetroSurcharge,
    luxuryType: (legacy.luxuryType as string) ?? INITIAL_FORM.luxuryType,

    isMetropolitanCongestion: typeof legacy.isMetropolitanCongestion === "boolean"
      ? (legacy.isMetropolitanCongestion as boolean)
      : INITIAL_FORM.isMetropolitanCongestion,
    isHeadquarterNewBuild: typeof legacy.isHeadquarterNewBuild === "boolean"
      ? (legacy.isHeadquarterNewBuild as boolean)
      : INITIAL_FORM.isHeadquarterNewBuild,
    isNonUrbanFactory: typeof legacy.isNonUrbanFactory === "boolean"
      ? (legacy.isNonUrbanFactory as boolean)
      : INITIAL_FORM.isNonUrbanFactory,
    factoryComponent: (legacy.factoryComponent as string) ?? INITIAL_FORM.factoryComponent,
    isWithin5YearsOfEstablishment: typeof legacy.isWithin5YearsOfEstablishment === "boolean"
      ? (legacy.isWithin5YearsOfEstablishment as boolean)
      : INITIAL_FORM.isWithin5YearsOfEstablishment,
    excludedBusinessType: (legacy.excludedBusinessType as string) ?? INITIAL_FORM.excludedBusinessType,
    isDormantCorpAcquisition: typeof legacy.isDormantCorpAcquisition === "boolean"
      ? (legacy.isDormantCorpAcquisition as boolean)
      : INITIAL_FORM.isDormantCorpAcquisition,
    dormantCorpType: (legacy.dormantCorpType as string) ?? INITIAL_FORM.dormantCorpType,

    specialRateType: (legacy.specialRateType as string) ?? INITIAL_FORM.specialRateType,
    isOneHouseHousehold: typeof legacy.isOneHouseHousehold === "boolean"
      ? (legacy.isOneHouseHousehold as boolean)
      : INITIAL_FORM.isOneHouseHousehold,
    isSelfCultivatedFarmlandInheritance: typeof legacy.isSelfCultivatedFarmlandInheritance === "boolean"
      ? (legacy.isSelfCultivatedFarmlandInheritance as boolean)
      : INITIAL_FORM.isSelfCultivatedFarmlandInheritance,

    isSelfCultivatedFarmer: typeof legacy.isSelfCultivatedFarmer === "boolean"
      ? (legacy.isSelfCultivatedFarmer as boolean)
      : INITIAL_FORM.isSelfCultivatedFarmer,
    farmingYears: (legacy.farmingYears as string) ?? INITIAL_FORM.farmingYears,
    farmlandArea: (legacy.farmlandArea as string) ?? INITIAL_FORM.farmlandArea,
    farmlandLocationDistance: (legacy.farmlandLocationDistance as string) ?? INITIAL_FORM.farmlandLocationDistance,
    residesInSameOrAdjacentJurisdiction: typeof legacy.residesInSameOrAdjacentJurisdiction === "boolean"
      ? (legacy.residesInSameOrAdjacentJurisdiction as boolean)
      : INITIAL_FORM.residesInSameOrAdjacentJurisdiction,

    ownedHouses: Array.isArray(legacy.ownedHouses)
      ? (legacy.ownedHouses as OwnedHouseInfo[])
      : INITIAL_FORM.ownedHouses,
    trustedHouseCount: (legacy.trustedHouseCount as string) ?? INITIAL_FORM.trustedHouseCount,

    acquisitionOwnershipShare: (legacy.acquisitionOwnershipShare as string) ?? INITIAL_FORM.acquisitionOwnershipShare,
    coOwnersAllInHousehold: typeof legacy.coOwnersAllInHousehold === "boolean"
      ? (legacy.coOwnersAllInHousehold as boolean)
      : INITIAL_FORM.coOwnersAllInHousehold,

    acquiredViaRight: typeof legacy.acquiredViaRight === "boolean"
      ? (legacy.acquiredViaRight as boolean)
      : INITIAL_FORM.acquiredViaRight,
    rightAcquisitionDate: (legacy.rightAcquisitionDate as string) ?? INITIAL_FORM.rightAcquisitionDate,

    isHansiBenefitNewBuild: typeof legacy.isHansiBenefitNewBuild === "boolean"
      ? (legacy.isHansiBenefitNewBuild as boolean)
      : INITIAL_FORM.isHansiBenefitNewBuild,
    isHansiBenefitLeaseRegistered: typeof legacy.isHansiBenefitLeaseRegistered === "boolean"
      ? (legacy.isHansiBenefitLeaseRegistered as boolean)
      : INITIAL_FORM.isHansiBenefitLeaseRegistered,
    isHansiBenefitUnsoldApt: typeof legacy.isHansiBenefitUnsoldApt === "boolean"
      ? (legacy.isHansiBenefitUnsoldApt as boolean)
      : INITIAL_FORM.isHansiBenefitUnsoldApt,
    isMultiHouseholdWithUnitArea: typeof legacy.isMultiHouseholdWithUnitArea === "boolean"
      ? (legacy.isMultiHouseholdWithUnitArea as boolean)
      : INITIAL_FORM.isMultiHouseholdWithUnitArea,

    separateHouseholdReason: (legacy.separateHouseholdReason as string) ?? INITIAL_FORM.separateHouseholdReason,

    // P5UI 누락 필드
    majorShareholderDate: (legacy.majorShareholderDate as string) ?? INITIAL_FORM.majorShareholderDate,
    actualUsageDate: (legacy.actualUsageDate as string) ?? INITIAL_FORM.actualUsageDate,

    // 간주취득 — 과점주주
    deemedMajorIsListed: typeof legacy.deemedMajorIsListed === "boolean"
      ? (legacy.deemedMajorIsListed as boolean)
      : INITIAL_FORM.deemedMajorIsListed,
    deemedMajorIsFoundingShare: typeof legacy.deemedMajorIsFoundingShare === "boolean"
      ? (legacy.deemedMajorIsFoundingShare as boolean)
      : INITIAL_FORM.deemedMajorIsFoundingShare,
    deemedMajorCorporateAssetValue:
      (legacy.deemedMajorCorporateAssetValue as string) ?? INITIAL_FORM.deemedMajorCorporateAssetValue,
    deemedMajorPrevShareRatio:
      (legacy.deemedMajorPrevShareRatio as string) ?? INITIAL_FORM.deemedMajorPrevShareRatio,
    deemedMajorNewShareRatio:
      (legacy.deemedMajorNewShareRatio as string) ?? INITIAL_FORM.deemedMajorNewShareRatio,
    deemedMajorShareholderDate:
      (legacy.deemedMajorShareholderDate as string) ?? INITIAL_FORM.deemedMajorShareholderDate,

    // 간주취득 — 지목변경
    deemedLandPrevCategory:
      (legacy.deemedLandPrevCategory as string) ?? INITIAL_FORM.deemedLandPrevCategory,
    deemedLandNewCategory:
      (legacy.deemedLandNewCategory as string) ?? INITIAL_FORM.deemedLandNewCategory,
    deemedLandChangeDate:
      (legacy.deemedLandChangeDate as string) ?? INITIAL_FORM.deemedLandChangeDate,
    deemedLandRegistrationDate:
      (legacy.deemedLandRegistrationDate as string) ?? INITIAL_FORM.deemedLandRegistrationDate,
    deemedLandPrevStandardValue:
      (legacy.deemedLandPrevStandardValue as string) ?? INITIAL_FORM.deemedLandPrevStandardValue,
    deemedLandNewStandardValue:
      (legacy.deemedLandNewStandardValue as string) ?? INITIAL_FORM.deemedLandNewStandardValue,

    // 간주취득 — 건물 개수
    deemedRenovationType:
      (legacy.deemedRenovationType as "structural_change" | "use_change" | "major_repair")
      ?? INITIAL_FORM.deemedRenovationType,
    deemedRenovationDate:
      (legacy.deemedRenovationDate as string) ?? INITIAL_FORM.deemedRenovationDate,
    deemedRenovationActualUsageDate:
      (legacy.deemedRenovationActualUsageDate as string) ?? INITIAL_FORM.deemedRenovationActualUsageDate,
    deemedRenovationPrevStandardValue:
      (legacy.deemedRenovationPrevStandardValue as string) ?? INITIAL_FORM.deemedRenovationPrevStandardValue,
    deemedRenovationNewStandardValue:
      (legacy.deemedRenovationNewStandardValue as string) ?? INITIAL_FORM.deemedRenovationNewStandardValue,

    // 연부취득 — legacy에 없으면 INITIAL_FORM 기본값
    isInstallmentAcquisition: typeof legacy.isInstallmentAcquisition === "boolean"
      ? (legacy.isInstallmentAcquisition as boolean)
      : INITIAL_FORM.isInstallmentAcquisition,
    installmentContractDate:
      (legacy.installmentContractDate as string) ?? INITIAL_FORM.installmentContractDate,
    installmentTotalContractPrice:
      (legacy.installmentTotalContractPrice as string) ?? INITIAL_FORM.installmentTotalContractPrice,
    installments: Array.isArray(legacy.installments)
      ? (legacy.installments as FormState["installments"])
      : INITIAL_FORM.installments,
  };

  return form;
}
