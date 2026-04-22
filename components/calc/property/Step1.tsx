"use client";

import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step1({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">토지 과세 유형</h2>
      <p className="text-sm text-muted-foreground">
        보유 토지의 과세 유형을 선택하세요 (지방세법 §106).
      </p>
      <div className="space-y-2">
        {(
          [
            {
              value: "comprehensive_aggregate",
              label: "종합합산과세대상",
              desc: "나대지·잡종지 등 (0.2~0.5% 누진)",
            },
            {
              value: "separate_aggregate",
              label: "별도합산과세대상",
              desc: "영업용 건축물 부속토지 등 (0.2~0.4% 누진)",
            },
            {
              value: "separated",
              label: "분리과세대상",
              desc: "농지·골프장 등 (0.07%~4% 단일)",
            },
          ] as const
        ).map(({ value, label, desc }) => (
          <label
            key={value}
            className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-accent/50"
          >
            <input
              type="radio"
              name="landTaxType"
              value={value}
              checked={form.landTaxType === value}
              onChange={() => onChange({ landTaxType: value })}
              className="mt-0.5 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
