"use client";

/**
 * ForeignStockIdentityBlock — 해외주식 **1단계**: 납세의무 요건 · 기본 양도 정보
 *
 * 계획서: `docs/00-pm/foreign-stock-wizard-step-realign.plan.md` §3
 * 검증 짝: `validateStep1Foreign`(거주연수 · 취득일 · 양도일 · 주식수)
 *
 * 금액(양도가액·취득가액)은 **2단계**, 필요경비·외국납부세액은 **3단계**로 갔다.
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { FOREIGN_STOCK_TRACK_START } from "@/lib/tax-engine/data/foreign-stock-track-era";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { DateInput } from "@/components/ui/date-input";
import { SectionBox, COUNTRY_OPTIONS, type ForeignStockSectionProps } from "./foreign-stock-shared";

export function ForeignStockIdentityBlock({ form, onChange }: ForeignStockSectionProps) {
  return (
    <div className="space-y-5">
      {/* ── 섹션 1: 납세의무 요건 (§118의2) ── */}
      <SectionBox n={1} label="납세의무 요건 (§118의2)" tone="rose">
        <FieldCard
          label="국내 거주 연수"
          hint="국내에 주소 또는 183일 이상 거소를 둔 기간(만 년). 5년 이상이면 납세의무가 있습니다."
          required
          trailing={
            <span className="text-xs text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded">
              §118의2
            </span>
          }
        >
          <div className="flex items-center gap-2">
            <DecimalInput
              value={form.yearsResidentInKorea}
              onChange={(v) => onChange({ yearsResidentInKorea: v })}
              placeholder="거주 연수 (만 년)"
              className="w-40"
            />
            <span className="text-sm text-slate-500">년</span>
          </div>
        </FieldCard>

        {/* 5년 미만 경고 */}
        {form.yearsResidentInKorea &&
          parseDecimal(form.yearsResidentInKorea) >= 0 &&
          parseDecimal(form.yearsResidentInKorea) < 5 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-relaxed">
            거주 기간이 5년 미만입니다. §118의2에 따라 납세의무가 없어 세액은 0으로 산출됩니다.
          </div>
        )}
      </SectionBox>

      {/* ── 섹션 2: 기본 양도 정보 ── */}
      <SectionBox n={2} label="기본 양도 정보" tone="sky">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldCard label="취득일" required>
            <DateInput
              value={form.acquisitionDate}
              onChange={(v) => onChange({ acquisitionDate: v })}
            />
          </FieldCard>
          {/*
            §94①3호다목 트랙은 2020-01-01 이후 양도분부터다(법률 제16834호 부칙 §1·§2②).
            실제 차단은 ⑧ validate와 ⑫ Zod가 한다 — 여기 hint는 사전 안내일 뿐이다.
          */}
          <FieldCard
            label="양도일"
            required
            hint={`${FOREIGN_STOCK_TRACK_START} 이후 양도분만 지원합니다 (그 이전은 구 §118의2 트랙)`}
          >
            <DateInput
              value={form.transferDate}
              onChange={(v) => onChange({ transferDate: v })}
            />
          </FieldCard>
        </div>
        <FieldCard label="양도 주식수" required>
          <DecimalInput
            value={form.shareCount}
            onChange={(v) => onChange({ shareCount: v })}
            thousandSeparator
          />
        </FieldCard>

        <FieldCard label="발행국가" required>
          <select
            value={form.fgCountryCode}
            onChange={(e) => onChange({ fgCountryCode: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            {COUNTRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldCard>

        <ToggleCard
          title="외국법인 발행 주식"
          description="ON = §157의3 1호(외국법인 발행 주식). OFF = §157의3 2호(내국법인 발행 주식·국외 예탁기관 DR §152의2, 해외 증권시장 상장). 둘 다 §94①3다목 국외주식이지만, 2호(내국법인)는 중소기업이면 §104①12호가목 10%가 적용됩니다."
          checked={form.isListedForeignCorp}
          onCheckedChange={(v) =>
            // 1호(외국법인 발행)로 되돌리면 중소기업 선택을 함께 지운다 —
            // 「중소기업기본법」 §2는 내국법인 기준이라 stale 값이 남으면 10%가 잘못 붙는다.
            onChange(v ? { isListedForeignCorp: v, isSmallMediumEnterprise: false } : { isListedForeignCorp: v })
          }
          tone="sky"
        />

        {/*
          §104①12호가목 — 중소기업의 주식등 10%.
          영 §157의3 2호(내국법인 해외상장)일 때만 도달한다. 「중소기업」은 §94①3나목이 이 장
          전체 용어로 정의하고 영 §157의2①이 「중소기업기본법」 §2로 위임받으므로,
          외국법인 발행 주식(1호)에는 적용할 근거가 없다.
        */}
        {!form.isListedForeignCorp && (
          <ToggleCard
            title="중소기업 (§104①12호가목 — 10%)"
            description="「중소기업기본법」 §2에 따른 중소기업이면 세율이 20% → 10%가 됩니다. 판정 시점은 양도일이 속하는 사업연도의 직전 사업연도 종료일 현재입니다(그 사업연도에 새로 설립된 법인은 양도일 현재 — 소령 §157의2③)."
            checked={form.isSmallMediumEnterprise}
            onCheckedChange={(v) => onChange({ isSmallMediumEnterprise: v })}
            tone="sky"
            data-testid="fg-sme-toggle"
          />
        )}
      </SectionBox>
    </div>
  );
}
