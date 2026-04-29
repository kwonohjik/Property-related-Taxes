/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData (assets[] 기반) → POST /api/calc/transfer → TransferAPIResult
 *
 * Phase 1: 서버 Zod 스키마 미변경 — 클라이언트에서 기존 포맷으로 변환하여 전송.
 * assets.length === 1 → single 엔드포인트, >= 2 → bundled 엔드포인트.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData, AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

export type SingleTransferResult = { mode: "single"; result: TransferTaxResult };
export type BundledTransferResult = {
  mode: "bundled";
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
};
export type MixedUseTransferResult = { mode: "mixed-use"; result: MixedUseGainBreakdown };
export type TransferAPIResult = SingleTransferResult | BundledTransferResult | MixedUseTransferResult;

/** 엔진이 이해하는 3종 assetKind (right_to_move_in / presale_right → housing) */
function toEngineAssetKind(kind: AssetForm["assetKind"]): "housing" | "land" | "building" {
  if (kind === "right_to_move_in" || kind === "presale_right") return "housing";
  return kind;
}

const isHousingLike = (kind: AssetForm["assetKind"]) =>
  kind === "housing" || kind === "right_to_move_in" || kind === "presale_right";

/** AssetReductionForm[] → 엔진 reductions payload 변환 */
export function toEngineReductions(
  formReductions: AssetReductionForm[],
  acquisitionCause: AssetForm["acquisitionCause"],
) {
  return formReductions.map((r) => {
    if (r.type === "self_farming") {
      const decedentYears = parseInt(r.decedentFarmingYears ?? "0") || 0;
      const incorpDate = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationDate ?? "") : "";
      const incorpZone = r.useSelfFarmingIncorporation ? (r.selfFarmingIncorporationZone ?? "") : "";
      const incorpStdPrice = r.useSelfFarmingIncorporation
        ? parseAmount(r.selfFarmingStandardPriceAtIncorporation ?? "")
        : 0;
      return {
        type: "self_farming" as const,
        farmingYears: parseInt(r.farmingYears) || 0,
        ...(acquisitionCause === "inheritance" && decedentYears > 0
          ? { decedentFarmingYears: decedentYears }
          : {}),
        ...(incorpDate ? { incorporationDate: incorpDate } : {}),
        ...(incorpZone ? { incorporationZoneType: incorpZone } : {}),
        ...(incorpStdPrice > 0 ? { standardPriceAtIncorporation: incorpStdPrice } : {}),
      };
    }
    if (r.type === "long_term_rental") {
      return {
        type: "long_term_rental" as const,
        rentalYears: parseInt(r.rentalYears) || 0,
        rentIncreaseRate: parseFloat(r.rentIncreaseRate) / 100,
      };
    }
    if (r.type === "new_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "new_housing" as const, region };
    }
    if (r.type === "unsold_housing") {
      const region =
        r.reductionRegion === "outside_overconcentration"
          ? "metropolitan"
          : (r.reductionRegion as "metropolitan" | "non_metropolitan");
      return { type: "unsold_housing" as const, region };
    }
    if (r.type === "public_expropriation") {
      const cash = parseAmount(r.expropriationCash || "0");
      const bond = parseAmount(r.expropriationBond || "0");
      const bondHoldingYears =
        r.expropriationBondHoldingYears === "3"
          ? 3
          : r.expropriationBondHoldingYears === "5"
            ? 5
            : null;
      return {
        type: "public_expropriation" as const,
        cashCompensation: cash,
        bondCompensation: bond,
        bondHoldingYears,
        businessApprovalDate: r.expropriationApprovalDate,
      };
    }
    // exhaustive check
    const _never: never = r;
    return _never;
  });
}

/** 자산 1건 → 번들 companionAssets 배열 항목 변환 */
function buildAssetPayload(asset: AssetForm, bundledSaleMode: "actual" | "apportioned") {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause);

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "auto"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: asset.inheritanceAssetKind,
          landAreaM2: effectiveLandArea,
          publishedValueAtInheritance: parseAmount(asset.publishedValueAtInheritance),
        }
      : undefined;

  const fixedAcquisitionPrice =
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "manual" && asset.fixedAcquisitionPrice)
      ? parseAmount(asset.fixedAcquisitionPrice)
      : undefined;

  return {
    assetId: asset.assetId,
    assetLabel: asset.assetLabel,
    assetKind: toEngineAssetKind(asset.assetKind),
    standardPriceAtTransfer:
      parseAmount(asset.standardPriceAtTransfer) > 0
        ? parseAmount(asset.standardPriceAtTransfer)
        : undefined,
    standardPriceAtAcquisition:
      asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition && asset.standardPriceAtAcq
        ? parseAmount(asset.standardPriceAtAcq)
        : undefined,
    directExpenses: parseAmount(asset.directExpenses),
    reductions,
    inheritanceValuation,
    fixedAcquisitionPrice,
    isOneHousehold: asset.isOneHousehold,
    fixedSalePrice:
      bundledSaleMode === "actual" && asset.actualSalePrice
        ? parseAmount(asset.actualSalePrice)
        : undefined,
    acquisitionCause: asset.acquisitionCause,
    useEstimatedAcquisition:
      asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
    acquisitionDate: asset.acquisitionDate || undefined,
    decedentAcquisitionDate:
      asset.acquisitionCause === "inheritance" && asset.decedentAcquisitionDate
        ? asset.decedentAcquisitionDate
        : undefined,
    donorAcquisitionDate:
      asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
        ? asset.donorAcquisitionDate
        : undefined,
  };
}

export async function callTransferTaxAPI(form: TransferFormData): Promise<TransferAPIResult> {
  const primary = form.assets[0];
  if (!primary) throw new Error("자산이 없습니다.");

  // ── 대표 자산 감면 (자산별 reductions 배열에서 빌드) ──
  const reductions = toEngineReductions(primary.reductions ?? [], primary.acquisitionCause);

  // ── 비사업용 토지 상세 — asset 단위 읽기 (v1.2: form.nbl* → primary.nbl*) ──
  const nblDetails =
    primary.assetKind === "land" &&
    primary.nblLandType &&
    primary.nblZoneType &&
    primary.acquisitionArea
      ? {
          landType: primary.nblLandType,
          landArea: parseFloat(primary.acquisitionArea),   // nblLandArea 폐지, acquisitionArea 재사용
          zoneType: primary.nblZoneType,
          acquisitionDate: primary.acquisitionDate,
          transferDate: form.transferDate,
          farmingSelf: primary.nblFarmingSelf || undefined,
          farmerResidenceDistance: primary.nblFarmerResidenceDistance
            ? parseFloat(primary.nblFarmerResidenceDistance)
            : undefined,
          businessUsePeriods: (primary.nblBusinessUsePeriods ?? []).filter(
            (p) => p.startDate && p.endDate,
          ),
        }
      : undefined;

  // ── 다른 보유 주택 목록 ──
  const housesPayload =
    isHousingLike(primary.assetKind) && form.houses.length > 0
      ? [
          {
            id: "selling",
            region: form.sellingHouseRegion,
            acquisitionDate: primary.acquisitionDate,
            officialPrice: parseAmount(primary.standardPriceAtTransfer) || 0,
            isInherited: false,
            isLongTermRental: false,
            isApartment: false,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
          ...form.houses
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
            })),
        ]
      : undefined;

  // 취득가 산정방식은 자산-수준 플래그에서 도출 (Step1↔Step3 통합 후).
  // 폼-전역 form.acquisitionMethod / form.appraisalValue 는 더 이상 사용하지 않음.
  const isAppraisal = primary.isAppraisalAcquisition === true;
  const isEstimated = !isAppraisal && primary.useEstimatedAcquisition;
  const hasPre1990 = (primary.pre1990Enabled ?? false) && primary.assetKind === "land";
  // §164⑤ PHD 모드: standardPriceAt* 는 3-시점 입력으로 자동 도출 → API body에서 제외
  const usesPhd = primary.usePreHousingDisclosure === true && primary.hasSeperateLandAcquisitionDate === true;
  const parcelModeActive =
    primary.parcelMode && primary.assetKind === "land" && (primary.parcels?.length ?? 0) > 0;
  const firstParcelAcqDate = parcelModeActive
    ? (primary.parcels[0]?.acquisitionDate || form.transferDate)
    : primary.acquisitionDate;

  // 검용주택 분리계산 payload 빌드
  const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;
  const mixedUsePayload = isMixed ? {
    isMixedUseHouse: true as const,
    // 면적은 소수점 (예: 333.06㎡) — parseAmount(parseInt)는 절단 발생, parseFloat 필수
    residentialFloorArea: parseFloat(primary.residentialFloorArea) || 0,
    nonResidentialFloorArea: parseFloat(primary.nonResidentialFloorArea) || 0,
    buildingFootprintArea: parseFloat(primary.buildingFootprintArea) || 0,
    totalLandArea: parseFloat(primary.mixedUseTotalLandArea) || 0,
    landAcquisitionDate: primary.landAcquisitionDate || primary.acquisitionDate,
    buildingAcquisitionDate: primary.acquisitionDate,
    transferStandardPrice: {
      housingPrice: parseAmount(primary.mixedTransferHousingPrice) || 0,
      commercialBuildingPrice: parseAmount(primary.mixedTransferCommercialBuildingPrice) || 0,
      landPricePerSqm: parseAmount(primary.mixedTransferLandPricePerSqm) || 0,
    },
    acquisitionStandardPrice: {
      housingPrice: parseAmount(primary.mixedAcqHousingPrice) || undefined,
      commercialBuildingPrice: parseAmount(primary.mixedAcqCommercialBuildingPrice) || 0,
      landPricePerSqm: parseAmount(primary.mixedAcqLandPricePerSqm) || 0,
    },
    usePreHousingDisclosure: primary.usePreHousingDisclosure,
    // PHD 페이로드는 모든 필수 필드(.positive() 제약)가 채워졌을 때만 전송.
    // 누락 시 schema의 z.number().int().positive() 검증에서 0으로 실패하기 때문.
    preHousingDisclosure:
      primary.usePreHousingDisclosure &&
      primary.phdFirstDisclosureDate &&
      parseAmount(primary.phdFirstDisclosureHousingPrice) > 0 &&
      parseAmount(primary.phdLandPricePerSqmAtAcq) > 0 &&
      parseAmount(primary.phdLandPricePerSqmAtFirst) > 0 &&
      parseAmount(primary.phdLandPricePerSqmAtTransfer) > 0 &&
      (parseAmount(primary.phdTransferHousingPrice) > 0 ||
        parseAmount(primary.mixedTransferHousingPrice) > 0)
        ? {
            firstDisclosureDate: primary.phdFirstDisclosureDate,
            firstDisclosureHousingPrice: parseAmount(primary.phdFirstDisclosureHousingPrice),
            landPricePerSqmAtAcquisition: parseAmount(primary.phdLandPricePerSqmAtAcq),
            buildingStdPriceAtAcquisition:
              parseAmount(primary.phdBuildingStdPriceAtAcq) || 0,
            landPricePerSqmAtFirstDisclosure: parseAmount(primary.phdLandPricePerSqmAtFirst),
            buildingStdPriceAtFirstDisclosure:
              parseAmount(primary.phdBuildingStdPriceAtFirst) || 0,
            transferHousingPrice:
              parseAmount(primary.phdTransferHousingPrice) ||
              parseAmount(primary.mixedTransferHousingPrice),
            landPricePerSqmAtTransfer: parseAmount(primary.phdLandPricePerSqmAtTransfer),
            buildingStdPriceAtTransfer:
              parseAmount(primary.phdBuildingStdPriceAtTransfer) || 0,
          }
        : undefined,
    // 거주기간은 소수점 가능 (예: 23.5년) — parseFloat 사용
    residencePeriodYears: parseFloat(primary.mixedUseResidencePeriodYears) || 0,
    isMetropolitanArea: primary.mixedIsMetropolitanArea,
    zoneType: "residential" as const,
  } : undefined;

  const body = {
    propertyType: isMixed ? ("mixed-use-house" as const) : primary.assetKind,
    transferPrice: parseAmount(form.contractTotalPrice),
    transferDate: form.transferDate,
    acquisitionPrice:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : parseAmount(primary.fixedAcquisitionPrice),
    acquisitionDate: parcelModeActive ? firstParcelAcqDate : primary.acquisitionDate,
    expenses:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : parseAmount(primary.directExpenses),
    // 검용주택은 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회 위해 false 송신
    useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed ? false : isEstimated,
    standardPriceAtAcquisition: hasPre1990 || usesPhd
      ? undefined
      : isEstimated
        ? parseAmount(primary.standardPriceAtAcq) || undefined
        : undefined,
    standardPriceAtTransfer: hasPre1990 || usesPhd
      ? undefined
      : isEstimated
        ? parseAmount(primary.standardPriceAtTransfer) || undefined
        : undefined,
    acquisitionMethod: hasPre1990 || isMixed
      ? ("actual" as const)
      : (isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"),
    appraisalValue: !isMixed && isAppraisal ? parseAmount(primary.fixedAcquisitionPrice) : undefined,
    isSelfBuilt: !isMixed && primary.isSelfBuilt || undefined,
    buildingType: primary.buildingType || undefined,
    constructionDate:
      primary.isSelfBuilt && primary.constructionDate ? primary.constructionDate : undefined,
    extensionFloorArea:
      primary.buildingType === "extension" && primary.extensionFloorArea
        ? parseFloat(primary.extensionFloorArea)
        : undefined,
    // 토지/건물 취득일 분리 + 소유자 분리 (소령 §166⑥, §168②)
    selfOwns: primary.selfOwns !== "both" ? primary.selfOwns : undefined,
    landAcquisitionDate:
      (primary.hasSeperateLandAcquisitionDate || primary.selfOwns !== "both") && primary.landAcquisitionDate
        ? primary.landAcquisitionDate
        : undefined,
    landSplitMode:
      primary.hasSeperateLandAcquisitionDate || primary.selfOwns !== "both"
        ? primary.landSplitMode
        : undefined,
    landTransferPrice: parseAmount(primary.landTransferPrice) || undefined,
    buildingTransferPrice: parseAmount(primary.buildingTransferPrice) || undefined,
    landAcquisitionPrice: parseAmount(primary.landAcquisitionPrice) || undefined,
    buildingAcquisitionPrice: parseAmount(primary.buildingAcquisitionPrice) || undefined,
    landDirectExpenses: parseAmount(primary.landDirectExpenses) || undefined,
    buildingDirectExpenses: parseAmount(primary.buildingDirectExpenses) || undefined,
    landStandardPriceAtTransfer: parseAmount(primary.landStandardPriceAtTransfer) || undefined,
    buildingStandardPriceAtTransfer: parseAmount(primary.buildingStandardPriceAtTransfer) || undefined,
    standardPricePerSqmAtAcquisition:
      primary.standardPricePerSqmAtAcq
        ? parseFloat(primary.standardPricePerSqmAtAcq) || undefined
        : undefined,
    acquisitionArea:
      primary.acquisitionArea
        ? parseFloat(primary.acquisitionArea) || undefined
        : undefined,
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    residencePeriodMonths: parseInt(form.residencePeriodMonths) || 0,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    isUnregistered: form.isUnregistered,
    isNonBusinessLand: primary.isNonBusinessLand ?? false,
    isSuccessorRightToMoveIn:
      primary.assetKind === "right_to_move_in"
        ? primary.isSuccessorRightToMoveIn
        : undefined,
    acquisitionCause: primary.acquisitionCause,
    decedentAcquisitionDate:
      primary.acquisitionCause === "inheritance" && primary.decedentAcquisitionDate
        ? primary.decedentAcquisitionDate
        : undefined,
    donorAcquisitionDate:
      primary.acquisitionCause === "gift" && primary.donorAcquisitionDate
        ? primary.donorAcquisitionDate
        : undefined,
    isOneHousehold: form.isOneHousehold,
    reductions,
    annualBasicDeductionUsed: parseAmount(form.annualBasicDeductionUsed),
    ...(form.temporaryTwoHouseSpecial &&
    form.previousHouseAcquisitionDate &&
    form.newHouseAcquisitionDate
      ? {
          temporaryTwoHouse: {
            previousAcquisitionDate: form.previousHouseAcquisitionDate,
            newAcquisitionDate: form.newHouseAcquisitionDate,
          },
        }
      : {}),
    ...(nblDetails ? { nonBusinessLandDetails: nblDetails } : {}),
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
    ...(form.enablePenalty && form.filingType !== "correct"
      ? {
          filingPenaltyDetails: {
            determinedTax: 0,
            reductionAmount: 0,
            priorPaidTax: parseAmount(form.priorPaidTax),
            originalFiledTax: parseAmount(form.originalFiledTax),
            excessRefundAmount: parseAmount(form.excessRefundAmount),
            interestSurcharge: parseAmount(form.interestSurcharge),
            filingType: form.filingType,
            penaltyReason: form.penaltyReason,
          },
        }
      : {}),
    ...(form.enablePenalty && form.paymentDeadline
      ? {
          delayedPaymentDetails: {
            unpaidTax: parseAmount(form.unpaidTax),
            paymentDeadline: form.paymentDeadline,
            actualPaymentDate: form.actualPaymentDate || undefined,
          },
        }
      : {}),
    ...(parcelModeActive
      ? {
          parcels: primary.parcels.map((p) => {
            const scenario = p.areaScenario ?? "partial";
            const isReduction = scenario === "reduction";

            // 감환지: 의제 취득면적을 직접 계산해 API에 전달 (스키마 positive() 충족)
            const finalAcqArea = isReduction
              ? (parseFloat(p.priorLandArea) * parseFloat(p.allocatedArea)) /
                parseFloat(p.entitlementArea)
              : parseFloat(p.acquisitionArea) || 0;

            // 감환지: 양도면적 = 교부면적 (UI에서 transferArea=allocatedArea로 이미 동기화)
            const finalTransferArea = isReduction
              ? parseFloat(p.allocatedArea) || 0
              : parseFloat(p.transferArea) || 0;

            return {
              id: p.id,
              acquisitionDate:
                p.useDayAfterReplotting && p.replottingConfirmDate
                  ? p.replottingConfirmDate
                  : p.acquisitionDate,
              acquisitionMethod: p.acquisitionMethod,
              acquisitionPrice:
                p.acquisitionMethod === "actual" ? parseAmount(p.acquisitionPrice) : undefined,
              acquisitionArea: finalAcqArea,
              transferArea: finalTransferArea,
              standardPricePerSqmAtAcq:
                p.acquisitionMethod === "estimated"
                  ? parseFloat(p.standardPricePerSqmAtAcq) || 0
                  : undefined,
              standardPricePerSqmAtTransfer:
                p.acquisitionMethod === "estimated"
                  ? parseFloat(p.standardPricePerSqmAtTransfer) || 0
                  : undefined,
              expenses:
                p.acquisitionMethod === "actual" ? parseAmount(p.expenses) : undefined,
              useDayAfterReplotting: p.useDayAfterReplotting || undefined,
              replottingConfirmDate:
                p.useDayAfterReplotting && p.replottingConfirmDate
                  ? p.replottingConfirmDate
                  : undefined,
              entitlementArea: isReduction
                ? parseFloat(p.entitlementArea) || undefined
                : undefined,
              allocatedArea: isReduction
                ? parseFloat(p.allocatedArea) || undefined
                : undefined,
              priorLandArea: isReduction
                ? parseFloat(p.priorLandArea) || undefined
                : undefined,
            };
          }),
        }
      : {}),
    // ── 개별주택가격 미공시 취득 환산 §164⑤ (일반 자산 전용) ──
    // 검용주택은 mixedUse.preHousingDisclosure에서 별도 전송하므로 여기 송신 금지.
    ...(!isMixed &&
    primary.usePreHousingDisclosure &&
    primary.hasSeperateLandAcquisitionDate &&
    primary.phdFirstDisclosureDate &&
    parseAmount(primary.phdFirstDisclosureHousingPrice) > 0
      ? {
          preHousingDisclosure: {
            firstDisclosureDate: primary.phdFirstDisclosureDate,
            firstDisclosureHousingPrice: parseAmount(primary.phdFirstDisclosureHousingPrice),
            landArea: parseFloat(primary.acquisitionArea) || 0,
            landPricePerSqmAtAcquisition: parseAmount(primary.phdLandPricePerSqmAtAcq) || 0,
            buildingStdPriceAtAcquisition: parseAmount(primary.phdBuildingStdPriceAtAcq) || 0,
            landPricePerSqmAtFirstDisclosure: parseAmount(primary.phdLandPricePerSqmAtFirst) || 0,
            buildingStdPriceAtFirstDisclosure: parseAmount(primary.phdBuildingStdPriceAtFirst) || 0,
            transferHousingPrice: parseAmount(primary.phdTransferHousingPrice) || 0,
            landPricePerSqmAtTransfer: parseAmount(primary.phdLandPricePerSqmAtTransfer) || 0,
            buildingStdPriceAtTransfer: parseAmount(primary.phdBuildingStdPriceAtTransfer) || 0,
          },
        }
      : {}),
    // ── 일괄양도 (assets 2건 이상) ──
    ...(form.assets.length > 1
      ? {
          totalSalePrice: parseAmount(form.contractTotalPrice),
          standardPriceAtTransferForApportion:
            parseAmount(primary.standardPriceAtTransfer) > 0
              ? parseAmount(primary.standardPriceAtTransfer)
              : undefined,
          primaryInheritanceValuation:
            primary.acquisitionCause === "inheritance" &&
            primary.inheritanceValuationMode === "auto"
              ? {
                  inheritanceDate: primary.acquisitionDate,
                  assetKind: toEngineAssetKind(primary.assetKind),
                  landAreaM2: primary.acquisitionArea ? parseFloat(primary.acquisitionArea) : undefined,
                  publishedValueAtInheritance: parseAmount(primary.publishedValueAtInheritance),
                }
              : undefined,
          companionAssets: form.assets
            .slice(1)
            .map((a) => buildAssetPayload(a, form.bundledSaleMode)),
          bundledSaleMode: form.bundledSaleMode,
          primaryActualSalePrice:
            form.bundledSaleMode === "actual" && primary.actualSalePrice
              ? parseAmount(primary.actualSalePrice)
              : undefined,
        }
      : {}),
    // ── 상속 취득가액 의제 (소령 §176조의2 ④ pre-deemed / §163 ⑨ post-deemed) ──
    // 자동(보충적평가) 모드 + 토지/주택 자산 → STEP 0.45 트리거.
    // case A(상속개시일 < 1985-01-01): 환산 vs 실가×CPI max 선택 → 채택에 따라 개산공제/실가경비 자동 분기.
    // case B(상속개시일 ≥ 1985-01-01): 상속세 신고가액(=공시가격) 적용.
    // standardPriceAtDeemedDate / standardPriceAtTransfer 미전송 시 엔진이
    // inheritedHouseValuation/pre1990Land 결과로 자동 주입 (helpers.ts 92-108).
    ...((primary.acquisitionCause === "inheritance" &&
        primary.inheritanceValuationMode === "auto" &&
        (primary.inheritanceAssetKind === "land" ||
         primary.inheritanceAssetKind === "house_individual" ||
         primary.inheritanceAssetKind === "house_apart"))
      ? (() => {
          const inheritanceStartDate = primary.inheritanceStartDate || primary.acquisitionDate || "";
          if (!inheritanceStartDate) return {};
          const isPreDeemed = inheritanceStartDate < "1985-01-01";

          if (isPreDeemed) {
            const stdAtDeemed = parseAmount(primary.standardPriceAtAcq);
            const stdAtTransfer = parseAmount(primary.standardPriceAtTransfer);
            const hasDecPrice = !!primary.hasDecedentActualPrice;
            const decPrice = parseAmount(primary.decedentAcquisitionPrice);
            const decPriceValid = hasDecPrice && decPrice > 0 && !!primary.decedentAcquisitionDate;

            return {
              inheritedAcquisition: {
                mode: "pre-deemed" as const,
                inheritanceStartDate,
                assetKind: primary.inheritanceAssetKind,
                ...(stdAtDeemed > 0 && { standardPriceAtDeemedDate: stdAtDeemed }),
                ...(stdAtTransfer > 0 && { standardPriceAtTransfer: stdAtTransfer }),
                hasDecedentActualPrice: decPriceValid,
                ...(decPriceValid && {
                  decedentAcquisitionDate: primary.decedentAcquisitionDate,
                  decedentActualPrice: decPrice,
                }),
              },
            };
          }

          // case B post-deemed
          const reportedValue = parseAmount(primary.publishedValueAtInheritance);
          if (reportedValue <= 0) return {};
          return {
            inheritedAcquisition: {
              mode: "post-deemed" as const,
              inheritanceStartDate,
              assetKind: primary.inheritanceAssetKind,
              reportedValue,
              reportedMethod: "supplementary" as const,
              useSupplementaryHelper: true,
              ...(primary.acquisitionArea && parseFloat(primary.acquisitionArea) > 0 && {
                landAreaM2: parseFloat(primary.acquisitionArea),
              }),
              publishedValueAtInheritance: reportedValue,
            },
          };
        })()
      : {}),
    // ── 상속 주택 환산취득가 보조 입력 (주택 + 상속개시일 < 2005-04-30) ──
    // inhHouseValEnabled는 dead flag — UI 토글이 없어 항상 false였음.
    // 필수 필드가 모두 입력되었다면 사용자가 환산 보조 사용 의사를 표명한 것으로 간주.
    ...((primary.inheritanceAssetKind === "house_individual" || primary.inheritanceAssetKind === "house_apart") &&
    primary.acquisitionCause === "inheritance" &&
    parseFloat(primary.inhHouseValLandArea) > 0 &&
    parseAmount(primary.inhHouseValLandPricePerSqmAtTransfer) > 0 &&
    parseAmount(primary.inhHouseValLandPricePerSqmAtFirst) > 0 &&
    parseAmount(primary.inhHouseValHousePriceAtFirst) > 0
      ? (() => {
          const inheritanceDate = primary.inheritanceStartDate || primary.acquisitionDate || "";
          const isBefore1990 = !!inheritanceDate && inheritanceDate < "1990-08-30";
          const buildGrade = (raw: string) => {
            const n = Number(raw.replace(/,/g, ""));
            if (!Number.isFinite(n) || n <= 0) return undefined;
            return primary.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
          };

          const pre1990Payload = isBefore1990
            ? (() => {
                const gCur = buildGrade(primary.pre1990Grade_current ?? "");
                const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
                const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
                const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
                if (!gCur || !gPrev || !gAcq || p1990 <= 0) return undefined;
                return { grade_1990_0830: gCur, gradePrev_1990_0830: gPrev, gradeAtAcquisition: gAcq, pricePerSqm_1990: p1990 };
              })()
            : undefined;

          const landPriceAtInheritance = parseAmount(primary.inhHouseValLandPricePerSqmAtInheritance);

          // 1990 이전이면 pre1990 필요, 이후이면 landPriceAtInheritance 필요
          if (isBefore1990 && !pre1990Payload && !landPriceAtInheritance) return {};
          if (!isBefore1990 && !landPriceAtInheritance) return {};

          return {
            inheritedHouseValuation: {
              inheritanceDate,
              transferDate: form.transferDate,
              landArea: parseFloat(primary.inhHouseValLandArea),
              landPricePerSqmAtTransfer: parseAmount(primary.inhHouseValLandPricePerSqmAtTransfer),
              landPricePerSqmAtFirstDisclosure: parseAmount(primary.inhHouseValLandPricePerSqmAtFirst),
              landPricePerSqmAtInheritance: landPriceAtInheritance || undefined,
              housePriceAtTransfer: parseAmount(primary.inhHouseValHousePriceAtTransfer) || 0,
              housePriceAtFirstDisclosure: parseAmount(primary.inhHouseValHousePriceAtFirst),
              buildingStdPriceAtTransfer: parseAmount(primary.inhHouseValBuildingStdPriceAtTransfer) || undefined,
              buildingStdPriceAtFirstDisclosure: parseAmount(primary.inhHouseValBuildingStdPriceAtFirst) || undefined,
              buildingStdPriceAtInheritance: parseAmount(primary.inhHouseValBuildingStdPriceAtInheritance) || undefined,
              housePriceAtInheritanceOverride: primary.inhHouseValUseHousePriceOverride
                ? (parseAmount(primary.inhHouseValHousePriceAtInheritanceOverride) || undefined)
                : undefined,
              firstDisclosureDate: primary.inhHouseValFirstDisclosureDate || "2005-04-30",
              pre1990: pre1990Payload,
            },
          };
        })()
      : {}),
    // ── 1990.8.30. 이전 취득 토지 기준시가 환산 (자산-수준 필드 사용) ──
    ...(hasPre1990
      ? (() => {
          const buildGrade = (raw: string) => {
            const n = Number(raw.replace(/,/g, ""));
            if (!Number.isFinite(n) || n <= 0) return undefined;
            return primary.pre1990GradeMode === "number"
              ? Math.trunc(n)
              : { gradeValue: n };
          };
          const gCur = buildGrade(primary.pre1990Grade_current ?? "");
          const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
          const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
          const areaSqm = parseFloat((primary.acquisitionArea ?? "").replace(/,/g, "")) || 0;
          const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
          const pTsf = parseAmount(primary.pre1990PricePerSqm_atTransfer ?? "");
          if (!gCur || !gPrev || !gAcq || areaSqm <= 0 || p1990 <= 0 || pTsf <= 0) return {};
          return {
            pre1990Land: {
              acquisitionDate: primary.acquisitionDate,
              transferDate: form.transferDate,
              areaSqm,
              pricePerSqm_1990: p1990,
              pricePerSqm_atTransfer: pTsf,
              grade_1990_0830: gCur,
              gradePrev_1990_0830: gPrev,
              gradeAtAcquisition: gAcq,
            },
          };
        })()
      : {}),
    // 검용주택 분리계산 입력
    ...(mixedUsePayload ? { mixedUse: mixedUsePayload } : {}),
  };

  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    const fieldErrors = json?.error?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      // 정확한 실패 필드 파악을 위해 콘솔에 전체 출력 + 첫 항목을 메시지에 첨부
      // (zod 검증 실패 시 어느 필드가 문제인지 사용자/개발자가 즉시 확인 가능)
      console.error("[transfer-tax API] fieldErrors:", fieldErrors);
      const firstField = Object.keys(fieldErrors)[0];
      const firstMsg = fieldErrors[firstField]?.[0] ?? "";
      throw new Error(`${msg} (${firstField}: ${firstMsg})`);
    }
    throw new Error(msg);
  }
  return json.data as TransferAPIResult;
}
