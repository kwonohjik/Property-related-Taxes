/**
 * 재산세 토지 — 분리과세 선택 경로의 결과 조립 (지방세법 §106①3호 · property-tax.ts 800줄 정책 분리).
 * 판정·단일세율은 `separate-taxation.ts`(`calculateSeparateTax`)가 그대로 맡는다 — 이 파일은 세부담상한·부가세·결과 조립만 한다.
 */
import { PROPERTY, PROPERTY_SEPARATE, COMPREHENSIVE_LAND } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateSeparateTax, isExcludedFromComprehensiveTax } from "./separate-taxation";
import { getPropertyRateSet } from "./data/property-rate-history";
import { applyTaxCap } from "./property-tax-housing-cap";
import { calcSurtax, calcInstallment } from "./property-tax-surtax";
import { buildCapEcho } from "./property-tax-cap-echo";
import { buildTaxpayerOutcome } from "./property-taxpayer";
import type { LandSplitBranchContext } from "./property-tax-land-split";
import type { PropertyTaxResult } from "./types/property.types";

export function calculateSeparatedPropertyTax(ctx: LandSplitBranchContext): PropertyTaxResult {
  const { input, targetDate, taxYear, legalBasis, warnings } = ctx;
  const taxpayerResult = ctx.taxpayerResult;
  const coShares = ctx.coShares;
  const sepInput = {
    assessedValue: input.publishedPrice,
    ...(input.separateTaxationItem ?? {}),
  };
  const sepResult = calculateSeparateTax(sepInput, getPropertyRateSet(taxYear));

  warnings.push(...sepResult.warnings);
  if (sepResult.reasoning.legalBasis) {
    legalBasis.push(sepResult.reasoning.legalBasis);
  }
  legalBasis.push(PROPERTY.SEPARATE.EXCLUDE_COMPREHENSIVE);

  if (!sepResult.isApplicable) {
    // 허가·사용승인 미이행 공장용 건축물(§102①1호 단서) — 별도합산도 §101① 단서로 같은 건축물을
    // 제외하므로 재입력 후 최종 과세는 종합합산이다(별도합산 안내 금지).
    const factoryUnpermitted =
      input.separateTaxationItem?.isFactoryLand === true &&
      input.separateTaxationItem.factoryIsUnpermitted === true;
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      factoryUnpermitted
        ? "분리과세 대상 요건을 충족하지 않습니다 — 허가 또는 사용승인을 받지 않은 공장용 건축물의 " +
          `부속토지입니다(${PROPERTY.SEPARATE.STANDARD_FACTORY} 단서). 별도합산으로 입력해도 ` +
          `${PROPERTY_SEPARATE.BUILDING_PERMIT_101}에 따라 같은 건축물의 부속토지가 제외되므로 ` +
          "종합합산 과세 유형으로 재입력하세요."
        : "분리과세 대상 요건을 충족하지 않습니다. " +
          "종합합산 또는 별도합산 과세 유형으로 재입력하세요.",
    );
  }

  const separatedTaxBase = sepResult.taxBase ?? 0;
  const separatedTax = sepResult.calculatedTax ?? 0;
  const isExcluded = isExcludedFromComprehensiveTax(sepResult);

  // 세부담상한 (150%)
  const capResult = applyTaxCap(
    separatedTax,
    input.objectType,
    input.previousYearTax,
  );
  warnings.push(...capResult.warnings);
  legalBasis.push(capResult.legalBasis);

  // 부가세
  const surtaxSep = calcSurtax(
    capResult.determinedTax,
    separatedTaxBase,
    input.publishedPrice,
    input.objectType,
    input.isUrbanArea ?? false,
  );
  legalBasis.push(...surtaxSep.legalBasis);
  const installmentSep = calcInstallment(capResult.determinedTax, input.objectType);
  const totalPayableSep = capResult.determinedTax + surtaxSep.totalSurtax;

  if (isExcluded) {
    warnings.push(
      `분리과세 대상 토지는 종합부동산세 과세 대상에서 제외됩니다 (${COMPREHENSIVE_LAND.AGGREGATE_TAXPAYER}).`,
    );
  }

  return {
    publishedPrice: input.publishedPrice,
    fairMarketRatio: sepResult.fairMarketRatio ?? 0.70,
    taxBase: separatedTaxBase,
    appliedRate: sepResult.appliedRate ?? 0,
    calculatedTax: separatedTax,
    calculatedTaxBeforeCap: separatedTax,
    taxCapRate: capResult.taxCapRate,
    determinedTax: capResult.determinedTax,
    surtax: surtaxSep.surtax,
    totalSurtax: surtaxSep.totalSurtax,
    totalPayable: totalPayableSep,
    installment: installmentSep,
    oneHouseSpecialApplied: false,
    legalBasis: [...new Set(legalBasis)],
    warnings,
    targetDate,
    ...buildCapEcho(input, input.previousYearTax, taxYear - 1),
    ...buildTaxpayerOutcome(taxpayerResult, coShares, capResult.determinedTax, totalPayableSep),
  };
}
