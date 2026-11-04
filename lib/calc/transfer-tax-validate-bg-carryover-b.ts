/** ⑧ 부담부증여 × 이월과세 시나리오 B(양도인 기준) 취득가액 칸 — `transfer-tax-validate-bg.ts`가 K-5·K-6/K-7 분기에서 부른다. */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/lib/calc/number-parse";
import { fieldError } from "./transfer-tax-validate-field";

/**
 * 이월과세 × K-5·K-6/K-7 — 시나리오 B 취득가액 = 양도인이 증여받은 때의 상증법 평가액(소령 §163⑨ · `bgActual*` 칸).
 * 비운 쪽은 시나리오 B 취득가액 0이라 §97의2②3호 비교의 채택 시나리오까지 바뀐다 — 자산 입력 형태의 칸을 모두 요구한다.
 */
export function transferorGiftValuationError(asset: AssetForm, label: string, houseSplit: boolean): string | null {
  if (asset.assetKind === "general_building") {
    for (const [field, part] of [["bgActualAcquisitionLand", "토지"], ["bgActualAcquisitionBuilding", "건물"]] as const) {
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
