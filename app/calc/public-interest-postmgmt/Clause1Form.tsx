"use client";

/**
 * §48②1호 — 출연받은 재산 3년 사후관리 (증여세).
 * 법령 근거·구조는 `page.tsx` 상단 주석 참조.
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestPostMgmt } from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import type {
  PublicInterestPostMgmtInput,
  PublicInterestPostMgmtResult,
  PublicInterestViolation,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const VIOLATION_OPTIONS: Array<{
  value: PublicInterestViolation;
  label: string;
  description: string;
}> = [
  {
    value: "unused_within_3y",
    label: "3년 이내 미사용·미달사용",
    description: "출연받은 날부터 3년 이내에 직접 공익목적사업등에 사용하지 않음 (상증령 §40①1호 나목)",
  },
  {
    value: "used_outside_purpose",
    label: "직접 공익목적사업등 외 사용",
    description: "용도 외에 사용한 재산의 가액이 대상 (상증령 §40①1호 가목)",
  },
  {
    value: "discontinued_after_3y",
    label: "3년 이후 계속 미사용",
    description: "3년 이후 직접 공익목적사업등에 계속하여 사용하지 않음 (상증령 §40①1호 다목)",
  },
];

export function Clause1Form({ initialDonated }: { initialDonated: string }) {
  const [donatedValue, setDonatedValue] = useState(initialDonated);
  const [donationDate, setDonationDate] = useState("");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [violation, setViolation] = useState<PublicInterestViolation>("unused_within_3y");
  const [violatedValue, setViolatedValue] = useState("");

  // §48②1호 단서 — 부득이한 사유
  const [hasException, setHasException] = useState(false);
  const [reported, setReported] = useState(false);
  const [reasonEndDate, setReasonEndDate] = useState("");
  const [usedDate, setUsedDate] = useState("");

  const [result, setResult] = useState<PublicInterestPostMgmtResult | null>(null);

  const canCalculate = useMemo(() => {
    if (donationDate.length !== 10 || assessmentDate.length !== 10) return false;
    if (parseAmount(donatedValue) <= 0) return false;
    // 위반 가액은 0도 유효값이라 「비어있지 않음」으로 판정한다(빈칸 → silent 0 방지).
    if (violatedValue.trim().length === 0) return false;
    if (hasException && reasonEndDate.length !== 10) return false;
    return true;
  }, [donationDate, assessmentDate, donatedValue, violatedValue, hasException, reasonEndDate]);

  const handleCalculate = () => {
    const input: PublicInterestPostMgmtInput = {
      donatedValue: parseAmount(donatedValue),
      donationDate,
      assessmentDate,
      violation,
      violatedValue: parseAmount(violatedValue),
      justifiedException: hasException
        ? {
            reported,
            reasonEndDate,
            usedDate: usedDate.length === 10 ? usedDate : undefined,
          }
        : undefined,
    };
    setResult(calcPublicInterestPostMgmt(input));
  };

  return (
    <>
      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">출연받은 재산가액</span>
          <CurrencyInput label="" hideUnit value={donatedValue} onChange={setDonatedValue} data-testid="pi-donated-value" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">출연받은 날</span>
          <DateInput value={donationDate} onChange={setDonationDate} data-testid="pi-donation-date" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">판정 기준일 (사유가 발생한 날)</span>
          <DateInput value={assessmentDate} onChange={setAssessmentDate} data-testid="pi-assessment-date" />
        </label>

        <div className="space-y-1">
          <span className="text-sm font-medium">위반 유형 (상증령 §40①1호)</span>
          <RadioCardGroup
            name="pi-violation"
            layout="stack"
            value={violation}
            onChange={(v) => setViolation(v as PublicInterestViolation)}
            options={VIOLATION_OPTIONS}
          />
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">추징 대상 가액</span>
          <span className="block text-caption text-muted-foreground">
            선택한 유형에 해당하는 재산의 가액(용도 외 사용액 · 미사용·미달사용액 등). 출연가액을 넘을 수 없습니다.
          </span>
          <CurrencyInput label="" hideUnit value={violatedValue} onChange={setViolatedValue} data-testid="pi-violated-value" />
        </label>

        <ToggleCard
          tone="emerald"
          title="부득이한 사유 (§48②1호 단서)"
          description="장기간이 걸리는 등 부득이한 사유를 보고하고, 사유가 없어진 날부터 1년 이내에 직접 공익목적사업등에 사용한 경우 추징에서 제외됩니다. 세 요건을 모두 갖춰야 합니다."
          checked={hasException}
          onCheckedChange={setHasException}
        >
          <div className="space-y-3">
            <ToggleCard
              tone="sky"
              variant="chip"
              title="관할세무서장에게 보고함"
              description="§48⑤ 보고서 제출 시 그 사실을 보고"
              checked={reported}
              onCheckedChange={setReported}
            />
            <label className="block space-y-1">
              <span className="text-sm font-medium">사유가 없어진 날</span>
              <DateInput value={reasonEndDate} onChange={setReasonEndDate} data-testid="pi-reason-end-date" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">직접 공익목적사업등에 사용한 날</span>
              <span className="block text-caption text-muted-foreground">
                아직 사용하지 않았으면 비워 두세요 — 단서가 성립하지 않습니다.
              </span>
              <DateInput value={usedDate} onChange={setUsedDate} data-testid="pi-used-date" />
            </label>
          </div>
        </ToggleCard>

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi-postmgmt-result">
          <div
            className={
              result.isClawback
                ? "rounded-lg border border-rose-300 bg-rose-50/60 p-4 space-y-1"
                : "rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 space-y-1"
            }
          >
            <p className="text-sm font-semibold">
              {result.isClawback ? "추징 대상입니다" : "추징 제외 (§48②1호 단서)"}
            </p>
            {result.isClawback ? (
              <>
                <p className="text-caption text-muted-foreground">추징 증여세</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="pi-gift-tax">
                  {formatKRW(result.giftTax)}
                </p>
              </>
            ) : (
              <p className="text-caption">{result.exemptReason}</p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}
