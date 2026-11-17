"use client";

/**
 * 합산배제 추징 계산기 (종합부동산세법 §17⑤1호 · 시행령 §10) — 화면 오케스트레이터
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §6
 * - 본 계산 마법사와 시간축이 달라 별도 페이지다. 상태는 로컬 `useState`(persist 없음) · 이력 저장 없음(§6.3).
 * - 입력 순서 = 엔진 순서: 사유(§10③) → 연도별 경감세액(§10①) → 고지일(§10②1호).
 * - ⑧ 검증(`validateRecapture`)을 통과해야 ⑬ API를 부른다. 입력을 고치면 이전 결과를 지운다(핸들러에서 — 효과 아님).
 */
import { useState } from "react";
import Link from "next/link";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { callComprehensiveRecaptureApi, toRecaptureBody } from "@/lib/calc/comprehensive-recapture-api";
import { validateRecapture, type RecaptureIssue } from "@/lib/calc/comprehensive-recapture-validate";
import type { RecaptureResult } from "@/lib/tax-engine/types/comprehensive-recapture.types";
import { AnnualTaxTable } from "./AnnualTaxTable";
import { ReasonSection } from "./ReasonSection";
import { RecaptureResultView } from "./RecaptureResultView";
import { INITIAL_RECAPTURE_FORM, summarizeFacts, type RecaptureFormState } from "./shared";

interface Outcome {
  result: RecaptureResult;
  noticeDate: string;
  facts: string[];
}

export function ComprehensiveRecaptureCalculator() {
  const [form, setForm] = useState<RecaptureFormState>(INITIAL_RECAPTURE_FORM);
  const [issues, setIssues] = useState<RecaptureIssue[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  /** 입력이 바뀌면 이전 결과·오류를 지운다 — 화면의 값과 결과가 어긋나지 않게 */
  const replace = (next: RecaptureFormState) => {
    setForm(next);
    setOutcome(null);
    setIssues([]);
    setApiError(null);
  };
  const patch = (p: Partial<RecaptureFormState>) => replace({ ...form, ...p });

  const handleCalculate = async () => {
    const found = validateRecapture(form);
    setIssues(found);
    setApiError(null);
    if (found.length > 0) {
      setOutcome(null);
      return;
    }
    setLoading(true);
    try {
      const result = await callComprehensiveRecaptureApi(toRecaptureBody(form));
      setOutcome({ result, noticeDate: form.noticeDate, facts: summarizeFacts(form) });
    } catch (e) {
      setOutcome(null);
      setApiError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <HomeButton />
        <Link
          href="/calc/comprehensive-tax"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          종합부동산세 계산기로
        </Link>
      </div>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">합산배제 추징 계산기</h1>
        <p className="text-sm text-muted-foreground">
          합산배제 임대주택등이 추후 요건을 충족하지 않게 된 경우의 추징세액과 이자상당가산액(종합부동산세법 §17⑤1호 · 시행령 §10)을 계산합니다.
        </p>
      </header>

      <ToneCard tone="slate" title="이 계산기가 다루는 범위" bodyClassName="space-y-1">
        <ul className="list-disc space-y-0.5 pl-4 text-xs">
          <li>합산배제 임대주택등의 추징(§17⑤1호)만 다룹니다. 1세대 1주택자 의제 추징(§17⑤2호)은 다루지 않습니다.</li>
          <li>연도별 경감받은 세액은 직접 입력합니다 — 합산 전후 세액의 차이는 계산하지 않습니다.</li>
          <li>결과는 저장하지 않고, 입력은 이 화면에만 남습니다.</li>
        </ul>
      </ToneCard>

      <ReasonSection form={form} onPatch={patch} onReplace={replace} />

      <AnnualTaxTable rows={form.rows} onChange={(rows) => patch({ rows })} />

      <ToneCard tone="amber" sectionNum={3} title="추징세액 고지일 (시행령 §10②1호)">
        <FieldCard
          label="고지일"
          required
          hint="이자상당가산액은 연도마다 납부기한 다음 날부터 이 날까지(양끝 포함) 셉니다. 2009.2.4. 이후 고지분만 계산합니다."
        >
          <DateInput value={form.noticeDate} onChange={(v) => patch({ noticeDate: v })} data-testid="rc-notice-date" />
        </FieldCard>
      </ToneCard>

      {issues.length > 0 && (
        <ToneCard tone="rose" title="입력을 확인하세요">
          <ul className="list-disc space-y-0.5 pl-4 text-xs" data-testid="rc-errors">
            {issues.map((i, idx) => (
              <li key={idx} data-field={i.field}>
                {i.message}
              </li>
            ))}
          </ul>
        </ToneCard>
      )}
      {apiError && (
        <ToneCard tone="rose" title="계산하지 못했습니다">
          <p className="text-xs" data-testid="rc-api-error">{apiError}</p>
        </ToneCard>
      )}

      <Button type="button" className="w-full" disabled={loading} onClick={handleCalculate} data-testid="rc-calc">
        {loading ? "계산 중…" : "추징세액 계산"}
      </Button>

      {outcome && <RecaptureResultView result={outcome.result} noticeDate={outcome.noticeDate} facts={outcome.facts} />}
    </div>
  );
}
