"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

interface AggregateSettingsPanelProps {
  form: MultiTransferFormData;
  onChange: (updates: Partial<MultiTransferFormData>) => void;
}

export function AggregateSettingsPanel({ form, onChange }: AggregateSettingsPanelProps) {
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
            value={form.annualBasicDeductionUsed}
            onChange={(v) => onChange({ annualBasicDeductionUsed: v })}
            placeholder="0"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          이 계산 전에 당해 연도에 이미 사용한 기본공제액 (최대 2,500,000원).
        </p>
      </div>

      {/* 기본공제 배분 전략 */}
      <div className="space-y-3">
        <Label>기본공제 배분 전략 (소득세법 §103)</Label>
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

      <p className="text-xs text-muted-foreground border-t pt-4">
        가산세(신고불성실·납부지연)는 자산별로 다를 수 있어 각 자산 편집 마법사 마지막 단계에서 입력합니다.
      </p>
    </div>
  );
}
