"use client";

/**
 * 합산배제 추징 결과 — 요약 · 연도별 산출근거 · 배제(추징하지 않음 — 전부 또는 일부 연도) · 확인 필요 · 면책.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6.4
 *
 * 표시 문구는 엔진 결과(`exemption`·`notices`·`failReasons`)를 그대로 옮긴다. 유리·불리 평가어를 쓰지 않는다.
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { COMPREHENSIVE_EXCL } from "@/lib/tax-engine/legal-codes";
import type { RecaptureResult } from "@/lib/tax-engine/types/comprehensive-recapture.types";
import { AnnualInterestTable } from "./AnnualInterestTable";
import { dotDate } from "./shared";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";

export function RecaptureResultView({
  result,
  noticeDate,
  facts,
}: {
  result: RecaptureResult;
  /** 고지일(YYYY-MM-DD) — 요약에 함께 적는다 */
  noticeDate: string;
  /** 입력 사실 요약(사유 「해당 없음」이면 빈 배열) */
  facts: string[];
}) {
  return (
    <section className="space-y-3" data-testid="rc-result">
      {!result.calculated && (
        <ToneCard tone="rose" title="계산하지 않았습니다">
          <ul className="space-y-1 text-xs">
            {result.failReasons.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </ToneCard>
      )}

      {result.calculated && result.exempt && <ExemptCard result={result} facts={facts} />}

      {result.calculated && !result.exempt && (
        <>
          <ToneCard tone="sky" title="추징세액과 이자상당가산액" bodyClassName="space-y-2">
            <dl className="divide-y text-sm" data-testid="rc-summary">
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt>추징세액 (경감받은 세액 합계)</dt>
                <dd className={NUM} data-testid="rc-total-tax">{formatKRW(result.totalRecoveryTax)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt>이자상당가산액 (시행령 §10②)</dt>
                <dd className={NUM} data-testid="rc-interest">{formatKRW(result.interestAmount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5 font-semibold">
                <dt>합계</dt>
                <dd className={`${NUM} text-base`} data-testid="rc-total-payable">{formatKRW(result.totalPayable)}</dd>
              </div>
            </dl>
            <p className="text-caption text-muted-foreground">
              추징 고지일 {dotDate(noticeDate)} · 대상 과세연도 {result.recoveryPeriodYears}개 · 이자는 연도마다 납부기한 다음 날부터 고지일까지 양끝을 포함한 일수에 1일당 이자율을 곱해 구합니다.
            </p>
          </ToneCard>

          {result.exemptTaxYears.length > 0 && <PartialExemptCard result={result} facts={facts} />}

          {result.exemption.failReasons.length > 0 && (
            <ToneCard tone="slate" title="입력한 사유는 추징하지 않는 경우에 해당하지 않았습니다" bodyClassName="space-y-1">
              <ul className="space-y-1 text-xs" data-testid="rc-not-exempt">
                {result.exemption.failReasons.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </ToneCard>
          )}

          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">연도별 산출근거</h3>
            <AnnualInterestTable rows={result.annualInterest} />
          </div>
        </>
      )}

      {result.notices.length > 0 && (
        <ToneCard tone="amber" title="확인 필요" bodyClassName="space-y-1">
          <ul className="space-y-1 text-xs" data-testid="rc-notices">
            {result.notices.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </ToneCard>
      )}

      <DisclaimerBanner />
    </section>
  );
}

/** 일부 연도만 추징하지 않음(10·11호 — 부칙<제35352호> §2②) — 추징한 연도는 위 요약과 아래 표에 있다 */
function PartialExemptCard({ result, facts }: { result: RecaptureResult; facts: string[] }) {
  return (
    <ToneCard tone="emerald" title="일부 연도는 추징하지 않음" bodyClassName="space-y-2">
      <div data-testid="rc-partial-exempt" className="space-y-2 text-xs">
        <p>
          <span className="font-medium">추징하지 않는 연도: </span>
          <span data-testid="rc-exempt-years">{result.exemptTaxYears.map((y) => `${y}년분`).join(" · ")}</span>
        </p>
        <p>
          <span className="font-medium">근거: </span>
          {result.exemption.legalBasis}
        </p>
        <p>{COMPREHENSIVE_EXCL.RECAPTURE_EXEMPT_6Y_PARTIAL}</p>
        {facts.length > 0 && (
          <div>
            <p className="font-medium">입력한 사실</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4" data-testid="rc-facts">
              {facts.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToneCard>
  );
}

function ExemptCard({ result, facts }: { result: RecaptureResult; facts: string[] }) {
  const { exemption } = result;
  return (
    <ToneCard tone="emerald" title="추징하지 않음" bodyClassName="space-y-2">
      <div data-testid="rc-exempt" className="space-y-2">
        <dl className="divide-y text-sm">
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt>추징세액</dt>
            <dd className={NUM} data-testid="rc-total-tax">{formatKRW(result.totalRecoveryTax)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt>이자상당가산액</dt>
            <dd className={NUM} data-testid="rc-interest">{formatKRW(result.interestAmount)}</dd>
          </div>
        </dl>
        <p className="text-xs">
          <span className="font-medium">근거: </span>
          {exemption.legalBasis}
          {exemption.clause?.match(/(가목|나목)$/)?.[1] ? ` ${exemption.clause.match(/(가목|나목)$/)?.[1]}` : ""}
        </p>
        {facts.length > 0 && (
          <div>
            <p className="text-xs font-medium">입력한 사실</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs" data-testid="rc-facts">
              {facts.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToneCard>
  );
}
