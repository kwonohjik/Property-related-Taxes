/** ⑧ 부담부증여 × 이월과세 시나리오 B(양도인 기준) 취득가액 칸 — `transfer-tax-validate-bg.ts`가 K-5·K-6/K-7 분기에서 부른다. */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/lib/calc/number-parse";
import { fieldError } from "./transfer-tax-validate-field";
import { bgConvertedCarryoverReadsGiftValuation } from "./bg-carryover-parts";
import { bgConvertedCarryoverGiftedPart } from "./bg-carryover-parts";

/**
 * 이월과세 × K-5·K-6/K-7 — 시나리오 B 취득가액 = 양도인이 증여받은 때의 상증법 평가액(소령 §163⑨ · `bgActual*` 칸).
 * 비운 쪽은 시나리오 B 취득가액 0이라 §97의2②3호 비교의 채택 시나리오까지 바뀐다 — 자산 입력 형태의 칸을 모두 요구한다.
 */
export function transferorGiftValuationError(asset: AssetForm, label: string, houseSplit: boolean, onlyPart?: "land" | "building"): string | null {
  if (asset.assetKind === "general_building") {
    for (const [field, part] of [["bgActualAcquisitionLand", "토지"], ["bgActualAcquisitionBuilding", "건물"]] as const) {
      if (onlyPart && onlyPart !== (part === "토지" ? "land" : "building")) continue;
      if (!parseAmount(asset[field])) return fieldError(field, `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 ${part}분 상증법 평가액을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
    }
  } else if (asset.assetKind === "land") {
    if (!parseAmount(asset.bgActualAcquisitionLand)) {
      return fieldError("bgActualAcquisitionLand", `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 상증법 평가액(토지)을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
    }
  } else if (!houseSplit && !parseAmount(asset.bgActualAcquisitionTotal)) {
    return fieldError("bgActualAcquisitionTotal", `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 상증법 평가액을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
  }
  return null;
}

/**
 * 이월과세 × K-5 — 두 파트 모두 증여받았으면 자산 입력 형태의 칸을 모두, 한 파트만 증여받은 일반건물이면 **그 파트 칸만** 요구한다
 * (다른 파트는 양도인 환산 · ⑤·④·⑫·엔진과 같은 leaf — 계획서 `bg-carryover-k5-one-part-b.plan.md`). K-5 이월과세가 아니면 null.
 */
export function convertedCarryoverValuationError(asset: AssetForm, label: string, houseSplit: boolean): string | null {
  const gifted = bgConvertedCarryoverGiftedPart(asset);
  if (gifted) return transferorGiftValuationError(asset, label, houseSplit, gifted);
  return bgConvertedCarryoverReadsGiftValuation(asset) ? transferorGiftValuationError(asset, label, houseSplit) : null;
}
