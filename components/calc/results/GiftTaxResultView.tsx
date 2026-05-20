"use client";

/**
 * GiftTaxResultView — 증여세 계산 결과 화면 (#37)
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { GiftTaxResult, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { GiftTaxFilingFormTable } from "@/components/calc/results/GiftTaxFilingFormTable";
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";
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
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mr-1 mb-1">
      {law}
    </span>
  );
}

// ============================================================
// 연부연납 안내 (증여세는 5년, 일반)
// ============================================================

function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax, isFamilyBusiness: false });
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
        {/* 납세담보 */}
        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
          <p className="font-medium text-gray-700 dark:text-gray-200">납세담보 제공 (상증법 §71 ②)</p>
          <div className="flex justify-between">
            <span>현금·예금·보증보험</span>
            <span className="font-medium">세액의 110%</span>
          </div>
          <div className="flex justify-between">
            <span>기타 재산 (부동산·유가증권 등)</span>
            <span className="font-medium">세액의 120%</span>
          </div>
          <p className="text-amber-600 dark:text-amber-400">
            ※ 연부연납 허가 신청 시 납세담보를 함께 제공해야 함
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: GiftTaxResult;
  onReset: () => void;
  onBack: () => void;
  /** 1단계로 이동 (입력값 보존) */
  onGoToFirst?: () => void;
  showLoginPrompt?: boolean;
  /** 증여재산 원본 목록 — 평가내역에서 ID 대신 자산명 표시용 */
  estateItems?: EstateItem[];
  /** 사전증여 입력 원본 — 출처(📋 이력 기반) 배지 표시용 (Phase 2) */
  priorGifts?: Array<{
    giftDate: string;
    giftAmount: number;
    sourceCalculationId?: string;
    donor?: string;
  }>;
}

export function GiftTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  showLoginPrompt = false,
  estateItems = [],
  priorGifts = [],
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showValuation, setShowValuation] = useState(false);

  const taxBeforeCredit = result.computedTax + result.generationSkipSurcharge;
  const hasFilingFormTable =
    result.filingFormRows && result.filingFormRows.length > 0;

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
      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-5">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">
          증여세 결정세액
        </p>
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
              <span>세액공제</span>
              <p className="font-semibold text-blue-600 dark:text-blue-400 text-base mt-0.5">
                - {formatKRW(result.totalTaxCredit)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Phase B: 신고서 양식 표 (12행 / 18행) */}
      {hasFilingFormTable && <GiftTaxFilingFormTable result={result} />}

      {/* 사전증여 합산 — 이력 출처 배지 (Phase 2) */}
      {priorGifts.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-violet-50 dark:bg-violet-900/20 px-4 py-3">
            <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
              사전증여 합산 내역 (§47)
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {priorGifts.map((pg, i) => (
              <li
                key={`${pg.giftDate}-${i}`}
                className="px-4 py-2 flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {pg.giftDate} {pg.donor && `· ${pg.donor}`}
                  </span>
                  {pg.sourceCalculationId && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-800 rounded px-1.5 py-0.5"
                      title="저장된 증여세 이력에서 자동 입력된 회차"
                    >
                      📋 이력
                    </span>
                  )}
                </div>
                <span className="font-medium">{formatKRW(pg.giftAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 과세 요약 */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">증여세 과세 요약</h3>
        </div>
        <div className="divide-y divide-border">
          <Row label="증여재산가액" value={formatKRW(result.grossGiftValue)} />
          {result.exemptAmount > 0 && (
            <Row
              label="비과세 차감"
              value={`- ${formatKRW(result.exemptAmount)}`}
              sub
              deduction
            />
          )}
          {result.aggregatedGiftValue > result.grossGiftValue && (
            <Row
              label="10년 합산 증여가액"
              value={formatKRW(result.aggregatedGiftValue)}
              highlight
            />
          )}
          <Row
            label="증여재산공제"
            value={`- ${formatKRW(result.totalDeduction)}`}
            sub
            deduction
          />
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

      {/* 세액공제 상세 — §28·§69 산출근거 펼침 (priorGiftCreditDetail + computedTax 전달) */}
      {result.totalTaxCredit > 0 && (
        <TaxCreditBreakdownCard
          credit={result.creditDetail}
          taxBeforeCredit={taxBeforeCredit}
          priorGiftCreditDetail={result.priorGiftCreditDetail}
          computedTax={result.computedTax}
        />
      )}

      {/* 증여공제 상세 */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>증여재산공제 상세</span>
          <span>{showBreakdown ? "▲" : "▼"}</span>
        </button>
        {showBreakdown && (
          <div className="divide-y divide-border text-xs">
            {result.deductionDetail.breakdown.map((step, i) => {
              const isNegative = step.amount < 0;
              const isFinal = step.label.startsWith("증여재산공제 적용액") || step.label.startsWith("혼인") || step.label.startsWith("출산");
              return (
                <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${isFinal ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                  <div>
                    <span className={`${isFinal ? "font-medium text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                      {isFinal ? "▶ " : isNegative ? "- " : "  "}{step.label}
                    </span>
                    {step.note && (
                      <p className="text-xs text-gray-400 mt-0.5">{step.note}</p>
                    )}
                    {step.lawRef && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{step.lawRef}</p>
                    )}
                  </div>
                  <span className={`font-mono font-medium ${isNegative ? "text-red-600 dark:text-red-400" : isFinal ? "text-blue-700 dark:text-blue-300" : ""}`}>
                    {isNegative ? `- ${formatKRW(Math.abs(step.amount))}` : formatKRW(step.amount)}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50 font-semibold text-sm border-t-2 border-border">
              <span>공제 합계</span>
              <span className="font-mono">{formatKRW(result.totalDeduction)}</span>
            </div>
          </div>
        )}
      </div>

      {/* 증여재산 및 평가명세서 (별지 제10호서식 부표 1) */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowValuation((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
        >
          <span>
            증여재산 및 평가명세서 (별지 제10호서식 부표 1) — {result.valuationResults.length}건
          </span>
          <span>{showValuation ? "▲" : "▼"}</span>
        </button>
        <div className={showValuation ? "block p-4" : "hidden print:block print:p-0"}>
          <GiftTaxValuationFormTable
            valuationResults={result.valuationResults}
            estateItems={estateItems}
            grossGiftValue={result.grossGiftValue}
            exemptAmount={result.exemptAmount}
            aggregatedGiftValue={result.aggregatedGiftValue}
            publicInterestExclusion={result.publicInterestExclusion}
            publicTrustExclusion={result.publicTrustExclusion}
            disabledTrustExclusion={result.disabledTrustExclusion}
            priorGifts={priorGifts.map((pg) => ({
              giftDate: pg.giftDate,
              giftAmount: pg.giftAmount,
              isHeir: false,
              giftTaxPaid: 0,
            }))}
          />
        </div>
      </div>

      {/* 연부연납 안내 */}
      <InstallmentGuide finalTax={result.finalTax} />

      {/* 경고 */}
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
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1 rounded-md border border-border py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors"
          aria-label="바로 앞 단계로 돌아가기"
        >
          <ChevronLeft className="w-4 h-4" />
          뒤로 가기
        </button>
        <button
          type="button"
          onClick={onGoToFirst ?? onBack}
          className="flex-1 min-w-[120px] rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          다시 계산
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 min-w-[120px] rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}
