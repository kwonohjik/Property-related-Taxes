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
import { isRealEstateCategory } from "@/components/calc/results/source-summary/source-summary-constants";
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
  /**
   * 🔴 IG-111: `showAreaInput`을 true로 넘기는 호출부가 저장소에 하나도 없어, 분배 면적(㎡)을
   * 입력할 UI 경로 자체가 없었다. 그 결과 별지 제9호 부표2 「수량·면적」의 `alloc.areaM2`
   * fallback(`besshi-buppyo-2-data`)과 소스요약의 Σ fallback(`source-summary-helpers`)이
   * 영구히 사문화돼 있었다 — 「공장부지 1물건을 배우자 2,500㎡ + 차남 1,500㎡로 분할」이
   * 이 컴포넌트 헤더가 지원 목적으로 명시한 케이스인데도 그렇다.
   *
   * 두 소비처 모두 `item.areaSqm`이 **우선**이고 `areaM2`는 그것이 없을 때의 갈래다.
   * ⇒ 부동산 카테고리이면서 자산 면적이 비어 있을 때만 연다(그 밖에는 결과에 닿지 않는 칸이 된다).
   */
  const showAreaInput =
    isRealEstateCategory(item.category) && !(item.areaSqm && item.areaSqm > 0);
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
        showAreaInput={showAreaInput}
        flush
      />
    </ToggleCard>
  );
}
