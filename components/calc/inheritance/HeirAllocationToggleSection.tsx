"use client";

/**
 * HeirAllocationToggleSection — 자산 카드 협의분할 토글 + HeirAllocationInput 래퍼
 *
 * PropertyValuationForm·StockValuationForm의 ItemEditor 최하단에 노출.
 * mode === "inheritance"이고 heirs 있을 때만 호출.
 *
 * 정책:
 *   - corporate 제외 자연인 1명 이상 필요 (hasDistributableHeir)
 *   - 평가액 0이면 disabled
 *   - 토글 ON 시 첫 자연인 상속인에게 전액 자동 채움
 *   - 합계 검증은 HeirAllocationInput 내부에서 rose 경고
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  HeirAllocationInput,
  hasDistributableHeir,
  buildInitialHeirAllocations,
} from "./HeirAllocationInput";
import type {
  EstateItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";

interface HeirAllocationToggleSectionProps {
  item: EstateItem;
  heirs: Heir[];
  effectiveValuation: number;
  onChange: (patch: Partial<EstateItem>) => void;
}

export function HeirAllocationToggleSection({
  item,
  heirs,
  effectiveValuation,
  onChange,
}: HeirAllocationToggleSectionProps) {
  const canDistribute = hasDistributableHeir(heirs);
  const isDisabled = !canDistribute || effectiveValuation === 0;
  const disabledReason = !canDistribute
    ? "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요"
    : "평가액을 먼저 입력하세요";

  return (
    <ToggleCard
      tone="violet"
      title="상속인·수유자별 협의분할 입력"
      description="OFF: 법정상속분(민법 §1009)으로 자동 안분 / ON: 상속인·수유자에게 직접 분배 (민법 §1013·§1073). 영리법인은 협의분할 대상이 아닙니다."
      disabled={isDisabled}
      disabledReason={disabledReason}
      checked={!!item.heirAllocations}
      onCheckedChange={(on) => {
        if (on) {
          onChange({
            heirAllocations: buildInitialHeirAllocations(heirs, effectiveValuation),
          });
        } else {
          onChange({ heirAllocations: undefined });
        }
      }}
    >
      <HeirAllocationInput
        allocations={item.heirAllocations}
        expectedTotal={effectiveValuation}
        heirs={heirs}
        onChange={(allocs) => onChange({ heirAllocations: allocs })}
      />
    </ToggleCard>
  );
}
