"use client";

/**
 * FinancialDeductionDetailCard — ④ 금융재산공제 펼침 (§22)
 * 소비: result.deductionDetail.financialDeductionDetail
 * 기존 FinancialDeductionCountRow (§22 대상 자산/채무 카운트 + 최대주주 제외 안내) 흡수
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { FinancialDeductionDetail } from "@/lib/tax-engine/types/inheritance-deduction-detail.types";
import type { EstateItem, DebtItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  isSection22MajorShareholderExcluded,
  resolveFinancialDebt,
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import { getValuatedAmount } from "@/lib/calc/inheritance-deduction-suggest";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "./shared";

const TIER_LABELS: Record<string, string> = {
  tier1: "2천만 이하 — 전액 공제",
  tier2: "2천만~1억 — 2천만 고정",
  tier3: "1억 초과 — 20% 공제",
};

interface Props {
  detail?: FinancialDeductionDetail;
  triggerLabel: string;
  triggerValue: string;
  estateItems?: EstateItem[];
  debtItems?: DebtItem[];
}

export function FinancialDeductionDetailCard({
  detail,
  triggerLabel,
  triggerValue,
  estateItems,
  debtItems,
}: Props) {
  const [open, setOpen] = useState(false);

  // §22② 최대주주 제외 (기존 FinancialDeductionCountRow 로직 흡수)
  const excludedBySection22 = (estateItems ?? []).filter(isSection22MajorShareholderExcluded);
  const excludedTotal = excludedBySection22.reduce((sum, i) => sum + getValuatedAmount(i), 0);

  const eligibleAssets = (estateItems ?? []).filter(resolveFinancialEligibility);
  const eligibleDebts = (debtItems ?? []).filter(resolveFinancialDebt);
  const assetTotal = eligibleAssets.reduce((sum, i) => sum + getValuatedAmount(i), 0);
  const debtTotal = eligibleDebts.reduce((sum, d) => sum + d.amount, 0);
  const hasCountInfo =
    eligibleAssets.length > 0 || eligibleDebts.length > 0 || excludedBySection22.length > 0;

  // detail 없어도 §22② 안내는 표시
  const hasDetail = detail !== undefined;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm">{triggerValue}</span>
          {(hasDetail || hasCountInfo) && (
            <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
          )}
        </span>
      </div>

      {open && (
        <>
          {/* §22 대상 자산/채무 카운트 안내 */}
          {hasCountInfo && (
            <div className="px-4 pb-1 -mt-1 space-y-0.5">
              {(eligibleAssets.length > 0 || eligibleDebts.length > 0) && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-3">
                  ⓘ §22 대상: 자산 {eligibleAssets.length}건 ({formatKRW(assetTotal)}) − 채무{" "}
                  {eligibleDebts.length}건 ({formatKRW(debtTotal)})
                </p>
              )}
              {excludedBySection22.length > 0 && (
                <p
                  className="text-[11px] text-rose-600 dark:text-rose-400 pl-3"
                  data-testid="section22-excluded-badge"
                >
                  ⓘ 법 §22②에 따라 최대주주 보유주식 {excludedBySection22.length}건 제외 (평가액 합계{" "}
                  {formatKRW(excludedTotal)})
                </p>
              )}
            </div>
          )}

          {/* detail 산식 표 */}
          {hasDetail && detail && (
            <DetailTable>
              {/* 순금융재산 구성 rows */}
              {detail.rows.map((row, i) => {
                const isDebt = row.label.includes("채무") || row.label.includes("부채");
                return (
                  <DetailRow
                    key={i}
                    label={isDebt ? `(−) ${row.label}` : row.label}
                    value={isDebt ? `− ${formatKRW(row.amount)}` : formatKRW(row.amount)}
                    indent={isDebt}
                    muted={isDebt}
                    deduction={isDebt}
                  />
                );
              })}
              <SubTotalRow
                label="순금융재산"
                value={formatKRW(detail.netFinancial)}
              />

              {/* 공제 산식 */}
              <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground bg-muted/30">
                공제 산식
              </div>
              <DetailRow
                label={`적용 구간: ${TIER_LABELS[detail.bracket] ?? detail.bracket}`}
                value=""
                muted
              />
              {detail.bracket === "tier3" && (
                <DetailRow
                  label={`㉠ 순금융재산 × ${(detail.rate * 100).toFixed(0)}%`}
                  value={formatKRW(detail.rawDeduction)}
                  indent
                />
              )}
              {detail.bracket === "tier2" && (
                <DetailRow
                  label="㉠ 고정액 (§22 ①2호)"
                  value={formatKRW(detail.rawDeduction)}
                  indent
                />
              )}
              {detail.bracket === "tier1" && (
                <DetailRow
                  label="㉠ 전액 공제 (§22 ①1호)"
                  value={formatKRW(detail.rawDeduction)}
                  indent
                />
              )}
              <DetailRow
                label="㉡ 한도"
                value={formatKRW(detail.cap)}
                indent
                muted
              />
              <SubTotalRow
                label="최대주주가 있을 시 MAX[MIN(㉠, ㉡), 2천만]"
                value={formatKRW(detail.cappedDeduction)}
                tone="blue"
              />
            </DetailTable>
          )}
        </>
      )}
    </>
  );
}
