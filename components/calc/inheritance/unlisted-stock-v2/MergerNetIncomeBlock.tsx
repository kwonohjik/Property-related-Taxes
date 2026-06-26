"use client";

/**
 * MergerNetIncomeBlock — 합병 후 3년 미경과 순손익 합산 입력 블록
 *
 * 법령: 상증령 §56③ + 상증통 63-56…12 + 서서-1071(2004.7.13.) + 재재산-181(2020.2.18.)
 * "합병법인·피합병법인 순손익액 합계 ÷ 합병후 발행주식총수"
 *
 * UI Design: docs/02-design/features/unlisted-net-income-fiscal-year-change.ui.design.md
 *
 * 정책:
 *  - ToggleCard(amber) 사용 — native checkbox 금지, OFF도 tone 유지
 *  - DateInput 사용 — type=date 금지
 *  - CurrencyInput + parseAmount — 금액/주식수
 *  - useEffect→store 미러링 금지 — onChange 직접
 *  - 자동 안분 fallback 금지 — 미입력은 validate 오류
 *  - placeholder 숫자 예시 금지 → hint
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type {
  MergerNetIncomeContext,
  MergerAcquirerYear,
  MergerTargetYear,
} from "@/lib/tax-engine/types/merger-net-income.types";

/** MergerNetIncomeBlock에서 관리하는 지역 상태 (enabled 포함) */
export interface MergerBlockState {
  enabled: boolean;
  context: MergerNetIncomeContext;
}

function dateToStr(d: Date | undefined | null): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function emptyAcquirerYear(): MergerAcquirerYear {
  const now = new Date();
  return { shares: 0, netIncome: 0, startDate: new Date(now.getFullYear() - 1, 0, 1), endDate: new Date(now.getFullYear() - 1, 11, 31) };
}

function emptyTargetYear(): MergerTargetYear {
  const now = new Date();
  return { netIncome: 0, startDate: new Date(now.getFullYear() - 1, 0, 1), endDate: new Date(now.getFullYear() - 1, 11, 31) };
}

export const MERGER_INITIAL_STATE: MergerBlockState = {
  enabled: false,
  context: {
    mergerRegistrationDate: new Date(),
    postMergerShares: 0,
    acquirer: [emptyAcquirerYear(), emptyAcquirerYear(), emptyAcquirerYear()],
    targetFiscalYears: [],
  },
};

export interface MergerNetIncomeBlockProps {
  state: MergerBlockState;
  onChange: (next: MergerBlockState) => void;
  sectionNum?: number;
}

export function MergerNetIncomeBlock({
  state,
  onChange,
  sectionNum,
}: MergerNetIncomeBlockProps) {
  const { enabled, context } = state;

  function updateContext(patch: Partial<MergerNetIncomeContext>) {
    onChange({ ...state, context: { ...context, ...patch } });
  }

  function updateAcquirer(idx: 0 | 1 | 2, patch: Partial<MergerAcquirerYear>) {
    const next = [...context.acquirer] as MergerNetIncomeContext["acquirer"];
    next[idx] = { ...next[idx], ...patch };
    updateContext({ acquirer: next });
  }

  function updateTarget(idx: number, patch: Partial<MergerTargetYear>) {
    const next = [...context.targetFiscalYears];
    next[idx] = { ...next[idx], ...patch };
    updateContext({ targetFiscalYears: next });
  }

  function addTarget() {
    updateContext({ targetFiscalYears: [...context.targetFiscalYears, emptyTargetYear()] });
  }

  function removeTarget(idx: number) {
    const next = context.targetFiscalYears.filter((_, i) => i !== idx);
    updateContext({ targetFiscalYears: next });
  }

  const YEAR_LABELS = ["전1년 (×3)", "전2년 (×2)", "전3년 (×1)"];

  return (
    <div data-testid="merger-toggle">
      <ToggleCard
        tone="amber"
        checked={enabled}
        onCheckedChange={(v) => onChange({ ...state, enabled: v })}
        title={`${sectionNum !== undefined ? `${sectionNum}. ` : ""}합병 후 3년 미경과 순손익 보정`}
        description="비상장법인이 최근 3년 내 합병한 경우 합병법인·피합병법인 순손익을 합산해 1주당 순손익액을 재계산합니다. (상증령 §56③, 상증통 63-56…12)"
      >
        <div className="space-y-4 mt-2">
          {/* 법령 링크 */}
          <div className="flex flex-wrap gap-1.5">
            <LawArticleModal legalBasis="상증령 §56" label="상증령 §56③ 합병 순손익 합산" />
          </div>

          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-amber-800">
                합병등기일 <span className="text-rose-600">*</span>
              </p>
              <div data-testid="merger-reg-date">
                <DateInput
                  value={dateToStr(context.mergerRegistrationDate)}
                  onChange={(s) => {
                    const d = strToDate(s);
                    if (d) updateContext({ mergerRegistrationDate: d });
                  }}
                />
              </div>
            </div>
            <FieldCard
              label="합병후 발행주식총수"
              hint="합병 완료 후 합병법인의 총 발행주식수 (§56③ 분모)"
              required
            >
              <CurrencyInput
                label="합병후 발행주식총수"
                hideLabel
                value={String(context.postMergerShares || "")}
                onChange={(v) => {
                  const n = parseInt(v.replace(/,/g, ""), 10) || 0;
                  updateContext({ postMergerShares: n });
                }}
                placeholder="발행주식총수 입력 (주)"
                data-testid="merger-post-shares"
              />
            </FieldCard>
          </div>

          {/* 합병법인 전1/2/3년 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-amber-800">합병법인 (전1·2·3년 사업연도)</p>
            <p className="text-[10px] text-amber-700/80">
              합병법인의 각 평가기준연도 사업연도별 주식수·순손익을 입력합니다. 순손익은 결손(음수) 허용.
            </p>
            {([0, 1, 2] as const).map((idx) => {
              const yr = context.acquirer[idx];
              return (
                <div
                  key={idx}
                  className="rounded border border-amber-200 bg-white/60 p-2.5 space-y-2"
                >
                  <p className="text-[11px] font-semibold text-amber-700">{YEAR_LABELS[idx]}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-600">사업연도 개시일 <span className="text-rose-600">*</span></p>
                      <div data-testid={`merger-acquirer-${idx}-start`}>
                        <DateInput
                          value={dateToStr(yr.startDate)}
                          onChange={(s) => {
                            const d = strToDate(s);
                            if (d) updateAcquirer(idx, { startDate: d });
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-600">사업연도 종료일 <span className="text-rose-600">*</span></p>
                      <div data-testid={`merger-acquirer-${idx}-end`}>
                        <DateInput
                          value={dateToStr(yr.endDate)}
                          onChange={(s) => {
                            const d = strToDate(s);
                            if (d) updateAcquirer(idx, { endDate: d });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldCard
                      label="발행주식수"
                      hint="해당 사업연도 종료일 현재 발행주식총수"
                      required
                    >
                      <CurrencyInput
                        label="발행주식수"
                        hideLabel
                        value={String(yr.shares || "")}
                        onChange={(v) => {
                          const n = parseInt(v.replace(/,/g, ""), 10) || 0;
                          updateAcquirer(idx, { shares: n });
                        }}
                        placeholder="주식수 입력 (주)"
                        data-testid={`merger-acquirer-${idx}-shares`}
                      />
                    </FieldCard>
                    <FieldCard
                      label="순손익액"
                      hint="합병법인 해당 사업연도 순손익액 (결손은 음수 입력)"
                      required
                    >
                      <CurrencyInput
                        label="순손익액"
                        hideLabel
                        value={String(yr.netIncome)}
                        onChange={(v) => updateAcquirer(idx, { netIncome: parseAmount(v) })}
                        placeholder="순손익액 입력 (결손 시 음수)"
                        allowNegative
                        data-testid={`merger-acquirer-${idx}-income`}
                      />
                    </FieldCard>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 피합병법인 사업연도 (가변 목록) */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-sky-800">피합병법인 사업연도 (해당분만)</p>
              <button
                type="button"
                onClick={addTarget}
                className="text-[11px] px-2 py-1 rounded border border-sky-300 bg-white hover:bg-sky-50 text-sky-700 font-medium"
                data-testid="merger-target-add"
              >
                + 사업연도 추가
              </button>
            </div>
            <p className="text-[10px] text-sky-700/80">
              피합병법인 중 합병법인의 각 평가연도와 겹치는 사업연도만 입력합니다.
              소멸·합병전 미존재 연도는 입력하지 않으면 합병법인 단독으로 계산됩니다.
            </p>

            {context.targetFiscalYears.length === 0 && (
              <p className="text-[11px] text-sky-600 italic">
                피합병법인 사업연도를 추가하면 합병법인 연도와의 겹침 개월수만큼 비례 합산합니다.
              </p>
            )}

            {context.targetFiscalYears.map((tyr, idx) => (
              <div
                key={idx}
                className="rounded border border-sky-200 bg-white/60 p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-sky-700">피합병 #{idx + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeTarget(idx)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700"
                    data-testid={`merger-target-${idx}-remove`}
                  >
                    삭제
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-600">사업연도 개시일 <span className="text-rose-600">*</span></p>
                    <div data-testid={`merger-target-${idx}-start`}>
                      <DateInput
                        value={dateToStr(tyr.startDate)}
                        onChange={(s) => {
                          const d = strToDate(s);
                          if (d) updateTarget(idx, { startDate: d });
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-600">사업연도 종료일 <span className="text-rose-600">*</span></p>
                    <div data-testid={`merger-target-${idx}-end`}>
                      <DateInput
                        value={dateToStr(tyr.endDate)}
                        onChange={(s) => {
                          const d = strToDate(s);
                          if (d) updateTarget(idx, { endDate: d });
                        }}
                      />
                    </div>
                  </div>
                </div>
                <FieldCard
                  label="피합병 순손익액"
                  hint="피합병법인 해당 사업연도 순손익액 (결손은 음수 입력)"
                  required
                >
                  <CurrencyInput
                    label="피합병 순손익액"
                    hideLabel
                    value={String(tyr.netIncome)}
                    onChange={(v) => updateTarget(idx, { netIncome: parseAmount(v) })}
                    placeholder="순손익액 입력 (결손 시 음수)"
                    allowNegative
                    data-testid={`merger-target-${idx}-income`}
                  />
                </FieldCard>
              </div>
            ))}
          </div>
        </div>
      </ToggleCard>
    </div>
  );
}
