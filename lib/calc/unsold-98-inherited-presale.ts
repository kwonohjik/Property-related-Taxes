/**
 * ④ US-07 — 상속 자산의 「분양권 상속 후 상속인 잔금 취득」 답을 엔진에 싣는다. 단건·함께 양도·다건 공용.
 *
 * ⑤·⑧과 같은 술어(`asksInheritedPresaleQuestion`)로 게이트한다 — 묻지 않는 조문만 남았거나 취득 원인을 바꾼 뒤 남은 값은 보내지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { asksInheritedPresaleQuestion } from "@/lib/tax-engine/transfer-reductions/unsold-98-acquisition-cause";

export function inheritedPresalePayload(
  asset: Pick<AssetForm, "acquisitionCause" | "inheritedPresaleCompletedByHeir" | "reductions"> | undefined,
): "yes" | "no" | "unknown" | undefined {
  const a = asset?.inheritedPresaleCompletedByHeir;
  if (!asset || !a) return undefined;
  return (asset.reductions ?? []).some((r) => asksInheritedPresaleQuestion(r.type, asset.acquisitionCause)) ? a : undefined;
}
