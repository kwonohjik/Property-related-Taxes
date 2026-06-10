/**
 * 다건 양도소득세 계산 API 호출
 * MultiTransferFormData → POST /api/calc/transfer/multi → AggregateTransferResult
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sumResidenceMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { toEngineReductions, toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-helpers";

const isHousingLike = (pt: string) =>
  pt === "housing" || pt === "right_to_move_in" || pt === "presale_right";

/** TransferFormData → API 전송용 건별 payload 변환 (단건 API 로직 재사용) */
export function buildPropertyPayload(form: TransferFormData) {
  const primary = form.assets?.[0];
  const reductions = toEngineReductions(primary?.reductions ?? [], primary?.acquisitionCause ?? "purchase");
  const primaryKind = primary?.assetKind ?? "";

  // v1.2: form.nbl* → primary.nbl* (asset 단위 읽기)
  const nblDetails =
    primaryKind === "land" &&
    primary?.nblLandType &&
    primary?.nblZoneType &&
    primary?.acquisitionArea
      ? {
          landType: primary.nblLandType,
          landArea: parseFloat(primary.acquisitionArea),
          zoneType: primary.nblZoneType,
          acquisitionDate: primary.acquisitionDate ?? "",
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

  // 취득가 산정방식은 자산-수준 플래그에서 도출 (단건 callTransferTaxAPI와 동일 규칙).
  // 폼-전역 form.acquisitionMethod / form.appraisalValue 는 deprecated — 더 이상 사용하지 않음.
  const isAppraisal = primary?.isAppraisalAcquisition === true;
  const isEstimated = !isAppraisal && (primary?.useEstimatedAcquisition ?? false);
  const acquisitionCause = primary?.acquisitionCause ?? "purchase";

  // §97② 단서 swap 분리 입력 — 단건과 동일: 두 필드 중 하나라도 입력되면 분리 전송.
  const capEx = parseAmount(primary?.capitalExpenditure ?? "");
  const directTransferExpense = parseAmount(primary?.transferExpense ?? "");
  const formTotalTransferExpense = parseAmount(form.totalTransferExpense ?? "");
  const effectiveTransferExpense = directTransferExpense > 0 ? directTransferExpense : formTotalTransferExpense;

  // ⑬ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 토글 OFF 시 undefined, body에서 제외
  const rhPayload = primary ? toRentalHousingExceptionApi(primary) : undefined;

  // 주의: 부담부증여·재개발(§166)·겸용주택·이월과세(§97의2)·일반건물/상업용 환산·PHD(§164⑤)·
  // 1990 환산·다필지·토지/건물 분리·가업상속(§97의2④)·건별 다자산(companion)은 다건 합산
  // route(⑭)가 매핑하지 않으므로 여기서 전송하지 않는다 — validateMultiSupportedModes에서 명시 차단.
  return {
    propertyType: primaryKind,
    transferPrice: parseAmount(form.contractTotalPrice),
    transferDate: form.transferDate,
    acquisitionPrice: (isEstimated || isAppraisal) ? 0 : parseAmount(primary?.fixedAcquisitionPrice ?? "0"),
    acquisitionDate: primary?.acquisitionDate ?? "",
    // 자산-수준 매매계약일 — §99의3 등 매매계약일 기준 조문 시한 판정용
    assetContractDate: primary?.assetContractDate || undefined,
    expenses: (isEstimated || isAppraisal) ? 0 : parseAmount(primary?.directExpenses ?? "0"),
    // §97② 단서 swap — 둘 다 0이면 undefined로 보내 swap 비활성 (단건과 동일 게이트)
    capitalExpenditure: (capEx || effectiveTransferExpense) ? capEx : undefined,
    transferExpense: (capEx || effectiveTransferExpense) ? (effectiveTransferExpense || undefined) : undefined,
    useEstimatedAcquisition: isEstimated,
    standardPriceAtAcquisition: isEstimated ? parseAmount(primary?.standardPriceAtAcq ?? "") : undefined,
    standardPriceAtTransfer: isEstimated ? parseAmount(primary?.standardPriceAtTransfer ?? "") : undefined,
    acquisitionMethod: isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual",
    // 감정가 모드 — 단건과 동일하게 자산 카드의 취득가 입력란(fixedAcquisitionPrice)이 감정가
    appraisalValue: isAppraisal ? parseAmount(primary?.fixedAcquisitionPrice ?? "0") : undefined,
    isSelfBuilt: primary?.isSelfBuilt || undefined,
    buildingType: primary?.buildingType || undefined,
    constructionDate: primary?.isSelfBuilt && primary?.constructionDate ? primary.constructionDate : undefined,
    extensionFloorArea:
      primary?.buildingType === "extension" && primary?.extensionFloorArea
        ? parseFloat(primary.extensionFloorArea)
        : undefined,
    householdHousingCount: parseInt(form.householdHousingCount) || 0,
    // §89①4호 가목 1세대1입주권 — 조합원입주권 수 (단건과 동일 fallback "0")
    householdRightCount: parseInt(form.householdRightCount ?? "0") || 0,
    // 거주기간 — interval 모드면 자산 구간 합산 (단건과 동일 규칙)
    residencePeriodMonths:
      primary?.residenceInputMode === "interval" && (primary?.residencePeriods?.length ?? 0) > 0
        ? sumResidenceMonths(primary.residencePeriods, form.transferDate)
        : parseInt(primary?.residencePeriodMonthsAsset || form.residencePeriodMonths) || 0,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    isUnregistered: form.isUnregistered,
    isNonBusinessLand: primary?.isNonBusinessLand ?? false,
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
    // ⑬ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 다건 route(⑭)가 매핑하는 지원 모드
    ...(rhPayload ? { rentalHousingException: rhPayload } : {}),
  };
}

/**
 * §133 5년 이력 — 다건 top-level 합성.
 *
 * 인별(동일 납세자) 이력이지만 다건 자산 편집은 단건 마법사(Step5)를 재사용하므로
 * 각 건의 form.priorReductionUsage에 분산 입력될 수 있다. 동일 항목(연도·유형·금액)이
 * 여러 건에 중복 입력된 경우는 같은 이력의 재입력으로 보고 1건으로 dedup하여 합성한다.
 */
export function mergePriorReductionUsage(
  properties: PropertyItem[],
): { year: number; type: string; amount: number }[] {
  const seen = new Set<string>();
  const merged: { year: number; type: string; amount: number }[] = [];
  for (const p of properties) {
    for (const r of p.form.priorReductionUsage ?? []) {
      const key = `${r.year}:${r.type}:${r.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ year: r.year, type: r.type, amount: r.amount });
    }
  }
  return merged;
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
    // ⑬ §133 5년 누적 한도 — 인별 이력 (TypeScript 미감지 영역, 누락 시 침묵 stripping)
    priorReductionUsage: mergePriorReductionUsage(properties),
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
