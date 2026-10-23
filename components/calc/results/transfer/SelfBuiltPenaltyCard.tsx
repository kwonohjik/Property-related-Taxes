"use client";

/**
 * 일체 주택 본인 신축 — 소득세법 §114조의2 가산세(건물분) 근거 카드.
 *
 * 값·문구는 전부 엔진 echo(`selfBuiltHousingPenalty`)를 `selfBuiltPenaltyView`가 풀어 쓴 것이다 — 여기서 새로 계산하지 않는다.
 * echo 는 이 축이 가산세 base 를 정했을 때만 실린다 — 없으면 아무것도 그리지 않는다(적용 안 된 경우는 새로 침묵을 깨지 않는다).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";
import { selfBuiltPenaltyView } from "@/lib/tax-engine/transfer-tax-self-built-display";
import type { SelfBuiltHousingPenaltyEcho } from "@/lib/tax-engine/types/transfer-self-built-housing.types";

export function SelfBuiltPenaltyCard({ echo }: { echo: SelfBuiltHousingPenaltyEcho | undefined }) {
  const view = selfBuiltPenaltyView(echo);
  if (!view) return null;
  return (
    <ToneCard tone="amber" title={view.title}>
      <div className="space-y-1.5" data-testid="self-built-penalty-card">
        <p className="text-xs" data-testid="self-built-window">{view.windowLine}</p>
        {view.formulaLines.map((line, i) => (
          <p key={i} className="text-xs tabular-nums" data-testid={i === view.formulaLines.length - 1 ? "self-built-penalty-line" : undefined}>
            <FormulaText value={line} />
          </p>
        ))}
        <p className="text-caption text-muted-foreground" data-testid="self-built-notice">
          {view.notice}
        </p>
      </div>
    </ToneCard>
  );
}
