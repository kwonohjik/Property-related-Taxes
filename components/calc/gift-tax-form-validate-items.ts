/**
 * 증여세 ⑧ validateStep 자산 술어 — `gift-tax-form-validate.ts` 800줄 정책으로 분리(2026-11-28).
 * 본 건(step 1·3)과 동시증여 추가 건(step 3 루프)이 함께 쓰는, ⑩·⑫와 같은 술어·문구의 검사들.
 */
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { unlistedV2BusinessStartDateError } from "@/lib/calc/inheritance-validate-unlisted";
import { stockSmeReasonLargeSizeError } from "@/lib/calc/inheritance-validate-unlisted";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import { isSpecialTreatmentEligibleCategory } from "@/lib/tax-engine/gift-special-stream";
import { SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON } from "@/lib/tax-engine/gift-special-stream";
import { findFamilyBusinessItemsMissingTotalAssets } from "@/lib/tax-engine/gift-family-business-asset-equivalent";

/**
 * U-17 ⑧ — 가업승계 특례 주식의 법인 총자산 미입력 여부. 엔진 입력(④ buildGiftTaxInput)과 같은
 * allItems·specialTreatment·familyBusinessYears 파생으로 엔진 술어를 부른다.
 */
export function familyBusinessTotalAssetsMissing(
  f: Pick<FormState, "giftItems" | "stockItems" | "specialTreatment" | "familyBusinessYears">,
): boolean {
  return (
    findFamilyBusinessItemsMissingTotalAssets([...f.giftItems, ...f.stockItems], {
      specialTreatment: f.specialTreatment || undefined,
      familyBusinessYears:
        f.specialTreatment === "family_business" && f.familyBusinessYears !== ""
          ? parseDecimal(f.familyBusinessYears)
          : undefined,
    }).length > 0
  );
}

/**
 * U-04·U-10 ⑧ — ⑫ giftTaxInputSchema가 막는 주식 평가 두 조건(9호 + 일반기업 · V2 사업개시일 미입력).
 * 상속 ⑧과 같은 헬퍼·문구이고, ④(buildGiftTaxInput)와 같이 비활성 평가 모드를 걷어낸 자산을 본다.
 * (V2 전체 검증 이식은 범위 밖 — 이 두 조건만)
 */
export function stockValuationGateError(f: Pick<FormState, "giftItems" | "stockItems">): string | null {
  for (const raw of [...f.giftItems, ...f.stockItems]) {
    const it = resolveActiveUnlistedValuation(raw);
    const e = stockSmeReasonLargeSizeError(it) ?? unlistedV2BusinessStartDateError(it);
    if (e) return e;
  }
  return null;
}

/**
 * 특례 귀속 재산 종류 제약 — ⑩ Zod(gift-tax-input-refine.ts)와 같은 조건·문구.
 * startup: 소법 §94① 재산(부동산·주식) 제외 (조특령 §27의5①) / family_business: 주식만 (§30의6①).
 * 단일 자산은 엔진 자동 귀속이므로 그 자산을 검사한다. 본 건·동시증여 추가 건이 함께 쓴다.
 */
export function ineligibleSpecialCategoryMessage(
  f: Pick<FormState, "giftItems" | "stockItems" | "specialTreatment">,
): string | null {
  if (f.specialTreatment === "") return null;
  const specialTreatment = f.specialTreatment as "startup" | "family_business";
  const allItems = [...f.giftItems, ...f.stockItems];
  const effectiveSpecialItems =
    allItems.length === 1 ? allItems : allItems.filter((it) => it.isSpecialTreatmentAsset === true);
  const ineligible = effectiveSpecialItems.filter(
    (it) => !isSpecialTreatmentEligibleCategory(it.category, specialTreatment),
  );
  if (ineligible.length === 0) return null;
  return `특례 귀속 불가 재산 ${ineligible.length}개 — ${SPECIAL_TREATMENT_CATEGORY_BLOCK_REASON[specialTreatment]}`;
}
