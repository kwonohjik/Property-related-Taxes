"use client";

import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

interface Props {
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
}

function Row({ label, value, sub = false, highlight = false }: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-muted/40 font-semibold" : ""}>
      <td className={`py-1.5 pr-3 text-sm ${sub ? "pl-4 text-muted-foreground" : "font-medium"}`}>
        {label}
      </td>
      <td className="py-1.5 text-right text-sm font-mono tabular-nums">{value}</td>
    </tr>
  );
}

function PropertyCard({ breakdown }: { breakdown: PerPropertyBreakdown }) {
  return (
    <div className="border rounded-md p-3 space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-sm">{breakdown.propertyLabel}</span>
        {breakdown.isExempt && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">비과세</span>
        )}
        {breakdown.reductionAmount > 0 && !breakdown.isExempt && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">감면</span>
        )}
      </div>
      <table className="w-full">
        <tbody>
          {!breakdown.isExempt && (
            <>
              <Row label="양도차익" value={formatKRW(breakdown.transferGain)} sub />
              <Row label="장특공" value={`△${formatKRW(breakdown.longTermHoldingDeduction)}`} sub />
              <Row label="양도소득금액" value={formatKRW(breakdown.income)} />
              <Row label="과세표준" value={formatKRW(breakdown.taxBaseShare)} />
              {breakdown.reductionAmount > 0 && (
                <Row label="감면세액" value={`△${formatKRW(breakdown.reductionAmount)}`} sub />
              )}
            </>
          )}
          {breakdown.isExempt && (
            <Row
              label={breakdown.exemptReason ?? "비과세"}
              value="해당 없음"
              sub
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

export function BundledAllocationCard({ apportionment, aggregated }: Props) {
  return (
    <div className="space-y-6">
      {/* 안분 결과 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-base">양도가액 안분</h3>
          <LawArticleModal legalBasis={apportionment.legalBasis} />
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-1 pr-2 text-left font-normal">구분</th>
              <th className="pb-1 pr-2 text-right font-normal">기준시가</th>
              <th className="pb-1 pr-2 text-right font-normal">비율</th>
              <th className="pb-1 text-right font-normal">안분 양도가액</th>
            </tr>
          </thead>
          <tbody>
            {apportionment.apportioned.map((a) => (
              <tr key={a.assetId} className="border-b last:border-0 text-sm">
                <td className="py-1.5 pr-2">{a.assetLabel}</td>
                <td className="py-1.5 pr-2 text-right font-mono">
                  {formatKRW(a.standardPriceAtTransfer)}
                </td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">
                  {(a.displayRatio * 100).toFixed(2)}%
                </td>
                <td className="py-1.5 text-right font-mono font-medium">
                  {formatKRW(a.allocatedSalePrice)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-sm">
              <td className="pt-2 pr-2">합계</td>
              <td className="pt-2 pr-2 text-right font-mono">
                {formatKRW(apportionment.totalStandardAtTransfer)}
              </td>
              <td className="pt-2 pr-2 text-right">100%</td>
              <td className="pt-2 text-right font-mono">
                {formatKRW(apportionment.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 자산별 세액 */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base">자산별 계산 결과</h3>
        {aggregated.properties.map((p) => (
          <PropertyCard key={p.propertyId} breakdown={p} />
        ))}
      </div>

      {/* 합산 요약 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-base mb-3">납부세액 요약</h3>
        <table className="w-full">
          <tbody>
            <Row label="산출세액" value={formatKRW(aggregated.calculatedTax)} />
            {aggregated.reductionAmount > 0 && (
              <Row label="감면세액" value={`△${formatKRW(aggregated.reductionAmount)}`} sub />
            )}
            <Row label="결정세액" value={formatKRW(aggregated.determinedTax)} highlight />
            <Row
              label="지방소득세 (결정세액 × 10%)"
              value={formatKRW(aggregated.localIncomeTax)}
              sub
            />
            <Row label="총 납부세액" value={formatKRW(aggregated.totalTax)} highlight />
          </tbody>
        </table>
      </div>
    </div>
  );
}
