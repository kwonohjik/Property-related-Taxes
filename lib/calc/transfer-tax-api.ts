/**
 * 양도소득세 계산 API 호출 함수
 * TransferFormData (assets[] 기반) → POST /api/calc/transfer → TransferAPIResult
 *
 * Phase 1: 서버 Zod 스키마 미변경 — 클라이언트에서 기존 포맷으로 변환하여 전송.
 * assets.length === 1 → single 엔드포인트, >= 2 → bundled 엔드포인트.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { isHousingLike, toEngineReductions, buildAssetPayload, getOwnershipRatio, applyRatio, toRentalHousingExceptionApi, buildCommercialBuildingValuation, buildGeneralBuildingValuation, buildRedevelopmentPayload, buildExpropriationInput, buildReplacementHousePayload, buildPre1990LandPayload, provisoGate, effectiveProvisoReason } from "./transfer-tax-api-helpers";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { buildNonBusinessLandRaw } from "./non-business-land-request";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
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
  const reductions = toEngineReductions(primary.reductions ?? [], primary.acquisitionCause, primary.expropriationNoticeDate);

  // ── ④⑬ 비사업용 토지 정밀판정 raw 페이로드 (서버 buildNblEngineInput이 nested+Date 변환) ──
  const nblRaw = buildNonBusinessLandRaw(primary, form.transferDate);

  // ── 다른 보유 주택 목록 (④⑬ 헬퍼로 위임 — transfer-tax-api-houses.ts) ──
  // 분양권/입주권만 있고 다른 주택은 없는 경우(양도주택 + 분양권)도 정밀 판정되도록 게이트 확장.
  const housesPayload = buildHousesPayload(
    primary,
    form.sellingHouseRegion,
    form.houses,
    form.presaleRights.length,
    form.sellingHouseExclusion,
  );

  // ── 세대 보유 분양권·입주권 (취득일 입력분만 — 2021.1.1 이후 취득분 주택수 산입) ──
  const presaleRightsPayload =
    isHousingLike(primary.assetKind) && form.presaleRights.length > 0
      ? form.presaleRights
          .filter((p) => p.acquisitionDate)
          .map((p) => ({
            id: p.id,
            type: p.type,
            acquisitionDate: p.acquisitionDate,
            region: p.region,
            regionCriteria: p.regionCriteria,
            rightValue: p.rightValue ? parseAmount(p.rightValue) || undefined : undefined,
            isSpouseOwned: p.isSpouseOwned,
            regionCode: p.regionCode || undefined,
          }))
      : undefined;

  // 취득가 산정방식은 자산-수준 플래그에서 도출 (Step1↔Step3 통합 후).
  // 폼-전역 form.acquisitionMethod / form.appraisalValue 는 더 이상 사용하지 않음.
  const isSalesCase = primary.isSalesCaseAcquisition === true;
  const isAppraisal = !isSalesCase && primary.isAppraisalAcquisition === true;
  const isEstimated = !isSalesCase && !isAppraisal && primary.useEstimatedAcquisition;
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

  const mixedUsePayload = buildMixedUsePayload(primary, form);

  // 공유 지분 — primary 자산의 지분 모드 처리 (다자산 일괄양도는 buildAssetPayload에서 별도 처리)
  const primaryRatio = getOwnershipRatio(primary);
  const primaryFractional = primaryRatio < 1.0;
  // 토지/건물 분리 직접 입력 전송 게이트 — UI가 분리 칸을 노출하는 조건과 동일.
  // 엔진은 landSplitMode를 읽지 않으므로("죽은 모드") 여기서 막지 않으면 "기준시가 비율 안분"으로
  // 되돌려도 이전 직접 입력값이 계속 엔진에 도달한다(유령 값).
  // ⚠️ 부담부증여 제외 — 엔진이 transferPrice·acquisitionPrice를 §159 안분액으로 override하므로
  //    (transfer-tax-burdened-gift-step.ts) 사용자가 화면에서 보는 계약 총액과 **다른 총액**이 기준이 된다.
  //    그 상태로 토지 양도가액을 직접 입력하면 잔액이 계약총액 기준으로 계산돼 음수가 된다
  //    (계약 10억·§159 채무 4억에서 토지 6억 입력 → 건물 = 4억 − 6억 = −2억).
  //    부담부증여는 기준시가 비율 안분만 사용한다.
  const splitDirectActive =
    primary.hasSeperateLandAcquisitionDate === true &&
    primary.landSplitMode === "actual" &&
    !isBurdenedGift;
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
      hasPre1990 || isEstimated || isAppraisal || isSalesCase || parcelModeActive
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
      hasPre1990 || isEstimated || isAppraisal || isSalesCase || parcelModeActive
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
    // 매매사례가액 추계(salesCase)는 useEstimatedAcquisition과 별개 경로 — false 송신
    useEstimatedAcquisition: hasPre1990 || parcelModeActive || isMixed || isSalesCase ? false
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
    // pre1990 모드: 취득시 기준시가는 서브엔진(pre1990Land)이 산출하므로 undefined.
    // 양도시 기준시가는 form 입력값(standardPriceAtTransfer)을 그대로 전달 — 서브엔진은 산출하지 않음.
    standardPriceAtTransfer: usesPhd
      ? undefined
      : hasPre1990
        ? parseAmount(primary.standardPriceAtTransfer) || undefined
        : isCarryoverGeneral
          ? (parseAmount(primary.carryover?.donorStandardPriceAtTransfer ?? "") || undefined)
          : isEstimated
            ? parseAmount(primary.standardPriceAtTransfer) || undefined
            : undefined,
    // ⑬ 공익수용 양도당시 기준시가 차감 특례 (소득세법 시행령 §164⑨ 1호)
    ...buildExpropriationInput(primary),
    acquisitionMethod: hasPre1990 || isMixed
      ? ("actual" as const)
      : isSalesCase ? "salesCase"
      : (isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"),
    appraisalValue: !isMixed && isAppraisal ? parseAmount(primary.fixedAcquisitionPrice) : undefined,
    // ④⑬ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달
    similarSalesValue: isSalesCase ? parseAmount(primary.similarSalesValue) || undefined : undefined,
    isSelfBuilt: !isMixed && primary.isSelfBuilt || undefined,
    buildingType: primary.buildingType || undefined,
    constructionDate:
      primary.isSelfBuilt && primary.constructionDate ? primary.constructionDate : undefined,
    extensionFloorArea:
      primary.buildingType === "extension" && primary.extensionFloorArea
        ? parseFloat(primary.extensionFloorArea)
        : undefined,
    extensionStdPriceAtAcquisition:
      primary.buildingType === "extension"
        ? parseAmount(primary.extensionStdPriceAtAcquisition) || undefined
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
    // ⚠️ 분리 직접 입력 6필드는 `landSplitMode === "actual"`일 때만 전송한다(게이트 선언은 위 splitDirectActive).
    // 엔진은 landSplitMode를 읽지 않고 필드별 `?? fallback`으로만 동작하므로, 사용자가 "직접 입력"으로
    // 값을 채운 뒤 "기준시가 비율 안분"으로 되돌려도 그 값이 계속 엔진에 도달해 유령 값이 됐다.
    // UI에서 필드를 클리어하는 대신 **전송 게이트**로 막는다 — 폼값이 보존돼 재토글 시 복원된다
    // (bg* 필드 보존 패턴과 동형).
    ...(splitDirectActive
      ? {
          landTransferPrice: parseAmount(primary.landTransferPrice) || undefined,
          buildingTransferPrice: parseAmount(primary.buildingTransferPrice) || undefined,
          landAcquisitionPrice: parseAmount(primary.landAcquisitionPrice) || undefined,
          buildingAcquisitionPrice: parseAmount(primary.buildingAcquisitionPrice) || undefined,
          landDirectExpenses: parseAmount(primary.landDirectExpenses) || undefined,
          buildingDirectExpenses: parseAmount(primary.buildingDirectExpenses) || undefined,
          landStandardPriceAtTransfer: parseAmount(primary.landStandardPriceAtTransfer) || undefined,
          buildingStandardPriceAtTransfer: parseAmount(primary.buildingStandardPriceAtTransfer) || undefined,
        }
      : {}),
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
    // 거주기간 — 공용 헬퍼 도출(interval 합산 / direct·form-global fallback). UI 메시지②와 단일 진실.
    residencePeriodMonths: deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths),
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    // ④ regionCode — primary 자산 법정동코드(AddressSearch PNU 앞10) 우선, 없으면 form-global fallback.
    // 제공 시 엔진 isRegulatedByBjdCode() 정밀 판정, 미제공 시 isRegulatedArea boolean fallback.
    regionCode: primary.regionCode || form.regionCode || undefined,
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
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      primary.acquisitionCause === "inheritance"
        ? primary.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      primary.acquisitionCause === "inheritance" && primary.decedentCohabitationHoldingStartDate
        ? primary.decedentCohabitationHoldingStartDate
        : undefined,
    donorAcquisitionDate:
      primary.acquisitionCause === "gift" && primary.donorAcquisitionDate
        ? primary.donorAcquisitionDate
        : undefined,
    isOneHousehold: form.isOneHousehold,
    reductions,
    annualBasicDeductionUsed: parseAmount(form.annualBasicDeductionUsed),
    // ⑬ §133 5년 누적 한도 — 과거 4개 과세연도 감면 이력 (TypeScript 미감지 영역 — 누락 시 침묵 stripping)
    priorReductionUsage: form.priorReductionUsage ?? [],
    // ⑬ P5 모드 2 — 보유 감면주택 주택수 제외 (행: article·취득일 입력분만 전달)
    specialHouseExclusions: (form.specialHouseExclusions ?? [])
      .filter((e) => e.article)
      .map((e) => ({
        article: e.article,
        houseAcquisitionDate: e.houseAcquisitionDate || undefined,
        houseContractDate: e.houseContractDate || undefined,
        requirementsConfirmed: e.requirementsConfirmed,
      })),
    ...(form.temporaryTwoHouseSpecial &&
    primary?.acquisitionDate &&
    form.newHouseAcquisitionDate
      ? {
          temporaryTwoHouse: {
            // 종전주택 취득일 = 양도 자산 취득일(단일소스)
            previousAcquisitionDate: primary.acquisitionDate,
            newAcquisitionDate: form.newHouseAcquisitionDate,
          },
        }
      : {}),
    // ④⑬ §156의2⑤ 대체주택 비과세 특례 FLAT → nested (helpers로 분리, 800줄 정책)
    ...buildReplacementHousePayload(form),
    ...(nblRaw ? { nonBusinessLandRaw: nblRaw } : {}),
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    ...(presaleRightsPayload ? { presaleRights: presaleRightsPayload } : {}),
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
    ...(form.isFirstTransferredInMerge ? { isFirstTransferredInMerge: true } : {}),
    ...(form.generalHouseGiftedFromDecedentWithin2yr ? { generalHouseGiftedFromDecedentWithin2yr: true } : {}),
    ...(() => {
      // §154① 단서 reason 정규화 — 카드 숨김(mode=null)·temp-two-house 무효 reason(나·다목·5호)은 미전송 (Part D 게이트, mirror)
      const provisoMode = provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: primary.assetKind === "housing",
        householdHousingCount: form.householdHousingCount,
        temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
      }).mode;
      const reason = effectiveProvisoReason(provisoMode, form.provisoReason);
      return reason
        ? {
            oneHouseExemptionProviso: {
              reason,
              ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
              ...(form.provisoExpropriationDate ? { expropriationDate: form.provisoExpropriationDate } : {}),
              ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: form.provisoBusinessApprovalDate } : {}),
            },
          }
        : {};
    })(),
    // ⑬ 다주택 중과 한시 유예 — houses 제공 시에만 엔진이 소비 (form-global gracePeriod)
    ...(housesPayload && form.gracePeriod ? { gracePeriod: form.gracePeriod } : {}),
    // 수정신고 모드에서는 무신고/과소신고 가산세 블록을 전송하지 않음 (상호배타)
    ...(!form.amendmentMode && form.enablePenalty && form.filingType !== "correct"
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
    ...(!form.amendmentMode && form.enablePenalty && form.paymentDeadline
      ? {
          delayedPaymentDetails: {
            unpaidTax: parseAmount(form.unpaidTax),
            paymentDeadline: form.paymentDeadline,
            actualPaymentDate: form.actualPaymentDate || undefined,
          },
        }
      : {}),
    // 수정신고(경정) — 국세기본법 §45·§48
    ...(form.amendmentMode
      ? {
          amendment: {
            correctionKind: form.correctionKind,
            originalDeterminedTax: parseAmount(form.originalDeterminedTax),
            // [F6] 경정청구(refund)는 가산세 없음 → 플래그 강제 false(stale 누출 차단)
            applyUnderReportingPenalty:
              form.correctionKind === "refund_claim" ? false : form.applyUnderReportingPenalty,
            underReportingReason: form.underReportingReason,
            underReductionMode: form.underReductionMode,
            ...(form.statutoryFilingDeadline ? { statutoryFilingDeadline: form.statutoryFilingDeadline } : {}),
            ...(form.amendedFilingDate ? { amendedFilingDate: form.amendedFilingDate } : {}),
            priorAssessmentNotified: form.priorAssessmentNotified,
            applyLatePaymentPenalty:
              form.correctionKind === "refund_claim" ? false : form.applyLatePaymentPenalty,
            ...(form.amendedPaymentDate ? { amendedPaymentDate: form.amendedPaymentDate } : {}),
            // 경정청구 전용 — §45의2
            ...(form.correctionKind === "refund_claim" ? { claimReasonType: form.claimReasonType } : {}),
            ...(form.posteriorEventDate ? { posteriorEventDate: form.posteriorEventDate } : {}),
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
              // 공익수용 §164⑨ 1호 — 필지별 min[] 특례. 환산 방식일 때만 의미(엔진이 최종 게이트).
              compensationPerSqm:
                p.acquisitionMethod === "estimated"
                  ? parseAmount(p.compensationPerSqm) || undefined
                  : undefined,
              compensationBasisStdPrice:
                p.acquisitionMethod === "estimated"
                  ? parseAmount(p.compensationBasisStdPrice) || undefined
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
            .map((a) => buildAssetPayload(a, form.assets.some((x) => x.isReplotIncrement) ? "apportioned" : form.bundledSaleMode, form.transferDate, totalContractPrice, formTotalTransferExpense || undefined, form.assets[0], form.isOneHousehold)),
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
    // ── 1990.8.30. 이전 취득 토지 기준시가 환산 (자산-수준 필드 사용, 단건·다건 공용 헬퍼) ──
    ...(hasPre1990 ? buildPre1990LandPayload(primary, form.transferDate) : {}),
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

// 거주요건 판정 입력 빌드 — transfer-tax-api-residence.ts로 격리 (800줄 정책)
export { buildResidenceReqInput } from "./transfer-tax-api-residence";
