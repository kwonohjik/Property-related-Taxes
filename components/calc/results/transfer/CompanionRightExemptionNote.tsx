"use client";

/**
 * 함께 양도(일괄) 결과 — 컴패니언 조합원입주권 카드의 §89①4호 비과세·고가 안분 표시.
 *
 * 단건 결과는 `RedevelopmentDetailCard`가 이 판정을 설명하지만 일괄 자산 카드(`PropertyCard`)는 그 카드를 쓰지 않아
 * 비과세면 «비과세 해당 없음» 한 줄, 12억 초과 안분이면 과세분 양도차익만 보여 **왜 줄었는지** 알 길이 없었다
 * (`docs/00-pm/companion-right-4ho-open.plan.md` §9 V-5). 표시 전용 — 세액은 엔진 값 그대로다.
 *
 * 12억 비교는 안분한 입주권 몫의 양도가액(`transferPrice`)이다 — 일괄양도에서의 비교 기준은 정면 해석례를 확인하지 못했다(계획서 Q-2).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { formatHighValueThresholdLabel } from "@/lib/tax-engine/one-house/threshold";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

type Detail = Pick<RedevelopmentResult, "oneRightExemptionApplied" | "oneRightHighValueApplied" | "oneRightExemptionClause" | "highValueAllocation">;

const CLAUSE_LABEL = { ga: "가목", na: "나목" } as const;
const CLAUSE_BASIS = {
  ga: "양도일 현재 다른 주택·분양권이 없는 1세대",
  na: "양도일 현재 다른 주택 1채를 보유하고 그 취득일부터 기한 안에 양도하는 1세대",
} as const;

export function CompanionRightExemptionNote({ detail, transferPrice }: { detail: Detail | undefined; transferPrice: number }) {
  const clause = detail?.oneRightExemptionClause;
  if (!detail || !clause) return null;
  const label = CLAUSE_LABEL[clause];
  const alloc = detail.oneRightHighValueApplied ? detail.highValueAllocation : undefined;
  if (alloc) {
    const threshold = formatHighValueThresholdLabel(alloc.nontaxableThreshold);
    return (
      <ToneCard tone="amber" title={`§89①4호 ${label} — ${threshold} 초과 안분`} bodyClassName="space-y-1">
        <div data-testid="companion-right-high-value-note" className="space-y-1 text-caption leading-relaxed text-amber-900 dark:text-amber-200">
          <p>
            이 입주권 몫의 양도가액: {formatKRW(transferPrice)} — {threshold}을 넘어 넘는 비율({(alloc.taxableRatio * 100).toFixed(2)}%)만 과세합니다.
            비과세 양도차익 {formatKRW(alloc.nontaxableGain)} · 과세 양도차익 {formatKRW(alloc.taxableGain)}.
          </p>
          <p className="text-micro">{threshold} 비교는 함께 양도 가액을 안분한 이 입주권 몫의 양도가액으로 했습니다(확인 필요).</p>
        </div>
      </ToneCard>
    );
  }
  if (!detail.oneRightExemptionApplied) return null;
  return (
    <ToneCard tone="violet" title={`§89①4호 ${label} — 1세대1입주권 비과세`} bodyClassName="space-y-1">
      <p data-testid="companion-right-exempt-note" className="text-caption leading-relaxed text-violet-900 dark:text-violet-200">
        세대가 보유한 유일한 조합원입주권이고 {CLAUSE_BASIS[clause]}라는 입력을 기준으로 이 입주권의 양도소득을 비과세했습니다.
      </p>
    </ToneCard>
  );
}
