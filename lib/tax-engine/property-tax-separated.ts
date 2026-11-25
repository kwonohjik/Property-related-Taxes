/**
 * 재산세 토지 — 분리과세 선택 경로의 결과 조립 (지방세법 §106①3호 · property-tax.ts 800줄 정책 분리).
 * 판정·단일세율은 `separate-taxation.ts`(`calculateSeparateTax`)가 그대로 맡는다 — 이 파일은 세부담상한·부가세·결과 조립만 한다.
 *
 * ## 면적 한도 초과분(PSE — 공장용지·목장용지, 영 §102①1호·3호)
 * 한도 밖 부분은 분리과세가 아니다 → 별도합산이 아니면 종합합산(법 §106①1호). 한도 안(분리과세분)은 종전 값 그대로(단일세율·합산 없음 — §113①3호)이고,
 * 한도 밖(이관분)은 PSA-E4 leaf(`calculateLandClassTax`)가 같은 관할구역 합산 → 이 필지 몫으로 매긴다. 상한·부가세는 이 필지 합계 기준.
 * **초과 0은 종전 분기를 한 줄도 바꾸지 않는다**(결과에 `landSplit` 키 없음까지 동일 — 골든 anchor). 별도합산 해당 여부는 계산기가 판정하지 않는다(고지).
 */
import { PROPERTY, PROPERTY_SEPARATE, COMPREHENSIVE_LAND } from "./legal-codes";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { calculateSeparateTax, isExcludedFromComprehensiveTax } from "./separate-taxation";
import { areaLimitEchoOf } from "./separate-taxation";
import { calculateLandClassTax } from "./property-land-split-tax";
import { propertyLandSplitRequired } from "./property-land-split-tax";
import { NO_PREVIOUS_TAX_NOTICE } from "./property-tax-land-split";
import { getPropertyRateSet } from "./data/property-rate-history";
import { applyTaxCap } from "./property-tax-housing-cap";
import { calcSurtax, calcInstallment } from "./property-tax-surtax";
import { buildCapEcho } from "./property-tax-cap-echo";
import { buildTaxpayerOutcome } from "./property-taxpayer";
import type { LandSplitBranchContext } from "./property-tax-land-split";
import type { PropertyTaxResult } from "./types/property.types";

/** 종부세 고지 — 한도 초과 이관분이 있으면 «분리과세 부분만 제외»(종합부동산세법 §11: 종합합산과세대상은 종부세 대상일 수 있다). 세액·종부세 엔진 불변. */
export const PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE =
  `분리과세로 남은 부분만 종합부동산세 과세 대상에서 제외됩니다 — 종합합산으로 이관된 부분은 종합부동산세 종합합산과세대상일 수 있습니다(${COMPREHENSIVE_LAND.AGGREGATE_TAXPAYER}). 종합부동산세 계산은 별도입니다 — 확인 필요.`;

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

  const limit = sepResult.factoryAreaCheck ?? sepResult.pastureAreaCheck;
  const areaLimit = areaLimitEchoOf(sepResult, input.separateTaxationItem);
  if (limit && areaLimit && limit.excessArea > 0 && sepResult.category && sepResult.appliedRate !== undefined) {
    // ── 한도 초과 > 0: 분리과세분 + 종합합산 이관분 ──
    const r = calculateLandClassTax({
      taxYear,
      fairMarketRatio: ctx.fairMarketRatio,
      separateOwnValue: 0,
      comprehensiveOwnValue: limit.excessAssessedValue,
      otherComprehensiveValue: input.otherComprehensiveValue,
      required: propertyLandSplitRequired({ landTaxType: "separated", excessArea: limit.excessArea }),
      // 직전 구분을 알 수 없으므로 direct 직전 세액에는 상한을 적용하지 않고 고지한다(영 §118①1호 가목 단서·다목)
      cap: { mode: "direct", previousYearTax: input.previousYearTax },
      transferredFromSeparate: true,
      transferReasons: [areaLimit.kind === "factory" ? "factory_area_excess" : "pasture_area_excess"],
      separatedOwn: {
        category: sepResult.category,
        appliedRate: sepResult.appliedRate,
        ownValue: limit.recognizedAssessedValue,
        ownTaxBase: separatedTaxBase,
        tax: separatedTax,
        areaLimit,
      },
    });
    warnings.push(...r.warnings);
    legalBasis.push(...r.legalBasis);
    if (r.cap.basisTax === undefined && input.previousYearTax === undefined) warnings.push(NO_PREVIOUS_TAX_NOTICE);

    const surtaxEx = calcSurtax(r.determinedTax, r.ownTaxBase, input.publishedPrice, input.objectType, input.isUrbanArea ?? false);
    legalBasis.push(...surtaxEx.legalBasis);
    const totalPayableEx = r.determinedTax + surtaxEx.totalSurtax;
    if (isExcluded) warnings.push(PROPERTY_LAND_SPLIT_EXCESS_COMPREHENSIVE_NOTICE);

    return {
      publishedPrice: input.publishedPrice,
      fairMarketRatio: ctx.fairMarketRatio,
      taxBase: r.ownTaxBase, // 이 필지 자기 과세표준(분리과세분 + 이관분) — 도시지역분 기준
      appliedRate: 0, // 분류별 세율이 달라 단일 세율 없음 — 분류별은 landSplit
      calculatedTax: r.taxBeforeCap,
      calculatedTaxBeforeCap: r.taxBeforeCap,
      taxCapRate: r.cap.capRate,
      determinedTax: r.determinedTax,
      surtax: surtaxEx.surtax,
      totalSurtax: surtaxEx.totalSurtax,
      totalPayable: totalPayableEx,
      installment: calcInstallment(r.determinedTax, input.objectType),
      oneHouseSpecialApplied: false,
      legalBasis: [...new Set(legalBasis)],
      warnings,
      targetDate,
      landSplit: r.landSplit,
      ...buildCapEcho(input, r.cap.basisTax ?? input.previousYearTax, taxYear - 1),
      ...buildTaxpayerOutcome(taxpayerResult, coShares, r.determinedTax, totalPayableEx),
    };
  }

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
