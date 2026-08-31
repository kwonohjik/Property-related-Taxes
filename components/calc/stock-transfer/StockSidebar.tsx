"use client";

/**
 * StockSidebar — 주식 양도세 마법사 사이드바 (⑥ 동기화 지점)
 *
 * 8항목 표시 (0원 제외):
 *   양도가액 / 취득가액 / 필요경비 / 양도소득금액 /
 *   기본공제 / 과세표준 / 산출세액 / 지방소득세
 *
 * feedback_zustand_selector: atomic selector + useShallow 사용
 * feedback_no_won_suffix: 숫자 끝 "원" 표기 금지
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { WizardSidebar, type WizardSidebarStep, type WizardSidebarSummaryItem } from "@/components/calc/shared/WizardSidebar";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { sumBasicDeductionByGroup } from "@/lib/tax-engine/stock-transfer/stock-basic-deduction-total";

interface StockSidebarProps {
  currentStep: number;
  onStepClick: (step: number) => void;
  /** 입력된 종목명 — 있는 경우 사이드바 상단 배지로 표시 */
  stockName?: string;
}

const STEP_LABELS = ["자산·시장·대주주", "양도·취득가액", "필요경비·신고", "결과"];

/**
 * 폼 입력만으로 계산 가능한 양도가액 — **결과 도착 전 추정치**.
 *
 * 다종목 합산에서 확정 종목(`savedItems`)의 양도가액을 더할 때도 같은 함수를 쓴다.
 * (종전에는 이 로직이 `useMemo` 안에 인라인이라 편집 중 1건에만 적용됐다.)
 */
function computeFormTransferPrice(f: StockTransferFormData): number | null {
  if (f.lotsMode === "split") {
    const lotSum = f.transferLots.reduce(
      (s, l) => s + parseAmount(l.perShareTransferPrice) * parseInt(l.shareCount || "0", 10),
      0,
    );
    return lotSum > 0 ? lotSum : null;
  }
  // single 모드 — transferActualInputMode 분기 (per_share / total)
  const priceMode = f.transferPriceMode || "actual";
  const actualMode = f.transferActualInputMode || "total"; // 3중 패턴 default
  let transferPrice: number | null = null;
  if (priceMode === "actual") {
    if (actualMode === "total") {
      const total = parseAmount(f.transferTotalPrice);
      transferPrice = total > 0 ? total : null;
    } else {
      const perShare = parseAmount(f.perShareTransferPrice);
      const count = parseInt(f.shareCount || "0", 10);
      transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
    }
  }
  const exchangeTotal =
    parseAmount(f.exchangePropertyValue) +
    parseAmount(f.exchangeDebtRelief) +
    parseAmount(f.exchangeCash);
  return priceMode === "exchange" ? (exchangeTotal > 0 ? exchangeTotal : null) : transferPrice;
}

export function StockSidebar({ currentStep, onStepClick, stockName }: StockSidebarProps) {
  // atomic selector (무한 루프 방지)
  const formData = useStockTransferStore(useShallow((s) => s.formData));
  const result = useStockTransferStore((s) => s.result);
  // ⑥ 다종목 — 확정 종목이 있으면 사이드바는 **신고 전체 합계**를 보여준다.
  //   편집 중 1건만 보이면 3종목을 확정한 사용자가 그 값을 신고 전체로 읽는다.
  const savedItems = useStockTransferStore(useShallow((s) => s.savedItems));
  const aggregateResult = useStockTransferStore((s) => s.aggregateResult);

  // 사이드바 합계 — 입력값으로 계산 가능한 항목만 (useMemo — store 미러링 금지)
  /** 확정 종목 + 편집 중 = 이번 신고의 종목 수 */
  const filingItemCount = savedItems.length + 1;
  const isMultiFiling = savedItems.length > 0;

  const summary = useMemo((): WizardSidebarSummaryItem[] => {
    const items: WizardSidebarSummaryItem[] = [];
    const isSplitMode = formData.lotsMode === "split";

    // ── ⑥ 다종목 합산신고 ──
    //
    // 계산 후에는 **엔진 합계**를 그대로 쓴다(§103①2호 기본공제 1회·§102② 통산·신고 단위
    // 가산세가 반영된 값이라 종목별 합으로는 재현할 수 없다).
    // 계산 전에는 **양도가액만** 합산한다 — 단순 덧셈이라 정확하다. 과세표준·산출세액은
    // 종목마다 세율이 갈려 추정이 틀리므로 **표시하지 않는다**(자동 fallback 금지).
    if (isMultiFiling) {
      if (aggregateResult) {
        const a = aggregateResult;
        const penalty = a.totalUnderReportPenalty + a.totalLatePaymentPenalty;
        if (a.totalTransferIncome > 0)
          items.push({ label: "양도소득금액 합계", value: a.totalTransferIncome, highlight: true });
        // 두 그룹을 더한다 — `totalTaxBase`가 양쪽을 모두 차감한 값이라
        // 주식 그룹만 더하면 「양도소득금액 − 기본공제 = 과세표준」이 어긋난다(§103①).
        // 기타자산만 있는 신고에서는 `stock`이 0이라 종전에는 행 자체가 사라졌다.
        const totalBasicDeduction = sumBasicDeductionByGroup(a.basicDeductionByGroup);
        if (totalBasicDeduction > 0)
          items.push({ label: "기본공제", value: totalBasicDeduction });
        if (a.totalTaxBase > 0)
          items.push({ label: "과세표준", value: a.totalTaxBase, highlight: true });
        if (a.totalCalculatedTax > 0)
          items.push({ label: "산출세액", value: a.totalCalculatedTax, highlight: true });
        if (penalty > 0) items.push({ label: "가산세", value: penalty });
        if (a.totalFinalTax > 0)
          items.push({ label: "결정세액", value: a.totalFinalTax, highlight: true });
        if (a.totalLocalIncomeTax > 0)
          items.push({ label: "지방소득세", value: a.totalLocalIncomeTax });
        return items;
      }
      const priceSum = [...savedItems, formData].reduce(
        (sum, f) => sum + (computeFormTransferPrice(f) ?? 0),
        0,
      );
      if (priceSum > 0) items.push({ label: "양도가액 합계", value: priceSum });
      return items;
    }

    // ── PR-4B 국외전출세 (⑥ 동기화 지점) ──
    if (formData.marketType === "exit_tax") {
      // 보유 종목 합계 간주양도가액 (useMemo — store 미러링 금지)
      const totalDepartureDayValue = formData.etHoldings.reduce((sum, h) => {
        const shares = parseInt(h.shareCount.replace(/,/g, ""), 10) || 0;
        const mode = h.departureDayValuationMode || "market_price";
        let priceStr = "";
        if (mode === "market_price") priceStr = h.departureDayMarketPrice;
        else if (mode === "prior_year_std") priceStr = h.priorYearEndMonthAvg;
        else if (mode === "unlisted_sample") priceStr = h.unlistedSamplePrice;
        else if (mode === "unlisted_std") priceStr = h.unlistedStdPricePerShare;
        return sum + shares * parseAmount(priceStr);
      }, 0);

      if (totalDepartureDayValue > 0) {
        items.push({ label: "간주양도가액 합계", value: totalDepartureDayValue });
      }

      // 결과 있으면 최종값 추가
      if (result) {
        const r = result as unknown as ExitTaxResult;
        if (r.isLiable) {
          if (r.taxBase > 0) items.push({ label: "과세표준", value: r.taxBase, highlight: true });
          if (r.incomeTax > 0) items.push({ label: "산출세액", value: r.incomeTax, highlight: true });
          if (r.localIncomeTax > 0) items.push({ label: "지방소득세", value: r.localIncomeTax });
          if (r.deferredTaxAmount > 0) items.push({ label: `납부유예액(${r.deferralYears}년)`, value: r.deferredTaxAmount });
          if (r.adjustmentDeduction) items.push({ label: "조정공제", value: r.adjustmentDeduction });
          if (r.foreignTaxCreditApplied) items.push({ label: "외국납부세액공제", value: r.foreignTaxCreditApplied });
          // §118의15④ 가산세는 종전에 여기서 통째로 누락돼, 결과 카드에는 보이는 금액이
          // 요약에서만 사라졌다. 「산출세액에 더한다」이므로 총 납부세액에도 반영된다.
          if (r.holdingsReportPenalty) items.push({ label: "보유현황 미신고 가산세", value: r.holdingsReportPenalty });
          if (r.totalTax > 0) items.push({ label: "총 납부세액", value: r.totalTax, highlight: true });
        }
      }
      return items;
    }

    // 양도가액 (split: lot 합계 / single: 폼 단가 × 수량)
    // ── PR-4A 해외주식 — KRW 환산 양도가액 미리보기 (⑥ 동기화 지점) ──
    if (formData.marketType === "foreign_stock") {
      const rate = parseFloat(formData.transferExchangeRate || "0");
      const count = parseInt(formData.shareCount || "0", 10);
      if (rate > 0 && count > 0) {
        const fgMode = formData.fgTransferPriceMode || "per_share";
        let fgKrw: number | null = null;
        if (fgMode === "per_share") {
          const perShare = parseFloat(formData.perShareTransferPriceForeign || "0");
          if (perShare > 0) fgKrw = Math.floor(perShare * count * rate);
        } else {
          const total = parseFloat(formData.totalTransferPriceForeign || "0");
          if (total > 0) fgKrw = Math.floor(total * rate);
        }
        if (fgKrw !== null && fgKrw > 0) {
          items.push({ label: "양도가액(환산 참고)", value: fgKrw });
        }
      }
      // 결과 있으면 최종값 추가
      if (result) {
        const r = result as unknown as import("@/lib/tax-engine/stock-transfer/types/foreign-stock.types").ForeignStockResult;
        if (r.isLiable) {
          if (r.transferPriceKrw > 0) items.push({ label: "양도가액(원화)", value: r.transferPriceKrw });
          if (r.taxBase > 0) items.push({ label: "과세표준", value: r.taxBase, highlight: true });
          if (r.incomeTax > 0) items.push({ label: "산출세액", value: r.incomeTax, highlight: true });
          if (r.localIncomeTax > 0) items.push({ label: "지방소득세", value: r.localIncomeTax });
          if (r.totalTax > 0) items.push({ label: "총 납부세액", value: r.totalTax, highlight: true });
        }
      }
      return items;
    }

    const effectiveTransferPrice = computeFormTransferPrice(formData);

    if (effectiveTransferPrice && effectiveTransferPrice > 0) {
      items.push({ label: "양도가액", value: effectiveTransferPrice });
    }

    // 결과가 있으면 결과 값 우선 사용
    if (result) {
      if (result.acquisitionPrice > 0) {
        items.push({ label: "취득가액", value: result.acquisitionPrice });
      }
      if (result.expenses > 0) {
        items.push({ label: "필요경비", value: result.expenses });
      }
      if (result.transferIncome > 0) {
        items.push({ label: "양도소득금액", value: result.transferIncome, highlight: true });
      }
      if (result.basicDeduction > 0) {
        items.push({ label: "기본공제", value: result.basicDeduction });
      }
      if (result.taxBase > 0) {
        items.push({ label: "과세표준", value: result.taxBase, highlight: true });
      }
      if (result.calculatedTax > 0) {
        items.push({ label: "산출세액", value: result.calculatedTax, highlight: true });
      }
      if (result.localIncomeTax > 0) {
        items.push({ label: "지방소득세", value: result.localIncomeTax });
      }
    } else {
      // 결과 없음 — 실가 취득가 직접 계산
      let acqPrice: number | null = null;
      if (isSplitMode) {
        const lotSum = formData.acquisitionLots.reduce(
          (s, l) =>
            s + parseAmount(l.perShareAcquisitionPrice) * parseInt(l.shareCount || "0", 10),
          0,
        );
        acqPrice = lotSum > 0 ? lotSum : null;
      } else {
        // single 모드 — acquisitionActualInputMode 분기 (per_share / lots)
        const acqInputMode = formData.acquisitionActualInputMode || "per_share"; // 3중 패턴 default
        if (acqInputMode === "lots" && formData.acquisitionLots.length > 0) {
          // 가중평균 단가 × 양도 주식수 (근사치 — FIFO는 차이 가능, 정확값은 result 우선)
          const totalShares = formData.acquisitionLots.reduce(
            (s, l) => s + parseInt(l.shareCount || "0", 10),
            0,
          );
          const totalCost = formData.acquisitionLots.reduce(
            (s, l) =>
              s + parseAmount(l.perShareAcquisitionPrice) * parseInt(l.shareCount || "0", 10),
            0,
          );
          const weightedAvg = totalShares > 0 ? Math.floor(totalCost / totalShares) : 0;
          const transferCount = parseInt(formData.shareCount || "0", 10);
          acqPrice = weightedAvg > 0 && transferCount > 0 ? weightedAvg * transferCount : null;
        } else {
          const perShareAcq = parseAmount(formData.perShareAcquisitionPrice);
          const count = parseInt(formData.shareCount || "0", 10);
          acqPrice = perShareAcq > 0 && count > 0 ? perShareAcq * count : null;
        }
      }
      if (acqPrice && acqPrice > 0) {
        items.push({ label: "취득가액", value: acqPrice });
      }

      // 필요경비 (실가 모드만 — [B-2] 환산 모드 실비는 §97②2호 단서 비교 입력이라 차감 확정 전 → 결과 도착 후 표시)
      const isActualAcq = (formData.acquisitionMode || "actual") === "actual";
      const expenses = isActualAcq && (formData.expenseMode || "actual") === "actual"
        ? parseAmount(formData.actualExpenses)
        : null;
      if (expenses && expenses > 0) {
        items.push({ label: "필요경비", value: expenses });
      }
    }

    return items;
  }, [formData, result, savedItems, aggregateResult, isMultiFiling]);

  const steps = useMemo((): WizardSidebarStep[] => {
    return STEP_LABELS.map((label, i) => ({
      label,
      status:
        i < currentStep ? "done" : i === currentStep ? "active" : "todo",
      onClick: () => onStepClick(i),
    }));
  }, [currentStep, onStepClick]);

  return (
    <div className="space-y-3">
      {/* 종목명 배지 (입력된 경우만) */}
      {(stockName || isMultiFiling) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 flex items-center gap-2">
          {stockName && (
            <span className="text-xs font-semibold text-amber-800 truncate">{stockName}</span>
          )}
          {isMultiFiling && (
            <span className="ml-auto shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-micro font-semibold text-sky-700">
              {filingItemCount}건 합산
            </span>
          )}
        </div>
      )}
      <WizardSidebar
        title="주식 양도소득세"
        steps={steps}
        summary={summary.length > 0 ? summary : undefined}
      />
    </div>
  );
}
