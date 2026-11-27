"use client";

/**
 * ③ 2호 카드(증여자) — 증여자가 그 자산을 직접 양도한 것으로 보아 계산한 양도소득세 결정세액
 *
 * 계획서 §5.3 ③. 양도가액·양도일은 수증자의 양도와 같고, 취득일·취득가액·필요경비와 세대 사실은 증여자 기준이다(R-10).
 */
import Link from "next/link";
import { GIFT_RESALE_DONOR_CALC_HREF } from "@/lib/calc/gift-resale-101-2-donor-basis";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { GiftResaleHistoryPicker } from "./GiftResaleHistoryPicker";
import { amountToText, issueOf, textToAmount, type GiftResaleCardProps, type GiftResaleHistoryProps } from "./shared";

export function Clause2Card({ form, onPatch, issues, historySources, onPickHistory }: GiftResaleCardProps & GiftResaleHistoryProps) {
  return (
    <ToneCard
      tone="sky"
      sectionNum={3}
      title="2호 — 증여자"
      bodyClassName="space-y-3"
      titleExtra={
        <Link
          href={GIFT_RESALE_DONOR_CALC_HREF}
          data-testid="gr-donor-calc-link"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          양도세 계산기로
        </Link>
      }
    >
      <ToggleCard
        tone="sky"
        title="증여자에게 같은 해 다른 양도 있음"
        checked={form.donorHasOtherTransfersSameYear}
        onCheckedChange={(v) => onPatch({ donorHasOtherTransfersSameYear: v })}
        data-testid="gr-donor-other-transfers"
      />

      <FieldCard
        label="증여자 직접양도 결정세액"
        required
        unit="원"
        field="donorTransferDeterminedTax"
        hint="양도세 계산기에서 양도가액·양도일은 수증자의 양도와 같게, 취득일·취득가액·필요경비와 주택 수·거주 같은 세대 사실은 증여자 기준으로 계산한 결정세액(가산세 제외)"
        warning={issueOf(issues, "donorTransferDeterminedTax")}
      >
        <CurrencyInput
          label="증여자 직접양도 결정세액"
          hideLabel
          hideUnit
          value={amountToText(form.donorTransferDeterminedTax)}
          onChange={(v) => onPatch({ donorTransferDeterminedTax: textToAmount(v) })}
          data-testid="gr-donor-transfer-tax"
        />
        <GiftResaleHistoryPicker
          field="donorTransferDeterminedTax"
          modalTitle="증여자 직접양도 — 양도세 계산 이력 불러오기"
          testIdPrefix="gr-donor"
          historySources={historySources}
          onPickHistory={onPickHistory}
        />
      </FieldCard>
    </ToneCard>
  );
}
