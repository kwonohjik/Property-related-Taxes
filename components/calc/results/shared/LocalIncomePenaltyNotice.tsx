import {
  LOCAL_INCOME_PENALTY_NOTICE_DETAIL,
  LOCAL_INCOME_PENALTY_NOTICE_LEAD,
} from "@/lib/calc/local-income-penalty-notice";

/**
 * 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 미포함 고지 — 짧은 안내 줄 (US-29).
 * 노출 판정은 호출부가 `shouldShowLocalIncomePenaltyNotice`로 한다. 세액은 바꾸지 않는다.
 */
export function LocalIncomePenaltyNotice({ className }: { className?: string }) {
  return (
    <div
      data-testid="local-income-penalty-notice"
      className={"space-y-0.5 text-left text-caption text-muted-foreground" + (className ? ` ${className}` : "")}
    >
      <p>{LOCAL_INCOME_PENALTY_NOTICE_LEAD}</p>
      <p>{LOCAL_INCOME_PENALTY_NOTICE_DETAIL}</p>
    </div>
  );
}
