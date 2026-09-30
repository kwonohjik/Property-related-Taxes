/**
 * PEN-C — 지연납부가산세 미납세액 산정 방식의 **단일 판정 leaf** (UI 표시 · ④ 단건 · ④ 다건 · ⑧).
 *
 * 폼 필드 `unpaidTaxMode`가 부재면 **값으로 판정**한다 — 종전 규약이 「0 = 자동(결정세액 전액),
 * 그 밖의 값 = 그 값」이었으므로, 저장된 폼·이력은 이 판정으로 **같은 의미**를 유지한다
 * (memory `feedback_flipping_enum_default_rewrites_absent_records`).
 *
 * 엔진 쪽 짝: `resolveUnpaidTax`(`lib/tax-engine/transfer-tax-unpaid-tax.ts`).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export type UnpaidTaxMode = "auto" | "manual";

export function effectiveUnpaidTaxMode(
  form: Pick<TransferFormData, "unpaidTaxMode" | "unpaidTax">,
): UnpaidTaxMode {
  if (form.unpaidTaxMode) return form.unpaidTaxMode;
  return parseAmount(form.unpaidTax ?? "0") > 0 ? "manual" : "auto";
}

/** ④ `delayedPaymentDetails`의 미납세액 2키 — auto면 값을 싣지 않는다(0). 단건·다건 공용. */
export function unpaidTaxPayload(
  form: Pick<TransferFormData, "unpaidTaxMode" | "unpaidTax">,
): { unpaidTax: number; unpaidTaxMode: UnpaidTaxMode } {
  const mode = effectiveUnpaidTaxMode(form);
  return { unpaidTax: mode === "manual" ? parseAmount(form.unpaidTax ?? "0") : 0, unpaidTaxMode: mode };
}
