"use client";

/**
 * 가산세 상세 입력 — 두 블록으로 갈라져 있다
 *
 * · `PenaltyDetailBlock`        — §47조의3① **기준금액 차감 항목** (신고 위반 게이트 **안**)
 * · `LatePaymentPenaltyBlock`   — §47조의4 **납부지연 3필드**   (게이트 **밖**)
 *
 * ## 왜 이 칸들이 필요한가 (국세기본법)
 *
 * · **§47조의3①** — 가산세 base 는 「과소신고한 **납부세액**」이다. 산출세액 전액이 아니라
 *   **당초 신고한 납부세액·기납부세액·이자상당가산액을 뺀** 금액이다. 이 칸이 없던 동안에는
 *   전액에 세율을 곱해 **납세자에게 불리**했다.
 * · **§47조의4①1호** — 납부지연가산세 = 미납세액 × 경과일수 × 1일 10만분의 22
 *   (국기령 §27조의4①). 경과일수는 **법정납부기한 다음 날**부터 센다.
 *   이쪽은 §47조의2·§47조의3을 **요건으로 하지 않아** 게이트를 함께 쓰면 안 된다.
 *
 * 계산 엔진은 부동산 양도세와 **같은 모듈**을 쓴다(`lib/tax-engine/transfer-tax-penalty.ts`) —
 * 가산세는 국세기본법 규정이라 세목을 가리지 않는다.
 */

import { useState } from "react";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";

export function PenaltyDetailBlock({
  form,
  onChange,
}: {
  form: StockTransferFormData;
  onChange: (d: Partial<StockTransferFormData>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="가산세 기준금액 (과소신고납부세액등)"
        description="국세기본법 §47조의3① — 산출세액 전액이 아니라 여기서 뺀 금액에 세율을 곱합니다"
      />

      {/*
        당초 신고세액은 **과소신고에만** 있는 개념이다 — 무신고는 애초에 신고한 세액이 없다.
        무신고로 바꿀 때 값을 지우는 것은 Step3 의 onChange 가 한다(stale 값이 base 를 줄여
        가산세를 과소산정하는 것을 막는다).
      */}
      {form.filingViolation === "under_report" && (
        <CurrencyInput
          label="당초 신고세액"
          value={form.originalFiledTax}
          onChange={(v) => onChange({ originalFiledTax: v })}
          hint="최초 신고서에 적어 낸 납부세액"
        />
      )}

      <CurrencyInput
        label="기납부세액"
        value={form.priorPaidTax}
        onChange={(v) => onChange({ priorPaidTax: v })}
        hint="예정신고 시 이미 납부한 세액"
      />

      {/*
        §47조의3①1호는 「**가목 + 나목을 합한** 금액」이다 —
          가. **부정행위로 인한** 과소신고납부세액등 × 40%(역외 60%)
          나. (과소신고납부세액등 − 부정행위분) × 10%
        전액이 부정행위분이 아니면 나머지는 10%다. 비워 두면 **전액을 부정행위분**으로 본다.

        ⚠️ 무신고(§47조의2①)에는 이 분해가 없다 — 「비율을 곱한 금액」이라 각 목이 없다.
           그래서 과소신고일 때만 묻는다.
      */}
      {form.filingViolation === "under_report" && form.isFraudulent && (
        <CurrencyInput
          label="부정행위로 인한 과소신고분"
          value={form.fraudulentPortion}
          onChange={(v) => onChange({ fraudulentPortion: v })}
          hint="비워 두면 과소신고분 전액을 부정행위로 봅니다. 일부만 부정행위라면 그 금액을 입력하세요 — 나머지는 10%가 적용됩니다 (국세기본법 §47조의3①1호 나목)."
        />
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((p) => !p)}
          aria-expanded={showAdvanced}
          className={expandToggleClass("slate")}
        >
          {expandToggleLabel(showAdvanced)} · 고급 설정 (이자상당가산액)
        </button>
        {showAdvanced && (
          <div className="mt-2">
            <CurrencyInput
              label="이자상당가산액"
              value={form.interestSurcharge}
              onChange={(v) => onChange({ interestSurcharge: v })}
              hint="세법에 따라 가산하여 납부하는 이자상당액 — 가산세 기준금액에서 제외 (국세기본법 §47조의3①)"
            />
          </div>
        )}
      </div>

    </div>
  );
}

/**
 * 납부지연가산세 입력 — **신고 위반 게이트 밖**에 둔다.
 *
 * 🔑 국세기본법 §47조의4①1호는 「법정납부기한까지 납부하지 아니하거나 적게 납부한 경우」로
 *    §47조의2(무신고)·§47조의3(과소신고)을 **요건으로 하지 않는다**. 기한 내에 정확히
 *    신고하고 납부만 늦은 사안이 가장 흔한데, 종전에는 이 세 칸이 신고 위반 게이트 안에만
 *    있어 **입력할 방법이 아예 없었다**. 반대로 축을 되돌리면 화면에서 칸은 사라지는데
 *    ④는 게이트 없이 전송하고 엔진도 `filingViolation`을 읽지 않으므로 **세액만 남아**
 *    정정할 화면이 없었다.
 *
 * 부동산 정본도 같은 배치다 — `app/calc/transfer-tax/steps/Step6.tsx`가 이 블록을
 * 신고 위반 분기 **밖 형제**로 둔다.
 */
export function LatePaymentPenaltyBlock({
  form,
  onChange,
}: {
  form: StockTransferFormData;
  onChange: (d: Partial<StockTransferFormData>) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="납부지연가산세"
        description="국세기본법 §47조의4①1호 · 국기령 §27조의4① 1일 10만분의 22 — 신고 위반과 무관하게 적용됩니다"
      />

      <CurrencyInput
        label="미납·과소납부세액"
        value={form.unpaidTax}
        onChange={(v) => onChange({ unpaidTax: v })}
        hint="납부하지 않았거나 모자라게 납부한 세액. 0이면 납부지연가산세를 계산하지 않습니다"
      />

      <FieldCard
        label="법정납부기한"
        hint="예정신고: 양도일이 속한 달의 말일부터 2개월 / 확정신고: 다음 해 5월 31일"
      >
        <DateInput
          value={form.paymentDeadline}
          onChange={(v) => onChange({ paymentDeadline: v })}
        />
      </FieldCard>

      <FieldCard label="실제 납부일" hint="미입력 시 오늘 기준으로 계산합니다">
        <DateInput
          value={form.actualPaymentDate}
          onChange={(v) => onChange({ actualPaymentDate: v })}
        />
      </FieldCard>
    </div>
  );
}
