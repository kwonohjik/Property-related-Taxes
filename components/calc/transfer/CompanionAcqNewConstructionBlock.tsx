"use client";

/**
 * 동반자산 신축(자가건축) 취득 입력 블록
 *
 * 자기가 건축한 건축물의 취득가액 = 신축에 든 실제 비용
 * (건축비·재료비·노무비 등 자본적 지출 합계).
 *
 * [영 §163①·소득세법 §97①1호]
 *   취득가액은 "취득에 든 실지거래가액". 자가건축의 경우 신축비용 총액이
 *   취득가액으로 인정된다. 토지 취득가액과 별개의 자산 항목으로 입력.
 *
 * 취득일자는 NewConstructionDateBlock(영 §162①4호 4-시점)에서 별도 입력.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";

interface BlockProps {
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
}

export function CompanionAcqNewConstructionBlock(props: BlockProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <CurrencyInput
        label="신축 비용 (취득가액)"
        value={props.fixedAcquisitionPrice}
        onChange={props.onFixedAcquisitionPriceChange}
        required
        hint="자기가 신축한 건축물의 실제 신축비용 총액 (건축비·재료비·노무비 등). 토지 취득가액은 별도 자산으로 입력"
      />
    </div>
  );
}
