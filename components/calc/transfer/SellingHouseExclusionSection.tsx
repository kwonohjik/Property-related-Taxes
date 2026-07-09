"use client";

/**
 * SellingHouseExclusionSection — 양도(selling) 주택 3주택+ 전용 중과배제 특례
 *
 * 소령 §167의10 — 양도 주택 자체가 배제 항목(저당권 실행·사원주택·조특 특례·문화재·어린이집)에 해당.
 * 엔진은 effectiveHouseCount>=3 에서 sellingHouse.* 플래그로 평가(helpers:672-725).
 * 양도 주택을 기술하므로 폼-전역(form.sellingHouseExclusion).
 *
 * 정책: ToggleCard/DecimalInput 전용 · OFF 시 onChange 직접 patch(useEffect 미러링 금지).
 */

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type SellingExclusion = NonNullable<TransferFormData["sellingHouseExclusion"]>;

interface Props {
  value: SellingExclusion | undefined;
  onChange: (v: SellingExclusion | undefined) => void;
}

export function SellingHouseExclusionSection({ value, onChange }: Props) {
  const v = value ?? {};
  function patch(partial: Partial<SellingExclusion>) {
    onChange({ ...v, ...partial });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-amber-700">양도 주택 중과배제 특례 (3주택 이상 시)</p>
      <p className="text-caption text-muted-foreground/80">
        양도하는 주택 자체가 아래 사유에 해당하면 3주택 이상이어도 중과 배제됩니다 (소령 §167의10).
      </p>

      {/* 저당권 실행 취득 (취득 후 3년 이내) */}
      <ToggleCard
        variant="chip"
        tone="amber"
        checked={v.isMortgageExecution ?? false}
        onCheckedChange={(b) => patch({ isMortgageExecution: b })}
        title="저당권 실행·채권변제 취득 (3년 이내)"
      />

      {/* 사원용 주택 (10년 이상 무상제공) */}
      <ToggleCard
        variant="card"
        tone="amber"
        checked={v.isEmployeeHousing ?? false}
        onCheckedChange={(b) => patch({ isEmployeeHousing: b, freeProvisionYears: b ? v.freeProvisionYears : undefined })}
        title="사원용 주택"
        description="종업원에게 10년 이상 무상 제공"
      >
        <div className="space-y-1 pt-1">
          <label className="block text-caption text-muted-foreground font-medium">무상 제공 기간 (년)</label>
          <DecimalInput
            value={v.freeProvisionYears ?? ""}
            onChange={(s) => patch({ freeProvisionYears: s || undefined })}
            placeholder="무상 제공 기간"
          />
          <p className="text-caption text-muted-foreground/70">10년 이상이어야 배제 적용</p>
        </div>
      </ToggleCard>

      {/* 조특법 특례 주택 */}
      <ToggleCard
        variant="chip"
        tone="amber"
        checked={v.isTaxSpecialExemption ?? false}
        onCheckedChange={(b) => patch({ isTaxSpecialExemption: b })}
        title="조세특례제한법 특례 적용 주택"
      />

      {/* 문화재 주택 */}
      <ToggleCard
        variant="chip"
        tone="amber"
        checked={v.isCulturalHeritage ?? false}
        onCheckedChange={(b) => patch({ isCulturalHeritage: b })}
        title="국가유산(문화재) 주택"
      />

      {/* 어린이집 (5년 이상 운영) */}
      <ToggleCard
        variant="card"
        tone="amber"
        checked={v.isDayCareCenter ?? false}
        onCheckedChange={(b) => patch({ isDayCareCenter: b, dayCareOperationYears: b ? v.dayCareOperationYears : undefined })}
        title="어린이집 운영 주택"
        description="5년 이상 어린이집으로 운영"
      >
        <div className="space-y-1 pt-1">
          <label className="block text-caption text-muted-foreground font-medium">운영 기간 (년)</label>
          <DecimalInput
            value={v.dayCareOperationYears ?? ""}
            onChange={(s) => patch({ dayCareOperationYears: s || undefined })}
            placeholder="운영 기간"
          />
          <p className="text-caption text-muted-foreground/70">5년 이상이어야 배제 적용</p>
        </div>
      </ToggleCard>
    </div>
  );
}
