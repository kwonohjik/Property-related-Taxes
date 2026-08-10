"use client";

/**
 * 공익법인등 사후관리 **가산세** 계산기 — 상증법 §48②5호·7호 → §78⑨
 *
 * 법령 (KoreanLaw 실측 2026-08-10): 법 §78⑨ · 상증령 §80⑬⑭ · §38⑤⑥⑦⑱⑲ · 법 §48②5호·7호
 * 집행기준 48-38-6(운용소득 사용기준금액)·48-38-7(매각대금 사용기준금액)
 *
 * ## ⚠️ 왜 `/calc/public-interest-postmgmt`와 별도 페이지인가
 *
 * **세목이 다르다.** §48② 본문이 「제1호부터 제4호까지…는 증여세를 부과하고, **제5호 및
 * 제7호**에 해당하는 경우에는 **제78조제9항에 따른 가산세**를 부과한다」로 갈라 놓았다.
 * 그리고 이 계산기는 세 호(1·2·3호)를 **동시에** 받아 §78⑨ 후단의 택일·합산 규칙을
 * 적용하므로, 위반 1건을 고르는 증여세 계산기와 입력 구조 자체가 다르다.
 */

import { useMemo, useState } from "react";
import Link from "next/link";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestPenalty } from "@/lib/tax-engine/deductions/public-interest-penalty";
import type {
  PublicInterestPenaltyInput,
  PublicInterestPenaltyResult,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

/** 금액 입력 한 줄 — 이 페이지 전용(빈칸 → silent 0 방지는 `canCalculate`가 맡는다). */
function AmountField({
  label,
  hint,
  value,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-caption text-muted-foreground">{hint}</span>}
      <CurrencyInput label="" hideUnit value={value} onChange={onChange} data-testid={testId} />
    </label>
  );
}

export default function PublicInterestPenaltyPage() {
  // §78⑨1호 — 운용소득
  const [hasOperating, setHasOperating] = useState(false);
  const [operatingIncome, setOperatingIncome] = useState("");
  const [operatingUsed, setOperatingUsed] = useState("");

  // §78⑨2호 — 매각대금
  const [hasSale, setHasSale] = useState(false);
  const [saleProceeds, setSaleProceeds] = useState("");
  const [saleUsed1y, setSaleUsed1y] = useState("");
  const [saleUsed2y, setSaleUsed2y] = useState("");

  // §78⑨3호 — 의무지출
  const [hasMandatory, setHasMandatory] = useState(false);
  const [assetBase, setAssetBase] = useState("");
  const [mandatoryUsed, setMandatoryUsed] = useState("");
  const [exceedsTen, setExceedsTen] = useState(false);
  const [isClauseGa, setIsClauseGa] = useState(false);

  const [result, setResult] = useState<PublicInterestPenaltyResult | null>(null);

  const canCalculate = useMemo(() => {
    if (!hasOperating && !hasSale && !hasMandatory) return false;
    // 사용실적은 0도 유효값이라 「비어있지 않음」으로 판정한다.
    if (hasOperating && (operatingIncome.trim() === "" || operatingUsed.trim() === "")) return false;
    if (hasSale && (saleProceeds.trim() === "" || saleUsed1y.trim() === "" || saleUsed2y.trim() === ""))
      return false;
    if (hasMandatory && (assetBase.trim() === "" || mandatoryUsed.trim() === "")) return false;
    return true;
  }, [
    hasOperating,
    hasSale,
    hasMandatory,
    operatingIncome,
    operatingUsed,
    saleProceeds,
    saleUsed1y,
    saleUsed2y,
    assetBase,
    mandatoryUsed,
  ]);

  const handleCalculate = () => {
    const input: PublicInterestPenaltyInput = {
      operatingIncome: hasOperating
        ? { income: parseAmount(operatingIncome), usedAmount: parseAmount(operatingUsed) }
        : undefined,
      saleProceeds: hasSale
        ? {
            proceeds: parseAmount(saleProceeds),
            usedWithin1y: parseAmount(saleUsed1y),
            usedWithin2y: parseAmount(saleUsed2y),
          }
        : undefined,
      mandatoryDistribution: hasMandatory
        ? {
            assetBase: parseAmount(assetBase),
            exceedsTenPercentHolding: exceedsTen,
            isClauseGaCorp: isClauseGa,
            usedAmount: parseAmount(mandatoryUsed),
          }
        : undefined,
    };
    setResult(calcPublicInterestPenalty(input));
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">공익법인 사후관리 가산세 계산기</h1>
          <HomeButton />
        </div>
        <p className="text-sm text-muted-foreground">
          상증법 §48②5호·7호 → §78⑨ — 운용소득·매각대금·의무지출 기준금액 미달 시 가산세 계산.
        </p>
      </header>

      <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
          이 계산기는 「가산세」입니다 — 증여세가 아닙니다
        </p>
        <p className="text-caption text-blue-700 dark:text-blue-300">
          §48② 본문이 세목을 갈라 놓았습니다. <b>1호~4호·6호·8호는 증여세</b>, <b>5호·7호는
          §78⑨ 가산세</b>입니다. 출연재산 3년(1호)·매각대금 3년 90%(4호)는{" "}
          <Link href="/calc/public-interest-postmgmt" className="underline font-medium">
            공익법인 출연재산 사후관리 시뮬레이터
          </Link>
          에서 계산하세요.
        </p>
      </div>

      <section className="space-y-3">
        <ToggleCard
          tone="amber"
          title="① 운용소득 기준금액 미달 (§78⑨1호)"
          description="출연받은 재산을 수익용·수익사업용으로 운용해 생긴 운용소득을 사용기준금액(운용소득의 80%)에 미달하게 사용한 경우"
          checked={hasOperating}
          onCheckedChange={setHasOperating}
        >
          <div className="space-y-3">
            <AmountField
              label="운용소득"
              hint="상증령 §38⑤ — 차가감 소득금액 − 법인세등·이월결손금 + 직전 사업연도 미달사용액(가산세 차감). 음수이면 0으로 봅니다."
              value={operatingIncome}
              onChange={setOperatingIncome}
              testId="pn-operating-income"
            />
            <AmountField
              label="직접 공익목적사업 사용실적"
              hint="상증령 §38⑥ — 그 소득이 발생한 과세기간·사업연도 종료일부터 1년 이내 사용분. 사업개시 5년 경과 시 당해 + 직전 4개 사업연도의 5년 평균으로 계산할 수 있습니다."
              value={operatingUsed}
              onChange={setOperatingUsed}
              testId="pn-operating-used"
            />
          </div>
        </ToggleCard>

        <ToggleCard
          tone="violet"
          title="② 매각대금 1년 30%·2년 60% 미달 (§78⑨2호)"
          description="출연재산 매각대금을 과세기간 종료일부터 1년 이내 30%, 2년 이내 60%에 미달하게 사용한 경우. 3년 90% 미달은 가산세가 아니라 증여세(§48②4호)입니다."
          checked={hasSale}
          onCheckedChange={setHasSale}
        >
          <div className="space-y-3">
            <AmountField
              label="매각대금"
              hint="매각에 따라 부담한 국세·지방세를 뺀 금액입니다(상증령 §38⑰)."
              value={saleProceeds}
              onChange={setSaleProceeds}
              testId="pn-sale-proceeds"
            />
            <AmountField
              label="1년 이내 사용실적"
              hint="매각한 날이 속하는 과세기간·사업연도 종료일부터 1년 이내 직접 공익목적사업 사용액."
              value={saleUsed1y}
              onChange={setSaleUsed1y}
              testId="pn-sale-used-1y"
            />
            <AmountField
              label="2년 이내 사용실적 (누계)"
              hint="같은 기산점부터 2년 이내 누적 사용액입니다 — 1년차분을 포함합니다."
              value={saleUsed2y}
              onChange={setSaleUsed2y}
              testId="pn-sale-used-2y"
            />
          </div>
        </ToggleCard>

        <ToggleCard
          tone="rose"
          title="③ 의무지출 기준금액 미달 (§78⑨3호 · §48②7호)"
          description="출연받은 재산의 가액에 1%(일정한 경우 3%)를 곱한 기준금액에 미달하여 직접 공익목적사업에 사용한 경우"
          checked={hasMandatory}
          onCheckedChange={setHasMandatory}
        >
          <div className="space-y-3">
            <AmountField
              label="출연받은 재산의 가액"
              hint="상증령 §38⑱ — 직전 과세기간·사업연도 종료일 현재 재무상태표·운영성과표 기준, 수익용·수익사업용 운용재산(직접 공익목적사업용 제외)의 [총자산가액 − (부채가액 + 당기순이익)]. 3년 이상 5년 미만 보유 상장주식은 직전 3개, 5년 이상은 직전 5개 종료일 평균액으로 합니다."
              value={assetBase}
              onChange={setAssetBase}
              testId="pn-asset-base"
            />
            <ToggleCard
              tone="sky"
              variant="chip"
              title="발행주식총수등의 10%를 초과 보유"
              description="§16②2호가목 공익법인등이 10%를 초과 보유하면 기준금액 비율이 1% → 3%가 됩니다."
              checked={exceedsTen}
              onCheckedChange={setExceedsTen}
            />
            <ToggleCard
              tone="fuchsia"
              variant="chip"
              title="§48②7호 가목의 공익법인등 (가산세율 200%)"
              description="주식등 보유비율이 발행주식총수등의 5%를 초과하는 공익법인등(상증령 §38⑳). 3호 가산세율이 10% → 200%가 됩니다."
              checked={isClauseGa}
              onCheckedChange={setIsClauseGa}
            />
            <AmountField
              label="직접 공익목적사업 사용액"
              hint="상증령 §38⑲ — 고유목적사업비로 지출해 손금에 산입한 금액을 포함합니다."
              value={mandatoryUsed}
              onChange={setMandatoryUsed}
              testId="pn-mandatory-used"
            />
          </div>
        </ToggleCard>

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          가산세 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pn-result">
          <div
            className={
              result.totalPenalty > 0
                ? "rounded-lg border border-rose-300 bg-rose-50/60 p-4 space-y-1"
                : "rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 space-y-1"
            }
          >
            <p className="text-sm font-semibold">
              {result.totalPenalty > 0 ? "가산세 부과 대상입니다" : "가산세 부과 대상 아님"}
            </p>
            <p className="text-caption text-muted-foreground">가산세 합계</p>
            <p className="text-2xl font-bold tabular-nums" data-testid="pn-total-penalty">
              {formatKRW(result.totalPenalty)}
            </p>
            {result.clause1And3Applied !== "none" && (
              <p className="text-caption" data-testid="pn-clause-choice">
                1호·3호 택일 결과:{" "}
                <b>{result.clause1And3Applied === "clause3" ? "3호(의무지출)" : "1호(운용소득)"}</b>{" "}
                {formatKRW(result.clause1And3Penalty)}
              </p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </div>
  );
}
