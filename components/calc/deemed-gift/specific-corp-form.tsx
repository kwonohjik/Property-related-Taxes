"use client";

/** 증여로 보는 경우 — §45의5 특정법인과의 거래. 기본(지분율 직접)·다주주 roster 2모드 입력 폼.
 *  other-forms.tsx에서 분리(800줄 정책 선제 대응) — §45의3 `related-corp-form.tsx`와 대칭.
 *  other-forms.tsx가 re-export하여 기존 import 경로를 보존한다. */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SpecificCorpShareholderTable } from "./SpecificCorpShareholderTable";
import type { DeemedFormState } from "./shared";

type SetFn = (patch: Partial<DeemedFormState>) => void;
type Props = { form: DeemedFormState; set: SetFn };

/** §45의5 특정법인과의 거래 */
export function SpecificCorpFields({ form, set }: Props) {
  const isRoster = form.scMode === "roster";
  const isAuto = form.scCorporateTaxMode === "auto";

  // 법인세 안분 echo — useMemo 표시전용. store 역기록 금지 (feedback_useeffect_store_mirror_forbidden).
  const corpTaxEcho = useMemo(() => {
    if (!isAuto) return null;
    const assessed = parseAmount(form.scCorpTaxAssessed);
    const deduction = parseAmount(form.scCorpTaxDeduction);
    const income = parseAmount(form.scCorpIncome);
    const benefit = parseAmount(form.scTransactionBenefit);
    if (income <= 0 || assessed <= 0) return null;
    const net = Math.max(0, assessed - deduction);
    const minNumer = Math.min(benefit, income);
    // BigInt 안전 안분(overflow 방지 — safeMultiplyThenDivide와 동일 로직)
    const result = Number(BigInt(net) * BigInt(minNumer) / BigInt(income));
    return result;
  }, [isAuto, form.scCorpTaxAssessed, form.scCorpTaxDeduction, form.scCorpIncome, form.scTransactionBenefit]);

  return (
    <div className="space-y-3">
      {/* ── 섹션 1: 입력 방식 + 거래이익 ── */}
      <ToneCard tone="sky" sectionNum="1" title="입력 방식 선택" noDark>
        <RadioCardGroup
          name="sc-mode"
          tone="sky"
          layout="inline"
          value={form.scMode}
          onChange={(v) => {
            const next = v as DeemedFormState["scMode"];
            set({
              scMode: next,
              // roster ON → scShareholders [] 초기화 / OFF → undefined(3-state)
              scShareholders: next === "roster" ? (form.scShareholders ?? []) : undefined,
            });
          }}
          options={[
            { value: "single", label: "지분율 직접 입력", testId: "sc-mode-single" },
            { value: "roster", label: "주주 명단 입력", testId: "sc-mode-roster" },
          ]}
        />
        <CurrencyInput
          label="거래이익"
          value={form.scTransactionBenefit}
          onChange={(v) => set({ scTransactionBenefit: v })}
          hint="증여재산가액·채무면제이익·시가−대가 차액 (시행령 §34의5④1호)"
          data-testid="sc-transaction-benefit"
        />
      </ToneCard>

      {/* ── 섹션 2: 법인세 상당액 ── */}
      <ToneCard tone="amber" sectionNum="2" title="법인세 상당액 (시행령 §34의5④2호)" noDark>
        <RadioCardGroup
          name="sc-corp-tax-mode"
          tone="amber"
          layout="inline"
          value={form.scCorporateTaxMode}
          onChange={(v) => set({ scCorporateTaxMode: v as DeemedFormState["scCorporateTaxMode"] })}
          options={[
            { value: "direct", label: "직접 입력", testId: "sc-corp-tax-direct" },
            { value: "auto", label: "산출세액 + 소득금액 자동안분", testId: "sc-corp-tax-auto" },
          ]}
        />
        {!isAuto && (
          <CurrencyInput
            label="법인세 상당액"
            value={form.scCorporateTax}
            onChange={(v) => set({ scCorporateTax: v })}
            hint="(산출세액 − 공제·감면) × 「거래이익을 소득금액으로 나눈 값」과 1 중 작은 값. 이월결손금 0이면 0 입력"
            data-testid="sc-corporate-tax"
          />
        )}
        {isAuto && (
          <div className="space-y-2">
            <CurrencyInput
              label="법인세 산출세액"
              value={form.scCorpTaxAssessed}
              onChange={(v) => set({ scCorpTaxAssessed: v })}
              hint="법인세 산출세액 (공제·감면 차감 전)"
              data-testid="sc-corp-tax-assessed"
            />
            <CurrencyInput
              label="법인세 공제·감면액"
              value={form.scCorpTaxDeduction}
              onChange={(v) => set({ scCorpTaxDeduction: v })}
              hint="공제·감면액 합계 (없으면 0)"
              data-testid="sc-corp-tax-deduction"
            />
            <CurrencyInput
              label="각사업연도소득금액 (안분 분모)"
              value={form.scCorpIncome}
              onChange={(v) => set({ scCorpIncome: v })}
              hint="§34의5④2호나목 분모 — 필수 입력 (0이면 계산 불가)"
              data-testid="sc-corp-income"
            />
            {corpTaxEcho !== null && (
              <div className="rounded-md bg-amber-100/60 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                안분 법인세 상당액 (표시용) ≈{" "}
                <span className="font-mono tabular-nums font-bold">{corpTaxEcho.toLocaleString()}</span>원
                <span className="ml-1 text-amber-600">(실계산은 엔진)</span>
              </div>
            )}
          </div>
        )}
      </ToneCard>

      {/* ── 섹션 3: 지분율 or 주주 명단 ── */}
      <ToneCard
        tone="violet"
        sectionNum="3"
        title={isRoster ? "발행주식 총수 + 주주 명단" : "해당 지배주주등의 주식보유비율"}
        noDark
      >
        {!isRoster && (
          <FieldCard
            label="해당 지배주주등(수증자)의 주식보유비율"
            hint="증여의제이익 = 특정법인의 이익 × 이 비율. 상증령 §34의5⑨는 「해당 지배주주등이 각각」 증여받은 것으로 보므로 «그룹 합계»가 아니라 수증자 1인분입니다 (1억원 이상이면 과세 — §34의5⑤)"
            unit="%"
          >
            <DecimalInput value={form.scRatioPct} onChange={(v) => set({ scRatioPct: v })} data-testid="sc-shareholder-ratio" />
          </FieldCard>
        )}
        {isRoster && (
          <>
            <CurrencyInput
              label="발행주식 총수"
              value={form.scTotalShares}
              onChange={(v) => set({ scTotalShares: v })}
              hint="법인 발행주식 총수 (지분율 분모)"
              data-testid="sc-total-shares"
            />
            <SpecificCorpShareholderTable
              rows={form.scShareholders ?? []}
              onChange={(rows) => set({ scShareholders: rows })}
            />
          </>
        )}
        {/* ── ⓐ §45의5① 특정법인 해당성 — 위 ⓑ 승수와 다른 축 ── */}
        <FieldCard
          label="지배주주등 합계 주식보유비율 (직접+간접)"
          hint={
            isRoster
              ? "§45의5①은 「지배주주등의 주식보유비율이 100분의 30 이상인 법인」만 특정법인으로 봅니다. 미입력 시 위 주주 명단의 직접지분 합계로 판정합니다(간접보유 0%). 간접보유가 있으면 직접+간접 합계를 입력하십시오"
              : "§45의5①은 「지배주주등의 주식보유비율이 100분의 30 이상인 법인」만 특정법인으로 봅니다. 지배주주와 그 친족 «전원»의 합계(직접+간접)입니다 — 미입력 시 이 요건을 판정하지 않습니다"
          }
          unit="%"
        >
          <DecimalInput
            value={form.scGroupRatioPct}
            onChange={(v) => set({ scGroupRatioPct: v })}
            data-testid="sc-group-ratio"
          />
        </FieldCard>
      </ToneCard>

      {/* ── 섹션 4: §45의5② 한도 — 증여재산공제 ── */}
      <ToneCard tone="emerald" sectionNum="4" title="§45의5② 한도 — 증여재산공제 (선택)" noDark>
        <CurrencyInput
          label="증여재산공제"
          value={form.scGiftDeduction}
          onChange={(v) => set({ scGiftDeduction: v })}
          hint="§45의5② 한도 ㉮㉠ 계산 시 적용할 증여재산공제액 (미입력 시 0)"
          data-testid="sc-gift-deduction"
        />
      </ToneCard>
    </div>
  );
}
