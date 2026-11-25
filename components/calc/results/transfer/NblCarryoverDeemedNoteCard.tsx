import { ToneCard } from "@/components/calc/shared/ToneCard";

/**
 * 이월과세 토지 × 양도일 의제일 ≤ 증여 등기접수일 — 「확인 필요」 고지 (문구 단일 소스 `nblCarryoverDeemedBeforeGiftNote`).
 * 판정 메뉴 B 카드·단건/다건/일괄 계산기 비사업용 토지 판정 카드 아래에 같은 모양으로 붙는다. 판정값은 바꾸지 않는다.
 */
export function NblCarryoverDeemedNoteCard({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div data-testid="nbl-carryover-deemed-before-gift-note">
      <ToneCard tone="amber" title="확인 필요 — 이월과세 배제 시 소유기간">
        <p className="text-caption text-amber-800 dark:text-amber-200">{note}</p>
      </ToneCard>
    </div>
  );
}
