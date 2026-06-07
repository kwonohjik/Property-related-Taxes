"use client";

/**
 * CohabitDeductionDetailCard — ⑤ 동거주택공제 펼침 (§23의2)
 * 소비: result.deductionDetail.cohabitDeductionDetail
 *
 * Phase 2 (2026-06-07): cohabitYears echo 표시 + meetsRequirement=false 경고
 * Phase 3 (2026-06-07): ancillaryLandLimitReduction 표시 (>0 차감 / =0 한도 이내)
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

  const cy = detail?.cohabitYears;

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          {/* meetsRequirement=false 경고 배지 */}
          {cy && !cy.meetsRequirement && (
            <span
              className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded px-1.5 py-0.5"
              data-testid="cohabit-years-warning-badge"
            >
              동거 {cy.effectiveYears}년 (10년 미달)
            </span>
          )}
          <span className="font-mono text-sm">{triggerValue}</span>
          {detail && <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />}
        </span>
      </div>

      {open && detail && (
        <DetailTable>
          {/* Phase 2: G3 동거연수 echo */}
          {cy && (
            <>
              <DetailRow
                label="동거 시작일 기준 산입 연수"
                value={`${cy.rawYears}년`}
              />
              {cy.minorYearsDeducted > 0 && (
                <DetailRow
                  label="(−) 미성년자 기간 제외 (§23의2①1호, 2016~)"
                  value={`− ${cy.minorYearsDeducted}년`}
                  indent
                  muted
                  deduction
                />
              )}
              <SubTotalRow
                label="유효 동거연수"
                value={`${cy.effectiveYears}년`}
                tone={cy.meetsRequirement ? "blue" : "amber"}
              />
              {!cy.meetsRequirement && (
                <DetailRow
                  label="⚠ 10년 미달 — 요건 충족 여부 확인 필요"
                  value=""
                  muted
                />
              )}
            </>
          )}

          <DetailRow
            label="동거주택 공시가격 (평가액)"
            value={formatKRW(detail.housingValue)}
          />
          {/* Phase 3: G4 부수토지 면적한도 — 초과 차감 또는 한도 이내(차감 없음) */}
          {detail.ancillaryLandLimitReduction !== undefined &&
            detail.ancillaryLandLimitReduction > 0 && (
              <DetailRow
                label="(−) 주택부수토지 면적한도 초과 차감 (소득세 시행령 §154⑦)"
                value={`− ${formatKRW(detail.ancillaryLandLimitReduction)}`}
                indent
                muted
                deduction
              />
            )}
          {detail.ancillaryLandLimitReduction === 0 && (
            <DetailRow
              label="주택부수토지 면적 한도 이내 (소득세 시행령 §154⑦)"
              value="차감 없음"
              indent
              muted
            />
          )}
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
