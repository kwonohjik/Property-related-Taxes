"use client";

import { HomeButton } from "@/components/calc/shared/HomeButton";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { SaleSplitJudgmentBlock } from "@/components/calc/results/transfer/SaleSplitJudgmentBlock";
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
  /** 부담부증여 §159 산정 명세 (일반건물 + 부담부증여 모드에서만 — 증여세 통합 결과 포함). */
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  onBack?: () => void;
  onReset?: () => void;
}

/**
 * AggregateTransferResult → TransferTaxResult 어댑팅 (FilingFormTable 호환).
 * `aggregate` prop과 함께 호출하므로 result는 합계 보조용. `aggregate` 모드가 우선 적용되어
 * mixed-use/split 분기는 발동하지 않음.
 *
 * MultiTransferTaxResultView·BundledAllocationCard·DetailedCalculationStatementCard에서 공유.
 */
export function aggregateToFilingResult(a: AggregateTransferResult): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: a.totalTransferGain,
    taxableGain: a.totalTransferGain,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: a.totalLongTermHoldingDeduction,
    longTermHoldingRate: 0,
    lthdStartDate: new Date(0), // aggregateToFilingResult mock: 단건 결과 합산 표시용, 실값 미사용

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
    // UI 자산별 산식 인라인 표시용 — 사례 31·33 일반건물 일괄 모드만 채워짐.
    generalBuildingValuationDetail: a.generalBuildingValuationDetail,
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
  assetKind,
  exemptionNote,
}: {
  breakdown: PerPropertyBreakdown;
  ownership?: { numerator: number; denominator: number };
  /** 안분 결과의 자산 종류 — 토지·건물 분리 안내 문구 분기용(자산별로 다르다). */
  assetKind?: string;
  /** §166⑧ 예외 근거 문구 — 엔진 미전송이라 폼에서 읽어 내려온다(계획서 §15.3). */
  exemptionNote?: string;
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
      {/*
        감면·취득가액 산출근거 — 단건 결과 화면과 **같은 컴포넌트**를 재사용한다.
        종전에는 집계가 Detail을 버려서 "감면" 배지만 뜨고 근거를 볼 수 없었다.

        ⚠️ `calculatedTax`·`taxBase`는 자산별 **참고값**(`refCalculatedTax`·`taxBaseShare`)을
           넘긴다 — 일괄은 합산 과세표준으로 세액을 산출하므로 자산별 값과 다르다.
           타입 정의(`PerPropertyBreakdown`)가 두 필드를 "다건 컨텍스트, 참고"로 명시한다.
      */}
      <ReductionDetailCards
        result={breakdown}
        calculatedTax={breakdown.refCalculatedTax}
        taxBase={breakdown.taxBaseShare}
      />
      {/*
        평가·판정 산출근거 (R1-a) — 상가 환산 §164⑥·비사업용토지·다주택 중과·PHD 등.
        금액 prop은 **자산별 안분값**을 넘긴다(단건의 총계약가와 의미가 다르다).
      */}
      <ValuationDetailCards
        result={breakdown}
        transferPrice={breakdown.transferPrice}
        transferGain={breakdown.transferGain}
        longTermDeduction={breakdown.longTermHoldingDeduction}
        taxableIncome={breakdown.incomeAfterOffset}
        assetKind={assetKind}
        {...(exemptionNote ? { exemptionNote } : {})}
      />
    </div>
  );
}

// ─── 일반건물 3-way 요약 표 ───────────────────────────────────

/**
 * 일반건물 증축 케이스(사례 33) 전용 — 토지(1001)·건물1(3001)·건물2(3002) 3열 요약 표.
 * 영 §102② 결손 통산 전·후 양도소득금액을 자산별로 분리 표시.
 *
 * 진입 조건: aggregated.properties 중 propertyLabel에 "3002" 포함한 항목이 있을 때.
 */
function GeneralBuilding3WayTable({ aggregated }: { aggregated: AggregateTransferResult }) {
  // 3-way 유효성 확인: 정확히 3개 카드이고, 마지막 카드가 "증축건물(3002)"일 때만 렌더
  const props = aggregated.properties;
  if (props.length !== 3) return null;
  const hasExtension = props.some((p) => p.propertyLabel.includes("3002"));
  if (!hasExtension) return null;

  const land = props.find((p) => p.propertyLabel.includes("1001")) ?? props[0];
  const bld1 = props.find((p) => p.propertyLabel.includes("3001")) ?? props[1];
  const bld2 = props.find((p) => p.propertyLabel.includes("3002")) ?? props[2];

  // 통산 분배: 건물1 결손(음수 income)이 토지·건물2로 안분 흡수됨
  const lossOffset1 = bld1.income < 0 ? Math.abs(bld1.income) : 0;
  // 토지·건물2의 통산 흡수분 = lossOffsetFromOtherGroup (aggregate가 채움)
  const landOffsetAbsorbed = land.lossOffsetFromSameGroup + land.lossOffsetFromOtherGroup;
  const bld2OffsetAbsorbed = bld2.lossOffsetFromSameGroup + bld2.lossOffsetFromOtherGroup;

  const fmt = (n: number) => {
    if (n === 0) return "0";
    return n < 0
      ? `△${formatKRW(Math.abs(n))}`
      : formatKRW(n);
  };

  // 결손 통산 분배량 (토지·건물2가 흡수한 양, 건물1은 결손 전액)
  const landOffsetRow = landOffsetAbsorbed > 0 ? `△${formatKRW(landOffsetAbsorbed)}` : "-";
  const bld1OffsetRow = lossOffset1 > 0 ? `+${formatKRW(lossOffset1)}` : "-";
  const bld2OffsetRow = bld2OffsetAbsorbed > 0 ? `△${formatKRW(bld2OffsetAbsorbed)}` : "-";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="font-semibold text-base mb-1">일반건물 3-자산 요약 (영 §102② 결손 통산)</h3>
      <p className="text-xs text-muted-foreground mb-3">
        토지(1001) · 건물1(3001, 실가) · 증축건물2(3002, 환산) 소득 라인을 분리 표시.
        건물1 결손이 토지·건물2에 안분 흡수됩니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-1 pr-2 text-left font-normal">구분</th>
              <th className="pb-1 pr-2 text-right font-normal">
                토지
                <span className="ml-1 text-micro text-sky-600">(1001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물1
                <span className="ml-1 text-micro text-emerald-600">(3001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물2
                <span className="ml-1 text-micro text-fuchsia-600">(3002·증축)</span>
              </th>
              <th className="pb-1 text-right font-normal">합계</th>
            </tr>
          </thead>
          <tbody>
            {/* 양도가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">양도가액</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(land.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld1.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld2.transferPrice)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.transferPrice + bld1.transferPrice + bld2.transferPrice)}
              </td>
            </tr>
            {/* 취득가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">취득가액</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(land.acquisitionPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld1.acquisitionPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(bld2.acquisitionPrice)}
                <span className="ml-1 text-micro text-fuchsia-600">(환산)</span>
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.acquisitionPrice + bld1.acquisitionPrice + bld2.acquisitionPrice)}
              </td>
            </tr>
            {/* 필요경비 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">필요경비</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(land.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld1.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(bld2.necessaryExpense)}
                <span className="ml-1 text-micro text-muted-foreground">(개산공제 §163⑥)</span>
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.necessaryExpense + bld1.necessaryExpense + bld2.necessaryExpense)}
              </td>
            </tr>
            {/* 양도차익 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 font-medium">양도차익</td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(land.transferGain)}</td>
              <td className={`py-1 pr-2 text-right font-mono font-medium ${bld1.transferGain < 0 ? "text-rose-600" : ""}`}>
                {fmt(bld1.transferGain)}
              </td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(bld2.transferGain)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {fmt(land.transferGain + bld1.transferGain + bld2.transferGain)}
              </td>
            </tr>
            {/* 장기보유공제 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">장기보유공제</td>
              <td className="py-1 pr-2 text-right font-mono">△{formatKRW(land.longTermHoldingDeduction)}</td>
              <td className="py-1 pr-2 text-right font-mono text-muted-foreground">
                {bld1.longTermHoldingDeduction > 0 ? `△${formatKRW(bld1.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 pr-2 text-right font-mono">
                {bld2.longTermHoldingDeduction > 0 ? `△${formatKRW(bld2.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                △{formatKRW(land.longTermHoldingDeduction + bld1.longTermHoldingDeduction + bld2.longTermHoldingDeduction)}
              </td>
            </tr>
            {/* 양도소득금액 (통산 전) */}
            <tr className="border-b border-border/40 bg-muted/20">
              <td className="py-1 pr-2 font-medium">양도소득금액</td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(land.income)}</td>
              <td className={`py-1 pr-2 text-right font-mono font-medium ${bld1.income < 0 ? "text-rose-600" : ""}`}>
                {fmt(bld1.income)}
              </td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(bld2.income)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {fmt(land.income + bld1.income + bld2.income)}
              </td>
            </tr>
            {/* 영 §102② 통산 흡수 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground text-caption">
                결손 통산 (영§102②)
              </td>
              <td className="py-1 pr-2 text-right font-mono text-rose-600 text-xs">{landOffsetRow}</td>
              <td className="py-1 pr-2 text-right font-mono text-emerald-600 text-xs">{bld1OffsetRow}</td>
              <td className="py-1 pr-2 text-right font-mono text-rose-600 text-xs">{bld2OffsetRow}</td>
              <td className="py-1 text-right font-mono text-xs text-muted-foreground">0</td>
            </tr>
            {/* 통산 후 양도소득금액 */}
            <tr className="bg-muted/40 font-semibold">
              <td className="py-1.5 pr-2 text-sm">통산 후 양도소득금액</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(land.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(bld1.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(bld2.incomeAfterOffset)}</td>
              <td className="py-1.5 text-right font-mono">
                {formatKRW(land.incomeAfterOffset + bld1.incomeAfterOffset + bld2.incomeAfterOffset)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        양도소득금액 합계는 통산 전후 동일하지만,{" "}
        <strong>자산별 분포가 변경</strong>됩니다. 건물1 결손이 토지·건물2 양수에 흡수되어
        세율 적용 기준 양도소득금액이 자산 단위로 재분배됩니다 (영 §102②).
      </p>
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

export function BundledAllocationCard({ apportionment, aggregated, ownershipMap, formData, transferBurdenedGiftBreakdown, onBack, onReset }: Props) {
  return (
    <div className="space-y-6">
      {/* 부담부증여 §159·증여세 통합 명세 (일반건물 부담부증여 모드 전용) */}
      {transferBurdenedGiftBreakdown && (
        <BurdenedGiftDetailCard
          breakdown={transferBurdenedGiftBreakdown}
          propertyType="general_building"
        />
      )}

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

      {/*
        §100③ 판정 (Phase 2) — **일반건물 구분양도 전용**.
        ⚠️ 일반건물은 자산 카드 2장을 만들어 aggregate 경로로 흐르므로 화면도 이 다자산 뷰다
           (`TransferTaxResultView`의 GB 상세 카드는 이 경로에서 렌더되지 않는다).
           표시를 붙일 곳을 여기로 잡지 않으면 **판정이 계산에만 반영되고 화면에는 안 보인다**.
      */}
      {aggregated.generalBuildingValuationDetail?.saleSplitJudgment && (
        <SaleSplitJudgmentBlock
          j={aggregated.generalBuildingValuationDetail.saleSplitJudgment}
          // 근거 문구는 엔진을 거치지 않는다(계획서 §15.3) — 폼에서 직접 읽는다.
          {...(formData.assets[0]?.saleSplitExemptionNote
            ? { exemptionNote: formData.assets[0].saleSplitExemptionNote }
            : {})}
        />
      )}

      {/*
        §163⑨ 상속 취득가액 직접 산정 — **파트별**(C1 전부 상속 · C2·C2′·C3 부분 상속).

        ⚠️ 표시를 여기 붙이는 이유는 바로 위 §100③ 블록과 같다 — 일반건물은 aggregate 경로로
           흐르므로 `GeneralBuildingValuationDetailCard`(TransferTaxResultView 전용)는
           **렌더되지 않는다**. 그쪽에만 라벨을 두면 계산에는 반영되고 화면에는 안 보인다.
      */}
      {(aggregated.generalBuildingValuationDetail?.acquisitionByInheritance ||
        aggregated.generalBuildingValuationDetail?.buildingAcquisitionByInheritance) && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-violet-900">
            상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨
          </p>
          <p className="text-xs text-violet-800">
            상속개시일 현재 「상속세 및 증여세법」 §60~§66 평가액을 취득당시의 실지거래가액으로
            봅니다. 그 파트는 환산취득가·개산공제(§163⑥)를 적용하지 않습니다.
          </p>
          <ul className="text-xs text-violet-900 space-y-0.5 pt-1">
            {(["land", "building"] as const).map((kind) => {
              const inherited =
                kind === "land"
                  ? aggregated.generalBuildingValuationDetail?.acquisitionByInheritance
                  : aggregated.generalBuildingValuationDetail?.buildingAcquisitionByInheritance;
              const alloc = apportionment.apportioned.find((a) => a.assetKind === kind);
              if (!alloc) return null;
              return (
                <li key={kind} className="flex items-baseline justify-between gap-3">
                  <span>
                    {kind === "land" ? "토지분" : "건물분"} 취득가액
                    <span className="ml-1 text-violet-600">
                      {inherited ? "(상속개시일 평가액)" : "(상속 아님 — 종전 산정)"}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
                    {formatKRW(alloc.allocatedAcquisitionPrice)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* §97② 2호 단서 swap 발동 표시 (일반건물 환산 자산총액 판정 — F10) */}
      {aggregated.swapApplied && aggregated.swapComparison && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-amber-900">
            필요경비 swap 적용 — 소득세법 §97② 2호 단서
          </p>
          <p className="text-xs text-amber-800">
            환산취득가 + 개산공제 합 {formatKRW(aggregated.swapComparison.estimatedSide)}
            {" < "}자본적지출 + 양도비 {formatKRW(aggregated.swapComparison.directSide)}
          </p>
          <p className="text-xs text-amber-800">
            → 자본적지출 + 양도비 {formatKRW(aggregated.swapComparison.directSide)}을 필요경비로 적용(환산취득가 미차감, 자산별 비율 배분)
          </p>
        </div>
      )}

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
        const aggregateMeta = {
          properties: aggregated.properties,
          aggregated,
          ownershipMap,
          landNatureMap: landNatureMap.size > 0 ? landNatureMap : undefined,
        };
        // 부담부증여 §159 배지·결과 카드 통합 — adapt 후 breakdown 추가 주입.
        const adaptedResult = {
          ...aggregateToFilingResult(aggregated),
          transferBurdenedGiftBreakdown,
        };
        // 일괄양도 합산 모드: aggregate prop이 deriveColumns에서 우선 적용되어 redev 분기 미진입.
        // 재개발 입주권 자산이 포함된 경우를 위해 props는 전달하되 aggregate 모드에서 자동 무시.
        const primaryAsset = formData.assets[0];
        const hasRedev = !!adaptedResult.redevelopmentDetail;
        return (
          <>
            <FilingFormTable
              result={adaptedResult}
              formData={formData}
              aggregate={aggregateMeta}
              redevSubject={
                hasRedev
                  ? ((primaryAsset?.redevSubject || (primaryAsset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
                  : undefined
              }
              redevSettlementDirection={
                hasRedev
                  ? ((primaryAsset?.redevSettlementDirection || "pay") as "pay" | "receive")
                  : undefined
              }
            />
            {/* ── 계산결과 상세명세서 (다건 모드) ── */}
            <DetailedCalculationStatementCard
              result={adaptedResult}
              formData={formData}
              asset={formData.assets[0]}
              aggregate={aggregateMeta}
            />
          </>
        );
      })()}

      {/* 일반건물 3-way 요약 표 (사례 33 증축 케이스 — 토지·건물1·건물2) */}
      <GeneralBuilding3WayTable aggregated={aggregated} />

      {/* 자산별 세액 (요약 카드) */}
      <div className="space-y-3">
        <h3 className="font-semibold text-base">자산별 계산 결과</h3>
        {aggregated.properties.map((p) => (
          <PropertyCard
            key={p.propertyId}
            breakdown={p}
            ownership={ownershipMap?.get(p.propertyId)}
            assetKind={
              apportionment.apportioned.find((a) => a.assetId === p.propertyId)?.assetKind
            }
            // §166⑧ 예외 근거는 엔진을 거치지 않으므로(계획서 §15.3) 폼에서 **자산별로** 찾아 넘긴다.
            {...(() => {
              const note = formData.assets.find((a) => a.assetId === p.propertyId)?.saleSplitExemptionNote;
              return note ? { exemptionNote: note } : {};
            })()}
          />
        ))}
      </div>

      {/* 합산 과세 내역 (납부세액 요약 대체) */}
      <AggregatedTaxSummary aggregated={aggregated} />

      {/* 하단 네비게이션 버튼 — 입력 단계 네비와 통일 (컴팩트 nav + 글자폭 CTA) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <HomeButton />
          {onBack && <NavButton direction="prev" label="이전 화면" onClick={onBack} />}
        </div>
        {onReset && <CtaButton onClick={onReset}>다시 계산하기</CtaButton>}
      </div>
    </div>
  );
}
