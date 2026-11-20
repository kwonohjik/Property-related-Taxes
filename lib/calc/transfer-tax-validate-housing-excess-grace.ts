/**
 * ⑧ 주택 배율 초과분 유예기간 행 검증 (NBL2611-C4 · R16) — NBL 섹션(`transfer-tax-validate-nbl.ts`)과 **같은 helper**(`graceRowIssue`)·같은 칸 키를 쓴다.
 * 입력이 화면에 보일 때(`housingExcessGraceApplies` — ⑤ 노출·④ 전송과 같은 술어)만 막는다. 보이지 않는 자산의 남은 행은 세액에 닿지 않으므로 막지 않는다.
 * 사유별 필수 입력이 비거나 날짜가 역순이면 행이 조용히 빈 구간이 되어 유예가 사라진다 — 자동 안분 fallback 금지.
 */
import { graceRowIssue } from "@/lib/tax-engine/non-business-land/grace-row-issue";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { housingExcessGraceApplies } from "./appurtenant-excess-facts";
import { fieldError } from "./transfer-tax-validate-field";

export function validateHousingExcessGrace(asset: AssetForm, label: string, transferDate: string | undefined): string | null {
  if (!housingExcessGraceApplies(asset, transferDate)) return null;
  for (const [gi, g] of (asset.nblGracePeriods ?? []).entries()) {
    const issue = graceRowIssue(g, gi);
    // 칸 키는 정적 앵커 게이트가 읽도록 리터럴 접미로 분기한다
    if (issue?.part === "secondaryDate") return fieldError(`nblGracePeriods.${gi}.secondaryDate`, `${label}: ${issue.message}`);
    if (issue?.part === "anchorDate") return fieldError(`nblGracePeriods.${gi}.anchorDate`, `${label}: ${issue.message}`);
    if (issue?.part === "endDate") return fieldError(`nblGracePeriods.${gi}.endDate`, `${label}: ${issue.message}`);
  }
  return null;
}
