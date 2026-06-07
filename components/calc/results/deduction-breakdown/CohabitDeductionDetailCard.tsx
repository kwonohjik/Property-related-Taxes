"use client";

/**
 * CohabitDeductionDetailCard — ⑤ 동거주택공제 펼침 (§23의2)
 * 소비: result.deductionDetail.cohabitDeductionDetail
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { CohabitDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: CohabitDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

export function CohabitDeductionDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />}
        </span>
      </div>

      {open && detail && (
        <DetailTable>
          <DetailRow
            label="동거주택 공시가격 (평가액)"
            value={formatKRW(detail.housingValue)}
          />
          {detail.securedDebt > 0 && (
            <DetailRow
              label="(−) 담보된 피상속인 채무 (§23의2 ①)"
              value={`− ${formatKRW(detail.securedDebt)}`}
              indent
              muted
              deduction
            />
          )}
          <SubTotalRow
            label="공제 기준액"
            value={formatKRW(detail.base)}
          />
          <DetailRow
            label={`공제율 ${(detail.rate * 100).toFixed(0)}%`}
            value={formatKRW(detail.rawDeduction)}
          />
          <DetailRow
            label={`${(detail.cap / 100_000_000).toFixed(0)}억 최고한도`}
            value={formatKRW(detail.cap)}
            muted
          />
          <SubTotalRow
            label={`Min(공시가격 × ${(detail.rate * 100).toFixed(0)}%, ${(detail.cap / 100_000_000).toFixed(0)}억)`}
            value={formatKRW(detail.cappedDeduction)}
            tone="blue"
          />
        </DetailTable>
      )}
    </>
  );
}
