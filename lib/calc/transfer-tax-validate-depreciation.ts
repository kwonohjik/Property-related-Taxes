/**
 * ⑧ 감가상각비(§97③) 검증 — 입력 가능 범위는 `depreciation-scope.ts` 단일 술어가 정한다.
 *
 * - **받을 수 없는 구조**(`unsupported` — 겸용·이월과세 등)에 값이 남아 있으면 차단한다 — 침묵하면 감가상각비가
 *   **계산에 조용히 빠진다**. 막다른 길이 되지 않게 ⑤ 안내 카드(`DepreciationField`)가 값이 남아 있을 때 「지우기」
 *   버튼(`data-field="depreciationAmount"`)을 낸다 — 메시지의 「0으로 지우세요」가 가리키는 칸이다.
 * - **건물이 없는 자산**(`not_applicable` — 토지·권리)은 막지 않는다. 자산 종류를 바꾼 뒤 남은 값일 뿐이라
 *   ④가 보내지 않는다(`depreciationSupport` 게이트) — 칸도 안내도 없는 상태에서 막으면 막다른 길이다
 *   (memory `feedback_blocked_message_is_not_missing_input_path`).
 * - 취득가액을 확정해 알 수 있는 경우(매매 · 실가)에는 취득가액을 넘을 수 없다. 환산·감정·매매사례는
 *   취득가액이 계산값이라 여기서 알 수 없다 — 엔진이 취득가액까지로 절삭한다(`calcTransferGain`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { depreciationSupport } from "./depreciation-scope";
import { fieldError } from "./transfer-tax-validate-field";

export function validateDepreciation(a: AssetForm, label: string): string | null {
  const dep = parseAmount(a.depreciationAmount ?? "");
  if (!(dep > 0)) return null;

  const support = depreciationSupport(a);
  if (support.status === "not_applicable") return null;
  if (support.status === "unsupported") {
    return fieldError(
      "depreciationAmount",
      `${label}: ${support.reason} 이 자산의 감가상각비 입력값은 계산에 반영되지 않으므로 0으로 지우세요 (소득세법 §97③).`,
    );
  }

  const isActualPurchase =
    a.acquisitionCause === "purchase" &&
    !a.useEstimatedAcquisition &&
    !a.isAppraisalAcquisition &&
    !a.isSalesCaseAcquisition;
  const acquisition = parseAmount(a.fixedAcquisitionPrice ?? "");
  // 일반건물은 취득가액이 토지+건물 일괄(또는 파트별)이라 건물분을 여기서 알 수 없다 — 엔진이 원건물 카드 취득가액까지로 절삭한다.
  if (a.assetKind !== "general_building" && isActualPurchase && acquisition > 0 && dep > acquisition) {
    return fieldError(
      "depreciationAmount",
      `${label}: 감가상각비(${dep.toLocaleString()})가 취득가액(${acquisition.toLocaleString()})보다 클 수 없습니다. 취득가액에서 공제할 수 있는 한도는 취득가액까지입니다 (소득세법 §97③).`,
    );
  }
  return null;
}
