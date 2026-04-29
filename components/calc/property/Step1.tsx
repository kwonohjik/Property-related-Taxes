"use client";

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

const LAND_TAX_TYPE_OPTIONS = [
  {
    value: "comprehensive_aggregate" as const,
    label: "종합합산과세대상",
    description: "나대지·잡종지 등 (0.2~0.5% 누진)",
  },
  {
    value: "separate_aggregate" as const,
    label: "별도합산과세대상",
    description: "영업용 건축물 부속토지 등 (0.2~0.4% 누진)",
  },
  {
    value: "separated" as const,
    label: "분리과세대상",
    description: "농지·골프장 등 (0.07%~4% 단일)",
  },
];

export function Step1({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">토지 과세 유형</h2>
      <p className="text-sm text-muted-foreground">
        보유 토지의 과세 유형을 선택하세요 (지방세법 §106).
      </p>
      <RadioCardGroup
        name="landTaxType"
        tone="sky"
        layout="stack"
        options={LAND_TAX_TYPE_OPTIONS}
        value={form.landTaxType}
        onChange={(v) => onChange({ landTaxType: v })}
      />
    </div>
  );
}
