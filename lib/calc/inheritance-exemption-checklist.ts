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
// 그룹·섹션 타입
// ────────────────────────────────────────────────────

export type ExemptionRuleGroup = "sky" | "violet";
export type ExemptionRuleSection = "nontaxable" | "not_included";

// ────────────────────────────────────────────────────
// 항목 메타
// ────────────────────────────────────────────────────

export interface ExemptionChecklistMeta {
  label: string;
  group: ExemptionRuleGroup;
  /** 법령 섹션 (패널 섹션 구분) */
  section: ExemptionRuleSection;
}

/**
 * 8개 항목 메타 정의.
 * - nontaxable (§12): sky 톤 — 비과세
 * - not_included (§16·§17): violet 톤 — 과세가액 불산입
 */
export const EXEMPTION_CHECKLIST_META: Record<string, ExemptionChecklistMeta> = {
  inh_state_bequest: {
    label: "국가·지자체 유증",
    group: "sky",
    section: "nontaxable",
  },
  inh_forest_burial: {
    label: "금양임야",
    group: "sky",
    section: "nontaxable",
  },
  inh_grave_land: {
    label: "묘토",
    group: "sky",
    section: "nontaxable",
  },
  inh_ritual_items: {
    label: "족보·제구",
    group: "sky",
    section: "nontaxable",
  },
  inh_emergency_relief: {
    label: "이재구호금품·치료비",
    group: "sky",
    section: "nontaxable",
  },
  inh_political_bequest: {
    label: "정당 유증",
    group: "sky",
    section: "nontaxable",
  },
  inh_public_interest: {
    label: "공익법인 출연",
    group: "violet",
    section: "not_included",
  },
  inh_public_trust: {
    label: "공익신탁 출연",
    group: "violet",
    section: "not_included",
  },
};

/** 섹션별 ruleId 순서 배열 */
export const NONTAXABLE_RULE_IDS: string[] = [
  "inh_state_bequest",
  "inh_forest_burial",
  "inh_grave_land",
  "inh_ritual_items",
  "inh_emergency_relief",
  "inh_political_bequest",
];

export const NOT_INCLUDED_RULE_IDS: string[] = [
  "inh_public_interest",
  "inh_public_trust",
];

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
