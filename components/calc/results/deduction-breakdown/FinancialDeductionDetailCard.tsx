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
import { DetailTable, DetailRow, SubTotalRow, ExpandButton, PrintExpandable } from "./shared";

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

      <PrintExpandable open={open}>
        <>
          {/* §22 대상 자산/채무 카운트 안내 */}
          {hasCountInfo && (
            <div className="px-4 pb-1 -mt-1 space-y-0.5">
              {(eligibleAssets.length > 0 || eligibleDebts.length > 0) && (
                <p className="text-caption text-gray-500 dark:text-gray-400 pl-3">
                  ⓘ §22 대상: 자산 {eligibleAssets.length}건 ({formatKRW(assetTotal)}) − 채무{" "}
                  {eligibleDebts.length}건 ({formatKRW(debtTotal)})
                </p>
              )}
              {excludedBySection22.length > 0 && (
                <p
                  className="text-caption text-rose-600 dark:text-rose-400 pl-3"
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
              <div className="px-3 py-1 text-caption font-semibold text-muted-foreground bg-muted/30">
                공제 산식
              </div>
              <DetailRow
                label={`적용 구간: ${TIER_LABELS[detail.bracket] ?? detail.bracket}`}
                value=""
                muted
              />
              {detail.bracket === "tier3" && (
                <DetailRow
                  label={`㉠ 순금융재산 × ${(detail.rate * 100).toFixed(0)}% (§22 ①1호 — 20%와 2천만원 중 큰 금액)`}
                  value={formatKRW(detail.rawDeduction)}
                  indent
                />
              )}
              {/* 호 번호는 법문 그대로다 — §22①
                    1호: 순금융재산 > 2천만 → MAX(20%, 2천만)  ⇒ tier2(2천만 고정)·tier3(20%)
                    2호: 순금융재산 ≤ 2천만 → 전액             ⇒ tier1
                  종전에는 tier1에 1호, tier2에 2호를 달아 서로 뒤바뀌어 있었다. */}
              {detail.bracket === "tier2" && (
                <DetailRow
                  label="㉠ 고정액 (§22 ①1호 — 20%와 2천만원 중 큰 금액)"
                  value={formatKRW(detail.rawDeduction)}
                  indent
                />
              )}
              {detail.bracket === "tier1" && (
                <DetailRow
                  label="㉠ 전액 공제 (§22 ①2호)"
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
              {/* 엔진에 2천만원 «하한(MAX)» 연산은 없다 — `Math.min(rawDeduction, FINANCIAL_MAX)`
                  하나뿐이다(inheritance-deduction-items.ts:220). 2천만원 MAX는 §22①1호 «안»의
                  두 갈래일 뿐 공제액 산식의 조건이 아니고, 최대주주 여부는 §22②의 «자산 제외»
                  규정이라 애초에 다른 축이다(그 안내는 위 §22② 배지가 맡는다).
                  산식 문구는 한국어 풀어쓰기가 정본이라 「MIN(...)」 함수 표기를 쓰지 않는다
                  (__tests__/components/minmax-function-notation-policy.test.ts). */}
              <SubTotalRow
                label="공제액 = ㉠ 산정액과 ㉡ 한도 2억 중 작은 금액"
                value={formatKRW(detail.cappedDeduction)}
                tone="blue"
              />
            </DetailTable>
          )}
        </>
      </PrintExpandable>
    </>
  );
}
