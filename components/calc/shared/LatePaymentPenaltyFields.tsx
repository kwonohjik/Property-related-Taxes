/**
 * ⑤ 납부지연가산세 입력 — 상속·증여 **공용** (🔴 G-07 B3)
 *
 * 「국세기본법」 §47의4①1호 — 「납부하지 아니한 세액 × **법정납부기한의 다음 날부터
 * 납부일의 전날까지**의 기간 × 대통령령으로 정하는 이자율」.
 *
 * ## 🔑 신고 상태와 **독립**이다
 *
 * §47의4①1호는 「법정납부기한까지 납부하지 아니한」 사실만 요건으로 한다 — §47의2·§47의3을
 * 요건으로 하지 **않는다**. 기한 내에 정확히 신고하고 납부만 늦은 사안이 가장 흔한데, 그것을
 * 신고 유형 게이트 안에 넣으면 입력 경로가 아예 사라진다(주식 축이 실제로 그 결함을 겪었다 —
 * `stock-penalty-detail-step3.test.tsx` PS-1-1). 부동산 정본(`transfer-tax/steps/Step6.tsx`)도
 * 이 블록을 게이트 **밖 형제**로 둔다.
 *
 * ## ⚠️ 금액·기한을 파생하지 않는다
 *
 * 상증법 §70①은 연부연납(§71)·납부유예(§72의2)·물납(§73) **신청분을 자진납부 대상에서 뺀다**.
 * 결정세액에서 미납세액을 자동 유도하면 그 금액까지 미납으로 보아 **과대**가 된다.
 * §70② 분납(2개월)도 기한이 다르다. ⇒ 입력받고 ⑧이 미입력을 차단한다.
 */
"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DateInput } from "@/components/ui/date-input";

export interface LatePaymentPenaltyFieldsProps {
  /** 3-state — §47의4③6호는 「법정신고기한까지 납부」가 요건이라 정기신고에서만 성립한다 */
  filingStatus: "on_time" | "late" | "none";
  applyLatePaymentPenalty: boolean;
  unpaidTax: string;
  paymentDeadline: string;
  actualPaymentDate: string;
  paidOnTimeThenRevalued: boolean;
  /** 법정신고기한 — 상증법 §70①에 따라 납부기한과 같다. hint 로만 쓴다(자동 채움 금지) */
  statutoryDeadlineHint?: string;
  onChange: (patch: {
    applyLatePaymentPenalty?: boolean;
    unpaidTax?: string;
    paymentDeadline?: string;
    actualPaymentDate?: string;
    paidOnTimeThenRevalued?: boolean;
  }) => void;
}

export function LatePaymentPenaltyFields({
  filingStatus,
  applyLatePaymentPenalty,
  unpaidTax,
  paymentDeadline,
  actualPaymentDate,
  paidOnTimeThenRevalued,
  statutoryDeadlineHint,
  onChange,
}: LatePaymentPenaltyFieldsProps) {
  return (
    <ToggleCard
      tone="rose"
      title="납부지연가산세 (국세기본법 §47의4)"
      description="법정납부기한까지 납부하지 않았거나 적게 납부한 경우 — 미납세액 × 지연일수 × 이자율. 신고를 제때 정확히 했어도 납부가 늦으면 붙습니다."
      checked={applyLatePaymentPenalty}
      onCheckedChange={(v) =>
        onChange({
          applyLatePaymentPenalty: v,
          // 🔑 꺼면 하위 칸을 비운다 — 화면에서 사라진 값이 payload 로 새면 가산세가
          //    조용히 남는다(부동산 G-10과 같은 stale 누출).
          ...(!v
            ? {
                unpaidTax: "",
                paymentDeadline: "",
                actualPaymentDate: "",
                paidOnTimeThenRevalued: false,
              }
            : {}),
        })
      }
    >
      <div className="space-y-2">
        <CurrencyInput
          label="미납·과소납부세액"
          value={unpaidTax}
          onChange={(v) => onChange({ unpaidTax: v })}
          hint="법정납부기한까지 내지 않은 세액입니다. 연부연납·납부유예·물납을 신청한 금액은 자진납부 대상이 아니므로 제외하세요 (상증법 §70①4~6호)."
        />
        <FieldCard
          label="법정납부기한"
          hint={
            statutoryDeadlineHint
              ? `상증법 §70① — 신고기한과 같습니다 (이 신고의 신고기한: ${statutoryDeadlineHint}). 분납(§70②)은 2개월 뒤가 기한입니다.`
              : "상증법 §70① — 신고기한과 같습니다. 분납(§70②)은 2개월 뒤가 기한입니다."
          }
        >
          <DateInput value={paymentDeadline} onChange={(v) => onChange({ paymentDeadline: v })} />
        </FieldCard>
        <FieldCard
          label="실제 납부일"
          hint="산정기간은 법정납부기한의 다음 날부터 납부일의 전날까지입니다 (§47의4①1호). 비워 두면 오늘까지로 계산합니다."
        >
          <DateInput
            value={actualPaymentDate}
            onChange={(v) => onChange({ actualPaymentDate: v })}
          />
        </FieldCard>

        {/*
          🔴 §47의4③**6호** — 「§67·§68에 따라 신고한 자가 §70에 따라 **법정신고기한까지
          납부**한 경우로서, 법정신고기한 이후 대통령령으로 정하는 방법에 따라 상속재산·
          증여재산을 **평가하여** 과세표준과 세액을 결정·경정한 경우」.

          ⚠️ §47의3④1호 **다목**(과소신고 적용제외)과 짝이지만 **요건이 다르다** — 6호는
             「법정신고기한까지 납부」를 추가로 요구한다. 다목 입력으로 대체할 수 없다.
          ⚠️ 「신고한 자」가 요건이므로 정기신고에서만 성립한다.
        */}
        {filingStatus === "on_time" && (
          <ToggleCard
            tone="rose"
            variant="chip"
            title="기한 내 신고·납부 후 평가로 경정"
            description="법정신고기한까지 신고·납부했는데 그 뒤 재산 평가로 과세표준·세액이 결정·경정된 경우에는 납부지연가산세를 적용하지 않습니다 (국세기본법 §47의4③6호)"
            checked={paidOnTimeThenRevalued}
            onCheckedChange={(v) => onChange({ paidOnTimeThenRevalued: v })}
          />
        )}
      </div>
    </ToggleCard>
  );
}
