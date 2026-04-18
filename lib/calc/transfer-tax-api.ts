/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData → POST /api/calc/transfer → TransferTaxResult
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

const isHousingLike = (pt: string) =>
  pt === "housing" || pt === "right_to_move_in" || pt === "presale_right";

export async function callTransferTaxAPI(form: TransferFormData): Promise<TransferTaxResult> {
  const reductions = [];
  if (form.reductionType === "self_farming") {
    reductions.push({ type: "self_farming", farmingYears: parseInt(form.farmingYears) });
  } else if (form.reductionType === "long_term_rental") {
    reductions.push({
      type: "long_term_rental",
      rentalYears: parseInt(form.rentalYears),
      rentIncreaseRate: parseFloat(form.rentIncreaseRate) / 100,
    });
  } else if (form.reductionType === "new_housing") {
    // outside_overconcentration은 simple 경로에서 metropolitan으로 폴백 (V2 newHousingDetails가 없는 경우)
    const simpleRegion =
      form.reductionRegion === "outside_overconcentration"
        ? "metropolitan"
        : (form.reductionRegion as "metropolitan" | "non_metropolitan");
    reductions.push({ type: "new_housing", region: simpleRegion });
  } else if (form.reductionType === "unsold_housing") {
    const simpleRegion =
      form.reductionRegion === "outside_overconcentration"
        ? "metropolitan"
        : (form.reductionRegion as "metropolitan" | "non_metropolitan");
    reductions.push({ type: "unsold_housing", region: simpleRegion });
  }

  // P0-A: 비사업용 토지 상세 정보 구성
  const nblDetails =
    form.propertyType === "land" && form.nblLandType && form.nblLandArea && form.nblZoneType
      ? {
          landType: form.nblLandType,
          landArea: parseFloat(form.nblLandArea),
          zoneType: form.nblZoneType,
          acquisitionDate: form.acquisitionDate,
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

  // P0-B: 다른 보유 주택 목록 구성 (현재 양도 주택을 포함한 전체 배열 생성)
  const housesPayload =
    isHousingLike(form.propertyType) && form.houses.length > 0
      ? [
          // 현재 양도 주택 (ID: "selling")
          // [C4] region: isRegulatedArea(조정대상지역) 대신 sellingHouseRegion(수도권/지방) 사용
          // [C5] officialPrice: standardPriceAtTransfer(양도시 기준시가) 사용
          {
            id: "selling",
            region: form.sellingHouseRegion,
            acquisitionDate: form.acquisitionDate,
            officialPrice: form.standardPriceAtTransfer
              ? parseAmount(form.standardPriceAtTransfer)
              : 0,
            isInherited: false,
            isLongTermRental: false,
            isApartment: false,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
          // 다른 보유 주택들
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

  const isEstimated = form.acquisitionMethod === "estimated" || form.useEstimatedAcquisition;
  const isAppraisal = form.acquisitionMethod === "appraisal";

  const body = {
    propertyType: form.propertyType,
    transferPrice: parseAmount(form.transferPrice),
    transferDate: form.transferDate,
    acquisitionPrice: (isEstimated || isAppraisal) ? 0 : parseAmount(form.acquisitionPrice),
    acquisitionDate: form.acquisitionDate,
    expenses: (isEstimated || isAppraisal) ? 0 : parseAmount(form.expenses),
    useEstimatedAcquisition: isEstimated,
    standardPriceAtAcquisition: isEstimated
      ? parseAmount(form.standardPriceAtAcquisition)
      : undefined,
    standardPriceAtTransfer: isEstimated
      ? parseAmount(form.standardPriceAtTransfer)
      : undefined,
    acquisitionMethod: form.acquisitionMethod || "actual",
    appraisalValue: isAppraisal ? parseAmount(form.appraisalValue) : undefined,
    isSelfBuilt: form.isSelfBuilt || undefined,
    buildingType: form.buildingType || undefined,
    constructionDate: form.isSelfBuilt && form.constructionDate ? form.constructionDate : undefined,
    extensionFloorArea: form.buildingType === "extension" && form.extensionFloorArea
      ? parseFloat(form.extensionFloorArea)
      : undefined,
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    residencePeriodMonths: parseInt(form.residencePeriodMonths) || 0,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    isUnregistered: form.isUnregistered,
    isNonBusinessLand: form.isNonBusinessLand,
    isSuccessorRightToMoveIn:
      form.propertyType === "right_to_move_in" ? form.isSuccessorRightToMoveIn : undefined,
    acquisitionCause: form.acquisitionCause,
    decedentAcquisitionDate:
      form.acquisitionCause === "inheritance" && form.decedentAcquisitionDate
        ? form.decedentAcquisitionDate
        : undefined,
    donorAcquisitionDate:
      form.acquisitionCause === "gift" && form.donorAcquisitionDate
        ? form.donorAcquisitionDate
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
    // 가산세 (enablePenalty 토글 시만 포함)
    ...(form.enablePenalty && form.filingType !== "correct"
      ? {
          filingPenaltyDetails: {
            // determinedTax·reductionAmount는 API route에서 계산 결과로 주입됨
            // 여기서는 UI 입력값만 전달, API route에서 결정세액 연동
            determinedTax: 0, // placeholder — route에서 실제값으로 교체
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
    // delayedPaymentDetails — unpaidTax === 0이면 route에서 결정세액으로 자동 주입.
    ...(form.enablePenalty && form.paymentDeadline
      ? {
          delayedPaymentDetails: {
            unpaidTax: parseAmount(form.unpaidTax),
            paymentDeadline: form.paymentDeadline,
            actualPaymentDate: form.actualPaymentDate || undefined,
          },
        }
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
  return json.data as TransferTaxResult;
}
