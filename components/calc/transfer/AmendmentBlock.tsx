import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { resolveAmendmentReductionRate } from "@/lib/tax-engine/transfer-tax-amendment";

/**
 * 수정신고(경정) 입력 블록 — Step 6에서 amendmentMode 시 노출.
 * 당초 결정세액 자동 차감 + 신고불성실(§48② 자동감면)·납부지연 선택.
 */
export function AmendmentBlock({
  form,
  onChange,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
}) {
  // 감면율 프리뷰 — 엔진 헬퍼 단일진실 (display only, store 미러링 아님)
  const previewRate =
    form.underReductionMode === "auto_48_2" && form.statutoryFilingDeadline && form.amendedFilingDate
      ? resolveAmendmentReductionRate(
          new Date(form.statutoryFilingDeadline),
          new Date(form.amendedFilingDate),
          form.priorAssessmentNotified,
        )
      : null;

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
      <SectionHeader
        title="⑤ 수정신고"
        description="당초 결정세액을 차감해 추가 납부세액을 계산합니다 (국세기본법 §45)"
      />
      <div className="space-y-4">
        <CurrencyInput
          label="당초 결정세액"
          value={form.originalDeterminedTax}
          onChange={(v) => onChange({ originalDeterminedTax: v })}
          hint="당초 신고·납부한 양도소득세 본세 (이력에서 자동 입력)"
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">법정신고기한</label>
          <DateInput
            value={form.statutoryFilingDeadline}
            onChange={(v) => onChange({ statutoryFilingDeadline: v })}
          />
          <p className="text-xs text-muted-foreground">
            확정신고기한 = 양도 다음 해 5월 31일 (소득세법 §110①). 자동 도출·수정 가능.
          </p>
        </div>

        {/* 신고불성실가산세 */}
        <ToggleCard
          checked={form.applyUnderReportingPenalty}
          onCheckedChange={(v) => onChange({ applyUnderReportingPenalty: v })}
          title="신고불성실가산세 적용"
          description="판결·재결 확정 증액보상금은 통상 정당한 사유 면제(§48①2호) — 해당 시 OFF"
          tone="rose"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">부정행위 여부</label>
              <RadioCardGroup
                name="amendmentUnderReason"
                tone="rose"
                value={form.underReportingReason}
                onChange={(v) =>
                  onChange({ underReportingReason: v as TransferFormData["underReportingReason"] })
                }
                options={[
                  { value: "normal", label: "일반", description: "10%" },
                  { value: "fraudulent", label: "부정행위", description: "40%" },
                  { value: "offshore_fraud", label: "역외거래 부정행위", description: "60%" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">감면 방식</label>
              <RadioCardGroup
                name="amendmentReductionMode"
                tone="emerald"
                value={form.underReductionMode}
                onChange={(v) =>
                  onChange({ underReductionMode: v as TransferFormData["underReductionMode"] })
                }
                options={[
                  { value: "exempt", label: "정당한 사유 면제 (§48①2호)", description: "증액보상금 등 — 가산세 0" },
                  { value: "auto_48_2", label: "§48② 자진수정 감면", description: "경과기간별 10~90% 감면" },
                ]}
              />
            </div>
            {form.underReductionMode === "auto_48_2" && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">수정신고일</label>
                  <DateInput
                    value={form.amendedFilingDate}
                    onChange={(v) => onChange({ amendedFilingDate: v })}
                  />
                </div>
                {previewRate !== null && (
                  <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    {previewRate > 0
                      ? `법정신고기한 경과 → 신고불성실가산세 ${(previewRate * 100).toFixed(0)}% 감면`
                      : "2년 초과 경과 → 감면 없음 (0%)"}
                  </p>
                )}
                <ToggleCard
                  checked={form.priorAssessmentNotified}
                  onCheckedChange={(v) => onChange({ priorAssessmentNotified: v })}
                  title="세무서 경정 예고 후 수정신고"
                  description="경정을 미리 알고 신고한 경우 §48② 감면 배제"
                  tone="rose"
                />
              </div>
            )}
          </div>
        </ToggleCard>

        {/* 납부지연가산세 */}
        <ToggleCard
          checked={form.applyLatePaymentPenalty}
          onCheckedChange={(v) => onChange({ applyLatePaymentPenalty: v })}
          title="납부지연가산세 적용"
          description="추가 납부세액 × 경과일수 × 일 0.022% (§47의4) — §48② 감면 대상 아님"
          tone="rose"
        >
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">수정신고 납부(예정)일</label>
            <DateInput
              value={form.amendedPaymentDate}
              onChange={(v) => onChange({ amendedPaymentDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              법정신고기한 다음날부터 이 날까지 경과일수로 계산됩니다.
            </p>
          </div>
        </ToggleCard>
      </div>
    </section>
  );
}
