/**
 * AssetForm 기본값 팩토리 + sessionStorage 마이그레이션
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-04).
 */

import { MIXED_USE_DEFAULTS, migrateMixedUseFields } from "./calc-wizard-asset-mixed-use";
import { RESIDENCE_DEFAULTS, migrateResidenceFields } from "./calc-wizard-asset-residence";
import { CARRYOVER_DEFAULTS, migrateCarryoverFields } from "./calc-wizard-asset-carryover";
import type { AssetForm } from "./calc-wizard-asset";

/** 장기임대주택 거주주택 비과세 특례 초기값 (소령 §155⑳) */
export const RENTAL_HOUSING_EXCEPTION_DEFAULTS: AssetForm["rentalHousingException"] = {
  applyException: false,
  scenario: 'A',
  rentalUnits: [],
  priorResidenceTransferDate: undefined,
  standardPriceAtAcquisitionForPhrp: undefined,
  standardPriceAtPriorTransfer: undefined,
  standardPriceAtTransferForPhrp: undefined,
};

/** 빈 임대주택 1호 초기값 (토글 ON 시 자동 추가) */
export function makeDefaultRentalUnit(): AssetForm["rentalHousingException"]["rentalUnits"][number] {
  return {
    registrationDate: "",
    rentalType: "long-8",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "seoul-metro",
    standardPriceAtRentalStart: "",
    rentalMonths: "",
    rentalAutoTermination: false,
    requirementsConfirmed: false,
  };
}

/**
 * AssetForm 기본값 팩토리.
 * index === 1 인 경우 isPrimaryForHouseholdFlags = true 로 설정.
 */
export function makeDefaultAsset(index: number = 1): AssetForm {
  return {
    assetId: `asset-${Date.now()}-${index}`,
    assetLabel: `자산 ${index}`,
    assetKind: "housing",
    isSuccessorRightToMoveIn: false,
    isPrimaryForHouseholdFlags: index === 1,
    standardPriceAtTransfer: "",
    standardPriceAtTransferLabel: "",
    directExpenses: "0",
    capitalExpenditure: "0",
    transferExpense: "0",
    reductions: [],
    inheritanceValuationMode: "auto",
    inheritanceDate: "",
    inheritanceAssetKind: "land",
    acquisitionArea: "",
    transferArea: "",
    areaScenario: "same",
    publishedValueAtInheritance: "",
    fixedAcquisitionPrice: "",
    addressRoad: "",
    addressJibun: "",
    addressDetail: "",
    buildingName: "",
    longitude: "",
    latitude: "",
    isRegulatedAreaAtAcq: null,
    isRegulatedAreaAtTransfer: null,
    parcelMode: false,
    parcels: [],
    isOneHousehold: false,
    ...RESIDENCE_DEFAULTS,
    actualSalePrice: "",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    acquisitionCause: "purchase",
    carryover: { ...CARRYOVER_DEFAULTS },
    acquisitionDate: "",
    assetContractDate: "", // Round 9 (2026-05-06): 매매계약일 (감면 시한 판정용)
    // 신축(자가건축) 취득일 4-시점 (영 §162①4호) — 사례 28 + G-5
    occupancyApprovalDate: "",
    approvalCertificateDate: "",
    temporaryApprovalDate: "",
    actualUseDate: "",
    // 부수토지 한도 산정 (영 §154⑦) — 사례 28
    isUrbanArea: undefined,
    appurtenantLandZone: undefined,
    // companion 토지 세율 수동 오버라이드 — 사례 28
    manualHoldingPeriodOverride: undefined,
    // 토지 자산 성격 — 부수토지 vs 독립 나대지 (사례 28 landNature 명시 입력 정책)
    landNature: undefined,
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSelfBuilt: false,
    buildingType: "",
    constructionDate: "",
    extensionFloorArea: "",
    selfOwns: "both",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "",
    landSplitMode: "apportioned",
    usePreHousingDisclosure: false,
    phdFirstDisclosureDate: "",
    phdFirstDisclosureHousingPrice: "",
    phdLandPriceYearAtAcq: "",
    phdLandPriceYearAtAcqIsManual: false,
    phdLandPricePerSqmAtAcq: "",
    phdBuildingStdPriceAtAcq: "",
    phdLandPriceYearAtFirst: "",
    phdLandPriceYearAtFirstIsManual: false,
    phdLandPricePerSqmAtFirst: "",
    phdBuildingStdPriceAtFirst: "",
    phdTransferHousingPrice: "",
    phdLandPriceYearAtTransfer: "",
    phdLandPriceYearAtTransferIsManual: false,
    phdLandPricePerSqmAtTransfer: "",
    phdBuildingStdPriceAtTransfer: "",
    phdResidentialLandArea: "",
    phdCommercialBuildingStdPriceAtAcq: "",
    phdCommercialBuildingStdPriceAtFirst: "",
    landTransferPrice: "",
    buildingTransferPrice: "",
    landAcquisitionPrice: "",
    buildingAcquisitionPrice: "",
    landDirectExpenses: "",
    buildingDirectExpenses: "",
    landStandardPriceAtTransfer: "",
    buildingStandardPriceAtTransfer: "",
    standardPriceAtAcq: "",
    standardPriceAtAcqLabel: "",
    useStandardPriceAtAcqOverride: false,
    useStandardPriceAtTransferOverride: false,
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    inhHouseValEnabled: false,
    inhHouseValFirstDisclosureDate: "2005-04-30",
    inhHouseValLandArea: "",
    inhHouseValLandPricePerSqmAtTransfer: "",
    inhHouseValLandPricePerSqmAtFirst: "",
    inhHouseValLandPricePerSqmAtInheritance: "",
    inhHouseValHousePriceAtTransfer: "",
    inhHouseValHousePriceAtFirst: "",
    inhHouseValBuildingStdPriceAtTransfer: "",
    inhHouseValBuildingStdPriceAtFirst: "",
    inhHouseValBuildingStdPriceAtInheritance: "",
    inhHouseValUseHousePriceOverride: false,
    inhHouseValHousePriceAtInheritanceOverride: "",
    pre1990Enabled: false,
    pre1990PricePerSqm_1990: "",
    pre1990PricePerSqm_atTransfer: "",
    pre1990Grade_current: "",
    pre1990Grade_prev: "",
    pre1990Grade_atAcq: "",
    pre1990GradeMode: "number",
    replottingConfirmDate: "",
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    isNonBusinessLand: false,
    nblUseDetailedJudgment: false,
    nblLandType: "",
    nblZoneType: "",
    nblBusinessUsePeriods: [],
    nblLandSigunguCode: "",
    nblLandSigunguName: "",
    nblResidenceHistories: [],
    nblExemptInheritBefore2007: false,
    nblExemptInheritDate: "",
    nblExemptLongOwned20y: false,
    nblExemptAncestor8YearFarming: false,
    nblExemptPublicExpropriation: false,
    nblExemptPublicNoticeDate: "",
    nblExemptFactoryAdjacent: false,
    nblExemptJongjoongOwned: false,
    nblExemptJongjoongAcqDate: "",
    nblExemptUrbanFarmlandJongjoong: false,
    nblUrbanIncorporationDate: "",
    nblIsMetropolitanArea: "",
    nblOwnershipRatio: "",
    nblFarmingSelf: false,
    nblFarmerResidenceDistance: "",
    nblFarmlandIsWeekendFarm: false,
    nblFarmlandIsConversionApproved: false,
    nblFarmlandConversionDate: "",
    nblFarmlandIsMarginalFarm: false,
    nblFarmlandIsReclaimedLand: false,
    nblFarmlandIsPublicProjectUse: false,
    nblFarmlandIsSickElderlyRental: false,
    nblForestHasPlan: false,
    nblForestIsPublicInterest: false,
    nblForestIsProtected: false,
    nblForestIsSuccessor: false,
    nblForestInheritedWithin3Years: false,
    nblForestInheritanceDate: "",
    nblPastureIsLivestockOperator: false,
    nblPastureLivestockType: "",
    nblPastureLivestockCount: "",
    nblPastureLivestockPeriods: [],
    nblPastureInheritanceDate: "",
    nblPastureIsSpecialOrgUse: false,
    nblHousingFootprint: "",
    nblVillaUsePeriods: [],
    nblVillaIsEupMyeon: false,
    nblVillaIsRuralHousing: false,
    nblVillaIsAfter20150101: false,
    nblOtherPropertyTaxType: "",
    nblOtherBuildingValue: "",
    nblOtherLandValue: "",
    nblOtherIsRelatedToResidence: false,
    nblGracePeriods: [],
    inheritanceMode: null,
    inheritanceStartDate: "",
    hasDecedentActualPrice: false,
    decedentAcquisitionPrice: "",
    inheritanceReportedValue: "",
    inheritanceValuationMethod: "",
    inheritanceValuationEvidence: "",
    useSupplementaryHelper: false,
    supplementaryLandArea: "",
    supplementaryLandUnitPrice: "",
    supplementaryBuildingValue: "",
    ...MIXED_USE_DEFAULTS,
    rentalHousingException: { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS },
    // ── 상업용건물·오피스텔 환산취득가 cb* 필드 (사례 29, 소득세법 시행령 §164⑧) ──
    cbEra: "",
    cbExclusiveArea: "",
    cbSharedArea: "",
    cbLandArea: "",
    cbUnitPriceAtTransfer: "",
    cbUnitPriceAtFirstOrAcq: "",
    cbBuildingStdPriceAtAcq: "",
    cbBuildingStdPriceAtFirst: "",
    cbBuildingStdPriceAtTransfer: "",
    cbLandPricePerSqmAtAcq: "",
    cbLandPricePerSqmAtFirst: "",
    cbLandPricePerSqmAtTransfer: "",
    // ── 일반건물(토지+건물 일괄) 환산취득가 gb* 필드 (사례 31, 소득세법 시행령 §176의2②, §163⑥) ──
    // 환산 ON/OFF는 useEstimatedAcquisition 라디오로 통일 (2026-05-09)
    gbTransferLandPricePerSqm: "",
    gbTransferBuildingValue: "",
    gbAcqLandPricePerSqm: "",
    gbAcqBuildingValue: "",
    gbLandArea: "",
    gbBuildingArea: "",
    gbBuildingFootprintArea: "",
    // ── 일반건물 비사업용토지 판정 (§104의3·§168의12, 2026-05-10) ──
    gbZoneType: "",
    gbIsMetropolitan: false,
    gbIsUnregistered: false,
    // ── 일반건물 건물 취득원인 + 건물 취득일 (사례 32 이후 PR) ──
    gbBuildingAcquisitionCause: undefined,
    gbBuildingAcquisitionDate: "",
    gbBundledAcquisitionExpenses: "",
    // ── 사례 33: 증축 건물 환산취득가 (소득세법 시행령 §176의2②, §166⑥) ──
    gbHasExtension: false,
    gbExtensionDate: "",
    gbExtensionArea: "",
    gbTransferExtensionBuildingStdPrice: "",
    gbAcquisitionExtensionBuildingStdPrice: "",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",   // 사례 33 호환 default
    gbExtensionActualAcquisitionPrice: "",
    gbExtensionActualExpenses: "",
    // ── 사례 35: 주택→상가 용도변경 ──
    gbHouseToCommercialConversion: false,
    gbConversionDate: "",
    gbWasMultiHouseAtConversion: null,
    // ── 사례 35 후속-1: §99-164-10 환산주택가격 ──
    gbHasFirstDisclosure: false,
    gbFirstDisclosurePrice: "",
    gbFirstDisclosureLandStdPrice: "",
    gbFirstDisclosureBuildingStdPrice: "",
    // ── 부담부증여 (소령 §159, Phase 2: 모든 propertyType 지원) ──
    transferType: "regular",
    bgValuationMode: "",
    bgLendingDepositTotal: "",
    bgMortgageDebtAmount: "",
    bgAnnualRentTotal: "",
    bgMortgageSetAmount: "",
    bgMarketValueAtTransfer: "",
    bgMarketValueAtAcquisition: "",
    bgGiftBuildingStdPriceAtTransfer: "",
    // Phase 3: 증여세 통합 입력
    bgDonorRelation: "",
    bgIsMinorDonee: false,
    bgIsGenerationSkip: false,
    bgIsFiledOnTime: true,
    bgPriorGifts: [],
    // ── 재개발/재건축 (시행령 §166) — 사례 44 ──
    redevSubject: "",
    redevApprovalLawBasis: "",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "",
    redevApprovalDate: "",
    redevSettlementSaleDate: "",
    redevRightsValue: "",
    redevSettlementAmount: "",
    redevPreApprovalExpenses: "",
    redevPostApprovalExpenses: "",
    redevAcquisitionStdPrice: "",
    redevManagementDisposalStdPrice: "",
    redevFirstDisclosureDate: "",
    redevFirstDisclosureHousingPrice: "",
    redevFirstDisclosureStdPrice: "",
    // PHD 패턴 신규 필드
    redevLandArea: "",
    redevLandPricePerSqmAtAcq: "",
    redevBuildingStdPriceAtAcq: "",
    redevLandPricePerSqmAtFirst: "",
    redevBuildingStdPriceAtFirst: "",
    redevManagementDisposalHousingPrice: "",
    redevAcquisitionHousingPrice: "",
    redevActualAcquisitionPrice: "",
    // 사례 45 — 거주월수 분리 입력
    redevPriorHouseResidenceMonths: "",
    redevNewHouseResidenceMonths: "",
    // 거주기간 자동산정 입력 (입주일/퇴거일)
    redevPriorResidenceStartDate: "",
    redevPriorResidenceEndDate: "",
    redevNewResidenceStartDate: "",
    redevNewResidenceEndDate: "",
    // 사례 46 — 청산금 수령분 단독 신고
    redevReceiveOnlyMode: "",
    redevExemptionEligibleAtApproval: "",
    // 사례 36 — 1세대1입주권 비과세 C-1 안전장치
    redevPriorHouseHoldingMonths: "",
    // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
    redevLandStdPriceAtAcq: "",      // @deprecated — legacy 총액 직접 입력 (sessionStorage 호환용)
    redevLandStdPriceAtApproval: "", // @deprecated — legacy 총액 직접 입력 (sessionStorage 호환용)
    redevLandPricePerSqmAtApproval: "", // §166③ 분모 ㎡당 단가 (LandPriceLookupField 신규 입력 경로)
    // 사례 38/39 — 단독주택 출자 §164⑤ PHD 2-point 환산취득가
    redevHousingStdPriceAtAcq: "",    // §164⑤ 분자 — 취득당시 개별주택가격
    redevHousingStdPriceAtApproval: "", // §164⑤ 분모 — 인가당시 부근 개별주택가격
    // 사례 48 — 승계조합원 신축APT 양도
    redevIsSuccessorMember: "",
    redevCompletionDate: "",
    // 가업상속공제 §97의2④ — UI 시니어 후속 위임. 미사용 시 undefined.
    familyBusinessInheritance: undefined,
  };
}

/** 하위 호환 별칭 */
export const makeDefaultCompanionAsset = makeDefaultAsset;

/**
 * 구형 AssetForm (landAreaM2, pre1990AreaSqm 있음) → 현재 타입으로 마이그레이션.
 * sessionStorage 또는 이력 데이터 rehydrate 시 호출.
 */
export function migrateAsset(raw: unknown): AssetForm {
  const a = raw as Record<string, unknown>;
  if (a.landAreaM2 && !a.acquisitionArea) {
    a.acquisitionArea = a.landAreaM2;
    a.transferArea = a.landAreaM2;
  }
  delete a.landAreaM2;
  delete a.pre1990AreaSqm;
  if (!a.areaScenario) {
    a.areaScenario =
      a.acquisitionArea && a.transferArea && a.acquisitionArea !== a.transferArea
        ? "partial"
        : "same";
  }
  if (!a.standardPricePerSqmAtAcq) a.standardPricePerSqmAtAcq = "";
  if (!a.standardPricePerSqmAtTransfer) a.standardPricePerSqmAtTransfer = "";
  // Round 9 (2026-05-06): 자산-수준 매매계약일 (감면 시한 판정)
  if (a.assetContractDate === undefined) a.assetContractDate = "";
  // Phase 2 (2026-06-11): 장기임대 §97 시리즈 — 3-state 필드 누락 보정 (구 세션 복원 방어)
  if (Array.isArray(a.reductions)) {
    a.reductions = (a.reductions as Record<string, unknown>[]).map((r) => {
      if (r && typeof r.type === "string" && (r.type as string).startsWith("rental_97") && r.type !== "rental_97_3_legacy") {
        return {
          registrationDate: "",
          rentalStartDate: "",
          isTaxRegistered: false,
          rentIncreaseViolationMode: "",
          hasVacancyOver6Months: null,
          ...r,
        };
      }
      // §99의4 (2026-06-11): 구 stub 데이터(_phase1Stub) 본 필드 누락 보정 (③)
      if (r && (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown")) {
        return {
          ruralHouseAcquisitionDate: "",
          ruralHouseStdPrice: "",
          isRegisteredHanok: false,
          isAdjacentArea: false,
          meetsLocationRequirement: false,
          ...(r.type === "new_99_4_hometown" ? { meetsHometownRequirement: false } : {}),
          ...r,
        };
      }
      // P1 §99 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "new_99") {
        return {
          contractDate99: "",
          usageApprovalDate99: "",
          acquisitionType99: "from_builder",
          isNationalHousing99: false,
          standardPriceAtAcquisition99: "",
          standardPriceAt5Years99: "",
          standardPriceAtTransfer99: "",
          exclusiveAreaSqm99: "",
          hasOccupancyAtContract99: false,
          isRecontractExcluded99: false,
          isRedevelopedNewHouse99: false,
          previousHouseStdPrice99: "",
          ...r,
        };
      }
      // P1 §98의8 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_8") {
        return {
          contractDate988: "",
          acquisitionPrice988: "",
          exclusiveAreaSqm988: "",
          rentalStartDate988: "",
          rentalEndDate988: "",
          inheritedRentalMonths988: "",
          isUnsoldAfterCompletion988: false,
          isFirstContract988: false,
          isNotRecontract988: false,
          standardPriceAtAcquisition988: "",
          standardPriceAt5Years988: "",
          standardPriceAtTransfer988: "",
          ...r,
        };
      }
      // P3 §98의3·§98의5·§98의6 (2026-06-12): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_3") {
        return {
          residencyType983: "resident",
          houseType983: "purchased",
          contractDate983: "",
          constructionStartDate983: "",
          usageApprovalDate983: "",
          isOutsideSeoulNotDesignated983: false,
          isOverconcentration983: false,
          landAreaSqm983: "",
          floorAreaSqm983: "",
          isUnsoldConfirmed983: false,
          isFirstContract983: false,
          isNotOccupiedAtContract983: false,
          isNotRecontract983: false,
          isNotExcludedSelfBuilt983: false,
          standardPriceAtAcquisition983: "",
          standardPriceAt5Years983: "",
          standardPriceAtTransfer983: "",
          ...r,
        };
      }
      if (r && r.type === "unsold_98_5") {
        return {
          contractDate985: "",
          priceReductionRatePct985: "",
          isNonCapitalUnsoldAtCutoff985: false,
          isFirstContract985: false,
          isNotOccupiedAtContract985: false,
          isNotRecontract985: false,
          standardPriceAtAcquisition985: "",
          standardPriceAt5Years985: "",
          standardPriceAtTransfer985: "",
          ...r,
        };
      }
      if (r && r.type === "unsold_98_6") {
        return {
          hoType986: "seller_rented",
          contractDate986: "",
          stdPriceSumAtBase986: "",
          floorAreaSqm986: "",
          isUnsoldAfterCompletion986: false,
          isFirstContract986: false,
          isNotOccupiedAfterCompletion986: false,
          isNotRecontract986: false,
          sellerRented2Years986: false,
          rentalContractDate986: "",
          rentalStartDate986: "",
          rentalEndDate986: "",
          inheritedRentalMonths986: "",
          standardPriceAtAcquisition986: "",
          standardPriceAt5Years986: "",
          standardPriceAtTransfer986: "",
          ...r,
        };
      }
      // P2 §98의7 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_7") {
        return {
          contractDate987: "",
          acquisitionPrice987: "",
          isUnsoldAtCutoff987: false,
          isFirstContract987: false,
          isNotOccupiedAtContract987: false,
          isNotRecontract987: false,
          standardPriceAtAcquisition987: "",
          standardPriceAt5Years987: "",
          standardPriceAtTransfer987: "",
          ...r,
        };
      }
      // P2 §99의2 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_99_2") {
        return {
          houseType992: "new_or_unsold",
          contractDate992: "",
          usageApprovalDate992: "",
          acquisitionPrice992: "",
          exclusiveAreaSqm992: "",
          meetsHouseTypeRequirement992: false,
          isNotExcludedSelfBuilt992: false,
          meetsOneHouseSellerRequirement992: false,
          isOfficetel992: false,
          meetsOfficetelRequirement992: false,
          isNotRecontract992: false,
          hasConfirmationSeal992: false,
          standardPriceAtAcquisition992: "",
          standardPriceAt5Years992: "",
          standardPriceAtTransfer992: "",
          ...r,
        };
      }
      // §98의9 (2026-06-11): 구 stub 데이터 본 필드 누락 보정 (③)
      if (r && r.type === "unsold_98_9") {
        return {
          unsoldHouseAcquisitionDate: "",
          unsoldHouseAcquisitionPrice: "",
          unsoldHouseExclusiveArea: "",
          isNonCapitalRegion: false,
          wasOneHouseholdAtAcquisition: false,
          meetsSellerAndContractRequirement: false,
          ...r,
        };
      }
      return r;
    });
  }
  if (!a.selfOwns) a.selfOwns = "both";
  if (a.hasSeperateLandAcquisitionDate === undefined) a.hasSeperateLandAcquisitionDate = false;
  if (!a.landAcquisitionDate) a.landAcquisitionDate = "";
  if (!a.landSplitMode) a.landSplitMode = "apportioned";
  if (!a.landTransferPrice) a.landTransferPrice = "";
  if (!a.buildingTransferPrice) a.buildingTransferPrice = "";
  if (!a.landAcquisitionPrice) a.landAcquisitionPrice = "";
  if (!a.buildingAcquisitionPrice) a.buildingAcquisitionPrice = "";
  if (!a.landDirectExpenses) a.landDirectExpenses = "";
  if (!a.buildingDirectExpenses) a.buildingDirectExpenses = "";
  if (a.capitalExpenditure === undefined) a.capitalExpenditure = "0";
  if (a.transferExpense === undefined) a.transferExpense = "0";
  // 공유 지분율 — 단독 소유 100/100 fallback (지분 단계취득 자산은 명시 입력)
  if (!a.ownershipNumerator || a.ownershipNumerator === "") a.ownershipNumerator = "100";
  if (!a.ownershipDenominator || a.ownershipDenominator === "") a.ownershipDenominator = "100";
  if (!a.landStandardPriceAtTransfer) a.landStandardPriceAtTransfer = "";
  if (!a.buildingStandardPriceAtTransfer) a.buildingStandardPriceAtTransfer = "";
  if (a.usePreHousingDisclosure === undefined) a.usePreHousingDisclosure = false;
  if (!a.phdFirstDisclosureDate) a.phdFirstDisclosureDate = "";
  if (!a.phdFirstDisclosureHousingPrice) a.phdFirstDisclosureHousingPrice = "";
  if (!a.phdLandPriceYearAtAcq) a.phdLandPriceYearAtAcq = "";
  if (a.phdLandPriceYearAtAcqIsManual === undefined) a.phdLandPriceYearAtAcqIsManual = false;
  if (!a.phdLandPricePerSqmAtAcq) a.phdLandPricePerSqmAtAcq = "";
  if (!a.phdBuildingStdPriceAtAcq) a.phdBuildingStdPriceAtAcq = "";
  if (!a.phdLandPriceYearAtFirst) a.phdLandPriceYearAtFirst = "";
  if (a.phdLandPriceYearAtFirstIsManual === undefined) a.phdLandPriceYearAtFirstIsManual = false;
  if (!a.phdLandPricePerSqmAtFirst) a.phdLandPricePerSqmAtFirst = "";
  if (!a.phdBuildingStdPriceAtFirst) a.phdBuildingStdPriceAtFirst = "";
  if (!a.phdTransferHousingPrice) a.phdTransferHousingPrice = "";
  if (!a.phdLandPriceYearAtTransfer) a.phdLandPriceYearAtTransfer = "";
  if (a.phdLandPriceYearAtTransferIsManual === undefined) a.phdLandPriceYearAtTransferIsManual = false;
  if (!a.phdLandPricePerSqmAtTransfer) a.phdLandPricePerSqmAtTransfer = "";
  if (!a.phdBuildingStdPriceAtTransfer) a.phdBuildingStdPriceAtTransfer = "";
  if (!a.phdCommercialBuildingStdPriceAtAcq) a.phdCommercialBuildingStdPriceAtAcq = "";
  if (!a.phdCommercialBuildingStdPriceAtFirst) a.phdCommercialBuildingStdPriceAtFirst = "";
  if (!a.phdResidentialLandArea) a.phdResidentialLandArea = "";
  if (a.inheritanceMode === undefined) a.inheritanceMode = null;
  if (!a.inheritanceStartDate) a.inheritanceStartDate = "";
  if (a.hasDecedentActualPrice === undefined) a.hasDecedentActualPrice = false;
  if (!a.decedentAcquisitionPrice) a.decedentAcquisitionPrice = "";
  if (!a.inheritanceReportedValue) a.inheritanceReportedValue = "";
  if (!a.inheritanceValuationMethod) a.inheritanceValuationMethod = "";
  if (!a.inheritanceValuationEvidence) a.inheritanceValuationEvidence = "";
  if (a.useSupplementaryHelper === undefined) a.useSupplementaryHelper = false;
  if (!a.supplementaryLandArea) a.supplementaryLandArea = "";
  if (!a.supplementaryLandUnitPrice) a.supplementaryLandUnitPrice = "";
  if (!a.supplementaryBuildingValue) a.supplementaryBuildingValue = "";
  if (a.inhHouseValEnabled === undefined) a.inhHouseValEnabled = false;
  if (!a.inhHouseValFirstDisclosureDate) a.inhHouseValFirstDisclosureDate = "2005-04-30";
  if (!a.inhHouseValLandArea) a.inhHouseValLandArea = "";
  if (!a.inhHouseValLandPricePerSqmAtTransfer) a.inhHouseValLandPricePerSqmAtTransfer = "";
  if (!a.inhHouseValLandPricePerSqmAtFirst) a.inhHouseValLandPricePerSqmAtFirst = "";
  if (!a.inhHouseValLandPricePerSqmAtInheritance) a.inhHouseValLandPricePerSqmAtInheritance = "";
  if (!a.inhHouseValHousePriceAtTransfer) a.inhHouseValHousePriceAtTransfer = "";
  if (!a.inhHouseValHousePriceAtFirst) a.inhHouseValHousePriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtTransfer) a.inhHouseValBuildingStdPriceAtTransfer = "";
  if (!a.inhHouseValBuildingStdPriceAtFirst) a.inhHouseValBuildingStdPriceAtFirst = "";
  if (!a.inhHouseValBuildingStdPriceAtInheritance) a.inhHouseValBuildingStdPriceAtInheritance = "";
  if (a.inhHouseValUseHousePriceOverride === undefined) a.inhHouseValUseHousePriceOverride = false;
  if (!a.inhHouseValHousePriceAtInheritanceOverride) a.inhHouseValHousePriceAtInheritanceOverride = "";
  if (a.useStandardPriceAtAcqOverride === undefined) a.useStandardPriceAtAcqOverride = false;
  if (a.useStandardPriceAtTransferOverride === undefined) a.useStandardPriceAtTransferOverride = false;
  // 이월과세(증여) carryover 서브객체 마이그레이션
  migrateCarryoverFields(a);
  // 겸용주택 분리계산 + 보유 중 일부 용도변경 필드 (별도 모듈)
  migrateMixedUseFields(a);
  // 거주 정보 (자산-수준)
  migrateResidenceFields(a);
  // ③ 신축(자가건축) 취득일 4-시점 + 부수토지 필드 마이그레이션 (사례 28, 2026-05-07; G-5 4번째 시점)
  if (a.occupancyApprovalDate === undefined) a.occupancyApprovalDate = "";
  if (a.approvalCertificateDate === undefined) a.approvalCertificateDate = ""; // G-5: 사용검사필증 교부일
  if (a.temporaryApprovalDate === undefined) a.temporaryApprovalDate = "";
  if (a.actualUseDate === undefined) a.actualUseDate = "";
  if (a.isUrbanArea === undefined) a.isUrbanArea = undefined; // undefined 보존 (자동 분기 비활성 상태)
  if (a.appurtenantLandZone === undefined) a.appurtenantLandZone = undefined;
  if (a.manualHoldingPeriodOverride === undefined || a.manualHoldingPeriodOverride === "") {
    a.manualHoldingPeriodOverride = undefined; // 빈 문자열 → undefined 변환
  }
  // ③ landNature 마이그레이션 — 신규 필드 (사례 28 landNature 명시 입력 정책)
  if (a.landNature === undefined || !(["appurtenant", "standalone"].includes(a.landNature as string))) {
    a.landNature = undefined;
  }
  // acquisitionCause "newConstruction" 추가 — 알 수 없는 값이면 "purchase" fallback
  const validCauses = ["purchase", "inheritance", "gift", "carryover_gift", "newConstruction"];
  if (!a.acquisitionCause || !validCauses.includes(a.acquisitionCause as string)) {
    a.acquisitionCause = "purchase";
  }
  // assetKind "commercial_building"/"general_building"/"redevelopment_apt" 추가 — 알 수 없는 값이면 "building" fallback (③ normalize)
  const validKinds = ["housing", "land", "building", "right_to_move_in", "presale_right", "commercial_building", "general_building", "redevelopment_apt"];
  if (!a.assetKind || !validKinds.includes(a.assetKind as string)) {
    a.assetKind = "building";
  }
  // ③ 재개발/재건축 redev* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  if (a.redevSubject === undefined) a.redevSubject = "";
  if (a.redevApprovalLawBasis === undefined) a.redevApprovalLawBasis = "";
  if (a.redevOriginalAssetType === undefined || a.redevOriginalAssetType === "") a.redevOriginalAssetType = "housing";
  if (a.redevSettlementDirection === undefined) a.redevSettlementDirection = "";
  if (a.redevApprovalDate === undefined) a.redevApprovalDate = "";
  if (a.redevSettlementSaleDate === undefined) a.redevSettlementSaleDate = "";
  if (a.redevRightsValue === undefined) a.redevRightsValue = "";
  if (a.redevSettlementAmount === undefined) a.redevSettlementAmount = "";
  if (a.redevPreApprovalExpenses === undefined) a.redevPreApprovalExpenses = "";
  if (a.redevPostApprovalExpenses === undefined) a.redevPostApprovalExpenses = "";
  if (a.redevAcquisitionStdPrice === undefined) a.redevAcquisitionStdPrice = "";
  if (a.redevManagementDisposalStdPrice === undefined) a.redevManagementDisposalStdPrice = "";
  if (a.redevFirstDisclosureDate === undefined) a.redevFirstDisclosureDate = "";
  if (a.redevFirstDisclosureHousingPrice === undefined) a.redevFirstDisclosureHousingPrice = "";
  if (a.redevFirstDisclosureStdPrice === undefined) a.redevFirstDisclosureStdPrice = "";
  if (a.redevLandArea === undefined) a.redevLandArea = "";
  if (a.redevLandPricePerSqmAtAcq === undefined) a.redevLandPricePerSqmAtAcq = "";
  if (a.redevBuildingStdPriceAtAcq === undefined) a.redevBuildingStdPriceAtAcq = "";
  if (a.redevLandPricePerSqmAtFirst === undefined) a.redevLandPricePerSqmAtFirst = "";
  if (a.redevBuildingStdPriceAtFirst === undefined) a.redevBuildingStdPriceAtFirst = "";
  if (a.redevManagementDisposalHousingPrice === undefined) a.redevManagementDisposalHousingPrice = "";
  if (a.redevAcquisitionHousingPrice === undefined) a.redevAcquisitionHousingPrice = "";
  if (a.redevActualAcquisitionPrice === undefined) a.redevActualAcquisitionPrice = "";
  // 사례 45 — 거주월수 분리 (§155⑰ + 해석례 2020-386)
  if (a.redevPriorHouseResidenceMonths === undefined) a.redevPriorHouseResidenceMonths = "";
  if (a.redevNewHouseResidenceMonths === undefined) a.redevNewHouseResidenceMonths = "";
  if (a.redevPriorResidenceStartDate === undefined) a.redevPriorResidenceStartDate = "";
  if (a.redevPriorResidenceEndDate === undefined) a.redevPriorResidenceEndDate = "";
  if (a.redevNewResidenceStartDate === undefined) a.redevNewResidenceStartDate = "";
  if (a.redevNewResidenceEndDate === undefined) a.redevNewResidenceEndDate = "";
  // 사례 46 — 청산금 수령분 단독 신고
  if (a.redevReceiveOnlyMode === undefined) a.redevReceiveOnlyMode = "";
  if (a.redevExemptionEligibleAtApproval === undefined) a.redevExemptionEligibleAtApproval = "";
  // 사례 36 — 1세대1입주권 비과세 C-1 안전장치
  if (a.redevPriorHouseHoldingMonths === undefined) a.redevPriorHouseHoldingMonths = "";
  // 사례 37 — 토지 출자 §166③ 환산 (subject="right" + originalAssetType="land")
  if (a.redevLandStdPriceAtAcq === undefined) a.redevLandStdPriceAtAcq = "";         // @deprecated legacy
  if (a.redevLandStdPriceAtApproval === undefined) a.redevLandStdPriceAtApproval = ""; // @deprecated legacy
  // 신규 LandPriceLookupField 입력 경로 — §166③ 분모 ㎡당 단가
  if (a.redevLandPricePerSqmAtApproval === undefined) a.redevLandPricePerSqmAtApproval = "";
  // 사례 38/39 — 단독주택 출자 §164⑤ PHD 2-point 환산취득가
  if (a.redevHousingStdPriceAtAcq === undefined) a.redevHousingStdPriceAtAcq = "";
  if (a.redevHousingStdPriceAtApproval === undefined) a.redevHousingStdPriceAtApproval = "";
  // 사례 48 — 승계조합원 신축APT 양도
  if (a.redevIsSuccessorMember === undefined) a.redevIsSuccessorMember = "";
  if (a.redevCompletionDate === undefined) a.redevCompletionDate = "";
  // ③ 상업용건물·오피스텔 cb* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  if (a.cbEra === undefined) a.cbEra = "";
  if (a.cbExclusiveArea === undefined) a.cbExclusiveArea = "";
  if (a.cbSharedArea === undefined) a.cbSharedArea = "";
  if (a.cbLandArea === undefined) a.cbLandArea = "";
  if (a.cbUnitPriceAtTransfer === undefined) a.cbUnitPriceAtTransfer = "";
  if (a.cbUnitPriceAtFirstOrAcq === undefined) a.cbUnitPriceAtFirstOrAcq = "";
  if (a.cbBuildingStdPriceAtAcq === undefined) a.cbBuildingStdPriceAtAcq = "";
  if (a.cbBuildingStdPriceAtFirst === undefined) a.cbBuildingStdPriceAtFirst = "";
  if (a.cbBuildingStdPriceAtTransfer === undefined) a.cbBuildingStdPriceAtTransfer = "";
  if (a.cbLandPricePerSqmAtAcq === undefined) a.cbLandPricePerSqmAtAcq = "";
  if (a.cbLandPricePerSqmAtFirst === undefined) a.cbLandPricePerSqmAtFirst = "";
  if (a.cbLandPricePerSqmAtTransfer === undefined) a.cbLandPricePerSqmAtTransfer = "";
  // ③ 일반건물 gb* 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호, 사례 31)
  // legacy: gbUseEstimatedAcquisition === true → useEstimatedAcquisition 흡수 후 키 제거 (2026-05-09)
  const legacyGbFlag = (a as Record<string, unknown>).gbUseEstimatedAcquisition;
  if (legacyGbFlag === true && a.assetKind === "general_building") {
    a.useEstimatedAcquisition = true;
  }
  delete (a as Record<string, unknown>).gbUseEstimatedAcquisition;
  if (a.gbTransferLandPricePerSqm === undefined) a.gbTransferLandPricePerSqm = "";
  if (a.gbTransferBuildingValue === undefined) a.gbTransferBuildingValue = "";
  if (a.gbAcqLandPricePerSqm === undefined) a.gbAcqLandPricePerSqm = "";
  if (a.gbAcqBuildingValue === undefined) a.gbAcqBuildingValue = "";
  if (a.gbLandArea === undefined) a.gbLandArea = "";
  if (a.gbBuildingArea === undefined) a.gbBuildingArea = "";
  // legacy: gbBuildingFloors → gbBuildingFootprintArea 흡수 (균등층 가정 변환, 2026-05-09)
  const legacyFloorsRaw = (a as Record<string, unknown>).gbBuildingFloors;
  const legacyFloors = typeof legacyFloorsRaw === "string" ? parseInt(legacyFloorsRaw, 10) : 0;
  const legacyArea = typeof a.gbBuildingArea === "string" ? parseFloat(a.gbBuildingArea) : 0;
  if (a.gbBuildingFootprintArea === undefined || a.gbBuildingFootprintArea === "") {
    if (legacyFloors > 0 && legacyArea > 0) {
      a.gbBuildingFootprintArea = String(parseFloat((legacyArea / legacyFloors).toFixed(2)));
    } else {
      a.gbBuildingFootprintArea = "";
    }
  }
  delete (a as Record<string, unknown>).gbBuildingFloors;
  // 일반건물 NBL 판정 필드 (2026-05-10)
  if (a.gbZoneType === undefined) a.gbZoneType = "";
  if (a.gbIsMetropolitan === undefined) a.gbIsMetropolitan = false;
  if (a.gbIsUnregistered === undefined) a.gbIsUnregistered = false;
  // ── 일반건물 건물 취득원인 마이그레이션 (M-1·M-2, 사례 32 이후 PR) ──
  // M-1: legacy gbIsSelfBuilt=true → gbBuildingAcquisitionCause="newConstruction" 자동 변환 후 삭제
  if ((a as Record<string, unknown>).gbIsSelfBuilt === true) {
    if (a.gbBuildingAcquisitionCause === undefined) {
      a.gbBuildingAcquisitionCause = "newConstruction";
    }
  }
  delete (a as Record<string, unknown>).gbIsSelfBuilt;
  // M-2: general_building + gbBuildingAcquisitionCause 미입력 시 acquisitionCause 값 복사
  // (사례 31 호환 데이터: 단일 취득원인이었던 경우 건물도 같은 원인으로 추정)
  const validBuildingCauses = ["purchase", "inheritance", "gift", "newConstruction"];
  if (
    a.assetKind === "general_building" &&
    (!a.gbBuildingAcquisitionCause ||
      !validBuildingCauses.includes(a.gbBuildingAcquisitionCause as string))
  ) {
    // acquisitionCause 중 건물 카드에 허용된 원인이면 그대로 사용
    const ac = a.acquisitionCause as string;
    // "carryover_gift"는 건물 카드 미지원 → "purchase" fallback
    if (validBuildingCauses.includes(ac)) {
      a.gbBuildingAcquisitionCause = ac;
    } else {
      a.gbBuildingAcquisitionCause = "purchase";
    }
  }
  if (a.gbBuildingAcquisitionDate === undefined) a.gbBuildingAcquisitionDate = "";
  // ③ 사례 33 일괄 모드: 토지·건물 일괄 취득 시 필요경비 (신규 필드 — bundledExpenses 분리, 2026-05-11)
  if (a.gbBundledAcquisitionExpenses === undefined) a.gbBundledAcquisitionExpenses = "";
  // ③ 사례 33: 증축 필드 마이그레이션 (sessionStorage 호환 — 신규 필드 누락 보호)
  // normalize 책임: 저장→로드 시 누락 필드 초기화.
  // onChange 책임(별도): 토글 OFF 시 폼 상태 유지 (재토글 ON 복원). normalize 아님.
  if (a.gbHasExtension === undefined) a.gbHasExtension = false;
  if (a.gbExtensionDate === undefined) a.gbExtensionDate = "";
  if (a.gbExtensionArea === undefined) a.gbExtensionArea = "";
  if (a.gbTransferExtensionBuildingStdPrice === undefined) a.gbTransferExtensionBuildingStdPrice = "";
  if (a.gbAcquisitionExtensionBuildingStdPrice === undefined) a.gbAcquisitionExtensionBuildingStdPrice = "";
  if (a.gbExtensionAcquisitionCause === undefined) a.gbExtensionAcquisitionCause = "newConstruction";
  // ③ 사례 33 확장: gbExtensionAcquisitionMode + 실가 2필드 마이그레이션
  if (a.gbExtensionAcquisitionMode === undefined) a.gbExtensionAcquisitionMode = "estimated";
  if (a.gbExtensionActualAcquisitionPrice === undefined) a.gbExtensionActualAcquisitionPrice = "";
  if (a.gbExtensionActualExpenses === undefined) a.gbExtensionActualExpenses = "";
  // ── 사례 35: 주택→상가 용도변경 normalize (강제 초기화 금지 — null=미선택 보존) ──
  if (a.gbHouseToCommercialConversion === undefined) a.gbHouseToCommercialConversion = false;
  if (a.gbConversionDate === undefined) a.gbConversionDate = "";
  if (a.gbWasMultiHouseAtConversion === undefined) a.gbWasMultiHouseAtConversion = null;
  // 사례 35 후속-1
  if (a.gbHasFirstDisclosure === undefined) a.gbHasFirstDisclosure = false;
  if (a.gbFirstDisclosurePrice === undefined) a.gbFirstDisclosurePrice = "";
  if (a.gbFirstDisclosureLandStdPrice === undefined) a.gbFirstDisclosureLandStdPrice = "";
  if (a.gbFirstDisclosureBuildingStdPrice === undefined) a.gbFirstDisclosureBuildingStdPrice = "";
  // gbHasExtension=false 인 legacy 데이터에 나머지 필드가 잘못 저장된 경우 정리
  // (신규 데이터에서는 발생하지 않으나 구형 마이그레이션 방어)
  if (a.gbHasExtension === false) {
    a.gbExtensionDate = "";
    a.gbExtensionArea = "";
    a.gbTransferExtensionBuildingStdPrice = "";
    a.gbAcquisitionExtensionBuildingStdPrice = "";
    a.gbExtensionAcquisitionCause = "newConstruction";
    a.gbExtensionAcquisitionMode = "estimated";
    a.gbExtensionActualAcquisitionPrice = "";
    a.gbExtensionActualExpenses = "";
  }
  // gbExtensionAcquisitionMode === "estimated" 시 실가 2필드 reset (정합성)
  if (a.gbExtensionAcquisitionMode === "estimated") {
    a.gbExtensionActualAcquisitionPrice = "";
    a.gbExtensionActualExpenses = "";
  }

  // ③ 장기임대주택 거주주택 비과세 특례 마이그레이션 (sessionStorage 호환)
  if (!a.rentalHousingException || typeof a.rentalHousingException !== "object") {
    a.rentalHousingException = { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS };
  } else {
    const rhe = a.rentalHousingException as Record<string, unknown>;
    if (rhe.applyException === undefined) rhe.applyException = false;
    if (!rhe.scenario) rhe.scenario = 'A';
    if (!Array.isArray(rhe.rentalUnits)) rhe.rentalUnits = [];
    if (rhe.priorResidenceTransferDate === undefined) rhe.priorResidenceTransferDate = undefined;
    if (rhe.standardPriceAtAcquisitionForPhrp === undefined) rhe.standardPriceAtAcquisitionForPhrp = undefined;
    if (rhe.standardPriceAtPriorTransfer === undefined) rhe.standardPriceAtPriorTransfer = undefined;
    if (rhe.standardPriceAtTransferForPhrp === undefined) rhe.standardPriceAtTransferForPhrp = undefined;
  }
  // ── 부담부증여 transferType 마이그레이션 (Phase 2, 2026-05-12) ──
  // legacy: acquisitionCause === "burdened_gift" → transferType === "burdened_gift" 로 이전.
  // 의미: "취득원인" 라디오에 끼워둔 burdened_gift는 양도 시점의 거래 형태로 이동.
  // 당초 취득은 "증여"로 추정(보수적 fallback) — 사용자가 매매·상속 등 정확한 원인으로 재입력 가능.
  if (a.transferType === undefined || a.transferType === null) {
    if (a.acquisitionCause === "burdened_gift") {
      a.transferType = "burdened_gift";
      a.acquisitionCause = "gift"; // 보수적 fallback (사용자 재입력 권장)
    } else {
      a.transferType = "regular";
    }
  }
  // ── Phase 3 (2026-05-12) — 증여세 통합 + 사전증여 5필드 fallback ──
  // 이전 세션 sessionStorage rehydrate 시 신규 필드가 undefined여서 콘솔 에러 또는 빈 폼 렌더 위험.
  if (a.bgDonorRelation === undefined) a.bgDonorRelation = "";
  if (a.bgIsMinorDonee === undefined) a.bgIsMinorDonee = false;
  if (a.bgIsGenerationSkip === undefined) a.bgIsGenerationSkip = false;
  if (a.bgIsFiledOnTime === undefined) a.bgIsFiledOnTime = true;
  if (!Array.isArray(a.bgPriorGifts)) a.bgPriorGifts = [];
  if (a.bgGiftBuildingStdPriceAtTransfer === undefined) a.bgGiftBuildingStdPriceAtTransfer = "";
  // 가업상속공제 §97의2④ — 미사용이면 undefined 유지 (3중 패턴: factory=undefined)
  if (a.familyBusinessInheritance === null) a.familyBusinessInheritance = undefined;
  return a as unknown as AssetForm;
}
