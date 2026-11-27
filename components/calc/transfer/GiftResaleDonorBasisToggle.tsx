"use client";

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

/**
 * 양도세 계산기 첫 단계 — «증여자 직접양도 기준 계산» 표지 토글.
 *
 * 증여 후 우회양도 판정에 넣을 증여자 기준 결정세액을 계산할 때 켠다. 켜면 이력이 같은 물건의
 * 수증자 기준 계산과 따로 저장된다(`giftResaleDonorBasis` → 이력 키 `|101-2-donor`). 세액 불변.
 * 다건 편집 화면에서는 숨긴다 — 다건 신고서 키는 이 표지를 읽지 않는다.
 */
export function GiftResaleDonorBasisToggle({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <ToggleCard
      className="mb-4"
      tone="sky"
      checked={checked}
      onCheckedChange={onCheckedChange}
      title="증여 후 우회양도 판정용 — 증여자 직접양도 기준 계산"
      description="증여자가 직접 양도한 것으로 보아 계산할 때 켭니다. 같은 물건을 수증자 기준으로 계산한 이력을 덮어쓰지 않고 따로 저장합니다. 세액에는 영향이 없습니다."
      data-testid="gift-resale-donor-basis-toggle"
    />
  );
}
