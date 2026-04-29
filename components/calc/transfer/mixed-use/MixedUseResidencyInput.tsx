"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  sectionNum?: number;
}

/** 거주기간 입력 + 장기보유공제 표1/표2 자동 안내 */
export function MixedUseResidencyInput({ asset, onChange, sectionNum }: Props) {
  const years = parseDecimal(asset.mixedUseResidencePeriodYears);
  const useTable2 = years >= 2;
  const hasValue = years > 0;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-violet-700">거주 정보</p>
      </div>

      <FieldCard
        label="거주기간 (년)"
        hint="2년 이상 시 장기보유공제 표2 적용 (보유 40%+거주 40%, 최대 80%)"
      >
        <DecimalInput
          value={asset.mixedUseResidencePeriodYears}
          onChange={(v) => onChange({ mixedUseResidencePeriodYears: v })}
          placeholder="거주 연수"
          unit="년"
        />
      </FieldCard>

      {hasValue && (
        <div
          className={`px-3 py-2 rounded-lg text-sm font-medium ${
            useTable2
              ? "bg-green-100/80 text-green-800 border border-green-200"
              : "bg-amber-100/80 text-amber-800 border border-amber-200"
          }`}
        >
          {useTable2
            ? "표2 적용 — 보유연수×4% + 거주연수×4% (최대 80%)"
            : "표1 적용 — 보유연수×2% (최대 30%, 거주 2년 미만)"}
        </div>
      )}
    </div>
  );
}
