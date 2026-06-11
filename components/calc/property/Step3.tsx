"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { FormState } from "./shared";

interface Props {
  form: FormState;
  onChange: (d: Partial<FormState>) => void;
}

export function Step3({ form, onChange }: Props) {
  // 주택: §122 단서로 세부담상한 미적용 — 전년도 세액 입력 불필요
  if (form.objectType === "housing") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">입력 확인</h2>
        <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 space-y-1">
          <p className="text-sm font-medium text-sky-900">
            주택은 세부담상한이 적용되지 않습니다 (지방세법 §122 단서)
          </p>
          <p className="text-xs text-muted-foreground">
            2024년부터 주택 세부담상한제가 폐지되어 전년도 납부세액 입력이
            필요하지 않습니다. 아래 &ldquo;재산세 계산하기&rdquo;를 눌러
            계산을 진행하세요.
          </p>
        </div>
      </div>
    );
  }

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
          세부담상한(지방세법 §122, 토지·건축물 150%) 적용을 위해 전년도
          납부세액을 입력하세요. 미입력 시 상한 없이 산출세액을 그대로
          적용합니다.
        </p>
      </div>
    </div>
  );
}
