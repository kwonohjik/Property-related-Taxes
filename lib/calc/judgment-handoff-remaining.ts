/**
 * 판정 메뉴 → 양도소득세 계산기로 넘긴 뒤 계산기에서 **더 넣어야 계산되는 값** (2026-11 리뷰 I-15 · D-49).
 *
 * 종전 안내(「취득가액·필요경비」)는 실측과 달랐다 — 계산기 ⑧이 막는 값은 주택이면 소재지(비웠을 때)·취득가액,
 * 입주권이면 소재지(비웠을 때)·권리가액·인가 전 부분의 종전 주택 취득가액이고, 필요경비·청산금은 ⑧ 필수가 아니다.
 * 이 목록대로 채우면 계산기 ⑧이 0건이다(anchor `judgment-display-pr13`).
 *
 * 공유 지분율은 ⑧이 막지 않는 값이라 이 목록과 따로 「확인할 값」으로 둔다(D-49) — 넘기기는 자산을 통째로 바꿔 지분이 100%가 된다.
 */
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

export function handoffRemainingInputs(form: OneHouseJudgmentFormData): string[] {
  const p = form.assets[0];
  const address = !p?.addressRoad?.trim() && !p?.addressJibun?.trim() ? ["소재지"] : [];
  if (!judgmentSaleIsHousing(form)) return [...address, "권리가액", "관리처분계획 인가 전 부분의 종전 주택 취득가액"];
  return [...address, "취득가액"];
}

/** 폼을 모르는 화면(불러오기 모달)용 — 위 목록의 두 갈래를 한 문장으로. */
export const HANDOFF_REMAINING_INPUTS_SUMMARY =
  "주택은 소재지(비어 있으면)·취득가액, 조합원입주권은 소재지(비어 있으면)·권리가액·관리처분계획 인가 전 부분의 종전 주택 취득가액";

/** D-49 — 공동명의 확인 안내(넘기기·불러오기 두 문구 공용). */
// PR-20b 뒤: 판정 메뉴 ②의 공동명의 토글·지분율이 넘기기로 함께 간다 — 켜지 않은 판정은 100%로 넘어간다.
export const HANDOFF_OWNERSHIP_SHARE_NOTE =
  "공동명의라면 판정 메뉴 ②에서 「공동명의(지분)로 소유합니다」를 켜고 본인 지분율을 넣으세요 — 그 지분이 계산기로 함께 넘어갑니다. 켜지 않은 판정은 100%로 넘어가므로 " +
  "계산기의 〈공유 지분율〉을 본인 지분으로 고치고 〈나머지 지분은 타인 소유〉를 켜세요. 판정 메뉴의 금액은 주택 전체(100%) 기준입니다.";
