"use client";

/**
 * BurdenedStockTransferTaxResultCard — 주식 부담부증여 양도소득세 결과 카드 (⑦)
 *
 * StockTransferResult 배열을 받아 자산별 결과를 표시.
 * BurdenedTransferTaxResultCard(부동산)과 동형 패턴.
 *
 * 설계: docs/02-design/features/gift-stock-burdened-transfer-tax.ui.design.md §8.4
 *
 * 결과 산식 한국어 풀어쓰기 (feedback_result_view_korean_formula):
 *   양도가액 = 채무인수액 (소령 §159①: 부담부증여 단일 자산 → 양도가액=채무액)
 *   취득가액 = 당초취득가 × (채무액/평가액)  [실지 모드]
 *            = 환산취득가 (양도가액=채무액 기반이라 이미 안분됨)  [환산 모드]
 *   필요경비 = 개산공제 1% × (채무액/평가액) (소령 §163⑥4호 · §159①)  [환산 모드]
 *   양도소득금액 = 양도가액 − 취득가액 − 필요경비
 *   양도소득 기본공제 = 2,500,000원 (§103①2호 — 주식 그룹 **과세기간당 1회**.
 *     종목이 둘 이상이면 aggregate 경로가 먼저 양도한 종목부터 소진시키므로,
 *     뒤 종목은 0이 되고 카드에 「앞 종목에서 한도 소진」으로 표시된다.)
 *   과세표준 = 양도소득금액 − 기본공제
 *   산출세액 = 과세표준 × 세율 (§104①11)
 *   지방소득세 = 산출세액 × 10%
 *   합계 = 산출세액 + 지방소득세
 *
 * 규칙:
 *   - feedback_no_won_suffix: 숫자 끝 "원" 생략
 *   - feedback_no_internal_id_in_result: 내부 id 노출 금지
 *   - feedback_result_expand_toggle_standard: ExpandToggleButton
 */

import { useState } from "react";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";

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

function SingleStockTransferResultCard({
  result,
  index,
}: {
  result: StockTransferResult;
  index: number;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  const title =
    index === 0
      ? "부담부증여 주식 양도소득세 (채무인수분)"
      : `부담부증여 주식 양도소득세 ${index + 1}번째 자산`;

  // 세율 표시
  const appliedRate = (result as { appliedRate?: number }).appliedRate ?? 0;
  const rateDisplay = appliedRate > 0 ? `${(appliedRate * 100).toFixed(0)}%` : "세율";

  const totalTax = result.finalTax + result.localIncomeTax;

  return (
    <div className="border border-emerald-200 dark:border-emerald-700 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {title}
        </h4>
        <ExpandToggleButton
          open={detailOpen}
          onClick={() => setDetailOpen((p) => !p)}
          tone="emerald"
        />
      </div>

      {/* 산식 요약 */}
      <div className="divide-y divide-border">
        <Row label="양도가액 (채무인수액)" value={formatKRW(result.transferPrice)} />
        <Row
          label="취득가액 (채무비율 안분 후)"
          value={`(−) ${formatKRW(result.acquisitionPrice)}`}
          sub
          deduction
        />
        {result.expenses > 0 && (
          <Row
            label="필요경비 (개산공제 §163⑥)"
            value={`(−) ${formatKRW(result.expenses)}`}
            sub
            deduction
          />
        )}
        <Row label="양도소득금액" value={formatKRW(result.transferIncome)} />
        {result.basicDeduction > 0 ? (
          <Row
            label="양도소득 기본공제 (§103①2호)"
            value={`(−) ${formatKRW(result.basicDeduction)}`}
            sub
            deduction
          />
        ) : (
          index > 0 && (
            <Row
              label="양도소득 기본공제 (§103①2호)"
              value="앞 종목에서 한도 소진"
              sub
            />
          )
        )}
        <Row label="양도소득 과세표준" value={formatKRW(result.taxBase)} highlight />
        <Row
          label={`산출세액 (세율 ${rateDisplay})`}
          value={formatKRW(result.calculatedTax)}
        />
        <Row label="결정세액" value={formatKRW(result.finalTax)} highlight />
        <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} sub />
        <Row label="총 납부세액" value={formatKRW(totalTax)} highlight />
      </div>

      {/*
        엔진 경고 — 종전에는 이 카드가 `warnings`를 한 번도 참조하지 않아
        대주주 자동 판정 불일치(§157)·상장 환산 종가평균 미입력 같은 안내가
        화면에 전혀 뜨지 않았다. 문구·색은 다른 결과뷰와 같은 공용 leaf를 쓴다.
      */}
      <CalculationWarningsCard warnings={result.warnings} className="m-4 mb-0" />

      {/* 상세 펼침 */}
      {detailOpen && (
        <div className="border-t border-emerald-200 dark:border-emerald-700 bg-emerald-50/30 dark:bg-emerald-900/10 px-4 py-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
            산식 상세 (소령 §159①1호 안분)
          </p>
          <p>
            채무인수분은 소득세법 §88에 따라 증여자의 유상양도로 봅니다.
            양도가액 = 채무인수액, 취득가액 = 당초취득가 × <Frac top="채무액" bottom="주식평가액" /> 으로
            안분합니다.
          </p>
          <p>
            과세 구분: 상장주식 §94①3가목2 (장외양도, 소액주주도 과세)
            / 비상장주식 §94①3나목 (전부 과세)
          </p>
          {appliedRate > 0 && (
            <p>
              산출세액: 과세표준 × {rateDisplay} (§104①11)
            </p>
          )}
          <p className="text-amber-600 dark:text-amber-400">
            ※ 부담부증여(장외양도) — isOnMarketTransaction=false 고정 (§94①3가목2)
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  stockTransferTaxResults: StockTransferResult[];
}

export function BurdenedStockTransferTaxResultCard({ stockTransferTaxResults }: Props) {
  if (stockTransferTaxResults.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
        주식 부담부증여 양도소득세 (소득세법 §88 · 소령 §159)
      </h3>
      {stockTransferTaxResults.map((r, i) => (
        <SingleStockTransferResultCard key={i} result={r} index={i} />
      ))}
    </div>
  );
}
