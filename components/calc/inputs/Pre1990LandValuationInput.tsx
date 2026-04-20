"use client";

/**
 * Pre1990LandValuationInput — 1990.8.30. 이전 취득 토지 기준시가 환산 입력 UI
 *
 * 진입 조건: propertyType === "land" + acquisitionDate < 1990-08-30
 * (상위에서 `pre1990Enabled` 토글로 제어)
 */

import { CurrencyInput } from "./CurrencyInput";
import { getGradeValue } from "@/lib/tax-engine/data/land-grade-values";

export interface Pre1990FormSlice {
  pre1990Enabled: boolean;
  pre1990AreaSqm: string;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";
}

interface Props {
  form: Pre1990FormSlice;
  onChange: (patch: Partial<Pre1990FormSlice>) => void;
}

/** 등급 입력을 파싱해 등급가액을 반환. 실패 시 null. */
function tryResolveGrade(mode: "number" | "value", input: string): { value: number; note: string } | null {
  const n = Number(input.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (mode === "number") {
    try {
      return { value: getGradeValue(Math.trunc(n)), note: `등급 ${Math.trunc(n)} → 등급가액 ${getGradeValue(Math.trunc(n)).toLocaleString()}` };
    } catch {
      return null;
    }
  }
  return { value: n, note: `등급가액 직접 입력: ${n.toLocaleString()}` };
}

export function Pre1990LandValuationInput({ form, onChange }: Props) {
  const mode = form.pre1990GradeMode;

  const previews = {
    current: tryResolveGrade(mode, form.pre1990Grade_current),
    prev:    tryResolveGrade(mode, form.pre1990Grade_prev),
    atAcq:   tryResolveGrade(mode, form.pre1990Grade_atAcq),
  };

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
      <div>
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          1990.8.30. 이전 취득 토지 기준시가 환산
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          개별공시지가 고시(1990.8.30.) 이전 취득한 토지는 토지등급가액표를 이용해
          취득 당시 기준시가를 환산합니다. (소득세법 시행규칙 §80⑥·집행기준 97-176의2)
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.pre1990Enabled}
          onChange={(e) => onChange({ pre1990Enabled: e.target.checked })}
          className="h-4 w-4 accent-amber-600"
        />
        <span className="font-medium">환산 기능 사용</span>
      </label>

      {!form.pre1990Enabled ? null : (
        <div className="space-y-4">
          {/* 면적 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">면적 (㎡) <span className="text-destructive">*</span></label>
            <CurrencyInput
              label=""
              value={form.pre1990AreaSqm}
              onChange={(v) => onChange({ pre1990AreaSqm: v })}
              placeholder="예: 2417"
            />
          </div>

          {/* 개별공시지가 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">1990.1.1. 개별공시지가 (원/㎡) <span className="text-destructive">*</span></label>
              <CurrencyInput
                label=""
                value={form.pre1990PricePerSqm_1990}
                onChange={(v) => onChange({ pre1990PricePerSqm_1990: v })}
                placeholder="예: 54000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">양도당시 개별공시지가 (원/㎡) <span className="text-destructive">*</span></label>
              <CurrencyInput
                label=""
                value={form.pre1990PricePerSqm_atTransfer}
                onChange={(v) => onChange({ pre1990PricePerSqm_atTransfer: v })}
                placeholder="예: 241700"
              />
              <p className="text-[11px] text-muted-foreground">
                ※ 양도일이 5월 31일 이전이면 전년도 공시지가를 사용합니다.
              </p>
            </div>
          </div>

          {/* 등급 입력 모드 토글 */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">토지등급 입력 방식</p>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="pre1990GradeMode"
                  checked={mode === "number"}
                  onChange={() => onChange({ pre1990GradeMode: "number" })}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>등급번호 (1~365)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="pre1990GradeMode"
                  checked={mode === "value"}
                  onChange={() => onChange({ pre1990GradeMode: "value" })}
                  className="h-4 w-4 accent-amber-600"
                />
                <span>등급가액 직접 입력</span>
              </label>
            </div>
          </div>

          {/* 3개 등급 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <GradeField
              label="1990.8.30. 현재 등급"
              value={form.pre1990Grade_current}
              onChange={(v) => onChange({ pre1990Grade_current: v })}
              preview={previews.current}
            />
            <GradeField
              label="1990.8.30. 직전 등급"
              value={form.pre1990Grade_prev}
              onChange={(v) => onChange({ pre1990Grade_prev: v })}
              preview={previews.prev}
            />
            <GradeField
              label="취득시 유효 등급"
              value={form.pre1990Grade_atAcq}
              onChange={(v) => onChange({ pre1990Grade_atAcq: v })}
              preview={previews.atAcq}
            />
          </div>

          <p className="text-[11px] text-muted-foreground">
            ※ 토지대장 및 부동산공시가격 알리미(realtyprice.kr)에서 조회 가능합니다.
            1990.1.1. 등급조정이 없었다면 직전 등급은 현재 등급과 동일하게 입력하세요.
          </p>
        </div>
      )}
    </div>
  );
}

function GradeField({
  label,
  value,
  onChange,
  preview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  preview: { value: number; note: string } | null;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label} <span className="text-destructive">*</span></label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        placeholder="예: 103"
      />
      {value && !preview && (
        <p className="text-[11px] text-destructive">등급 범위 밖이거나 올바르지 않은 값입니다.</p>
      )}
      {preview && (
        <p className="text-[11px] text-muted-foreground">{preview.note}</p>
      )}
    </div>
  );
}
