"use client";

/**
 * 동반자산 증여 취득(gift) 입력 블록
 *
 * 증여 취득가액 = 증여세 신고가액 (또는 시가).
 * 증여자 취득일을 자체 입력받아 단기보유 통산(§95④) 정확도 확보.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";

interface BlockProps {
  acquisitionDate: string; // 증여일
  onAcquisitionDateChange: (v: string) => void;
  donorAcquisitionDate: string;
  onDonorAcquisitionDateChange: (v: string) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
}

export function CompanionAcqGiftBlock(props: BlockProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">증여일</label>
          <DateInput
            value={props.acquisitionDate}
            onChange={props.onAcquisitionDateChange}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">증여자 취득일</label>
          <DateInput
            value={props.donorAcquisitionDate}
            onChange={props.onDonorAcquisitionDateChange}
          />
          <p className="text-[11px] text-muted-foreground">단기보유 통산용 (소득세법 §95④)</p>
        </div>
      </div>

      <CurrencyInput
        label="증여 신고가액 (원)"
        value={props.fixedAcquisitionPrice}
        onChange={props.onFixedAcquisitionPriceChange}
        required
        hint="증여세 신고서상 시가 또는 보충적평가액"
      />
    </div>
  );
}
