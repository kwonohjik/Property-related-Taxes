"use client";

/**
 * §97의3 — 자동말소 아파트 매입임대 8년 등록·임대 간주 토글 (구 조특령 §97의3②2호)
 *
 * 계획서 docs/01-plan/features/rental-97-3-auto-cancel-deemed-8y.plan.md (Q-1 a · Q-2 · Q-6).
 * 공용 종료 칸(「임대 종료일 또는 등록 말소일」) 바로 아래에 둔다 — 그 날짜가 말소일이다.
 * 「아파트 매입임대」는 문구에 담는다(민특법 §6⑤ 자동말소는 장기일반 중 아파트 매입임대만 해당 — 별도 질문 없음).
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function Rental973AutoCancelToggle({ checked, onChange }: Props) {
  return (
    <ToggleCard
      data-field="reduction.rental_97_3.autoCancelled973"
      checked={checked}
      onCheckedChange={onChange}
      title="아파트 매입임대 — 임대의무기간 종료로 자동말소 (민특법 §6⑤)"
      description="종전 장기일반(준공공) 아파트 매입임대가 의무기간 종료로 등록이 자동말소됐으면 켜세요. 위 날짜에는 말소일을 넣습니다."
      tone="violet"
    >
      <p className="text-micro text-muted-foreground" data-testid="rental973-auto-cancel-hint">
        8년 동안 등록·임대한 것으로 보아 장기보유특별공제 50%를 적용합니다 — 공실이나 단기 임대기간 산입 비율로 실제 기간이 8년에
        못 미쳐도 같고, 10년이 넘어도 70%는 적용하지 않습니다(구 조특령 §97의3②2호 · 기준-2024-법규재산-0079 ·
        서면-2020-법령해석재산-3286). 2020.8.18. 이후 말소분에 적용하며, 그 전에 의무기간이 끝난 주택은 2020.8.18.에 말소된
        것으로 봅니다. 임대사업자가 신청한 자진말소는 해당하지 않습니다.
      </p>
    </ToggleCard>
  );
}
