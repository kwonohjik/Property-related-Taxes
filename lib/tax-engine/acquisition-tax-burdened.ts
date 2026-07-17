/**
 * 부담부증여 취득세 — 유상/무상 분리 세액 + 부가세 (지방세법 §10의2⑥)
 *
 * 채무부담액(유상분)은 §10의3 유상승계, 잔액(무상분)은 §10의2 무상취득 과세표준.
 * 주택이면 유상분에 §13의2① 다주택 중과, 무상분에 §13의2② 증여 중과를 각각 반영하고,
 * 농특세·지방교육세도 두 부분에 각각 산출 후 합산한다.
 */

import type { AcquisitionTaxInput, BurdenedGiftBreakdown } from "./types/acquisition.types";
import { calcBurdenedGiftTax, calcTaxWithAdditional, SURCHARGE_BASE_STANDARD_RATE, type AdditionalTaxResult } from "./acquisition-tax-rate";
import { assessMultiHouseSurcharge, assessGiftSurcharge } from "./acquisition-tax-surcharge";

export interface BurdenedGiftComputation {
  acquisitionTax: number;
  breakdown: BurdenedGiftBreakdown;
  additional: AdditionalTaxResult;
}

/**
 * 부담부증여 세액·부가세 계산 (오케스트레이터 Step 7에서 호출)
 *
 * @param input           엔진 입력 (물건·취득자·조정지역·증여자 관계 등)
 * @param breakdown       과세표준 분리 결과 (유상분·무상분)
 * @param taxBase         전체 과세표준 (세율 구간 판정 기준)
 * @param resolvedHouseCount 취득 후 주택 수 (§13의2① 판정)
 */
export function computeBurdenedGiftResult(
  input: AcquisitionTaxInput,
  breakdown: { onerousTaxBase?: number; gratuitousTaxBase?: number },
  taxBase: number,
  resolvedHouseCount: number
): BurdenedGiftComputation {
  const { onerousTaxBase = 0, gratuitousTaxBase = 0 } = breakdown;

  // [H5] 주택이면 유상분에 §13의2① 다주택 중과, 무상분에 §13의2② 증여 중과를 각각 반영.
  // (기존에는 두 부분 모두 표준세율만 적용해 다주택자 부담부증여 중과가 통째 누락됐음.)
  let onerousSurchargeRate: number | undefined;
  let gratuitousSurchargeRate: number | undefined;
  if (input.propertyType === "housing") {
    const multi = assessMultiHouseSurcharge({
      acquiredBy: input.acquiredBy,
      isHousing: true,
      isRegulatedArea: input.isRegulatedArea ?? false,
      houseCount: resolvedHouseCount,
      isOnerousAcquisition: true, // 유상분(채무인수)은 유상거래로 판정
    });
    if (multi.isSurcharged && multi.surchargeRate !== undefined) {
      onerousSurchargeRate = multi.surchargeRate;
    }
    const gift = assessGiftSurcharge({
      isHousing: true,
      isRegulatedArea: input.isRegulatedArea ?? false,
      // R3-03: 단일주택 부담부증여 무상분도 wholeHouseStandardValue 미입력 시
      // 해당 주택 시가표준액으로 §13의2② 3억 임계 판정.
      wholeStdValue: input.wholeHouseStandardValue ?? input.standardValue ?? 0,
      giftorIs1HHHolder: input.giftorIs1HHHolder,
      giftorRelation: input.giftorRelation,
      specialRateType: input.specialRateType,
    });
    if (gift.isSurcharged && gift.surchargeRate !== undefined) {
      gratuitousSurchargeRate = gift.surchargeRate;
    }
  }

  const bg = calcBurdenedGiftTax(onerousTaxBase, gratuitousTaxBase, input.propertyType, taxBase, {
    onerousRate: onerousSurchargeRate,
    gratuitousRate: gratuitousSurchargeRate,
  });

  // [M5] 농특세·지방교육세도 유상분(매매세율)·무상분(증여세율)에 각각 산출 후 합산.
  // [R3-01/R3-02] 표준세율 기준 부가세: §13의2 중과분(유상 §13의2①·무상 §13의2②)은
  // §11①7나 4% 기준, 비중과분은 실제 적용세율(=표준세율) 기준.
  const onerousAdd = calcTaxWithAdditional(
    onerousTaxBase, bg.onerousRate, bg.onerousTax, input.propertyType, input.areaSqm,
    {
      acquisitionCause: "purchase",
      isSurcharged: onerousSurchargeRate !== undefined,
      isRuralRegion: input.isRuralRegion,
      basicRate: onerousSurchargeRate !== undefined ? SURCHARGE_BASE_STANDARD_RATE : bg.onerousRate,
    }
  );
  const gratuitousAdd = calcTaxWithAdditional(
    gratuitousTaxBase, bg.gratuitousRate, bg.gratuitousTax, input.propertyType, input.areaSqm,
    {
      acquisitionCause: "gift",
      isSurcharged: gratuitousSurchargeRate !== undefined,
      isRuralRegion: input.isRuralRegion,
      basicRate: gratuitousSurchargeRate !== undefined ? SURCHARGE_BASE_STANDARD_RATE : bg.gratuitousRate,
    }
  );

  return {
    acquisitionTax: bg.onerousTax + bg.gratuitousTax,
    breakdown: {
      onerousTaxBase,
      onerousTax: bg.onerousTax,
      gratuitousTaxBase,
      gratuitousTax: bg.gratuitousTax,
    },
    additional: {
      ruralSpecialTax: onerousAdd.ruralSpecialTax + gratuitousAdd.ruralSpecialTax,
      localEducationTax: onerousAdd.localEducationTax + gratuitousAdd.localEducationTax,
      ruralTaxBasis: onerousAdd.ruralTaxBasis,
      eduTaxBasis: onerousAdd.eduTaxBasis,
    },
  };
}
