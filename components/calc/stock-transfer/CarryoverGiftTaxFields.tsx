"use client";

/**
 * CarryoverGiftTaxFields — §97의2①3호 × 영 §163의2② **증여세 상당액 3칸 + 한도 안내** 공용 leaf
 *
 * `AcquisitionInfoBlock`(국내 주식 `carryover_gift` 카드)에서 **그대로 이동**했다 — 라벨·hint 불변.
 * 증여세는 원화이고 영 §163의2② 안분이 자산 종류와 무관해 국외주식도 같은 칸을 쓴다.
 *
 * 갈리는 것은 안내문 끝 한 문장뿐이다:
 *  - 국내: 「그때는 세율 보유기간도 수증일 기산으로 돌아갑니다」(§104②2호)
 *  - 국외: 단일세율(§104①12호)이라 이 문장이 **틀리므로** 뺀다(`showHoldingPeriodNote={false}`)
 *
 * 계획서: docs/02-design/features/foreign-stock-carryover-97-2.ui.plan.md §3.1
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

export type CarryoverGiftTaxForm = Pick<
  StockTransferFormData,
  "giftTaxAmount" | "transferredAssetValue" | "giftTaxableValue"
>;

interface CarryoverGiftTaxFieldsProps {
  form: CarryoverGiftTaxForm;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /** 「그때는 세율 보유기간도 수증일 기산으로 돌아갑니다」 문장 — 국내 true / 국외 false */
  showHoldingPeriodNote: boolean;
}

export function CarryoverGiftTaxFields({
  form,
  onChange,
  showHoldingPeriodNote,
}: CarryoverGiftTaxFieldsProps) {
  return (
    <>
      {/* ── §97의2①3호 × 영 §163의2② — 증여세 상당액 안분 ── */}
      <FieldCard
        label="증여세 산출세액 (§97의2①3호)"
        hint="아래 두 값으로 안분한 금액이 필요경비에 산입됩니다"
      >
        <CurrencyInput
          label=""
          hideLabel
          value={form.giftTaxAmount}
          onChange={(v) => onChange({ giftTaxAmount: v })}
        />
      </FieldCard>
      <FieldCard
        label="양도한 해당 자산가액 (영 §163의2②2호)"
        hint="증여세가 과세된 과세가액 중 이번에 양도한 부분 — 안분 분자"
      >
        <CurrencyInput
          label=""
          hideLabel
          value={form.transferredAssetValue}
          onChange={(v) => onChange({ transferredAssetValue: v })}
        />
      </FieldCard>
      <FieldCard
        label="증여세 과세가액 (영 §163의2②3호)"
        hint="「상속세 및 증여세법」 §47에 따른 과세가액 — 안분 분모"
      >
        <CurrencyInput
          label=""
          hideLabel
          value={form.giftTaxableValue}
          onChange={(v) => onChange({ giftTaxableValue: v })}
        />
      </FieldCard>
      <p className="text-xs text-amber-800 dark:text-amber-200">
        ⓘ 산입되는 증여세는 <strong>양도가액에서 취득가액·필요경비를 뺀 잔액</strong>을
        한도로 합니다 (<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="영 §163의2②" />).
        <br />
        ⓘ 이월과세를 적용한 결정세액이 적용하지 않은 것보다 <strong>적으면</strong> 적용하지
        않습니다 (<LawArticleModal legalBasis="소득세법 §97의2" label="§97의2②3호" />)
        {showHoldingPeriodNote ? " — 그때는 세율 보유기간도 수증일 기산으로 돌아갑니다." : "."}
      </p>
    </>
  );
}
