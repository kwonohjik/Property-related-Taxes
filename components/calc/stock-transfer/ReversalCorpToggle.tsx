"use client";

/**
 * 영 §165④1호 괄호 — 2:3 대상 법인(자산총액 중 부동산등 50% 이상) 토글.
 *
 * 종전에는 라목 카드 안에만 있어 다목·일반 비상장·상장 후 환산에서 켤 수 없었다(S-1c-2).
 * 대상은 «법인 요건»이다 — 과점주주 양도 요건까지 볼 필요가 없다(계획서 §3 Q-2a).
 * 다목 카드의 부동산등 비율 ≥ 50% 또는 라목(80% ⊃ 50%)이면 같은 사실을 두 번 받지 않도록 켠 채 잠근다.
 * 판정은 엔진·⑧·⑫와 같은 leaf(`isSection165_4_1ReversalCorp`)다.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  reversalCorpDerivedBasisForm,
  type ReversalCorpFormFields,
} from "@/lib/calc/stock-transfer-section94-4-form";

const DERIVED_REASON = {
  ra_mok: "라목(부동산등 80% 이상) 법인이라 자동 적용됩니다",
  da_mok_ratio: "다목 카드의 부동산등 비율이 50% 이상이라 자동 적용됩니다",
} as const;

interface ReversalCorpToggleProps {
  form: ReversalCorpFormFields;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function ReversalCorpToggle({ form, onChange }: ReversalCorpToggleProps) {
  const derived = reversalCorpDerivedBasisForm(form);
  return (
    <ToggleCard
      data-testid="reversal-corp-toggle"
      tone="fuchsia"
      title="보충적 평가 가중치 반전 — 부동산등 비율 50% 이상 법인"
      description="자산총액 중 부동산등(법 §94①4 다목 1)·2))이 50% 이상인 법인 — 순손익가치 2/5 + 순자산가치 3/5 (영 §165④1호 괄호)"
      checked={derived !== undefined || form.isHeavyRealEstateForValuation}
      disabled={derived !== undefined}
      disabledReason={derived ? DERIVED_REASON[derived] : undefined}
      onCheckedChange={(v) => onChange({ isHeavyRealEstateForValuation: v })}
    />
  );
}
