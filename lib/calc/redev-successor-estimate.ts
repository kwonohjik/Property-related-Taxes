/**
 * 승계조합원 완공 APT — 취득가액 추계(감정가액·매매사례가액·환산취득가액) 축 (계획서 `docs/02-design/features/redev-successor-apt-estimate.plan.md` Q-1 a).
 *
 * 매매로 승계한 완공 APT(부담부증여 아님)만 해당한다(`isRedevSuccessorAptEstimable`). 취득일은 사용승인일이라(소득세법 시행령 §162①4호)
 * 추계 기준일(§176의2③ 「취득일 전후 각 3개월」)과 「취득 당시 기준시가」(환산 분자 · 개산공제 §163⑥)도 사용승인일 값이다.
 * ⑤ 라디오가 고른 값을 ④·⑧이 같은 판정으로 읽는다 — 판정 순서는 ④ `primaryAcquisitionModeFlags`와 같다(매매사례 > 감정 > 환산).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isRedevSuccessorAptEstimable } from "./redev-acquisition-price-source";
import { fieldError } from "./transfer-tax-validate-field";

export type SuccessorAptAcqMode = "actual" | "appraisal" | "salesCase" | "converted";

type ModeFields = Pick<
  AssetForm,
  | "assetKind" | "redevIsSuccessorMember" | "acquisitionCause" | "transferType"
  | "isSalesCaseAcquisition" | "isAppraisalAcquisition" | "useEstimatedAcquisition"
>;

/** 승계 APT 취득가액 산정 방식 — 추계를 고를 수 없는 승계(상속·증여·부담부증여)와 승계 아닌 자산은 `undefined`. */
export function successorAptAcqMode(asset: ModeFields): SuccessorAptAcqMode | undefined {
  if (!isRedevSuccessorAptEstimable(asset)) return undefined;
  if (asset.isSalesCaseAcquisition === true) return "salesCase";
  if (asset.isAppraisalAcquisition === true) return "appraisal";
  if (asset.useEstimatedAcquisition === true) return "converted";
  return "actual";
}

/**
 * ⑧ — 매매 승계 APT의 취득가액 칸. 산정 방식마다 화면에 있는 칸을 요구한다(⑫ `refinePrimaryAcquisitionInputs` 승계 규칙과 같은 축).
 * 실거래가·감정가액은 같은 칸(`fixedAcquisitionPrice` — 라벨만 바뀐다)이다. 추계 3종은 개산공제(§163⑥) base인 취득 당시 기준시가가 필요하고,
 * 환산은 분모인 양도 당시 기준시가도 필요하다(§176의2②2호). `undefined`면 이 규칙의 대상이 아니다.
 */
export function successorAptAcquisitionIssue(
  asset: ModeFields & Pick<AssetForm, "fixedAcquisitionPrice" | "similarSalesValue" | "standardPriceAtAcq" | "standardPriceAtTransfer">,
  label: string,
): ReturnType<typeof fieldError> | null | undefined {
  const mode = successorAptAcqMode(asset);
  if (mode === undefined) return undefined;
  if (mode === "actual" && parseAmount(asset.fixedAcquisitionPrice) <= 0)
    return fieldError("fixedAcquisitionPrice", `${label}: 승계조합원 — 입주권을 매매로 승계취득한 취득가액(실지거래가액)을 입력하세요. (소득세법 §97①1호 가목)`);
  if (mode === "appraisal" && parseAmount(asset.fixedAcquisitionPrice) <= 0)
    return fieldError("fixedAcquisitionPrice", `${label}: 감정가액을 입력하세요 — 사용승인일 전후 3개월 이내 감정가액입니다. (소득세법 시행령 §176의2③2호 · §162①4호)`);
  if (mode === "salesCase" && parseAmount(asset.similarSalesValue) <= 0)
    return fieldError("similarSalesValue", `${label}: 매매사례가액을 입력하세요 — 사용승인일 전후 3개월 이내 매매사례입니다. (소득세법 시행령 §176의2③1호 · §162①4호)`);
  if (mode !== "actual" && parseAmount(asset.standardPriceAtAcq) <= 0)
    return fieldError("standardPriceAtAcq", `${label}: 취득 당시 기준시가(사용승인일 당시 공동주택가격)를 입력하세요. (소득세법 시행령 §163⑥ · §176의2②2호)`);
  if (mode === "converted" && parseAmount(asset.standardPriceAtTransfer) <= 0)
    return fieldError("standardPriceAtTransfer", `${label}: 양도 당시 기준시가를 입력하세요. (소득세법 시행령 §176의2②2호)`);
  return null;
}
