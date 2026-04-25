import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";

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
      <p className="text-sm text-muted-foreground">
        가산세 계산이 필요한 경우에만 입력하세요. (선택 사항)
      </p>

      {/* 가산세 계산 토글 */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.enablePenalty}
          onChange={(e) => onChange({ enablePenalty: e.target.checked })}
          className="accent-primary w-4 h-4"
        />
        <span className="text-sm font-medium">가산세 계산하기</span>
      </label>

      {(form.enablePenalty ?? false) && (
        <div className="space-y-5 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">

          {/* 신고불성실가산세 */}
          <SectionHeader title="신고불성실가산세" description="국세기본법 §47의2·§47의3" />
          <div className="space-y-3">

            <div className="space-y-1.5">
              <label className="block text-sm font-medium">신고 유형</label>
              <div className="flex flex-col gap-2">
                {([
                  { value: "correct"      as const, label: "정상신고",    desc: "가산세 없음" },
                  { value: "none"         as const, label: "무신고",      desc: "납부세액 × 20% (부정행위 40%)" },
                  { value: "under"        as const, label: "과소신고",    desc: "납부세액 × 10% (부정행위 40%)" },
                  { value: "excess_refund"as const, label: "초과환급신고",desc: "납부세액 × 10% (부정행위 40%)" },
                ]).map((opt) => (
                  <label key={opt.value} className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    form.filingType === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}>
                    <input
                      type="radio"
                      name="filingType"
                      value={opt.value}
                      checked={form.filingType === opt.value}
                      onChange={() => onChange({ filingType: opt.value })}
                      className="accent-primary"
                      aria-label={opt.label}
                    />
                    <div>
                      <span className="font-medium">{opt.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {(form.filingType ?? "correct") !== "correct" && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">부정행위 여부</label>
                  <div className="flex flex-col gap-2">
                    {[
                      { value: "normal",         label: "일반 (단순 착오·실수)",                  desc: "" },
                      { value: "fraudulent",     label: "부정행위",                              desc: "이중장부·허위증빙·재산은닉 등 → 40%" },
                      { value: "offshore_fraud", label: "역외거래 부정행위 (2015.7.1 이후)",     desc: "→ 60%" },
                    ].map((opt) => (
                      <label key={opt.value} className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                        form.penaltyReason === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                      )}>
                        <input
                          type="radio"
                          name="penaltyReason"
                          value={opt.value}
                          checked={form.penaltyReason === opt.value}
                          onChange={() => onChange({ penaltyReason: opt.value as typeof form.penaltyReason })}
                          className="accent-primary"
                          aria-label={opt.label}
                        />
                        <div>
                          <span className="font-medium">{opt.label}</span>
                          {opt.desc && <span className="ml-2 text-xs text-muted-foreground">{opt.desc}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <CurrencyInput
                  label="기납부세액"
                  value={form.priorPaidTax}
                  onChange={handlePriorPaidChange}
                  placeholder="0"
                  hint="예정신고 시 기납부한 세액"
                />

                {(form.filingType === "under" || form.filingType === "excess_refund") && (
                  <CurrencyInput
                    label="당초 신고세액"
                    value={form.originalFiledTax}
                    onChange={(v) => onChange({ originalFiledTax: v })}
                    placeholder="0"
                    hint="최초 신고한 납부세액"
                  />
                )}

                {form.filingType === "excess_refund" && (
                  <CurrencyInput
                    label="초과환급신고 환급세액"
                    value={form.excessRefundAmount}
                    onChange={(v) => onChange({ excessRefundAmount: v })}
                    placeholder="0"
                    hint="과다 수령한 환급세액"
                  />
                )}

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((p) => !p)}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    {showAdvanced ? "고급 설정 접기 ▲" : "고급 설정 (이자상당액 가산액) ▼"}
                  </button>
                  {showAdvanced && (
                    <div className="mt-2">
                      <CurrencyInput
                        label="이자상당액 가산액"
                        value={form.interestSurcharge}
                        onChange={(v) => onChange({ interestSurcharge: v })}
                        placeholder="0"
                        hint="세법에 따른 이자상당액 — 가산세 산정 납부세액에서 제외 (국세기본법 §47의2③)"
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
                  ? `결정세액 ${determinedTax.toLocaleString()}원 − 기납부세액 자동 계산`
                  : "납부하지 않았거나 미달납부한 세액 (가산세 계산하기 클릭 시 자동 계산)"
              }
            >
              <CurrencyInput
                label=""
                hideUnit
                value={form.unpaidTax}
                onChange={(v) => onChange({ unpaidTax: v })}
                placeholder="0"
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
      )}
    </div>
  );
}
