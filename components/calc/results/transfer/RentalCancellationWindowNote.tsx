/**
 * §155㉓ 「최초 말소일부터 5년 이내」 기한 표시 (I-4) — 계산기 결과 카드·판정 메뉴 결과 카드 공용.
 *
 * 엔진 echo(`EligibilityResult.cancellationWindow`)를 그대로 옮긴다 — 여기서 다시 계산하지 않는다.
 */
import type { CancellationWindow } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

export function RentalCancellationWindowNote({ window: w }: { window: CancellationWindow | undefined }) {
  if (!w) return null;
  return (
    <div data-testid="rental-cancellation-window" className="space-y-0.5 text-xs">
      <p>
        등록 말소 특례(소득세법 시행령 §155㉓) — 최초 말소일 <b>{w.firstCancellationDate}</b>(
        {w.firstUnitIndex + 1}호)부터 5년 이내, <b>{w.deadline}</b>까지 양도해야 합니다
        {w.withinDeadline ? " — 기한 안에 양도했습니다." : " — 기한이 지났습니다."}
      </p>
      {w.deadlineNote && <p className="text-muted-foreground">{w.deadlineNote}</p>}
    </div>
  );
}
