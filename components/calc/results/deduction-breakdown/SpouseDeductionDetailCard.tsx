"use client";

/**
 * SpouseDeductionDetailCard — ③ 배우자공제 펼침 (§19)
 * 소비: result.deductionDetail.spouseDeductionDetail
 * - legalShareTable 있으면 7행 표
 * - actualAmountTable 있으면 실제상속액 3행
 * - Max[Min] 산식
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { SpouseDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

interface Props {
  detail?: SpouseDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
}

export function SpouseDeductionDetailCard({ detail, triggerLabel, triggerValue }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && detail.deduction > 0 && (
            <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
          )}
        </span>
      </div>

      {open && detail && (
        <DetailTable>
          {/* ㉮ 법정상속분 산정 (7행 — legalShareTable 있을 때만) */}
          {detail.legalShareTable && (
            <>
              <div className="px-3 py-1 text-caption font-semibold text-muted-foreground bg-muted/30">
                ㉮ 법정상속분 산정 (§19 ①1호)
              </div>
              <DetailRow
                label="총상속재산가액"
                value={formatKRW(detail.legalShareTable.grossPlusPresumed)}
              />
              <DetailRow
                label="(+) 사전증여 합산가액"
                value={`+ ${formatKRW(detail.legalShareTable.heirPriorGiftAdded)}`}
                indent
                muted
              />
              <DetailRow
                label="(−) 상속인 외 유증·증여액"
                value={`− ${formatKRW(detail.legalShareTable.legateeNonHeirDeducted)}`}
                indent
                muted
                deduction
              />
              <DetailRow
                label="(−) 채무·공과금"
                value={`− ${formatKRW(detail.legalShareTable.debtDeducted)}`}
                indent
                muted
                deduction
              />
              <DetailRow
                label="(−) 비과세·공익출연"
                value={`− ${formatKRW(detail.legalShareTable.exemptDeducted)}`}
                indent
                muted
                deduction
              />
              <SubTotalRow
                label="분자 (상속재산가액 기준)"
                value={formatKRW(detail.legalShareTable.numerator)}
              />
              <DetailRow
                label={`배우자 법정지분 (× ${(detail.legalShareTable.spouseRatio * 100).toFixed(4)}%)`}
                value={formatKRW(detail.legalShareTable.spouseLegalShareRaw)}
              />
              {detail.legalShareTable.spouseGiftTaxBaseDeducted > 0 && (
                <DetailRow
                  label="(−) 배우자 사전증여 과세표준"
                  value={`− ${formatKRW(detail.legalShareTable.spouseGiftTaxBaseDeducted)}`}
                  indent
                  muted
                  deduction
                />
              )}
              <SubTotalRow
                label="배우자 법정상속분"
                value={formatKRW(detail.legalShareTable.legalShare)}
                tone="blue"
              />
            </>
          )}

          {/* legalShareTable 없는 단순 케이스 */}
          {!detail.legalShareTable && (
            <DetailRow
              label="배우자 법정상속분 (단순 케이스)"
              value={formatKRW(detail.legalShareCapped)}
            />
          )}

          {/* ㉯ 실제상속액 (actualAmountTable 있을 때만) */}
          {detail.actualAmountTable && (
            <>
              <div className="px-3 py-1 text-caption font-semibold text-muted-foreground bg-muted/30">
                ㉯ 실제상속액 (집행기준 19-17-1)
              </div>
              <DetailRow
                label="배우자 귀속 상속재산가액"
                value={formatKRW(detail.actualAmountTable.spouseEstateValue)}
              />
              {detail.actualAmountTable.spouseDebtDeducted > 0 && (
                <DetailRow
                  label="(−) 배우자 승계 채무"
                  value={`− ${formatKRW(detail.actualAmountTable.spouseDebtDeducted)}`}
                  indent
                  muted
                  deduction
                />
              )}
              {detail.actualAmountTable.spouseExemptDeducted > 0 && (
                <DetailRow
                  label="(−) 배우자 비과세 재산"
                  value={`− ${formatKRW(detail.actualAmountTable.spouseExemptDeducted)}`}
                  indent
                  muted
                  deduction
                />
              )}
              <SubTotalRow
                label="배우자 실제상속액"
                value={formatKRW(detail.actualAmountTable.actualAmount)}
                tone="blue"
              />
            </>
          )}

          {/* 30억 한도 */}
          <DetailRow
            label="30억 최고한도 (§19 ①2호)"
            value={formatKRW(detail.capAmount)}
          />

          {/* Max[Min] 산식 */}
          <div className="px-3 py-2 text-caption text-muted-foreground bg-muted/10">
            {detail.actualAmountTable
              ? `Max[Min(법정상속분 ${formatKRW(detail.legalShareCapped)}, 실제상속액 ${formatKRW(detail.actualAmountCapped)}, 30억), 5억]`
              : `Max[Min(법정상속분 ${formatKRW(detail.legalShareCapped)}, 30억), 5억]`}
            {detail.floorApplied && (
              <span className="text-amber-700 dark:text-amber-300 ml-1">→ 5억 최소보장 적용 (§19④)</span>
            )}
          </div>

          <SubTotalRow
            label="배우자공제 적용액"
            value={formatKRW(detail.deduction)}
            tone="blue"
          />
        </DetailTable>
      )}
    </>
  );
}
