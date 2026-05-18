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
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";

interface StockSidebarProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const STEP_LABELS = ["자산·시장·대주주", "양도·취득가액", "필요경비·신고", "결과"];

export function StockSidebar({ currentStep, onStepClick }: StockSidebarProps) {
  // atomic selector (무한 루프 방지)
  const formData = useStockTransferStore(useShallow((s) => s.formData));
  const result = useStockTransferStore((s) => s.result);

  // 사이드바 합계 — 입력값으로 계산 가능한 항목만 (useMemo — store 미러링 금지)
  const summary = useMemo((): WizardSidebarSummaryItem[] => {
    const items: WizardSidebarSummaryItem[] = [];
    const isSplitMode = formData.lotsMode === "split";

    // 양도가액 (split: lot 합계 / single: 폼 단가 × 수량)
    let effectiveTransferPrice: number | null = null;
    if (isSplitMode) {
      const lotSum = formData.transferLots.reduce(
        (s, l) =>
          s + parseAmount(l.perShareTransferPrice) * parseInt(l.shareCount || "0", 10),
        0,
      );
      effectiveTransferPrice = lotSum > 0 ? lotSum : null;
    } else {
      // single 모드 — transferActualInputMode 분기 추가 (per_share / total)
      const priceMode = formData.transferPriceMode || "actual";
      const actualMode = formData.transferActualInputMode || "per_share"; // 3중 패턴 default
      let transferPrice: number | null = null;
      if (priceMode === "actual") {
        if (actualMode === "total") {
          const total = parseAmount(formData.transferTotalPrice);
          transferPrice = total > 0 ? total : null;
        } else {
          const perShare = parseAmount(formData.perShareTransferPrice);
          const count = parseInt(formData.shareCount || "0", 10);
          transferPrice = perShare > 0 && count > 0 ? perShare * count : null;
        }
      }
      const exchangeTotal =
        parseAmount(formData.exchangePropertyValue) +
        parseAmount(formData.exchangeDebtRelief) +
        parseAmount(formData.exchangeCash);
      effectiveTransferPrice =
        priceMode === "exchange"
          ? exchangeTotal > 0
            ? exchangeTotal
            : null
          : transferPrice;
    }

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
        const perShareAcq = parseAmount(formData.perShareAcquisitionPrice);
        const count = parseInt(formData.shareCount || "0", 10);
        acqPrice = perShareAcq > 0 && count > 0 ? perShareAcq * count : null;
      }
      if (acqPrice && acqPrice > 0) {
        items.push({ label: "취득가액", value: acqPrice });
      }

      // 필요경비 (실가 모드)
      const expenses = (formData.expenseMode || "actual") === "actual"
        ? parseAmount(formData.actualExpenses)
        : null;
      if (expenses && expenses > 0) {
        items.push({ label: "필요경비", value: expenses });
      }
    }

    return items;
  }, [formData, result]);

  const steps = useMemo((): WizardSidebarStep[] => {
    return STEP_LABELS.map((label, i) => ({
      label,
      status:
        i < currentStep ? "done" : i === currentStep ? "active" : "todo",
      onClick: () => onStepClick(i),
    }));
  }, [currentStep, onStepClick]);

  return (
    <WizardSidebar
      title="주식 양도소득세"
      steps={steps}
      summary={summary.length > 0 ? summary : undefined}
    />
  );
}
