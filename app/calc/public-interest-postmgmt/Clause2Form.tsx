"use client";

/**
 * §48②2호 — 출연재산·운용소득·매각대금으로 **주식등 취득** 시 보유비율 초과 (증여세).
 *
 * ⭐ 과세가액은 주식 **평가액이 아니라 취득자금**이다(상증령 §40①2호).
 * ⭐ 과세 단위는 **「추가로 취득하는 주식」** — 합산분만으로 한도를 넘어도 취득분을 넘어 과세하지 않는다.
 * ⭐ **나목·다목이 가목을 이긴다**(§16②2호가목 괄호).
 * ⚠️ §16③**2호**(3년 내 매각)는 취득에 준용되지 않아 **입력 자체를 두지 않는다**.
 *
 * ⚠️ 주식 수는 `IntegerInput`이라 `data-testid`가 DOM에 흐르지 않는다
 *    ([[feedback_shared_card_testid_not_forwarded]]) — E2E는 `ariaLabel`로 접근한다.
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { IntegerInput } from "@/components/calc/inputs/IntegerInput";
import { DateInput } from "@/components/ui/date-input";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestStockAcquisition } from "@/lib/tax-engine/deductions/public-interest-stock-acquisition";
import type {
  PublicInterestStockAcquisitionInput,
  PublicInterestStockAcquisitionResult,
  StockAcquisitionForm,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const FORM_OPTIONS: Array<{ value: StockAcquisitionForm; label: string; description: string }> = [
  {
    value: "purchase_or_donation",
    label: "매매 또는 출연에 의한 취득",
    description: "기준일 = 그 취득일 (상증령 §37①1호)",
  },
  {
    value: "paid_in_capital_increase",
    label: "유상증자 배정 신주의 유상취득",
    description:
      "기준일 = 취득일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일 또는 권리행사 기준일 (주식회사가 아니면 그 종료일) — 상증령 §37①2호",
  },
  {
    value: "capital_reduction",
    label: "감자",
    description:
      "기준일 = 감자를 위한 주주총회결의일이 속하는 연도의 주주명부폐쇄일 (주식회사가 아니면 종료일) — 상증령 §37①3호",
  },
  {
    value: "merger",
    label: "합병으로 합병법인 주식등 취득",
    description:
      "기준일 = 합병등기일이 속하는 과세기간·사업연도 중 주주명부 폐쇄일 또는 권리행사 기준일 (주식회사가 아니면 종료일) — 상증령 §37①4호",
  },
];

function ShareField({
  label,
  hint,
  ariaLabel,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  ariaLabel: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-caption text-muted-foreground">{hint}</span>}
      <IntegerInput ariaLabel={ariaLabel} value={value} onChange={onChange} placeholder="주식 수 입력" />
    </label>
  );
}

export function Clause2Form() {
  const [acquisitionForm, setAcquisitionForm] =
    useState<StockAcquisitionForm>("purchase_or_donation");
  const [assessmentDate, setAssessmentDate] = useState("");
  const [totalShares, setTotalShares] = useState<number | undefined>(undefined);
  const [acquiredShares, setAcquiredShares] = useState<number | undefined>(undefined);
  const [heldShares, setHeldShares] = useState<number | undefined>(undefined);
  const [otherDonated, setOtherDonated] = useState<number | undefined>(undefined);
  const [otherHeld, setOtherHeld] = useState<number | undefined>(undefined);
  const [acquisitionCost, setAcquisitionCost] = useState("");

  // §16②2호 비율
  const [isRestrictedGroup, setIsRestrictedGroup] = useState(false);
  const [failsClause11, setFailsClause11] = useState(false);
  const [noVotingRights, setNoVotingRights] = useState(false);
  const [isCharityPurpose, setIsCharityPurpose] = useState(false);

  // 상증칙 §13① 대체 경로
  const [hardToValue, setHardToValue] = useState(false);
  const [chapter4Value, setChapter4Value] = useState("");

  // §48②2호 단서
  const [clause1631, setClause1631] = useState(false);
  const [clause1633, setClause1633] = useState(false);
  const [hasIndustryAcademic, setHasIndustryAcademic] = useState(false);
  const [iaEstablished, setIaEstablished] = useState(false);
  const [iaRatioMet, setIaRatioMet] = useState(false);
  const [iaNoOtherShares, setIaNoOtherShares] = useState(false);

  const [result, setResult] = useState<PublicInterestStockAcquisitionResult | null>(null);

  const canCalculate = useMemo(() => {
    if (assessmentDate.length !== 10) return false;
    if (!totalShares || totalShares <= 0) return false;
    if (acquiredShares === undefined) return false;
    // 합산분은 0도 유효값이라 「입력됨」으로만 판정한다(빈칸 → silent 0 방지).
    if (heldShares === undefined || otherDonated === undefined || otherHeld === undefined)
      return false;
    if (hardToValue) return chapter4Value.trim().length > 0;
    return acquisitionCost.trim().length > 0;
  }, [
    assessmentDate,
    totalShares,
    acquiredShares,
    heldShares,
    otherDonated,
    otherHeld,
    hardToValue,
    chapter4Value,
    acquisitionCost,
  ]);

  const handleCalculate = () => {
    const input: PublicInterestStockAcquisitionInput = {
      acquisitionForm,
      assessmentDate,
      totalShares: totalShares ?? 0,
      acquiredShares: acquiredShares ?? 0,
      heldSharesAtAcquisition: heldShares ?? 0,
      otherCorpDonatedShares: otherDonated ?? 0,
      otherCorpHeldShares: otherHeld ?? 0,
      holdingRatio: {
        isMutualInvestmentRestrictedGroup: isRestrictedGroup,
        failsClause11Requirements: failsClause11,
        noVotingRights,
        isCharityPurpose,
      },
      acquisitionCost: parseAmount(acquisitionCost),
      chapter4ValueOfExcess: hardToValue ? parseAmount(chapter4Value) : undefined,
      exclusion: {
        clause16_3_1: clause1631,
        clause16_3_3: clause1633,
        industryAcademic: hasIndustryAcademic
          ? {
              establishedByTechContribution: iaEstablished,
              ratioMet: iaRatioMet,
              noOtherShares: iaNoOtherShares,
            }
          : undefined,
      },
    };
    setResult(calcPublicInterestStockAcquisition(input));
  };

  return (
    <>
      <div className="rounded-md border border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-1">
        <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
          과세가액은 주식 평가액이 아니라 「취득에 사용한 재산의 가액」입니다
        </p>
        <p className="text-caption text-violet-700 dark:text-violet-300">
          상증령 §40①2호 — 「그 <b>초과부분을 취득하는데 사용한 재산의 가액</b>」. 다른 사후관리
          사유(1·3·4·6·8호)는 모두 재산의 <b>평가액</b>이지만 2호만 <b>취득자금</b>입니다. 그 가액
          산정이 곤란한 경우에만 법 §60~§66 평가액으로 갑니다(상증칙 §13①). 또한 과세 단위는{" "}
          <b>이번에 추가로 취득한 주식</b>이라, 기존 보유·합산분만으로 한도를 넘었더라도 취득분을
          넘어 과세하지 않습니다.
        </p>
      </div>

      <section className="space-y-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">취득 형태 (상증령 §37①)</span>
          <RadioCardGroup
            name="pi2-form"
            layout="stack"
            value={acquisitionForm}
            onChange={(v) => setAcquisitionForm(v as StockAcquisitionForm)}
            options={FORM_OPTIONS}
          />
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">판정 기준일</span>
          <span className="block text-caption text-muted-foreground">
            위에서 고른 형태에 해당하는 날입니다 — 주주명부 폐쇄일·권리행사 기준일은 회사가 정하므로
            자동으로 도출하지 않습니다.
          </span>
          <DateInput value={assessmentDate} onChange={setAssessmentDate} data-testid="pi2-assessment-date" />
        </label>

        <ShareField
          label="발행주식총수등 (주)"
          hint="자기주식과 자기출자지분은 제외합니다(법 §16② 괄호)."
          ariaLabel="발행주식총수등"
          value={totalShares}
          onChange={setTotalShares}
        />
        <ShareField
          label="이번에 취득한 주식등 (주)"
          hint="출연받은 재산·그 운용소득·매각대금으로 취득한 분입니다. 과세 계기이자 과세 단위의 상한입니다."
          ariaLabel="이번에 취득한 주식등"
          value={acquiredShares}
          onChange={setAcquiredShares}
        />
        <ShareField
          label="가목 — 취득 당시 보유하던 동일 내국법인 주식등 (주)"
          hint="해당 공익법인등이 취득 당시 이미 보유하던 분입니다."
          ariaLabel="가목 취득 당시 보유"
          value={heldShares}
          onChange={setHeldShares}
        />
        <ShareField
          label="나목 — 특수관계 출연자가 다른 공익법인등에 출연한 주식등 (주)"
          hint="「해당 내국법인과 특수관계에 있는 출연자」는 출연자가 그 내국법인과 상증령 §2조의2③ 각 호의 관계에 있는 경우를 말합니다(상증령 §37②)."
          ariaLabel="나목 다른 공익법인 출연분"
          value={otherDonated}
          onChange={setOtherDonated}
        />
        <ShareField
          label="다목 — 그 출연자로부터 출연받은 다른 공익법인등의 보유분 (주)"
          ariaLabel="다목 다른 공익법인 보유분"
          value={otherHeld}
          onChange={setOtherHeld}
        />

        <div className="rounded-md border border-border p-3 space-y-3">
          <p className="text-sm font-medium">적용 비율 (법 §16②2호)</p>
          <p className="text-caption text-muted-foreground">
            원칙 10%. 아래 <b>나목·다목</b>에 해당하면 5%이고, 이에 해당하지 않으면서 <b>가목</b>{" "}
            두 요건을 모두 갖추면 20%입니다 — 가목 본문 괄호가 「나목 또는 다목에 해당하는
            공익법인등은 제외한다」라고 하므로 <b>나목·다목이 가목보다 우선</b>합니다.
          </p>
          <ToggleCard
            tone="amber"
            variant="chip"
            title="나목 — 상호출자제한기업집단과 특수관계"
            description="해당하면 5%"
            checked={isRestrictedGroup}
            onCheckedChange={setIsRestrictedGroup}
          />
          <ToggleCard
            tone="amber"
            variant="chip"
            title="다목 — §48⑪ 각 호의 요건 미충족"
            description="운용소득의 일정 비율 이상 직접 공익목적사업 사용·이사 구성 등 요건을 충족하지 못하면 5%"
            checked={failsClause11}
            onCheckedChange={setFailsClause11}
          />
          <ToggleCard
            tone="emerald"
            variant="chip"
            title="가목 1) — 출연받은 주식등의 의결권을 행사하지 아니할 것"
            description="가목 2)와 함께 갖추면 20%"
            checked={noVotingRights}
            onCheckedChange={setNoVotingRights}
          />
          <ToggleCard
            tone="emerald"
            variant="chip"
            title="가목 2) — 자선ㆍ장학 또는 사회복지를 목적으로 할 것"
            checked={isCharityPurpose}
            onCheckedChange={setIsCharityPurpose}
          />
        </div>

        {!hardToValue && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">이번 취득에 사용한 재산의 가액</span>
            <span className="block text-caption text-muted-foreground">
              출연받은 재산·그 운용소득·매각대금 중 이번 취득에 쓴 금액입니다. 매각대금이라면 매각에
              따라 부담한 국세·지방세를 뺀 금액입니다(상증령 §38⑰).
            </span>
            <CurrencyInput label="" hideUnit value={acquisitionCost} onChange={setAcquisitionCost} data-testid="pi2-acquisition-cost" />
          </label>
        )}

        <ToggleCard
          tone="sky"
          title="취득가액 산정이 곤란함 (상증칙 §13①)"
          description="「초과부분을 취득하는데 사용한 재산의 가액」 산정이 곤란한 경우 그 초과부분은 법 §60~§66 평가방법에 따릅니다."
          checked={hardToValue}
          onCheckedChange={setHardToValue}
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium">초과부분의 법 §60~§66 평가액</span>
            <CurrencyInput label="" hideUnit value={chapter4Value} onChange={setChapter4Value} data-testid="pi2-chapter4-value" />
          </label>
        </ToggleCard>

        <div className="rounded-md border border-border p-3 space-y-3">
          <p className="text-sm font-medium">단서 — 해당하면 추징에서 제외 (§48②2호 단서)</p>
          <p className="text-caption text-muted-foreground">
            준용되는 것은 법 §16③ <b>제1호 또는 제3호</b>뿐입니다. <b>제2호</b>(초과보유일부터 3년
            이내 초과분 매각)는 <b>출연 전용</b>이라 취득에는 준용되지 않아 입력을 두지 않았습니다.
          </p>
          <ToggleCard
            tone="rose"
            variant="chip"
            title="§16③1호 — 주무관청이 목적사업 수행에 필요하다고 인정"
            description="상호출자제한기업집단과 특수관계 없는 공익법인등이 출연자와 특수관계 없는 내국법인 주식등을 취득하는 경우"
            checked={clause1631}
            onCheckedChange={setClause1631}
          />
          <ToggleCard
            tone="rose"
            variant="chip"
            title="§16③3호 — 공익법인법 등 법령에 따른 취득"
            checked={clause1633}
            onCheckedChange={setClause1633}
          />
          <ToggleCard
            tone="fuchsia"
            title="산학협력단 (상증령 §37⑥)"
            description="세 요건을 모두 갖춰야 제외됩니다."
            checked={hasIndustryAcademic}
            onCheckedChange={setHasIndustryAcademic}
          >
            <div className="space-y-3">
              <ToggleCard
                tone="sky"
                variant="chip"
                title="1호 — 보유 기술을 출자해 기술지주회사·신기술창업전문회사를 설립"
                checked={iaEstablished}
                onCheckedChange={setIaEstablished}
              />
              <ToggleCard
                tone="sky"
                variant="chip"
                title="2호 — 기술지주회사 50% 이상 / 신기술창업전문회사 30% 이상 보유"
                checked={iaRatioMet}
                onCheckedChange={setIaRatioMet}
              />
              <ToggleCard
                tone="sky"
                variant="chip"
                title="3호 — 그 회사가 자회사 외의 주식등을 보유하지 아니할 것"
                checked={iaNoOtherShares}
                onCheckedChange={setIaNoOtherShares}
              />
            </div>
          </ToggleCard>
        </div>

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi2-result">
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
                  ? `추징 대상 아님 (${result.ratioPercent}% 이내)`
                  : "§48②2호 대상이 아닙니다"}
            </p>
            {result.applies ? (
              <>
                <p className="text-caption text-muted-foreground">추징 증여세</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="pi2-gift-tax">
                  {formatKRW(result.giftTax)}
                </p>
                {result.excessCappedByAcquired && (
                  <p className="text-caption" data-testid="pi2-capped">
                    합산분만으로 이미 한도를 넘어, 과세 대상이{" "}
                    <b>이번에 취득한 {result.taxableShares.toLocaleString()}주 전부</b>로
                    제한되었습니다(초과 {result.excessShares.toLocaleString()}주).
                  </p>
                )}
              </>
            ) : (
              <p className="text-caption" data-testid="pi2-non-applicable">
                {result.exemptReason ?? result.nonApplicableReason}
              </p>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}
