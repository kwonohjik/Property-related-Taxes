"use client";

/**
 * BurdenedTransferTaxResultCard — 부담부증여 양도소득세 결과 카드
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-tax.ui.design.md §4
 * 위치: GiftTaxResultView.tsx — 최종 납부세액 합산 이후 삽입
 *
 * 규칙:
 *   - feedback_result_view_korean_formula: 변수 약어·floor() 금지, 한국어 법정 용어
 *   - feedback_no_won_suffix: 숫자 끝 "원" 생략
 *   - feedback_result_expand_toggle_standard: ExpandToggleButton (sky tone)
 *   - feedback_tailwind_static_tone_mapping: 정적 클래스 (동적 ${tone} 금지)
 *   - feedback_no_internal_id_in_result: 내부 id 노출 금지
 */

import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";

// ─── 행 컴포넌트 ─────────────────────────────────────────────────────────────

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
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums text-sm text-right ${
          deduction ? "text-blue-600 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── 단건 카드 ────────────────────────────────────────────────────────────────

function SingleTransferResultCard({
  result,
  index,
}: {
  result: TransferTaxResult;
  index: number;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  const title =
    index === 0
      ? "부담부증여 양도소득세 (채무인수분)"
      : `부담부증여 양도소득세 ${index + 1}번째 자산`;

  if (result.isExempt) {
    return (
      <div className="border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden">
        <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-200">
            {title}
          </h4>
          <span className="text-xs text-sky-600 dark:text-sky-300">
            비과세
          </span>
        </div>
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {result.exemptReason ?? "1세대 1주택 비과세 요건을 충족합니다."}
        </div>
      </div>
    );
  }

  // 세율 표시 — 누진세율은 %
  const rateDisplay = `${(result.appliedRate * 100).toFixed(0)}%`;

  return (
    <div className="border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-200">
          {title}
        </h4>
        <ExpandToggleButton
          open={detailOpen}
          onClick={() => setDetailOpen((p) => !p)}
          tone="sky"
        />
      </div>

      {/* 최종 납부세액 요약 */}
      <div className="divide-y divide-border">
        <Row label="양도차익" value={formatKRW(result.transferGain)} />
        <Row
          label="과세 양도차익"
          value={formatKRW(result.taxableGain)}
          sub
        />
        {result.longTermHoldingDeduction > 0 && (
          <Row
            label={`장기보유특별공제 (${(result.longTermHoldingRate * 100).toFixed(0)}%)`}
            value={`(−) ${formatKRW(result.longTermHoldingDeduction)}`}
            sub
            deduction
          />
        )}
        <Row label="양도소득 과세표준" value={formatKRW(result.taxBase)} highlight />
        <Row
          label={`산출세액 (세율 ${rateDisplay})`}
          value={formatKRW(result.calculatedTax)}
        />
        {result.reductionAmount > 0 && (
          <Row
            label="감면세액"
            value={`(−) ${formatKRW(result.reductionAmount)}`}
            deduction
          />
        )}
        <Row label="결정세액" value={formatKRW(result.determinedTax)} highlight />
        {result.penaltyTax > 0 && (
          <Row
            label="신축·증축 가산세 (§114조의2 · 건물 환산취득가 × 5%)"
            value={formatKRW(result.penaltyTax)}
            sub
          />
        )}
        <Row
          label={
            result.penaltyTax > 0
              ? "지방소득세 ((결정세액+가산세) × 10%)"
              : "지방소득세 (10%)"
          }
          value={formatKRW(result.localIncomeTax)}
          sub
        />
        <Row
          label="총 납부세액"
          value={formatKRW(result.totalTax)}
          highlight
        />
      </div>

      {/* 상세 펼침 — §159 안분비율 + 산식 */}
      {detailOpen && (
        <div className="border-t border-sky-200 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-900/10 px-4 py-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <p className="font-semibold text-sky-700 dark:text-sky-300 mb-1">
            산식 상세 (소령 §159①1호 안분)
          </p>
          <p>
            채무인수분은 소득세법 §88에 따라 유상양도로 봅니다.
            취득가액·양도가액은 소령 §159①1호에 따라{" "}
            <span className="font-medium">채무액 ÷ 증여재산가액</span>
            으로 안분합니다.
          </p>
          {/* 취득가액 산정 경로 — 3경로 표시 */}
          {(() => {
            const brkd = result.transferBurdenedGiftBreakdown;
            const method = brkd?.acquisitionMethodUsed;
            const land = brkd?.perAsset.land;
            const bldg = brkd?.perAsset.building;
            const deductionTotal =
              (land?.estimatedDeduction ?? 0) + (bldg?.estimatedDeduction ?? 0);

            if (method === "actual") {
              return (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  ※ 취득가액 산정: 실지취득가액 × 채무 ÷ 시가 (소령 §159①1호 A괄호 — K-4)
                  {deductionTotal > 0
                    ? ` / 자본적 지출·양도비 ${formatKRW(deductionTotal)}`
                    : ""}
                </p>
              );
            }
            if (method === "converted") {
              return (
                <p className="mt-1 text-sky-700 dark:text-sky-300">
                  ※ 취득가액 산정: 취득시 기준시가 ÷ 양도시 기준시가 × 시가 (소령 §176의2②2호 — K-5)
                  {deductionTotal > 0
                    ? ` + 개산공제 ${formatKRW(deductionTotal)} (소법 §163⑥)`
                    : " + 소법 §163⑥ 개산공제 적용"}
                </p>
              );
            }
            // standard_price 또는 미확인(구버전 결과)
            return (
              <p className="mt-1">
                취득가액 산정: 취득시 기준시가 × 채무 ÷ 증여재산 기준시가 (소령 §159①1호 — K-1~K-3)
              </p>
            );
          })()}
          <p className="mt-1">
            장기보유특별공제:{" "}
            {result.longTermHoldingDeduction > 0
              ? `양도차익 × ${(result.longTermHoldingRate * 100).toFixed(0)}%`
              : "해당 없음"}
          </p>
          <p>
            산출세액: 과세표준 × {rateDisplay}
            {result.progressiveDeduction > 0
              ? ` − 누진공제 ${formatKRW(result.progressiveDeduction)}`
              : ""}
          </p>
          {result.warnings && result.warnings.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-amber-600 dark:text-amber-400">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  transferTaxResults: TransferTaxResult[];
}

export function BurdenedTransferTaxResultCard({ transferTaxResults }: Props) {
  if (transferTaxResults.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
        부담부증여 양도소득세 (소득세법 §88 · 소령 §159)
      </h3>
      {transferTaxResults.map((r, i) => (
        <SingleTransferResultCard key={i} result={r} index={i} />
      ))}
    </div>
  );
}
