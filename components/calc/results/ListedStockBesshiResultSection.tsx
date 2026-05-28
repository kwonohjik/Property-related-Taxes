"use client";

/**
 * ListedStockBesshiResultSection — 결과 화면용 상장주식 평가조서(갑·을) 출력 섹션.
 *
 * 정책 (UnlistedStockBesshiResultSection 패턴 차용):
 *   - 출력 전용 연결 (엔진·타입·API·validate 변경 0).
 *   - estateItems + valuationDate만 받는 순수 섹션.
 *   - 클라이언트에서 evaluateListedStock 직접 호출 → besshiData 산출.
 *   - 상장주식(`category === "listed_stock"`) + 평가 입력 충족 자산만 표시.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §2
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import { ListedStockBesshiResultView } from "@/components/calc/inheritance/listed-stock/ListedStockBesshiResultView";

export interface ListedStockBesshiResultSectionProps {
  estateItems: EstateItem[];
  /** 평가기준일 (상속개시일 또는 증여일) — orchestrator context */
  valuationDate?: string;
}

export function ListedStockBesshiResultSection({
  estateItems,
  valuationDate,
}: ListedStockBesshiResultSectionProps) {
  const listedItems = estateItems.filter(
    (it) =>
      it.category === "listed_stock" &&
      (it.listedStockAvgPrice ?? 0) > 0 &&
      (it.listedStockShares ?? 0) > 0,
  );
  if (listedItems.length === 0) return null;

  return (
    <section
      className="border border-border rounded-xl overflow-hidden"
      data-testid="ls-besshi-result-section"
    >
      <h4 className="px-4 py-3 bg-muted/30 text-sm font-medium">
        상장주식 평가조서 (갑·을) — {listedItems.length}건
      </h4>
      {listedItems.map((it) => {
        try {
          const result = evaluateListedStock(it, { valuationDate });
          if (!result.besshiData) return null;
          return (
            <div
              key={it.id}
              className="p-3 border-t border-border first:border-t-0"
            >
              {listedItems.length > 1 && (
                <p
                  className="text-xs font-semibold mb-1 text-muted-foreground"
                  data-testid="ls-besshi-corp-header"
                >
                  {it.companyName || it.name || `상장법인 ${it.id}`}
                </p>
              )}
              <ListedStockBesshiResultView
                item={it}
                besshi={result.besshiData}
                valuatedAmount={result.valuatedAmount}
              />
            </div>
          );
        } catch {
          // 평가 실패는 결과뷰 표시에서 silent skip (입력 검증은 validate에서)
          return null;
        }
      })}
    </section>
  );
}
