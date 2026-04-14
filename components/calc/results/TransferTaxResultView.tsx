"use client";

/**
 * 양도소득세 계산 결과 화면
 * ResultView + Row 헬퍼 컴포넌트
 */

import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2.5",
        highlight && "bg-muted/50 font-semibold",
        sub && "pl-7 text-muted-foreground",
      )}
    >
      <span className={sub ? "text-xs" : ""}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

interface Props {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onLoginPrompt?: boolean;
}

export function TransferTaxResultView({ result, onReset, onBack, onLoginPrompt = false }: Props) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="space-y-5">
      {/* PDF 인쇄 버튼 */}
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
      {result.isExempt ? (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {result.exemptReason ?? "비과세"}
          </p>
          <p className="text-2xl font-bold mt-1">납부세액 0원</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
          <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
          <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
          <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
            <span>결정세액 {formatKRW(result.determinedTax)}</span>
            <span>+</span>
            <span>지방소득세 {formatKRW(result.localIncomeTax)}</span>
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      {!result.isExempt && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          <Row label="양도차익" value={formatKRW(result.transferGain)} />
          {result.taxableGain !== result.transferGain && (
            <Row label="과세 양도차익 (12억 초과분)" value={formatKRW(result.taxableGain)} sub />
          )}
          <Row
            label={`장기보유특별공제 (${formatRate(result.longTermHoldingRate)})`}
            value={
              result.longTermHoldingDeduction > 0
                ? `- ${formatKRW(result.longTermHoldingDeduction)}`
                : "해당없음"
            }
          />
          <Row
            label="기본공제"
            value={result.basicDeduction > 0 ? `- ${formatKRW(result.basicDeduction)}` : "0원"}
          />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row
            label={`산출세액 (${formatRate(result.appliedRate)}${result.surchargeRate ? ` + 중과 ${formatRate(result.surchargeRate)}` : ""})`}
            value={formatKRW(result.calculatedTax)}
          />
          {result.reductionAmount > 0 && (
            <Row
              label={`감면 (${result.reductionType ?? ""})`}
              value={`- ${formatKRW(result.reductionAmount)}`}
            />
          )}
          <Row label="결정세액" value={formatKRW(result.determinedTax)} highlight />
          <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} />
        </div>
      )}

      {/* 중과세 정보 */}
      {result.surchargeType && !result.isSurchargeSuspended && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠️ 중과세 적용 —{" "}
            {result.surchargeType === "multi_house_2"
              ? "2주택"
              : result.surchargeType === "multi_house_3plus"
                ? "3주택+"
                : "비사업용토지"}{" "}
            (+{formatRate(result.surchargeRate ?? 0)})
          </p>
        </div>
      )}
      {result.isSurchargeSuspended && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-400">
            ℹ️ 다주택 중과세 유예 기간 적용 — 일반세율로 계산됩니다.
          </p>
        </div>
      )}

      {/* 다주택 중과세 상세 결과 */}
      {result.multiHouseSurchargeDetail && (
        <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
      )}

      {/* 비사업용토지 판정 상세 결과 */}
      {result.nonBusinessLandJudgmentDetail && (
        <div>
          <p className="text-sm font-medium mb-2">비사업용토지 판정 결과</p>
          <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} />
        </div>
      )}

      {/* 계산 과정 토글 */}
      <button
        type="button"
        onClick={() => setShowSteps((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <span>계산 과정 상세 보기</span>
        <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
      </button>

      {showSteps && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          {result.steps.map((step, i) => (
            <div key={i} className="px-4 py-3 flex justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                {step.legalBasis && (
                  <span className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">
                    {step.legalBasis}
                  </span>
                )}
              </div>
              <p className="font-mono font-medium shrink-0">{formatKRW(step.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* 비로그인 안내 */}
      {onLoginPrompt && <LoginPromptBanner hasPendingResult />}

      {/* 하단 버튼 */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          다시 계산하기
        </button>
      </div>
    </div>
  );
}
