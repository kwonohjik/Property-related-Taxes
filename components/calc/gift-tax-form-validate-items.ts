/**
 * 증여세 ⑧ validateStep 자산 술어 — `gift-tax-form-validate.ts` 800줄 정책으로 분리(2026-11-28).
 * 본 건(step 1·3)과 동시증여 추가 건(step 3 루프)이 함께 쓰는, ⑩·⑫와 같은 술어·문구의 검사들.
 */
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate-unlisted";
import { validateListedStockBesshi } from "@/lib/calc/inheritance-validate";
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
 * U-09 ⑧ — 주식 평가 입력 검증. 상속 ⑧(inheritance-validate.ts)과 같은 함수·문구를 부른다.
 *   - 비상장 정식평가(V2): validateUnlistedStockV2 — 사업연도·자본금 변동·사업개시일(U-10)·9호 + 일반기업(U-04) 등
 *     ⑫ unlistedStockValuationV2Schema 규칙과 Zod에 없는 규칙(§53⑧2호 매매계약일 등)까지
 *   - 상장 평가조서: validateListedStockBesshi — §63②3호·§63③ 기업 규모·9호 + 일반기업·§53⑧2호
 * 평가기준일 미입력 fallback = 증여일(상속은 상속개시일) — UI display fallback과 같다.
 * ④(buildGiftTaxInput)와 같이 비활성 평가 모드를 걷어낸 자산을 본다(간편평가 모드에 숨은 V2는 검사 안 함).
 */
export function stockValuationGateError(
  f: Pick<FormState, "giftItems" | "stockItems" | "giftDate">,
): string | null {
  const ctx = { evaluationDateFallback: f.giftDate || undefined };
  for (const raw of [...f.giftItems, ...f.stockItems]) {
    const it = resolveActiveUnlistedValuation(raw);
    const e = validateUnlistedStockV2(it, ctx) ?? validateListedStockBesshi(it);
    if (e) return e;
  }
  return null;
}

/**
 * 혼합 자산(N≥2)에서 특례 선택 시 귀속 미설정 차단 — ⑩ Zod superRefine(gift-tax-input-refine.ts)과 같은 조건.
 * 자산 1개는 엔진이 자동 귀속하므로 차단 없음. 본 건·동시증여 추가 건이 함께 쓴다.
 */
export function unassignedSpecialItemsMessage(
  f: Pick<FormState, "giftItems" | "stockItems" | "specialTreatment">,
): string | null {
  if (f.specialTreatment === "") return null;
  const allItems = [...f.giftItems, ...f.stockItems];
  if (allItems.length < 2) return null;
  const unassigned = allItems.filter((it) => it.isSpecialTreatmentAsset === undefined);
  if (unassigned.length === 0) return null;
  const label = f.specialTreatment === "startup" ? "창업자금" : "가업승계";
  return `${label} 특례 적용 시 모든 자산의 특례 귀속 여부를 선택하세요. (위 "특례 귀속 자산 선택" 항목 — 미선택 ${unassigned.length}개)`;
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
