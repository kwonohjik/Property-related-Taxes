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

export type SingleTransferResult = { mode: "single"; result: TransferTaxResult };
export type BundledTransferResult = {
  mode: "bundled";
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
};
export type TransferAPIResult = SingleTransferResult | BundledTransferResult;

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

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "auto"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: asset.inheritanceAssetKind,
          landAreaM2: asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined,
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

  // ── 비사업용 토지 상세 ──
  const nblDetails =
    primary.assetKind === "land" && form.nblLandType && form.nblLandArea && form.nblZoneType
      ? {
          landType: form.nblLandType,
          landArea: parseFloat(form.nblLandArea),
          zoneType: form.nblZoneType,
          acquisitionDate: primary.acquisitionDate,
          transferDate: form.transferDate,
          farmingSelf: form.nblFarmingSelf || undefined,
          farmerResidenceDistance: form.nblFarmerResidenceDistance
            ? parseFloat(form.nblFarmerResidenceDistance)
            : undefined,
          businessUsePeriods: form.nblBusinessUsePeriods.filter(
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

  const isEstimated = form.acquisitionMethod === "estimated" || primary.useEstimatedAcquisition;
  const isAppraisal = form.acquisitionMethod === "appraisal";
  const hasPre1990 = form.pre1990Enabled && primary.assetKind === "land";
  const parcelModeActive =
    primary.parcelMode && primary.assetKind === "land" && (primary.parcels?.length ?? 0) > 0;
  const firstParcelAcqDate = parcelModeActive
    ? (primary.parcels[0]?.acquisitionDate || form.transferDate)
    : primary.acquisitionDate;

  const body = {
    propertyType: primary.assetKind,
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
    useEstimatedAcquisition: hasPre1990 || parcelModeActive ? false : isEstimated,
    standardPriceAtAcquisition: hasPre1990
      ? undefined
      : isEstimated
        ? parseAmount(primary.standardPriceAtAcq)
        : undefined,
    standardPriceAtTransfer: hasPre1990
      ? undefined
      : isEstimated
        ? parseAmount(primary.standardPriceAtTransfer)
        : undefined,
    acquisitionMethod: hasPre1990
      ? ("actual" as const)
      : (form.acquisitionMethod || "actual"),
    appraisalValue: isAppraisal ? parseAmount(form.appraisalValue) : undefined,
    isSelfBuilt: form.isSelfBuilt || undefined,
    buildingType: form.buildingType || undefined,
    constructionDate:
      form.isSelfBuilt && form.constructionDate ? form.constructionDate : undefined,
    extensionFloorArea:
      form.buildingType === "extension" && form.extensionFloorArea
        ? parseFloat(form.extensionFloorArea)
        : undefined,
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    residencePeriodMonths: parseInt(form.residencePeriodMonths) || 0,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    isUnregistered: form.isUnregistered,
    isNonBusinessLand: form.isNonBusinessLand,
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
    // ── 1990.8.30. 이전 취득 토지 기준시가 환산 ──
    ...(hasPre1990
      ? (() => {
          const buildGrade = (raw: string) => {
            const n = Number(raw.replace(/,/g, ""));
            if (!Number.isFinite(n) || n <= 0) return undefined;
            return form.pre1990GradeMode === "number"
              ? Math.trunc(n)
              : { gradeValue: n };
          };
          const gCur = buildGrade(form.pre1990Grade_current);
          const gPrev = buildGrade(form.pre1990Grade_prev);
          const gAcq = buildGrade(form.pre1990Grade_atAcq);
          const areaSqm = parseFloat((primary.acquisitionArea ?? "").replace(/,/g, "")) || 0;
          const p1990 = parseAmount(form.pre1990PricePerSqm_1990);
          const pTsf = parseAmount(form.pre1990PricePerSqm_atTransfer);
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
  };

  const res = await fetch("/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    throw new Error(msg);
  }
  return json.data as TransferAPIResult;
}
