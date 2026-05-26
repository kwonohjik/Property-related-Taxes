"use client";

/**
 * UnlistedStockBesshiResultSection — 계산 결과 화면용 비상장주식 별지 부표3 출력 섹션
 *
 * 정책:
 *   - 출력 전용 연결 (엔진·타입·API·validate 변경 0). estateItems만 받는 순수 섹션.
 *   - 상속세(InheritanceTaxResultView)·증여세(GiftTaxResultView) 양쪽 재사용 (R-6).
 *   - 정식평가 V2(unlistedStockValuationV2) 자산만 별지 대상. 간편평가(unlistedStockData)는 자동 제외 (R-7/F-5).
 *   - Date 정규화·크래시 방어는 BesshiForm4Buppyo3PrintView 내부에서 단일 수행 (R-3/F-8).
 *
 * Plan: docs/00-pm/inheritance-besshi-result-view-integration.plan.md
 * Design: docs/02-design/features/inheritance-besshi-result-view-integration.ui.design.md
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { BesshiForm4Buppyo3PrintView } from "@/components/calc/inheritance/unlisted-stock-v2/BesshiForm4Buppyo3PrintView";

export interface UnlistedStockBesshiResultSectionProps {
  estateItems: EstateItem[];
}

export function UnlistedStockBesshiResultSection({
  estateItems,
}: UnlistedStockBesshiResultSectionProps) {
  // R-7/F-5: 정식평가 V2 자산만 별지 대상 (간편평가 unlistedStockData는 자동 제외)
  const unlistedItems = estateItems.filter((it) => it.unlistedStockValuationV2);
  if (unlistedItems.length === 0) return null; // R-5

  return (
    <section
      className="border border-border rounded-xl overflow-hidden"
      data-testid="besshi-result-section"
    >
      <h4 className="px-4 py-3 bg-muted/30 text-sm font-medium">
        비상장주식 평가서 (별지 제4호 부표3) — {unlistedItems.length}건
      </h4>
      {unlistedItems.map((it, i) => (
        <div key={it.id ?? i} className="p-3 border-t border-border first:border-t-0">
          {unlistedItems.length > 1 && (
            <p
              className="text-xs font-semibold mb-1 text-muted-foreground"
              data-testid="besshi-corp-header"
            >
              {it.unlistedStockValuationV2!.corpName || `법인 ${i + 1}`}
            </p>
          )}
          {/* Date 정규화·방어는 BesshiForm 내부에서 단일 수행 (R-3/F-8) */}
          <BesshiForm4Buppyo3PrintView input={it.unlistedStockValuationV2!} />
        </div>
      ))}
    </section>
  );
}
