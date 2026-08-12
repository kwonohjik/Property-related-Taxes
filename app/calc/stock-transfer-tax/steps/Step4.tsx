"use client";

/**
 * Step 4 — 결과
 *
 * StockTransferTaxResultView + 사이드바 8항목 연동
 * 진입 시 결과가 없으면 자동으로 계산 실행 ("계산하기" 별도 클릭 불필요).
 */

import { useEffect, useRef } from "react";
import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import { ExitTaxResultCard } from "@/components/calc/results/ExitTaxResultCard";
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
            <StockTransferTaxResultView
              result={result}
              aggregate={aggregate}
              shareCount={shareCount}
              filingViolation={form.filingViolation || "none"}
              isFraudulent={form.isFraudulent}
              isInternationalTransaction={form.isInternationalTransaction}
              securityName={form.securityName}
              securityCode={form.securityCode}
              brokerage={form.brokerage}
              transferDate={form.transferDate}
              accountNumberMasked={form.accountNumberMasked}
            />
          ) : /* PR-4B 국외전출세 — 별도 결과 카드 (ExitTaxResult 타입) */
          form.marketType === "exit_tax" ? (
            <ExitTaxResultCard result={result as unknown as ExitTaxResult} />
          ) : /* PR-4A 해외주식 — 별도 결과 카드 (ForeignStockResult 타입) */
          form.marketType === "foreign_stock" ? (
            <ForeignStockResultCard
              result={result as unknown as ForeignStockResult}
              stockName={form.securityName}
            />
          ) : (
            <StockTransferTaxResultView
              result={result}
              aggregate={aggregate}
              shareCount={shareCount}
              filingViolation={form.filingViolation || "none"}
              isFraudulent={form.isFraudulent}
              isInternationalTransaction={form.isInternationalTransaction}
              transferActualInputMode={form.transferActualInputMode || "total"}
              unlistedValuationMode={form.unlistedValuationMode || "simple"}
              acqFaceValueOnly={form.acqFaceValueOnly === true}
              perShareTransferPrice={parseAmount(form.perShareTransferPrice)}
              securityName={form.securityName}
              securityCode={form.securityCode}
              brokerage={form.brokerage}
              transferDate={form.transferDate}
              accountNumberMasked={form.accountNumberMasked}
              kiwoomLastFetchedAt={form.kiwoomLastFetchedAt}
            />
          )}
        </>
      )}
    </div>
  );
}
