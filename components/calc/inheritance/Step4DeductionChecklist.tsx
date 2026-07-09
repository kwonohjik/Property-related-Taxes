"use client";

/**
 * Step4DeductionChecklist — 상속세 Step4 공제 항목 체크리스트 패널
 *
 * 역할:
 *  - Step4 상단에 공제 항목 전체를 조망할 수 있는 칩 그리드 제공
 *  - 자동 항목(4개): 읽기전용 상태 배지 — 감지되면 "자동 도출 ✓", 미감지면 "직접 입력 가능" 안내
 *    ★ 입력 섹션은 항상 노출(자동 항목은 Step4Deductions.tsx에서 무조건 렌더)
 *    → "직접 입력 켜기" 토글 제거 (항상 노출되므로 불필요)
 *  - 수동 항목(8개): 체크박스 칩 — 체크 시 입력 섹션 노출, 해제 시 섹션 숨김(값 보존)
 *
 * 정책:
 *  - useEffect → store 미러링 절대 금지 (feedback_useeffect_store_mirror_forbidden)
 *  - 칩 클릭 시에만 set(). 파생값은 렌더 시마다 순수 계산
 *  - native checkbox 신규 금지 — ToggleCard chip variant 패턴 준용 (Switch 기반)
 *  - feedback_tailwind_static_tone_mapping: dynamic `bg-${tone}` 금지 → Record 정적 매핑
 */

import { cn } from "@/lib/utils";
import {
  AUTO_KEYS,
  MANUAL_KEYS,
  isManualItemActive,
  manualItemHasValue,
  autoItemHasValue,
} from "@/lib/calc/inheritance-deduction-checklist";
import type {
  AutoChecklistKey,
  ManualChecklistKey,
  DeductionChecklistKey,
} from "@/lib/calc/inheritance-deduction-checklist";
import type { FormState, FormSet } from "./shared";

// ────────────────────────────────────────────────────
// 메타데이터
// ────────────────────────────────────────────────────

const AUTO_META: Record<AutoChecklistKey, { label: string; law: string; group: "emerald" }> = {
  spouse: { label: "배우자 공제 §19", law: "상속세및증여세법 §19", group: "emerald" },
  financial: { label: "금융재산공제 §22", law: "상속세및증여세법 §22", group: "emerald" },
  cohabit: { label: "동거주택공제 §23의2", law: "상속세및증여세법 §23의2", group: "emerald" },
  farming: { label: "영농상속공제 §18의3", law: "상속세및증여세법 §18의3", group: "emerald" },
};

const MANUAL_META: Record<ManualChecklistKey, { label: string; group: "emerald" | "amber" | "violet" }> = {
  familyBusiness: { label: "가업상속공제 §18의2", group: "emerald" },
  legatee: { label: "상속외자 유증 §19·§24", group: "amber" },
  priorGiftDeduction: { label: "사전증여 공제합계 §24", group: "amber" },
  disasterAdjust: { label: "§24 분자 보정·재해손실", group: "amber" },
  casualtyLoss: { label: "재해손실공제 §23", group: "amber" },
  appraisalFee: { label: "감정평가수수료 §25", group: "amber" },
  foreignTax: { label: "외국납부세액공제 §29", group: "violet" },
  shortTermReinherit: { label: "단기재상속공제 §30", group: "violet" },
};

// ────────────────────────────────────────────────────
// 정적 색조 매핑 (feedback_tailwind_static_tone_mapping)
// ────────────────────────────────────────────────────

const GROUP_HEADER: Record<"emerald" | "amber" | "violet", string> = {
  emerald: "text-emerald-700 dark:text-emerald-300 font-semibold text-caption uppercase tracking-wide",
  amber: "text-amber-700 dark:text-amber-300 font-semibold text-caption uppercase tracking-wide",
  violet: "text-violet-700 dark:text-violet-300 font-semibold text-caption uppercase tracking-wide",
};

const GROUP_DIVIDER: Record<"emerald" | "amber" | "violet", string> = {
  emerald: "border-t border-emerald-100 dark:border-emerald-900 pt-2",
  amber: "border-t border-amber-100 dark:border-amber-900 pt-2",
  violet: "border-t border-violet-100 dark:border-violet-900 pt-2",
};

/** 자동 항목 칩 — 감지됨(emerald 진함) / 미감지(emerald 연함, 항상 노출 안내) */
const AUTO_CHIP_DETECTED =
  "inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100/80 px-2.5 py-1 text-caption font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 select-none";
const AUTO_CHIP_UNDETECTED =
  "inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/60 px-2.5 py-1 text-caption font-medium text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 select-none";

// ────────────────────────────────────────────────────
// 서브 컴포넌트 — 자동 항목 칩 (읽기전용 상태 배지)
// ────────────────────────────────────────────────────

/** 수동 항목 칩 — 체크(활성) / 미체크 */
const MANUAL_CHIP_ON: Record<"emerald" | "amber" | "violet", string> = {
  emerald:
    "inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/80 px-2.5 py-1 text-caption font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 cursor-pointer",
  amber:
    "inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100/80 px-2.5 py-1 text-caption font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 cursor-pointer",
  violet:
    "inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-100/80 px-2.5 py-1 text-caption font-medium text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200 cursor-pointer",
};
const MANUAL_CHIP_OFF: Record<"emerald" | "amber" | "violet", string> = {
  emerald:
    "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-caption font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/60",
  amber:
    "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-caption font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 cursor-pointer hover:border-amber-300 hover:bg-amber-50/60",
  violet:
    "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-caption font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400 cursor-pointer hover:border-violet-300 hover:bg-violet-50/60",
};

// ────────────────────────────────────────────────────
// 서브 컴포넌트 — 자동 항목 칩 (읽기전용 상태 배지 + 그룹 A 펼침 진입)
// ★ 자동 항목 입력 섹션은 Step4Deductions.tsx에서 무조건 렌더 (게이팅 없음)
//   → 이 칩 클릭 시 그룹 A(deduction) 펼침만 수행 (상태 토글 아님).
//   → "직접 입력하려면 클릭" 힌트로 클릭 가능 표시.
// ────────────────────────────────────────────────────

function AutoChip({
  chipKey,
  form,
  autoDetected,
  onGroupOpen,
}: {
  chipKey: AutoChecklistKey;
  form: FormState;
  autoDetected: boolean;
  /** 클릭 시 그룹 A(deduction) 펼침 콜백 — 자동 항목 입력 진입 경로 */
  onGroupOpen?: () => void;
}) {
  const meta = AUTO_META[chipKey];
  const hasVal = autoItemHasValue(form, chipKey);

  if (autoDetected || hasVal) {
    // 자동 도출됨 or 값 입력됨 → 진한 emerald 배지 (클릭 시 그룹 펼침)
    return (
      <button
        type="button"
        onClick={onGroupOpen}
        className={cn(AUTO_CHIP_DETECTED, "cursor-pointer")}
        title={`${meta.law} — 클릭하여 직접 입력란 열기`}
      >
        <span>✓</span>
        <span>{meta.label}</span>
        <span className="text-emerald-600 dark:text-emerald-400 text-micro">
          {autoDetected ? "자동 도출" : "입력됨"}
        </span>
      </button>
    );
  }

  // 미감지 + 값 없음 → 연한 emerald 안내 배지 (클릭 시 그룹 펼침)
  return (
    <button
      type="button"
      onClick={onGroupOpen}
      className={cn(AUTO_CHIP_UNDETECTED, "cursor-pointer")}
      title={`${meta.label} — 클릭하여 직접 입력란 열기`}
    >
      <span>{meta.label}</span>
      <span className="text-emerald-500 dark:text-emerald-500 text-micro">직접 입력 가능</span>
    </button>
  );
}

// ────────────────────────────────────────────────────
// 서브 컴포넌트 — 수동 항목 칩
// ────────────────────────────────────────────────────

function ManualChip({
  chipKey,
  form,
  set,
  onToggle,
}: {
  chipKey: ManualChecklistKey;
  form: FormState;
  set: FormSet;
  /**
   * 칩 상태 전환 직후 호출되는 콜백.
   * willBeActive: 전환 후의 활성 상태(true=체크됨, false=해제됨).
   * 부모(Step4Deductions)는 이 콜백에서 그룹 펼침 처리.
   * ★ useEffect → state 미러링 금지 — onClick에서 직접 호출.
   */
  onToggle?: (chipKey: ManualChecklistKey, willBeActive: boolean) => void;
}) {
  const meta = MANUAL_META[chipKey];
  const active = isManualItemActive(form, chipKey);
  const hasVal = manualItemHasValue(form, chipKey);
  // 값이 있는데 비활성 → amber 경고 점
  const showWarning = hasVal && !active;

  const handleClick = () => {
    if (chipKey === "casualtyLoss") {
      // casualtyLoss는 단일 진실 casualtyLossEnabled 직접 토글
      const willBeActive = !form.casualtyLossEnabled;
      set({ casualtyLossEnabled: willBeActive });
      onToggle?.(chipKey, willBeActive);
      return;
    }
    const prev = form.deductionChecklistOverrides;
    const next: Partial<Record<DeductionChecklistKey, boolean>> = { ...prev };
    let willBeActive: boolean;
    if (active) {
      // 체크 해제: false로 명시 (값 보존, 계산 제외)
      next[chipKey] = false;
      willBeActive = false;
    } else {
      // 체크: true로 명시 (또는 기존 false 제거로 hasValue 기반으로 복귀)
      if (hasVal) {
        // 값이 있으면 override 제거 → manualItemHasValue가 자동 활성
        delete next[chipKey];
      } else {
        next[chipKey] = true;
      }
      willBeActive = true;
    }
    set({ deductionChecklistOverrides: next });
    onToggle?.(chipKey, willBeActive);
  };

  const group = meta.group;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(active ? MANUAL_CHIP_ON[group] : MANUAL_CHIP_OFF[group])}
      aria-pressed={active}
      title={active ? `${meta.label} — 클릭하여 숨기기 (값 보존)` : `${meta.label} — 클릭하여 입력 섹션 열기`}
    >
      {/* 체크박스 역할 시각 표시 */}
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border text-micro font-bold shrink-0",
          active
            ? group === "emerald"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : group === "amber"
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-violet-500 bg-violet-500 text-white"
            : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800",
        )}
      >
        {active && "✓"}
      </span>
      <span>{meta.label}</span>
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

export function Step4DeductionChecklist({
  form,
  set,
  autoDetected,
  onAutoChipClick,
  onManualChipToggle,
}: {
  form: FormState;
  set: FormSet;
  /** 자동 감지 여부 — autos 계산 결과를 호출측(steps.tsx)에서 전달 */
  autoDetected: Record<AutoChecklistKey, boolean>;
  /**
   * 자동 항목 칩 클릭 시 콜백 — 그룹 A(deduction) 자동 펼침용.
   * ★ useEffect 미러링 금지 — onClick에서 직접 호출.
   */
  onAutoChipClick?: () => void;
  /**
   * 수동 항목 칩 토글 시 콜백.
   * chipKey: 토글된 항목 키, willBeActive: 토글 후 활성 상태.
   * ★ useEffect 미러링 금지 — onClick에서 직접 호출.
   */
  onManualChipToggle?: (chipKey: ManualChecklistKey, willBeActive: boolean) => void;
}) {
  // 경고 점 개수 — 값 있는데 비활성인 수동 항목 수
  const warningCount = MANUAL_KEYS.filter(
    (k) => manualItemHasValue(form, k) && !isManualItemActive(form, k),
  ).length;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/20 p-3 space-y-3">
      {/* 패널 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          공제 항목 한눈에 보기
        </p>
        <p className="text-micro text-gray-500 dark:text-gray-400">
          — 해당 항목을 클릭하면 아래 그룹이 펼쳐집니다
        </p>
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-micro font-medium text-amber-800 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            {warningCount}개 항목 — 입력값 있으나 계산 제외
          </span>
        )}
      </div>

      {/* 그룹 A — 상속공제 (emerald) */}
      <div className="space-y-1.5">
        <p className={GROUP_HEADER.emerald}>상속공제 (A그룹)</p>
        <div className="flex flex-wrap gap-1.5">
          {/* 자동 항목 — 클릭 시 그룹 A 펼침 (입력 섹션은 항상 노출됨) */}
          {AUTO_KEYS.map((k) => (
            <AutoChip
              key={k}
              chipKey={k}
              form={form}
              autoDetected={autoDetected[k]}
              onGroupOpen={onAutoChipClick}
            />
          ))}
          {/* 수동 — 가업상속 (emerald 그룹) */}
          <ManualChip chipKey="familyBusiness" form={form} set={set} onToggle={onManualChipToggle} />
        </div>
      </div>

      {/* 그룹 B — 종합한도 보정·재해손실·수수료 (amber) */}
      <div className={cn("space-y-1.5", GROUP_DIVIDER.amber)}>
        <p className={GROUP_HEADER.amber}>종합한도 보정·재해손실 (B그룹)</p>
        <div className="flex flex-wrap gap-1.5">
          {(["legatee", "priorGiftDeduction", "disasterAdjust", "casualtyLoss", "appraisalFee"] as ManualChecklistKey[]).map(
            (k) => (
              <ManualChip key={k} chipKey={k} form={form} set={set} onToggle={onManualChipToggle} />
            ),
          )}
        </div>
      </div>

      {/* 그룹 C — 세액공제 (violet) */}
      <div className={cn("space-y-1.5", GROUP_DIVIDER.violet)}>
        <p className={GROUP_HEADER.violet}>세액공제 (C그룹)</p>
        <div className="flex flex-wrap gap-1.5">
          {(["foreignTax", "shortTermReinherit"] as ManualChecklistKey[]).map((k) => (
            <ManualChip key={k} chipKey={k} form={form} set={set} onToggle={onManualChipToggle} />
          ))}
        </div>
      </div>

      {/* 신고 상태·납부 방법 안내 */}
      <p className="text-micro text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-2">
        ※ 신고 상태(§69 신고세액공제)는 C그룹, 납부 방법(연부연납·분납·물납)은 D그룹에 있습니다. 그룹 헤더를 클릭하거나 위 칩을 클릭하면 열립니다.
      </p>
    </div>
  );
}
