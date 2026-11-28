/**
 * 가업승계 증여세 과세특례 — 가업자산상당액 (조특법 §30의6① · 조특령 §27의6⑩)
 *
 * §30의6①은 특례·한도를 「그 주식등의 가액 중 대통령령으로 정하는 가업자산상당액」에만 건다.
 * 조특령 §27의6⑩: 가업자산상당액 = 상증령 §15⑤2호를 준용해 계산한 금액(「상속개시일」은 「증여일」로 본다).
 *   ⇒ 주식가액 × (법인 총자산 − 사업무관자산) ÷ 법인 총자산. 나머지(사업무관자산 비율분)는
 *     특례 대상이 아니므로 §30의5⑬(§30의6⑤ 준용)에 따라 상증법 일반 규정으로 과세한다.
 *
 * 엔진(2-스트림)·⑧ validateStep·⑩ Zod가 이 파일 하나를 쓴다 — 대상 집합(합산배제 제외 + partitionGiftItems)과
 * 미입력 판정이 세 층에서 같아야 「UI 통과 ↔ API 400」 모순이 생기지 않는다.
 *
 * Pure Engine: DB 호출 없음.
 */

import { TAX_CREDIT } from "./legal-codes";
import type { EstateItem } from "./types/inheritance-gift.types";
import type { GiftTaxCreditInput } from "./types/inheritance-gift.types";
import type { FamilyBusinessAssetEquivalentDetail } from "./types/inheritance-gift.types";
import { calcCorporateStockAdjustedValue } from "./property-valuation-corporate";
import { partitionGiftItems } from "./gift-special-stream";
import { isSpecialTreatmentEligibleCategory } from "./gift-special-stream";

/** 특례 귀속 주식 전체의 가업자산상당액 집계 */
export interface FamilyBusinessAssetEquivalentResult {
  /** 특례 스트림에 넘길 가액 합계 — 총자산 미입력 자산은 평가액(gross) 그대로 */
  specialValue: number;
  /** 사업무관자산 비율분 합계 (일반 스트림 이관분) */
  nonBusinessPortion: number;
  /** 총자산이 입력돼 가업자산상당액을 산정한 자산만 */
  detail: FamilyBusinessAssetEquivalentDetail[];
  /** 총자산 미입력으로 가업자산상당액을 산정하지 못한 자산 수 */
  missingTotalAssetsCount: number;
}

/** 법인 총자산가액이 입력됐는가 (0 이하·미입력 = 미입력) */
function hasTotalAssets(item: EstateItem): boolean {
  return item.corporateTotalAssets != null && item.corporateTotalAssets > 0;
}

/**
 * 특례 귀속 주식별 가업자산상당액 산정.
 *
 * 기준일은 증여일이다(조특령 §27의6⑩ 후단 「상속개시일」→「증여일」 · 국세기본법 §21②3호 증여세 성립일).
 * 상증령 §15⑤2호 라목 비율(150%/200%)·나·다목 단서의 시기 판정은 calcCorporateStockAdjustedValue가 한다.
 */
export function applyFamilyBusinessAssetEquivalent(
  specialItems: EstateItem[],
  valueOf: (item: EstateItem) => number,
  giftDate: string,
): FamilyBusinessAssetEquivalentResult {
  let specialValue = 0;
  let nonBusinessPortion = 0;
  let missingTotalAssetsCount = 0;
  const detail: FamilyBusinessAssetEquivalentDetail[] = [];

  for (const item of specialItems) {
    const grossValue = valueOf(item);
    if (!hasTotalAssets(item)) {
      // 직접 호출 방어 — ⑧·⑩이 차단한다. 자동 안분 fallback 금지: 평가액 그대로 두고 경고만.
      missingTotalAssetsCount++;
      specialValue += grossValue;
      continue;
    }
    const totalAssets = item.corporateTotalAssets as number;
    const adjusted = calcCorporateStockAdjustedValue(
      grossValue,
      totalAssets,
      item.corporateNonBusinessAssets,
      giftDate,
    );
    specialValue += adjusted.adjustedValue;
    nonBusinessPortion += Math.max(0, grossValue - adjusted.adjustedValue);
    detail.push({
      name: item.name ?? "",
      grossValue,
      totalAssets,
      sumOfNonBusiness: adjusted.sumOfNonBusiness,
      assetEquivalent: adjusted.adjustedValue,
    });
  }

  return { specialValue, nonBusinessPortion, detail, missingTotalAssetsCount };
}

/**
 * 법인 총자산가액이 없는 가업승계 특례 귀속 주식 — ⑧ validateStep·⑩ Zod 차단 술어.
 *
 * 대상 집합은 엔진과 같다: 합산배제증여재산(isAggregationExcludedGift)을 뺀 뒤 partitionGiftItems의 specialItems.
 * 특례 미선택·창업자금이거나 영위기간을 10년 미만으로 명시했으면(특례 미적격 → 평가액 전액 일반 과세라
 * 총자산이 계산에 쓰이지 않는다) 빈 배열. 빈값(엔진 기본 10년)은 적격이므로 차단 대상이다.
 */
export function findFamilyBusinessItemsMissingTotalAssets(
  giftItems: EstateItem[],
  creditInput: Pick<GiftTaxCreditInput, "specialTreatment" | "familyBusinessYears"> | undefined,
): EstateItem[] {
  if (creditInput?.specialTreatment !== "family_business") return [];
  const years = creditInput.familyBusinessYears;
  if (years != null && years < 10) return [];
  const twoStreamItems = giftItems.filter((i) => !i.isAggregationExcludedGift);
  // 주식이 아닌 특례 귀속 재산은 총자산 칸이 없다(⑤ GiftFamilyBusinessAssetEquivalentSection과 같은 필터) —
  //   그 재산은 재산 종류 검사(SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON)가 막는다.
  return partitionGiftItems(twoStreamItems).specialItems.filter(
    (i) => isSpecialTreatmentEligibleCategory(i.category, "family_business") && !hasTotalAssets(i),
  );
}

/** ⑧·⑩ 차단 문구 (같은 문구) */
export const FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE =
  "가업승계 특례 주식의 법인 총자산가액을 입력하세요. " +
  `(가업자산상당액은 주식가액에 총자산에서 사업무관자산을 뺀 금액을 총자산으로 나눈 비율을 곱한 금액 — ${TAX_CREDIT.FAMILY_BUSINESS_ASSET_EQUIVALENT})`;

/** 엔진 직접 호출 시 경고 문구 */
export const FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_WARNING =
  `법인 총자산 미입력 — 가업자산상당액(${TAX_CREDIT.FAMILY_BUSINESS_ASSET_EQUIVALENT}) 미적용: ` +
  "주식 평가액 전액을 특례 스트림에 넣었습니다.";
