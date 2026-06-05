/**
 * 상속세 §74 지정문화유산 등에 대한 징수유예 — 순수 함수 서브엔진.
 *
 * 법령: 상증법 §74① (대상 4개호) · 상증령 §76① (징수유예액 계산).
 * 산정 방식 = **평균 비례 방식**(조세심판원 940708·예규 재산46014-339·재삼46014-1158):
 *   징수유예세액 = 상속세산출세액 × [ §74①각호 재산가액 ÷ 상속재산(§13 가산증여 포함) ]
 *   - 분모는 §13 사전증여 포함, §15 추정상속재산 제외(시행령 §76① 문언).
 *   - 차액 방식(문화재 포함/제외 산출세액 차감)은 명시적으로 배척 → 비례 곱셈만.
 *   - finalTax(결정세액) 불변 — echo. 별지9호 ㉖ 표시 + ㊳(납부세액)에서만 차감.
 *
 * 사후관리(§74② 유상양도 즉시징수)·담보 입력(§74④⑤)은 본 PR 범위 외(안내 warning만).
 */

import { calculateProration } from "./tax-utils";
import { INH } from "./legal-codes";
import type {
  CalculationStep,
  CulturalHeritageDeferralDetail,
  EstateItem,
} from "./types/inheritance-gift.types";

type HeritageType = NonNullable<EstateItem["culturalHeritageType"]>;

/** §74⑤ 담보 면제 가능 호 (3호 국가지정·4호 천연기념물) */
const COLLATERAL_EXEMPTIBLE: ReadonlySet<HeritageType> = new Set<HeritageType>([
  "designated",
  "natural_monument",
]);

export interface CulturalHeritageDeferralParams {
  estateItems: EstateItem[];
  /** 자산 평가액 Map (키 = estateItemId = EstateItem.id) */
  valuatedAmountById: Map<string, number>;
  /** §26 산출세액 (§27 할증 전) */
  computedTax: number;
  /** 비과세·§14 차감 전 평가액 합 */
  grossEstateValue: number;
  /** §13 사전증여 합 */
  priorGiftAggregated: number;
}

export interface CulturalHeritageDeferralResult {
  deferredTax: number;
  detail: CulturalHeritageDeferralDetail | null;
  breakdown: CalculationStep[];
  lawApplied: boolean;
}

/**
 * §74 징수유예세액 산정 (상증령 §76① 비례 방식).
 */
export function calcCulturalHeritageDeferral(
  params: CulturalHeritageDeferralParams,
): CulturalHeritageDeferralResult {
  const {
    estateItems,
    valuatedAmountById,
    computedTax,
    grossEstateValue,
    priorGiftAggregated,
  } = params;

  const culturalItems = estateItems.filter((i) => i.culturalHeritageType != null);
  if (culturalItems.length === 0) {
    return { deferredTax: 0, detail: null, breakdown: [], lawApplied: false };
  }

  const items = culturalItems.map((item) => {
    const heritageType = item.culturalHeritageType as HeritageType;
    return {
      estateItemId: item.id,
      itemName: item.name,
      heritageType,
      valuatedAmount: valuatedAmountById.get(item.id) ?? 0,
      collateralExemptible: COLLATERAL_EXEMPTIBLE.has(heritageType),
    };
  });

  // §76① 분자 = §74①각호 재산 평가액 합 (호 무관 합산)
  const qualifyingAssetValue = items.reduce((sum, it) => sum + it.valuatedAmount, 0);
  // §76① 분모 = 상속재산 + §13 가산증여 (§15 추정상속재산 제외)
  const totalEstateWithPriorGifts = grossEstateValue + priorGiftAggregated;

  // 산출세액 × (분자 ÷ 분모). calculateProration = div0 방어 + 비율 1.0 상한(100% 정확) + floor + BigInt.
  const deferredTax = calculateProration(
    computedTax,
    qualifyingAssetValue,
    totalEstateWithPriorGifts,
  );

  const deferralRatio =
    totalEstateWithPriorGifts > 0
      ? qualifyingAssetValue / totalEstateWithPriorGifts
      : 0;
  const hasCollateralExemption =
    items.length > 0 && items.every((it) => it.collateralExemptible);

  const warnings: string[] = [];
  if (deferredTax > 0) {
    warnings.push(
      "징수유예 재산을 유상양도하거나 인출하는 경우 즉시 징수됩니다 (상증법 §74②).",
    );
    if (!hasCollateralExemption) {
      warnings.push(
        "유예할 상속세액에 상당하는 담보를 제공해야 합니다 (상증법 §74④).",
      );
    }
  }

  const detail: CulturalHeritageDeferralDetail = {
    qualifyingAssetValue,
    totalEstateWithPriorGifts,
    deferralRatio,
    computedTaxBase: computedTax,
    items,
    hasCollateralExemption,
    warnings,
  };

  const breakdown: CalculationStep[] =
    deferredTax > 0
      ? [
          {
            label: "문화유산 등 징수유예세액 (§74)",
            amount: -deferredTax,
            lawRef: INH.CULTURAL_HERITAGE_DEFERRAL_CALC,
            note: `산출세액 ${computedTax.toLocaleString()} × (${qualifyingAssetValue.toLocaleString()} ÷ ${totalEstateWithPriorGifts.toLocaleString()})`,
          },
        ]
      : [];

  return { deferredTax, detail, breakdown, lawApplied: deferredTax > 0 };
}
