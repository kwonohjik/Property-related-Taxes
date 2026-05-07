"use client";

import { HomeLinkButton } from "@/components/ui/home-link";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { cn } from "@/lib/utils";

interface Props {
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
  /**
   * propertyId → 지분율(분자/분모) 매핑 (선택).
   * 지분 단계취득 자산의 결과 카드에 "지분 X%" 라벨 표시용.
   * 단독 소유(100/100)는 미포함 또는 포함되어도 PropertyCard에서 미표시.
   */
  ownershipMap?: Map<string, { numerator: number; denominator: number }>;
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

// ─── 합산 신고서 양식 표 ──────────────────────────────────────
// 단건 결과 화면(TransferTaxResultView)의 FilingFormTable에 대응하는 합산 모드 신고서.
// 자산별 컬럼 + 합계 컬럼으로 양도소득세 신고서 핵심 항목을 표시.

function FilingFormTableAggregate({
  properties,
  aggregated,
  ownershipMap,
}: {
  properties: PerPropertyBreakdown[];
  aggregated: AggregateTransferResult;
  ownershipMap?: Map<string, { numerator: number; denominator: number }>;
}) {
  // 자산별 양도가액·취득가액·필요경비는 PerPropertyBreakdown에 노출됨.
  // 신고서 양식: 자본적지출(§97① 가목)은 취득가액에 합산, 필요경비는 양도비(§97① 나목)만 표시
  // (양도소득세 신고서 양식 표시 관행에 따라 — 엔진 양도차익 계산은 동일).
  const displayAcqPrice = (p: PerPropertyBreakdown) => p.acquisitionPrice + p.capitalExpenditureForDisplay;
  const displayNecessaryExpense = (p: PerPropertyBreakdown) =>
    Math.max(0, p.necessaryExpense - p.capitalExpenditureForDisplay);
  const sumTransferPrice = properties.reduce((s, p) => s + p.transferPrice, 0);
  const sumAcquisitionPrice = properties.reduce((s, p) => s + displayAcqPrice(p), 0);
  const sumNecessaryExpense = properties.reduce((s, p) => s + displayNecessaryExpense(p), 0);
  const sumTransferGain = properties.reduce((s, p) => s + p.transferGain, 0);
  const sumLongTermDeduction = properties.reduce((s, p) => s + p.longTermHoldingDeduction, 0);

  function ratioBadge(propertyId: string) {
    const own = ownershipMap?.get(propertyId);
    if (!own || own.numerator >= own.denominator || own.denominator <= 0) return null;
    const pct = ((own.numerator / own.denominator) * 100).toFixed(2).replace(/\.?0+$/, "");
    return (
      <span className="ml-1 text-[10px] font-semibold text-amber-700">
        지분 {pct}%
      </span>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-base">신고서 양식</h3>
        <span className="text-xs text-muted-foreground">
          양도소득세 신고서 항목별 자산-합산 계산 내역
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-medium">항목</th>
              {properties.map((p) => (
                <th key={p.propertyId} className="py-1.5 px-2 text-right font-medium">
                  {p.propertyLabel}
                  {ratioBadge(p.propertyId)}
                </th>
              ))}
              <th className="py-1.5 pl-2 text-right font-medium">합계</th>
            </tr>
          </thead>
          <tbody>
            <FilingRow label="양도가액" perAsset={properties.map((p) => p.transferPrice)} total={sumTransferPrice} />
            <FilingRow label="취득가액 (자본적지출 포함)" perAsset={properties.map(displayAcqPrice)} total={sumAcquisitionPrice} />
            <FilingRow label="필요경비 (양도비)" perAsset={properties.map(displayNecessaryExpense)} total={sumNecessaryExpense} muted />
            <FilingRow label="양도차익" perAsset={properties.map((p) => p.transferGain)} total={sumTransferGain} bold />
            <FilingRow
              label="장기보유특별공제"
              perAsset={properties.map((p) => -p.longTermHoldingDeduction)}
              total={-sumLongTermDeduction}
              muted
              negativePrefix="△"
            />
            <FilingRow label="양도소득금액" perAsset={properties.map((p) => p.income)} total={aggregated.totalIncomeAfterOffset} bold />
            <SeparatorRow span={properties.length + 2} />
            <FilingRow label="기본공제" perAsset={properties.map(() => null)} total={-aggregated.basicDeduction} muted negativePrefix="△" />
            <FilingRow label="과세표준" perAsset={properties.map(() => null)} total={aggregated.taxBase} bold highlight />
            <FilingRow label="산출세액" perAsset={properties.map((p) => p.refCalculatedTax)} total={aggregated.calculatedTax} bold />
            {aggregated.reductionAmount > 0 && (
              <FilingRow
                label="감면세액"
                perAsset={properties.map((p) => -p.reductionAggregated)}
                total={-aggregated.reductionAmount}
                muted
                negativePrefix="△"
              />
            )}
            <FilingRow label="결정세액" perAsset={properties.map((p) => p.refDeterminedTax)} total={aggregated.determinedTax} bold highlight />
            {aggregated.penaltyTax > 0 && (
              <FilingRow label="가산세" perAsset={properties.map((p) => p.penaltyTax + p.filingDelayedPenaltyTax)} total={aggregated.penaltyTax} muted />
            )}
            <SeparatorRow span={properties.length + 2} />
            <FilingRow label="지방소득세" perAsset={properties.map(() => null)} total={aggregated.localIncomeTax} muted />
            <FilingRow label="총 납부세액" perAsset={properties.map(() => null)} total={aggregated.totalTax} bold highlight />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilingRow({
  label,
  perAsset,
  total,
  bold,
  highlight,
  muted,
  negativePrefix,
}: {
  label: string;
  perAsset: (number | null)[];
  total: number;
  bold?: boolean;
  highlight?: boolean;
  muted?: boolean;
  negativePrefix?: string;
}) {
  function fmt(n: number | null): string {
    if (n === null) return "—";
    if (n === 0) return "0";
    if (negativePrefix && n < 0) return `${negativePrefix}${formatKRW(Math.abs(n))}`;
    return formatKRW(n);
  }
  return (
    <tr
      className={cn(
        "border-b last:border-0",
        highlight && "bg-amber-50/40",
        muted && "text-muted-foreground",
      )}
    >
      <td className={cn("py-1.5 pr-2", bold && "font-semibold")}>{label}</td>
      {perAsset.map((v, i) => (
        <td key={i} className={cn("py-1.5 px-2 text-right font-mono", bold && "font-semibold")}>
          {fmt(v)}
        </td>
      ))}
      <td className={cn("py-1.5 pl-2 text-right font-mono", bold && "font-semibold")}>
        {fmt(total)}
      </td>
    </tr>
  );
}

function SeparatorRow({ span }: { span: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={span} className="pt-1">
        <div className="border-t border-border/50" />
      </td>
    </tr>
  );
}

// ─── 자산별 카드 ──────────────────────────────────────────────

function PropertyCard({
  breakdown,
  ownership,
}: {
  breakdown: PerPropertyBreakdown;
  ownership?: { numerator: number; denominator: number };
}) {
  // 지분 모드(분자 < 분모) 시 "지분 X%" 라벨 표시. 단독 소유(분자 === 분모)는 미표시.
  const isFractional =
    ownership !== undefined &&
    ownership.denominator > 0 &&
    ownership.numerator > 0 &&
    ownership.numerator < ownership.denominator;
  const ratioPct = isFractional
    ? ((ownership.numerator / ownership.denominator) * 100).toFixed(2).replace(/\.?0+$/, "")
    : null;

  return (
    <div className="border rounded-md p-3 space-y-1">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="font-medium text-sm">{breakdown.propertyLabel}</span>
        {isFractional && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
            지분 {ratioPct}% ({ownership.numerator}/{ownership.denominator})
          </span>
        )}
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

  // aggregated.penaltyTax = 자산별 §114조의2 + 자산별 신고불성실/납부지연 합계
  const totalPenalty = aggregated.penaltyTax;
  const buildingPenaltySum = aggregated.properties.reduce(
    (s, p) => s + (p.penaltyTax ?? 0),
    0,
  );
  const filingDelayedSum = aggregated.properties.reduce(
    (s, p) => s + (p.filingDelayedPenaltyTax ?? 0),
    0,
  );
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

          {/* 가산세 — 자산별 합계 */}
          {totalPenalty > 0 && (
            <>
              <Row label="가산세" value={`+ ${formatKRW(totalPenalty)}`} />
              {buildingPenaltySum > 0 && (
                <Row label="· 환산가액가산세 (§114조의2)" value={formatKRW(buildingPenaltySum)} sub />
              )}
              {filingDelayedSum > 0 && (
                <Row label="· 신고불성실·납부지연 가산세" value={formatKRW(filingDelayedSum)} sub />
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

export function BundledAllocationCard({ apportionment, aggregated, ownershipMap, onBack, onReset }: Props) {
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

      {/* 합산 신고서 양식 — 자산별 컬럼 + 합계 */}
      <FilingFormTableAggregate
        properties={aggregated.properties}
        aggregated={aggregated}
        ownershipMap={ownershipMap}
      />

      {/* 자산별 세액 (요약 카드) */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base">자산별 계산 결과</h3>
        {aggregated.properties.map((p) => (
          <PropertyCard
            key={p.propertyId}
            breakdown={p}
            ownership={ownershipMap?.get(p.propertyId)}
          />
        ))}
      </div>

      {/* 합산 과세 내역 (납부세액 요약 대체) */}
      <AggregatedTaxSummary aggregated={aggregated} />

      {/* 하단 네비게이션 버튼 */}
      <div className="flex gap-3 print:hidden">
        <HomeLinkButton className="flex-1" />
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
