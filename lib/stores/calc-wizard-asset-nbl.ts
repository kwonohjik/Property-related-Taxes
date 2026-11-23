/**
 * 비사업용 토지(NBL) 관련 폼 타입 선언.
 * calc-wizard-asset.ts 800줄 정책에 따라 분리 (2026-05-11).
 */

import type { WholesaleItem } from "@/lib/tax-engine/non-business-land/revenue-wholesale-item";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "./calc-wizard-asset-reduction";
import type { NblOtherStateEventInput } from "./calc-wizard-asset-nbl-other";
import type { NblRevenueYearRowInput } from "./calc-wizard-asset-nbl-other";
import type { StateHistoryMode } from "@/lib/tax-engine/non-business-land/land-usage.types";

// 분리된 장기임대 선언 타입 — 기존 import 경로(`calc-wizard-asset-nbl`)를 유지한다.
export type {
  RentalDeclaration,
  TaxIncentiveRentalRegistrationType,
  AptDeadlineExtensionForm,
  TaxIncentiveRentalFacts,
} from "./calc-wizard-asset-nbl-rental";

// 주택 수 산정용 폼 항목 — 800줄 정책으로 분리(`calc-wizard-asset-house-entry.ts`). 기존 import 경로를 유지한다.
export type { HouseEntry, PresaleRightEntry } from "./calc-wizard-asset-house-entry";

/** 행에 붙는 조특법 §99의4·§98의9 선언 — 감면 폼과 같은 모양(입력 폼·④ 변환을 그대로 쓴다). */
export type RowCountExclusionReduction = Extract<
  AssetReductionForm,
  { type: "new_99_4_rural" | "new_99_4_hometown" | "unsold_98_9" }
>;

/** 조특법 주택 수 제외 사유 — 한 주택에 하나. `HouseEntry.countExclusion` 주석 참조. */
export type HouseCountExclusionRowFact =
  | { kind: "reduction"; reduction: RowCountExclusionReduction }
  | { kind: "special"; special: SpecialHouseExclusionFormItem };

/** 비사업용 토지 사업용 사용기간 항목 (폼 문자열 버전) */
export interface NblBusinessUsePeriod {
  startDate: string;
  endDate: string;
  usageType: string;
}

/** 소유자 거주 이력 1건 (NBL 재촌 판정용) */
export interface ResidenceHistoryInput {
  sigunguCode: string;
  sigunguName: string;
  startDate: string;
  endDate: string;
  /** 주민등록 여부 — 임야 재촌 필수 요건 */
  hasResidentRegistration: boolean;
  /** 거주지 좌표 (직선거리 30km 재촌 판정용, §153③3호) — 주소검색 파생. string 저장. */
  lat?: string;
  lng?: string;
}

/** 사업용 사용기간 1건 — 목장 사육기간·별장 사용기간 등 (start/end 직접 입력) */
export interface GracePeriodInput {
  type:
    | "inheritance"
    | "legal_restriction"
    | "sale_contract"
    | "construction"
    | "unavoidable"
    | "preparation"
    | "land_replotting";
  startDate: string;
  endDate: string;
  description: string;
}

/** 부득이한 사유 유예기간 1건 (§168의14①·시행규칙 §83의5①) — 종료일 사유별 자동산정 (갭 3b) */
export interface NblGracePeriodInput {
  reasonCode:
    // 시행령 §168의14① 1~3호
    | "use_prohibited"
    | "protected_zone"
    | "inherited_restricted"
    // 시행규칙 §83의5① 1~12호
    | "building_permit_restricted"
    | "construction_start_restricted"
    | "access_road"
    | "public_open_space"
    | "construction_in_progress"
    | "mortgage_or_liquidation"
    | "ownership_litigation"
    | "urban_dev_buildable"
    | "demolition"
    | "business_closure_relocation"
    | "natural_disaster_wasteland"
    | "other_justifiable";
  /** 기산일 (멸실일·건축가능일·사유발생일·event_window 개시일). 6호·5호는 취득일 자동. */
  anchorDate: string;
  /** event_window/4호 종료일. fixed 호(6/8/9/10/11)는 자동산정으로 미사용. */
  endDate: string;
  /** 5호 착공일 */
  secondaryDate?: string;
  /** 5호 건설진행종료일(선택) */
  secondaryEndDate?: string;
  description: string;
}

/**
 * 비사업용 토지(NBL) 필드 초기값 **명세** (800줄 분리, 2026-06-15).
 *
 * ⚠️ `makeDefaultAsset`은 이 상수를 **spread하지 않는다** — 모듈 상수라
 * `nblOtherParcels: []`·`nblFactorySegments: []` 같은 배열 필드를 spread하면
 * 모든 자산이 **같은 배열 인스턴스를 공유**한다. factory는 호출마다 새 값을 만든다.
 *
 * 그래서 두 목록이 벌어질 수 있고 실제로 15필드(공장·복합용도 클러스터)가 벌어져 있었다(COV-5).
 * 일치는 `__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts`가 강제한다 —
 * **신규 NBL 필드는 이 상수와 factory 양쪽에 넣어야 하고, 빠뜨리면 그 테스트가 실패한다.**
 */
export const NBL_DEFAULTS = {
  isNonBusinessLand: false,
  nblUseDetailedJudgment: false,
  nblLandType: "" as "" | "farmland" | "forest" | "pasture" | "housing_site" | "villa_land" | "other_land",
  nblZoneType: "",
  nblBusinessUsePeriods: [] as NblBusinessUsePeriod[],
  nblLandSigunguCode: "",
  nblLandSigunguName: "",
  nblResidenceHistories: [] as ResidenceHistoryInput[],
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
  nblExemptInong: false,
  nblExemptInongDate: "",
  nblDeemedTransferReason: "none",
  nblDeemedTransferDate: "",
  nblUrbanIncorporationDate: "",
  nblIsMetropolitanArea: "" as "" | "yes" | "no" | "unknown",
  nblLandDivision: "" as "" | "dong" | "eup_myeon",
  nblFarmingSelf: false,
  nblDisqualifiedTaxPeriods: "",
  nblFarmerResidenceDistance: "",
  nblFarmlandIsWeekendFarm: false,
  nblFarmlandIsConversionApproved: false,
  nblFarmlandIsFarmDevZone: false,
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
    nblPastureHasFacility: false,
    nblPastureHasGrassland: false,
    nblPastureHasFodder: false,
  nblPastureLivestockCount: "",
  nblPastureLivestockPeriods: [] as GracePeriodInput[],
  nblPastureInheritanceDate: "",
  nblPastureIsSpecialOrgUse: false,
  nblHousingFootprint: "",
  nblVillaUsePeriods: [] as GracePeriodInput[],
  nblVillaIsEupMyeon: false,
  nblVillaIsRuralHousing: false,
  nblVillaBuildingFloorArea: "",
  nblVillaAttachedLandArea: "",
  nblVillaCombinedStdValue: "",
  nblVillaIsInRestrictedArea: false,
  nblVillaIsAfter20150101: false,
  nblVillaNoUseConfirmed: false,
  nblOtherPropertyTaxType: "",
  nblOtherPropertyTaxBasis: "",
  nblOtherDemolishedFloorArea: "",
  nblOtherBuildingValue: "",
  nblOtherLandValue: "",
  nblOtherIsRelatedToResidence: false,
  nblOtherLegacyRelatedReselect: false,
  nblOtherHasBuilding: false,
  nblOtherStateHistoryMode: "" as StateHistoryMode,
  nblOtherStateEvents: [] as NblOtherStateEventInput[],
  nblOtherBuildingFloorArea: "",
  // §168의11① 호별 면적기준 (갭 3a)
  nblOtherRelatedBusinessType: "",
  nblOtherStandardAreaLimit: "",
  nblOtherMaxAnnualArea: "",
  nblOtherYouthCapacity: "",
  nblOtherMinGarageArea: "",
  nblOtherSportsFacilityType: "", nblOtherReserveUnitSize: "", nblOtherReserveFacilities: [] as string[], nblOtherSportsCategory: "workplace", nblOtherEmployeeCount: "", nblOtherEmployeeFacilityKinds: [] as string[], nblOtherResortOutdoorArea: "", nblOtherResortParkingStdArea: "", nblOtherResortParkingActualArea: "", nblOtherResortBuildingArea: "", nblOtherSportsPlayerCount: "", nblOtherIndoorNotInstalled: false, nblOtherSportsExtraEvents: [] as string[], nblOtherIndoorFloorArea: "", nblOtherResortBuildingFloorArea: "",
  nblOtherPrivateInvestCompletionDate: "",
  // §168의11② 수입금액비율 (기타토지 — 2호다목·10·11다·12호 특정 업종)
  nblRevenueBusinessType: "" as
    | ""
    | "parking_operation"
    | "mineral_spring"
    | "fish_farm_other"
    | "block_stone_pipe_mfg"
    | "landscaping_floriculture"
    | "vehicle_repair_academy"
    | "agriculture_academy"
    | "wholesale_retail",
  nblRevenueWholesaleItem: "" as "" | WholesaleItem,
  nblRevenueWholesaleInMarket: false,
  nblRevenueCurrentRevenue: "",
  nblRevenueCurrentLandValue: "",
  nblRevenuePriorRevenue: "",
  nblRevenuePriorLandValue: "",
  nblRevenueCurrentBusinessStartDate: "",
  nblRevenuePriorBusinessDays: "",
  nblRevenueCurrentDeposit: "",
  nblRevenueCurrentRentDays: "",
  nblRevenuePriorDeposit: "",
  nblRevenuePriorRentDays: "",
  nblRevenueCommonApportion: false,
  nblRevenueCommonRevenue: "",
  nblRevenueOtherLandValue: "",
  nblRevenuePriorCommonRevenue: "",
  nblRevenuePriorOtherLandValue: "",
  // NBL-STATE-HISTORY-E3-② 업종 영위 기간 — 꺼짐 = 현행
  nblRevenuePeriodOn: false,
  nblRevenueBusinessEndDate: "",
  nblRevenueYearRows: [] as NblRevenueYearRowInput[],
  nblGracePeriods: [] as NblGracePeriodInput[],
  // §83의5① 단서 — 부동산매매업 매매용부동산(1·2호 배제) 게이트
nblOtherMixedUseMode: "",
  nblOtherMixedUseSpecificFloorArea: "",
  nblOtherMixedUseTotalFloorArea: "",
  nblOtherMixedUseSpecificFootprint: "",
  nblOtherMixedUseTotalFootprint: "",
  nblOtherUseParcels: false,
  nblOtherParcels: [],
  nblFactoryEnabled: false,
  nblFactoryLocationCategory: "",
  nblFactoryTotalLandArea: "",
  nblFactorySegments: [],
  nblFactoryIsRestrictedZone: false,
  nblFactoryAdditionalRecognizedArea: "",
  nblFactorySportsEmployeeCount: "",
  nblFactorySportsEntityType: "" as "" | "corporation" | "individual",
  nblFactorySportsPlaygroundArea: "",
  nblFactorySportsCourtArea: "",
  nblFactorySportsIndoorFloorArea: "",
  nblFactoryFootprintArea: "",
  nblFactoryIsUnregistered: false,
  nblBusinessIsRealEstateDealer: false,
} as const satisfies Record<string, unknown>;
