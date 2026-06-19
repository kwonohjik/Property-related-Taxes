"use client";

/**
 * 물납 입력 섹션 (상속세 마법사 Step4 끝, 상증법 §73)
 *
 * 결정세액 미영향 납부방법 투영. 결과 화면에서 calcPaymentInKindAssessment로
 * 요건 충족·허용한도·충당순서를 계산·표시한다. 연부연납과 병행 가능(독립 토글).
 * 자동 집계(부동산·주식·금융)는 평가액(result)이 필요하므로 결과 카드에서 표시.
 * 설계: docs/02-design/features/inheritance-payment-in-kind.ui.design.md §2
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import type { FormState, FormSet } from "./shared";

export function PaymentInKindInputSection({
  form,
  set,
}: {
  form: FormState;
  set: FormSet;
}) {
  return (
    <ToggleCard
      lawLinks="상증법"
      tone="sky"
      title="물납 신청 (상증법 §73)"
      description="부동산·유가증권이 상속재산의 1/2 초과 + 납부세액 2천만원 초과 + 납부세액이 금융재산 초과 시 신청 가능. 결과 화면에 요건 충족·허용한도·충당순서가 표시됩니다."
      checked={form.paymentInKindEnabled}
      onCheckedChange={(v) => set({ paymentInKindEnabled: v })}
    >
      <div className="space-y-3 pt-1">
        <FieldCard
          label="관리·처분 부적당 제외액"
          hint="저당권 등 설정 부동산, 폐업·결손 법인 유가증권 등 물납이 제한되는 재산 가액(상증령 §71·§73③). 비워두면 0."
        >
          <CurrencyInput
            label="관리·처분 부적당 제외액"
            hideLabel
            value={form.paymentInKindIneligibleAmount}
            onChange={(v) => set({ paymentInKindIneligibleAmount: v })}
          />
        </FieldCard>
        <FieldCard
          label="희망 물납액"
          hint="비워두면 결과 화면에서 허용한도로 안내합니다. 별지 제9호서식 물납란 = min(희망액, 허용한도)."
        >
          <CurrencyInput
            label="희망 물납액"
            hideLabel
            value={form.paymentInKindRequestedAmount}
            onChange={(v) => set({ paymentInKindRequestedAmount: v })}
          />
        </FieldCard>
      </div>
    </ToggleCard>
  );
}
