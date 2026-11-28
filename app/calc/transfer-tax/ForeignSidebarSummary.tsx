"use client";

/**
 * 국외자산 부동산 마법사 사이드바 합계(⑥) — 렌더 전용. 값은 `computeForeignRealEstateSummary`(순수 함수)가 만든다.
 * 0원·null은 줄 자체를 만들지 않는다. 입력이 하나도 없으면 안내 한 줄.
 */
import type { ForeignRealEstateSummary } from "@/lib/stores/transfer-foreign-summary";

function Line({ label, value, strong, testId }: { label: string; value: number; strong?: boolean; testId?: string }) {
  return (
    <div className={`text-sm ${strong ? "font-semibold" : ""}`} data-testid={testId}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <p className="text-right font-mono tabular-nums whitespace-nowrap">{value.toLocaleString("ko-KR")}</p>
    </div>
  );
}

export function ForeignSidebarSummary({ summary }: { summary: ForeignRealEstateSummary }) {
  const showAssetHeader = summary.rows.length >= 2;
  const hasInput = summary.rows.some((r) => r.transferKrw > 0 || r.acquisitionKrw > 0 || r.expenseKrw > 0);
  if (!hasInput && !summary.hasResult) {
    return <p className="text-xs text-muted-foreground">외화 금액과 환율을 입력하면 원화 환산액이 표시됩니다.</p>;
  }
  return (
    <div className="space-y-3" data-testid="foreign-sidebar-summary">
      {summary.rows.map((r, i) => {
        if (r.transferKrw <= 0 && r.acquisitionKrw <= 0 && r.expenseKrw <= 0) return null;
        return (
          <div key={r.index} className={`space-y-1.5${i > 0 ? " border-t pt-3" : ""}`}>
            {showAssetHeader && <p className="text-xs font-semibold text-foreground/80">{r.label}</p>}
            {r.transferKrw > 0 && <Line label="양도가액(원화)" value={r.transferKrw} />}
            {r.acquisitionKrw > 0 && <Line label="취득가액(원화)" value={r.acquisitionKrw} />}
            {r.expenseKrw > 0 && <Line label="필요경비(원화)" value={r.expenseKrw} />}
          </div>
        );
      })}
      {showAssetHeader && summary.totalTransferKrw > 0 && (
        <div className="border-t pt-2">
          <Line label="합계 양도가액" value={summary.totalTransferKrw} strong />
        </div>
      )}
      {summary.notLiable && (
        <p className="border-t pt-2 text-sm font-semibold" data-testid="foreign-sidebar-not-liable">
          납세의무 없음 (거주 5년 미만)
        </p>
      )}
      {summary.hasResult && !summary.notLiable && (
        <div className="space-y-1.5 border-t pt-2">
          {summary.capitalGainTotal !== null && <Line label={summary.hasLossAsset ? "양도차익 합계 (차손 포함)" : "양도차익"} value={summary.capitalGainTotal} />}
          {summary.incomeAmountTotal !== null && <Line label="양도소득금액" value={summary.incomeAmountTotal} />}
          {summary.basicDeduction !== null && <Line label="기본공제(§118의7)" value={summary.basicDeduction} />}
          {summary.taxBase !== null && <Line label="과세표준" value={summary.taxBase} />}
          {summary.calculatedTax !== null && <Line label="산출세액" value={summary.calculatedTax} />}
          {summary.foreignTaxCreditApplied !== null && <Line label="외국납부세액공제" value={summary.foreignTaxCreditApplied} />}
          {summary.localIncomeTax !== null && <Line label="지방소득세" value={summary.localIncomeTax} />}
          {summary.totalTax !== null && <Line label="총 납부세액" value={summary.totalTax} strong testId="foreign-sidebar-total-tax" />}
        </div>
      )}
    </div>
  );
}
