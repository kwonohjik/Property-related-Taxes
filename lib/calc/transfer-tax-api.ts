/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData (assets[] 기반) → POST /api/calc/transfer → TransferAPIResult
 *
 * Phase 1: 서버 Zod 스키마 미변경 — 클라이언트에서 기존 포맷으로 변환하여 전송.
 * assets.length === 1 → single 엔드포인트, >= 2 → bundled 엔드포인트.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { sumResidenceMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { isHousingLike, toEngineReductions, buildAssetPayload, getOwnershipRatio, applyRatio, toRentalHousingExceptionApi, buildCommercialBuildingValuation, buildGeneralBuildingValuation, buildRedevelopmentPayload } from "./transfer-tax-api-helpers";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import {
  buildInheritedAcquisitionPayload,
  buildInheritedHouseValuationPayload,
} from "./transfer-tax-api-inheritance";

// 하위 호환 재수출 — 기존 import 경로 유지
export { toEngineReductions } from "./transfer-tax-api-helpers";

export type SingleTransferResult = { mode: "single"; result: TransferTaxResult };
export type BundledTransferResult = {
  mode: "bundled";
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
  /** 부담부증여 §159·증여세 통합 명세 (일반건물 + 부담부증여 모드에서만 포함). */
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
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

  // ⑬ 상업용건물·오피스텔 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isCommercialBuilding = primary.assetKind === "commercial_building";
  const cbValuation = isCommercialBuilding && primary.useEstimatedAcquisition
    ? buildCommercialBuildingValuation(primary)
    : undefined;

  // ⑬ 일반건물(토지+건물 일괄) 환산취득가 서브객체 빌드 (TypeScript 미감지 영역 — grep 자가 점검 완료)
  const isGeneralBuilding = primary.assetKind === "general_building";
  const gbValuation = isGeneralBuilding
    ? buildGeneralBuildingValuation(primary)
    : undefined;

  // ⑬ 재개발/재건축 (시행령 §166) — assetKind "redevelopment_apt" 또는 "right_to_move_in" 시 빌드.
  // redevSubject는 buildRedevelopmentPayload에서 UI display fallback("apt"/"right")과 동일하게 보정.
  // assetKind 자체가 전용 분기이므로 추가 enum 입력은 요구하지 않는다(3중 패턴 정합).
  const isRedevelopment =
    primary.assetKind === "redevelopment_apt" || primary.assetKind === "right_to_move_in";
  const redevPayload = isRedevelopment ? buildRedevelopmentPayload(primary) : undefined;

  // ⑬ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): transferType 분기 + 모든 propertyType 지원
  // 호환성: 레거시 acquisitionCause === "burdened_gift"는 normalize에서 transferType로 이전되나
  //         혹시 누락된 경우 OR 조건으로 fallback.
  const isBurdenedGift =
    primary.transferType === "burdened_gift" ||
    primary.acquisitionCause === "burdened_gift";
  const bgInfo = isBurdenedGift ? buildBurdenedGiftInfo(primary) : undefined;

  // 겸용주택 분리계산 payload 빌드
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
      // 겸용주택 PHD: phdLandPricePerSqm* 미설정 시 섹션 2의 mixed 값으로 fallback
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
            // 최초공시 상가건물은 PHD-only 필드 (일반 겸용주택 흐름에 없음).
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

  // 공유 지분 — primary 자산의 지분 모드 처리 (다자산 일괄양도는 buildAssetPayload에서 별도 처리)
  const primaryRatio = getOwnershipRatio(primary);
  const primaryFractional = primaryRatio < 1.0;
  const totalContractPrice = parseAmount(form.contractTotalPrice);
  // 폼-수준 총 양도비 (B3) — 지분 모드 자동 안분의 분자 sourcing.
  // primary.transferExpense가 직접 입력되면 그것이 우선, 미입력시 form.totalTransferExpense × ratio 사용.
  const formTotalTransferExpense = parseAmount(form.totalTransferExpense || "0");
  const primaryTransferExpenseDirect = parseAmount(primary.transferExpense);
  const primaryEffectiveTransferExpense =
    primaryTransferExpenseDirect > 0
      ? primaryFractional
        ? applyRatio(primaryTransferExpenseDirect, primaryRatio)
        : primaryTransferExpenseDirect
      : primaryFractional && formTotalTransferExpense > 0
        ? applyRatio(formTotalTransferExpense, primaryRatio)
        : formTotalTransferExpense; // 단독 모드: form-level이 있으면 사용, 없으면 0

  // 부담부증여 (소령 §159) — 양도가액은 엔진 STEP 0.48에서 채무 안분 후 자동 override.
  // 단, Zod schema는 transferPrice >0 요구이므로 채무 합계를 placeholder로 전달 (엔진에서 다시 계산).
  const isBurdenedGiftPrimary = primary.transferType === "burdened_gift";
  const burdenedGiftPlaceholderTransferPrice = isBurdenedGiftPrimary
    ? (parseAmount(primary.bgLendingDepositTotal) || 0) +
      (parseAmount(primary.bgMortgageDebtAmount) || 0)
    : 0;

  // 사례 46 — receiveOnly 모드: transferPrice = settlementAmount, transferDate = settlementSaleDate 자동 미러
  // memory `mirror-pattern` 3중 패턴 (UI display + API + validate). 엔진은 receiveOnly 분기에서 transferPrice 무시 — 2중 안전망.
  const isReceiveOnly = isRedevelopment && primary.redevReceiveOnlyMode === "yes";
  const receiveOnlySettlementAmount = isReceiveOnly ? parseAmount(primary.redevSettlementAmount) : 0;
  const receiveOnlyTransferDate = isReceiveOnly && primary.redevSettlementSaleDate
    ? primary.redevSettlementSaleDate
    : null;

  // 재개발/재건축 입주권 양도(subject="right") 시 엔진 routing 키를 right_to_move_in으로 remap.
  //   - UI assetKind="redevelopment_apt"는 사업 분류(재개발/재건축 사업), redevSubject가 실제 양도 객체
  //   - 엔진 isRedevelopmentActive(`lib/tax-engine/redevelopment.ts:340-348`)는 propertyType ↔ subject 1:1 매핑 요구
  //     · redevelopment_apt → subject="apt" 필수
  //     · right_to_move_in → subject="right" 필수
  //   - 부정합 조합(redevelopment_apt + subject="right") 시 엔진이 일반 양도 분기로 routing되어
  //     redevelopmentDetail 미생성 + LTHD 전체 양도차익 일괄 적용 회귀 발생
  const isRedevelopmentRightTransfer =
    primary.assetKind === "redevelopment_apt" && primary.redevSubject === "right";

  const body = {
    // commercial_building/general_building은 그대로 송신 — 엔진 진입 조건 충족
    // 추가로 서브객체(commercialBuildingValuation/generalBuildingValuation)로 환산취득가 데이터 전달
    propertyType: isMixed
      ? ("mixed-use-house" as const)
      : isRedevelopmentRightTransfer
        ? ("right_to_move_in" as const)
        : (primary.assetKind as "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building" | "redevelopment_apt"),
    transferPrice: isReceiveOnly && receiveOnlySettlementAmount > 0
      ? receiveOnlySettlementAmount
      : isBurdenedGiftPrimary
        ? burdenedGiftPlaceholderTransferPrice
        : primaryFractional
          ? applyRatio(totalContractPrice, primaryRatio)
          : totalContractPrice,
    /** 12억 안분 분모용 총 물건 양도가액 — primary 지분 모드 전용 */
    totalPropertyTransferPrice: primaryFractional ? totalContractPrice : undefined,
    transferDate: receiveOnlyTransferDate || form.transferDate,
    acquisitionPrice:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : isRedevelopment
          ? // 재개발 + 실가 모드 — 두 경로 분기:
            //  · 사례 48 승계조합원: 자산 카드 fixedAcquisitionPrice 사용 (상속·증여·매매 통합 흐름)
            //  · 그 외(사례 45/46 원조합원): §166 섹션 내부의 redevActualAcquisitionPrice 사용
            primary.redevIsSuccessorMember === "yes"
              ? parseAmount(primary.fixedAcquisitionPrice)
              : parseAmount(primary.redevActualAcquisitionPrice)
          : primaryFractional
            ? applyRatio(parseAmount(primary.fixedAcquisitionPrice), primaryRatio)
            : parseAmount(primary.fixedAcquisitionPrice),
    acquisitionDate: parcelModeActive
      ? firstParcelAcqDate
      : primary.acquisitionCause === "carryover_gift"
        ? (primary.acquisitionDate || primary.carryover?.giftRegistryDate || "")
        : primary.acquisitionDate,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 — §99의3 등 13개 매매계약일 기준 조문 시한 판정용
    assetContractDate: primary.assetContractDate || undefined,
    expenses:
      hasPre1990 || isEstimated || isAppraisal || parcelModeActive
        ? 0
        : primaryFractional
          ? applyRatio(parseAmount(primary.directExpenses), primaryRatio)
          : parseAmount(primary.directExpenses),
    // §97② 단서 swap 분리 입력 — 두 필드가 명시되면 엔진이 swap 비교 수행.
    // 둘 다 0이면 undefined로 보내 swapEligible=false (legacy 동작 유지).
    // 지분 모드: 자본적지출은 100% 기준 입력 → × ratio 자동 적용 (자산별 자체 지출이므로 자산 카드에서 입력)
    // 양도비는 폼-수준 totalTransferExpense에서 자산별 안분 (B3) — primary.transferExpense는 fallback
    capitalExpenditure:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || parseAmount(primary.transferExpense))
        ? primaryFractional
          ? applyRatio(parseAmount(primary.capitalExpenditure), primaryRatio)
          : parseAmount(primary.capitalExpenditure)
        : undefined,
    transferExpense:
      parcelModeActive ? undefined :
      (parseAmount(primary.capitalExpenditure) || primaryEffectiveTransferExpense)
        ? primaryEffectiveTransferExpense || undefined
        : undefined,
    // 겸용주택은 calcMixedUseTransferTax 별도 엔진에서 처리 → 일반 환산 검증 우회 위해 false 송신
    // 상업용건물·일반건물 환산 모드는 STEP 0.35 진입 조건이 useEstimatedAcquisition === true 이므로 true 송신
    useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed ? false
      : isCommercialBuilding ? primary.useEstimatedAcquisition
      : isGeneralBuilding ? primary.useEstimatedAcquisition
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
    // 사례 36 §89①4호 가목 1세대1입주권 비과세 — 조합원입주권 수 (양도일 현재)
    // right_to_move_in 자산 유형에서만 의미. 기본 "0" fallback.
    householdRightCount: parseInt(form.householdRightCount ?? "0") || 0,
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
    // ⑬ Phase 2 (2026-05-12): transferType 패스스루 — TypeScript 미감지 영역 (ui-engine-sync-checker 발견)
    // 부담부증여 분기 활성화에 필수. body에 미포함 시 Zod parse → undefined → 엔진 isBurdenedGiftEngine=false
    // → §159 분기 비활성 → 일반 양도로 잘못 계산됨.
    transferType: primary.transferType || undefined,
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
    // 겸용주택은 mixedUse.preHousingDisclosure에서 별도 전송하므로 여기 송신 금지.
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
    // ── landNature (토지 자산 성격 — 부수토지 vs 독립 나대지) ──
    // 폼 enum("appurtenant"/"standalone") → 엔진 enum("appurtenant_to_housing"/"non_appurtenant") 변환.
    // undefined이면 엔진에 전달하지 않음.
    ...(primary.assetKind === "land" && primary.landNature !== undefined
      ? {
          landNature:
            primary.landNature === "appurtenant"
              ? ("appurtenant_to_housing" as const)
              : ("non_appurtenant" as const),
        }
      : {}),
    // ⑬ 상업용건물·오피스텔 환산취득가 서브객체 (TypeScript 미감지 — 명시 spread 필수)
    // cbValuation === undefined 이면 키 자체를 포함하지 않음 (Zod optional 통과)
    ...(cbValuation !== undefined ? { commercialBuildingValuation: cbValuation } : {}),
    // ⑬ 일반건물 환산취득가 body spread (TypeScript 미감지 영역 — 누락 시 서브객체 미도달)
    ...(gbValuation !== undefined ? { generalBuildingValuation: gbValuation } : {}),
    // ⑬ 부담부증여 body spread (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    ...(bgInfo !== undefined ? { burdenedGiftInfo: bgInfo } : {}),
    // ⑬ 재개발/재건축 spread (시행령 §166) — 누락 시 silent stripping
    ...(redevPayload !== undefined ? { redevelopment: redevPayload } : {}),
    // ⑬ 가업상속공제 §97의2④ 의제 취득가액 spread (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    ...(primary.familyBusinessInheritance !== undefined
      ? { familyBusinessInheritance: primary.familyBusinessInheritance }
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
                  // 보충적평가 자산 구분 — inheritanceAssetKind ("land" | "house_individual" | "house_apart")
                  // assetKind("housing")가 아닌 자산-수준 inheritanceAssetKind를 사용해야 schema enum 일치
                  assetKind: primary.inheritanceAssetKind,
                  landAreaM2: primary.acquisitionArea ? parseFloat(primary.acquisitionArea) : undefined,
                  // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
                  publishedValueAtInheritance: primaryFractional
                    ? applyRatio(parseAmount(primary.publishedValueAtInheritance), primaryRatio)
                    : parseAmount(primary.publishedValueAtInheritance),
                }
              : undefined,
          companionAssets: form.assets
            .slice(1)
            .map((a) => buildAssetPayload(a, form.bundledSaleMode, form.transferDate, totalContractPrice, formTotalTransferExpense || undefined)),
          bundledSaleMode: form.bundledSaleMode,
          // primary 양도가액 (actual 모드 전용).
          // 지분 모드는 contractTotalPrice × ratio 자동 입력 (companion buildAssetPayload와 일관)
          // — 사용자 입력란이 비어 있어도 시스템이 자동 결정하므로 zod 검증 통과.
          primaryActualSalePrice:
            form.bundledSaleMode === "actual"
              ? primary.actualSalePrice
                ? parseAmount(primary.actualSalePrice)
                : primaryFractional
                  ? applyRatio(totalContractPrice, primaryRatio)
                  : undefined
              : undefined,
        }
      : {}),
    // ── 상속 취득가액 의제 (소령 §176조의2 ④ pre-deemed / §163 ⑨ post-deemed) — sibling 격리 ──
    ...buildInheritedAcquisitionPayload(primary, primaryRatio, primaryFractional),
    // ── 상속 주택 환산취득가 보조 입력 (3-시점, < 2005-04-30) — sibling 격리 ──
    ...buildInheritedHouseValuationPayload(primary, form.transferDate),
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
    // 겸용주택 분리계산 입력
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
    // ④⑬ 사례 28 + G-5 — 신축(자가건축) 취득일 4-시점 + 부수토지 한도 산정 (영 §162①4호, 영 §154⑦)
    // acquisitionCause === "newConstruction" 시 4-시점 날짜 전송.
    // buildingFootprintArea / isUrbanArea는 신축 여부와 무관하게 값이 있으면 전송.
    ...(primary.acquisitionCause === "newConstruction"
      ? {
          occupancyApprovalDate: primary.occupancyApprovalDate || undefined,
          approvalCertificateDate: primary.approvalCertificateDate || undefined,
          temporaryApprovalDate: primary.temporaryApprovalDate || undefined,
          actualUseDate: primary.actualUseDate || undefined,
        }
      : {}),
    ...(parseFloat(primary.buildingFootprintArea) > 0
      ? { buildingFootprintArea: parseFloat(primary.buildingFootprintArea) }
      : {}),
    ...(primary.isUrbanArea !== undefined
      ? { isUrbanArea: primary.isUrbanArea }
      : {}),
    ...(primary.appurtenantLandZone !== undefined
      ? { appurtenantLandZone: primary.appurtenantLandZone }
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
    const fieldErrors = json?.error?.fieldErrors as
      | Record<string, string[]>
      | undefined;
    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      const { logFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
      logFieldErrorsResponse(fieldErrors, json, body);
      const { formatFieldErrors } = await import("./transfer-tax-error-format");
      throw new Error(formatFieldErrors(fieldErrors, msg));
    }
    const { logNoFieldErrorsResponse } = await import("./transfer-tax-api-error-log");
    const detailedMsg = logNoFieldErrorsResponse(json, res, body) ?? msg;
    throw new Error(detailedMsg);
  }
  return json.data as TransferAPIResult;
}
