/**
 * 세션스토리지에 저장된 구 포맷 → 신 포맷 마이그레이션.
 * 800줄 정책 준수를 위해 calc-wizard-store.ts 에서 분리.
 */
import {
  type AssetForm,
  type AssetReductionForm,
  type ParcelFormItem,
  type TransferFormData,
  makeDefaultAsset,
  migrateAsset,
} from "./calc-wizard-store";
import { derivePenaltyFields } from "@/lib/calc/filing-deadline";

/** ParcelListInput 마이그레이션 — store에서 분리된 헬퍼 */
function migrateParcel(p: unknown): ParcelFormItem {
  const parcel = (p as Partial<ParcelFormItem>) ?? {};
  let areaScenario: ParcelFormItem["areaScenario"];
  if (parcel.areaScenario) {
    areaScenario = parcel.areaScenario;
  } else if (parcel.acquisitionArea && parcel.acquisitionArea === parcel.transferArea) {
    areaScenario = "same";
  } else {
    areaScenario = "partial";
  }
  return { ...(parcel as unknown as ParcelFormItem), areaScenario };
}

/** 세션스토리지에 저장된 구 포맷(propertyType + companionAssets / 루트 감면 필드)을 신규 assets[] 포맷으로 변환 */
export function migrateLegacyForm(
  legacy: Record<string, unknown>,
  defaultFormData: TransferFormData,
): TransferFormData {
  const primaryAsset = makeDefaultAsset(1);
  primaryAsset.assetKind =
    (legacy.propertyType as AssetForm["assetKind"]) ?? "housing";
  primaryAsset.isSuccessorRightToMoveIn = Boolean(legacy.isSuccessorRightToMoveIn);
  primaryAsset.isPrimaryForHouseholdFlags = true;
  primaryAsset.standardPriceAtTransfer = String(legacy.standardPriceAtTransfer ?? "");
  primaryAsset.standardPriceAtTransferLabel = String(legacy.standardPriceAtTransferLabel ?? "");
  primaryAsset.directExpenses = String(legacy.expenses ?? "0");
  primaryAsset.inheritanceValuationMode =
    (legacy.inheritanceValuationMode as "auto" | "manual") ?? "auto";
  primaryAsset.inheritanceDate = String(legacy.acquisitionDate ?? "");
  primaryAsset.publishedValueAtInheritance = String(
    legacy.inheritanceLandPricePerM2 || legacy.inheritanceHousePrice || ""
  );
  primaryAsset.fixedAcquisitionPrice = String(legacy.acquisitionPrice ?? "");

  primaryAsset.addressRoad = String(legacy.propertyAddressRoad ?? "");
  primaryAsset.addressJibun = String(legacy.propertyAddressJibun ?? "");
  primaryAsset.addressDetail = String(legacy.propertyAddressDetail ?? "");
  primaryAsset.buildingName = String(legacy.propertyBuildingName ?? "");
  primaryAsset.longitude = String(legacy.propertyLongitude ?? "");
  primaryAsset.latitude = String(legacy.propertyLatitude ?? "");

  primaryAsset.isOneHousehold = Boolean(legacy.isOneHousehold ?? true);
  // legacy form-global residencePeriodMonths → 자산-수준 direct 모드로 1회 이전
  if (legacy.residencePeriodMonths !== undefined) {
    primaryAsset.residencePeriodMonthsAsset = String(legacy.residencePeriodMonths ?? "0");
    primaryAsset.residenceInputMode = "direct";
  }
  primaryAsset.actualSalePrice = "";
  primaryAsset.acquisitionCause =
    (legacy.acquisitionCause as "purchase" | "inheritance" | "gift") ?? "purchase";
  primaryAsset.acquisitionDate = String(legacy.acquisitionDate ?? "");
  primaryAsset.decedentAcquisitionDate = String(legacy.decedentAcquisitionDate ?? "");
  primaryAsset.donorAcquisitionDate = String(legacy.donorAcquisitionDate ?? "");
  primaryAsset.useEstimatedAcquisition = Boolean(legacy.useEstimatedAcquisition);
  primaryAsset.standardPriceAtAcq = String(legacy.standardPriceAtAcquisition ?? "");
  primaryAsset.standardPriceAtAcqLabel = String(legacy.standardPriceAtAcquisitionLabel ?? "");

  // 구 폼-전역 acquisitionMethod === "appraisal" → assets[0].isAppraisalAcquisition
  if (legacy.acquisitionMethod === "appraisal") {
    primaryAsset.isAppraisalAcquisition = true;
    if (legacy.appraisalValue) {
      primaryAsset.fixedAcquisitionPrice = String(legacy.appraisalValue);
    }
  }
  // 구 폼-전역 신축·증축 4필드 → assets[0]
  if (legacy.isSelfBuilt) {
    primaryAsset.isSelfBuilt = true;
    primaryAsset.buildingType = (legacy.buildingType as AssetForm["buildingType"]) ?? "";
    primaryAsset.constructionDate = String(legacy.constructionDate ?? "");
    primaryAsset.extensionFloorArea = String(legacy.extensionFloorArea ?? "");
  }
  // 구 폼-전역 pre1990* 7필드 → assets[0]
  if (legacy.pre1990Enabled) {
    primaryAsset.pre1990Enabled = true;
    primaryAsset.pre1990PricePerSqm_1990 = String(legacy.pre1990PricePerSqm_1990 ?? "");
    primaryAsset.pre1990PricePerSqm_atTransfer = String(legacy.pre1990PricePerSqm_atTransfer ?? "");
    primaryAsset.pre1990Grade_current = String(legacy.pre1990Grade_current ?? "");
    primaryAsset.pre1990Grade_prev = String(legacy.pre1990Grade_prev ?? "");
    primaryAsset.pre1990Grade_atAcq = String(legacy.pre1990Grade_atAcq ?? "");
    primaryAsset.pre1990GradeMode = (legacy.pre1990GradeMode as "number" | "value") ?? "number";
  }

  if (legacy.parcelMode) {
    primaryAsset.parcelMode = Boolean(legacy.parcelMode);
    primaryAsset.parcels = ((legacy.parcels as unknown[]) ?? []).map(migrateParcel);
    migrateAsset(primaryAsset);
  }

  // 상속 취득가액 의제 신규 필드 기본값 주입 (신규 필드 미존재 시 안전 초기화)
  if (primaryAsset.inheritanceMode === undefined) primaryAsset.inheritanceMode = null;
  if (!primaryAsset.inheritanceStartDate) primaryAsset.inheritanceStartDate = "";
  if (primaryAsset.hasDecedentActualPrice === undefined) primaryAsset.hasDecedentActualPrice = false;
  if (!primaryAsset.decedentAcquisitionPrice) primaryAsset.decedentAcquisitionPrice = "";
  if (!primaryAsset.inheritanceReportedValue) primaryAsset.inheritanceReportedValue = "";
  if (!primaryAsset.inheritanceValuationMethod) primaryAsset.inheritanceValuationMethod = "";
  if (!primaryAsset.inheritanceValuationEvidence) primaryAsset.inheritanceValuationEvidence = "";
  if (primaryAsset.useSupplementaryHelper === undefined) primaryAsset.useSupplementaryHelper = false;
  if (!primaryAsset.supplementaryLandArea) primaryAsset.supplementaryLandArea = "";
  if (!primaryAsset.supplementaryLandUnitPrice) primaryAsset.supplementaryLandUnitPrice = "";
  if (!primaryAsset.supplementaryBuildingValue) primaryAsset.supplementaryBuildingValue = "";
  // 기존 사용자가 publishedValueAtInheritance를 입력했던 경우 → supplementary 자동 분류
  if (primaryAsset.publishedValueAtInheritance && !primaryAsset.inheritanceValuationMethod) {
    primaryAsset.inheritanceValuationMethod = "supplementary";
  }

  // 구 폼-전역 nbl* 6필드 → assets[0] (isNonBusinessLand 포함)
  if (legacy.isNonBusinessLand || legacy.nblLandType) {
    primaryAsset.isNonBusinessLand = Boolean(legacy.isNonBusinessLand);
    primaryAsset.nblLandType = String(legacy.nblLandType ?? "") as AssetForm["nblLandType"];
    primaryAsset.nblZoneType = String(legacy.nblZoneType ?? "");
    primaryAsset.nblFarmingSelf = Boolean(legacy.nblFarmingSelf);
    primaryAsset.nblFarmerResidenceDistance = String(legacy.nblFarmerResidenceDistance ?? "");
    primaryAsset.nblBusinessUsePeriods =
      (legacy.nblBusinessUsePeriods as AssetForm["nblBusinessUsePeriods"]) ?? [];
    // nblLandArea → acquisitionArea (비어있을 때만, area-taxonomy.md 원칙 B)
    if (legacy.nblLandArea && !primaryAsset.acquisitionArea) {
      primaryAsset.acquisitionArea = String(legacy.nblLandArea);
      primaryAsset.transferArea = String(legacy.nblLandArea);
    }
  }

  const legacyReductionType = legacy.reductionType as string | undefined;
  if (legacyReductionType && legacyReductionType !== "") {
    if (legacyReductionType === "self_farming") {
      primaryAsset.reductions = [{
        type: "self_farming",
        farmingYears: String(legacy.farmingYears ?? "0"),
        decedentFarmingYears: String(legacy.decedentFarmingYears ?? "0"),
        useSelfFarmingIncorporation: Boolean(legacy.useSelfFarmingIncorporation),
        selfFarmingIncorporationDate: String(legacy.selfFarmingIncorporationDate ?? ""),
        selfFarmingIncorporationZone: (legacy.selfFarmingIncorporationZone as "residential" | "commercial" | "industrial" | "") ?? "",
        selfFarmingStandardPriceAtIncorporation: String(legacy.selfFarmingStandardPriceAtIncorporation ?? ""),
      }];
    } else if (legacyReductionType === "long_term_rental") {
      // ⚠️ R-1·R-4: 레거시 8년 50% 경과규정(§97의3 구법). 신규 입력은 rental_97_* 사용.
      // 구버전 데이터 호환 보존 — 부칙 확정 전 rental_97_3(10년 70%)로 단순 치환 금지(율 상이).
      // 후속: docs/00-pm/transfer-rental-followup.plan.md §R-1·R-4.
      primaryAsset.reductions = [{
        type: "long_term_rental",
        rentalYears: String(legacy.rentalYears ?? "0"),
        rentIncreaseRate: String(legacy.rentIncreaseRate ?? "0"),
      }];
    } else if (legacyReductionType === "new_housing") {
      primaryAsset.reductions = [{
        type: "new_housing",
        reductionRegion: (legacy.reductionRegion as "metropolitan" | "non_metropolitan" | "outside_overconcentration") ?? "metropolitan",
      }];
    } else if (legacyReductionType === "unsold_housing") {
      primaryAsset.reductions = [{
        type: "unsold_housing",
        reductionRegion: (legacy.reductionRegion as "metropolitan" | "non_metropolitan" | "outside_overconcentration") ?? "metropolitan",
      }];
    } else if (legacyReductionType === "public_expropriation") {
      primaryAsset.reductions = [{
        type: "public_expropriation",
        expropriationCash: String(legacy.expropriationCash ?? ""),
        expropriationBond: String(legacy.expropriationBond ?? ""),
        expropriationBondHoldingYears: (legacy.expropriationBondHoldingYears as "none" | "3" | "5") ?? "none",
        expropriationApprovalDate: String(legacy.expropriationApprovalDate ?? ""),
      }];
    }
  }

  const companions: AssetForm[] = (
    (legacy.companionAssets as Array<Record<string, unknown>>) ?? []
  ).map((ca, i) => {
    const base = ca as unknown as AssetForm;
    const legacyCaReductionType = (ca.reductionType as string | undefined) ?? "";
    const caReductions: AssetReductionForm[] = [];
    if (legacyCaReductionType === "self_farming") {
      caReductions.push({
        type: "self_farming",
        farmingYears: String(ca.farmingYears ?? "0"),
      });
    }
    const legacyLandArea = String(ca.landAreaM2 ?? "");
    return {
      ...base,
      assetLabel: (base.assetLabel ?? `동반자산 ${i + 1}`)
        .replace(/^동반자산/, "자산"),
      isSuccessorRightToMoveIn: false,
      isPrimaryForHouseholdFlags: false,
      standardPriceAtAcqLabel: String(ca.standardPriceAtAcqLabel ?? ""),
      standardPriceAtTransferLabel: String(ca.standardPriceAtTransferLabel ?? ""),
      addressDetail: String(ca.addressDetail ?? ""),
      buildingName: String(ca.buildingName ?? ""),
      longitude: String(ca.longitude ?? ""),
      latitude: String(ca.latitude ?? ""),
      isRegulatedAreaAtAcq: null,
      isRegulatedAreaAtTransfer: null,
      parcelMode: Boolean(ca.parcelMode ?? false),
      parcels: ((ca.parcels as unknown[]) ?? []).map(migrateParcel),
      acquisitionArea: String(ca.acquisitionArea ?? legacyLandArea),
      transferArea: String(ca.transferArea ?? legacyLandArea),
      areaScenario: (ca.areaScenario as AssetForm["areaScenario"]) ??
        (ca.acquisitionArea && ca.transferArea && ca.acquisitionArea !== ca.transferArea
          ? "partial"
          : "same"),
      replottingConfirmDate: String(ca.replottingConfirmDate ?? ""),
      entitlementArea: String(ca.entitlementArea ?? ""),
      allocatedArea: String(ca.allocatedArea ?? ""),
      priorLandArea: String(ca.priorLandArea ?? ""),
      reductions: caReductions,
    };
  });

  const {
    propertyType: _pt,
    isSuccessorRightToMoveIn: _isr,
    transferPrice,
    acquisitionCause: _ac,
    acquisitionDate: _ad,
    decedentAcquisitionDate: _dad,
    donorAcquisitionDate: _doad,
    acquisitionPrice: _ap,
    expenses: _exp,
    useEstimatedAcquisition: _uea,
    standardPriceAtAcquisition: _spa,
    standardPriceAtTransfer: _spt,
    standardPriceAtAcquisitionLabel: _spaal,
    standardPriceAtTransferLabel: _spttl,
    inheritanceValuationMode: _ivm,
    inheritanceLandPricePerM2: _ilpp,
    inheritanceHousePrice: _ihp,
    companionAssets: _ca,
    primaryActualSalePrice: _pasp,
    propertyAddressRoad: _par,
    propertyAddressJibun: _paj,
    propertyBuildingName: _pbn,
    propertyAddressDetail: _pad,
    propertyLongitude: _plon,
    propertyLatitude: _plat,
    parcelMode: _pm,
    parcels: _parcels,
    reductionType: _rt,
    farmingYears: _fy,
    useSelfFarmingIncorporation: _usfi,
    selfFarmingIncorporationDate: _sfid,
    selfFarmingIncorporationZone: _sfiz,
    selfFarmingStandardPriceAtIncorporation: _sfspa,
    decedentFarmingYears: _dfy,
    rentalYears: _ry,
    rentIncreaseRate: _rir,
    reductionRegion: _rr,
    expropriationCash: _ec,
    expropriationBond: _eb,
    expropriationBondHoldingYears: _ebhy,
    expropriationApprovalDate: _ead,
    isNonBusinessLand: _inbl,
    nblLandType: _nlt,
    nblLandArea: _nla,
    nblZoneType: _nzt,
    nblFarmingSelf: _nfs,
    nblFarmerResidenceDistance: _nfrd,
    nblBusinessUsePeriods: _nbup,
    ...rest
  } = legacy as Record<string, unknown>;

  // 사용하지 않는 변수 경고 회피
  void _pt; void _isr; void _ac; void _ad; void _dad; void _doad; void _ap; void _exp;
  void _uea; void _spa; void _spt; void _spaal; void _spttl; void _ivm; void _ilpp;
  void _ihp; void _ca; void _pasp; void _par; void _paj; void _pbn; void _pad;
  void _plon; void _plat; void _pm; void _parcels; void _rt; void _fy; void _usfi;
  void _sfid; void _sfiz; void _sfspa; void _dfy; void _ry; void _rir; void _rr;
  void _ec; void _eb; void _ebhy; void _ead;
  void _inbl; void _nlt; void _nla; void _nzt; void _nfs; void _nfrd; void _nbup;

  const merged: TransferFormData = {
    ...defaultFormData,
    ...(rest as Partial<TransferFormData>),
    contractTotalPrice: String(transferPrice ?? ""),
    assets: [primaryAsset, ...companions],
  };
  // 로드 시점 가산세 cross-field 보정 (effect→store 미러링 제거 후 마이그레이션에서 1회 파생).
  // 레거시 데이터가 양도일·신고일은 있으나 가산세 필드가 기본값일 때 신고기한 초과분 자동 반영.
  const penaltyPatch = derivePenaltyFields(
    merged.transferDate,
    merged.filingDate,
    merged,
  );
  return { ...merged, ...penaltyPatch };
}
