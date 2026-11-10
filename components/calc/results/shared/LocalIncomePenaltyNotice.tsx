import {
  LOCAL_INCOME_PENALTY_AMENDMENT_NOTICE,
  LOCAL_INCOME_PENALTY_INPUT_NOTICE,
  LOCAL_INCOME_PENALTY_NOTICE_DETAIL,
  LOCAL_INCOME_PENALTY_NOTICE_LEAD,
} from "@/lib/calc/local-income-penalty-notice";

/**
 * 양도소득분 지방소득세 가산세(지방세기본법 §53~§55) 「포함됨 + 가정·확인 필요」 고지 — 짧은 안내 줄 (US-29).
 * 노출 판정은 호출부가 `shouldShowLocalIncomePenaltyNotice`로 한다. 세액은 바꾸지 않는다.
 * `variant`: result(결과 hero·기본) / input(Step6 가산세 입력) / amendment(수정신고 카드).
 */
export function LocalIncomePenaltyNotice({
  className,
  variant = "result",
}: {
  className?: string;
  variant?: "result" | "input" | "amendment";
}) {
  return (
    <div
      data-testid="local-income-penalty-notice"
      className={"space-y-0.5 text-left text-caption text-muted-foreground" + (className ? ` ${className}` : "")}
    >
      {variant === "input" ? (
        <p>{LOCAL_INCOME_PENALTY_INPUT_NOTICE}</p>
      ) : variant === "amendment" ? (
        <>
          <p>{LOCAL_INCOME_PENALTY_AMENDMENT_NOTICE}</p>
          <p>{LOCAL_INCOME_PENALTY_NOTICE_DETAIL}</p>
        </>
      ) : (
        <>
          <p>{LOCAL_INCOME_PENALTY_NOTICE_LEAD}</p>
          <p>{LOCAL_INCOME_PENALTY_NOTICE_DETAIL}</p>
        </>
      )}
    </div>
  );
}
