"use client";

/**
 * DeductionBreakdownSection — 상속공제 상세 내역 섹션
 * 원본 InheritanceTaxResultView.tsx:583~668 이관
 * 7개 DetailCard 조립 + §24 한도 통합
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type {
  InheritanceTaxResult,
  EstateItem,
  DebtItem,
  CalculationStep,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { Row } from "./shared";
import { LumpSumDetailCard } from "./LumpSumDetailCard";
import { SpouseDeductionDetailCard } from "./SpouseDeductionDetailCard";
import { FinancialDeductionDetailCard } from "./FinancialDeductionDetailCard";
import { CohabitDeductionDetailCard } from "./CohabitDeductionDetailCard";
import { FamilyBusinessDetailCard } from "./FamilyBusinessDetailCard";
import { FarmingDeductionDetailCard } from "./FarmingDeductionDetailCard";
import { DeductionLimitDetailCard } from "./DeductionLimitDetailCard";
import {
  isSection22MajorShareholderExcluded,
} from "@/lib/calc/financial-deduction-resolver";

interface Props {
  result: InheritanceTaxResult;
  estateItems?: EstateItem[];
  debtItems?: DebtItem[];
}

export function DeductionBreakdownSection({ result, estateItems, debtItems }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const dd = result.deductionDetail;

  // §22② 최대주주 제외 자산 존재 여부
  const hasSection22Excluded = (estateItems ?? []).some(isSection22MajorShareholderExcluded);

  return (
    <div
      className="border rounded-xl overflow-hidden"
      data-testid="deduction-breakdown-section"
    >
      {/* 헤더 토글 */}
      <button
        type="button"
        onClick={() => setShowBreakdown((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        data-testid="deduction-breakdown-toggle"
      >
        <span>상속공제 상세 내역</span>
        <span>{showBreakdown ? "▲" : "▼"}</span>
      </button>

      {showBreakdown && (
        <div className="divide-y divide-border text-xs">
          {/* ① 일괄공제 또는 기초+인적 */}
          {dd.chosenMethod === "lump_sum" ? (
            <LumpSumDetailCard
              detail={dd.lumpSumComparisonDetail}
              triggerLabel="일괄공제 (§21)"
              triggerValue={formatKRW(dd.lumpSumDeduction)}
            />
          ) : (
            <>
              {dd.lumpSumExcludedBySpouseSoleHeir && (
                <Row label="ⓘ 배우자 단독상속 — 일괄공제 배제 (§21②)" value="기초+인적만" />
              )}
              <LumpSumDetailCard
                detail={dd.lumpSumComparisonDetail}
                triggerLabel="기초공제 (§18)"
                triggerValue={formatKRW(dd.basicDeduction)}
              />
              {/* ③ 배우자공제 */}
              <SpouseDeductionDetailCard
                detail={dd.spouseDeductionDetail}
                triggerLabel="배우자 공제 (§19)"
                triggerValue={formatKRW(dd.spouseDeduction)}
              />
              <Row
                label="인적공제 합계 (§20)"
                value={formatKRW(dd.personalDeductionTotal)}
              />
            </>
          )}

          {/* ② 가업상속공제 */}
          {(dd.familyBusinessDeduction > 0 || dd.familyBusinessDetail !== undefined) && (
            <FamilyBusinessDetailCard
              detail={dd.familyBusinessDetail}
              triggerLabel="가업상속 공제 (§18의2)"
              triggerValue={formatKRW(dd.familyBusinessDeduction)}
            />
          )}

          {/* 영농상속공제 */}
          {(dd.farmingDeduction > 0 || dd.farmingDetail !== undefined) && (
            <FarmingDeductionDetailCard
              detail={dd.farmingDetail}
              triggerLabel="영농상속 공제 (§18의3)"
              triggerValue={formatKRW(dd.farmingDeduction)}
            />
          )}

          {/* ④ 금융재산공제 */}
          {(dd.financialDeduction > 0 || hasSection22Excluded) && (
            <FinancialDeductionDetailCard
              detail={dd.financialDeductionDetail}
              triggerLabel="금융재산 공제 (§22)"
              triggerValue={formatKRW(dd.financialDeduction)}
              estateItems={estateItems}
              debtItems={debtItems}
            />
          )}

          {/* ⑤ 동거주택공제 */}
          {dd.cohabitationDeduction > 0 && (
            <CohabitDeductionDetailCard
              detail={dd.cohabitDeductionDetail}
              triggerLabel="동거주택 공제 (§23의2)"
              triggerValue={formatKRW(dd.cohabitationDeduction)}
            />
          )}

          {/* 공제 합계 */}
          <Row label="공제 합계" value={formatKRW(result.totalDeduction)} highlight />

          {/* ⑥ §24 종합한도 detail (deductionLimitDetail 있을 때만) */}
          {dd.deductionLimitDetail && (
            <DeductionLimitDetailCard
              detail={dd.deductionLimitDetail}
              rawTotalDeduction={dd.rawTotalDeduction}
            />
          )}
        </div>
      )}

      {/* §24 종합한도 발동 시 안내 (detail 없는 legacy 케이스 — breakdown 파싱) */}
      {!dd.deductionLimitDetail && (
        <LegacyDeductionLimitNotice breakdown={dd.breakdown} />
      )}
    </div>
  );
}

// ============================================================
// Legacy 종합한도 안내 (deductionLimitDetail 없는 케이스)
// breakdown 파싱 — 기존 DeductionLimitNoticeCard 동일 로직
// ============================================================

function LegacyDeductionLimitNotice({ breakdown }: { breakdown: CalculationStep[] }) {
  const limitLine = breakdown.find((s) => s.label?.includes("한도 초과"));
  if (!limitLine) return null;

  const ceilingLine = breakdown.find((s) => s.label?.includes("§24 종합한도"));
  const rawTotalLine = breakdown.find((s) => s.label === "공제 소계");

  const ceiling = ceilingLine?.amount ?? limitLine.amount;
  const rawTotal = rawTotalLine?.amount ?? limitLine.amount;
  const cappedAmount = limitLine.amount;
  const excludedAmount = Math.max(0, rawTotal - cappedAmount);

  return (
    <div
      data-testid="deduction-limit-notice"
      className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5 print:bg-amber-50 print:border-amber-300"
    >
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
        ⓘ §24 종합한도 적용 — 공제 한도 초과
      </p>
      <ul className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5 list-disc list-inside">
        <li>공제 신청 합계: <span className="font-medium">{formatKRW(rawTotal)}</span></li>
        <li>§24 한도(과세가액 − 사전증여 등): <span className="font-medium">{formatKRW(ceiling)}</span></li>
        <li>한도 적용 공제: <span className="font-medium">{formatKRW(cappedAmount)}</span></li>
        <li>미적용 차감: <span className="font-medium">{formatKRW(excludedAmount)}</span></li>
      </ul>
      <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
        상속세및증여세법 §24 — 상속공제 총액은 상속세 과세가액에서 상속인·수유자에 대한 사전증여재산
        가산액(증여재산공제·재해손실공제 차감) 및 상속인 외 자에 대한 유증액을 차감한 금액을 한도로 합니다.
      </p>
    </div>
  );
}
