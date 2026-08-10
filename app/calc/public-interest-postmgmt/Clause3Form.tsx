"use client";

/**
 * §48②3호 — 운용소득을 직접 공익목적사업 **외**에 사용 (증여세).
 *
 * ⭐ 과세가액은 운용소득이 아니라 **출연재산 평가가액**에 비율을 곱한다(상증령 §40①2의2호).
 * ⭐ 평가가액 정의는 시행령이 아니라 **상증칙 §13②③**에 있다(70% 단서 · 1년 이상 보유
 *    주식등은 액면가액).
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestOperatingIncome } from "@/lib/tax-engine/deductions/public-interest-post-mgmt";
import type {
  PublicInterestOperatingIncomeInput,
  PublicInterestOperatingIncomeResult,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

export function Clause3Form() {
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
