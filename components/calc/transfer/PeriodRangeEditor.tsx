"use client";

/**
 * 기간(시작~종료일) 다중 입력 공용 에디터 — 임대기간·거주기간(§155⑳) 공용.
 *
 * ToggleCard(direct↔interval) + 구간행(시작/종료 DateInput) + 추가/삭제 + 행별·합계 개월.
 * 법 badge·상속 문맥 문구 등은 **포함하지 않음** — 호출처가 외부에서 주입(문맥 오염 방지).
 * 개월 계산은 whole-month(diffMonthsClamped) 재사용. (ResidencePeriodSection 에디터 코어 일반화)
 */

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard, type ToggleCardTone } from "@/components/calc/inputs/ToggleCard";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { Plus, Trash2 } from "lucide-react";
import { diffMonthsClamped } from "@/lib/stores/calc-wizard-asset-residence";

export interface PeriodRow {
  start: string;
  end: string;
}

/** 개월 → "N년 M개월" 표기 */
export function fmtPeriodMonths(months: number): string {
  if (months <= 0) return "0개월";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}년 ${m}개월` : `${m}개월`;
}

export interface PeriodRangeEditorProps {
  tone: ToggleCardTone;
  /** ON(interval) 토글 제목 */
  toggleTitle: string;
  startLabel: string;
  endLabel: string;
  endHint?: string;
  /** 구간 카드 헤더 라벨 (예: "임대 구간"/"거주 구간") */
  rowLabel: string;
  /** 합계 라벨 (예: "합계 임대기간") */
  totalLabel: string;
  directLabel: string;
  directHint?: string;
  inputMode: "interval" | "direct";
  periods: PeriodRow[];
  directValue: string;
  /** E2E 셀렉터 prefix (예: "rental-period"/"residence-period") */
  testidPrefix: string;
  onChange: (patch: {
    inputMode?: "interval" | "direct";
    periods?: PeriodRow[];
    directValue?: string;
  }) => void;
}

export function PeriodRangeEditor({
  tone,
  toggleTitle,
  startLabel,
  endLabel,
  endHint,
  rowLabel,
  totalLabel,
  directLabel,
  directHint,
  inputMode,
  periods,
  directValue,
  testidPrefix,
  onChange,
}: PeriodRangeEditorProps) {
  const isInterval = inputMode === "interval";
  const totalMonths = isInterval
    ? periods.reduce((s, p) => s + diffMonthsClamped(p.start, p.end), 0)
    : parseInt(directValue) || 0;

  const toneText =
    tone === "emerald" ? "text-emerald-700" : tone === "violet" ? "text-violet-700" : "text-sky-700";
  const toneBorder =
    tone === "emerald" ? "border-emerald-200" : tone === "violet" ? "border-violet-200" : "border-sky-200";
  const toneBox =
    tone === "emerald"
      ? "bg-emerald-100/60 border-emerald-200 text-emerald-900"
      : tone === "violet"
        ? "bg-violet-100/60 border-violet-200 text-violet-900"
        : "bg-sky-100/60 border-sky-200 text-sky-900";
  const toneAdd =
    tone === "emerald"
      ? "border-emerald-300 bg-emerald-50/40 text-emerald-800 hover:bg-emerald-100/60"
      : tone === "violet"
        ? "border-violet-300 bg-violet-50/40 text-violet-800 hover:bg-violet-100/60"
        : "border-sky-300 bg-sky-50/40 text-sky-800 hover:bg-sky-100/60";

  function setPeriod(idx: number, patch: Partial<PeriodRow>) {
    onChange({ periods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  }
  function addPeriod() {
    onChange({ periods: [...periods, { start: "", end: "" }] });
  }
  function removePeriod(idx: number) {
    onChange({ periods: periods.filter((_, i) => i !== idx) });
  }

  return (
    <div data-testid={`${testidPrefix}-mode`}>
    <ToggleCard
      variant="card"
      tone={tone}
      title={toggleTitle}
      checked={isInterval}
      onCheckedChange={(v) => {
        // interval 진입 시 구간 0개면 1개 즉시 표시 (추가 클릭 없이 입력 가능)
        if (v && periods.length === 0) {
          onChange({ inputMode: "interval", periods: [{ start: "", end: "" }] });
        } else {
          onChange({ inputMode: v ? "interval" : "direct" });
        }
      }}
    >
      {isInterval && (
        <div className="space-y-2">
          {periods.length === 0 && (
            <p className={`text-xs ${toneText}`}>
              구간이 없습니다. &ldquo;+ 구간 추가&rdquo; 로 첫 {startLabel}·{endLabel}을 입력하세요.
            </p>
          )}
          {periods.map((p, idx) => {
            const m = diffMonthsClamped(p.start, p.end);
            const isStartOnly = !!p.start && !p.end;
            return (
              <div key={idx} className={`rounded-md border ${toneBorder} bg-white p-3 space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${toneText}`}>
                    {rowLabel} #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePeriod(idx)}
                    data-testid={`${testidPrefix}-remove-${idx}`}
                    className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    삭제
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <FieldCard label={startLabel}>
                    <DateInput
                      data-testid={`${testidPrefix}-start-${idx}`}
                      value={p.start}
                      onChange={(v) => setPeriod(idx, { start: v })}
                    />
                  </FieldCard>
                  <FieldCard label={endLabel} required hint={endHint}>
                    <DateInput
                      data-testid={`${testidPrefix}-end-${idx}`}
                      value={p.end}
                      onChange={(v) => setPeriod(idx, { end: v })}
                    />
                  </FieldCard>
                </div>
                {isStartOnly && (
                  <p className="text-caption text-rose-600">
                    {startLabel}이 입력되었는데 {endLabel}이 비어 있습니다. {endLabel}을 입력하세요.
                  </p>
                )}
                <p className={`text-caption ${toneText}`}>
                  이 구간: {fmtPeriodMonths(m)}
                </p>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addPeriod}
            data-testid={`${testidPrefix}-add`}
            className={`w-full rounded-md border border-dashed ${toneAdd} px-3 py-2 text-xs font-medium inline-flex items-center justify-center gap-1`}
          >
            <Plus className="h-3 w-3" />
            구간 추가
          </button>
          <div
            className={`rounded-md border ${toneBox} px-3 py-2 text-xs`}
            data-testid={`${testidPrefix}-total`}
          >
            {totalLabel}: <strong>{fmtPeriodMonths(totalMonths)}</strong> ({totalMonths}개월)
          </div>
        </div>
      )}
      {!isInterval && (
        <FieldCard label={directLabel} hint={directHint}>
          <div className="flex items-center gap-2">
            <div className="w-32">
              <DecimalInput
                data-testid={`${testidPrefix}-direct`}
                value={directValue}
                onChange={(v) => onChange({ directValue: v })}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              ({fmtPeriodMonths(parseInt(directValue) || 0)})
            </span>
          </div>
        </FieldCard>
      )}
    </ToggleCard>
    </div>
  );
}
