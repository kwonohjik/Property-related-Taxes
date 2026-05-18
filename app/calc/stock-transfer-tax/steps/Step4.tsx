"use client";

/**
 * Step 4 — 결과
 *
 * StockTransferTaxResultView + 사이드바 8항목 연동
 */

import { StockTransferTaxResultView } from "@/components/calc/results/StockTransferTaxResultView";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Step4Props {
  result: StockTransferResult | null;
  form: StockTransferFormData;
  error: string | null;
  isLoading: boolean;
  onCalculate: () => void;
}

export function Step4({ result, form, error, isLoading, onCalculate }: Step4Props) {
  const shareCount = parseInt(form.shareCount || "0", 10);

  return (
    <div className="space-y-6">
      {/* 계산 실행 버튼 */}
      {!result && !isLoading && (
        <div className="text-center py-8">
          <p className="text-slate-500 mb-4">입력이 완료되면 계산하기를 눌러 결과를 확인하세요.</p>
          <button
            onClick={onCalculate}
            className="px-6 py-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 transition-colors"
          >
            계산하기
          </button>
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
          <StockTransferTaxResultView
            result={result}
            shareCount={shareCount}
            isFraudulent={form.isFraudulent}
            isInternationalTransaction={form.isInternationalTransaction}
            transferActualInputMode={form.transferActualInputMode || "per_share"}
            perShareTransferPrice={parseAmount(form.perShareTransferPrice)}
            securityName={form.securityName}
            securityCode={form.securityCode}
            brokerage={form.brokerage}
            transferDate={form.transferDate}
            accountNumberMasked={form.accountNumberMasked}
          />
        </>
      )}
    </div>
  );
}
