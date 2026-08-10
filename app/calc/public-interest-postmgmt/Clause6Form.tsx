"use client";

/**
 * §48②6호 — 출연받은 주식등의 **의결권 행사** (증여세).
 *
 * ⭐ 출연 한도는 **20%**(§16②2호가목)지만 과세가액의 기준선은 **10%**다(상증령 §40①3의2호).
 * ⭐ §16②2호 **나목·다목** 공익법인등은 6호가 괄호로 명시 제외한다.
 *
 * ⚠️ 주식 수 입력은 `IntegerInput`을 쓴다 — `data-testid`를 받지 않는 공용 컴포넌트라
 *    (`feedback_shared_card_testid_not_forwarded`) E2E는 `ariaLabel`로 접근한다.
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestVotingRights } from "@/lib/tax-engine/deductions/public-interest-voting-rights";
import type {
  PublicInterestVotingRightsInput,
  PublicInterestVotingRightsResult,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

export function Clause6Form() {
  const [exerciseDate, setExerciseDate] = useState("");
  const [totalShares, setTotalShares] = useState<number | undefined>(undefined);
  const [heldShares, setHeldShares] = useState<number | undefined>(undefined);
  const [pricePerShare, setPricePerShare] = useState("");

  // §16②2호가목 요건 · §48②6호 괄호
  const [exercisedVotingRights, setExercisedVotingRights] = useState(true);
  const [isCharityPurpose, setIsCharityPurpose] = useState(true);
  const [isNaDaMokCorp, setIsNaDaMokCorp] = useState(false);

  const [result, setResult] = useState<PublicInterestVotingRightsResult | null>(null);

  const canCalculate = useMemo(() => {
    if (exerciseDate.length !== 10) return false;
    if (!totalShares || totalShares <= 0) return false;
    if (heldShares === undefined) return false;
    if (parseAmount(pricePerShare) <= 0) return false;
    return true;
  }, [exerciseDate, totalShares, heldShares, pricePerShare]);

  const handleCalculate = () => {
    const input: PublicInterestVotingRightsInput = {
      exerciseDate,
      totalShares: totalShares ?? 0,
      heldShares: heldShares ?? 0,
      pricePerShare: parseAmount(pricePerShare),
      exercisedVotingRights,
      isCharityPurpose,
      isNaDaMokCorp,
    };
    setResult(calcPublicInterestVotingRights(input));
  };

  return (
    <>
      <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
          출연 한도는 20%지만 과세 기준선은 10%입니다
        </p>
        <p className="text-caption text-violet-700 dark:text-violet-300">
          §16②2호가목 요건(① 의결권 미행사 ② 자선·장학 또는 사회복지 목적)을 갖추면{" "}
          <b>20%까지</b> 출연받아도 과세가액에 산입되지 않습니다. 그런데 ①을 위반해 의결권을
          행사하면 과세가액은 <b>발행주식총수등의 10%를 초과하여 보유하는 주식등의 가액</b>입니다
          (상증령 §40①3의2호) — 「20% 초과분」이 아닙니다. 15%를 보유했다면 5%p가 통째로
          과세됩니다.
        </p>
      </div>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">의결권을 행사한 날</span>
          <span className="block text-caption text-muted-foreground">
            상증령 §40①3의2호 — 보유 비율과 주식 가액을 이 날 기준으로 봅니다.
          </span>
          <DateInput value={exerciseDate} onChange={setExerciseDate} data-testid="pi6-exercise-date" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">발행주식총수등 (주)</span>
          <span className="block text-caption text-muted-foreground">
            자기주식과 자기출자지분은 제외합니다(법 §16② 괄호).
          </span>
          <IntegerInput
            ariaLabel="발행주식총수등"
            value={totalShares}
            onChange={setTotalShares}
            placeholder="주식 수 입력"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">공익법인등이 보유한 주식등 (주)</span>
          <IntegerInput
            ariaLabel="보유한 주식등"
            value={heldShares}
            onChange={setHeldShares}
            placeholder="주식 수 입력"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">1주당 평가액</span>
          <span className="block text-caption text-muted-foreground">
            의결권을 행사한 날 현재 평가액입니다 — 출연 당시나 사업연도 말 가액이 아닙니다.
          </span>
          <CurrencyInput label="" hideUnit value={pricePerShare} onChange={setPricePerShare} data-testid="pi6-price-per-share" />
        </label>

        <ToggleCard
          tone="rose"
          variant="chip"
          title="출연받은 주식등의 의결권을 행사했다"
          description="§16②2호가목 1) 「의결권을 행사하지 아니할 것」 위반 — 이 위반이 있어야 §48②6호가 성립합니다."
          checked={exercisedVotingRights}
          onCheckedChange={setExercisedVotingRights}
        />
        <ToggleCard
          tone="emerald"
          variant="chip"
          title="자선ㆍ장학 또는 사회복지를 목적으로 한다"
          description="§16②2호가목 2) — 이 요건까지 갖춘 공익법인등만 20% 한도(가목) 대상이고, 따라서 §48②6호 대상입니다."
          checked={isCharityPurpose}
          onCheckedChange={setIsCharityPurpose}
        />
        <ToggleCard
          tone="amber"
          variant="chip"
          title="§16②2호 나목·다목에 해당한다"
          description="상호출자제한기업집단과 특수관계(나목) 또는 §48⑪ 요건 미충족(다목). 해당하면 5% 한도를 적용받으므로 §48②6호에서 제외됩니다."
          checked={isNaDaMokCorp}
          onCheckedChange={setIsNaDaMokCorp}
        />

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi6-result">
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
                : result.applies
                  ? "추징 대상 아님 (10% 초과 보유분 없음)"
                  : "§48②6호 대상이 아닙니다"}
            </p>
            {result.applies ? (
              <>
                <p className="text-caption text-muted-foreground">추징 증여세</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="pi6-gift-tax">
                  {formatKRW(result.giftTax)}
                </p>
              </>
            ) : (
              <p className="text-caption" data-testid="pi6-non-applicable">
                {result.nonApplicableReason}
              </p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}
