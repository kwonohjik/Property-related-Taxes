/**
 * 다건 양도소득세 계산 API 호출
 * MultiTransferFormData → POST /api/calc/transfer/multi → AggregateTransferResult
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api";

const isHousingLike = (pt: string) =>
  pt === "housing" || pt === "right_to_move_in" || pt === "presale_right";

/** TransferFormData → API 전송용 건별 payload 변환 (단건 API 로직 재사용) */
export function buildPropertyPayload(form: TransferFormData) {
  const primary = form.assets?.[0];
  const reductions = toEngineReductions(primary?.reductions ?? [], primary?.acquisitionCause ?? "purchase");
  const primaryKind = primary?.assetKind ?? "";

  const nblDetails =
    primaryKind === "land" && form.nblLandType && form.nblLandArea && form.nblZoneType
      ? {
          landType: form.nblLandType,
          landArea: parseFloat(form.nblLandArea),
          zoneType: form.nblZoneType,
          acquisitionDate: primary?.acquisitionDate ?? "",
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

  const housesPayload =
    isHousingLike(primaryKind) && form.houses.length > 0
      ? [
          {
            id: "selling",
            region: form.sellingHouseRegion,
            acquisitionDate: primary?.acquisitionDate ?? "",
            officialPrice: primary?.standardPriceAtTransfer
              ? parseAmount(primary.standardPriceAtTransfer)
              : 0,
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

  const isEstimated = form.acquisitionMethod === "estimated" || (primary?.useEstimatedAcquisition ?? false);
  const isAppraisal = form.acquisitionMethod === "appraisal";
  const acquisitionCause = primary?.acquisitionCause ?? "purchase";

  return {
    propertyType: primaryKind,
    transferPrice: parseAmount(form.contractTotalPrice),
    transferDate: form.transferDate,
    acquisitionPrice: (isEstimated || isAppraisal) ? 0 : parseAmount(primary?.fixedAcquisitionPrice ?? "0"),
    acquisitionDate: primary?.acquisitionDate ?? "",
    expenses: (isEstimated || isAppraisal) ? 0 : parseAmount(primary?.directExpenses ?? "0"),
    useEstimatedAcquisition: isEstimated,
    standardPriceAtAcquisition: isEstimated ? parseAmount(primary?.standardPriceAtAcq ?? "") : undefined,
    standardPriceAtTransfer: isEstimated ? parseAmount(primary?.standardPriceAtTransfer ?? "") : undefined,
    acquisitionMethod: form.acquisitionMethod || "actual",
    appraisalValue: isAppraisal ? parseAmount(form.appraisalValue) : undefined,
    isSelfBuilt: form.isSelfBuilt || undefined,
    buildingType: form.buildingType || undefined,
    constructionDate: form.isSelfBuilt && form.constructionDate ? form.constructionDate : undefined,
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
      primaryKind === "right_to_move_in" ? (primary?.isSuccessorRightToMoveIn ?? false) : undefined,
    acquisitionCause,
    decedentAcquisitionDate:
      acquisitionCause === "inheritance" && primary?.decedentAcquisitionDate
        ? primary.decedentAcquisitionDate
        : undefined,
    donorAcquisitionDate:
      acquisitionCause === "gift" && primary?.donorAcquisitionDate
        ? primary.donorAcquisitionDate
        : undefined,
    isOneHousehold: form.isOneHousehold,
    reductions,
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
  };
}

export async function callMultiTransferTaxAPI(
  multiForm: MultiTransferFormData,
  properties: PropertyItem[],
): Promise<AggregateTransferResult> {
  const propertiesPayload = properties.map((p) => ({
    propertyId: p.propertyId,
    propertyLabel: p.propertyLabel,
    ...buildPropertyPayload(p.form),
  }));

  const body: Record<string, unknown> = {
    taxYear: multiForm.taxYear,
    properties: propertiesPayload,
    annualBasicDeductionUsed: parseAmount(multiForm.annualBasicDeductionUsed),
    basicDeductionAllocation: multiForm.basicDeductionAllocation,
  };

  if (multiForm.enablePenalty && multiForm.filingType !== "correct") {
    body.filingPenaltyDetails = {
      determinedTax: 0,
      reductionAmount: 0,
      priorPaidTax: parseAmount(multiForm.priorPaidTax),
      originalFiledTax: parseAmount(multiForm.originalFiledTax),
      excessRefundAmount: parseAmount(multiForm.excessRefundAmount),
      interestSurcharge: parseAmount(multiForm.interestSurcharge),
      filingType: multiForm.filingType,
      penaltyReason: multiForm.penaltyReason,
    };
  }

  if (multiForm.enablePenalty && multiForm.paymentDeadline) {
    body.delayedPaymentDetails = {
      unpaidTax: parseAmount(multiForm.unpaidTax),
      paymentDeadline: multiForm.paymentDeadline,
      actualPaymentDate: multiForm.actualPaymentDate || undefined,
    };
  }

  const res = await fetch("/api/calc/transfer/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? "계산 중 오류가 발생했습니다.";
    throw new Error(msg);
  }
  return json.data as AggregateTransferResult;
}
