"use client";

/**
 * InheritanceTaxResultView — 상속세 계산 결과 화면 (#36)
 */

import { useState } from "react";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";

// ============================================================
// 헬퍼 컴포넌트
// ============================================================

function Row({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={`font-mono text-sm ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function LawBadge({ law }: { law: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 mr-1 mb-1">
      {law}
    </span>
  );
}

// ============================================================
// 연부연납 안내
// ============================================================

function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax });
  if (!result.eligible) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          연부연납 안내 (상증법 §71)
        </h4>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          결정세액 2천만원 초과 시 최대 5년 분할납부 가능
        </p>
      </div>
      <div className="p-3 text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>허가 즉시 납부</span>
          <span className="font-medium">{formatKRW(result.initialPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span>연간 납부 원금 ({result.appliedYears}회)</span>
          <span className="font-medium">{formatKRW(result.annualPrincipal)}</span>
        </div>
        <p className="text-amber-600 dark:text-amber-400 mt-1">
          ※ 이자 상당액(연 1.8% 기준) 별도 납부 — 세무사 확인 권장
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: InheritanceTaxResult;
  onReset: () => void;
  onBack: () => void;
  showLoginPrompt?: boolean;
}

export function InheritanceTaxResultView({
  result,
  onReset,
  onBack,
  showLoginPrompt = false,
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showValuation, setShowValuation] = useState(false);

  const taxBeforeCredit = result.computedTax + result.generationSkipSurcharge;

  return (
    <div className="space-y-5">
      {/* PDF 버튼 */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ PDF / 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
        <p className="text-sm font-medium text-muted-foreground mb-1">상속세 결정세액</p>
        <p className="text-4xl font-bold tracking-tight">{formatKRW(result.finalTax)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span>산출세액</span>
            <p className="font-semibold text-foreground text-base mt-0.5">
              {formatKRW(result.computedTax)}
            </p>
          </div>
          {result.generationSkipSurcharge > 0 && (
            <div>
              <span>세대생략 할증</span>
              <p className="font-semibold text-amber-600 dark:text-amber-400 text-base mt-0.5">
                + {formatKRW(result.generationSkipSurcharge)}
              </p>
            </div>
          )}
          {result.totalTaxCredit > 0 && (
            <div>
              <span>세액공제 합계</span>
              <p className="font-semibold text-blue-600 dark:text-blue-400 text-base mt-0.5">
                - {formatKRW(result.totalTaxCredit)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 과세 요약 */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">상속세 과세 요약</h3>
        </div>
        <div className="divide-y divide-border">
          <Row label="상속재산 평가액" value={formatKRW(result.grossEstateValue)} />
          {result.exemptAmount > 0 && (
            <Row label="비과세 차감" value={`- ${formatKRW(result.exemptAmount)}`} sub deduction />
          )}
          {result.deductedBeforeAggregation > 0 && (
            <Row
              label="장례비·채무 차감"
              value={`- ${formatKRW(result.deductedBeforeAggregation)}`}
              sub
              deduction
            />
          )}
          {result.priorGiftAggregated > 0 && (
            <Row
              label="사전증여재산 합산"
              value={`+ ${formatKRW(result.priorGiftAggregated)}`}
              sub
            />
          )}
          <Row label="상속세 과세가액" value={formatKRW(result.taxableEstateValue)} highlight />
          <Row label="상속공제 합계" value={`- ${formatKRW(result.totalDeduction)}`} sub deduction />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row label="산출세액 (누진세율)" value={formatKRW(result.computedTax)} />
          {result.generationSkipSurcharge > 0 && (
            <Row
              label="세대생략 할증 (30% / 40%)"
              value={`+ ${formatKRW(result.generationSkipSurcharge)}`}
            />
          )}
          {result.totalTaxCredit > 0 && (
            <Row
              label="세액공제"
              value={`- ${formatKRW(result.totalTaxCredit)}`}
              deduction
            />
          )}
          <Row label="결정세액" value={formatKRW(result.finalTax)} highlight />
        </div>
      </div>

      {/* 세액공제 상세 */}
      {result.totalTaxCredit > 0 && (
        <TaxCreditBreakdownCard
          credit={result.creditDetail}
          taxBeforeCredit={taxBeforeCredit}
        />
      )}

      {/* 공제 내역 접기 */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>상속공제 상세 내역</span>
          <span>{showBreakdown ? "▲" : "▼"}</span>
        </button>
        {showBreakdown && (
          <div className="divide-y divide-border text-xs">
            {result.deductionDetail.chosenMethod === "lump_sum" ? (
              <Row label="일괄공제 (§21)" value={formatKRW(result.deductionDetail.lumpSumDeduction)} />
            ) : (
              <>
                <Row label="기초공제 (§18)" value={formatKRW(result.deductionDetail.basicDeduction)} />
                <Row label="배우자 공제 (§19)" value={formatKRW(result.deductionDetail.spouseDeduction)} />
                <Row
                  label="인적공제 합계 (§20)"
                  value={formatKRW(result.deductionDetail.personalDeductionTotal)}
                />
              </>
            )}
            {result.deductionDetail.financialDeduction > 0 && (
              <Row
                label="금융재산 공제 (§22)"
                value={formatKRW(result.deductionDetail.financialDeduction)}
              />
            )}
            {result.deductionDetail.cohabitationDeduction > 0 && (
              <Row
                label="동거주택 공제 (§23의2)"
                value={formatKRW(result.deductionDetail.cohabitationDeduction)}
              />
            )}
            {result.deductionDetail.farmingDeduction > 0 && (
              <Row label="영농상속 공제 (§23)" value={formatKRW(result.deductionDetail.farmingDeduction)} />
            )}
            {result.deductionDetail.familyBusinessDeduction > 0 && (
              <Row
                label="가업상속 공제 (§18의2)"
                value={formatKRW(result.deductionDetail.familyBusinessDeduction)}
              />
            )}
            <Row label="공제 합계" value={formatKRW(result.totalDeduction)} highlight />
          </div>
        )}
      </div>

      {/* 재산 평가 내역 */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowValuation((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>재산 평가 내역 ({result.valuationResults.length}건)</span>
          <span>{showValuation ? "▲" : "▼"}</span>
        </button>
        {showValuation && (
          <div className="divide-y divide-border text-xs">
            {result.valuationResults.map((vr, i) => (
              <div key={i} className="px-4 py-2.5 space-y-0.5">
                <div className="flex justify-between font-medium text-sm">
                  <span>{vr.estateItemId}</span>
                  <span>{formatKRW(vr.valuatedAmount)}</span>
                </div>
                <p className="text-gray-400">
                  평가방법:{" "}
                  {{
                    market_value: "시가",
                    appraisal: "감정평가",
                    standard_price: "보충적 평가",
                    similar_sales: "유사매매사례",
                    acquisition_cost: "취득가액",
                    book_value: "장부가액",
                  }[vr.method]}
                </p>
                {vr.warnings.map((w, j) => (
                  <p key={j} className="text-amber-600 dark:text-amber-400">
                    ⚠️ {w}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 연부연납 안내 */}
      <InstallmentGuide finalTax={result.finalTax} />

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            주의 사항
          </h4>
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                ⚠️ {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 근거 조문 */}
      {result.appliedLaws.length > 0 && (
        <div className="flex flex-wrap">
          {result.appliedLaws.map((law) => (
            <LawBadge key={law} law={law} />
          ))}
        </div>
      )}

      {/* 로그인 유도 */}
      {showLoginPrompt && <LoginPromptBanner />}

      {/* 면책고지 */}
      <DisclaimerBanner />

      {/* 버튼 */}
      <div className="flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          다시 계산
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
