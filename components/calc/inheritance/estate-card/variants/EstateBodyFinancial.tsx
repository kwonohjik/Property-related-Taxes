"use client";

/**
 * EstateBodyFinancial — 예금·저금·적금 §63④ 평가 입력 UI
 *
 * 평가 모드 (savingsValuationMode):
 *   "balance"  — 잔액평가: 평가기준일 현재 잔액(시가) 직접 입력
 *   "auto"     — §63④ 정밀평가 · 자동 계산: 원금·이율·예입일로 미수이자·원천징수액 자동 산출
 *   "manual"   — §63④ 정밀평가 · 직접 입력: 미수이자·원천징수세액을 직접 입력
 *
 * 법령: 상증법 §63④ — 평가액 = ㉠예입원금 + ㉡미수이자 − ㉢원천징수세액
 *
 * UI 설계:
 *   - RadioCardGroup(emerald): 잔액평가 | §63④ 정밀평가 (2-탭)
 *   - 정밀평가 선택 시 RadioCardGroup(sky): 자동 계산 | 직접 입력
 *   - auto 모드: DateInput(예입일) · DecimalInput(연이율%) · ToggleCard(지방소득세)
 *   - auto 미리보기: computeSavingsAccrual 직접 호출 (표시 전용 — store 미러링 아님)
 *   - manual 모드: CurrencyInput(미수이자) · CurrencyInput(원천징수세액)
 */

import { useMemo } from "react";
import { parseISO } from "date-fns";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { computeSavingsAccrual } from "@/lib/tax-engine/property-valuation";
import { EstateBodySection } from "./EstateBodySection";
import { makePatcher } from "./EstateBodyHelpers";
import type { VariantBodyProps } from "./types";

const TEXT_INPUT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** 원화 포맷 (결과 미리보기 전용) */
function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + " 원";
}

const VALUATION_MODE_OPTIONS = [
  {
    value: "balance" as const,
    label: "잔액평가",
    description: "평가기준일 현재 잔액(시가) 직접 입력",
  },
  {
    value: "precise" as const,
    label: "§63④ 정밀평가",
    description: "예입원금 + 미수이자 − 원천징수세액",
  },
];

const ACCRUAL_METHOD_OPTIONS = [
  {
    value: "auto" as const,
    label: "자동 계산",
    description: "원금·연이율·예입일로 미수이자 자동 산출",
  },
  {
    value: "manual" as const,
    label: "직접 입력",
    description: "미수이자·원천징수세액 직접 입력",
  },
];

export function EstateBodyFinancial({ item, onUpdate, valuationDate }: VariantBodyProps) {
  const set = makePatcher(item, onUpdate);

  // 외부 모드 ("balance" vs "precise")
  const mode = item.savingsValuationMode ?? "balance";
  const outerMode: "balance" | "precise" = mode === "balance" ? "balance" : "precise";
  // 내부 모드 ("auto" vs "manual") — "balance" 상태면 undefined → auto 기본
  const innerMode: "auto" | "manual" = mode === "manual" ? "manual" : "auto";

  // 자동 계산 미리보기 (표시 전용 — store 미러링 아님)
  const autoPreview = useMemo(() => {
    if (mode !== "auto") return null;
    if (!item.savingsPrincipal || !item.savingsStartDate || !valuationDate) return null;
    try {
      return computeSavingsAccrual({
        principal: item.savingsPrincipal,
        annualRate: item.savingsAnnualRate ?? 0,
        startDate: parseISO(item.savingsStartDate),
        valuationDate: parseISO(valuationDate),
        withholdingRate: item.savingsWithholdingRate ?? 14,
        includeLocalTax: item.savingsIncludeLocalTax ?? true,
      });
    } catch {
      return null;
    }
  }, [
    mode,
    item.savingsPrincipal,
    item.savingsAnnualRate,
    item.savingsStartDate,
    item.savingsIncludeLocalTax,
    item.savingsWithholdingRate,
    valuationDate,
  ]);

  const handleOuterChange = (v: string) => {
    if (v === "balance") {
      set({ savingsValuationMode: "balance" });
    } else {
      // 정밀평가로 전환: 내부 모드 유지(현재 "manual"이면 그대로, 아니면 "auto")
      set({ savingsValuationMode: mode === "manual" ? "manual" : "auto" });
    }
  };

  const handleInnerChange = (v: string) => {
    if (v === "auto" || v === "manual") {
      set({ savingsValuationMode: v });
    }
  };

  return (
    <div
      data-testid={`estate-body-variant-financial-${item.id}`}
      className="space-y-3"
    >
      <EstateBodySection
        title="예금·저금·적금 평가"
        subtitle="상증법 §63④ — 예입원금 + 미수이자 − 원천징수세액"
      >
        {/* 자산명 */}
        <FieldCard label="자산 명칭">
          <input
            type="text"
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="선택 입력 (예: ○○은행 정기예금)"
            className={TEXT_INPUT_CLASS}
          />
        </FieldCard>

        {/* ① 평가 방법 선택 */}
        <FieldCard
          label="평가 방법"
          hint="잔액평가: 평가기준일 잔액 직접 입력. §63④ 정밀평가: 미수이자·원천징수세액 포함 정밀 산출"
        >
          <RadioCardGroup
            name={`savings-valuation-mode-${item.id}`}
            options={VALUATION_MODE_OPTIONS}
            value={outerMode}
            onChange={handleOuterChange}
            tone="emerald"
            data-testid={`savings-valuation-mode-${item.id}`}
          />
        </FieldCard>

        {/* 잔액평가 모드 */}
        {mode === "balance" && (
          <>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded px-3 py-2">
              §62·상증령 §19① — 평가기준일 현재 잔액 또는 시가. §22 금융재산공제 적용 대상.
            </p>
            <FieldCard
              label="잔액 또는 시가"
              unit="원"
              hint="평가기준일 현재 잔액 (예: 만기 전 원금+이자 합산 잔액)"
            >
              <CurrencyInput
                label="잔액 또는 시가"
                value={item.marketValue != null ? String(item.marketValue) : ""}
                onChange={(v) => set({ marketValue: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`savings-market-value-${item.id}`}
              />
            </FieldCard>
          </>
        )}

        {/* §63④ 정밀평가 모드 */}
        {outerMode === "precise" && (
          <>
            {/* 미수이자 산정 방법 */}
            <FieldCard
              label="미수이자 산정 방법"
              hint="자동: 원금·이율·예입일로 산출. 직접: 금융기관 확인서 등 실측값 입력"
            >
              <RadioCardGroup
                name={`savings-accrual-method-${item.id}`}
                options={ACCRUAL_METHOD_OPTIONS}
                value={innerMode}
                onChange={handleInnerChange}
                tone="sky"
                data-testid={`savings-accrual-method-${item.id}`}
              />
            </FieldCard>

            {/* ㉠ 예입원금 (공통) */}
            <FieldCard
              label="㉠ 예입원금"
              unit="원"
              hint="원금 납입 총액 (상증법 §63④㉠)"
            >
              <CurrencyInput
                label="예입원금"
                value={item.savingsPrincipal != null ? String(item.savingsPrincipal) : ""}
                onChange={(v) => set({ savingsPrincipal: parseAmount(v) || undefined })}
                hideLabel
                hideUnit
                data-testid={`savings-principal-${item.id}`}
              />
            </FieldCard>

            {/* 자동 계산 모드 추가 입력 */}
            {innerMode === "auto" && (
              <>
                <FieldCard
                  label="연이율"
                  unit="%"
                  hint="명목 연이율 (예: 3.5% 입력 시 3.5 입력)"
                >
                  <DecimalInput
                    value={item.savingsAnnualRate != null ? String(item.savingsAnnualRate) : ""}
                    onChange={(v) => set({ savingsAnnualRate: parseDecimal(v) || undefined })}
                    data-testid={`savings-annual-rate-${item.id}`}
                  />
                </FieldCard>

                <FieldCard
                  label="예입일 (최초 납입일)"
                  hint="이자 기산일 — 경과일수 = 평가기준일 − 예입일 (초일불산입)"
                >
                  <DateInput
                    value={typeof item.savingsStartDate === "string" ? item.savingsStartDate : ""}
                    onChange={(v) => set({ savingsStartDate: v || undefined })}
                    data-testid={`savings-start-date-${item.id}`}
                  />
                </FieldCard>

                {/* 원천징수율 — 기본 14% */}
                <FieldCard
                  label="원천징수율"
                  unit="%"
                  hint="이자소득세 원천징수율 (기본 14%, 소득세법 §129①1라)"
                >
                  <DecimalInput
                    value={
                      item.savingsWithholdingRate != null
                        ? String(item.savingsWithholdingRate)
                        : "14"
                    }
                    onChange={(v) =>
                      set({
                        savingsWithholdingRate:
                          v === "" ? undefined : parseDecimal(v) || undefined,
                      })
                    }
                    data-testid={`savings-withholding-rate-${item.id}`}
                  />
                </FieldCard>

                {/* 지방소득세 포함 여부 */}
                <ToggleCard
                  checked={item.savingsIncludeLocalTax ?? true}
                  onCheckedChange={(v) => set({ savingsIncludeLocalTax: v })}
                  title="지방소득세 포함"
                  description="ON: 이자소득세의 10% 지방소득세를 원천징수세액에 합산 (기본 ON)"
                  tone="sky"
                />

                {/* 평가기준일 echo */}
                {valuationDate && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
                    평가기준일: {valuationDate} (상속개시일·증여일)
                  </p>
                )}

                {/* 자동 계산 미리보기 */}
                {autoPreview && (
                  <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-sky-800 dark:text-sky-300">§63④ 자동 계산 미리보기</p>
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>경과일수</span>
                      <span>{autoPreview.elapsedDays} 일</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>㉡ 미수이자</span>
                      <span>{fmtKRW(autoPreview.accruedInterest)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>㉢-1 이자소득세 ({item.savingsWithholdingRate ?? 14}%)</span>
                      <span>{fmtKRW(autoPreview.incomeWithholding)}</span>
                    </div>
                    {(item.savingsIncludeLocalTax ?? true) && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span>㉢-2 지방소득세 (10%)</span>
                        <span>{fmtKRW(autoPreview.localIncomeTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>㉢ 원천징수세액 합계</span>
                      <span>{fmtKRW(autoPreview.withholdingTax)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-sky-900 dark:text-sky-200 border-t border-sky-200 dark:border-sky-700 pt-1 mt-1">
                      <span>평가액 (㉠+㉡−㉢)</span>
                      <span>{fmtKRW(autoPreview.valuatedAmount)}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 직접 입력 모드 */}
            {innerMode === "manual" && (
              <>
                <FieldCard
                  label="㉡ 미수이자"
                  unit="원"
                  hint="평가기준일 현재 발생한 미수이자 (금융기관 확인서 등)"
                >
                  <CurrencyInput
                    label="미수이자"
                    value={
                      item.savingsAccruedInterest != null
                        ? String(item.savingsAccruedInterest)
                        : ""
                    }
                    onChange={(v) =>
                      set({ savingsAccruedInterest: parseAmount(v) || undefined })
                    }
                    hideLabel
                    hideUnit
                    data-testid={`savings-accrued-interest-${item.id}`}
                  />
                </FieldCard>

                <FieldCard
                  label="㉢ 원천징수세액"
                  unit="원"
                  hint="이자소득세 + 지방소득세 합계 (금융기관 확인서 등)"
                >
                  <CurrencyInput
                    label="원천징수세액"
                    value={
                      item.savingsWithholdingTax != null
                        ? String(item.savingsWithholdingTax)
                        : ""
                    }
                    onChange={(v) =>
                      set({ savingsWithholdingTax: parseAmount(v) || undefined })
                    }
                    hideLabel
                    hideUnit
                    data-testid={`savings-withholding-tax-${item.id}`}
                  />
                </FieldCard>

                <p className="text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded px-3 py-2">
                  평가액 미리보기: {item.savingsPrincipal != null
                    ? fmtKRW(
                        (item.savingsPrincipal ?? 0) +
                        (item.savingsAccruedInterest ?? 0) -
                        (item.savingsWithholdingTax ?? 0),
                      )
                    : "원금을 입력하세요"}
                </p>
              </>
            )}
          </>
        )}
      </EstateBodySection>
    </div>
  );
}
