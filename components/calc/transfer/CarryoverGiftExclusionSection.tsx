"use client";

/**
 * 이월과세 적용배제 선언 섹션 (§97조의2 ② 각호, ④항)
 * CarryoverGiftBlock에서 분리 — 800줄 정책 준수.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

interface Props {
  exclusionDeclared: CarryoverTaxationForm["exclusionDeclared"];
  onChange: (patch: Partial<CarryoverTaxationForm["exclusionDeclared"]>) => void;
}

export function CarryoverGiftExclusionSection({ exclusionDeclared, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-rose-700">이월과세 적용배제 선언 (해당 시 선택)</p>

      <ToggleCard
        tone="rose"
        title="§97조의2 ② 1호 — 협의매수·수용"
        description="사업인정고시일 2년 이전에 증여받은 토지·건물이 협의매수 또는 수용된 경우"
        checked={exclusionDeclared.expropriationWithin2Years}
        onCheckedChange={(v) => onChange({ expropriationWithin2Years: v })}
      />

      <ToggleCard
        tone="rose"
        title="§97조의2 ② 2호 — 1세대1주택 비과세 해당 (고가주택 포함)"
        description="이월과세를 적용할 경우 1세대1주택 비과세에 해당하는 경우 (12억 초과 고가주택 포함)"
        checked={exclusionDeclared.oneHouseExemptionApplies}
        onCheckedChange={(v) => onChange({ oneHouseExemptionApplies: v })}
      />

      <ToggleCard
        tone="rose"
        title="§97조의2 ④ — 가업상속공제 적용 자산"
        description="가업상속공제를 적용받은 자산 — 선택 시 계산이 차단됩니다 (현재 버전 미지원)"
        checked={exclusionDeclared.isFamilyBusinessInheritedAsset}
        onCheckedChange={(v) => onChange({ isFamilyBusinessInheritedAsset: v })}
      />
    </div>
  );
}
