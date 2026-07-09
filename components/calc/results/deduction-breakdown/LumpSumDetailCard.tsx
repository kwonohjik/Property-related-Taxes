"use client";

/**
 * LumpSumDetailCard — ① 일괄공제 vs 항목별 비교 펼침 (§21)
 * 소비: result.deductionDetail.lumpSumComparisonDetail
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { LumpSumComparisonDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: LumpSumComparisonDetail;
  /** Row 우측에 펼침 버튼을 붙이는 방식 — 부모 Row와 함께 렌더 */
  triggerLabel: string;
  triggerValue: string;
}

export function LumpSumDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Row + 펼침 버튼 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />}
        </span>
      </div>

      {/* 펼침 영역 */}
      {open && detail && (
        <DetailTable>
          <DetailRow
            label="기초공제 (§18①)"
            value={formatKRW(detail.basicDeduction)}
          />
          <DetailRow
            label="인적공제 합계 (§20①)"
            value={formatKRW(detail.personalDeductionTotal)}
            indent
            muted
          />
          <SubTotalRow
            label="항목별 소계"
            value={formatKRW(detail.itemizedSubtotal)}
          />
          <DetailRow
            label="일괄공제 (§21①)"
            value={formatKRW(detail.lumpSumAmount)}
          />
          <SubTotalRow
            label={`적용 (Max) — ${detail.selectedMethod === "lump_sum" ? "일괄공제 선택" : "항목별 선택"}`}
            value={formatKRW(detail.selectedAmount)}
            tone="blue"
          />
          {detail.selectedMethod === "lump_sum" && (
            <div className="px-3 py-1.5 text-caption text-muted-foreground">
              {detail.forcedByUnfiled
                ? "무신고로 일괄공제 5억원 고정 (§21① 단서) — 기초·인적공제 합계가 5억을 초과해도 5억만 적용"
                : "기초·인적공제 합계보다 일괄공제가 크므로 일괄공제 적용 (§21①)"}
            </div>
          )}
          {detail.spouseSoleHeirExclusion && (
            <div className="px-3 py-1.5 text-caption text-amber-700 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20">
              ⓘ 배우자 단독상속 — 일괄공제 배제 (§21②), 기초+인적공제만 적용
            </div>
          )}
        </DetailTable>
      )}
    </>
  );
}
