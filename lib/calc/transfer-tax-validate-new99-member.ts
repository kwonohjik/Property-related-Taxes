/**
 * ⑧ §99·§99의3 **재개발 완공 아파트 조합원 갈래** 공용 검사 (NH-36 · NH-16 · NH-27 · NH-32).
 *
 * 엔진(`new-99-redev-member.ts`)·④(`transfer-tax-api-redev.ts` 준공일 · `transfer-tax-api-reductions.ts` 잔여주택 계약 사실)·
 * ⑫(`refineReductionRequiredInputs`)와 같은 술어다. 조합원 갈래면 매매계약일·사용승인일·취득 유형 대신 준공일로 판정한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { fieldError } from "./transfer-tax-validate-field";
import { redevMemberNewHouseScope } from "./redev-field-scope";
import { isAddenda29_2WindowIso } from "@/lib/tax-engine/transfer-reductions/new-99-3-era";
import { redevMemberNeedsRemainderAnswerIso } from "@/lib/tax-engine/transfer-reductions/new-99-redev-member";
import { NEW_99_3_ADDENDA_6762, NEW_HOUSING_ACQUISITION_ARTICLE as ART } from "@/lib/tax-engine/legal-codes/transfer-house";

/** 조합원 갈래의 필수 입력 — 없으면 undefined. 조합원 갈래가 아니면 호출하지 않는다. */
export function redevMemberNewHouseIssue(
  asset: AssetForm,
  r: { type: "new_99_3"; remainderContract993?: string; constructionStartedBefore2003_993?: string } | { type: "new_99"; remainderContract99?: string; isNationalHousing99?: boolean },
): string | undefined {
  const member = redevMemberNewHouseScope(asset);
  if (!member) return undefined;
  const label = r.type === "new_99_3" ? "§99의3" : "§99";
  if (!member.completionDate) {
    return fieldError(
      "redevCompletionDate",
      `${label} 적용: 재개발·재건축 조합원이 받은 신축주택은 준공일(사용승인·사용검사일)로 신축주택취득기간과 5년을 판정합니다 — 준공일을 입력하세요.`,
    );
  }
  if (asset.redevApprovalDate && member.completionDate < asset.redevApprovalDate) {
    return fieldError("redevCompletionDate", `${label} 적용: 준공일은 관리처분계획 인가일 이후여야 합니다.`);
  }
  if (r.type === "new_99_3") {
    if (redevMemberNeedsRemainderAnswerIso("new_99_3", member.completionDate) && !r.remainderContract993) {
      return fieldError(
        "reduction.new_99_3.remainderContract993",
        `§99의3 적용: 준공일이 신축주택취득기간(2001.5.23.~2003.6.30.) 뒤입니다 — 조합이 그 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받았는지(예·아니오·모름) 선택하세요 (${ART.NEW_99_3_MEMBER_REMAINDER}).`,
      );
    }
    if (isAddenda29_2WindowIso("self_built", member.completionDate) && !r.constructionStartedBefore2003_993) {
      return fieldError(
        "reduction.new_99_3.constructionStartedBefore2003_993",
        `§99의3 적용: 준공일이 2003.1.1.~2003.6.30.이면 2003.1.1. 전에 공사에 착수했는지(예·아니오·모름) 선택하세요 (${NEW_99_3_ADDENDA_6762.PRIOR_CONSTRUCTION_STARTED}).`,
      );
    }
    return undefined;
  }
  if (redevMemberNeedsRemainderAnswerIso("new_99", member.completionDate, r.isNationalHousing99) && !r.remainderContract99) {
    return fieldError(
      "reduction.new_99.remainderContract99",
      `§99 적용: 준공일이 신축주택취득기간 뒤입니다 — 조합이 그 기간 안에 조합원 외의 자와 잔여주택 매매계약을 직접 체결하고 계약금을 받았는지(예·아니오·모름) 선택하세요 (${ART.NEW_99_MEMBER_REMAINDER}).`,
    );
  }
  return undefined;
}
