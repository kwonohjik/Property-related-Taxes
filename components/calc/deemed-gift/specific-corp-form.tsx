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
import { CollapsibleHintCard } from "@/components/calc/shared/CollapsibleHintCard";
import { SpecificCorpIntermediaryTable } from "./SpecificCorpIntermediaryTable";
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
            hint="수증자 1인분입니다 (그룹 합계 아님). 간접보유가 있으면 합산해 입력하세요"
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
            <SpecificCorpIntermediaryTable
              rows={form.scIntermediaryCorps ?? []}
              shareholders={form.scShareholders ?? []}
              onChange={(rows) => set({ scIntermediaryCorps: rows })}
            />
          </>
        )}
        {/* ── ⓐ §45의5① 특정법인 해당성 — 위 ⓑ 승수와 다른 축 ── */}
        <FieldCard
          label="지배주주등 합계 주식보유비율 (직접+간접)"
          hint={
            isRoster
              ? "미입력 시 주주 명단·간접출자관계로 판정합니다 (그 밖의 간접보유는 0%)"
              : "지배주주와 그 친족 «전원»의 합계 — 미입력 시 요건을 판정하지 않습니다"
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

      {/* 「주식보유비율」의 두 축 — 평문 hint로 깔면 검증 오류 메시지를 밀어낸다(hint 150자 정책) */}
      <CollapsibleHintCard tone="violet" summary="「주식보유비율」의 두 축 — 특정법인 해당성(ⓐ)과 인별 승수(ⓑ)">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>ⓐ 특정법인 해당성 (법 §45의5①)</b>: 「지배주주등의 주식보유비율이 100분의 30 이상인
            <b> 법인</b>」만 특정법인입니다. 「지배주주등」은 법 §45의4①의 「지배주주와 그 친족」이라
            <b> 전원의 합계</b>이고, 미달이면 증여의제가 성립하지 않습니다.
          </li>
          <li>
            <b>ⓑ 인별 승수 (상증령 §34의5⑨)</b>: 증여의제이익은 「<b>해당</b> 지배주주등의 주식보유비율을
            곱한 금액을 해당 지배주주등이 <b>각각</b>」 증여받은 것으로 봅니다. 그룹이 30% 이상인
            특정법인이라면 개인 보유분이 30% 미만이어도 그 개인 비율로 곱하는 것이 맞습니다.
          </li>
          <li>
            <b>직접 + 간접 (법 §45의3①)</b>: 「직접 또는 간접으로 보유하는 주식보유비율(이하 이 조,
            제45조의4 및 <b>제45조의5</b>에서 &quot;주식보유비율&quot;이라 한다)」. 간접보유비율은 각 단계
            직접보유비율의 곱이고, 경로가 둘 이상이면 합합니다(상증령 §34의3②).
          </li>
          <li>
            <b>미입력의 의미</b>: 주주 명단 모드는 명단·간접출자관계에 없는 간접보유를 0%로 보고 ⓐ를
            판정합니다. 지분율 직접 입력 모드는 그룹 합계를 알 수 없어 ⓐ를 <b>판정하지 않습니다</b>.
          </li>
        </ul>
      </CollapsibleHintCard>

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
