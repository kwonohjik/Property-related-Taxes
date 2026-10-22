"use client";

/**
 * D3a 1세대1주택 비과세 요약 — 1주택 판정 메뉴·이력과 **같은 결론 술어**(`oneHouseVerdictOf`)를 쓴다(계획서 §5.5 · P7).
 * 비과세 판정의 주택 수와 중과 판정의 주택 수는 세는 기준이 다르다 — 이 카드는 비과세 축만 말한다.
 */
import Link from "next/link";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";
import { resolveHighValueHouseThreshold } from "@/lib/tax-engine/one-house/threshold";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

export function ExemptionSummaryCard({
  exemption,
  transferDate,
  sectionNum,
}: {
  exemption: OneHouseExemptionResponse;
  transferDate: string;
  sectionNum: string;
}) {
  const transferAt = toOptionalDate(transferDate);
  // 입주권 양도면 §89①4호 기준금액을 엔진이 실어 준다(1주택 결과뷰와 같은 우선순위)
  const threshold = exemption.oneRightExemption
    ? exemption.oneRightExemption.highValueThreshold
    : transferAt
      ? resolveHighValueHouseThreshold(transferAt)
      : undefined;
  const verdict = oneHouseVerdictOf(exemption.judgment, threshold, exemption.contestedIssues, exemption.rentalHousingException);
  return (
    <div data-testid="surcharge-exemption-summary">
      <ToneCard tone={verdict.tone} sectionNum={sectionNum} title="1세대1주택 비과세 (요약)">
        <p className="text-sm">
          <b data-testid="surcharge-exemption-verdict">{verdict.label}</b> — {verdict.detail}
        </p>
        <p className="text-sm text-muted-foreground">비과세 판정의 주택 수와 중과 판정의 주택 수는 세는 기준이 다릅니다.</p>
        <Link
          href="/calc/one-house-exemption"
          data-testid="surcharge-exemption-link"
          className="text-sm font-medium text-primary hover:underline print:hidden"
        >
          비과세 판정에서 자세히 보기 →
        </Link>
      </ToneCard>
    </div>
  );
}
