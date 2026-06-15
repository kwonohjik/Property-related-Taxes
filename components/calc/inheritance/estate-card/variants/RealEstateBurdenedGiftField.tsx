"use client";

/**
 * RealEstateBurdenedGiftField — §47① 부담부증여 수증자 인수 채무액 (증여 모드 전용)
 *
 * EstateBodyRealEstate에서 분리 (800줄 정책). 법조문 링크 배지(§47①) 포함.
 */

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export interface RealEstateBurdenedGiftFieldProps {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}

export function RealEstateBurdenedGiftField({
  value,
  onChange,
}: RealEstateBurdenedGiftFieldProps) {
  return (
    <FieldCard
      label="수증자 인수 채무액 (§47①)"
      unit="원"
      badge={<LawArticleModal legalBasis="상증법 §47" label="§47①" />}
      hint="수증자가 실제로 인수한 채무액. 증여세 과세가액에서 차감됩니다 (상증법 §47①). §66 평가용 저당권·임대보증금과 별개 — 같은 금액을 양쪽에 입력해도 됩니다."
    >
      <CurrencyInput
        label="수증자 인수 채무액 (§47①)"
        value={value != null ? String(value) : ""}
        onChange={(v) => onChange(parseAmount(v) || undefined)}
        placeholder="없으면 빈칸"
        hideLabel
        hideUnit
      />
    </FieldCard>
  );
}
