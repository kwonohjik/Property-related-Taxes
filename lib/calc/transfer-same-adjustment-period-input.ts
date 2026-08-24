/**
 * ④⑬ §164⑧ 동일조정기간 환산 입력 조립 — 단건·다건·컴패니언 **단일 소스**.
 *
 * 세 경로가 각자 조립하면 기본값(`sapFormula`)이 어긋나 한쪽만 다르게 동작한다.
 * 여기 한 곳에서만 만든다.
 *
 * 게이트는 `sapEnabled`다. OFF면 `undefined`를 반환해 body에서 키 자체가 빠지고,
 * 엔진 STEP 0.47은 no-op이 된다(회귀 0).
 *
 * ⚠️ 여기서 쓰는 fallback은 ⑧ validation과 **같아야** 한다 —
 *    조정월수 미입력 → 엔진 기본 12(전송하지 않음). validate가 이걸 차단하면 모순이 된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { SameAdjustmentPeriodTransferInput } from "@/lib/tax-engine/types/transfer.types";

export function buildSameAdjustmentPeriodInput(
  asset: Pick<
    AssetForm,
    | "sapEnabled"
    | "sapFormula"
    | "sapPriorStdPrice"
    | "sapNewStdPrice"
    | "sapAdjustMonths"
    | "sapPriorBasis"
    | "sapPriceSource"
  > | undefined,
): SameAdjustmentPeriodTransferInput | undefined {
  if (!asset?.sapEnabled) return undefined;

  const formula = asset.sapFormula ?? "prev";
  const prior = parseAmount(asset.sapPriorStdPrice ?? "");
  const next = parseAmount(asset.sapNewStdPrice ?? "");
  // ⚠️ 콤마 제거 — `CurrencyInput`이 1,000 이상을 "1,200"으로 포맷한다.
  //    `Number("1,200")`은 NaN이라 값이 **조용히 미전송**되는데, ⑧ validation은
  //    콤마를 벗기고 통과시켜 「UI 통과 ↔ 엔진 미도달」 불일치가 된다(3중 패턴).
  const months = Number(String(asset.sapAdjustMonths ?? "").replace(/,/g, ""));

  // 산식이 요구하는 상대 기준시가가 비어 있으면 보내지 않는다 — 엔진이 no-op으로
  // 떨어질 뿐이지만, 반쪽 객체를 보내면 결과 화면이 "적용됨"으로 오해될 수 있다.
  const counterpart = formula === "prev" ? prior : next;
  if (!(counterpart > 0)) return undefined;

  return {
    formula,
    ...(formula === "prev" ? { priorStandardPrice: prior } : { newStandardPrice: next }),
    ...(Number.isFinite(months) && months > 0 && { adjustmentMonths: months }),
    ...(asset.sapPriorBasis && { priorBasis: asset.sapPriorBasis }),
    ...(asset.sapPriceSource && { priceSource: asset.sapPriceSource }),
  };
}
