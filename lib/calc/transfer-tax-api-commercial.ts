/**
 * ④ 상업용건물·오피스텔 환산취득가 API 변환 헬퍼 (소령 §164⑥, §176조의2②2호).
 *
 * `transfer-tax-api-helpers.ts` 800줄 정책에 따라 분리 (2026-08-23).
 * 옮긴 것은 위치뿐이고 술어·게이트·반환 shape은 그대로다.
 * 종전 import 경로 호환을 위해 helpers가 재export한다 — `transfer-tax-api-gb.ts`와 같은 형태.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { effectiveCommercialLandPriceAtAcq } from "./transfer-pre1990-commercial-bridge";
import { resolveCbEra } from "./commercial-cb-era";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

// ─── ④ 상업용건물·오피스텔 환산취득가 API 변환 헬퍼 (소령 §164⑥, §176조의2②2호) ───

/**
 * AssetForm → `commercialAppurtenantLand` 서브객체 변환 (⑬).
 *
 * 부수토지 초과분 비사업용 판정(「지방세법 시행령」 §101①2호·§101②) 입력.
 * **취득방법과 무관**하게 동작하므로 아래 환산 전용 변환과 게이트가 다르다.
 *
 * 두 면적이 모두 입력됐을 때만 payload를 만든다 — 하나만 있으면 판정이 불가능하고,
 * 부분 입력을 보내면 API refine이 400을 내 사용자가 원인을 알기 어렵다.
 * ⑧ validate가 같은 조건("둘 다 입력 or 둘 다 공란")을 강제한다.
 */
export function buildCommercialAppurtenantLand(asset: AssetForm): object | undefined {
  if (asset.assetKind !== "commercial_building") return undefined;

  const totalLandArea = parseDecimal(asset.cbTotalLandArea);
  const totalBuildingFootprintArea = parseDecimal(asset.cbTotalBuildingFootprintArea);
  if (!(totalLandArea > 0) || !(totalBuildingFootprintArea > 0)) return undefined;

  return {
    totalLandArea,
    totalBuildingFootprintArea,
    // §101① 단서 해당 시 배율이 불필요하므로 용도지역을 보내지 않아도 API refine을 통과한다.
    ...(asset.cbUnapprovedBuilding ? {} : { zoneType: asset.cbZoneType || undefined }),
    ...(asset.cbUnapprovedBuilding ? { unapprovedBuilding: true } : {}),
  };
}

/**
 * AssetForm cb* 필드 → commercialBuildingValuation 서브객체 변환.
 * 필수 필드 미입력 시 undefined 반환 — validate에서 먼저 차단되므로 silent 처리.
 * ⑧ 주의: validate와 동일 조건으로 undefined 반환. UI 통과 → 여기서 undefined → 엔진 미도달 방지.
 */
export function buildCommercialBuildingValuation(
  asset: AssetForm,
  transferDate = "",
): object | undefined {
  if (asset.assetKind !== "commercial_building" || !asset.useEstimatedAcquisition) {
    return undefined;
  }
  // 취득일에서 자동 판정(2005-01-01 경계) — UI 표시·validate와 **같은 함수**를 쓴다(3중 패턴).
  const era = resolveCbEra(asset);
  if (!era) return undefined;

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

  // isPreDisclosure — 적용 cbEra(명시 선택 ?? 취득일 파생)가 "pre_disclosure" 이면 true
  const isPreDisclosure = era === "pre_disclosure";

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
    // §164④ — 취득 1990-08-30 이전이면 가목의 가액이 없어 토지등급 환산값을 쓴다(⑧ 동일 fallback).
    const landAtAcq = effectiveCommercialLandPriceAtAcq(asset, transferDate);
    const landAtFirst = parseAmount(asset.cbLandPricePerSqmAtFirst);
    if (!buildingAtAcq || !buildingAtFirst || !buildingAtTransfer
        || !landAtAcq || !landAtFirst) {
      return undefined;
    }
    // §164⑧ 준용(괄호 단서) 보조 입력 — 값이 있을 때만 전달. 미전달 시 엔진은 탐지만 한다.
    const prevSum = parseAmount(asset.cbPrevStdPriceSum);
    const adjustMonths = parseInt((asset.cbStdPriceAdjustMonths || "").replace(/,/g, ""), 10);
    return {
      ...base,
      buildingStdPriceAtAcquisition: buildingAtAcq,
      buildingStdPriceAtFirstDisclosure: buildingAtFirst,
      buildingStdPriceAtTransfer: buildingAtTransfer,
      landPriceAtAcquisition: landAtAcq,
      landPriceAtFirstDisclosure: landAtFirst,
      ...(prevSum > 0 && { prevStdPriceSum: prevSum }),
      ...(Number.isFinite(adjustMonths) && adjustMonths > 0 && { stdPriceAdjustMonths: adjustMonths }),
    };
  }

  // post_disclosure: 취득시 개별공시지가 필수 (취득 ≥2005이므로 §164④ 구간은 아니나 fallback 동일)
  const landAtAcq = effectiveCommercialLandPriceAtAcq(asset, transferDate);
  if (!landAtAcq) return undefined;
  return { ...base, landPriceAtAcquisition: landAtAcq };
}
