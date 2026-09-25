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
import { validateStepByIndex } from "@/lib/calc/stock-transfer-tax-validate";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import { sumBasicDeductionByGroup } from "@/lib/tax-engine/stock-transfer/stock-basic-deduction-total";

interface StockSidebarProps {
  currentStep: number;
  /**
   * 사용자가 가 본 가장 먼 단계 — 오류 표식의 범위.
   * 미지정 시 `currentStep`으로 본다(직접 렌더하는 테스트 편의).
   */
  maxVisitedStep?: number;
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

export function StockSidebar({
  currentStep,
  maxVisitedStep,
  onStepClick,
  stockName,
}: StockSidebarProps) {
  const visitedUpTo = Math.max(maxVisitedStep ?? currentStep, currentStep);
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
        // 영 §168② 차감액 — 「0원 제외」 규칙에 따라 차감이 있을 때만 싣는다.
        if ((a.totalClause168_2Deducted ?? 0) > 0)
          items.push({
            label: "△ 대주주 기납부세액 (영 §168②)",
            value: -(a.totalClause168_2Deducted ?? 0),
          });
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

    /**
     * 🔑 **결과가 있으면 «엔진 값»을 쓴다.** 영 §158② 기신고 합산은 엔진(STEP 4.5)에서
     *    일어나므로 폼 파생값(당회차)과 결과값(합산 총액)이 갈린다. 형제 항목인
     *    취득가액·필요경비는 이미 `result`를 읽으므로, 여기만 폼을 읽으면
     *    **「양도가액만 당회차」인 표**가 되어 사이드바가 스스로 모순된다.
     */
    const effectiveTransferPrice =
      result && result.transferPrice > 0
        ? result.transferPrice
        : computeFormTransferPrice(formData);

    if (effectiveTransferPrice && effectiveTransferPrice > 0) {
      items.push({ label: "양도가액", value: effectiveTransferPrice });
    }

    // 결과가 있으면 결과 값 우선 사용
    if (result) {
      // 영 §158② 기신고분 — 합산이 실제로 일어났을 때만 (0원 행 방지)
      if ((result.priorAggregation?.transferPrice ?? 0) > 0) {
        items.push({
          label: "└ 기신고분 (영 §158②)",
          value: result.priorAggregation!.transferPrice,
        });
      }
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
      if ((result.clause168_2Credit?.deducted ?? 0) > 0) {
        items.push({
          label: "△ 대주주 기납부세액 (영 §168②)",
          value: -(result.clause168_2Credit?.deducted ?? 0),
        });
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
        // single 모드 — acquisitionActualInputMode 분기 (per_share / lots / total)
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
        } else if (acqInputMode === "total") {
          // 합계 직접 입력 — 나눗셈 없이 그대로다(양도측 total 과 같은 규약).
          const total = parseAmount(formData.acquisitionTotalPrice);
          acqPrice = total > 0 ? total : null;
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

  /**
   * 단계 표식 — 위치(`done/active/todo`)에 **차단 오류**(rose `!`)를 얹는다.
   *
   * 🔴 종전에는 위치 기반만이라, 필수를 비운 단계도 지나오기만 하면 «✓ 완료»로 보였다.
   *    그 상태로 「결과」에 점프하면 취득가액이 조용히 0원 처리돼 **그럴듯한 오답**이
   *    나왔다(실측 19,500,000 → 21,500,000). F-5에서 정한 규약(rose = 차단 오류)을 따른다.
   *
   * 🔑 `severity === "error"`만 본다 — warning을 attention으로 올리면 오탐이 된다.
   *    결과 단계(인덱스 3)는 `validateStepByIndex`가 의도적으로 `[]`라 저절로 빠진다.
   *
   * 🔴 **가 본 적 있는 단계(`i <= maxVisitedStep`)에만** 붙인다. 두 대안은 실측으로 탈락했다:
   *    ⓐ 무효한 단계 전부 → 빈 폼 첫 화면에서 ②③이 동시에 빨개진다(오류 6·2·1).
   *       취득세는 빈 폼 무효 단계가 ① 하나뿐이고 그게 current라 이 함정이 드러나지 않았다 —
   *       **같은 코드가 세목에 따라 다르게 보이는 자리다.**
   *    ⓑ `i < currentStep`만 → 고치러 뒤로 가면 다시 «todo»가 되어 표식이 영영 안 뜬다.
   *
   * 🔑 «가 봤는데 무효»가 되는 경로는 실재한다 — 게이트는 전진만 막으므로 뒤로 가서 지운 뒤
   *    한 칸 더 뒤로 가면 그 상태가 된다(E2E `SJE-3`).
   */
  const steps = useMemo((): WizardSidebarStep[] => {
    return STEP_LABELS.map((label, i) => ({
      label,
      status:
        i === currentStep
          ? "active"
          : i > visitedUpTo
            ? "todo"
            : validateStepByIndex(formData, i).some((e) => e.severity === "error")
              ? "attention"
              : i < currentStep
                ? "done"
                : "todo",
      onClick: () => onStepClick(i),
    }));
  }, [currentStep, visitedUpTo, formData, onStepClick]);

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
