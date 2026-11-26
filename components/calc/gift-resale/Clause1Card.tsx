"use client";

/**
 * ② 1호 카드(수증자) — 증여세(산출세액 − 공제·감면세액) + 수증자 양도소득세 결정세액
 *
 * 계획서 §5.3 ②. 증여세에 다른 증여재산이 들어 있으면 «이 자산 몫»을 사용자가 넣는다 —
 * 몫을 나누는 방법은 법에 명문이 없어 자동 안분하지 않고(Q-9) 확인 필요로 고지한다.
 */
import Link from "next/link";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { GIFT_RESALE_SHARE_HINT } from "@/lib/calc/gift-resale-101-2-labels";
import { GiftResaleHistoryPicker } from "./GiftResaleHistoryPicker";
import { amountToText, issueOf, textToAmount, type GiftResaleCardProps, type GiftResaleHistoryProps } from "./shared";

export function Clause1Card({ form, onPatch, issues, historySources, onPickHistory }: GiftResaleCardProps & GiftResaleHistoryProps) {
  const share = form.giftTaxIncludesOtherAssets ? " (이 자산 몫)" : "";
  const shareHint = form.giftTaxIncludesOtherAssets ? GIFT_RESALE_SHARE_HINT : undefined;
  return (
    <ToneCard
      tone="amber"
      sectionNum={2}
      title="1호 — 수증자(증여받은 자)"
      bodyClassName="space-y-3"
      titleExtra={
        <Link
          href="/calc/transfer-tax?new=1"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          양도세 계산기로
        </Link>
      }
    >
      <ToggleCard
        tone="amber"
        title="이 증여세에 다른 증여재산(같은 날 함께 증여·10년 합산분)이 포함됨"
        checked={form.giftTaxIncludesOtherAssets}
        onCheckedChange={(v) => onPatch({ giftTaxIncludesOtherAssets: v })}
        data-testid="gr-gift-includes-others"
      />

      <FieldCard
        label={`증여세 산출세액${share}`}
        required
        unit="원"
        field="giftTaxCalculated"
        hint={shareHint}
        warning={issueOf(issues, "giftTaxCalculated")}
      >
        <CurrencyInput
          label={`증여세 산출세액${share}`}
          hideLabel
          hideUnit
          value={amountToText(form.giftTaxCalculated)}
          onChange={(v) => onPatch({ giftTaxCalculated: textToAmount(v) })}
          data-testid="gr-gift-tax-calculated"
        />
      </FieldCard>

      <FieldCard
        label={`증여세 공제·감면세액 (신고세액공제 포함)${share}`}
        required
        unit="원"
        field="giftTaxCreditsAndReductions"
        hint={shareHint}
        warning={issueOf(issues, "giftTaxCreditsAndReductions")}
      >
        <CurrencyInput
          label={`증여세 공제·감면세액 (신고세액공제 포함)${share}`}
          hideLabel
          hideUnit
          value={amountToText(form.giftTaxCreditsAndReductions)}
          onChange={(v) => onPatch({ giftTaxCreditsAndReductions: textToAmount(v) })}
          data-testid="gr-gift-tax-credits"
        />
      </FieldCard>

      <ToggleCard
        tone="amber"
        title="수증자에게 같은 해 다른 양도 있음"
        checked={form.doneeHasOtherTransfersSameYear}
        onCheckedChange={(v) => onPatch({ doneeHasOtherTransfersSameYear: v })}
        data-testid="gr-donee-other-transfers"
      />

      <FieldCard
        label="수증자 양도소득세 결정세액"
        required
        unit="원"
        field="doneeTransferDeterminedTax"
        hint="양도세 계산기에서 수증자 기준(취득일=증여 등기접수일, 취득가액=증여재산가액)으로 계산한 결정세액(가산세 제외)"
        warning={issueOf(issues, "doneeTransferDeterminedTax")}
      >
        <CurrencyInput
          label="수증자 양도소득세 결정세액"
          hideLabel
          hideUnit
          value={amountToText(form.doneeTransferDeterminedTax)}
          onChange={(v) => onPatch({ doneeTransferDeterminedTax: textToAmount(v) })}
          data-testid="gr-donee-transfer-tax"
        />
        <GiftResaleHistoryPicker
          field="doneeTransferDeterminedTax"
          modalTitle="수증자 양도소득세 — 양도세 계산 이력 불러오기"
          testIdPrefix="gr-donee"
          historySources={historySources}
          onPickHistory={onPickHistory}
        />
      </FieldCard>
    </ToneCard>
  );
}
