"use client";

/**
 * 다건 합산 결과 — **건별 breakdown 아코디언** (자산 1건의 상세 펼침)
 *
 * `MultiTransferTaxResultView`에서 분리했다(2026-08-04, 805줄 → 정책 트리거 800 초과).
 * 아코디언 본체 + 전용 `DetailRow` + 신고서 어댑터 + 세율군 배지 상수가 한 단위다.
 *
 * ## 세율군 배지 — 부칙 §9270호 §14① 보조 표기
 *
 * 위기취득(2009.3.16~2012.12.31) 비사업용 토지는 +10%p가 배제되면 **해당 호 자체가
 * §104①1호**이므로 `rateGroup`이 `progressive`가 된다(PR#1020 `ff8d8232` ·
 * `legal-codes/surcharge-transition.ts:41` · 기획재정부 재산세제과-1422 ·
 * 서울행정법원 2024구단72950). 세율군으로는 정확하지만 배지만 보면 「비사업용 판정이
 * 안 됐다」로 읽히므로 `nblSurchargeExcluded` 보조 배지로 배제 사유를 함께 노출한다.
 * (자산 자체는 비사업용 토지이고 장특공제는 표1이 유지된다.)
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { expandToggleClass, expandToggleLabel } from "./shared/ExpandToggleButton";
import { cn } from "@/lib/utils";
import type { PerPropertyBreakdown, RateGroup } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { PublicExpropriationDetailCard } from "@/components/calc/results/transfer/TransferReductionRows";
import { ReplacementLand77_2DetailCard } from "@/components/calc/results/transfer/ReplacementLand77_2DetailCard";
import { GbDesignatedLand77_3DetailCard } from "@/components/calc/results/transfer/GbDesignatedLand77_3DetailCard";


/**
 * PerPropertyBreakdown → TransferTaxResult 형태로 어댑팅 (FilingFormTable 호환).
 * 다건 합산 결과의 자산별 값을 신고서 양식 표 형식으로 표시하기 위함.
 * mixed-use·split detail은 다건 컨텍스트에서 사용되지 않으므로 undefined.
 */
function breakdownToFilingResult(b: PerPropertyBreakdown): TransferTaxResult {
  const totalPenalty = b.penaltyTax + b.filingDelayedPenaltyTax;
  const determinedTax = b.refDeterminedTax;
  const localIncomeTax = Math.floor((determinedTax + totalPenalty) * 0.1);
  return {
    isExempt: b.isExempt,
    exemptReason: b.exemptReason,
    transferGain: b.transferGain,
    taxableGain: Math.max(0, b.transferGain),
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: b.longTermHoldingDeduction,
    longTermHoldingRate: 0,
    lthdStartDate: new Date(0), // multi 결과 변환 mock: 표시용, 실값 미사용
    basicDeduction: b.allocatedBasicDeduction,
    taxBase: b.taxBaseShare,
    appliedRate: b.appliedRate,
    progressiveDeduction: b.progressiveDeduction,
    calculatedTax: b.refCalculatedTax,
    isSurchargeSuspended: false,
    reductionAmount: b.reductionAggregated,
    reductionType: b.reductionType,
    reducibleIncome: b.reducibleIncome,
    determinedTax,
    penaltyTax: totalPenalty,
    penaltyBase: b.penaltyBase ?? 0,
    localIncomeTax,
    totalTax: determinedTax + totalPenalty + localIncomeTax,
    steps: b.steps,
  };
}

export function formatKRW(amount: number): string {
  if (amount === 0) return "0";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ko-KR");
  return amount < 0 ? `-${formatted}` : formatted;
}

export const RATE_GROUP_LABELS: Record<RateGroup, string> = {
  progressive: "일반 누진",
  short_term: "단기보유",
  multi_house_surcharge: "다주택 중과",
  non_business_land: "비사업용 토지",
  unregistered: "미등기",
};

export const RATE_GROUP_COLORS: Record<RateGroup, string> = {
  progressive: "bg-blue-100 text-blue-800",
  short_term: "bg-orange-100 text-orange-800",
  multi_house_surcharge: "bg-red-100 text-red-800",
  non_business_land: "bg-purple-100 text-purple-800",
  unregistered: "bg-gray-100 text-gray-800",
};

// ─── 건별 breakdown 아코디언 ─────────────────────────────────

export function PropertyBreakdownAccordion({
  breakdown,
  property,
}: {
  breakdown: PerPropertyBreakdown;
  property?: PropertyItem;
}) {
  const [open, setOpen] = useState(false);

  // 단건 엔진 steps에서 항목별 formula 조회
  const getStep = (labelKeyword: string) =>
    breakdown.steps.find((s) => s.label.includes(labelKeyword));

  const gainStep = getStep("양도차익");
  const lthdStep = getStep("장기보유특별공제");
  const reductionStep = getStep("감면세액");

  // 자산별 산출세액·결정세액(참고) — 엔진이 다건 컨텍스트로 미리 계산한 값 사용.
  // 자산이 1건일 때 합산 산출세액과 일치. 비교과세 적용 시 자산별 합 ≠ 합산 산출세액일 수 있어 "(참고)" 표기.
  // 옛 데이터·HMR 부분 적용 등으로 새 필드가 누락된 경우 인라인 재계산 fallback (NaN 차단).
  const effectiveRate = (breakdown.appliedRate ?? 0) + (breakdown.surchargeRate ?? 0);
  const refCalculatedTaxFallback = breakdown.isExempt
    ? 0
    : Math.max(
        0,
        Math.floor((breakdown.taxBaseShare ?? 0) * effectiveRate) - (breakdown.progressiveDeduction ?? 0),
      );
  const refCalculatedTax =
    typeof breakdown.refCalculatedTax === "number"
      ? breakdown.refCalculatedTax
      : refCalculatedTaxFallback;
  const refDeterminedTax =
    typeof breakdown.refDeterminedTax === "number"
      ? breakdown.refDeterminedTax
      : Math.max(0, refCalculatedTax - (breakdown.reductionAmount ?? 0));

  return (
    <Card>
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium">{breakdown.propertyLabel}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-micro font-medium",
              RATE_GROUP_COLORS[breakdown.rateGroup],
            )}
          >
            {RATE_GROUP_LABELS[breakdown.rateGroup]}
          </span>
          {/*
            부칙 §9270호 §14①(2009.3.16~2012.12.31 취득) 중과배제 — 보조 배지.
            이 경우 세율 그룹은 「일반 누진」이 맞지만(중과세율 배제 → §104①1호 기본세율.
            `legal-codes/surcharge-transition.ts:41` · 기획재정부 재산세제과-1422 ·
            서울행정법원 2024구단72950), 자산 자체는 여전히 비사업용 토지다
            (장특공제는 표1이 유지된다). 배지만 보면 「비사업용 판정이 안 됐다」로
            읽히므로 배제 사유를 함께 노출한다.
          */}
          {breakdown.nblSurchargeExcluded && (
            <Badge variant="secondary" className="text-xs">
              부칙 §14① 중과배제
            </Badge>
          )}
          {breakdown.isExempt && (
            <Badge variant="secondary" className="text-xs">
              비과세
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {breakdown.isExempt ? "0" : formatKRW(breakdown.taxBaseShare)}
          </span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(open)}</span>
        </div>
      </div>

      {open && (
        <CardContent className="pt-0 border-t">
          {breakdown.isExempt ? (
            <p className="py-4 text-sm text-muted-foreground text-center">
              {breakdown.exemptReason ?? "비과세 대상"}
            </p>
          ) : (
            <div className="py-3 space-y-0 text-sm divide-y divide-border/50">
              {/* 양도차익 */}
              <DetailRow
                label="양도차익"
                formula={gainStep?.formula}
                legalBasis={gainStep?.legalBasis}
                value={breakdown.transferGain}
              />

              {/* 장기보유특별공제 */}
              {breakdown.longTermHoldingDeduction > 0 && (
                <DetailRow
                  label="장기보유특별공제"
                  formula={lthdStep?.formula}
                  legalBasis={lthdStep?.legalBasis}
                  value={-breakdown.longTermHoldingDeduction}
                />
              )}

              {/* 양도소득금액 */}
              <DetailRow
                label="양도소득금액"
                formula={
                  breakdown.longTermHoldingDeduction > 0
                    ? `${formatKRW(breakdown.transferGain)} - ${formatKRW(breakdown.longTermHoldingDeduction)}`
                    : undefined
                }
                value={breakdown.income}
              />

              {/* 차손 통산 */}
              {breakdown.lossOffsetFromSameGroup > 0 && (
                <DetailRow
                  label="차손 통산 (동일그룹)"
                  formula="같은 세율군 내 손익 통산 (소득세법 §102②)"
                  value={-breakdown.lossOffsetFromSameGroup}
                />
              )}
              {breakdown.lossOffsetFromOtherGroup > 0 && (
                <DetailRow
                  label="차손 통산 (타군안분)"
                  formula="타 세율군 잔여 차손 비율안분 (시행령 §167의2)"
                  value={-breakdown.lossOffsetFromOtherGroup}
                />
              )}

              {/* 통산 후 소득금액 */}
              {(breakdown.lossOffsetFromSameGroup > 0 || breakdown.lossOffsetFromOtherGroup > 0) && (
                <DetailRow
                  label="통산 후 소득금액"
                  value={breakdown.incomeAfterOffset}
                />
              )}

              {/* 기본공제 배분액 */}
              {breakdown.allocatedBasicDeduction > 0 && (
                <DetailRow
                  label="기본공제 배분액"
                  formula="연 250만원 한도 — 소득금액 비율안분"
                  value={-breakdown.allocatedBasicDeduction}
                />
              )}

              {/* 과세표준 기여분 — 다건 컨텍스트 수식 직접 생성 */}
              <DetailRow
                label="과세표준 기여분"
                formula={
                  breakdown.allocatedBasicDeduction > 0
                    ? `통산후 소득 ${formatKRW(breakdown.incomeAfterOffset)} - 기본공제 배분 ${formatKRW(breakdown.allocatedBasicDeduction)}`
                    : `통산후 소득 ${formatKRW(breakdown.incomeAfterOffset)}`
                }
                legalBasis="소득세법 §92"
                value={breakdown.taxBaseShare}
                highlight
              />

              {/* 산출세액 참고 — 자산별 과세표준 기여분 × 자산 세율 - 누진 차감.
                  단, 토지·건물 분리취득이나 한 필지 중 일부만 비사업용인 자산은 **파트별**로
                  세율이 갈리므로(§104⑤) 그 자산의 파트 내역을 그대로 싣는다. 그 경우
                  「기여분 × 세율」 산식은 성립하지 않는다(계획서 §4.12). */}
              {!breakdown.isExempt && breakdown.taxBaseShare > 0 && (
                <DetailRow
                  label="산출세액 (참고)"
                  formula={
                    breakdown.refCalculatedTaxNote ??
                    (breakdown.progressiveDeduction > 0
                      ? `과세표준 기여분 ${formatKRW(breakdown.taxBaseShare)} × 세율 ${(effectiveRate * 100).toFixed(0)}%${breakdown.surchargeRate ? ` (기본 ${(breakdown.appliedRate * 100).toFixed(0)}% + 중과 ${(breakdown.surchargeRate * 100).toFixed(0)}%p)` : ""} - 누진차감 ${formatKRW(breakdown.progressiveDeduction)}`
                      : `과세표준 기여분 ${formatKRW(breakdown.taxBaseShare)} × 세율 ${(effectiveRate * 100).toFixed(0)}%`)
                  }
                  legalBasis="소득세법 §104"
                  value={refCalculatedTax}
                  muted
                />
              )}

              {/* 감면세액 */}
              {breakdown.reductionAmount > 0 && (
                <DetailRow
                  label="감면세액"
                  formula={reductionStep?.formula}
                  legalBasis={reductionStep?.legalBasis}
                  value={-breakdown.reductionAmount}
                />
              )}

              {/* 결정세액 참고 — 산출세액(참고) - 감면세액으로 직접 재계산 */}
              {!breakdown.isExempt && breakdown.taxBaseShare > 0 && (
                <DetailRow
                  label="결정세액 (참고)"
                  formula={
                    breakdown.reductionAmount > 0
                      ? `산출세액 ${formatKRW(refCalculatedTax)} - 감면 ${formatKRW(breakdown.reductionAmount)}`
                      : `산출세액 ${formatKRW(refCalculatedTax)}`
                  }
                  legalBasis="소득세법 §92③2호"
                  value={refDeterminedTax}
                  muted
                />
              )}

              {/* 가산세 — 자산별 §114조의2 환산가액적용가산세 */}
              {breakdown.penaltyTax > 0 && (
                <DetailRow
                  label="환산가액적용가산세"
                  legalBasis="소득세법 §114조의2"
                  value={breakdown.penaltyTax}
                />
              )}

              {/* 가산세 — 자산별 신고불성실/납부지연 */}
              {breakdown.filingDelayedPenaltyTax > 0 && (
                <DetailRow
                  label="신고불성실·납부지연 가산세"
                  legalBasis="국세기본법 §47의2~의5"
                  value={breakdown.filingDelayedPenaltyTax}
                />
              )}
            </div>
          )}

          {/* 비자발적 양도 감면 §77·§77의2·§77의3 — 자산별 ①~④ 구성 (최종 감면세액은 합산 재계산 카드) */}
          {breakdown.publicExpropriationDetail?.isEligible && (
            <PublicExpropriationDetailCard detail={breakdown.publicExpropriationDetail} aggregatedContext />
          )}
          {breakdown.replacementLandDetail?.isEligible && (
            <ReplacementLand77_2DetailCard detail={breakdown.replacementLandDetail} aggregatedContext />
          )}
          {breakdown.gbDesignatedLandDetail?.isEligible && (
            <GbDesignatedLand77_3DetailCard detail={breakdown.gbDesignatedLandDetail} aggregatedContext />
          )}

          {/* 신고서 양식 표 — 자산별 (PR-F2: printScoped 버튼 제거, 패널 per-property로 통일) */}
          <div className="mt-2">
            {(() => {
              // 다자산 자산별 카드: property.form.assets[0]에서 재개발 메타 도출
              const filingResult = breakdownToFilingResult(breakdown);
              const assetForm = property?.form?.assets?.[0];
              const hasRedev = !!filingResult.redevelopmentDetail;
              return (
                <FilingFormTable
                  result={filingResult}
                  formData={property?.form}
                  redevSubject={
                    hasRedev
                      ? ((assetForm?.redevSubject || (assetForm?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
                      : undefined
                  }
                  redevSettlementDirection={
                    hasRedev
                      ? ((assetForm?.redevSettlementDirection || "pay") as "pay" | "receive")
                      : undefined
                  }
                />
              );
            })()}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── 상세 행 — 수식 포함 ──────────────────────────────────────

function DetailRow({
  label,
  formula,
  legalBasis,
  value,
  highlight,
  muted,
}: {
  label: string;
  formula?: string;
  legalBasis?: string;
  value: number;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 py-2.5",
        highlight && "font-semibold",
        muted && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", highlight ? "font-semibold" : "text-muted-foreground")}>
          {label}
        </p>
        {formula && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 break-words">{formula}</p>
        )}
        {legalBasis && (
          <p className="text-micro text-muted-foreground/50 mt-0.5">{legalBasis}</p>
        )}
      </div>
      <span
        className={cn(
          "text-sm tabular-nums shrink-0",
          value < 0 ? "text-red-600" : highlight ? "" : "text-foreground",
        )}
      >
        {formatKRW(value)}
      </span>
    </div>
  );
}
