"use client";

import { HomeLinkButton } from "@/components/ui/home-link";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
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
  /** 마법사 폼 데이터 — 신고서 양식 표 자산별 머리 정보(취득일/거주기간 등) 표시용 */
  formData: TransferFormData;
  onBack?: () => void;
  onReset?: () => void;
}

/**
 * AggregateTransferResult → TransferTaxResult 어댑팅 (FilingFormTable 호환).
 * `aggregate` prop과 함께 호출하므로 result는 합계 보조용. `aggregate` 모드가 우선 적용되어
 * mixed-use/split 분기는 발동하지 않음.
 */
function aggregateToFilingResult(a: AggregateTransferResult): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: a.totalTransferGain,
    taxableGain: a.totalTransferGain,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: a.totalLongTermHoldingDeduction,
    longTermHoldingRate: 0,
    basicDeduction: a.basicDeduction,
    taxBase: a.taxBase,
    appliedRate: 0,
    progressiveDeduction: 0,
    calculatedTax: a.calculatedTax,
    isSurchargeSuspended: false,
    reductionAmount: a.reductionAmount,
    determinedTax: a.determinedTax,
    penaltyTax: a.penaltyTax,
    penaltyBase: 0, // 어댑터: 합계 카드 표시용으로 자산별 penaltyBase는 BundledAllocationCard에서 별도 합산
    localIncomeTax: a.localIncomeTax,
    totalTax: a.totalTax,
    steps: a.steps,
  };
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
              {buildingPenaltySum > 0 && (() => {
                // penaltyBase: PerPropertyBreakdown 정식 필드 (사례 32 후속 PR로 승격, 캐스트 제거)
                const penaltyBaseSum = aggregated.properties.reduce(
                  (s, p) => s + (p.penaltyBase ?? 0),
                  0,
                );
                return (
                  <Row
                    label={`· 환산취득가액 가산세 (소득세법 §114조의2 ①)${penaltyBaseSum > 0 ? ` = 건물 환산취득가 ${formatKRW(penaltyBaseSum)} × 5%` : ""}`}
                    value={formatKRW(buildingPenaltySum)}
                    sub
                  />
                );
              })()}
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

export function BundledAllocationCard({ apportionment, aggregated, ownershipMap, formData, onBack, onReset }: Props) {
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

      {/* 합산 신고서 양식 — 단건과 동일한 32행, 합계 + 자산별 컬럼 */}
      {(() => {
        // landNatureMap: propertyId → "appurtenant" | "standalone" (토지 자산 성격 라벨 suffix용)
        const landNatureMap = new Map<string, "appurtenant" | "standalone">();
        for (const p of aggregated.properties) {
          const asset =
            p.propertyId === "primary"
              ? formData.assets[0]
              : formData.assets.find((a) => a.assetId === p.propertyId);
          if (asset?.assetKind === "land" && asset.landNature) {
            landNatureMap.set(p.propertyId, asset.landNature);
          }
        }
        return (
          <FilingFormTable
            result={aggregateToFilingResult(aggregated)}
            formData={formData}
            aggregate={{
              properties: aggregated.properties,
              aggregated,
              ownershipMap,
              landNatureMap: landNatureMap.size > 0 ? landNatureMap : undefined,
            }}
          />
        );
      })()}

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
