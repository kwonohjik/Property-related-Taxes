/**
 * 다건 양도소득세 계산 API 호출
 * MultiTransferFormData → POST /api/calc/transfer/multi → AggregateTransferResult
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sumResidenceMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { toEngineReductions, toRentalHousingExceptionApi, buildPre1990LandPayload, buildRightThreeYearExceptionPayload, buildMergedHouseholdFirstHousePayload } from "@/lib/calc/transfer-tax-api-helpers";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-helpers";
import { applyRatio } from "@/lib/calc/transfer-tax-api-helpers";
import { makeRatioed } from "@/lib/calc/transfer-tax-api-split";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { computeAutoPriorPaid } from "@/lib/calc/multi-prior-filed";
import { deriveHouseRegionFromCode } from "@/lib/calc/house-region";
import { buildSameAdjustmentPeriodInput } from "./transfer-same-adjustment-period-input";

import { isHousingLike } from "./housing-like-asset";
import { buildPresaleRightsPayload } from "./presale-rights-payload";

/** TransferFormData → API 전송용 건별 payload 변환 (단건 API 로직 재사용) */
export function buildPropertyPayload(form: TransferFormData) {
  const primary = form.assets?.[0];
  const reductions = toEngineReductions(primary?.reductions ?? [], primary?.acquisitionCause ?? "purchase", primary?.expropriationNoticeDate);
  const primaryKind = primary?.assetKind ?? "";

  // ⑬ 1990.8.30. 이전 취득 토지 기준시가 환산 — 단건과 동일 게이트·공용 헬퍼.
  // pre1990은 useEstimatedAcquisition=true를 선행 조건으로 하므로 위 isEstimated 경로가
  // acquisitionPrice·expenses=0·standardPriceAt{Acq,Transfer} 전송을 이미 담당한다(무변경).
  const hasPre1990 = (primary?.pre1990Enabled ?? false) && primaryKind === "land";

  // ④⑬ 비사업용 토지 정밀판정 raw 페이로드 (단건 API와 동일 공용 빌더 — drift 차단)
  const nblRaw = primary ? buildNonBusinessLandRaw(primary, form.transferDate) : undefined;

  // ⑬ 세대 보유 분양권·입주권 — 단건과 **같은 leaf**(P1-02).
  //    다건 마법사는 단건 Step4를 그대로 임베드해 화면에는 이 위젯이 뜨는데, 종전 ⑬은 이 키를
  //    아예 만들지 않아 §104⑦2호·4호 판정이 조용히 빠졌다(실측 79,750,000원 과소).
  const presaleRightsPayload = primary
    ? buildPresaleRightsPayload(primary.assetKind, form.presaleRights)
    : undefined;

  const housesPayload =
    isHousingLike(primaryKind) && form.houses.length > 0
      ? [
          {
            id: "selling",
            // 양도 물건 regionCode에서 자동 파생 (수동 선택 폐지)
            region: deriveHouseRegionFromCode(primary?.regionCode),
            regionCode: primary?.regionCode || undefined,
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
              // ④' 법정동 10자리 — 단건과 동일 배선 (length(10) 가드 · Zod 400 회피)
              regionCode: h.regionCode?.length === 10 ? h.regionCode : undefined,
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
  const isSalesCase = primary?.isSalesCaseAcquisition === true;
  const isAppraisal = !isSalesCase && primary?.isAppraisalAcquisition === true;
  const isEstimated = !isSalesCase && !isAppraisal && (primary?.useEstimatedAcquisition ?? false);
  const acquisitionCause = primary?.acquisitionCause ?? "purchase";

  // ④⑬ 공유 지분율 — 폼 입력은 100% 기준이고 API 변환이 × ratio를 적용한다
  // (`OwnershipRatioInput.tsx` 규약 · 단건 정본 `transfer-tax-api.ts:198-206`).
  // 단독 소유(100/100)면 ratio=1.0·fractional=false라 아래 전 필드가 무변경(no-op)이다.
  const primaryRatio = primary ? getOwnershipRatio(primary) : 1.0;
  const primaryFractional = primaryRatio < 1.0;
  // 추계 가액(감정가·매매사례가액) 전용 스케일 적용기 — 단건과 동일(`transfer-tax-api.ts:201`).
  const ratioed = makeRatioed(primaryRatio, primaryFractional);

  // §97② 단서 swap 분리 입력 — 단건과 동일: 두 필드 중 하나라도 입력되면 분리 전송.
  const capEx = primaryFractional
    ? applyRatio(parseAmount(primary?.capitalExpenditure ?? ""), primaryRatio)
    : parseAmount(primary?.capitalExpenditure ?? "");
  const directTransferExpense = parseAmount(primary?.transferExpense ?? "");
  const formTotalTransferExpense = parseAmount(form.totalTransferExpense ?? "");
  // 양도비 안분 — 단건 primary 규약(`transfer-tax-api.ts:210-219`)을 그대로 따른다.
  //   1) 자산-수준 직접 입력(>0): 지분 모드면 × ratio
  //   2) 지분 모드 + 폼-수준 총 양도비: × ratio
  //   3) 단독 모드: 폼-수준 값을 그대로 (현행 다건 동작 유지)
  const effectiveTransferExpense =
    directTransferExpense > 0
      ? primaryFractional
        ? applyRatio(directTransferExpense, primaryRatio)
        : directTransferExpense
      : primaryFractional && formTotalTransferExpense > 0
        ? applyRatio(formTotalTransferExpense, primaryRatio)
        : formTotalTransferExpense;

  // ⑬ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 토글 OFF 시 undefined, body에서 제외
  const rhPayload = primary ? toRentalHousingExceptionApi(primary) : undefined;

  // 주의: 부담부증여·재개발(§166)·겸용주택·이월과세(§97의2)·일반건물/상업용 환산·PHD(§164⑤)·
  // 다필지·토지/건물 분리·가업상속(§97의2④)·건별 다자산(companion)은 다건 합산 route(⑭)가
  // 매핑하지 않으므로 여기서 전송하지 않는다 — validateMultiSupportedMode에서 명시 차단.
  // (1990 환산은 route ⑭·엔진이 지원 — 아래 pre1990Land spread로 전송.)
  return {
    propertyType: primaryKind,
    transferPrice: primaryFractional
      ? applyRatio(parseAmount(form.contractTotalPrice), primaryRatio)
      : parseAmount(form.contractTotalPrice),
    /** ⑬ 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미전송) */
    totalPropertyTransferPrice: primaryFractional
      ? parseAmount(form.contractTotalPrice)
      : undefined,
    transferDate: form.transferDate,
    // 상속: (b) 취득가액 소스 단일화 — fixedAcquisitionPrice(현행 직접입력) 우선, 없으면 publishedValueAtInheritance(신고가액).
    // 통합 UI(P2b)가 상속 fixedAcq 입력을 제거하면 publishedValue로 자동 전환(과도기 fallback, mirror-pattern 3중).
    acquisitionPrice: (() => {
      if (isEstimated || isAppraisal || isSalesCase) return 0;
      const raw =
        acquisitionCause === "inheritance"
          ? parseAmount(primary?.fixedAcquisitionPrice ?? "0") ||
            parseAmount(primary?.publishedValueAtInheritance ?? "0")
          : parseAmount(primary?.fixedAcquisitionPrice ?? "0");
      return primaryFractional ? applyRatio(raw, primaryRatio) : raw;
    })(),
    acquisitionDate: primary?.acquisitionDate ?? "",
    // 자산-수준 매매계약일 — §99의3 등 매매계약일 기준 조문 시한 판정용
    assetContractDate: primary?.assetContractDate || undefined,
    expenses: (isEstimated || isAppraisal || isSalesCase)
      ? 0
      : primaryFractional
        ? applyRatio(parseAmount(primary?.directExpenses ?? "0"), primaryRatio)
        : parseAmount(primary?.directExpenses ?? "0"),
    // §97② 단서 swap — 둘 다 0이면 undefined로 보내 swap 비활성 (단건과 동일 게이트)
    capitalExpenditure: (capEx || effectiveTransferExpense) ? capEx : undefined,
    transferExpense: (capEx || effectiveTransferExpense) ? (effectiveTransferExpense || undefined) : undefined,
    useEstimatedAcquisition: isSalesCase ? false : isEstimated,
    standardPriceAtAcquisition: isEstimated ? parseAmount(primary?.standardPriceAtAcq ?? "") : undefined,
    standardPriceAtTransfer: isEstimated ? parseAmount(primary?.standardPriceAtTransfer ?? "") : undefined,
    // ⑬ §164⑧ 동일조정기간 환산 — 단건과 같은 빌더(단일 소스)
    sameAdjustmentPeriod: buildSameAdjustmentPeriodInput(primary),
    acquisitionMethod: isSalesCase ? "salesCase" : isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual",
    // 개산공제(§163⑥) base 축소용 지분율 — 금액 필드와 달리 **기준시가는 raw 100% 유지**하고
    // 엔진이 개산공제 지점에서만 적용한다(단건 정본 `transfer-tax-api.ts:205-207`).
    ownershipRatio: primaryFractional ? primaryRatio : undefined,
    // 감정가 모드 — 단건과 동일하게 자산 카드의 취득가 입력란(fixedAcquisitionPrice)이 감정가.
    // 감정·매매사례는 acquisitionPrice가 0이고 이 값이 취득가액이 되므로 총액과 같은 지분 스케일이 필요하다.
    appraisalValue: isAppraisal ? (ratioed(primary?.fixedAcquisitionPrice) ?? 0) : undefined,
    // ④⑬ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달
    similarSalesValue: isSalesCase ? ratioed(primary?.similarSalesValue) : undefined,
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
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      acquisitionCause === "inheritance"
        ? primary?.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      acquisitionCause === "inheritance" && primary?.decedentCohabitationHoldingStartDate
        ? primary.decedentCohabitationHoldingStartDate
        : undefined,
    decedentCohabitationResidenceMonths:
      acquisitionCause === "inheritance" && primary?.decedentSameHouseholdBeforeInheritance
        ? parseInt(primary.decedentCohabitationResidenceMonths) || 0
        : undefined,
    donorAcquisitionDate:
      acquisitionCause === "gift" && primary?.donorAcquisitionDate
        ? primary.donorAcquisitionDate
        : undefined,
    isOneHousehold: form.isOneHousehold,
    reductions,
    // ⑬ §155⑤ 일시적 2주택(§155⑯⑱ 포함) · §155⑧ 수도권 밖 부득이 · §155⑦ 농어촌주택 —
    //    단건과 **같은 빌더**를 쓴다. 종전에는 일시적 2주택 두 날짜만 인라인 전송해
    //    §155⑯·⑱ 4필드와 §155⑦·⑧ 블록이 통째로 누락됐다(다건 Step4는 단건 Step4를 그대로 임베드하므로
    //    화면에는 토글이 보인다).
    ...(primary ? buildHouseholdSpecialPayload(form, primary) : {}),
    // ⑬ §155④⑤ 합가 후 첫 양도 — 엔진 비과세 게이트가 `=== true`를 요구한다(transfer-tax-exemption.ts).
    //    marriageMerge·parentalCareMerge만 보내고 이 플래그를 빠뜨리면 특례가 조용히 미발동한다.
    ...(form.isFirstTransferredInMerge ? { isFirstTransferredInMerge: true } : {}),
    // ⑬ §156의2⑥·⑦ · §156의3④·⑤ 상속 권리 예외 축 — 단건과 같은 키(다건만 빠지면 침묵 소실)
    ...(form.generalHouseGiftedFromDecedentWithin2yr
      ? { generalHouseGiftedFromDecedentWithin2yr: true }
      : {}),
    ...(form.generalHouseHeldAtInheritance ? { generalHouseHeldAtInheritance: true } : {}),
    ...(form.inheritedRightChoiceWhenBothHeld
      ? { inheritedRightChoiceWhenBothHeld: form.inheritedRightChoiceWhenBothHeld }
      : {}),
    ...(nblRaw ? { nonBusinessLandRaw: nblRaw } : {}),
    // ⑬ 1990.8.30. 이전 취득 토지 환산 (route ⑭·엔진 STEP 0.4 지원) — 단건과 공용 헬퍼
    ...(hasPre1990 && primary ? buildPre1990LandPayload(primary, form.transferDate) : {}),
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    ...(presaleRightsPayload ? { presaleRights: presaleRightsPayload } : {}),
    /**
     * ⑬ §89② 3년 초과 예외 — 단건과 **같은 leaf**를 쓴다.
     * 이 키가 다건에만 빠지면 「화면에는 선언했는데 엔진엔 없다」가 된다 —
     * `presaleRights`가 정확히 그렇게 침묵 소실됐던 전례가 있다(P1-02).
     */
    ...buildRightThreeYearExceptionPayload(form),
    ...buildMergedHouseholdFirstHousePayload(form),
    // ⑬ 다주택 중과 한시 유예/경과조치 — houses 제공 시에만 엔진이 소비 (단건 callTransferTaxAPI와 동일 게이트).
    // 다건은 자산별 form이라 gracePeriod도 native per-property.
    ...(housesPayload && form.gracePeriod ? { gracePeriod: form.gracePeriod } : {}),
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
    ...(form.provisoReason
      ? {
          oneHouseExemptionProviso: {
            reason: form.provisoReason,
            ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
            ...(form.provisoExpropriationDate ? { expropriationDate: form.provisoExpropriationDate } : {}),
            ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: form.provisoBusinessApprovalDate } : {}),
          },
        }
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

  // 확정신고 기납부세액 정산 (§111③) — 미편집 시 신고일 필터 자동 파생(computeAutoPriorPaid),
  // 사용자 편집(priorPaidTaxEdited) 시 입력값 우선. 엔진 입력 = 필터값 → settlement·신고서 정합.
  const autoPriorPaid = computeAutoPriorPaid(properties);
  const priorPaidTax = multiForm.priorPaidTaxEdited
    ? parseAmount(multiForm.priorPaidTax ?? "0")
    : autoPriorPaid.national;
  const priorPaidLocalTax = multiForm.priorPaidTaxEdited
    ? parseAmount(multiForm.priorPaidLocalTax ?? "0")
    : autoPriorPaid.local;

  const body: Record<string, unknown> = {
    taxYear: multiForm.taxYear,
    properties: propertiesPayload,
    annualBasicDeductionUsed: parseAmount(multiForm.annualBasicDeductionUsed),
    basicDeductionAllocation: multiForm.basicDeductionAllocation,
    priorPaidTax,
    priorPaidLocalTax,
    // ⑬ §133 5년 누적 한도 — 인별 이력 (TypeScript 미감지 영역, 누락 시 침묵 stripping)
    priorReductionUsage: mergePriorReductionUsage(properties),
    // [B3] 신고서 단위 수정신고·경정청구 — 단건 payload(transfer-tax-api.ts:528)와 동형.
    ...(multiForm.amendmentMode
      ? {
          amendment: {
            correctionKind: multiForm.correctionKind,
            originalDeterminedTax: parseAmount(multiForm.originalDeterminedTax),
            // [F6] 경정청구(refund)는 가산세 없음 → 플래그 강제 false(stale 누출 차단)
            applyUnderReportingPenalty:
              multiForm.correctionKind === "refund_claim" ? false : multiForm.applyUnderReportingPenalty,
            underReportingReason: multiForm.underReportingReason,
            underReductionMode: multiForm.underReductionMode,
            ...(multiForm.statutoryFilingDeadline
              ? { statutoryFilingDeadline: multiForm.statutoryFilingDeadline }
              : {}),
            ...(multiForm.amendedFilingDate ? { amendedFilingDate: multiForm.amendedFilingDate } : {}),
            priorAssessmentNotified: multiForm.priorAssessmentNotified,
            applyLatePaymentPenalty:
              multiForm.correctionKind === "refund_claim" ? false : multiForm.applyLatePaymentPenalty,
            ...(multiForm.amendedPaymentDate ? { amendedPaymentDate: multiForm.amendedPaymentDate } : {}),
            ...(multiForm.correctionKind === "refund_claim"
              ? { claimReasonType: multiForm.claimReasonType }
              : {}),
            ...(multiForm.posteriorEventDate ? { posteriorEventDate: multiForm.posteriorEventDate } : {}),
          },
        }
      : {}),
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
