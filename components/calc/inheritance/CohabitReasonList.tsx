"use client";

/**
 * CohabitReasonList — §23의2② 부득이한 사유 배열 입력 위젯 (Phase 4)
 *
 * CohabitRequirementBlock 내부에서 사용.
 * - 3-state Optional 패턴: undefined(미사용) / [](활성 빈) / [...](데이터)
 * - 각 행: 유형 Select(6종) + 시작일 DateInput + 종료일 DateInput + 삭제(rose)
 * - 행별 효과 배지: 제외(−) rose / 산입(+) emerald / 불인정 amber
 * - overseas_grad 선택 시 경고, medical 선택 시 1년 이상 hint
 * - reconstruction_lease 선택 시 산입 안내
 *
 * 800줄 정책: CohabitRequirementBlock에서 분리.
 */

import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CohabitReason, CohabitReasonType } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 상수
// ============================================================

export const COHABIT_REASON_LABEL: Record<CohabitReasonType, string> = {
  conscription: "징집·소집 (병역법 §20①1호)",
  schooling: "취학 — 고교·국내대학 (시행규칙 §9의2①1호)",
  work: "근무상 형편 (시행규칙 §9의2①2호)",
  medical: "질병 요양 1년 이상 (시행규칙 §9의2①3호)",
  reconstruction_lease: "재건축 전세 — 동거기간 산입 (재산-248)",
  overseas_grad: "국외 대학원 — 불인정 (재조세-434)",
};

/** 행별 법적 효과 */
const REASON_EFFECT: Record<CohabitReasonType, "excluded" | "included" | "not_recognized"> = {
  conscription: "excluded",
  schooling: "excluded",
  work: "excluded",
  medical: "excluded",
  reconstruction_lease: "included",
  overseas_grad: "not_recognized",
};

/** 효과별 배지 스타일 (정적 매핑 — dynamic class JIT purge 방지) */
const EFFECT_BADGE: Record<"excluded" | "included" | "not_recognized", { label: string; cls: string }> = {
  excluded: {
    label: "제외(−)",
    cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700",
  },
  included: {
    label: "산입(+)",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
  },
  not_recognized: {
    label: "불인정",
    cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  },
};

const REASON_TYPES: CohabitReasonType[] = [
  "conscription",
  "schooling",
  "work",
  "medical",
  "reconstruction_lease",
  "overseas_grad",
];

// ============================================================
// Props
// ============================================================

interface CohabitReasonListProps {
  /**
   * 3-state: undefined=미사용(위젯 숨김) / []=활성 빈 / [...]=데이터
   * 부모(CohabitRequirementBlock)가 토글을 제어하고
   * 이 컴포넌트는 항상 배열([] 또는 [...])을 받음.
   */
  reasons: CohabitReason[];
  onChange: (reasons: CohabitReason[]) => void;
}

// ============================================================
// 개별 행 컴포넌트
// ============================================================

interface ReasonRowProps {
  reason: CohabitReason;
  index: number;
  onUpdate: (patch: Partial<CohabitReason>) => void;
  onRemove: () => void;
}

function ReasonRow({ reason, index, onUpdate, onRemove }: ReasonRowProps) {
  const effect = REASON_EFFECT[reason.type];
  const badge = EFFECT_BADGE[effect];

  return (
    <div
      className="rounded-md border border-violet-100 dark:border-violet-800 bg-white dark:bg-violet-950/30 p-2.5 space-y-2"
      data-testid={`cohabit-reason-row-${index}`}
    >
      {/* 행 헤더: 번호 + 효과 배지 + 삭제 */}
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-800 text-micro font-bold text-violet-700 dark:text-violet-300 select-none">
          {index + 1}
        </span>
        <span
          className={`text-micro font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}
          data-testid={`cohabit-reason-effect-badge-${index}`}
        >
          {badge.label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-micro text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-200 font-medium"
          data-testid={`cohabit-reason-remove-${index}`}
          aria-label={`${index + 1}번 사유 삭제`}
        >
          삭제
        </button>
      </div>

      {/* 유형 Select */}
      <div className="space-y-0.5">
        <label className="block text-micro font-medium text-gray-500 dark:text-gray-400">
          사유 유형
        </label>
        <Select
          value={reason.type}
          onValueChange={(v) => onUpdate({ type: v as CohabitReasonType })}
        >
          <SelectTrigger
            className="h-8 text-xs"
            data-testid={`cohabit-reason-type-select-${index}`}
          >
            <SelectValue placeholder="유형 선택" />
          </SelectTrigger>
          <SelectContent>
            {REASON_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {COHABIT_REASON_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 시작일·종료일 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <label className="block text-micro font-medium text-gray-500 dark:text-gray-400">
            사유 시작일
          </label>
          <DateInput
            value={reason.startDate}
            onChange={(v) => onUpdate({ startDate: v })}
            data-testid={`cohabit-reason-start-${index}`}
          />
        </div>
        <div className="space-y-0.5">
          <label className="block text-micro font-medium text-gray-500 dark:text-gray-400">
            사유 종료일
          </label>
          <DateInput
            value={reason.endDate}
            onChange={(v) => onUpdate({ endDate: v })}
            data-testid={`cohabit-reason-end-${index}`}
          />
        </div>
      </div>

      {/* 유형별 안내/경고 */}
      {reason.type === "overseas_grad" && (
        <div
          className="rounded border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-2 py-1.5 text-micro text-amber-700 dark:text-amber-300"
          data-testid={`cohabit-reason-overseas-warning-${index}`}
        >
          국외 대학원은 부득이한 사유에 해당하지 않습니다(재조세-434). 이 기간은 동거 계속성이
          단절될 수 있어 전체 공제 요건에 영향을 줄 수 있습니다. 세무사와 확인하십시오.
        </div>
      )}
      {reason.type === "medical" && (
        <div className="rounded border border-violet-100 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20 px-2 py-1 text-micro text-violet-600 dark:text-violet-400">
          질병 요양은 1년(365일) 이상인 경우에만 인정됩니다(시행규칙 §9의2①3호).
        </div>
      )}
      {reason.type === "reconstruction_lease" && (
        <div className="rounded border border-emerald-200 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-900/20 px-2 py-1 text-micro text-emerald-700 dark:text-emerald-300">
          재건축 기간 전세 거주는 동거기간에 산입합니다(국세청 재산-248). 단, 해석례이므로
          세무사 확인을 권장합니다.
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function CohabitReasonList({ reasons, onChange }: CohabitReasonListProps) {
  function addReason() {
    onChange([
      ...reasons,
      { type: "conscription", startDate: "", endDate: "" } as CohabitReason,
    ]);
  }

  function updateReason(index: number, patch: Partial<CohabitReason>) {
    const next = reasons.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeReason(index: number) {
    onChange(reasons.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2" data-testid="cohabit-reason-list">
      {reasons.length === 0 && (
        <p className="text-micro text-violet-500 dark:text-violet-400 italic">
          사유 행이 없습니다. 아래 &ldquo;사유 추가&rdquo; 버튼으로 입력하세요.
        </p>
      )}

      {reasons.map((reason, index) => (
        <ReasonRow
          key={index}
          reason={reason}
          index={index}
          onUpdate={(patch) => updateReason(index, patch)}
          onRemove={() => removeReason(index)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addReason}
        className="w-full text-xs border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/30"
        data-testid="cohabit-reason-add-button"
      >
        + 사유 추가
      </Button>
    </div>
  );
}
