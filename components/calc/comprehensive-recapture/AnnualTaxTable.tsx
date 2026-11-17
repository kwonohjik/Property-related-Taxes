"use client";

/**
 * ② 연도별 경감세액 표 — 과세연도 정수 + 금액, 행 추가·삭제(1~20행).
 * 금액은 사용자가 직접 입력한다(시행령 §10① — 엔진은 합산 전후 세액 차이를 계산하지 않는다).
 */
import { Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Button } from "@/components/ui/button";
import { COMPREHENSIVE_EXCL_CONST } from "@/lib/tax-engine/legal-codes";
import { newRowId, type RecaptureRowForm } from "./shared";

const INPUT_CLS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AnnualTaxTable({
  rows,
  onChange,
}: {
  rows: RecaptureRowForm[];
  onChange: (rows: RecaptureRowForm[]) => void;
}) {
  const maxRows = COMPREHENSIVE_EXCL_CONST.RECAPTURE_MAX_ROWS;
  const setRow = (id: string, patch: Partial<RecaptureRowForm>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <ToneCard tone="sky" sectionNum={2} title="연도별 경감받은 세액 (시행령 §10①)">
      <p className="text-xs text-muted-foreground">
        종합부동산세법 시행령 §10①에 따라 합산배제로 보아 온 매 과세연도마다, 그 주택을 합산 대상으로 보고 계산한 세액에서 합산 대상에서 제외하고 계산한 세액을 뺀 금액입니다. 해당 연도 고지서·신고서의 합산 전후 세액 차이를 확인해 입력하세요.
      </p>
      <div className="hidden sm:grid grid-cols-[7rem_1fr_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
        <span>과세연도</span>
        <span>경감받은 세액(원)</span>
        <span />
      </div>
      <div className="space-y-2" data-testid="rc-rows">
        {rows.map((row, i) => (
          <div key={row.id} className="grid grid-cols-[6rem_1fr_2.5rem] sm:grid-cols-[7rem_1fr_2.5rem] items-start gap-2" data-testid={`rc-row-${i}`}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              aria-label={`${i + 1}행 과세연도`}
              placeholder="과세연도"
              value={row.taxYear}
              onChange={(e) => setRow(row.id, { taxYear: e.target.value.replace(/[^0-9]/g, "") })}
              className={INPUT_CLS}
              data-testid={`rc-year-${i}`}
            />
            <CurrencyInput
              label={`${i + 1}행 경감받은 세액`}
              hideLabel
              hideUnit
              value={row.amount}
              onChange={(v) => setRow(row.id, { amount: v })}
              data-testid={`rc-amount-${i}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`${i + 1}행 삭제`}
              disabled={rows.length <= 1}
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              data-testid={`rc-remove-${i}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rows.length >= maxRows}
        onClick={() => onChange([...rows, { id: newRowId(), taxYear: "", amount: "" }])}
        data-testid="rc-add-row"
      >
        <Plus className="h-4 w-4" /> 연도 추가
      </Button>
      <p className="text-caption text-muted-foreground">최대 {maxRows}행까지 입력할 수 있고, 같은 과세연도를 두 번 입력할 수 없습니다.</p>
    </ToneCard>
  );
}
