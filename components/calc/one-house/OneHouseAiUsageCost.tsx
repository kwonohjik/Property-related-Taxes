/**
 * AI 호출 1회 비용 줄 — 추출 미리보기·참고 의견 아래에 붙는다. 금액은 정가 기준 추정(`estimateUsageCostUsd`).
 */
import { estimateUsageCostUsd } from "@/lib/one-house-ai/usage-cost";
import type { ExtractionRun } from "@/lib/one-house-ai/extract";

export function OneHouseAiUsageCost({ model, usage }: { model: string; usage: ExtractionRun["usage"] }) {
  const cost = estimateUsageCostUsd(model, usage);
  const tokens = [
    `입력 ${usage.input.toLocaleString()}`,
    `캐시 읽기 ${usage.cacheRead.toLocaleString()}`,
    `캐시 쓰기 ${usage.cacheWrite.toLocaleString()}`,
    `출력 ${usage.output.toLocaleString()}`,
  ].join(" · ");
  return (
    <p className="text-caption text-muted-foreground" data-testid="one-house-ai-usage-cost">
      {cost === null ? (
        <>이번 호출 비용: 단가표에 없는 모델({model})이라 금액을 내지 않습니다</>
      ) : (
        <>
          이번 호출 비용 약 <b>${cost.toFixed(3)}</b> (정가 기준 추정)
        </>
      )}
      {" — "}토큰 {tokens} · {model}
    </p>
  );
}
