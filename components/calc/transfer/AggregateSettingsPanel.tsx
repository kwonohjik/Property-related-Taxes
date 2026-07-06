"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { computeAutoPriorPaid } from "@/lib/calc/multi-prior-filed";

interface AggregateSettingsPanelProps {
  form: MultiTransferFormData;
  onChange: (updates: Partial<MultiTransferFormData>) => void;
}

export function AggregateSettingsPanel({ form, onChange }: AggregateSettingsPanelProps) {
  // 미편집 시 기납부세액 = 신고일 필터 자동 파생(§111③). 편집 시 사용자 입력값 표시.
  const derived = useMemo(() => computeAutoPriorPaid(form.properties), [form.properties]);
  const priorPaidTaxValue = form.priorPaidTaxEdited ? form.priorPaidTax : String(derived.national);
  const priorPaidLocalValue = form.priorPaidTaxEdited
    ? form.priorPaidLocalTax
    : String(derived.local);
  const showAutoBadge = !form.priorPaidTaxEdited && (derived.national > 0 || derived.local > 0);
  return (
    <div className="space-y-6">
      {/* 과세연도 */}
      <div className="space-y-2">
        <Label>과세연도</Label>
        <Select
          value={String(form.taxYear)}
          onValueChange={(v) => { if (v) onChange({ taxYear: parseInt(v) }); }}
        >
          <SelectTrigger className="w-32">
            <span>{form.taxYear}년</span>
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}년
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          모든 양도 건의 양도일이 해당 연도 내에 있어야 합니다.
        </p>
      </div>

      {/* 연간 기사용 기본공제 */}
      <div className="space-y-2">
        <Label>연간 기사용 기본공제</Label>
        <div className="max-w-xs">
          <CurrencyInput
            label="연간 기사용 기본공제"
            hideLabel
            value={form.annualBasicDeductionUsed}
            onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          이 계산 전에 당해 연도에 이미 사용한 기본공제액 (최대 2,500,000).
        </p>
      </div>

      {/* 기본공제 배분 전략 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Label>기본공제 배분 전략 (소득세법 §103)</Label>
          <LawArticleModal legalBasis="소득세법 §103" label="§103 기본공제" />
        </div>
        <RadioGroup
          value={form.basicDeductionAllocation}
          onValueChange={(v) =>
            onChange({ basicDeductionAllocation: v as MultiTransferFormData["basicDeductionAllocation"] })
          }
          className="space-y-2"
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="MAX_BENEFIT" id="alloc-max" className="mt-0.5" />
            <div>
              <Label htmlFor="alloc-max" className="font-medium cursor-pointer">
                납세자 유리 배분 (권장)
              </Label>
              <p className="text-xs text-muted-foreground">세율이 높은 자산(절세 효과 최대)에 우선 배분</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="FIRST" id="alloc-first" className="mt-0.5" />
            <div>
              <Label htmlFor="alloc-first" className="cursor-pointer">입력 순서 우선 배분</Label>
              <p className="text-xs text-muted-foreground">목록 첫 번째 자산에 우선 배분</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="EARLIEST_TRANSFER" id="alloc-earliest" className="mt-0.5" />
            <div>
              <Label htmlFor="alloc-earliest" className="cursor-pointer">양도일 빠른 순 배분</Label>
              <p className="text-xs text-muted-foreground">양도일이 이른 자산에 우선 배분</p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {/* 예정신고 기납부세액 정산 (§111③) */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Label>예정신고 기납부세액</Label>
          <LawArticleModal legalBasis="소득세법 §111③" label="§111③ 확정신고 정산" />
          {showAutoBadge && (
            <Badge
              variant="secondary"
              data-testid="prior-paid-tax-auto-badge"
              className="bg-sky-100 text-sky-700 text-[10px]"
            >
              자동 (참고)
            </Badge>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
          <div>
            <CurrencyInput
              label="예정신고 기납부세액 (양도소득세)"
              value={priorPaidTaxValue}
              onChange={(v) => onChange({ priorPaidTax: v, priorPaidTaxEdited: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">양도소득세(국세) 예정신고 납부액</p>
          </div>
          <div>
            <CurrencyInput
              label="예정신고 기납부 지방소득세"
              value={priorPaidLocalValue}
              onChange={(v) => onChange({ priorPaidLocalTax: v, priorPaidTaxEdited: true })}
            />
            <p className="mt-1 text-xs text-muted-foreground">지방소득세 예정신고 납부액</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          확정신고 시 결정세액에서 공제되어 추가납부·환급액을 산출합니다. 실제 예정신고 납부액을 입력하세요.
        </p>
      </div>

      <p className="text-xs text-muted-foreground border-t pt-4">
        가산세(신고불성실·납부지연)는 자산별로 다를 수 있어 각 자산 편집 마법사 마지막 단계에서 입력합니다.
      </p>
    </div>
  );
}
