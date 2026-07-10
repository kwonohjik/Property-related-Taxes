"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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
    <ToneCard
      tone="violet"
      sectionNum={sectionNum}
      title="거주 기간 입력"
      titleExtra={
        <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-micro font-medium text-violet-700">
          1세대1주택 비과세·표2 공제 판정에 사용
        </span>
      }
      noDark
    >

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
    </ToneCard>
  );
}
