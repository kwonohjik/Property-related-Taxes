"use client";

/**
 * ⑤ 세부담 시뮬레이션(선택 단계 — 계획서 §4.7 · T9 · D8 · P8).
 *
 * 결과 화면 안에 입력을 두지 않는다 — 판정 결과를 지우지 않으려고 입력을 store 중과 슬롯(`simulationInput`)에 두고, 「세액 비교하기」가
 * 판정과 시뮬레이션을 한 요청으로 받는다(`callMultiHouseSurchargeJudgmentAPI(form, simulation)`).
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { CtaButton } from "@/components/calc/shared/WizardNav";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { SurchargeSimulationCard } from "@/components/calc/results/surcharge/SurchargeSimulationCard";
import { parseAmount } from "@/lib/calc/number-parse";
import {
  SIMULATION_NOT_PURCHASE_HOUSING_TEXT,
  surchargeSimulationUnsupportedReason,
  type SurchargeSimulationInputForm,
} from "@/lib/calc/surcharge-simulation-input";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";

type Props = {
  form: OneHouseJudgmentFormData;
  result: MultiHouseSurchargeJudgmentResponse | null;
  input: SurchargeSimulationInputForm;
  onInputChange: (patch: Partial<SurchargeSimulationInputForm>) => void;
  onSimulate: () => void;
  isLoading: boolean;
  error: string | null;
};

export function StepSimulation({ form, result, input, onInputChange, onSimulate, isLoading, error }: Props) {
  const unsupported =
    surchargeSimulationUnsupportedReason(form) ??
    (result && !result.scope.supported ? "판정 범위 밖이라 중과 여부에 따른 세액을 비교하지 않습니다 — ④ 판정 결과에서 사유를 확인하세요." : null);

  if (unsupported) {
    return (
      <div data-testid="surcharge-simulation-unsupported">
        <ToneCard tone="amber" sectionNum="5" title="세부담 시뮬레이션">
          <p className="text-sm leading-relaxed">{unsupported}</p>
        </ToneCard>
      </div>
    );
  }

  const simulation = result?.simulation;
  const transferPrice = parseAmount(form.contractTotalPrice);

  return (
    <div className="space-y-6">
      <ToneCard tone="sky" sectionNum="5" title="세부담 시뮬레이션 입력">
        <p className="text-sm leading-relaxed">
          같은 사실로 양도세를 두 번 계산합니다 — <b>판정대로(A)</b>와 <b>중과가 없다면(B)</b>. 매매로 취득한 주택을 실지거래가액으로 계산하고,
          지분은 전부 양도하는 것으로 봅니다.
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">양도가액</dt>
          <dd className="font-mono tabular-nums" data-testid="surcharge-sim-transfer-price">
            {transferPrice > 0 ? formatKRW(transferPrice) : "미입력"} (② 예상 양도가액)
          </dd>
          <dt className="text-muted-foreground">취득일</dt>
          <dd>{form.assets?.[0]?.acquisitionDate || "미입력"}</dd>
        </dl>
        <FieldCard label="취득가액" hint="매매계약서의 실지거래가액">
          <CurrencyInput
            data-testid="surcharge-sim-acquisition-price"
            label="취득가액"
            hideLabel
            hideUnit
            value={input.acquisitionPrice}
            onChange={(acquisitionPrice) => onInputChange({ acquisitionPrice })}
          />
        </FieldCard>
        <FieldCard label="필요경비 합계" hint="자본적지출액과 양도비를 더한 금액 — 없으면 비워 두세요">
          <CurrencyInput
            data-testid="surcharge-sim-expenses"
            label="필요경비 합계"
            hideLabel
            hideUnit
            value={input.expenses}
            onChange={(expenses) => onInputChange({ expenses })}
          />
        </FieldCard>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>연간 기본공제는 이 양도에 처음 쓰는 것으로 보았습니다.</li>
          <li>보유 2년 미만이면 엔진이 단기 보유 세율과 중과세율 중 큰 세액으로 계산합니다.</li>
          <li>지방소득세를 포함한 금액입니다.</li>
        </ul>
        {error && (
          <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <CtaButton data-testid="surcharge-simulate-cta" onClick={onSimulate} disabled={isLoading}>
            {isLoading ? "계산 중…" : "세액 비교하기"}
          </CtaButton>
        </div>
      </ToneCard>

      {simulation?.status === "unsupported" && (
        <ToneCard tone="amber" title="세부담 시뮬레이션">
          <p className="text-sm leading-relaxed" data-testid="surcharge-simulation-server-unsupported">
            {SIMULATION_NOT_PURCHASE_HOUSING_TEXT}
          </p>
        </ToneCard>
      )}
      {simulation?.status === "computed" && (
        <ToneCard tone="violet" title="세액 비교">
          <SurchargeSimulationCard simulation={simulation} />
        </ToneCard>
      )}
    </div>
  );
}
