/**
 * 상속세 비과세·과세가액 불산입 체크리스트 — 단일 출처 헬퍼
 *
 * 역할:
 *  - ruleId → 그룹·섹션·label 메타 정의 (EXEMPTION_CHECKLIST_META)
 *  - exemptionItemHasValue — 해당 항목에 값이 입력돼 있는지 판정
 *    (값 있는데 미체크 → amber 경고 점)
 *
 * 체크 상태 단일 진실:
 *  - "체크됨" = ruleId가 exemptionItems[] 배열에 존재 (checkedMap.has(ruleId))
 *  - 별도 checked 필드 추가 없음 — 기존 ExemptionCheckedItem 타입 무변경
 *
 * 정책:
 *  - useEffect → store 미러링 금지 (feedback_useeffect_store_mirror_forbidden)
 *  - Step4 deduction-checklist 패턴 준용 (단순화: 수동 항목만)
 *
 * 동기화 지점: ⑤ UI 위젯 (체크리스트 패널 + 입력 섹션)
 */

import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";

// ────────────────────────────────────────────────────
// 칩 라벨 (메타 일원화)
// ────────────────────────────────────────────────────

/**
 * 칩 표시용 짧은 라벨 (rule.name과 다를 때만 명시).
 * 칩 그룹(sky/violet)·노출 항목·순서는 ExemptionChecklist 부모가
 * getExemptionRulesByCategory(category) + getExemptionTreatment(rule)으로 결정한다
 * (세목별 분기 단일 진실). 여기는 라벨 override만 — 미정의 ruleId는 rule.name 사용.
 *
 * 메타 일원화: 과거 inh_* 전용 EXEMPTION_CHECKLIST_META(label+group+section)·
 * NONTAXABLE_RULE_IDS·NOT_INCLUDED_RULE_IDS 폐기(증여세에 inh_* 오노출 버그 원인).
 */
export const EXEMPTION_CHIP_LABELS: Record<string, string> = {
  inh_state_bequest: "국가·지자체 유증",
  inh_forest_burial: "금양임야",
  inh_grave_land: "묘토",
  inh_ritual_items: "족보·제구",
  inh_emergency_relief: "이재구호금품·치료비",
  inh_political_bequest: "정당 유증",
  inh_public_interest: "공익법인 출연",
  inh_public_trust: "공익신탁 출연",
};

/** 칩 라벨 — override 있으면 사용, 없으면 rule.name fallback */
export function getExemptionChipLabel(ruleId: string, fallbackName: string): string {
  return EXEMPTION_CHIP_LABELS[ruleId] ?? fallbackName;
}

// ────────────────────────────────────────────────────
// 값 판정 헬퍼
// ────────────────────────────────────────────────────

/**
 * 해당 항목에 값(금액·면적·협의분할)이 하나라도 입력돼 있는지 판정.
 * 값이 있는데 미체크이면 amber 경고 점 표시에 사용.
 */
export function exemptionItemHasValue(item: ExemptionCheckedItem): boolean {
  if ((item.claimedAmount ?? 0) > 0) return true;
  if ((item.claimedAreaM2 ?? 0) > 0) return true;
  if (item.heirAllocations !== undefined) return true;
  return false;
}
