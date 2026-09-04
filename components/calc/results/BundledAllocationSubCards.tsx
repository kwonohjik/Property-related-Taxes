/**
 * 일괄양도 결과 — **자산 카드 · 합산 세액 요약** 서브 컴포넌트.
 *
 * `BundledAllocationCard.tsx`에서 분리했다(800줄 정책). 그 파일은 전체 배치를 맡고,
 * 여기는 개별 카드와 요약 표만 맡는다. 방향은 한쪽뿐이다.
 */
"use client";

import { cn } from "@/lib/utils";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { ValuationDetailCards } from "@/components/calc/results/transfer/ValuationDetailCards";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { reductionTypeLabelOf } from "@/lib/tax-engine/transfer-reduction-type-labels";



// ─── 자산별 카드 ──────────────────────────────────────────────

export function Row({ label, value, sub = false, highlight = false, className }: {
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

export function Divider() {
  return (
    <tr>
      <td colSpan={2} className="py-0">
        <div className="border-t border-border/60" />
      </td>
    </tr>
  );
}

export function PropertyCard({
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

        🔴 그래서 `aggregatedContext`가 **필수**다(2026-08-28 · 결과탭 코드리뷰 #044).
           종전에는 이 prop이 빠져 §77 계열 카드가 참고값으로 「⑤ 감면세액 = 산출세액 ×
           감면대상소득/과세표준」을 단정했다. 그 값은 실제 적용액이 아니다 — 일괄도 다건과
           같이 §133 합산 재계산 경로를 타므로 최종 감면세액은 「합산 과세 내역」의
           `reductionBreakdown` 행이 낸다. 실측(2자산 §77): 카드 2장 합 65,388,000 vs
           실제 적용 71,156,446. 게다가 분자·분모는 집계 참고값인데 결과값은 단건 엔진 값이라
           **카드가 찍는 등식 자체가 성립하지 않았다**.
      */}
      <ReductionDetailCards
        result={breakdown}
        calculatedTax={breakdown.refCalculatedTax}
        taxBase={breakdown.taxBaseShare}
        longTermHoldingDeduction={breakdown.longTermHoldingDeduction}
        aggregatedContext
        appliedReductionType={breakdown.reductionType}
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

// ─── 합산 과세 내역 카드 ──────────────────────────────────────

export function AggregatedTaxSummary({ aggregated }: { aggregated: AggregateTransferResult }) {
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
                      label={`· ${reductionTypeLabelOf(entry.type)}${entry.cappedByLimit ? ` (한도 ${formatKRW(entry.annualLimit)})` : ""}`}
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
              {/**
               * 신고서 단위 가산세 (F17) — 일반건물처럼 **자산 1건이 카드 여러 장으로 쪼개지는**
               * 경로는 자산별이 아니라 신고 단위로 1회 계산된다. 그래서 위 `filingDelayedSum`
               * (자산별 합)에는 잡히지 않는다 — 합계만 바뀌고 내역이 비면 사용자는 근거를 못 본다.
               */}
              {(() => {
                const fu = aggregated.filingUnitPenaltyDetail;
                if (!fu || fu.totalPenalty <= 0) return null;
                const rate = fu.filingPenalty?.penaltyRate;
                return (
                  <Row
                    label={`· 신고불성실·납부지연 가산세 (신고서 단위${
                      rate ? ` · ${(rate * 100).toFixed(0)}%` : ""
                    })`}
                    value={formatKRW(fu.totalPenalty)}
                    sub
                  />
                );
              })()}
            </>
          )}

          <Divider />

          {/* 국세 납부세액 */}
          <Row label="국세 납부세액" value={formatKRW(nationalTax)} />

          {/**
           * 지방세 납부세액 — 🔴 G-16.
           *
           * 종전 라벨 「결정세액+가산세 × 10%」는 바로 위 「가산세」 행(국세기본법 §47의2~§47의4
           * 포함 **총액**)이 과세표준에 든다고 읽혔다. 엔진 base는 §114조의2분뿐이다
           * (`transfer-tax-aggregate.ts` STEP M-10). 축 설명은 `local-income-tax-display.ts`.
           */}
          <Row
            label={
              buildingPenaltySum > 0
                ? "지방세 납부세액 (지방소득세 = (결정세액 + 소득세법 §114조의2 가산세) × 10% — 국세기본법 §47의2~§47의4 가산세는 대상 아님)"
                : "지방세 납부세액 (지방소득세 = 결정세액 × 10% — 국세기본법 §47의2~§47의4 가산세는 대상 아님)"
            }
            value={formatKRW(aggregated.localIncomeTax)}
            sub
          />

          {/* 농어촌특별세 — 「농어촌특별세법」 §5①1호. `totalTax`에는 이미 들어 있어
              이 행이 없으면 국세 + 지방세 합과 총납부세액이 농특세만큼 어긋난다. */}
          {(aggregated.ruralSurtax ?? 0) > 0 && (
            <Row
              label="농어촌특별세 (감면세액 × 20%)"
              value={formatKRW(aggregated.ruralSurtax)}
              sub
            />
          )}

          <Divider />

          {/* 총납부세액 */}
          <Row label="총납부세액" value={formatKRW(aggregated.totalTax)} highlight />
        </tbody>
      </table>
    </div>
  );
}
