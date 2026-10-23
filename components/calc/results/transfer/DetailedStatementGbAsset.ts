/**
 * 상세명세서 — 카드별 일반건물 산식 재료 선택 (`gb-bundled-result-formulas.plan.md` D-2).
 *
 * 단건·지분 분할은 결과 상세가 하나(`generalBuildingValuationDetail`)라 종전대로 그것을 쓴다.
 * 함께 양도는 일반건물 자산마다 상세가 따로 있다(`generalBuildingDetailsByAsset` — 키 = 카드 id 접미사):
 *  - 일반건물 자산의 카드에만 상세를 건넨다 — 함께 양도 토지 카드에 건네면 그 카드 산식이 바뀐다(C-3).
 *  - 양도가액 산식의 총액은 그 일반건물의 양도가액(같은 접미사 카드 합)이다 — 계약 총액이면 거짓 등식(C-4).
 *  - 취득가액 산식이 보는 폼 자산은 그 자산이다(주 자산 `primary` → 첫 자산).
 */
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";

export interface GbFormulaInputs {
  gb: GeneralBuildingOutput | undefined;
  totalTransferPrice: number;
  asset: AssetForm | undefined;
}

export function gbFormulaInputsOf(
  p: PerPropertyBreakdown,
  single: GeneralBuildingOutput | undefined,
  byAsset: Record<string, GeneralBuildingOutput> | undefined,
  properties: PerPropertyBreakdown[],
  formData: TransferFormData | undefined,
  fallback: { totalTransferPrice: number; asset: AssetForm | undefined },
): GbFormulaInputs {
  if (single) return { gb: single, ...fallback };
  const suffix = cardSuffixOf(p.propertyId);
  const gb = suffix !== undefined ? byAsset?.[suffix] : undefined;
  if (!gb) return { gb: undefined, ...fallback };
  return {
    gb,
    totalTransferPrice: properties
      .filter((q) => cardSuffixOf(q.propertyId) === suffix)
      .reduce((s, q) => s + q.transferPrice, 0),
    asset: (suffix === "primary" ? formData?.assets[0] : formData?.assets.find((a) => a.assetId === suffix)) ?? fallback.asset,
  };
}
