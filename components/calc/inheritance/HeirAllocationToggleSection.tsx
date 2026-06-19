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
  // [UX3-AC1] 평가액 0이어도 토글 활성 — canDistribute만 차단.
  // 사용자가 평가액 입력 전에 협의분할 패널을 펼쳐 분배 대상을 미리 선택할 수 있도록 함.
  // 합계 ≠ 평가액 검증은 HeirAllocationInput 내부 배지가 담당.
  const canDistribute = hasDistributableHeir(heirs);
  const isDisabled = !canDistribute;
  const disabledReason = "Step 0에서 상속인·수유자(자연인)를 먼저 등록하세요";

  return (
    <ToggleCard
      lawLinks="상증법"
      tone="violet"
      title="협의분할 직접 입력"
      description="법정상속분(민법 §1009) 대신 상속인·수유자에게 직접 분배(민법 §1013·§1073) · 영리법인 제외"
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
        heading={null}
        flush
      />
    </ToggleCard>
  );
}
