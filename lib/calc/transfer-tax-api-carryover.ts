/**
 * 이월과세(증여) carryoverTaxation API 페이로드 빌드 헬퍼
 * transfer-tax-api.ts 800줄 정책에 따라 분리 (2026-05-04).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/**
 * buildCarryoverPayload 반환 타입.
 * carryoverTaxation 서브객체 + 최상위 TransferTaxInput override 필드.
 */
export interface CarryoverPayloadResult {
  /** carryoverTaxation 서브객체 */
  carryoverTaxation: object;
  /**
   * 최상위 TransferTaxInput에 spread할 override 필드.
   * "general" 환산 모드에서 standardPriceAtAcquisition/Transfer 주입에 사용.
   */
  topLevelOverrides: {
    standardPriceAtAcquisition?: number;
    standardPriceAtTransfer?: number;
    useEstimatedAcquisition?: boolean;
  };
}

/**
 * carryoverTaxation 서브객체 + 최상위 override 빌드 — acquisitionCause === "carryover_gift" 시만.
 *
 * 환산 모드별 처리:
 * - estimationMode === "general": donorStandardPriceAtAcquisition/Transfer를 최상위 standardPrice로 주입.
 *   엔진이 직접 기준시가 환산 공식을 적용 (§97 ① 1호 나목, 시행령 §163 ⑨).
 * - estimationMode === "phd": 기존 PHD(preHousingDisclosure) 경로 사용 — 최상위 override 없음.
 * - estimationMode === "apd": APD(preHousingDisclosure) 경로 사용 — 최상위 override 없음.
 * - useEstimatedAcquisition === false: donorAcquisitionPrice 직접 사용.
 *
 * 시행시기 가드: 양도일 < 2024-01-01 이면 donorCapitalExpenditure = 0 처리.
 */
export function buildCarryoverPayload(
  asset: AssetForm,
  transferDate: string,
): CarryoverPayloadResult | undefined {
  if (asset.acquisitionCause !== "carryover_gift" || !asset.carryover) return undefined;
  const c = asset.carryover;
  if (!c.giftRegistryDate || !c.donorAcquisitionDate) return undefined;

  const isAfter2024 = transferDate >= "2024-01-01";
  const rawCapex = parseAmount(c.donorCapitalExpenditure);
  const capex = isAfter2024 && rawCapex > 0 ? rawCapex : 0;
  const donorAcqPrice = parseAmount(c.donorAcquisitionPrice);

  // "general" 환산 모드 — donorStandard* 필드를 최상위 standardPrice* 로 override.
  // 엔진이 useEstimatedAcquisition=true + standardPriceAtAcquisition/Transfer로 환산.
  const isGeneralEstimation = c.useEstimatedAcquisition && c.estimationMode === "general";
  const donorStdAtAcq = parseAmount(c.donorStandardPriceAtAcquisition);
  const donorStdAtTransfer = parseAmount(c.donorStandardPriceAtTransfer);

  const topLevelOverrides: CarryoverPayloadResult["topLevelOverrides"] = isGeneralEstimation
    ? {
        standardPriceAtAcquisition: donorStdAtAcq > 0 ? donorStdAtAcq : undefined,
        standardPriceAtTransfer: donorStdAtTransfer > 0 ? donorStdAtTransfer : undefined,
        // useEstimatedAcquisition은 최상위에서 true로 유지 (엔진 환산 트리거)
        useEstimatedAcquisition: true,
      }
    : {};

  const carryoverTaxation = {
    giftRegistryDate: c.giftRegistryDate,
    donorAcquisitionDate: c.donorAcquisitionDate,
    donorAcquisitionPrice:
      !c.useEstimatedAcquisition && donorAcqPrice > 0 ? donorAcqPrice : undefined,
    useEstimatedAcquisition: c.useEstimatedAcquisition,
    giftTaxAmount: parseAmount(c.giftTaxAmount),
    donorCapitalExpenditure: capex > 0 ? capex : undefined,
    giftDateValuation: parseAmount(c.giftDateValuation),
    // §97의2① 관계요건 — 미선택("")·미사망(false)은 전송하지 않는다(엔진 기본값과 동치).
    donorRelation: c.donorRelation || undefined,
    donorDeceased: c.donorDeceased || undefined,
    exclusionDeclared: {
      expropriationWithin2Years: c.exclusionDeclared.expropriationWithin2Years || undefined,
      oneHouseExemptionApplies: c.exclusionDeclared.oneHouseExemptionApplies || undefined,
      isFamilyBusinessInheritedAsset:
        c.exclusionDeclared.isFamilyBusinessInheritedAsset || undefined,
    },
  };

  return { carryoverTaxation, topLevelOverrides };
}
