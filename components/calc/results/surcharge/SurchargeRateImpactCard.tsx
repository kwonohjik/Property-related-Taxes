"use client";

/**
 * D3b 세율 영향 — 응답 `rateImpact`를 두 축으로 옮긴다(계획서 §4.6 · §5.5 · P7). 세율 가산 축과 장기보유특별공제 배제 축은
 * 따로 움직인다 — 위기 취득(2009.3.16.~2012.12.31. 취득)은 세율만 기본세율이고 장특 배제는 남는다.
 */
import type { SurchargeRateImpact } from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-judgment-payload";
import { SURCHARGE_TYPE_LABEL } from "./surcharge-labels";

function rateLine(r: SurchargeRateImpact): string {
  if (r.isRateSurchargeApplied && r.addonRate !== null) return `기본세율 + ${(r.addonRate * 100).toFixed(0)}%p`;
  if (r.rateSurchargeStatutoryExcluded) return "기본세율 — 2009.3.16.~2012.12.31. 취득 주택이라 세율을 더하지 않습니다";
  if (r.suspension) return "기본세율 — 한시 유예";
  return "기본세율";
}

function suspensionLine(s: NonNullable<SurchargeRateImpact["suspension"]>): string {
  if (s.basis === "a") return "가목 — 2022.5.10.~2026.5.9. 양도 · 보유 2년 이상";
  const mok = s.basis === "na" ? "나목" : "다목";
  return `${mok} — ${s.deadline ? `${s.deadline}까지 양도` : "양도 기한 확인 필요"}`;
}

export function SurchargeRateImpactCard({ rateImpact }: { rateImpact: SurchargeRateImpact }) {
  return (
    <dl data-testid="surcharge-rate-impact" className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">중과 유형</dt>
      <dd data-testid="surcharge-rate-type">{SURCHARGE_TYPE_LABEL[rateImpact.surchargeType]}</dd>
      <dt className="text-muted-foreground">세율</dt>
      <dd data-testid="surcharge-rate-line">{rateLine(rateImpact)}</dd>
      <dt className="text-muted-foreground">장기보유특별공제</dt>
      <dd data-testid="surcharge-rate-lthd">
        {rateImpact.lthdExcluded ? "적용하지 않습니다(소득세법 §95② — 중과 대상 주택)" : "일반 요건대로 적용합니다"}
      </dd>
      {rateImpact.suspension && (
        <>
          <dt className="text-muted-foreground">한시 유예 근거</dt>
          <dd data-testid="surcharge-rate-suspension">{suspensionLine(rateImpact.suspension)}</dd>
        </>
      )}
    </dl>
  );
}
