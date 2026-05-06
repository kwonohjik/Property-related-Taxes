/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData (assets[] 기반) → POST /api/calc/transfer → TransferAPIResult
 *
 * Phase 1: 서버 Zod 스키마 미변경 — 클라이언트에서 기존 포맷으로 변환하여 전송.
 * assets.length === 1 → single 엔드포인트, >= 2 → bundled 엔드포인트.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { sumResidenceMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { toEngineAssetKind, isHousingLike, toEngineReductions, buildAssetPayload } from "./transfer-tax-api-helpers";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";

// ─── ④ 장기임대주택 거주주택 비과세 특례 API 변환 헬퍼 (소령 §155⑳) ───

/**
 * AssetForm.rentalHousingException → API payload 변환.
 * applyException=false 또는 rentalUnits 미입력 시 undefined 반환 (⑬ body 미포함).
 * 자동 안분 fallback 금지 — 미입력은 validate에서 차단.
 */
function toRentalHousingExceptionApi(asset: AssetForm): object | undefined {
  const rh = asset.rentalHousingException;
  if (!rh?.applyException) return undefined;
  if (!rh.rentalUnits || rh.rentalUnits.length === 0) return undefined;

  return {
    applyException: true,
    scenario: rh.scenario,
    rentalUnits: rh.rentalUnits.map((u) => ({
      // ISO datetime string (날짜만 입력된 경우 T00:00:00Z로 변환)
      registrationDate: u.registrationDate
        ? (u.registrationDate.includes('T') ? u.registrationDate : `${u.registrationDate}T00:00:00.000Z`)
        : undefined,
      rentalType: u.rentalType,
      rentalAcquisitionType: u.rentalAcquisitionType,
      isApartment: u.isApartment,
      region: u.region,
      standardPriceAtRentalStart: parseAmount(u.standardPriceAtRentalStart) || 0,
      rentalMonths: parseFloat(u.rentalMonths) || 0,
      rentalAutoTermination: u.rentalAutoTermination,
      requirementsConfirmed: u.requirementsConfirmed,
    })),
    // B 시나리오 전용 필드 — priorResidenceTransferDate는 datetime string으로 변환
    priorResidenceTransferDate: rh.priorResidenceTransferDate
      ? (rh.priorResidenceTransferDate.includes('T')
        ? rh.priorResidenceTransferDate
        : `${rh.priorResidenceTransferDate}T00:00:00.000Z`)
      : undefined,
    standardPriceAtAcquisitionForPhrp: parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "") || undefined,
    standardPriceAtPriorTransfer: parseAmount(rh.standardPriceAtPriorTransfer ?? "") || undefined,
    standardPriceAtTransferForPhrp: parseAmount(rh.standardPriceAtTransferForPhrp ?? "") || undefined,
  };
}
// 하위 호환 재수출 — 기존 import 경로 유지
export { toEngineReductions } from "./transfer-tax-api-helpers";

export type SingleTransferResult = { mode: "single"; result: TransferTaxResult };
export type BundledTransferResult = {
  mode: "bundled";
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
};
export type MixedUseTransferResult = { mode: "mixed-use"; result: MixedUseGainBreakdown };
export type TransferAPIResult = SingleTransferResult | BundledTransferResult | MixedUseTransferResult;

/** 엔진이 이해하는 3종 assetKind (right_to_move_in / presale_right → housing) */

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
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(공동주택 사례 23 등)해도 PHD 경로는 표준시가 직접 입력 불요.
  const usesPhd = primary.usePreHousingDisclosure === true;
  // 이월과세 "general" 환산 모드: donorStandardPrice*를 최상위 standardPrice*로 override.
  // PHD/APD 모드와 달리 preHousingDisclosure 없이 기준시가를 직접 입력하므로 usesPhd=false 필요.
  const isCarryoverGeneral =
    primary.acquisitionCause === "carryover_gift" &&
    primary.carryover?.useEstimatedAcquisition === true &&
    primary.carryover?.estimationMode === "general";
  const parcelModeActive =
    primary.parcelMode && primary.assetKind === "land" && (primary.parcels?.length ?? 0) > 0;
  const firstParcelAcqDate = parcelModeActive
    ? (primary.parcels[0]?.acquisitionDate || form.transferDate)
    : primary.acquisitionDate;

  // 검용주택 분리계산 payload 빌드
  const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;

  // 🚨 이슈 8: silent skip 방지 — 토글 ON & direction 미선택 시 명시적 throw
  if (isMixed && primary.hasPartialUsageChange && !primary.partialChangeDirection) {
    throw new Error("보유 중 일부 용도변경: 취득시 자산 구성을 선택하세요.");
  }

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
      commercialBuildingPrice: (() => {
        const direct = parseAmount(primary.mixedAcqCommercialBuildingPrice);
        if (direct > 0) return direct;
        // house_to_commercial Case A: PHD 전체 건물 기준시가 × (상가면적 / 전체면적) 자동 안분
        const phdBuilding = parseAmount(primary.phdBuildingStdPriceAtAcq);
        const residentialArea = parseFloat(primary.residentialFloorArea) || 0;
        const nonResidentialArea = parseFloat(primary.nonResidentialFloorArea) || 0;
        const totalFloor = residentialArea + nonResidentialArea;
        if (phdBuilding > 0 && totalFloor > 0) {
          return Math.floor(phdBuilding * nonResidentialArea / totalFloor);
        }
        return 0;
      })(),
      // PHD ① 취득시 공시지가를 섹션 2에서 직접 입력하지 않은 경우 fallback
      landPricePerSqm:
        parseAmount(primary.mixedAcqLandPricePerSqm) ||
        parseAmount(primary.phdLandPricePerSqmAtAcq) || 0,
    },
    usePreHousingDisclosure: primary.usePreHousingDisclosure,
    // PHD 페이로드는 모든 필수 필드(.positive() 제약)가 채워졌을 때만 전송.
    // 누락 시 schema의 z.number().int().positive() 검증에서 0으로 실패하기 때문.
    preHousingDisclosure: (() => {
      // 검용주택 PHD: phdLandPricePerSqm* 미설정 시 섹션 2의 mixed 값으로 fallback
      const landSqmAtAcq =
        parseAmount(primary.phdLandPricePerSqmAtAcq) ||
        parseAmount(primary.mixedAcqLandPricePerSqm);
      const landSqmAtTransfer =
        parseAmount(primary.phdLandPricePerSqmAtTransfer) ||
        parseAmount(primary.mixedTransferLandPricePerSqm);
      return primary.usePreHousingDisclosure &&
        primary.phdFirstDisclosureDate &&
        parseAmount(primary.phdFirstDisclosureHousingPrice) > 0 &&
        landSqmAtAcq > 0 &&
        parseAmount(primary.phdLandPricePerSqmAtFirst) > 0 &&
        landSqmAtTransfer > 0 &&
        (parseAmount(primary.phdTransferHousingPrice) > 0 ||
          parseAmount(primary.mixedTransferHousingPrice) > 0)
        ? {
            firstDisclosureDate: primary.phdFirstDisclosureDate,
            firstDisclosureHousingPrice: parseAmount(primary.phdFirstDisclosureHousingPrice),
            landPricePerSqmAtAcquisition: landSqmAtAcq,
            buildingStdPriceAtAcquisition:
              parseAmount(primary.phdBuildingStdPriceAtAcq) || 0,
            landPricePerSqmAtFirstDisclosure: parseAmount(primary.phdLandPricePerSqmAtFirst),
            buildingStdPriceAtFirstDisclosure:
              parseAmount(primary.phdBuildingStdPriceAtFirst) || 0,
            transferHousingPrice:
              parseAmount(primary.phdTransferHousingPrice) ||
              parseAmount(primary.mixedTransferHousingPrice),
            landPricePerSqmAtTransfer: landSqmAtTransfer,
            buildingStdPriceAtTransfer:
              parseAmount(primary.phdBuildingStdPriceAtTransfer) || 0,
            // 미공시 취득 당시 토지 면적 직접 지정 — 미입력 시 엔진이 양도시 비율로 자동 계산
            ...(parseFloat(primary.phdResidentialLandArea) > 0
              ? { landArea: parseFloat(primary.phdResidentialLandArea) }
              : {}),
            // Case A 4부분 안분 — 취득시·최초공시 상가건물 기준시가 + 총양도가액 함께 충족 시 활성화.
            // 취득시 상가건물은 메인 mixedAcqCommercialBuildingPrice fallback 인식 (UI 통합 후 단일 필드).
            // 최초공시 상가건물은 PHD-only 필드 (일반 검용주택 흐름에 없음).
            ...((parseAmount(primary.phdCommercialBuildingStdPriceAtAcq) ||
                 parseAmount(primary.mixedAcqCommercialBuildingPrice)) > 0 &&
                parseAmount(primary.phdCommercialBuildingStdPriceAtFirst) > 0
              ? {
                  commercialBuildingStdPriceAtAcq:
                    parseAmount(primary.phdCommercialBuildingStdPriceAtAcq) ||
                    parseAmount(primary.mixedAcqCommercialBuildingPrice),
                  commercialBuildingStdPriceAtFirstDisclosure: parseAmount(primary.phdCommercialBuildingStdPriceAtFirst),
                  totalTransferPriceForFourPart: parseAmount(form.contractTotalPrice),
                }
              : {}),
          }
        : undefined;
    })(),
    // 거주기간은 소수점 가능 (예: 23.5년) — parseFloat 사용
    residencePeriodYears: parseFloat(primary.mixedUseResidencePeriodYears) || 0,
    isMetropolitanArea: primary.mixedIsMetropolitanArea,
    zoneType: "residential" as const,
    // 🚨 Critical (이슈 8-A): 1세대 1주택 비과세 요건 충족 여부 (다주택자 분기)
    // 소득세법 §89①3 — 1세대 + 1주택. 일시적 2주택 특례 적용 시에도 비과세 요건 충족으로 본다.
    isOneHouseExempt:
      primary.isOneHousehold &&
      (form.householdHousingCount === "1" ||
        (form.householdHousingCount === "2" && form.temporaryTwoHouseSpecial === true)),
    // 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10)
    partialUsageChange:
      primary.hasPartialUsageChange && primary.partialChangeDirection
        ? {
            direction: primary.partialChangeDirection,
            acqResidentialArea: parseFloat(primary.partialChangeAcqResidentialArea) || undefined,
            acqCommercialArea: parseFloat(primary.partialChangeAcqCommercialArea) || undefined,
            // 집행기준 89-154-24 취지 — 용도변경일 입력 시 LTHD 시간 비례 분할
            usageChangeDate:
              primary.partialChangeDate &&
              !Number.isNaN(new Date(primary.partialChangeDate).getTime())
                ? new Date(primary.partialChangeDate)
                : undefined,
          }
        : undefined,
  } : undefined;

  const body = {
    propertyType: isMixed ? ("mixed-use-house" as const) : primary.assetKind,
    transferPrice: parseAmount(form.contractTotalPrice),
    transferDate: form.transferDate,
    acquisitionPrice:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : parseAmount(primary.fixedAcquisitionPrice),
    acquisitionDate: parcelModeActive
      ? firstParcelAcqDate
      : primary.acquisitionCause === "carryover_gift"
        ? (primary.acquisitionDate || primary.carryover?.giftRegistryDate || "")
        : primary.acquisitionDate,
    expenses:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : parseAmount(primary.directExpenses),
    // §97② 단서 swap 분리 입력 — 두 필드가 명시되면 엔진이 swap 비교 수행.
    // 둘 다 0이면 undefined로 보내 swapEligible=false (legacy 동작 유지).
    capitalExpenditure:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || parseAmount(primary.transferExpense))
        ? parseAmount(primary.capitalExpenditure)
        : undefined,
    transferExpense:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || parseAmount(primary.transferExpense))
        ? parseAmount(primary.transferExpense)
        : undefined,
    // 검용주택은 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회 위해 false 송신
    useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed ? false
      : isCarryoverGeneral ? true
      : isEstimated,
    standardPriceAtAcquisition: hasPre1990 || usesPhd
      ? undefined
      : isCarryoverGeneral
        ? (parseAmount(primary.carryover?.donorStandardPriceAtAcquisition ?? "") || undefined)
        : isEstimated
          ? parseAmount(primary.standardPriceAtAcq) || undefined
          : undefined,
    standardPriceAtTransfer: hasPre1990 || usesPhd
      ? undefined
      : isCarryoverGeneral
        ? (parseAmount(primary.carryover?.donorStandardPriceAtTransfer ?? "") || undefined)
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
    // PHD 모드: 취득일 동일이어도 calcSplitGain 진입을 위해 landAcquisitionDate를 acquisitionDate로 fallback.
    landAcquisitionDate:
      (primary.hasSeperateLandAcquisitionDate || primary.selfOwns !== "both") && primary.landAcquisitionDate
        ? primary.landAcquisitionDate
        : usesPhd
          ? primary.acquisitionDate
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
    // 거주기간 — interval 모드면 자산 구간 합산, direct 모드는 자산 또는 form-global fallback
    residencePeriodMonths:
      primary.residenceInputMode === "interval" && primary.residencePeriods.length > 0
        ? sumResidenceMonths(primary.residencePeriods, form.transferDate)
        : parseInt(primary.residencePeriodMonthsAsset || form.residencePeriodMonths) || 0,
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
              // §97② 단서 swap — 두 필드 합 > 0이면 분리 전송, 아니면 undefined (swap 비활성)
              capitalExpenditure:
                (parseAmount(p.capitalExpenditure) || parseAmount(p.transferExpense))
                  ? parseAmount(p.capitalExpenditure)
                  : undefined,
              transferExpense:
                (parseAmount(p.capitalExpenditure) || parseAmount(p.transferExpense))
                  ? parseAmount(p.transferExpense)
                  : undefined,
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
    // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(공동주택 사례 23 등)도 PHD 전송.
    ...(!isMixed &&
    primary.usePreHousingDisclosure &&
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
            .map((a) => buildAssetPayload(a, form.bundledSaleMode, form.transferDate)),
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
    // 배우자등 이월과세 (§97조의2)
    ...(primary.acquisitionCause === "carryover_gift" && primary.carryover
      ? (() => {
          const payload = buildCarryoverPayload(primary, form.transferDate);
          return payload ? { carryoverTaxation: payload.carryoverTaxation } : {};
        })()
      : {}),
    // ⑬ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — 토글 OFF 시 undefined, body에서 제외
    ...((() => {
      const rhPayload = toRentalHousingExceptionApi(primary);
      return rhPayload ? { rentalHousingException: rhPayload } : {};
    })()),
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
      // 정확한 실패 필드 파악을 위해 콘솔에 전체 출력
      console.error("[transfer-tax API] fieldErrors:", fieldErrors);
      // 사용자 친화적 한국어 다중행 메시지로 변환 (모든 fieldErrors 포함)
      const { formatFieldErrors } = await import("./transfer-tax-error-format");
      throw new Error(formatFieldErrors(fieldErrors, msg));
    }
    throw new Error(msg);
  }
  return json.data as TransferAPIResult;
}
