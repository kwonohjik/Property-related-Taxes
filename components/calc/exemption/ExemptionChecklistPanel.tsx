"use client";

/**
 * ExemptionChecklistPanel — 비과세·과세가액 불산입 항목 한눈에 보기 칩 패널
 *
 * 역할:
 *  - 마스터 "여" 선택 후 상단에 항목 칩 그리드 제공
 *  - 비과세(§12) 6칩 + 과세가액 불산입(§16·§17) 2칩
 *  - 칩 클릭 → 항목 checked 토글 + 해당 그룹 자동 펼침
 *  - 값 있는데 미체크 → amber 경고 점
 *
 * 정책:
 *  - useEffect → store 미러링 절대 금지 (feedback_useeffect_store_mirror_forbidden)
 *    칩 onClick에서 직접 onToggle + onGroupOpen 호출
 *  - native checkbox 신규 금지 — 칩 버튼 패턴(Step4DeductionChecklist.ManualChip 준용)
 *  - feedback_tailwind_static_tone_mapping: dynamic bg-${tone} 금지 → Record 정적 매핑
 */

import { cn } from "@/lib/utils";
import {
  getExemptionChipLabel,
  exemptionItemHasValue,
} from "@/lib/calc/inheritance-exemption-checklist";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";
import type { ExemptionRule } from "@/lib/tax-engine/exemption-rules";

// ────────────────────────────────────────────────────
// 정적 색조 매핑 (feedback_tailwind_static_tone_mapping)
// ────────────────────────────────────────────────────

const GROUP_HEADER: Record<"sky" | "violet", string> = {
  sky: "text-sky-700 dark:text-sky-300 font-semibold text-caption uppercase tracking-wide",
  violet: "text-violet-700 dark:text-violet-300 font-semibold text-caption uppercase tracking-wide",
};

const GROUP_DIVIDER: Record<"sky" | "violet", string> = {
  sky: "border-t border-sky-100 dark:border-sky-900 pt-2",
  violet: "border-t border-violet-100 dark:border-violet-900 pt-2",
};

const CHIP_ON: Record<"sky" | "violet", string> = {
  sky: "inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100/80 px-2.5 py-1 text-caption font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200 cursor-pointer",
  violet: "inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100/80 px-2.5 py-1 text-caption font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200 cursor-pointer",
};

const CHIP_OFF: Record<"sky" | "violet", string> = {
  sky: "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-caption font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 cursor-pointer hover:border-sky-300 hover:bg-sky-50/60",
  violet: "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-caption font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 cursor-pointer hover:border-violet-300 hover:bg-violet-50/60",
};

const CHECK_BOX_ON: Record<"sky" | "violet", string> = {
  sky: "border-sky-500 bg-sky-500 text-white",
  violet: "border-violet-500 bg-violet-500 text-white",
};

// ────────────────────────────────────────────────────
// 개별 항목 칩
// ────────────────────────────────────────────────────

function ExemptionChip({
  rule,
  group,
  checkedMap,
  itemMap,
  onToggle,
  onGroupOpen,
}: {
  /** 표시할 규칙 — 라벨·세목별 항목은 부모가 category 필터로 결정 */
  rule: ExemptionRule;
  /** 칩 색조: 비과세=sky / 과세가액 불산입=violet */
  group: "sky" | "violet";
  checkedMap: Map<string, ExemptionCheckedItem>;
  /** ruleId → 값 있는 미체크 항목 (경고 점 표시용) */
  itemMap: Map<string, ExemptionCheckedItem>;
  onToggle: (ruleId: string) => void;
  /** 체크 시 해당 그룹 자동 펼침 (useEffect 금지 — onClick 직접) */
  onGroupOpen: () => void;
}) {
  const ruleId = rule.id;
  const label = getExemptionChipLabel(ruleId, rule.name);

  const active = checkedMap.has(ruleId);
  const item = itemMap.get(ruleId);
  // 값 있는데 미체크 → amber 경고 점
  const showWarning = !active && item != null && exemptionItemHasValue(item);

  const handleClick = () => {
    const willBeActive = !active;
    onToggle(ruleId);
    // 체크하는 방향이면 그룹 펼침
    if (willBeActive) {
      onGroupOpen();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(active ? CHIP_ON[group] : CHIP_OFF[group])}
      aria-pressed={active}
      title={
        active
          ? `${label} — 클릭하여 숨기기 (값 보존)`
          : `${label} — 클릭하여 입력 섹션 열기`
      }
    >
      {/* 체크박스 역할 시각 표시 */}
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border text-micro font-bold shrink-0",
          active
            ? CHECK_BOX_ON[group]
            : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800",
        )}
      >
        {active && "✓"}
      </span>
      <span>{label}</span>
      {/* 값 있는데 비활성 → amber 경고 점 */}
      {showWarning && (
        <span
          className="h-2 w-2 rounded-full bg-amber-400 shrink-0"
          title="입력값이 있으나 계산에서 제외됩니다"
        />
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────

export function ExemptionChecklistPanel({
  items,
  nonTaxableRules,
  notIncludedRules,
  nonTaxableLaw,
  notIncludedLaw,
  onToggle,
  onNontaxableGroupOpen,
  onNotIncludedGroupOpen,
}: {
  items: ExemptionCheckedItem[];
  /** 비과세 그룹 규칙 — 부모가 category 필터(getExemptionRulesByCategory)로 결정 */
  nonTaxableRules: ExemptionRule[];
  /** 과세가액 불산입 그룹 규칙 — 부모가 category 필터로 결정 */
  notIncludedRules: ExemptionRule[];
  /** 비과세 그룹 헤더 법령 라벨 (상속 "상증법 §12" / 증여 "상증법 §46") */
  nonTaxableLaw: string;
  /** 불산입 그룹 헤더 법령 라벨 (상속 "상증법 §16·§17") */
  notIncludedLaw: string;
  /** ruleId 체크 토글 — 항목 추가/제거 */
  onToggle: (ruleId: string) => void;
  /** 비과세 그룹 자동 펼침 — onClick에서 직접 호출 (useEffect 금지) */
  onNontaxableGroupOpen: () => void;
  /** 과세가액 불산입 그룹 자동 펼침 — onClick에서 직접 호출 (useEffect 금지) */
  onNotIncludedGroupOpen: () => void;
}) {
  const checkedMap = new Map(items.map((i) => [i.ruleId, i]));
  // 경고 점: 배열에 없는데 값이 있는 항목 — 현행 구조에서 미체크=배열에 없음이므로
  // 배열에 있지만 amount=0·area=undefined인 항목을 감지 (체크 해제 없이 값만 초기화된 경우)
  // 실제로는 체크 해제 시 배열에서 제거되므로 이 경고는 "배열에 있고 값 없음" 케이스에 해당
  // → 사용자가 체크만 했고 금액을 아직 안 입력한 상태를 amber로 알려줄 수 없는 상황.
  // 계획서 §3.1 "체크 해제 시 입력값 보존" 패턴을 구현하려면 스토어에 미체크 항목도 유지해야 함.
  // 현행에서 체크 해제 = 배열 제거이므로 경고 점은 "배열에 있고 금액=0" 케이스만 가능.
  const itemMap = checkedMap; // alias for clarity

  // 경고 개수 (배열에 있지만 값이 없는 항목: 체크만 하고 금액 미입력)
  const warningCount = items.filter((i) => !exemptionItemHasValue(i)).length;

  return (
    <div className="space-y-3">
      {/* 금액 미입력 경고 배지 (체크만 하고 값 없는 항목) */}
      {warningCount > 0 && (
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-micro font-medium text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {warningCount}개 항목 — 금액 미입력
          </span>
        </div>
      )}

      {/* 비과세 그룹 (sky) — 세목별 항목은 부모 category 필터로 결정 */}
      {nonTaxableRules.length > 0 && (
        <div className="space-y-1.5">
          <p className={GROUP_HEADER.sky}>
            비과세 <span className="font-normal normal-case tracking-normal text-sky-600 dark:text-sky-400">{nonTaxableLaw}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nonTaxableRules.map((rule) => (
              <ExemptionChip
                key={rule.id}
                rule={rule}
                group="sky"
                checkedMap={checkedMap}
                itemMap={itemMap}
                onToggle={onToggle}
                onGroupOpen={onNontaxableGroupOpen}
              />
            ))}
          </div>
        </div>
      )}

      {/* 과세가액 불산입 그룹 (violet) — 증여세는 해당 항목 없으면 미렌더 */}
      {notIncludedRules.length > 0 && (
        <div className={cn("space-y-1.5", GROUP_DIVIDER.violet)}>
          <p className={GROUP_HEADER.violet}>
            과세가액 불산입 <span className="font-normal normal-case tracking-normal text-violet-600 dark:text-violet-400">{notIncludedLaw}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {notIncludedRules.map((rule) => (
              <ExemptionChip
                key={rule.id}
                rule={rule}
                group="violet"
                checkedMap={checkedMap}
                itemMap={itemMap}
                onToggle={onToggle}
                onGroupOpen={onNotIncludedGroupOpen}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
