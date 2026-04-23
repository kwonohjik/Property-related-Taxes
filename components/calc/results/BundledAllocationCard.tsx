"use client";

import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { cn } from "@/lib/utils";

interface Props {
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
  onBack?: () => void;
  onReset?: () => void;
}

// ─── 기본 행 ──────────────────────────────────────────────────

function Row({ label, value, sub = false, highlight = false, className }: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <tr className={cn(highlight ? "bg-muted/40 font-semibold" : "", className)}>
      <td className={`py-1.5 pr-3 text-sm ${sub ? "pl-5 text-muted-foreground text-xs" : "font-medium"}`}>
        {label}
      </td>
      <td className="py-1.5 text-right text-sm font-mono tabular-nums">{value}</td>
    </tr>
  );
}

function Divider() {
  return (
    <tr>
      <td colSpan={2} className="py-0">
        <div className="border-t border-border/60" />
      </td>
    </tr>
  );
}

// ─── 자산별 카드 ──────────────────────────────────────────────

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

// ─── 감면 타입 레이블 ─────────────────────────────────────────

const REDUCTION_TYPE_LABELS: Record<string, string> = {
  self_farming: "자경농지 (§69)",
  self_farming_inherited: "자경농지·상속인 경작기간 합산 (§69·§66⑪)",
  self_farming_incorp: "자경농지·편입일 부분감면 (§69·§66⑤⑥)",
  livestock: "축산업 (§69의2)",
  fishing: "어업 (§69의3)",
  public_expropriation: "공익사업 수용 (§77)",
};

// ─── 합산 과세 내역 카드 ──────────────────────────────────────

function AggregatedTaxSummary({ aggregated }: { aggregated: AggregateTransferResult }) {
  const hasMultipleGroups = aggregated.groupTaxes.length > 1;

  // aggregated.penaltyTax = §114조의2 건별 합 + penaltyDetail.totalPenalty (이미 포함)
  const totalPenalty = aggregated.penaltyTax;
  const buildingPenalty = totalPenalty - (aggregated.penaltyDetail?.totalPenalty ?? 0);
  const nationalTax = aggregated.determinedTax + totalPenalty;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="font-semibold text-base mb-3">합산 과세 내역</h3>
      <table className="w-full">
        <tbody>
          {/* 양도소득금액 합산 */}
          <Row
            label="양도소득금액 (합산)"
            value={formatKRW(aggregated.totalIncomeAfterOffset)}
          />

          {/* 기본공제 */}
          {aggregated.basicDeduction > 0 && (
            <Row
              label="기본공제"
              value={`△${formatKRW(aggregated.basicDeduction)}`}
              sub
            />
          )}

          <Divider />

          {/* 과세표준 */}
          <Row label="과세표준" value={formatKRW(aggregated.taxBase)} highlight />

          {/* 세율 */}
          {hasMultipleGroups ? (
            <>
              <Row label="세율" value="세율군별 복합" />
              {aggregated.groupTaxes.map((g) => (
                <Row
                  key={g.group}
                  label={`· ${g.group === "progressive" ? "일반 누진" : g.group === "short_term" ? "단기보유" : g.group === "multi_house_surcharge" ? "다주택 중과" : g.group === "non_business_land" ? "비사업용토지" : "미등기"} (과표 ${formatKRW(g.groupTaxBase)})`}
                  value={`${(g.appliedRate * 100).toFixed(0)}%${g.surchargeRate ? ` +${(g.surchargeRate * 100).toFixed(0)}%p` : ""}`}
                  sub
                />
              ))}
            </>
          ) : aggregated.groupTaxes.length === 1 ? (
            <Row
              label={`세율${aggregated.groupTaxes[0].surchargeRate ? ` (기본 ${(aggregated.groupTaxes[0].appliedRate * 100).toFixed(0)}% + 중과 ${(aggregated.groupTaxes[0].surchargeRate * 100).toFixed(0)}%p)` : ""}`}
              value={`${((aggregated.groupTaxes[0].appliedRate + (aggregated.groupTaxes[0].surchargeRate ?? 0)) * 100).toFixed(0)}%`}
            />
          ) : null}

          <Divider />

          {/* 산출세액 */}
          <Row label="산출세액" value={formatKRW(aggregated.calculatedTax)} />

          {/* 세액공제·감면 */}
          {aggregated.reductionAmount > 0 && (
            <>
              <Row
                label="세액공제·감면"
                value={`△${formatKRW(aggregated.reductionAmount)}`}
              />
              {aggregated.reductionBreakdown.length > 0
                ? aggregated.reductionBreakdown.map((entry) => (
                    <Row
                      key={entry.type}
                      label={`· ${REDUCTION_TYPE_LABELS[entry.type] ?? entry.type}${entry.cappedByLimit ? ` (한도 ${formatKRW(entry.annualLimit)})` : ""}`}
                      value={`△${formatKRW(entry.cappedAggregateReduction)}`}
                      sub
                    />
                  ))
                : null}
            </>
          )}

          <Divider />

          {/* 결정세액 */}
          <Row label="결정세액" value={formatKRW(aggregated.determinedTax)} highlight />

          {/* 가산세 */}
          {totalPenalty > 0 && (
            <>
              <Row label="가산세" value={`+ ${formatKRW(totalPenalty)}`} />
              {buildingPenalty > 0 && (
                <Row label="· 환산가액가산세 (§114조의2)" value={formatKRW(buildingPenalty)} sub />
              )}
              {aggregated.penaltyDetail?.filingPenalty && aggregated.penaltyDetail.filingPenalty.filingPenalty > 0 && (
                <Row
                  label={`· 신고불성실가산세 (${(aggregated.penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%)`}
                  value={formatKRW(aggregated.penaltyDetail.filingPenalty.filingPenalty)}
                  sub
                />
              )}
              {aggregated.penaltyDetail?.delayedPaymentPenalty && aggregated.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty > 0 && (
                <Row
                  label={`· 납부지연가산세 (${aggregated.penaltyDetail.delayedPaymentPenalty.elapsedDays}일)`}
                  value={formatKRW(aggregated.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty)}
                  sub
                />
              )}
            </>
          )}

          <Divider />

          {/* 국세 납부세액 */}
          <Row label="국세 납부세액" value={formatKRW(nationalTax)} />

          {/* 지방세 납부세액 */}
          <Row
            label="지방세 납부세액 (지방소득세, 결정세액+가산세 × 10%)"
            value={formatKRW(aggregated.localIncomeTax)}
            sub
          />

          <Divider />

          {/* 총납부세액 */}
          <Row label="총납부세액" value={formatKRW(aggregated.totalTax)} highlight />
        </tbody>
      </table>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────

export function BundledAllocationCard({ apportionment, aggregated, onBack, onReset }: Props) {
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

      {/* 합산 과세 내역 (납부세액 요약 대체) */}
      <AggregatedTaxSummary aggregated={aggregated} />

      {/* 하단 네비게이션 버튼 */}
      <div className="flex gap-3 print:hidden">
        <a
          href="/"
          className="flex-1 rounded-lg border border-border py-2.5 text-center text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          홈으로
        </a>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            이전 화면
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            다시 계산하기
          </button>
        )}
      </div>
    </div>
  );
}
