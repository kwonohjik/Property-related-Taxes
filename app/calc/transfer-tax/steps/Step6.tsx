import { useState } from "react";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { AmendmentBlock } from "@/components/calc/transfer/AmendmentBlock";

// ============================================================
// Step 6: 가산세 (선택 입력)
// ============================================================
export function Step6({
  form,
  onChange,
  determinedTax,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  determinedTax: number | null;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 기납부세액 변경 시 미납세액 자동 재계산
  function handlePriorPaidChange(v: string) {
    onChange({ priorPaidTax: v });
    if (determinedTax !== null) {
      const priorPaid = parseAmount(v ?? "0");
      const autoUnpaid = Math.max(0, determinedTax - priorPaid);
      onChange({ priorPaidTax: v, unpaidTax: autoUnpaid > 0 ? String(autoUnpaid) : "0" });
    }
  }
  return (
    <div className="space-y-5">
      {form.amendmentMode ? (
        <AmendmentBlock form={form} onChange={onChange} />
      ) : (
      <>
      <p className="text-sm text-muted-foreground">
        가산세 계산이 필요한 경우에만 입력하세요. (선택 사항)
      </p>

      {/* 가산세 계산 토글 */}
      <ToggleCard
        checked={form.enablePenalty ?? false}
        onCheckedChange={(v) => onChange({ enablePenalty: v })}
        title="가산세 계산하기"
        description="신고불성실·지연납부 가산세를 함께 계산합니다"
        tone="amber"
      >
        <div className="space-y-5">

          {/* 신고불성실가산세 */}
          <SectionHeader title="신고불성실가산세" description="국세기본법 §47의2·§47의3" />
          <div className="space-y-3">

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">신고 유형</label>
              <RadioCardGroup
                name="filingType"
                tone="amber"
                value={form.filingType ?? "correct"}
                /**
                 * 🔴 G-10: 유형을 바꾸면 **대상 밖이 되는 칸을 함께 비운다.**
                 * 화면에서 칸이 사라져도 값은 스토어에 남아 payload 로 새고, 그대로
                 * 가산세 기준금액을 늘리거나 줄인다. 주식 축 `Step3.tsx`와 같은 패턴이다.
                 */
                onChange={(v) =>
                  onChange({
                    filingType: v,
                    ...(v !== "under" && v !== "excess_refund" ? { originalFiledTax: "0" } : {}),
                    ...(v !== "excess_refund" ? { excessRefundAmount: "0" } : {}),
                  })
                }
                options={[
                  { value: "correct", label: "정상신고", description: "가산세 없음" },
                  { value: "none", label: "무신고", description: "납부세액 × 20% (부정행위 40%)" },
                  { value: "under", label: "과소신고", description: "납부세액 × 10% (부정행위 40%)" },
                  { value: "excess_refund", label: "초과환급신고", description: "납부세액 × 10% (부정행위 40%)" },
                ]}
              />
            </div>

            {(form.filingType ?? "correct") !== "correct" && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">부정행위 여부</label>
                  <RadioCardGroup
                    name="penaltyReason"
                    tone="rose"
                    value={form.penaltyReason ?? "normal"}
                    onChange={(v) => onChange({ penaltyReason: v })}
                    options={[
                      { value: "normal", label: "일반 (단순 착오·실수)" },
                      { value: "fraudulent", label: "부정행위", description: "이중장부·허위증빙·재산은닉 등 → 40%" },
                      { value: "offshore_fraud", label: "역외거래 부정행위 (2015.7.1 이후)", description: "→ 60%" },
                    ]}
                  />
                </div>

                <CurrencyInput
                  label="기납부세액"
                  value={form.priorPaidTax}
                  onChange={handlePriorPaidChange}
                />

                {/*
                  🔴 G-05 — 기한 후 신고 감면(「국세기본법」 §48②2호·§48②3호라목).

                  감면율 자체는 **날짜에서 파생**한다(예정신고기한 §105① · 신고일 ·
                  확정신고기한 §110①) — 사용자가 고르는 것이 아니다. 여기서 받는 것은
                  두 조문 공통의 **배제 단서** 하나뿐이다.

                  ⚠️ 무신고(§47조의2)에만 노출한다 — 두 조문 모두 「제47조의2에 따른
                     가산세만 해당」이고, 과소신고는 §48②1호(수정신고)가 담당한다.
                */}
                {form.filingType === "none" && (
                  <ToggleCard
                    checked={form.lateFilingNotified ?? false}
                    onCheckedChange={(v) => onChange({ lateFilingNotified: v })}
                    title="세무서 결정 예고 후 기한 후 신고"
                    description="결정할 것을 미리 알고 신고한 경우 국세기본법 §48②2호·3호라목 감면 배제"
                    tone="rose"
                  />
                )}

                {(form.filingType === "under" || form.filingType === "excess_refund") && (
                  <CurrencyInput
                    label="당초 신고세액"
                    value={form.originalFiledTax}
                    onChange={(v) => onChange({ originalFiledTax: v })}
                  />
                )}

                {form.filingType === "excess_refund" && (
                  <CurrencyInput
                    label="초과환급신고 환급세액"
                    value={form.excessRefundAmount}
                    onChange={(v) => onChange({ excessRefundAmount: v })}
                  />
                )}

                {/*
                  §47조의3①1호는 「**가목 + 나목을 합한** 금액」이다 —
                    가. **부정행위로 인한** 과소신고납부세액등 × 40%(역외 60%)
                    나. (과소신고납부세액등 − 부정행위분) × 10%
                  비워 두면 전액을 부정행위분으로 본다(종전 동작).
                  ⚠️ 무신고(§47조의2①)에는 이 분해가 없어 과소신고·초과환급신고에만 묻는다.
                */}
                {(form.filingType === "under" || form.filingType === "excess_refund") &&
                  (form.penaltyReason === "fraudulent" ||
                    form.penaltyReason === "offshore_fraud") && (
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
                    {expandToggleLabel(showAdvanced)} · 고급 설정 (이자상당액 가산액)
                  </button>
                  {showAdvanced && (
                    <div className="mt-2">
                      {/* 🔴 G-40: 제외 문언은 「국세기본법」 §47의2① 괄호·§47의3① 괄호에 있다.
                          §47의2③은 부가가치세법 §69 납부의무 면제 규정이라 무관하다. */}
                      <CurrencyInput
                        label="이자상당액 가산액"
                        value={form.interestSurcharge}
                        onChange={(v) => onChange({ interestSurcharge: v })}
                        hint="세법에 따른 이자상당액 — 가산세 산정 납부세액에서 제외 (국세기본법 §47의2① · §47의3① 각 괄호)"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 지연납부가산세 */}
          <div className="space-y-3 border-t border-border/50 pt-4">
            <SectionHeader title="지연납부가산세" description="국세기본법 §47의4" />

            <FieldCard
              label="미납·미달납부세액"
              unit="원"
              hint={
                determinedTax !== null
                  ? `결정세액 ${determinedTax.toLocaleString()} − 기납부세액 자동 계산`
                  : "납부하지 않았거나 미달납부한 세액 (가산세 계산하기 클릭 시 자동 계산)"
              }
            >
              <CurrencyInput
                label=""
                hideUnit
                value={form.unpaidTax}
                onChange={(v) => onChange({ unpaidTax: v })}
              />
            </FieldCard>

            <FieldCard
              label="법정납부기한"
              hint="예정신고: 양도월 말일부터 2개월 / 확정신고: 다음해 5월 31일"
            >
              <DateInput
                value={form.paymentDeadline}
                onChange={(v) => onChange({ paymentDeadline: v })}
              />
            </FieldCard>

            <FieldCard
              label="실제 납부일"
              hint="미입력 시 오늘 기준으로 계산"
            >
              <DateInput
                value={form.actualPaymentDate}
                onChange={(v) => onChange({ actualPaymentDate: v })}
              />
            </FieldCard>
          </div>
        </div>
      </ToggleCard>
      </>
      )}
    </div>
  );
}
