"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step3({ form, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">전년도 납부세액 (선택)</h2>
      <div className="space-y-1">
        <label className="text-sm font-medium">전년도 재산세 납부액 (원)</label>
        <CurrencyInput
          label="전년도 재산세 납부액"
          value={form.previousYearTax}
          onChange={(v) => onChange({ previousYearTax: v })}
          placeholder="미입력 시 세부담상한 미적용"
        />
        <p className="text-xs text-muted-foreground">
          세부담상한(지방세법 §122) 적용을 위해 전년도 납부세액을 입력하세요.
          미입력 시 상한 없이 산출세액을 그대로 적용합니다.
        </p>
      </div>
    </div>
  );
}
