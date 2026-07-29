"use client";

/**
 * 연부연납 입력 섹션 (상속세 마법사 Step4 끝, 상증법 §71·§72)
 *
 * 결정세액에 영향을 주지 않는 "납부 계획" 투영 입력. 결과 화면에서 calcInstallmentSchedule로
 * 회차별 일정표를 계산·표시한다.
 * 설계: docs/02-design/features/inheritance-installment-payment.design.md §5.1
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState, FormSet } from "./shared";

const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1)); // "1".."10"

export function InstallmentInputSection({
  form,
  set,
}: {
  form: FormState;
  set: FormSet;
}) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <LawArticleModal legalBasis="상증법 §70" label="§70 분납" />
        <LawArticleModal legalBasis="상증법 §71" label="§71 연부연납" />
        <LawArticleModal legalBasis="상증법 §72" label="§72 가산금" />
      </div>
      {/* 분납 (§70②) — 연부연납과 배타 */}
      <ToggleCard
        lawLinks="상증법"
        tone="sky"
        title="분납 신청 (상증법 §70②)"
        description="결정세액 1천만원 초과 시 신고기한 경과 후 2개월 이내 분할납부. 1천만~2천만은 1천만 초과분, 2천만 초과는 50% 이하를 분납할 수 있습니다."
        checked={form.splitPaymentEnabled}
        onCheckedChange={(v) => set({ splitPaymentEnabled: v })}
        disabled={form.installmentEnabled}
        disabledReason="연부연납(§71) 신청 중에는 분납을 신청할 수 없습니다 (§70② 단서)."
      >
        <div className="space-y-3 pt-1">
          <FieldCard
            label="분납 희망액"
            hint="§70② 한도(2천만 이하→1천만 초과분 / 2천만 초과→50%) 이내에서 입력하세요. 비워두면 결과 화면에서 최대 분납액으로 안내합니다."
          >
            <CurrencyInput
              label="분납 희망액"
              hideLabel
              value={form.splitPaymentAmount}
              onChange={(v) => set({ splitPaymentAmount: v })}
            />
          </FieldCard>
        </div>
      </ToggleCard>

      <ToggleCard
        lawLinks="상증법"
        tone="amber"
        title="연부연납 신청 (상증법 §71)"
        description="결정세액 2천만원 초과 시 분할납부 — 일반 10년 / 가업상속 20년. 결과 화면에 회차별 일정표(일자·원금·가산금·합계)가 표시됩니다."
        checked={form.installmentEnabled}
        onCheckedChange={(v) => set({ installmentEnabled: v })}
        disabled={form.splitPaymentEnabled}
        disabledReason="분납(§70②) 신청 중에는 연부연납을 신청할 수 없습니다 (§70② 단서)."
      >
        <div className="space-y-3 pt-1">
          {/* 희망 연부연납 기간 (일반분 ≤10, §71②1나) */}
          <FieldCard
            label="희망 연부연납 기간"
            hint="일반 상속재산 기준 1~10년(§71②1나). 각 회분 분납세액이 1천만원 이하가 되면 자동으로 더 짧게 조정됩니다(§71② 단서)."
          >
            <Select
              value={form.installmentYears}
              onValueChange={(v) => set({ installmentYears: v ?? "5" })}
            >
              <SelectTrigger>
                <SelectValue>{form.installmentYears}년</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldCard>

          {/* 가업상속재산 포함 (§71②1가·§68②) */}
          <ToggleCard
            lawLinks="상증법"
            tone="emerald"
            size="sm"
            title="가업상속재산 포함 (§71②1가)"
            description="가업상속공제를 받은 경우 — 가업상속재산분은 최대 20년 분할. 일반분과 안분하여 별도 일정으로 계산(§68②)."
            checked={form.installmentFamilyBusiness}
            onCheckedChange={(v) => set({ installmentFamilyBusiness: v })}
          >
            <div className="pt-1">
              <p className="mb-1.5 text-caption font-semibold text-emerald-700 dark:text-emerald-300">
                가업상속 납부방식
              </p>
              <RadioCardGroup
                lawLinks="상증법"
                name="installment-fb-mode"
                tone="emerald"
                layout="inline"
                value={form.installmentFbMode}
                onChange={(v) => set({ installmentFbMode: v })}
                options={[
                  {
                    value: "straight20",
                    label: "20년 균등",
                    hint: "허가일부터 20년간 매년 균등 분할 (21분의 1)",
                  },
                  {
                    value: "grace10",
                    label: "10년 거치 + 10년",
                    hint: "허가 후 10년 거치(가산금만) 후 10년간 원금 분할",
                  },
                ]}
              />
            </div>
          </ToggleCard>

          {/* 미래 회차 가산율 (§69) */}
          <FieldCard
            label="미래 회차 가산율 (연 %)"
            hint="이미 지난 회차는 고시 가산율 연혁이 자동 적용됩니다(상증령 §69). 아직 도래하지 않은 미래 회차에 적용할 가산율을 입력하세요. 현행 연 3.1%(2025.3.21~)."
          >
            <DecimalInput
              value={form.installmentFutureRate}
              onChange={(v) => set({ installmentFutureRate: v })}
              unit="%"
            />
          </FieldCard>
        </div>
      </ToggleCard>
    </div>
  );
}
