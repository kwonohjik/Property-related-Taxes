/**
 * ⑧ 겸용주택 — 양도가액 토지·건물 안분 방식(계약서 구분·감정가액) 검증.
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4
 *
 * 범위는 ⑤·④와 같은 술어(`mixedSaleSplitScope`)다 — 범위 밖이면 칸이 숨겨지고 ④도 보내지 않으므로 검사하지 않는다.
 * 규칙은 일반건물·주택 split 경로(`transfer-tax-validate-gb-sale.ts`·`-split.ts`)와 같은 문구·같은 조건을 쓴다. 다른 점은 하나다 —
 * **계약서 구분 기재는 토지·건물 둘 다** 받는다(겸용 엔진은 한쪽에서 나머지를 자동 계산하지 않는다 · 자동 안분 fallback 금지).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "./number-parse";
import { fieldError } from "./transfer-tax-validate-field";
import { mixedSaleSplitScope } from "./mixed-use-sale-split-scope";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";

const entered = (v: string | undefined): boolean => (v ?? "").trim() !== "";

export function validateMixedSaleSplit(
  a: AssetForm,
  label: string,
  form: Pick<TransferFormData, "assets" | "transferDate" | "contractTotalPrice">,
): string | null {
  if (mixedSaleSplitScope(a, { isSingleAsset: form.assets.length === 1 }).status !== "ok") return null;
  const mode = a.saleSplitMode ?? "apportioned";
  if (mode === "apportioned") return null;

  const landApp = parseAmount(a.landAppraisalAtTransfer) || 0;
  const buildingApp = parseAmount(a.buildingAppraisalAtTransfer) || 0;
  if (mode === "appraisal" && landApp <= 0 && buildingApp <= 0) {
    return fieldError("landAppraisalAtTransfer", `${label}: 「감정평가가액으로 안분」을 선택했으면 토지·건물 감정평가가액을 입력하세요 — 감정평가가 없으면 「양도시 기준시가 비율」을 선택하세요 (부가가치세법 시행령 §64①1호 단서).`);
  }
  if ((landApp > 0 || buildingApp > 0) && (landApp <= 0 || buildingApp <= 0)) {
    return fieldError(landApp <= 0 ? "landAppraisalAtTransfer" : "buildingAppraisalAtTransfer", `${label}: 양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다 — 한쪽만 입력하면 그 파트를 평가하지 않은 것으로 보아 기준시가 비율로 안분합니다 (부가가치세법 시행령 §64①1호 단서).`);
  }

  if (mode === "actual") {
    if (!entered(a.landTransferPrice) || !entered(a.buildingTransferPrice)) {
      return fieldError(
        !entered(a.landTransferPrice) ? "landTransferPrice" : "buildingTransferPrice",
        `${label}: 계약서에 구분 기재된 토지·건물 양도가액을 둘 다 입력하세요 (소득세법 §100②). 구분 기재가 없으면 「양도시 기준시가 비율」이나 「감정평가가액으로 안분」을 선택하세요.`,
      );
    }
    const land = parseAmount(a.landTransferPrice);
    const building = parseAmount(a.buildingTransferPrice);
    const total = parseAmount(form.contractTotalPrice);
    if (total > 0 && land + building !== total) {
      return fieldError("landTransferPrice", `${label}: 토지 양도가액(${land.toLocaleString()})과 건물 양도가액(${building.toLocaleString()})의 합(${(land + building).toLocaleString()})이 양도가액(${total.toLocaleString()})과 같아야 합니다.`);
    }
    if (saleSplitProvisoApplies(form.transferDate) && a.saleSplitExemption && !a.saleSplitExemptionNote?.trim()) {
      return fieldError("saleSplitExemptionNote", `${label}: 「소득세법 시행령」 제166조 제8항 예외를 선택했으면 그 근거를 입력하세요 — 구분 기재한 가액을 그대로 인정받는 사유이므로 신고서에 기재해야 합니다.`);
    }
  }
  return null;
}
