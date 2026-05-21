"use client";

/**
 * 상속인별 자격 평가 카드 (부록 A UI, 2026-05-22)
 *
 * 법령 근거: 시행령 §16③ (상속인 단위) + §16⑭ (피상속인 또는 상속인)
 * 엔진: evaluateFarmingEligibilityForHeir / deriveQualifiedHeirIds
 *
 * 정책:
 *   - mirror-pattern 위반 0건 — useEffect 미사용, 직접 onChange
 *   - single-source-engine-helper — 엔진 헬퍼 import 직접 사용
 */

import { useMemo } from "react";

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { evaluateFarmingEligibilityForHeir } from "@/lib/tax-engine/deductions/inheritance-deductions";
import type {
  FarmingHeirAssessment,
  FarmingInheritanceInput,
} from "@/lib/tax-engine/types/inheritance-farming.types";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface HeirAssessmentCardProps {
  farming: FarmingInheritanceInput;
  heir: Heir;
  assessment: FarmingHeirAssessment;
  onUpdate: (next: FarmingHeirAssessment) => void;
}

export function HeirAssessmentCard({
  farming,
  heir,
  assessment,
  onUpdate,
}: HeirAssessmentCardProps) {
  const evalResult = useMemo(
    () => evaluateFarmingEligibilityForHeir(farming, assessment),
    [farming, assessment],
  );

  const update = (patch: Partial<FarmingHeirAssessment>) => {
    onUpdate({ ...assessment, ...patch });
  };

  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        evalResult.eligible
          ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800"
          : "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">
          {heir.name || `${heir.relation} ${heir.id}`}{" "}
          <span className="text-[10px] text-gray-500">({heir.relation})</span>
        </p>
        <span
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            evalResult.eligible
              ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100"
              : "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100"
          }`}
        >
          {evalResult.eligible ? "✓ 자격 충족" : "⚠️ 미충족"}
        </span>
      </div>

      <ToggleCard
        tone="violet"
        size="sm"
        title="후계자 트랙 (재정경제부령)"
        description="체크 시 18세·2년·거주 면제"
        checked={assessment.isDesignatedSuccessor ?? false}
        onCheckedChange={(v) =>
          update({ isDesignatedSuccessor: v ? true : undefined })
        }
      />

      <ToggleCard
        tone="violet"
        size="sm"
        title="18세 이상"
        checked={assessment.heirIsAdult}
        onCheckedChange={(v) => update({ heirIsAdult: v })}
        disabled={assessment.isDesignatedSuccessor === true}
        disabledReason="후계자 트랙 — 18세 요건 면제"
      />

      <ToggleCard
        tone="violet"
        size="sm"
        title={
          farming.type === "personal"
            ? "2년 직접 영농 종사"
            : "2년 법인 종사"
        }
        description="피상속인 65세 미만 사망 시 면제 (farming-수준 decedentEarlyDeath)"
        checked={assessment.heirTwoYearFarming}
        onCheckedChange={(v) => update({ heirTwoYearFarming: v })}
        disabled={assessment.isDesignatedSuccessor === true}
        disabledReason="후계자 트랙 — 2년 종사 요건 면제"
      />

      {farming.type === "personal" && (
        <ToggleCard
          tone="violet"
          size="sm"
          title="거주지 충족 (§16③1호나)"
          checked={assessment.heirResidenceMet}
          onCheckedChange={(v) => update({ heirResidenceMet: v })}
          disabled={assessment.isDesignatedSuccessor === true}
          disabledReason="후계자 트랙 — 거주 요건 면제"
        />
      )}

      {farming.type === "corporate" && (
        <ToggleCard
          tone="violet"
          size="sm"
          title="신고기한 임원 + 2년 내 대표이사 (§16③2호나)"
          checked={assessment.heirCorporateOfficer ?? false}
          onCheckedChange={(v) =>
            update({ heirCorporateOfficer: v ? true : undefined })
          }
        />
      )}

      <ToggleCard
        tone="rose"
        size="sm"
        title="§16⑭ 결격소득 — 본인"
        description="사업소득+총급여 3,700만 이상 과세기간 존재"
        checked={assessment.hasDisqualifyingIncome ?? false}
        onCheckedChange={(v) =>
          update({ hasDisqualifyingIncome: v ? true : undefined })
        }
      />

      {!evalResult.eligible && evalResult.reasons.length > 0 && (
        <ul className="text-[10px] text-amber-800 dark:text-amber-200 list-disc pl-4">
          {evalResult.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
