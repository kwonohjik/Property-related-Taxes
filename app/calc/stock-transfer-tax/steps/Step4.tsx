"use client";

/**
 * Step 4 — 결과
 *
 * StockTransferTaxResultView + 사이드바 8항목 연동
 * 진입 시 결과가 없으면 자동으로 계산 실행 ("계산하기" 별도 클릭 불필요).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import { ForeignStockFilingFormSection } from "@/components/calc/results/ForeignStockFilingFormSection";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
import { ExitTaxHoldingReportSection } from "@/components/calc/results/ExitTaxHoldingReportSection";
import { ExitTaxFilingFormSection } from "@/components/calc/results/ExitTaxFilingFormSection";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  STOCK_TRANSFER_PRINT_SECTIONS,
  type StockTransferPrintSectionId,
} from "@/lib/print/stock-transfer-print-sections";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import type { ExitTaxResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockAggregateMeta } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";

interface Step4Props {
  result: StockTransferResult | null;
  form: StockTransferFormData;
  error: string | null;
  isLoading: boolean;
  onCalculate: () => void;
  /**
   * 다종목 합산 결과 — 별지 제84호서식이 **종목별 열 + 합계 열**로 렌더된다.
   * 미전달 시 서식이 마지막 종목만 보여주어 실제 신고 내용과 달라진다.
   */
  aggregate?: StockAggregateMeta;
}

export function Step4({ result, form, error, isLoading, onCalculate, aggregate }: Step4Props) {
  const shareCount = parseInt(form.shareCount || "0", 10);

  // 결과 화면 진입 시 자동 계산 — result/error/loading 모두 비어 있을 때 1회 실행.
  // 사용자 액션(다음·결과 보기·사이드바 4 클릭)으로 step 3 도달 시 즉시 결과 표시.
  /**
   * 결과뷰 prop — **단건·다종목이 같은 객체를 쓴다**.
   *
   * 종전에는 두 분기가 각자 prop을 나열했고 다종목 쪽에만
   * `transferActualInputMode`·`perShareTransferPrice`·`unlistedValuationMode`·
   * `acqFaceValueOnly`·`kiwoomLastFetchedAt` **5개가 빠져 있었다**.
   * 결과뷰 기본값이 `"per_share"`/`0`이라(스토어 기본값 `"total"`과 **반대**)
   * 다종목은 입력 방식과 무관하게 per_share 분기를 타고
   * 「1주당 양도가액 **0** × N주 = 5억」처럼 항등식이 깨진 산식이 인쇄됐다
   * (`PrintSection id="calculation"`에 포함돼 인쇄물에 나간다).
   *
   * `result`·`shareCount`가 이미 양쪽 다 「마지막 종목」 소스라 값 축 불일치 위험은 없다.
   */
  const resultViewProps = {
    result: result!,
    shareCount,
    filingViolation: (form.filingViolation || "none") as "none" | "under_report" | "non_report",
    isFraudulent: form.isFraudulent,
    isInternationalTransaction: form.isInternationalTransaction,
    transferActualInputMode: form.transferActualInputMode || "total",
    unlistedValuationMode: form.unlistedValuationMode || "simple",
    acqFaceValueOnly: form.acqFaceValueOnly === true,
    perShareTransferPrice: parseAmount(form.perShareTransferPrice),
    securityName: form.securityName,
    securityCode: form.securityCode,
    brokerage: form.brokerage,
    transferDate: form.transferDate,
    accountNumberMasked: form.accountNumberMasked,
    kiwoomLastFetchedAt: form.kiwoomLastFetchedAt,
  };

  /**
   * 출력 항목 선택 — **국외 트랙 전용** state.
   *
   * 국내·다종목은 `StockTransferTaxResultView`가 자기 패널을 들고 있다. 종전에는 국외주식·
   * 국외전출세 경로에만 패널이 없어 **인쇄하면 화면 전체가 그대로 나갔다**(선택 불가).
   *
   * ⚠️ 훅은 조건부로 부를 수 없어 국내 분기에서도 만들어지지만, 그 분기는 이 값을 쓰지 않는다.
   */
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  const availablePrintIds = useMemo<Set<StockTransferPrintSectionId>>(() => {
    // 가용 leaf 는 **그 화면에 실제로 렌더되는 것**만이다 — 데이터 없는 서식을 고르게 두면
    // 「선택했는데 아무것도 안 나오는」 거짓 선택이 된다(패널 설계 원칙).
    const ids: StockTransferPrintSectionId[] = ["filing-form", "calculation"];
    if (form.marketType === "exit_tax") ids.push("exit-holding-report");
    return new Set(ids);
  }, [form.marketType]);

  const printPanel = (
    <PrintSelectionPanel
      allGroups={STOCK_TRANSFER_PRINT_SECTIONS}
      selectedIds={selectedPrintIds}
      availableIds={availablePrintIds}
      onChange={setSelectedPrintIds}
    />
  );

  const autoTriggerredRef = useRef(false);
  useEffect(() => {
    if (!result && !isLoading && !error && !autoTriggerredRef.current) {
      autoTriggerredRef.current = true;
      onCalculate();
    }
  }, [result, isLoading, error, onCalculate]);

  return (
    <div className="space-y-6">
      {/* 결과 없음 + 비로딩 + 에러 없음: 자동 계산 트리거 직전 짧은 안내 */}
      {!result && !isLoading && !error && (
        <div className="text-center py-8 text-slate-500">
          <p>계산을 시작합니다…</p>
        </div>
      )}

      {/* 로딩 */}
      {isLoading && (
        <div className="text-center py-8 text-slate-500">
          <p>계산 중...</p>
        </div>
      )}

      {/* 에러 */}
      {error && !isLoading && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-rose-700">
          <p className="font-medium">계산 오류</p>
          <p className="text-sm mt-1">{error}</p>
          <button
            onClick={onCalculate}
            className="mt-3 px-4 py-1.5 rounded bg-rose-100 text-rose-700 text-sm hover:bg-rose-200 transition-colors"
          >
            다시 계산
          </button>
        </div>
      )}

      {/* 결과 */}
      {result && !isLoading && (
        <>
          <div className="flex justify-end">
            <button
              onClick={onCalculate}
              className="px-4 py-1.5 rounded border border-sky-300 text-sky-700 text-sm hover:bg-sky-50 transition-colors"
            >
              다시 계산
            </button>
          </div>

          {/*
            🔑 **다종목이면 종목 타입과 무관하게 통합 결과뷰**를 쓴다.
            단건 전용 카드(국외전출세·해외주식)는 `form`(= 편집 중이던 **마지막** 종목) 하나만
            보여주므로, 다종목인데 마지막 종목이 해외였다는 이유로 그쪽으로 빠지면
            **별지 제84호서식과 다른 종목들이 통째로 사라진다**.
          */}
          {aggregate ? (
            <StockTransferTaxResultView {...resultViewProps} aggregate={aggregate} />
          ) : /* PR-4B 국외전출세 — 별도 결과 카드 (ExitTaxResult 타입) */
          form.marketType === "exit_tax" ? (
            <>
              {/*
                🔑 **신고서 양식이 맨 앞**이다 — 국외주식·국내주식 경로와 같은 순서다.
                아래 별지 제104호서식은 §118의15**①** **보유현황** 신고서로 성격이 다르다
                (세액을 신고하는 서식이 아니다). 과세표준 신고서는 **§118의15②**가 따로
                요구하고, 서식은 별지 제84호서식이 국외전출자 버전을 겸한다(시행규칙 별지 008400).
              */}
              <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
                <ExitTaxFilingFormSection
                  result={result as unknown as ExitTaxResult}
                  caseName={form.securityName}
                  brokerage={form.brokerage}
                  accountNumberMasked={form.accountNumberMasked}
                  departureDate={form.etDepartureDate}
                  holdings={form.etHoldings}
                />
              </PrintSection>

              {/* 패널은 **신고서 뒤**다 — 국내 결과뷰와 같은 규약(인쇄 제어용 컨트롤). */}
              {printPanel}

              <PrintSection id="calculation" selectedIds={selectedPrintIds}>
                <ExitTaxResultCard result={result as unknown as ExitTaxResult} />
              </PrintSection>
              {/*
                별지 제104호서식 — §118의15① 보유현황 신고서.
                토글은 CSS-only 로 인쇄 시 자동 펼침(useEffect·isPrinting 추적 금지).
              */}
              <PrintSection id="exit-holding-report" selectedIds={selectedPrintIds}>
                <ExitTaxHoldingReportSection
                  holdings={form.etHoldings}
                  departureDate={form.etDepartureDate}
                />
              </PrintSection>
            </>
          ) : /* PR-4A 해외주식 — 별도 결과 카드 (ForeignStockResult 타입) */
          form.marketType === "foreign_stock" ? (
            <>
              {/*
                🔑 **신고서 양식이 맨 앞**이다 — 이 화면의 주된 산출물은 별지 제84호서식이고
                결과 카드(환율 환산·산식)는 그 뒤를 받친다. 국내 경로(`StockTransferTaxResultView`)와
                같은 순서다. 종전에는 국외주식 단건에 서식이 **아예 없었다**.
              */}
              <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
                <ForeignStockFilingFormSection
                  result={result as unknown as ForeignStockResult}
                  stockName={form.securityName}
                  stockCode={form.securityCode}
                  brokerage={form.brokerage}
                  accountNumberMasked={form.accountNumberMasked}
                  transferDate={form.transferDate}
                  acquisitionDate={form.acquisitionDate}
                  countryCode={form.fgCountryCode}
                />
              </PrintSection>

              {/* 패널은 **신고서 뒤**다 — 국내 결과뷰와 같은 규약. */}
              {printPanel}

              <PrintSection id="calculation" selectedIds={selectedPrintIds}>
                <ForeignStockResultCard
                  result={result as unknown as ForeignStockResult}
                  stockName={form.securityName}
                />
              </PrintSection>
            </>
          ) : (
            <StockTransferTaxResultView {...resultViewProps} aggregate={aggregate} />
          )}
        </>
      )}
    </div>
  );
}
