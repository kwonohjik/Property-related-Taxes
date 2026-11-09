import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  AMENDMENT_RURAL_SURTAX_NOTICE_DETAIL,
  AMENDMENT_RURAL_SURTAX_NOTICE_LEAD,
  AMENDMENT_RURAL_SURTAX_NOTICE_TITLE,
} from "@/lib/calc/amendment-rural-surtax-notice";

/**
 * 수정신고·경정청구 농어촌특별세 고지 (US-28 · Q-26). 노출 판정은 호출부가
 * `shouldShowAmendmentRuralSurtaxNotice`로 한다. 세액은 바꾸지 않는다.
 */
export function AmendmentRuralSurtaxNotice({ className }: { className?: string }) {
  return (
    <div data-testid="amendment-rural-surtax-notice" className={className}>
      <ToneCard tone="sky" title={AMENDMENT_RURAL_SURTAX_NOTICE_TITLE} bodyClassName="space-y-1">
        <p className="text-caption text-muted-foreground">{AMENDMENT_RURAL_SURTAX_NOTICE_LEAD}</p>
        <p className="text-caption text-muted-foreground">{AMENDMENT_RURAL_SURTAX_NOTICE_DETAIL}</p>
      </ToneCard>
    </div>
  );
}
