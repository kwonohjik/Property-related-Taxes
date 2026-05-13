/**
 * 양도소득세 API 변환 헬퍼 — toEngineReductions + buildAssetPayload (companionAssets용)
 * transfer-tax-api.ts 800줄 정책에 따라 분리.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";

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
): "housing" | "land" | "building" | "commercial_building" | "general_building" {
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

  // 공통 base 필드
  const base = {
    extensionDate,                               // string — route handler에서 toOptionalDate 변환 (⑭)
    ...(extensionArea ? { extensionArea } : {}), // 선택 필드: 미입력 시 미전달
    extensionAcquisitionCause: extensionCause,
    acquisitionMode: mode,
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
    // ── Phase 2 (2026-05-06): §99의3 신축주택 과세특례 본격 변환 ──
    if (r.type === "new_99_3") {
      return {
        type: "new_99_3" as const,
        contractDate993: r.contractDate993 || undefined,
        usageApprovalDate993: r.usageApprovalDate993 || undefined,
        standardPriceAt5Years: parseAmount(r.standardPriceAt5Years || "0"),
        standardPriceAtAcquisition993: parseAmount(r.standardPriceAtAcquisition993 || "0"),
        standardPriceAtTransfer993: r.standardPriceAtTransfer993
          ? parseAmount(r.standardPriceAtTransfer993)
          : undefined,
        region993: r.region993,
        acquisitionType993: r.acquisitionType993,
        hasOccupancyAtContract: r.hasOccupancyAtContract ?? false,
        isResident993: r.isResident993,
        isHousingConstructionBusiness993: r.isHousingConstructionBusiness993,
        // Round 10 (2026-05-06): PHD 환산 입력 (취득시 추정 공동주택가격 자동 산출)
        phdMode993: r.phdMode993 ?? false,
        phdFirstDisclosureDate993: r.phdFirstDisclosureDate993 || undefined,
        phdFirstDisclosurePrice993: r.phdFirstDisclosurePrice993
          ? parseAmount(r.phdFirstDisclosurePrice993)
          : undefined,
        phdLandAreaSqm993: r.phdLandAreaSqm993 ? parseFloat(r.phdLandAreaSqm993) : undefined,
        phdLandPricePerSqmAtAcq993: r.phdLandPricePerSqmAtAcq993
          ? parseAmount(r.phdLandPricePerSqmAtAcq993)
          : undefined,
        phdLandPricePerSqmAtFirst993: r.phdLandPricePerSqmAtFirst993
          ? parseAmount(r.phdLandPricePerSqmAtFirst993)
          : undefined,
        phdBuildingStdAtAcq993: r.phdBuildingStdAtAcq993
          ? parseAmount(r.phdBuildingStdAtAcq993)
          : undefined,
        phdBuildingStdAtFirst993: r.phdBuildingStdAtFirst993
          ? parseAmount(r.phdBuildingStdAtFirst993)
          : undefined,
      };
    }
    // ── Phase 1 stub 20종: 본 요건 미구현 — type만 전달 (엔진은 시한 검증만 수행) ──
    // 해당 ID들은 transfer.types.ts TransferReductionStub 정의 + Zod schema 통과 보장.
    // TypeScript narrowing이 모든 케이스를 소진해 never로 좁혀지므로 unknown 캐스트로 우회.
    const stubType = (r as unknown as { type: string }).type;
    return { type: stubType, _phase1Stub: true as const };
  });
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
) {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause);

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  // 공유 지분 비율 — 단독 소유는 1.0, 지분 모드는 < 1.0
  const ratio = getOwnershipRatio(asset);
  const fractional = ratio < 1.0;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "auto"
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
    (asset.acquisitionCause === "inheritance" && asset.inheritanceValuationMode === "manual" && asset.fixedAcquisitionPrice) ||
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
    standardPriceAtTransfer:
      parseAmount(asset.standardPriceAtTransfer) > 0
        ? parseAmount(asset.standardPriceAtTransfer)
        : undefined,
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
    isOneHousehold: asset.isOneHousehold,
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
