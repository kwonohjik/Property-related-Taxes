/** ⑧ 부담부증여 × 이월과세 시나리오 B(양도인 기준) 취득가액 칸 — `transfer-tax-validate-bg.ts`가 K-5·K-6/K-7 분기에서 부른다. */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/lib/calc/number-parse";
import { fieldError } from "./transfer-tax-validate-field";
import { bgConvertedCarryoverReadsGiftValuation } from "./bg-carryover-parts";
import { bgPartialCarryoverGiftValuationPart } from "./bg-carryover-parts";

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
  const gifted = bgPartialCarryoverGiftValuationPart(asset);
  if (gifted) return transferorGiftValuationError(asset, label, houseSplit, gifted);
  return bgConvertedCarryoverReadsGiftValuation(asset) ? transferorGiftValuationError(asset, label, houseSplit) : null;
}

/**
 * 이월과세 × K-6/K-7 · 한 파트만 증여받은 일반건물 — 증여받지 않은 파트는 양도인이 취득한 것이라 양도인 자기 매매사례가액·감정가액이 필요하다
 * (A·B 공통 · 엔진 `assertPartialPresumedCarryover` · ⑫ `requireBgAcquisitionParts`와 같은 조건). 해당 없으면 null.
 */
export function partialCarryoverOwnPresumedError(asset: AssetForm, label: string, methodLabel: string): string | null {
  const gifted = bgPartialCarryoverGiftValuationPart(asset);
  if (!gifted) return null;
  const field = gifted === "land" ? "bgPresumedAcquisitionBuilding" : "bgPresumedAcquisitionLand";
  if (parseAmount(asset[field])) return null;
  const other = gifted === "land" ? "건물" : "토지";
  return fieldError(field, `${label}: 증여받지 않은 ${other}은 양도인이 취득한 것이라 양도인의 ${other} 취득 당시 ${methodLabel}을 입력하세요 (소득세법 §97①1호나목).`);
}
