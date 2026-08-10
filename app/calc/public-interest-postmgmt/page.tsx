"use client";

/**
 * 공익법인등 출연재산 사후관리 추징 시뮬레이터 — 상증법 §48②1호·4호
 *
 * 법령 (KoreanLaw 실측 2026-08-10):
 *   · 1호(출연재산 3년) — 법 §48②1호(본문·단서) + 상증령 §40①1호 가·나·다
 *   · 4호(매각대금 3년) — 법 §48②4호 + 상증령 §38④ + §40①3호 가·나
 *
 * 영농(`/calc/inheritance-postmgmt`)·가업(`/calc/family-business-postmgmt`) 시뮬레이터와 병렬.
 * 순수 엔진을 클라이언트에서 직접 호출한다(API 불필요).
 *
 * ## ⚠️ 두 시뮬레이터와 성격이 다르다
 *
 * · 납세의무자가 **공익법인등 본인**이다(상속인·수증자가 아니다)
 * · 부과 세목이 **증여세**다 — 「그 가액을 증여받은 것으로 보아 즉시 증여세를 부과」
 * · **이자상당액 규정이 없다**(영농 §18의3⑧·가업 §18의2⑤과 다름)
 *
 * ## ⚠️ 1호와 4호는 **3년 기산점이 다르다**
 *
 * 1호는 「출연받은 **날**」, 4호는 「매각한 날이 속하는 **과세기간·사업연도 종료일**」이다
 * (상증령 §38④). 그래서 4호 폼은 결산일을 따로 받는다 — 매각일만으로 도출할 수 없다.
 */

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import {
  calcPublicInterestOperatingIncome,
  calcPublicInterestPostMgmt,
  calcPublicInterestSaleProceeds,
} from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import type {
  PublicInterestOperatingIncomeInput,
  PublicInterestOperatingIncomeResult,
  PublicInterestPostMgmtInput,
  PublicInterestPostMgmtResult,
  PublicInterestSaleProceedsInput,
  PublicInterestSaleProceedsResult,
  PublicInterestViolation,
  SaleProceedsViolation,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

type ClauseKind = "clause1" | "clause3" | "clause4";

const CLAUSE_OPTIONS: Array<{ value: ClauseKind; label: string; description: string }> = [
  {
    value: "clause1",
    label: "출연받은 재산 (§48②1호)",
    description: "출연받은 날부터 3년 이내에 직접 공익목적사업 등에 사용하지 않은 경우 등",
  },
  {
    value: "clause3",
    label: "운용소득 목적 외 사용 (§48②3호)",
    description:
      "출연재산을 수익용·수익사업용으로 운용해 생긴 운용소득을 직접 공익목적사업 외에 사용한 경우",
  },
  {
    value: "clause4",
    label: "매각대금 (§48②4호)",
    description:
      "출연재산을 매각하고 그 매각대금을 과세기간 종료일부터 3년 이내에 90% 이상 사용하지 않은 경우",
  },
];

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

/**
 * 결과 화면 링크가 넘긴 출연가액을 사전 채움한다.
 * 양수 정수만 수용 — 비수치는 ""로 떨어뜨려 `canCalculate`가 막게 한다.
 */
function sanitizeAmountParam(raw: string | null): string {
  if (!raw) return "";
  const num = parseAmount(raw);
  if (!Number.isFinite(num) || num <= 0) return "";
  return String(Math.floor(num));
}

// ============================================================
// §48②1호 — 출연받은 재산 3년
// ============================================================

function Clause1Form({ initialDonated }: { initialDonated: string }) {
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

// ============================================================
// §48②3호 — 운용소득 목적 외 사용
// ============================================================

function Clause3Form() {
  const [operatingIncome, setOperatingIncome] = useState("");
  const [outsideUseAmount, setOutsideUseAmount] = useState("");
  const [bookValue, setBookValue] = useState("");
  const [chapter4Value, setChapter4Value] = useState("");
  const [longHeldStockParValue, setLongHeldStockParValue] = useState("");

  const [result, setResult] = useState<PublicInterestOperatingIncomeResult | null>(null);

  const canCalculate = useMemo(() => {
    if (parseAmount(operatingIncome) <= 0) return false;
    // 0도 유효값이라 「비어있지 않음」으로 판정한다(빈칸 → silent 0 방지).
    if (outsideUseAmount.trim().length === 0) return false;
    if (bookValue.trim().length === 0) return false;
    return true;
  }, [operatingIncome, outsideUseAmount, bookValue]);

  const handleCalculate = () => {
    const input: PublicInterestOperatingIncomeInput = {
      operatingIncome: parseAmount(operatingIncome),
      outsideUseAmount: parseAmount(outsideUseAmount),
      bookValue: parseAmount(bookValue),
      // 미입력이면 undefined — 0으로 떨어뜨리면 §13② 단서가 조용히 오작동한다.
      chapter4Value: chapter4Value.trim().length > 0 ? parseAmount(chapter4Value) : undefined,
      longHeldStockParValue:
        longHeldStockParValue.trim().length > 0 ? parseAmount(longHeldStockParValue) : undefined,
    };
    setResult(calcPublicInterestOperatingIncome(input));
  };

  return (
    <>
      <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
          과세가액은 운용소득이 아니라 출연재산 평가가액에 비율을 곱합니다
        </p>
        <p className="text-caption text-violet-700 dark:text-violet-300">
          상증령 §40①2의2호 —{" "}
          <b>출연재산 평가가액 × (공익목적사업 외 사용금액 ÷ 운용소득)</b>. 분자·분모가 모두
          운용소득이라 「운용소득 × 비율」로 오해하기 쉽지만, 곱하는 대상은 평가가액입니다. 목적 외
          사용액이 적어도 <b>운용소득을 넘는 금액이 과세될 수 있습니다</b>.
        </p>
      </div>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">운용소득</span>
          <span className="block text-caption text-muted-foreground">
            상증령 §38⑤ — 차가감 소득금액 − 법인세등·이월결손금 + 직전 사업연도 미달사용액. 산식의
            분모입니다.
          </span>
          <CurrencyInput label="" hideUnit value={operatingIncome} onChange={setOperatingIncome} data-testid="pi3-operating-income" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">직접 공익목적사업 외에 사용한 금액</span>
          <span className="block text-caption text-muted-foreground">
            운용소득 중 목적 외로 사용한 금액입니다. 운용소득을 넘을 수 없습니다.
          </span>
          <CurrencyInput label="" hideUnit value={outsideUseAmount} onChange={setOutsideUseAmount} data-testid="pi3-outside-use" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">출연재산의 재무상태표상 가액</span>
          <span className="block text-caption text-muted-foreground">
            상증칙 §13② — 운용소득을 사용해야 할 사업연도의 <b>직전</b> 사업연도 말 현재 수익용·
            수익사업용으로 운용하는 출연받은 재산의 가액. <b>1년 이상 보유한 주식등은 빼고</b> 아래
            칸에 액면가액으로 넣으세요.
          </span>
          <CurrencyInput label="" hideUnit value={bookValue} onChange={setBookValue} data-testid="pi3-book-value" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">같은 재산의 법 제4장 평가액 (선택)</span>
          <span className="block text-caption text-muted-foreground">
            상증칙 §13② 단서 — 재무상태표상 가액이 이 값의 <b>70% 이하</b>이면 이 값으로
            대체합니다. 비워 두면 단서를 적용하지 않고 안내를 남깁니다.
          </span>
          <CurrencyInput label="" hideUnit value={chapter4Value} onChange={setChapter4Value} data-testid="pi3-chapter4-value" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">1년 이상 보유한 주식등의 액면가액 (선택)</span>
          <span className="block text-caption text-muted-foreground">
            상증칙 §13③ — 1년 이상 보유한 주식등은 §13②에도 불구하고 <b>액면가액</b>으로 평가합니다
            (시가·장부가가 아닙니다).
          </span>
          <CurrencyInput label="" hideUnit value={longHeldStockParValue} onChange={setLongHeldStockParValue} data-testid="pi3-stock-par-value" />
        </label>

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi3-result">
          <div
            className={
              result.isClawback
                ? "rounded-lg border border-rose-300 bg-rose-50/60 p-4 space-y-1"
                : "rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 space-y-1"
            }
          >
            <p className="text-sm font-semibold">
              {result.isClawback ? "추징 대상입니다" : "추징 대상 아님 (목적 외 사용 없음)"}
            </p>
            <p className="text-caption text-muted-foreground">추징 증여세</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="pi3-gift-tax">
              {formatKRW(result.giftTax)}
            </p>
            {result.chapter4ClauseApplied && (
              <p className="text-caption" data-testid="pi3-chapter4-applied">
                재무상태표상 가액이 제4장 평가액의 70% 이하라 <b>제4장 평가액</b>으로 대체했습니다
                (상증칙 §13② 단서).
              </p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}

// ============================================================
// §48②4호 — 매각대금 3년
// ============================================================

function Clause4Form() {
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

// ============================================================

function PublicInterestPostMgmtInner() {
  const searchParams = useSearchParams();
  const initialDonated = sanitizeAmountParam(searchParams.get("donatedValue"));
  const [clause, setClause] = useState<ClauseKind>("clause1");

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">공익법인 출연재산 사후관리 시뮬레이터</h1>
          <HomeButton />
        </div>
        <p className="text-sm text-muted-foreground">
          상증법 §48② — 출연받은 재산(1호)·매각대금(4호)의 3년 사후관리 위반 시 추징 증여세 계산.
        </p>
      </header>

      {initialDonated && clause === "clause1" && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
          ⓘ 상속세 결과 화면에서 진입 — 출연재산가액{" "}
          <strong>{formatKRW(parseAmount(initialDonated))}</strong>이 사전 입력되었습니다. 필요 시 수정 가능합니다.
        </div>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
          납세의무자는 공익법인등 본인입니다
        </p>
        <p className="text-caption text-blue-700 dark:text-blue-300">
          「그 사유가 발생한 날에 대통령령으로 정하는 가액을 공익법인등이 <b>증여받은 것으로 보아
          즉시 증여세를 부과</b>」합니다(§48② 본문). 영농·가업 사후관리와 달리 <b>이자상당액 가산
          규정이 없습니다</b>.
        </p>
        <p className="text-caption text-blue-700 dark:text-blue-300">
          같은 항이라도 <b>5호·7호</b>(운용소득·매각대금 1년 30%·2년 60%·의무지출)는 증여세가
          아니라 <b>§78⑨ 가산세</b>입니다 —{" "}
          <Link href="/calc/public-interest-penalty" className="underline font-medium">
            공익법인 사후관리 가산세 계산기
          </Link>
          를 이용하세요.
        </p>
      </div>

      <div className="space-y-1" data-testid="pi-clause-selector">
        <span className="text-sm font-medium">추징 사유</span>
        <RadioCardGroup
          name="pi-clause"
          layout="stack"
          value={clause}
          onChange={(v) => setClause(v as ClauseKind)}
          options={CLAUSE_OPTIONS}
        />
      </div>

      {clause === "clause1" && <Clause1Form initialDonated={initialDonated} />}
      {clause === "clause3" && <Clause3Form />}
      {clause === "clause4" && <Clause4Form />}
    </div>
  );
}

/** `useSearchParams`는 Suspense 경계가 필요하다(Next.js App Router). */
export default function PublicInterestPostMgmtPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>}>
      <PublicInterestPostMgmtInner />
    </Suspense>
  );
}
