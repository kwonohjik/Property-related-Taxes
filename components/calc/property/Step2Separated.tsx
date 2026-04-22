"use client";

import { SEPARATED_TYPE_OPTIONS, type FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step2Separated({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">분리과세 토지 유형</h2>
      <p className="text-sm text-muted-foreground">
        해당하는 분리과세 토지 유형을 선택하세요 (지방세법 시행령 §102).
      </p>

      <div className="space-y-2">
        {SEPARATED_TYPE_OPTIONS.map(({ value, label, rate, hint }) => (
          <label
            key={value}
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
          >
            <input
              type="radio"
              name="stSeparatedType"
              value={value}
              checked={form.stSeparatedType === value}
              onChange={() => onChange({ stSeparatedType: value })}
              className="mt-0.5 accent-primary"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <span className="text-xs font-medium text-muted-foreground">세율 {rate}</span>
              </div>
              {hint && <p className="text-xs text-amber-600">{hint}</p>}
            </div>
          </label>
        ))}
      </div>

      {/* 공장 입지 유형 (공장용지 선택 시) */}
      {form.stSeparatedType === "factory" && (
        <div className="space-y-2 rounded-lg border p-4 bg-muted/30">
          <label className="text-sm font-medium">공장 입지 유형</label>
          <div className="space-y-2">
            {(
              [
                ["industrial_zone", "산업단지·지정 공업지역 내"],
                ["urban", "도시지역 내 (기타)"],
                ["other", "도시지역 외"],
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="stFactoryLocation"
                  value={val}
                  checked={form.stFactoryLocation === val}
                  onChange={() => onChange({ stFactoryLocation: val })}
                  className="accent-primary"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
