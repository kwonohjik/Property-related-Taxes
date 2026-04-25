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
    // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
    ...(form.enablePenalty && form.filingType !== "correct"
      ? {
          filingPenaltyDetails: {
            determinedTax: 0,
            reductionAmount: 0,
            priorPaidTax: parseAmount(form.priorPaidTax ?? "0"),
            originalFiledTax: parseAmount(form.originalFiledTax ?? "0"),
            excessRefundAmount: parseAmount(form.excessRefundAmount ?? "0"),
            interestSurcharge: parseAmount(form.interestSurcharge ?? "0"),
            filingType: form.filingType,
            penaltyReason: form.penaltyReason,
          },
        }
      : {}),
    ...(form.enablePenalty && form.paymentDeadline
      ? {
          delayedPaymentDetails: {
            unpaidTax: parseAmount(form.unpaidTax ?? "0"),
            paymentDeadline: form.paymentDeadline,
            actualPaymentDate: form.actualPaymentDate || undefined,
          },
        }
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

  const res = await fetch("/api/calc/transfer/multi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    const errPayload = json?.error;
    const baseMsg = errPayload?.message ?? "계산 중 오류가 발생했습니다.";
    const fieldErrors = errPayload?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const details = Object.entries(fieldErrors)
        .map(([path, msgs]) => `• ${humanizeFieldPath(path)}: ${msgs.join(", ")}`)
        .join("\n");
      throw new Error(`${baseMsg}\n${details}`);
    }
    throw new Error(baseMsg);
  }
  return json.data as AggregateTransferResult;
}

/** Zod 필드 경로(영문) → 사용자 친화 한글 경로 변환 */
function humanizeFieldPath(path: string): string {
  const labels: Record<string, string> = {
    properties: "양도 건",
    transferPrice: "양도가액",
    acquisitionPrice: "취득가액",
    transferDate: "양도일",
    acquisitionDate: "취득일",
    expenses: "필요경비",
    propertyType: "자산 종류",
    standardPriceAtAcquisition: "취득시 기준시가",
    standardPriceAtTransfer: "양도시 기준시가",
    useEstimatedAcquisition: "환산취득가 사용",
    householdHousingCount: "세대 주택 수",
    residencePeriodMonths: "거주기간",
    isRegulatedArea: "조정대상지역(양도시)",
    wasRegulatedAtAcquisition: "조정대상지역(취득시)",
    isOneHousehold: "1세대 여부",
    isUnregistered: "미등기 여부",
    isNonBusinessLand: "비사업용 토지",
    reductions: "감면",
    taxYear: "과세연도",
    annualBasicDeductionUsed: "연간 기사용 기본공제",
    basicDeductionAllocation: "기본공제 배분",
    filingPenaltyDetails: "신고 가산세",
    delayedPaymentDetails: "납부지연",
  };
  return path
    .split(".")
    .map((seg) => {
      if (/^\d+$/.test(seg)) return `${parseInt(seg, 10) + 1}번`;
      return labels[seg] ?? seg;
    })
    .join(" · ");
}
