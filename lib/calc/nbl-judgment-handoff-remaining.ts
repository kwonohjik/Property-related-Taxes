/**
 * 비사업용 토지 판정 메뉴 → 양도소득세 계산기로 넘긴 뒤 계산기에서 **더 넣어야 계산되는 값** (계획서 `nbl-judgment-menu.ui.plan.md` §7 · 1주택 `judgment-handoff-remaining.ts`의 I-15와 같은 규율).
 *
 * 취득원인마다 계산기 ⑧이 막는 취득가액 칸이 다르다 — 실측(probe, 계산기 `collectStepIssues` 0~3단계):
 *   · 매매 → 취득가액 · 상속 → 상속개시일 평가액 · 증여 → 증여 신고가액 · 이월과세 → 증여 당시 평가액 + 증여자 취득가액(또는 환산 토글)
 * 모두 총 양도가액이 먼저다. 이 목록대로 채우면 계산기 ⑧ 0~3단계가 0건이다(anchor `nbl-judgment-handoff.anchor.test.ts` H-3) —
 * 문구는 계산기 ⑧ 오류 문구의 칸 이름과 같게 적는다. 필요경비·감면은 ⑧ 필수가 아니다.
 */
import type { NblJudgmentFormData } from "@/lib/stores/nbl-judgment-form.types";

export function nblHandoffRemainingInputs(form: NblJudgmentFormData): string[] {
  const cause = form.assets[0]?.acquisitionCause;
  if (cause === "inheritance") return ["총 양도가액", "상속개시일 평가액(상속세 신고가액)"];
  if (cause === "gift") return ["총 양도가액", "증여 신고가액"];
  if (cause === "carryover_gift") return ["총 양도가액", "증여 당시 평가액", "증여자 취득가액(환산취득가를 쓰면 환산 방식)"];
  return ["총 양도가액", "취득가액"];
}
