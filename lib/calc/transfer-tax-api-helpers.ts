/**
 * 양도소득세 API 변환 헬퍼 — toEngineReductions + buildAssetPayload (companionAssets용)
 * transfer-tax-api.ts 800줄 정책에 따라 분리.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  isHousingExprEligibleAssetKind,
  isSplitLandExprEligibleAssetKind,
} from "@/lib/tax-engine/expropriation-scope";
import { differenceInYears } from "date-fns";
import {
  isWithinSurchargeSuspensionWindow,
  MULTI_HOUSE,
  TEMP_TWO_HOUSE_PROVISO_REASONS,
} from "@/lib/tax-engine/legal-codes/transfer";

/**
 * 다주택 중과 한시배제(소득세법 시행령 §167의3①12의2·§167의10①12의2) 여부 —
 * 양도일 ∈ [2022-05-10, 2026-05-09] AND 양도 주택 보유기간 2년 이상(§95④).
 * true면 중과 전면배제(일반세율) → UI ④ 섹션 숨김 + 해당 검증 skip(양쪽 단일 술어).
 * 엔진 determineMultiHouseSurcharge의 배제 조건(양도일 윈도우 + differenceInYears≥2)과 동일.
 */
export function isMultiHouseSurchargeSuppressed(
  transferDate: string | undefined | null,
  acquisitionDate: string | undefined | null,
): boolean {
  if (!isWithinSurchargeSuspensionWindow(transferDate) || !transferDate || !acquisitionDate)
    return false;
  return (
    differenceInYears(new Date(transferDate), new Date(acquisitionDate)) >=
    MULTI_HOUSE.SURCHARGE_SUSPENSION_MIN_HOLDING_YEARS
  );
}

/** §154① 단서 카드 노출 맥락 — 1주택 / 일시적 2주택 / 미노출. */
export type ProvisoMode = "one_house" | "temporary_two_house" | null;

/**
 * §154① 단서 카드 노출 여부 + 맥락(mode) 단일 파생.
 * 1주택 → one_house. 2주택+일시적특례 → temporary_two_house(§155① 준용). 그 외(순수 2주택·대체주택·3주택+) → 숨김.
 * UI(Step4 렌더·배치)·API 조립·validation이 이 단일 함수를 공유(mirror-pattern).
 */
export function provisoGate(args: {
  isOneHousehold: boolean;
  isHousing: boolean;
  householdHousingCount: string;
  temporaryTwoHouseSpecial: boolean;
}): { visible: boolean; mode: ProvisoMode } {
  if (!args.isOneHousehold || !args.isHousing) return { visible: false, mode: null };
  const n = parseInt(args.householdHousingCount, 10);
  if (n === 1) return { visible: true, mode: "one_house" };
  if (n === 2 && args.temporaryTwoHouseSpecial) return { visible: true, mode: "temporary_two_house" };
  return { visible: false, mode: null };
}

/**
 * §154① 단서 reason 정규화 — temporary_two_house 모드에서 화이트리스트(1·2가·3호) 밖 reason은 "" 로 취급.
 * UI 선택표시·API 조립·validation 3곳이 단일 소비 → 옵션 필터로 숨긴 stale 무효 reason이 엔진/검증에 도달하지 않음.
 * (1주택 모드서 나·다목·5호 선택 후 일시적 2주택 전환 시 데드락 방지 — 파생이라 clear-onChange 불필요.)
 */
export function effectiveProvisoReason(mode: ProvisoMode, reason: string | undefined | null): string {
  if (!reason) return "";
  if (mode === null) return ""; // 카드 숨김(순수 다주택·3주택+·비주택·비1세대) — stale reason 미전송·검증 skip(데드락 방지)
  if (mode === "temporary_two_house" && !TEMP_TWO_HOUSE_PROVISO_REASONS.has(reason)) return "";
  return reason;
}
// 800줄 분리 (P1, 2026-06-11) — 외부 import 호환을 위해 re-export 보존
import { toEngineReductions } from "./transfer-tax-api-reductions";
export { toEngineReductions } from "./transfer-tax-api-reductions";

// ─── ④ 상업용건물·오피스텔 환산취득가 API 변환 헬퍼 (소령 §164⑧, §176조의2②2호) ───

/**
 * AssetForm cb* 필드 → commercialBuildingValuation 서브객체 변환.
 * 필수 필드 미입력 시 undefined 반환 — validate에서 먼저 차단되므로 silent 처리.
 * ⑧ 주의: validate와 동일 조건으로 undefined 반환. UI 통과 → 여기서 undefined → 엔진 미도달 방지.
 */
export function buildCommercialBuildingValuation(
  asset: AssetForm,
): object | undefined {
  if (asset.assetKind !== "commercial_building" || !asset.useEstimatedAcquisition) {
    return undefined;
  }
  if (!asset.cbEra) return undefined;

  const exclusiveArea = parseDecimal(asset.cbExclusiveArea);
  const sharedArea = parseDecimal(asset.cbSharedArea);
  const landArea = parseDecimal(asset.cbLandArea);
  const unitPriceAtTransfer = parseAmount(asset.cbUnitPriceAtTransfer);
  const unitPriceAtFirstOrAcq = parseAmount(asset.cbUnitPriceAtFirstOrAcq);
  const landPriceAtTransfer = parseAmount(asset.cbLandPricePerSqmAtTransfer);

  // 공통 필수 필드 검증 — 0이면 undefined 반환 (validate에서 먼저 차단)
  if (!exclusiveArea || !sharedArea || !landArea
      || !unitPriceAtTransfer || !unitPriceAtFirstOrAcq || !landPriceAtTransfer) {
    return undefined;
  }

  // isPreDisclosure — cbEra가 "pre_disclosure" 이면 true
  const isPreDisclosure = asset.cbEra === "pre_disclosure";

  const base = {
    isPreDisclosure,
    exclusiveArea,
    commonArea: sharedArea,
    landArea,
    unitPriceAtTransfer,
    // pre_disclosure: unitPriceAtFirstOrAcq = 최초고시(2005) ㎡당 호별고시가
    // post_disclosure: unitPriceAtFirstOrAcq = 취득시 ㎡당 호별고시가
    ...(isPreDisclosure
      ? { unitPriceAtFirstDisclosure: unitPriceAtFirstOrAcq }
      : { unitPriceAtAcquisition: unitPriceAtFirstOrAcq }),
    landPriceAtTransfer,
  };

  if (isPreDisclosure) {
    const buildingAtAcq = parseAmount(asset.cbBuildingStdPriceAtAcq);
    const buildingAtFirst = parseAmount(asset.cbBuildingStdPriceAtFirst);
    const buildingAtTransfer = parseAmount(asset.cbBuildingStdPriceAtTransfer);
    const landAtAcq = parseAmount(asset.cbLandPricePerSqmAtAcq);
    const landAtFirst = parseAmount(asset.cbLandPricePerSqmAtFirst);
    if (!buildingAtAcq || !buildingAtFirst || !buildingAtTransfer
        || !landAtAcq || !landAtFirst) {
      return undefined;
    }
    return {
      ...base,
      buildingStdPriceAtAcquisition: buildingAtAcq,
      buildingStdPriceAtFirstDisclosure: buildingAtFirst,
      buildingStdPriceAtTransfer: buildingAtTransfer,
      landPriceAtAcquisition: landAtAcq,
      landPriceAtFirstDisclosure: landAtFirst,
    };
  }

  // post_disclosure: 취득시 개별공시지가 필수
  const landAtAcq = parseAmount(asset.cbLandPricePerSqmAtAcq);
  if (!landAtAcq) return undefined;
  return { ...base, landPriceAtAcquisition: landAtAcq };
}

// ─── ④ 장기임대주택 거주주택 비과세 특례 API 변환 헬퍼 (소령 §155⑳) ───

/**
 * AssetForm.rentalHousingException → API payload 변환.
 * applyException=false 또는 rentalUnits 미입력 시 undefined 반환 (⑬ body 미포함).
 * 자동 안분 fallback 금지 — 미입력은 validate에서 차단.
 */
export function toRentalHousingExceptionApi(asset: AssetForm): object | undefined {
  const rh = asset.rentalHousingException;
  if (!rh?.applyException) return undefined;
  if (!rh.rentalUnits || rh.rentalUnits.length === 0) return undefined;

  return {
    applyException: true,
    scenario: rh.scenario,
    rentalUnits: rh.rentalUnits.map((u) => ({
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

export function toEngineAssetKind(
  kind: AssetForm["assetKind"]
): "housing" | "land" | "building" | "commercial_building" | "general_building" | "redevelopment_apt" {
  if (kind === "right_to_move_in" || kind === "presale_right") return "housing";
  return kind;
}

// ─── ④ 사례 33: 증축 extensionInfo 서브객체 변환 헬퍼 ───

/**
 * AssetForm gbExtension* 필드 → extensionInfo 서브객체 변환.
 * gbHasExtension=false 시 undefined 반환.
 * gbHasExtension=true 시 필수 필드 누락은 validate 단계에서 이미 차단됨.
 * → 이 함수에서 undefined 폴백 대신 fail-fast throw (silent 회귀 차단).
 *
 * defensive 아닌 fail-fast — 이 throw에 도달하면 validate 우회 버그.
 * 사례 31 동작으로 silent 회귀하는 경로를 조기에 발각.
 * (자동 안분 fallback 금지 정책 — feedback_no_silent_apportion_fallback.md)
 */
function buildExtensionInfo(
  asset: AssetForm,
): object | undefined {
  if (!asset.gbHasExtension) return undefined;

  const extensionDate = asset.gbExtensionDate || undefined;
  const extensionArea = parseDecimal(asset.gbExtensionArea); // 선택 필드 — 0이면 미전달
  const extensionCause = asset.gbExtensionAcquisitionCause;

  // 취득방식 결정: 빈 문자열은 "estimated" fallback (validate에서 이미 검증됨)
  const mode: "actual" | "estimated" =
    asset.gbExtensionAcquisitionMode === "actual" ? "actual" : "estimated";

  // gbHasExtension=true + 공통 필수 필드 누락 → validate 우회 — fail-fast throw
  if (!extensionDate || !extensionCause) {
    throw new Error(
      `[buildExtensionInfo] gbHasExtension=true이지만 필드 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
    );
  }

  // §114조의2① 85㎡ 게이트: newConstruction 시만 전달. 미입력(0) → 85㎡ 이하 처리로 가산세 미발동.
  const extensionFloorArea85 =
    extensionCause === "newConstruction"
      ? parseDecimal(asset.gbExtensionFloorArea85) || undefined
      : undefined;

  // 공통 base 필드
  const base = {
    extensionDate,                               // string — route handler에서 toOptionalDate 변환 (⑭)
    ...(extensionArea ? { extensionArea } : {}), // 선택 필드: 미입력 시 미전달
    extensionAcquisitionCause: extensionCause,
    acquisitionMode: mode,
    ...(extensionFloorArea85 ? { extensionFloorArea85 } : {}),
  };

  if (mode === "estimated") {
    const transferExtStdPrice = parseAmount(asset.gbTransferExtensionBuildingStdPrice);
    const acqExtStdPrice = parseAmount(asset.gbAcquisitionExtensionBuildingStdPrice);
    if (!transferExtStdPrice || !acqExtStdPrice) {
      throw new Error(
        `[buildExtensionInfo] 환산 모드 stdPrice 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
      );
    }
    return {
      ...base,
      transferExtensionBuildingStdPrice: transferExtStdPrice,
      acquisitionExtensionBuildingStdPrice: acqExtStdPrice,
    };
  }

  // mode === "actual"
  const actualAcq = parseAmount(asset.gbExtensionActualAcquisitionPrice);
  if (!actualAcq) {
    throw new Error(
      `[buildExtensionInfo] 실가 모드 actualAcquisitionPrice 누락 — validate 단계에서 차단되어야 함 (asset.assetId=${asset.assetId})`
    );
  }
  return {
    ...base,
    actualAcquisitionPrice: actualAcq,
    actualExpenses: parseAmount(asset.gbExtensionActualExpenses) || 0,
  };
}

// ─── ④ 일반건물(토지+건물 일괄) API 변환 헬퍼 (소령 §176의2②, §163⑥, §166⑥) ───

/**
 * AssetForm gb* 필드 → generalBuildingValuation 서브객체 변환.
 *
 * 환산취득가 모드: 취득시 기준시가 포함 — 엔진이 환산·개산공제 계산.
 * 실거래가/감정가 모드: 양도시 기준시가만 — route helper가 §166⑥ 비율로 실거래가 안분 + NBL 판정.
 *   → actualPriceMode: true 플래그로 route helper 분기.
 *
 * 자동 안분 fallback 금지 — 미입력은 validate에서 명확한 오류로 차단.
 */
export function buildGeneralBuildingValuation(
  asset: AssetForm,
): object | undefined {
  if (asset.assetKind !== "general_building") return undefined;

  const transferLandPricePerSqm = parseAmount(asset.gbTransferLandPricePerSqm);
  const transferBuildingStdPrice = parseAmount(asset.gbTransferBuildingValue);
  const landArea = parseDecimal(asset.gbLandArea);
  const buildingFootprintArea = parseDecimal(asset.gbBuildingFootprintArea);

  // 양도시 기준시가·면적은 모드 무관 필수 (validate에서 사전 차단)
  if (
    !transferLandPricePerSqm ||
    !transferBuildingStdPrice ||
    !landArea ||
    !buildingFootprintArea
  ) return undefined;

  const nblFields = {
    zoneType: asset.gbZoneType || undefined,
    isMetropolitan: asset.gbIsMetropolitan,
    isUnregistered: asset.gbIsUnregistered,
  };

  // 풀세트 payload 필요 케이스 = 환산취득가 모드 OR 사례 33 일괄 모드 (실가+증축)
  // 두 경우 모두 취득시 기준시가·extensionInfo·buildingAcquisitionCause 필요.
  // 사례 33 일괄 모드는 extensionInfo.actualBundledAcquisitionPrice가 정의되어 엔진이 실가 분기.
  if (asset.useEstimatedAcquisition || asset.gbHasExtension) {
    // 취득시 기준시가 포함 (양 모드 공통 필요)
    const acquisitionLandPricePerSqm = parseAmount(asset.gbAcqLandPricePerSqm);
    const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
    const buildingArea = parseDecimal(asset.gbBuildingArea) || parseDecimal(asset.gbBuildingFootprintArea);
    if (!acquisitionLandPricePerSqm || !acquisitionBuildingStdPrice || !buildingArea) return undefined;
    return {
      transferLandPricePerSqm,
      transferBuildingStdPrice,
      acquisitionLandPricePerSqm,
      acquisitionBuildingStdPrice,
      landArea,
      buildingArea,
      buildingFootprintArea,
      estimatedDeductionRate: 0.03, // §163⑥ 등기 자산 3% 고정
      buildingAcquisitionDate: asset.gbBuildingAcquisitionDate || undefined,
      // isSelfBuilt: gbBuildingAcquisitionCause에서 도출 (A안: gbIsSelfBuilt 필드 폐지)
      isSelfBuilt: asset.gbBuildingAcquisitionCause === "newConstruction",
      // buildingAcquisitionCause: 엔진 input 필드 (⑭ route handler 매핑 준비)
      // 빈 문자열("")도 fallback해야 함 — ?? 는 nullish만 처리하므로 || 사용.
      buildingAcquisitionCause: asset.gbBuildingAcquisitionCause || "purchase",
      // #4-a: 토지 취득원인 + 상속·증여 보조 필드
      // 토지의 acquisitionCause(자산-수준) → landAcquisitionCause(payload)로 전달
      ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
        ? { landAcquisitionCause: asset.acquisitionCause }
        : {}),
      ...(asset.decedentAcquisitionDate
        ? { decedentAcquisitionDate: asset.decedentAcquisitionDate }
        : {}),
      ...(asset.donorAcquisitionDate
        ? { donorAcquisitionDate: asset.donorAcquisitionDate }
        : {}),
      // 사례 33: 증축 extensionInfo 서브객체 (gbHasExtension=false 시 undefined → 미포함)
      extensionInfo: buildExtensionInfo(asset),
      // 사례 33 증축 경로에서만 사용: 토지+건물1 일괄 취득가·필요경비 (extensionInfo.actualBundled* 주입용).
      // 환산취득가 모드에서 body.acquisitionPrice=0이므로 여기서 명시 전달. route helper ⑭에서 주입.
      ...(asset.gbHasExtension
        ? {
            bundledAcquisitionPrice: parseAmount(asset.fixedAcquisitionPrice),
            // 일괄 취득 시 필요경비 — 전용 필드(gbBundledAcquisitionExpenses) 우선.
            // legacy fallback: 미입력 시 transferExpense·directExpenses (이전 임시 매핑 호환).
            bundledExpenses:
              parseAmount(asset.gbBundledAcquisitionExpenses) ||
              parseAmount(asset.transferExpense) ||
              parseAmount(asset.directExpenses),
          }
        : {}),
      ...nblFields,
      // 사례 35: 주택→상가 용도변경 (자산 공통 — 환산 모드도 동일 LTHD 분기)
      ...(asset.gbHouseToCommercialConversion
        ? {
            houseToCommercialConversion: true,
            conversionDate: asset.gbConversionDate || undefined,
            wasMultiHouseAtConversion: asset.gbWasMultiHouseAtConversion ?? false,
          }
        : {}),
      // 사례 35 후속-1: §99-164-10 환산주택가격 (환산 모드만, useEstimatedAcquisition=true 분기)
      ...(asset.gbHasFirstDisclosure
        ? {
            hasFirstDisclosure: true,
            firstDisclosurePrice: parseAmount(asset.gbFirstDisclosurePrice) || undefined,
            firstDisclosureLandStdPrice: parseAmount(asset.gbFirstDisclosureLandStdPrice) || undefined,
            firstDisclosureBuildingStdPrice: parseAmount(asset.gbFirstDisclosureBuildingStdPrice) || undefined,
          }
        : {}),
    };
  }

  // 실거래가/감정가 모드 — 양도시 기준시가만 (route helper에서 §166⑥ 비율 안분)
  // buildingAcquisitionCause는 Zod schema에서 required이므로 minimal payload에도 포함.
  // (§114조의2 신축 5년 이내 가산세 판정에 사용 — 실거래가 모드에서도 의미 있음)
  // 부담부증여 §159①1호 산식용 — 취득시 기준시가 (입력 있을 때만 전달, optional).
  const acquisitionLandPricePerSqm = parseAmount(asset.gbAcqLandPricePerSqm);
  const acquisitionBuildingStdPrice = parseAmount(asset.gbAcqBuildingValue);
  return {
    transferLandPricePerSqm,
    transferBuildingStdPrice,
    landArea,
    buildingFootprintArea,
    actualPriceMode: true,
    buildingAcquisitionCause: asset.gbBuildingAcquisitionCause || "purchase",
    isSelfBuilt: asset.gbBuildingAcquisitionCause === "newConstruction",
    ...(acquisitionLandPricePerSqm ? { acquisitionLandPricePerSqm } : {}),
    ...(acquisitionBuildingStdPrice ? { acquisitionBuildingStdPrice } : {}),
    ...nblFields,
    // 사례 35: 주택→상가 용도변경 — actual 모드도 동일 LTHD 분기
    ...(asset.gbHouseToCommercialConversion
      ? {
          houseToCommercialConversion: true,
          conversionDate: asset.gbConversionDate || undefined,
          wasMultiHouseAtConversion: asset.gbWasMultiHouseAtConversion ?? false,
        }
      : {}),
  };
}

export const isHousingLike = (kind: AssetForm["assetKind"]) =>
  kind === "housing" || kind === "right_to_move_in" || kind === "presale_right";

/**
 * 분자·분모(number)에서 지분 모드 여부 판정. 단일 진실 공급원.
 * 분자 < 분모이고 둘 다 양수면 true (지분 모드). 100/100, 50/50 등 분자=분모는 false (단독).
 * NaN·0·음수 등 비정상 입력은 false (안전 fallback).
 */
export function isFractionalRatio(numerator: number, denominator: number): boolean {
  if (!isFinite(numerator) || !isFinite(denominator)) return false;
  if (denominator <= 0 || numerator <= 0) return false;
  return numerator < denominator;
}

/**
 * 분자·분모(string)에서 지분 모드 여부 판정. UI 폼 필드 전용 어댑터.
 */
export function isFractionalRatioStr(numerator: string, denominator: string): boolean {
  return isFractionalRatio(parseFloat(numerator), parseFloat(denominator));
}

/**
 * 자산의 공유 지분 비율을 [0..1] 실수로 계산.
 * 미설정/단독 소유 시 1.0. 분모 ≤ 0 또는 NaN 시 1.0 (안전 fallback).
 */
export function getOwnershipRatio(asset: AssetForm): number {
  const n = parseFloat(asset.ownershipNumerator || "100");
  const d = parseFloat(asset.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0) return 1.0;
  return Math.min(n / d, 1.0);
}

/** 지분 모드 여부 (자산 단위 어댑터). isFractionalRatio 단일 진실 공급원에 위임. */
export function isFractionalOwnership(asset: AssetForm): boolean {
  return isFractionalRatioStr(
    asset.ownershipNumerator || "100",
    asset.ownershipDenominator || "100",
  );
}

/**
 * ⑬ 1990.8.30. 이전 취득 토지 기준시가 환산 sub-object 빌드 (단건·다건 공용 단일 진실).
 *
 * 엔진 STEP 0.4(`transfer-tax.ts`)가 pre1990Land 존재 시 취득기준시가를 grade에서 재산출하고
 * acquisitionPrice=0·useEstimatedAcquisition=true를 override한다. 양도시 기준시가는 상위
 * standardPriceAtTransfer로 공급하므로 sub-object에 담지 않는다(pTsf 제거).
 *
 * 필수 필드(등급 3종·면적·1990 ㎡당가) 미충족 시 `{}` 반환 — 상위 spread에서 무해.
 */
export function buildPre1990LandPayload(
  primary: AssetForm,
  transferDate: string,
): { pre1990Land: object } | Record<string, never> {
  const buildGrade = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return primary.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(primary.pre1990Grade_current ?? "");
  const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
  const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
  const areaSqm = parseFloat((primary.acquisitionArea ?? "").replace(/,/g, "")) || 0;
  const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
  if (!gCur || !gPrev || !gAcq || areaSqm <= 0 || p1990 <= 0) return {};
  return {
    pre1990Land: {
      acquisitionDate: primary.acquisitionDate,
      transferDate,
      areaSqm,
      pricePerSqm_1990: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    },
  };
}

/** 100% 기준 금액에 지분 비율을 적용 (정수 floor). */
export function applyRatio(amount: number, ratio: number): number {
  return Math.floor(amount * ratio);
}

/**
 * 자산별 effective transferExpense 계산 (B3 폼-수준 안분 로직).
 * 우선순위:
 *   1. 자산-수준 transferExpense 직접 입력 (>0): 지분 모드 시 × ratio, 단독 모드는 그대로
 *   2. 폼-수준 totalTransferExpense × ratio (지분 모드 + 자산-수준 미입력)
 *   3. 폼-수준 totalTransferExpense 그대로 (단독 모드 — 일반적으로 미사용)
 *   4. 0
 */
export function effectiveTransferExpenseFor(
  asset: AssetForm,
  ratio: number,
  fractional: boolean,
  totalTransferExpense?: number,
): number {
  const direct = parseAmount(asset.transferExpense);
  if (direct > 0) {
    return fractional ? applyRatio(direct, ratio) : direct;
  }
  if (fractional && totalTransferExpense && totalTransferExpense > 0) {
    return applyRatio(totalTransferExpense, ratio);
  }
  return 0;
}


/**
 * 자산 1건 → 번들 companionAssets 배열 항목 변환.
 *
 * 지분 모드(ownershipRatio < 1.0): 사용자 입력값은 100% 기준이므로 × ratio 자동 적용.
 * 영향 필드: fixedSalePrice·fixedAcquisitionPrice·directExpenses·capitalExpenditure·transferExpense·publishedValueAtInheritance.
 *
 * @param totalTransferExpense 폼-수준 총 양도비 (B3) — 자산-수준 transferExpense가 0이면 ratio 안분으로 자동 사용.
 */
export function buildAssetPayload(
  asset: AssetForm,
  bundledSaleMode: "actual" | "apportioned",
  transferDate: string,
  totalContractPrice?: number,
  totalTransferExpense?: number,
  primary?: AssetForm,
  // 1세대1주택 여부는 세대 단위 — asset.isOneHousehold(기본 false·동기화 부재)가 아닌
  // form.isOneHousehold(Step4 "1세대 해당" 토글)를 세대 단위 단일 소스로 전달받는다.
  formIsOneHousehold?: boolean,
) {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause, asset.expropriationNoticeDate);

  // 증환지 증가분: standardPriceAtTransfer 빈값 시 당초분(primary) ㎡당 × 증가분 면적 파생.
  // UI live fallback(AssetSectionTransfer)과 동일 규칙 — 증가분 추가 순서 무관하게 안분 키 도달 보장.
  const replotIncStdAtTransfer =
    parseAmount(asset.standardPriceAtTransfer) > 0 || !asset.isReplotIncrement || !primary
      ? undefined
      : (() => {
          const p = parseAmount(primary.standardPricePerSqmAtTransfer);
          const a = parseFloat((asset.transferArea || "").replace(/,/g, ""));
          return p > 0 && a > 0 ? Math.floor(p * a) : undefined;
        })();

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  // 공유 지분 비율 — 단독 소유는 1.0, 지분 모드는 < 1.0
  const ratio = getOwnershipRatio(asset);
  const fractional = ratio < 1.0;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: asset.inheritanceAssetKind,
          landAreaM2: effectiveLandArea,
          // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
          publishedValueAtInheritance: fractional
            ? applyRatio(parseAmount(asset.publishedValueAtInheritance), ratio)
            : parseAmount(asset.publishedValueAtInheritance),
        }
      : undefined;

  const fixedAcqRaw =
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice) ||
    // 사례 28 — 신축(자가건축): fixedAcquisitionPrice = 신축비용(취득가액)
    (asset.acquisitionCause === "newConstruction" && asset.fixedAcquisitionPrice)
      ? parseAmount(asset.fixedAcquisitionPrice)
      : undefined;

  // 사례 28 — 신축(자가건축): 4시점 중 가장 빠른 날을 acquisitionDate로 자동 도출 (영 §162①4호).
  // UI 측 onChange 자동 동기화의 fallback (페이지 reload 후 마운트 시 이미 입력된 데이터에 대비).
  const newConstructionAcqDate =
    asset.acquisitionCause === "newConstruction"
      ? (() => {
          const dates = [
            asset.occupancyApprovalDate,
            asset.approvalCertificateDate,
            asset.temporaryApprovalDate,
            asset.actualUseDate,
          ].filter((d): d is string => !!d && d.length === 10);
          return dates.length > 0 ? dates.sort()[0] : undefined;
        })()
      : undefined;
  const fixedAcquisitionPrice = fixedAcqRaw !== undefined && fractional
    ? applyRatio(fixedAcqRaw, ratio)
    : fixedAcqRaw;

  // 양도가액 결정: 지분 모드는 contractTotalPrice × ratio (사용자 actualSalePrice 무시).
  // 단독은 기존 동작 — actualSalePrice 입력값 사용.
  const fixedSalePriceRaw =
    bundledSaleMode === "actual" && asset.actualSalePrice
      ? parseAmount(asset.actualSalePrice)
      : undefined;
  const fixedSalePrice = fractional && totalContractPrice && totalContractPrice > 0
    ? applyRatio(totalContractPrice, ratio)
    : fixedSalePriceRaw;

  return {
    assetId: asset.assetId,
    assetLabel: asset.assetLabel,
    assetKind: toEngineAssetKind(asset.assetKind),
    // ④ 공익수용 §164⑨ 1호 특례 — **컴패니언 자산도 지원**(계획 Q5).
    // `transferCause`는 §77 감면용으로 이미 위 스키마에 있으나, min[] 3후보 값은 여기서 실어야
    // `buildCompanionEngineInputs`가 엔진 input에 매핑할 수 있다(⑫ 컴패니언 스키마 동반 필수).
    //
    // ⚠️ **적격 자산일 때만 전송**(UI 노출 조건과 동일 — `isExprValuationEligibleAssetKind`).
    //    무게이트로 두면 안 되는 이유: `bundled-split-helpers.ts:190`이 컴패니언 propertyType을
    //    `housing|building` 외 **전부 "land"로 뭉갠다**. 상가 컴패니언에 stale 보상값이 남아 있으면
    //    **토지 의미로 특례가 잘못 발동**한다. 여기서 막으면 원천 차단된다.
    ...(isExprValuationEligibleAssetKind(asset.assetKind)
      ? {
          standardPricePerSqmAtTransfer:
            parseAmount(asset.standardPricePerSqmAtTransfer) || undefined,
          transferArea: parseFloat(asset.transferArea) || undefined,
          compensationPerSqm: parseAmount(asset.compensationPerSqm) || undefined,
          compensationBasisStdPrice: parseAmount(asset.compensationBasisStdPrice) || undefined,
        }
      : {}),
    // §164⑨2호 공매·경락 (P4) — 컴패니언도 지원(1호와 대칭). 적격 자산(land·building·housing)만 전송.
    ...(isAuctionEligibleAssetKind(asset.assetKind)
      ? {
          isAuctionTransfer: asset.isAuctionTransfer || undefined,
          auctionPrice: parseAmount(asset.auctionPrice) || undefined,
        }
      : {}),
    // §164⑨1호 주택 총액 트랙 (P5) — 컴패니언 주택도 지원. 주택일 때만 전송.
    ...(isHousingExprEligibleAssetKind(asset.assetKind)
      ? {
          housingCompensationTotal: parseAmount(asset.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(asset.housingCompensationBasisTotal) || undefined,
        }
      : {}),
    standardPriceAtTransfer:
      parseAmount(asset.standardPriceAtTransfer) > 0
        ? parseAmount(asset.standardPriceAtTransfer)
        : replotIncStdAtTransfer,
    standardPriceAtAcquisition:
      asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition && asset.standardPriceAtAcq
        ? parseAmount(asset.standardPriceAtAcq)
        : undefined,
    directExpenses: fractional
      ? applyRatio(parseAmount(asset.directExpenses), ratio)
      : parseAmount(asset.directExpenses),
    // §97② 단서 swap 분리 입력 — 자산-수준 자본적 지출·양도비.
    // 지분 모드: 100% 기준 입력값에 × ratio 자동 적용.
    // 양도비는 자산-수준 직접 입력 우선, 0이면 폼-수준 totalTransferExpense × ratio fallback (B3).
    capitalExpenditure: (() => {
      const directCapex = parseAmount(asset.capitalExpenditure);
      const directExp = parseAmount(asset.transferExpense);
      const effExpense = effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense);
      // capex/transferExpense 또는 effExpense 중 하나라도 있으면 swap 분리 활성
      if (!directCapex && !directExp && !effExpense) return undefined;
      return fractional ? applyRatio(directCapex, ratio) : directCapex;
    })(),
    transferExpense: effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense) || undefined,
    reductions,
    inheritanceValuation,
    fixedAcquisitionPrice,
    // 세대 단위 — form.isOneHousehold(토글) 사용. asset.isOneHousehold는 UI 미동기화(기본 false)라
    // companion 주택이 일괄양도에서 항상 1세대1주택 비과세 미적용되던 버그 정정.
    isOneHousehold: formIsOneHousehold ?? asset.isOneHousehold,
    fixedSalePrice,
    /** 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정) */
    totalPropertyTransferPrice: fractional ? totalContractPrice : undefined,
    acquisitionCause: asset.acquisitionCause,
    useEstimatedAcquisition:
      asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
    acquisitionDate: asset.acquisitionDate || newConstructionAcqDate || undefined,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 (§99의3 등 13개 매매계약일 기준 조문)
    assetContractDate: asset.assetContractDate || undefined,
    decedentAcquisitionDate:
      asset.acquisitionCause === "inheritance" && asset.decedentAcquisitionDate
        ? asset.decedentAcquisitionDate
        : undefined,
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      asset.acquisitionCause === "inheritance"
        ? asset.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      asset.acquisitionCause === "inheritance" && asset.decedentCohabitationHoldingStartDate
        ? asset.decedentCohabitationHoldingStartDate
        : undefined,
    decedentCohabitationResidenceMonths:
      asset.acquisitionCause === "inheritance" && asset.decedentSameHouseholdBeforeInheritance
        ? parseInt(asset.decedentCohabitationResidenceMonths) || 0
        : undefined,
    donorAcquisitionDate:
      asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
        ? asset.donorAcquisitionDate
        : asset.acquisitionCause === "carryover_gift" && asset.carryover?.donorAcquisitionDate
        ? asset.carryover.donorAcquisitionDate
        : undefined,
    // 이월과세(증여) 전용 서브객체 — carryover_gift 시만 빌드
    // "general" 환산 모드에서 topLevelOverrides.standardPrice* 를 최상위에 주입
    ...(() => {
      const cp = buildCarryoverPayload(asset, transferDate);
      if (!cp) return {};
      return {
        carryoverTaxation: cp.carryoverTaxation,
        ...cp.topLevelOverrides,
      };
    })(),
    // ⑬ 사례 28 — companion 토지 세율 수동 오버라이드 (부수토지 일체과세 §89·영§154⑦)
    // undefined이면 엔진 자동 분기. 빈 문자열·null은 undefined로 정규화.
    manualHoldingPeriodOverride: asset.manualHoldingPeriodOverride ?? undefined,
    // ⑬ 토지 성질 명시 입력 (landNature) — 폼 enum → 엔진 enum 변환
    // 폼: "appurtenant"/"standalone" → 엔진: "appurtenant_to_housing"/"non_appurtenant"
    ...(asset.assetKind === "land" && asset.landNature !== undefined
      ? {
          landNature:
            asset.landNature === "appurtenant"
              ? ("appurtenant_to_housing" as const)
              : ("non_appurtenant" as const),
        }
      : {}),
    // ⑬ 사례 28 — companion 신축주택 정착면적·도시지역·4시점 (자동 분기용)
    // primary가 land이고 companion이 housing인 케이스에서 부수토지 한도 산정.
    ...(asset.acquisitionCause === "newConstruction"
      ? {
          buildingFootprintArea: asset.buildingFootprintArea
            ? parseFloat(asset.buildingFootprintArea)
            : undefined,
          isUrbanArea: asset.isUrbanArea,
          appurtenantLandZone: asset.appurtenantLandZone,
          occupancyApprovalDate: asset.occupancyApprovalDate || undefined,
          approvalCertificateDate: asset.approvalCertificateDate || undefined,
          temporaryApprovalDate: asset.temporaryApprovalDate || undefined,
          actualUseDate: asset.actualUseDate || undefined,
        }
      : {}),
  };
}

// ─── 재개발/재건축 (시행령 §166) — RedevelopmentInfo 서브객체 변환 ───
// buildRedevelopmentPayload는 800줄 정책에 따라 transfer-tax-api-redev.ts로 분리 (2026-05-15).
export { buildRedevelopmentPayload } from "./transfer-tax-api-redev";

/**
 * ⑬ 공익수용 양도당시 기준시가 차감 특례 (**소득세법 시행령 §164⑨ 1호**) 엔진 input 필드.
 * 엔진이 게이트(환산·수용·2009.02.04) 판정 — 여기선 원값만 전달(변환 계층 — 게이트 아님).
 * 원/㎡=parseAmount(정수), 면적=parseFloat(소수 ㎡).
 *
 * 자산종류 게이트는 **UI·validate·엔진 3층 모두**에 있다(계획 Q4 — 3층 명시).
 * 판정은 `lib/tax-engine/expropriation-scope.ts` **단일 소스** 위임 — 세 층이 같은 목록을 조회한다.
 */
export function buildExpropriationInput(primary: AssetForm) {
  return {
    transferCause: primary.transferCause,
    // §164⑨1호 per-sqm(가~다목) — **per-sqm 적격 자산일 때만** 전송(`buildAssetPayload` 컴패니언과 대칭).
    // ⚠️ 무게이트면 land→housing 전환 시 stale per-sqm 값이 주택 총액 트랙을 침묵 shadowing한다
    //    (엔진도 housing 배제로 방어하나 여기서도 원천 차단 — 코드리뷰 2026-07-16).
    ...(isExprValuationEligibleAssetKind(primary.assetKind)
      ? {
          standardPricePerSqmAtTransfer: parseAmount(primary.standardPricePerSqmAtTransfer) || undefined,
          transferArea: parseFloat(primary.transferArea) || undefined,
          compensationPerSqm: parseAmount(primary.compensationPerSqm) || undefined,
          compensationBasisStdPrice: parseAmount(primary.compensationBasisStdPrice) || undefined,
        }
      : {}),
    // §164⑨2호 공매·경락 (P4) — **적격 자산(land·building)일 때만** 전송(UI 노출 조건과 동일).
    // ⚠️ 무게이트면 assetKind를 land→housing으로 바꿔도 stale isAuctionTransfer가 남아
    //    housing(2호는 면적 게이트가 없음)에 침묵 발동한다. 여기서 원천 차단(코드리뷰 2026-07-16).
    ...(isAuctionEligibleAssetKind(primary.assetKind)
      ? {
          isAuctionTransfer: primary.isAuctionTransfer || undefined,
          auctionPrice: parseAmount(primary.auctionPrice) || undefined,
        }
      : {}),
    // §164⑨1호 주택 총액 트랙 (P5) — 주택일 때만 전송(엔진이 게이트).
    ...(isHousingExprEligibleAssetKind(primary.assetKind)
      ? {
          housingCompensationTotal: parseAmount(primary.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(primary.housingCompensationBasisTotal) || undefined,
        }
      : {}),
    // §164⑨1호 건물 split 토지분 트랙 (P6/D6) — 건물 자산일 때만 전송(엔진이 split·수용·환산 게이트).
    // 토지·건물 취득일 분리 양도 시 토지분 환산 분모만 낮춘다. 주택 split은 Q6 미지원(validate 차단).
    ...(isSplitLandExprEligibleAssetKind(primary.assetKind)
      ? {
          splitLandCompensationTotal: parseAmount(primary.splitLandCompensationTotal) || undefined,
          splitLandCompensationBasisTotal: parseAmount(primary.splitLandCompensationBasisTotal) || undefined,
        }
      : {}),
  };
}

// ─── ④⑬ §156의2⑤ 대체주택 비과세 특례 FLAT → nested (TS 미감지 영역 — 누락 시 침묵 strip) ───
/** 폼 → replacementHouse nested payload. 토글 OFF 또는 필수 날짜 미입력 시 {} */
export function buildReplacementHousePayload(form: TransferFormData): object {
  if (!form.replacementHouseSpecial || !form.replBusinessApprovalDate || !form.replCompletionDate)
    return {};
  return {
    replacementHouse: {
      businessApprovalDate: form.replBusinessApprovalDate,
      completionDate: form.replCompletionDate,
      replacementResidenceMonths: parseInt(form.replResidenceMonths || "0", 10),
      willResideNewHouse: form.replWillResideNewHouse,
    },
  };
}
