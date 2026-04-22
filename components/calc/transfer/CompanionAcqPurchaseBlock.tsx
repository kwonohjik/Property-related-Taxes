"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 본인 취득일은 자산별로 별도 입력 — 보유기간 산정의 정확성 확보.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";

interface BlockProps {
  acquisitionDate: string;
  onAcquisitionDateChange: (v: string) => void;
  useEstimatedAcquisition: boolean;
  onUseEstimatedChange: (v: boolean) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
}

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">취득일 (매매계약일)</label>
        <DateInput
          value={props.acquisitionDate}
          onChange={props.onAcquisitionDateChange}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">취득가액 산정 방식</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(false)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              !props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">실거래가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              매매계약서상 실거래가 입력
            </div>
          </button>
          <button
            type="button"
            onClick={() => props.onUseEstimatedChange(true)}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">환산취득가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              양도가 × (취득시 ÷ 양도시 기준시가)
            </div>
          </button>
        </div>
      </div>

      {!props.useEstimatedAcquisition ? (
        <CurrencyInput
          label="취득가액 (원)"
          value={props.fixedAcquisitionPrice}
          onChange={props.onFixedAcquisitionPriceChange}
          required
        />
      ) : (
        <CurrencyInput
          label="취득시 기준시가 (원)"
          value={props.standardPriceAtAcq}
          onChange={props.onStandardPriceAtAcqChange}
          required
          hint="환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
        />
      )}
    </div>
  );
}
