"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

      {/* 가산세 옵션 */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch
            id="enable-penalty"
            checked={form.enablePenalty}
            onCheckedChange={(v) => onChange({ enablePenalty: v })}
          />
          <Label htmlFor="enable-penalty">가산세 계산 포함</Label>
        </div>

        {form.enablePenalty && (
          <div className="space-y-4 pl-2 border-l-2 border-muted">
            {/* 신고불성실 가산세 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">신고불성실 가산세</Label>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">신고 유형</Label>
                <Select
                  value={form.filingType}
                  onValueChange={(v) => { if (v) onChange({ filingType: v as MultiTransferFormData["filingType"] }); }}
                >
                  <SelectTrigger className="max-w-xs">
                    <span>
                      {form.filingType === "none"
                        ? "무신고"
                        : form.filingType === "under"
                          ? "과소신고"
                          : form.filingType === "excess_refund"
                            ? "초과환급신고"
                            : "정상신고 (가산세 없음)"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">무신고</SelectItem>
                    <SelectItem value="under">과소신고</SelectItem>
                    <SelectItem value="excess_refund">초과환급신고</SelectItem>
                    <SelectItem value="correct">정상신고 (가산세 없음)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.filingType !== "correct" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">부정행위 구분</Label>
                    <Select
                      value={form.penaltyReason}
                      onValueChange={(v) => {
                        if (v) onChange({ penaltyReason: v as MultiTransferFormData["penaltyReason"] });
                      }}
                    >
                      <SelectTrigger className="max-w-xs">
                        <span>
                          {form.penaltyReason === "normal"
                            ? "일반 (무/과소신고)"
                            : form.penaltyReason === "fraudulent"
                              ? "부정행위"
                              : "역외거래 부정행위"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">일반 (무/과소신고)</SelectItem>
                        <SelectItem value="fraudulent">부정행위</SelectItem>
                        <SelectItem value="offshore_fraud">역외거래 부정행위</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.filingType === "under" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">당초 신고세액</Label>
                      <div className="max-w-xs">
                        <CurrencyInput
                          label="당초 신고세액"
                          value={form.originalFiledTax}
                          onChange={(v) => onChange({ originalFiledTax: v })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {form.filingType === "excess_refund" && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">초과환급 신청세액</Label>
                      <div className="max-w-xs">
                        <CurrencyInput
                          label="초과환급 신청세액"
                          value={form.excessRefundAmount}
                          onChange={(v) => onChange({ excessRefundAmount: v })}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">기납부세액</Label>
                    <div className="max-w-xs">
                      <CurrencyInput
                        label="기납부세액"
                        value={form.priorPaidTax}
                        onChange={(v) => onChange({ priorPaidTax: v })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 납부지연 가산세 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">납부지연 가산세</Label>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">납부기한</Label>
                <DateInput
                  value={form.paymentDeadline}
                  onChange={(v) => onChange({ paymentDeadline: v })}
                />
              </div>
              {form.paymentDeadline && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">미납세액 (0이면 결정세액 자동 적용)</Label>
                    <div className="max-w-xs">
                      <CurrencyInput
                        label="미납세액"
                        value={form.unpaidTax}
                        onChange={(v) => onChange({ unpaidTax: v })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">실제 납부일 (선택)</Label>
                    <DateInput
                      value={form.actualPaymentDate}
                      onChange={(v) => onChange({ actualPaymentDate: v })}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
