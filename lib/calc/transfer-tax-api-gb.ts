/**
 * ④ 일반건물(토지+건물 일괄) API 변환 헬퍼 (소령 §176의2②, §163⑥, §166⑥, §163⑨).
 *
 * `transfer-tax-api-helpers.ts` 800줄 정책에 따라 GB 전용 변환(buildExtensionInfo·
 * buildGeneralBuildingValuation)을 분리. 함수 로직 변경 없이 순수 추출 + §163⑨ 상속 게이트.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

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
 * 상속(§163⑨): 상속개시일 평가액을 취득당시 실지거래가액으로 직접 배정(환산·개산공제 미적용).
 *   Phase 1 = C1(토지·건물 모두 상속, actual 모드). 게이트 acquisitionByInheritance로 격리.
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

  // §163⑨ 상속 취득가액 직접 산정 게이트 (Phase 1 = C1). 계획서 §4-5:
  // acquisitionByInheritance = acquisitionCause==="inheritance" && 취득일>=1985-01-01.
  const acquisitionByInheritance =
    asset.acquisitionCause === "inheritance" && (asset.acquisitionDate ?? "") >= "1985-01-01";
  const buildingAcquisitionByInheritance =
    asset.gbBuildingAcquisitionCause === "inheritance" &&
    ((asset.gbBuildingAcquisitionDate || asset.acquisitionDate) ?? "") >= "1985-01-01";
  // 두 분기 공통 상속 필드 (실가 모드=C1 경로에서 소비, 환산 모드=C2는 validate 차단이나 대칭 전달).
  const gbInheritanceFields = {
    ...(acquisitionByInheritance
      ? {
          acquisitionByInheritance,
          inheritedLandValue: parseAmount(asset.publishedValueAtInheritance) || undefined,
        }
      : {}),
    ...(buildingAcquisitionByInheritance
      ? {
          buildingAcquisitionByInheritance,
          inheritedBuildingValue: parseAmount(asset.gbBuildingInheritedValue) || undefined,
        }
      : {}),
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
      // §97②2호 단서 swap(자산총액) — G2(전체환산)·G4(NBL)·G3(증축) 공통.
      // capitalExpenditure는 항상 전달 — bundledExpenses fallback(transferExpense·directExpenses)에
      //   포함되지 않아 증축에서도 이중소비 없음.
      ...(parseAmount(asset.capitalExpenditure)
        ? { capitalExpenditure: parseAmount(asset.capitalExpenditure) }
        : {}),
      // ⚠️ transferExpense는 **비-증축만**. 증축(gbHasExtension)에서는 위 bundledExpenses legacy
      //   fallback으로 소비될 수 있어(F1) swap 나목에 재사용 시 이중차감 → 제외(decision b).
      //   증축 원건물 실가 모드에서는 양도비가 이미 실가 필요경비로 차감되므로 법령상으로도 정합.
      ...(!asset.gbHasExtension && parseAmount(asset.transferExpense)
        ? { transferExpense: parseAmount(asset.transferExpense) }
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
    // §95④ 단기보유 기산점 — actual 분기 기존 결측 보강 (토지 취득원인·피상속인/증여자 취득일).
    ...(asset.acquisitionCause && asset.acquisitionCause !== "newConstruction"
      ? { landAcquisitionCause: asset.acquisitionCause }
      : {}),
    ...(asset.decedentAcquisitionDate ? { decedentAcquisitionDate: asset.decedentAcquisitionDate } : {}),
    ...(asset.donorAcquisitionDate ? { donorAcquisitionDate: asset.donorAcquisitionDate } : {}),
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1)
    ...gbInheritanceFields,
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
