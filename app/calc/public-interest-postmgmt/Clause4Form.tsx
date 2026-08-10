"use client";

/**
 * §48②4호 — 출연재산 **매각대금** 3년 사후관리 (증여세).
 *
 * ⭐ 3년 기산점은 「매각한 날」이 아니라 「매각한 날이 속하는 **과세기간·사업연도 종료일**」이다
 *    (상증령 §38④). 결산일을 따로 받는 이유다 — 매각일만으로 도출할 수 없다.
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestSaleProceeds } from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import type {
  PublicInterestSaleProceedsInput,
  PublicInterestSaleProceedsResult,
  SaleProceedsViolation,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const SALE_VIOLATION_OPTIONS: Array<{
  value: SaleProceedsViolation;
  label: string;
  description: string;
}> = [
  {
    value: "under_use_threshold",
    label: "사용기준금액(90%) 미달",
    description:
      "3년 이내 직접 공익목적사업 사용실적이 매각대금의 90%에 미달 — 미달사용금액이 과세가액 (상증령 §40①3호 나목)",
  },
  {
    value: "used_outside_purpose",
    label: "공익목적사업 외 사용",
    description:
      "매각대금을 직접 공익목적사업 외에 사용 — 사용기준금액 × (외부사용액 ÷ 매각대금) (상증령 §40①3호 가목)",
  },
];

export function Clause4Form() {
  const [saleProceeds, setSaleProceeds] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [fiscalYearEndDate, setFiscalYearEndDate] = useState("");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [violation, setViolation] = useState<SaleProceedsViolation>("under_use_threshold");
  const [directUseAmount, setDirectUseAmount] = useState("");
  const [outsideUseAmount, setOutsideUseAmount] = useState("");

  const [result, setResult] = useState<PublicInterestSaleProceedsResult | null>(null);

  const canCalculate = useMemo(() => {
    if (saleDate.length !== 10 || fiscalYearEndDate.length !== 10) return false;
    if (assessmentDate.length !== 10) return false;
    if (parseAmount(saleProceeds) <= 0) return false;
    // 0도 유효값이라 「비어있지 않음」으로 판정한다(빈칸 → silent 0 방지).
    const required = violation === "used_outside_purpose" ? outsideUseAmount : directUseAmount;
    return required.trim().length > 0;
  }, [
    saleDate,
    fiscalYearEndDate,
    assessmentDate,
    saleProceeds,
    violation,
    directUseAmount,
    outsideUseAmount,
  ]);

  const handleCalculate = () => {
    const input: PublicInterestSaleProceedsInput = {
      saleProceeds: parseAmount(saleProceeds),
      saleDate,
      fiscalYearEndDate,
      assessmentDate,
      violation,
      directUseAmount:
        violation === "under_use_threshold" ? parseAmount(directUseAmount) : undefined,
      outsideUseAmount:
        violation === "used_outside_purpose" ? parseAmount(outsideUseAmount) : undefined,
    };
    setResult(calcPublicInterestSaleProceeds(input));
  };

  return (
    <>
      <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
          3년 기산점은 매각일이 아니라 과세기간 종료일입니다
        </p>
        <p className="text-caption text-violet-700 dark:text-violet-300">
          법 §48②4호 본문은 「매각한 날부터 3년」이지만, 시행령 §38④가 「매각한 날이 속하는{" "}
          <b>과세기간 또는 사업연도의 종료일부터 3년 이내</b>」로 정합니다. 12월 결산 법인이 연초에
          매각하면 실질 기한이 약 4년이 됩니다.
        </p>
      </div>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">매각대금</span>
          <span className="block text-caption text-muted-foreground">
            매각에 따라 부담한 국세·지방세를 뺀 금액입니다(법 §48②1호 본문 괄호 · 상증령 §38).
            이사·사용인의 불법행위나 분실·도난으로 감소한 금액도 차감해 입력하세요(상증령 §38⑨).
          </span>
          <CurrencyInput label="" hideUnit value={saleProceeds} onChange={setSaleProceeds} data-testid="pi4-sale-proceeds" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">매각한 날</span>
          <DateInput value={saleDate} onChange={setSaleDate} data-testid="pi4-sale-date" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">매각한 날이 속하는 과세기간·사업연도 종료일</span>
          <span className="block text-caption text-muted-foreground">
            3년의 기산점입니다(상증령 §38④). 12월 결산이면 매각연도의 12월 31일, 학교법인 등 2월
            결산이면 다음 해 2월 말일입니다.
          </span>
          <DateInput value={fiscalYearEndDate} onChange={setFiscalYearEndDate} data-testid="pi4-fiscal-year-end" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">판정 기준일</span>
          <DateInput value={assessmentDate} onChange={setAssessmentDate} data-testid="pi4-assessment-date" />
        </label>

        <div className="space-y-1">
          <span className="text-sm font-medium">위반 유형 (상증령 §40①3호)</span>
          <RadioCardGroup
            name="pi4-violation"
            layout="stack"
            value={violation}
            onChange={(v) => setViolation(v as SaleProceedsViolation)}
            options={SALE_VIOLATION_OPTIONS}
          />
        </div>

        {violation === "under_use_threshold" ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">3년 이내 직접 공익목적사업 사용실적</span>
            <span className="block text-caption text-muted-foreground">
              매각대금으로 직접 공익목적사업용·수익용·수익사업용 재산을 취득한 금액을 포함합니다.
              일시 취득한 재산과, 공시대상기업집단 동일인관련자 관계인 경우 그 기업집단 소속 법인의
              의결권 있는 주식 취득분은 제외합니다(상증령 §38④).
            </span>
            <CurrencyInput label="" hideUnit value={directUseAmount} onChange={setDirectUseAmount} data-testid="pi4-direct-use" />
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium">공익목적사업 외에 사용한 금액</span>
            <span className="block text-caption text-muted-foreground">
              매각대금 중 직접 공익목적사업 외의 용도로 사용한 금액입니다. 매각대금을 넘을 수 없습니다.
            </span>
            <CurrencyInput label="" hideUnit value={outsideUseAmount} onChange={setOutsideUseAmount} data-testid="pi4-outside-use" />
          </label>
        )}

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi4-result">
          <div
            className={
              result.isClawback
                ? "rounded-lg border border-rose-300 bg-rose-50/60 p-4 space-y-1"
                : "rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 space-y-1"
            }
          >
            <p className="text-sm font-semibold">
              {result.isClawback
                ? "추징 대상입니다"
                : violation === "under_use_threshold"
                  ? "추징 대상 아님 (사용기준금액 90% 충족)"
                  : "추징 대상 아님 (공익목적사업 외 사용 없음)"}
            </p>
            <p className="text-caption text-muted-foreground">추징 증여세</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="pi4-gift-tax">
              {formatKRW(result.giftTax)}
            </p>
            {result.belowMinimumTaxBase && (
              <p className="text-caption">
                과세표준이 50만원 미만이라 증여세를 부과하지 않습니다 (상증법 §55②).
              </p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}
