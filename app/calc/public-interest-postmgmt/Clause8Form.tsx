"use client";

/**
 * §48②8호 — 출연재산·직접 공익목적사업의 **운용 의무 위반** (증여세).
 *
 * 상증령 §38⑧ 두 갈래(1호 잔여재산 미귀속 · 2호 일부에게만 혜택)와 §40①4호·5호 과세가액.
 *
 * ⚠️ **단서는 2호에만** 붙는다 — §40①5호가 「제38조제8항제2호 **본문**」이라 못박았고 1호에는
 *    단서 자체가 없다. 그래서 단서 입력 블록은 2호를 고른 경우에만 렌더한다.
 */

import { useMemo, useState } from "react";

import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { Button } from "@/components/ui/button";
import { PublicInterestStepList } from "@/components/calc/shared/PublicInterestStepList";
import { calcPublicInterestOperationViolation } from "@/lib/tax-engine/deductions/public-interest-operation-violation";
import type {
  BeneficiaryScopeCondition,
  OperationViolationKind,
  PublicInterestOperationViolationInput,
  PublicInterestOperationViolationResult,
} from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

const VIOLATION_OPTIONS: Array<{
  value: OperationViolationKind;
  label: string;
  description: string;
}> = [
  {
    value: "residual_not_transferred",
    label: "사업 종료 시 잔여재산 미귀속",
    description:
      "국가·지방자치단체 또는 동일하거나 주무부장관이 유사한 것으로 인정하는 공익법인등에 귀속시키지 않은 경우 — 귀속시키지 아니한 재산가액이 과세가액 (상증령 §38⑧1호 · §40①4호)",
  },
  {
    value: "benefit_to_limited_group",
    label: "일부에게만 혜택 제공",
    description:
      "직접 공익목적사업 사용이 사회적 지위·직업·근무처·출생지 등에 의해 일부에게만 혜택을 제공하는 경우 — 그 일부에게 제공된 재산가액 또는 경제적 이익 상당액이 과세가액 (상증령 §38⑧2호 · §40①5호)",
  },
];

const CONDITION_OPTIONS: Array<{
  value: BeneficiaryScopeCondition;
  label: string;
  description: string;
}> = [
  {
    value: "establishment_permit",
    label: "가목 — 설립허가의 조건으로 붙임",
    description: "해당 공익법인등의 설립허가 조건으로 수혜자 범위를 붙인 경우",
  },
  {
    value: "articles_amendment_permit",
    label: "나목 — 정관 변경허가 조건으로 붙임",
    description:
      "목적사업의 효율적 수행 또는 새 사업 추가를 위해 재산을 추가출연하면서 정관 변경허가를 받는 경우로서 그 변경허가조건으로 붙인 경우",
  },
  {
    value: "none",
    label: "어느 조건으로도 붙이지 않음",
    description: "가목·나목 어디에도 해당하지 않으면 단서가 성립하지 않습니다.",
  },
];

export function Clause8Form() {
  const [violation, setViolation] = useState<OperationViolationKind>("residual_not_transferred");
  const [residualValue, setResidualValue] = useState("");
  const [benefitValue, setBenefitValue] = useState("");

  // 상증령 §38⑧2호 단서 (2호 전용)
  const [hasException, setHasException] = useState(false);
  const [consulted, setConsulted] = useState(false);
  const [scopeDefined, setScopeDefined] = useState(false);
  const [conditionType, setConditionType] = useState<BeneficiaryScopeCondition>(
    "establishment_permit",
  );

  const [result, setResult] = useState<PublicInterestOperationViolationResult | null>(null);

  const isLimitedBenefit = violation === "benefit_to_limited_group";

  const canCalculate = useMemo(() => {
    // 0도 유효값이라 「비어있지 않음」으로 판정한다(빈칸 → silent 0 방지).
    const required = isLimitedBenefit ? benefitValue : residualValue;
    return required.trim().length > 0;
  }, [isLimitedBenefit, benefitValue, residualValue]);

  const handleCalculate = () => {
    const input: PublicInterestOperationViolationInput = {
      violation,
      unTransferredResidualValue: isLimitedBenefit ? undefined : parseAmount(residualValue),
      limitedBenefitValue: isLimitedBenefit ? parseAmount(benefitValue) : undefined,
      approvedBeneficiaryScope:
        isLimitedBenefit && hasException
          ? { consulted, scopeDefined, conditionType }
          : undefined,
    };
    setResult(calcPublicInterestOperationViolation(input));
  };

  return (
    <>
      <section className="space-y-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">위반 유형 (상증령 §38⑧)</span>
          <RadioCardGroup
            name="pi8-violation"
            layout="stack"
            value={violation}
            onChange={(v) => setViolation(v as OperationViolationKind)}
            options={VIOLATION_OPTIONS}
          />
        </div>

        {isLimitedBenefit ? (
          <label className="block space-y-1">
            <span className="text-sm font-medium">일부에게만 제공된 재산가액·경제적 이익</span>
            <span className="block text-caption text-muted-foreground">
              상증령 §40①5호 — 혜택을 받은 일부에게만 제공된 재산가액 또는 경제적 이익에 상당하는
              가액입니다.
            </span>
            <CurrencyInput label="" hideUnit value={benefitValue} onChange={setBenefitValue} data-testid="pi8-benefit-value" />
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-sm font-medium">귀속시키지 아니한 잔여재산가액</span>
            <span className="block text-caption text-muted-foreground">
              상증령 §40①4호. 이사·사용인의 불법행위나 분실·도난으로 감소한 금액은 차감해
              입력하세요(상증령 §38⑨).
            </span>
            <CurrencyInput label="" hideUnit value={residualValue} onChange={setResidualValue} data-testid="pi8-residual-value" />
          </label>
        )}

        {isLimitedBenefit && (
          <ToggleCard
            tone="emerald"
            title="수혜자 범위를 따로 정한 경우 (§38⑧2호 단서)"
            description="주무부장관이 재정경제부장관과 협의해 따로 수혜자의 범위를 정하고, 이를 설립허가 조건(가목) 또는 정관 변경허가조건(나목)으로 붙인 경우 추징에서 제외됩니다. 세 요건을 모두 갖춰야 합니다."
            checked={hasException}
            onCheckedChange={setHasException}
          >
            <div className="space-y-3">
              <ToggleCard
                tone="sky"
                variant="chip"
                title="주무부장관이 재정경제부장관과 협의함"
                description="권한이 위임된 경우에는 위임받은 기관과 관할세무서장의 협의를 말합니다."
                checked={consulted}
                onCheckedChange={setConsulted}
              />
              <ToggleCard
                tone="sky"
                variant="chip"
                title="따로 수혜자의 범위를 정함"
                description="협의만으로는 단서가 성립하지 않습니다."
                checked={scopeDefined}
                onCheckedChange={setScopeDefined}
              />
              <div className="space-y-1">
                <span className="text-sm font-medium">어떤 조건으로 붙였는가</span>
                <RadioCardGroup
                  name="pi8-condition"
                  layout="stack"
                  value={conditionType}
                  onChange={(v) => setConditionType(v as BeneficiaryScopeCondition)}
                  options={CONDITION_OPTIONS}
                />
              </div>
            </div>
          </ToggleCard>
        )}

        <Button onClick={handleCalculate} disabled={!canCalculate} className="w-full">
          추징세액 계산
        </Button>
      </section>

      {result && (
        <section className="space-y-3" data-testid="pi8-result">
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
                : result.exemptReason
                  ? "추징 제외 (§38⑧2호 단서)"
                  : "추징 대상 아님"}
            </p>
            {result.exemptReason ? (
              <p className="text-caption" data-testid="pi8-exempt-reason">
                {result.exemptReason}
              </p>
            ) : (
              <>
                <p className="text-caption text-muted-foreground">추징 증여세</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="pi8-gift-tax">
                  {formatKRW(result.giftTax)}
                </p>
              </>
            )}
          </div>

          <PublicInterestStepList steps={result.steps} warnings={result.warnings} />
        </section>
      )}
    </>
  );
}
