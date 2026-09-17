"use client";

/**
 * ExitTaxIdentityBlock — 국외전출세 **1단계**: 거주자 요건 · 출국일 · 대주주 요건
 *
 * 계획서: `docs/00-pm/exit-tax-wizard-step-realign.plan.md` §3
 * 검증 짝: `validateStep1ExitTax`(거주연수 · 출국일 · 대주주)
 *
 * 보유 종목(§178의9)은 **2단계**, 실양도·납부유예·외국납부세액·보유현황 신고는 **3단계**로 갔다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { SectionBox, type StockStepBlockProps } from "./stock-section-box";

export function ExitTaxIdentityBlock({ form, onChange }: StockStepBlockProps) {
  // 5년 미만 거주 경고 조건
  const residencyYears = parseDecimal(form.etYearsResidentLast10);
  const isResidencyShort = form.etYearsResidentLast10 !== "" && residencyYears < 5;

  return (
    <div className="space-y-5">
      {/* ── 섹션 1: 거주자 요건 (§118의9①1호) ── */}
      <SectionBox n={1} label="거주자 요건 (§118의9①1호)" tone="rose">
        <FieldCard
          label="출국일 전 10년 중 국내 거주 연수"
          hint="출국일 전 10년 중 국내에 주소 또는 거소를 둔 기간의 합계 (만 년). 5년 이상이어야 과세됩니다."
          required
          trailing={
            <span className="text-xs text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded">
              §118의9①1호
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <DecimalInput
              value={form.etYearsResidentLast10}
              onChange={(v) => onChange({ etYearsResidentLast10: v })}
              placeholder="국내 거주 연수 (만 년)"
              className="w-40"
            />
            <span className="text-sm text-slate-500">년</span>
          </div>
        </FieldCard>

        {isResidencyShort && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            거주 기간이 5년 미만입니다. §118의9①에 따라 납세의무가 없어 세액은 0으로 산출됩니다.
          </div>
        )}
      </SectionBox>

      {/* ── 섹션 2: 출국일 ── */}
      <SectionBox n={2} label="출국일" tone="sky">
        <FieldCard
          label="출국일"
          hint="비거주자가 된 날 (YYYY-MM-DD). 보유 주식의 간주양도 시점이 됩니다."
          required
          trailing={
            <span className="text-xs text-sky-600 font-medium bg-sky-50 px-2 py-0.5 rounded">
              §118의9①
            </span>
          }
        >
          <DateInput
            value={form.etDepartureDate}
            onChange={(v) => onChange({ etDepartureDate: v })}
          />
        </FieldCard>
      </SectionBox>

      {/* ── 섹션 3: 대주주 요건 (§178의8) ── */}
      <SectionBox n={3} label="대주주 요건 (§178의8 → §167의8 준용)" tone="violet">
        <ToggleCard
          title="직전 연도말 대주주 해당"
          description="§178의8 → §167의8 준용 — 출국일이 속하는 연도 직전 연도말 기준으로 대주주 요건에 해당하는 경우 과세됩니다. 자기 판정하여 입력하세요."
          checked={form.etIsMajorShareholder}
          onCheckedChange={(v) => onChange({ etIsMajorShareholder: v })}
          tone="violet"
          trailing={
            <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded">
              §178의8
            </span>
          }
        />

        {!form.etIsMajorShareholder && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            대주주에 해당하지 않는 경우 §118의9①2호 요건 미충족으로 납세의무가 없습니다.
          </div>
        )}
      </SectionBox>
    </div>
  );
}
