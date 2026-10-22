"use client";

/**
 * 이월과세 × 증여자 신축·증축 — 소득세법 §114조의2 가산세 근거 카드.
 *
 * 값·문구는 전부 엔진 echo(`donorBuiltPenalty`)를 `donorBuiltPenaltyView`가 풀어 쓴 것이다 — 여기서 새로 계산하지 않는다.
 *  · A 채택·가산세 적용: 5년 기산·건물분 산식(일체 주택은 건물분 안분 포함)·「적용했다 + 정면 해석례 미확보 — 확인 필요」
 *  · 그 밖(②3호 B 채택·적용배제·5년 경과 등): 가산세가 붙지 않은 이유를 중립 안내로 적는다(침묵 금지)
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";
import { donorBuiltPenaltyView } from "@/lib/tax-engine/transfer-tax-carryover-donor-display";
import type { DonorBuiltPenaltyEcho } from "@/lib/tax-engine/types/transfer-carryover.types";

export function CarryoverDonorBuiltPenaltyCard({ echo }: { echo: DonorBuiltPenaltyEcho | undefined }) {
  const view = donorBuiltPenaltyView(echo);
  if (!view) return null;
  return (
    <ToneCard tone={view.applied ? "amber" : "sky"} title={view.title}>
      <div className="space-y-1.5" data-testid="donor-built-penalty-card" data-applied={view.applied ? "true" : "false"}>
        {view.windowLine && <p className="text-xs" data-testid="donor-built-window">{view.windowLine}</p>}
        {view.formulaLines.map((line, i) => (
          <p key={i} className="text-xs tabular-nums" data-testid={i === view.formulaLines.length - 1 ? "donor-built-penalty-line" : undefined}>
            <FormulaText value={line} />
          </p>
        ))}
        <p className="text-caption text-muted-foreground" data-testid="donor-built-notice">
          {view.notice}
        </p>
      </div>
    </ToneCard>
  );
}
