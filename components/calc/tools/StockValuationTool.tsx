"use client";

/**
 * StockValuationTool — 주식 평가 독립 도구 (/tools/stock-valuation).
 *
 * 세금 계산 없이 상장·비상장주식 가치 평가만 수행. 상속·증여 마법사의 StockValuationForm을
 * valuationOnly 모드로 재사용(협의분할·부담부채무·공통속성 숨김)하고, 평가조서(갑·을/부표3)와
 * 요약 카드를 출력. 평가 결과는 이력(tax_type=stock_valuation)에 자동 저장.
 *
 * 산식은 엔진 단일 진실(computeStockValuation / evaluateUnlistedStockV2) 재사용 — 재구현 0.
 * PDF/인쇄는 건물 기준시가 도구와 동일하게 window.print() — besshi 섹션의 print:block CSS 자동 펼침.
 *
 * Plan: docs/00-pm/stock-valuation-tool.plan.md
 */

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ListedStockBesshiResultSection } from "@/components/calc/results/ListedStockBesshiResultSection";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { useStockValuationStore } from "@/lib/stores/calc-stock-valuation-store";
import { buildStockValuationResult } from "@/lib/calc/stock-valuation-tool";
import {
  computeStockValuation,
  resolveUnlistedDisplayMode,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";

const AMOUNT_CELL = "text-right font-mono tabular-nums whitespace-nowrap";

export function StockValuationTool() {
  const { formData, setFormData } = useStockValuationStore();
  const { valuationDate, stockItems } = formData;
  const activeClientId = useProfessionalStore((s) => s.activeClientId);

  const result = useMemo(
    () => buildStockValuationResult(stockItems, valuationDate),
    [stockItems, valuationDate],
  );

  // 비상장 간편평가(V1) 종목 — 별지 부표3 평가조서가 생성되지 않음(V2 정식평가만 대상)
  const hasUnlistedSimple = useMemo(
    () =>
      stockItems.some(
        (it) =>
          it.category === "unlisted_stock" &&
          resolveUnlistedDisplayMode(it) === "simple" &&
          computeStockValuation(it, valuationDate || undefined) > 0,
      ),
    [stockItems, valuationDate],
  );

  // 자동 저장 — 평가액 산출 종목이 1개 이상일 때만(resultData 비공백 → skip 회피)
  const resultData =
    result.items.length > 0 ? (result as unknown as Record<string, unknown>) : null;
  useAutoSaveCalculation({
    taxType: "stock_valuation",
    inputData: formData as unknown as Record<string, unknown>,
    resultData,
    taxLawVersion: valuationDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  return (
    <main className="mx-auto max-w-[63rem] px-4 py-6">
      <div className="mb-3 flex justify-end print:hidden">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 사라집니다.&#10;계속하시겠습니까?" />
      </div>

      <header className="mb-5 print:hidden">
        <h1 className="text-xl font-bold">주식 평가</h1>
        <p className="mt-1 text-sm text-slate-500">
          상장주식(전후 2개월 종가평균)·비상장주식(보충적 평가)을 상속세및증여세법 §63·시행령
          §54 기준으로 평가합니다. 세액은 계산하지 않습니다.
        </p>
      </header>

      <div className="print:hidden space-y-6">
        {/* 평가기준일 */}
        <FieldCard
          label="평가기준일"
          htmlFor="stock-valuation-date"
          hint="상속개시일·증여일 등 평가 기준이 되는 날짜. 상장주식 종가평균 조회에 사용됩니다."
        >
          <DateInput
            value={valuationDate}
            onChange={(v) => setFormData({ valuationDate: v })}
          />
        </FieldCard>

        {/* 주식 목록 입력 (평가 전용 — 협의분할·부담부채무 숨김) */}
        <StockValuationForm
          items={stockItems}
          onChange={(items) => setFormData({ stockItems: items })}
          mode="gift"
          valuationDate={valuationDate}
          valuationOnly
        />
      </div>

      {/* 요약 + 평가조서 */}
      {result.items.length > 0 && (
        <section className="mt-8" data-testid="stock-valuation-result">
          <div className="mb-3 flex items-center justify-between print:hidden">
            <h2 className="text-base font-semibold">평가 결과</h2>
            <button
              type="button"
              onClick={() => window.print()}
              data-testid="stock-valuation-print"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Printer className="h-3.5 w-3.5" />
              인쇄 / PDF 저장
            </button>
          </div>

          {/* 요약 카드 — 평가대상회사·평가기준일·주식수·평가액 */}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">평가대상회사</th>
                  <th className="px-3 py-2 text-right font-medium">주식수</th>
                  <th className="px-3 py-2 text-right font-medium">평가액</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2">{it.companyName}</td>
                    <td className={`px-3 py-2 ${AMOUNT_CELL}`}>
                      {it.shares.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 ${AMOUNT_CELL}`}>{formatKRW(it.valuationAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-3 py-2">합계</td>
                  <td className="px-3 py-2" />
                  <td className={`px-3 py-2 ${AMOUNT_CELL}`} data-testid="stock-valuation-total">
                    {formatKRW(result.totalValuationAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {valuationDate && (
            <p className="mt-2 text-xs text-muted-foreground">
              평가기준일: {valuationDate.replace(/-/g, ".")}
            </p>
          )}

          {/* 평가조서 — 화면 접힘 / 인쇄 자동 펼침 (전체 PDF) */}
          <div className="mt-6 space-y-4">
            <ListedStockBesshiResultSection
              estateItems={stockItems}
              valuationDate={valuationDate}
            />
            <UnlistedStockBesshiResultSection estateItems={stockItems} />
            {hasUnlistedSimple && (
              <p
                data-testid="stock-valuation-v1-notice"
                className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 print:hidden"
              >
                비상장 간편평가 종목은 별지 부표3 평가조서가 생성되지 않습니다. 평가조서가 필요하면
                종목 편집에서 「정식평가」로 전환하세요.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
