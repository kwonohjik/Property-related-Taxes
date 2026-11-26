"use client";

/**
 * ④ 결과 카드 — 판정 배지·사유 · 1호 vs 2호 · 납세의무자 · 최종부담세액 · 적용기간 · 확인 필요
 *
 * 계획서 §5.3 ④. 화면은 엔진 결과(`GiftResaleResponse`)의 코드를 문구로 옮길 뿐 판정하지 않는다.
 * out_of_scope는 금액 비교 대신 사유만 낸다(엔진이 납세의무자·최종부담을 null로 준다).
 * 1호 열의 증여세는 입력한 두 칸의 차(산출세액 − 공제·감면세액)로 보여 준다 — 엔진의 clause1Tax와 같은 식이다.
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { JUDGMENT_DISCLAIMER, DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TONE, type Tone } from "@/components/calc/shared/tones";
import type { GiftResaleResponse } from "@/lib/calc/gift-resale-101-2-api";
import {
  GIFT_RESALE_APPLIED_EXTRA,
  GIFT_RESALE_ARTICLES,
  GIFT_RESALE_CONFIRMATION_TEXT,
  GIFT_RESALE_DONOR_REDUCTION_NOTE,
  formatGiftResaleDate,
  giftResaleReasonText,
} from "@/lib/calc/gift-resale-101-2-labels";
import { AMOUNT_CLASS } from "./shared";

/** 판정 시점에 입력했던 금액 4칸 — 입력을 고치면 결과를 지우므로 화면과 어긋나지 않는다 */
export interface GiftResaleAmounts {
  giftTaxCalculated: number;
  giftTaxCreditsAndReductions: number;
  doneeTransferDeterminedTax: number;
  donorTransferDeterminedTax: number;
}

const OUTCOME_VIEW: Record<GiftResaleResponse["outcome"], { tone: Tone; badge: string }> = {
  applied: { tone: "rose", badge: "부인 적용" },
  not_applied: { tone: "sky", badge: "미적용" },
  out_of_scope: { tone: "amber", badge: "판정하지 않음" },
};

function Row({ label, value, strong = false, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-xs ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className={AMOUNT_CLASS} data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function ClauseColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      <dl className="divide-y">{children}</dl>
    </div>
  );
}

export function GiftResaleResultCard({ result, amounts }: { result: GiftResaleResponse; amounts: GiftResaleAmounts }) {
  const view = OUTCOME_VIEW[result.outcome];
  const reason = giftResaleReasonText(result.reasonCode, { periodYears: result.periodYears, deadline: result.deadline });
  const inScope = result.outcome !== "out_of_scope";
  const giftTax = amounts.giftTaxCalculated - amounts.giftTaxCreditsAndReductions;

  return (
    <section className="space-y-3" data-testid="gr-result" data-outcome={result.outcome}>
      <ToneCard
        tone={view.tone}
        title="판정"
        titleExtra={
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${TONE[view.tone].badge}`}
            data-testid="gr-badge"
          >
            {view.badge}
          </span>
        }
      >
        <p className="text-sm" data-testid="gr-reason">
          {reason}
        </p>
        {result.outcome === "applied" && (
          <p className="text-xs text-muted-foreground" data-testid="gr-applied-extra">
            {GIFT_RESALE_APPLIED_EXTRA}
          </p>
        )}
      </ToneCard>

      {inScope && (
        <ToneCard tone="slate" title={`1호와 2호의 비교 (${GIFT_RESALE_ARTICLES.sec101_2})`} bodyClassName="space-y-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <ClauseColumn title="1호 — 수증자가 양도한 경우">
              <Row label="증여세 산출세액" value={formatKRW(amounts.giftTaxCalculated)} />
              <Row label="증여세 공제·감면세액 (차감)" value={formatKRW(amounts.giftTaxCreditsAndReductions)} />
              <Row label="수증자 양도소득세 결정세액" value={formatKRW(amounts.doneeTransferDeterminedTax)} />
              <Row label="1호 세액" value={formatKRW(result.clause1Tax)} strong testId="gr-clause1" />
              <p className="pt-1 text-caption text-muted-foreground">
                증여세(산출세액 − 공제·감면세액) {formatKRW(giftTax)} + 수증자 양도소득세 {formatKRW(amounts.doneeTransferDeterminedTax)} = 1호 세액
              </p>
            </ClauseColumn>
            <ClauseColumn title="2호 — 증여자가 직접 양도한 경우">
              <Row label="증여자 직접양도 양도소득세 결정세액" value={formatKRW(amounts.donorTransferDeterminedTax)} />
              <Row label="2호 세액" value={formatKRW(result.clause2Tax)} strong testId="gr-clause2" />
              <p className="pt-1 text-caption text-muted-foreground" data-testid="gr-clause2-reduction-note">
                {GIFT_RESALE_DONOR_REDUCTION_NOTE}
              </p>
            </ClauseColumn>
          </div>

          <dl className="divide-y text-xs" data-testid="gr-summary">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt>납세의무자</dt>
              <dd className="text-right font-medium" data-testid="gr-taxpayer">
                {result.taxpayer === "donor" ? "증여자 (수증자는 연대납세의무 — §2의2③)" : "수증자"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt>
                최종부담세액 (소득세·증여세 · 지방소득세 별도)
                {result.outcome === "applied" && ` — 증여세 미부과(${GIFT_RESALE_ARTICLES.sec101_3})`}
              </dt>
              <dd className={`${AMOUNT_CLASS} font-semibold`} data-testid="gr-final-burden">
                {result.finalBurden === null ? "-" : formatKRW(result.finalBurden)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt>적용기간</dt>
              <dd className="text-right" data-testid="gr-period">
                {result.periodYears}년 · {formatGiftResaleDate(result.deadline)}까지
              </dd>
            </div>
          </dl>
        </ToneCard>
      )}

      {inScope && result.needsConfirmation.length > 0 && (
        <ToneCard tone="amber" title="확인 필요">
          <ul className="list-disc space-y-1 pl-4 text-xs" data-testid="gr-confirmations">
            {result.needsConfirmation.map((c) => (
              <li key={c} data-confirmation={c}>
                {GIFT_RESALE_CONFIRMATION_TEXT[c]}
              </li>
            ))}
          </ul>
        </ToneCard>
      )}

      <DisclaimerBanner body={JUDGMENT_DISCLAIMER} />
    </section>
  );
}
