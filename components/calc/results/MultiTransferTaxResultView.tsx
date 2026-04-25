"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AggregateTransferResult,
  PerPropertyBreakdown,
  RateGroup,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { MultiTransferTaxSummaryCard } from "./MultiTransferTaxSummaryCard";

interface MultiTransferTaxResultViewProps {
  result: AggregateTransferResult;
  properties: PropertyItem[];
  taxYear: number;
  isLoggedIn?: boolean;
  savedId?: string | null;
  /** 기납부세액 (국세) — 이전 회차 양도분의 결정세액 등 */
  priorPaidTax?: number;
  /** 기납부 지방소득세 */
  priorPaidLocalTax?: number;
}

function formatKRW(amount: number): string {
  if (amount === 0) return "0원";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ko-KR") + "원";
  return amount < 0 ? `-${formatted}` : formatted;
}

const RATE_GROUP_LABELS: Record<RateGroup, string> = {
  progressive: "일반 누진",
  short_term: "단기보유",
  multi_house_surcharge: "다주택 중과",
  non_business_land: "비사업용 토지",
  unregistered: "미등기",
};

const RATE_GROUP_COLORS: Record<RateGroup, string> = {
  progressive: "bg-blue-100 text-blue-800",
  short_term: "bg-orange-100 text-orange-800",
  multi_house_surcharge: "bg-red-100 text-red-800",
  non_business_land: "bg-purple-100 text-purple-800",
  unregistered: "bg-gray-100 text-gray-800",
};

// ─── 감면세액 합산 재계산 내역 ─────────────────────────────────
// 조특법 §69(자경) + §127의2(중복배제) + §133(종합한도) 기반 재계산 결과 표시.
// 단건 산출세액 × 감면대상소득 / 과세표준 → §133 유형별 한도 적용.

function ReductionRecalculationSection({
  result,
  properties,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
}) {
  if (!result.reductionBreakdown || result.reductionBreakdown.length === 0) return null;

  const labelMap = new Map(properties.map((p) => [p.propertyId, p.propertyLabel]));

  const typeLabel: Record<string, string> = {
    self_farming: "자경농지 (§69)",
    self_farming_inherited: "자경농지 (§69·상속인 경작기간 합산 §66⑪)",
    self_farming_incorp: "자경농지 (§69·편입일 부분감면 §66⑤⑥)",
    livestock: "축산업 (§69의2)",
    fishing: "어업 (§69의3)",
    public_expropriation: "공익사업 수용 (§77)",
  };

  return (
    <Card>
      <div className="p-4 space-y-3">
        <h3 className="text-sm font-medium">
          감면세액 합산 재계산 (조특법 §127의2 + §133)
        </h3>
        <p className="text-xs text-muted-foreground">
          산출세액 × (감면대상 양도소득금액 / 과세표준)으로 재계산한 뒤 유형별 연간 한도를 적용합니다.
        </p>
        <div className="space-y-3">
          {result.reductionBreakdown.map((entry) => {
            const perAsset = result.properties.filter(
              (p) => p.reductionType === entry.type,
            );
            return (
              <div key={entry.type} className="rounded border border-amber-200/60 bg-amber-50/30 p-3">
                <p className="text-sm font-medium">
                  {typeLabel[entry.type] ?? entry.type}
                  {entry.cappedByLimit && (
                    <span className="ml-2 text-xs text-amber-700">
                      ⚠ 한도 적용 ({entry.annualLimit.toLocaleString()}원)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{entry.legalBasis}</p>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">합산 산출세액</span>
                  <span className="text-right tabular-nums">
                    {entry.aggregateCalculatedTax.toLocaleString()}원
                  </span>
                  <span className="text-muted-foreground">합산 감면대상소득</span>
                  <span className="text-right tabular-nums">
                    {entry.totalReducibleIncome.toLocaleString()}원
                  </span>
                  <span className="text-muted-foreground">합산 과세표준</span>
                  <span className="text-right tabular-nums">
                    {entry.aggregateTaxBase.toLocaleString()}원
                  </span>
                  <span className="text-muted-foreground">재계산 원시 감면</span>
                  <span className="text-right tabular-nums">
                    {entry.rawAggregateReduction.toLocaleString()}원
                  </span>
                  <span className="text-muted-foreground font-medium">최종 감면세액</span>
                  <span className="text-right tabular-nums font-medium text-primary">
                    {entry.cappedAggregateReduction.toLocaleString()}원
                  </span>
                </div>

                {perAsset.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200/60">
                    <p className="text-xs text-muted-foreground mb-1">건별 배분</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-normal">자산</th>
                          <th className="text-right font-normal">건별 산출세액</th>
                          <th className="text-right font-normal">건별 단독감면</th>
                          <th className="text-right font-normal">감면대상소득</th>
                          <th className="text-right font-normal">배분 감면</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perAsset.map((p) => (
                          <tr key={p.propertyId}>
                            <td>{labelMap.get(p.propertyId) ?? p.propertyLabel}</td>
                            <td className="text-right tabular-nums">
                              {p.reductionAmount.toLocaleString()}원 → {/* standaloneTax 필드는 미노출 */}
                            </td>
                            <td className="text-right tabular-nums">
                              {p.reductionAmount.toLocaleString()}원
                            </td>
                            <td className="text-right tabular-nums">
                              {p.reducibleIncome.toLocaleString()}원
                            </td>
                            <td className="text-right tabular-nums font-medium">
                              {p.reductionAggregated.toLocaleString()}원
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ─── 차손 통산 표 ──────────────────────────────────────────────

function LossOffsetTable({ result, properties }: { result: AggregateTransferResult; properties: PropertyItem[] }) {
  if (result.lossOffsetTable.length === 0) return null;

  const labelMap = new Map(properties.map((p) => [p.propertyId, p.propertyLabel]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          양도차손 통산 내역{" "}
          <span className="text-sm font-normal text-muted-foreground">(소득세법 §102② + 시행령 §167의2)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {result.lossOffsetTable.map((row, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                [{labelMap.get(row.fromPropertyId) ?? row.fromPropertyId}]
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                [{labelMap.get(row.toPropertyId) ?? row.toPropertyId}]
              </span>
              <span className="ml-auto font-medium text-red-600">
                -{formatKRW(row.amount)}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  row.scope === "same_group" ? "border-blue-300 text-blue-700" : "border-purple-300 text-purple-700",
                )}
              >
                {row.scope === "same_group" ? "동일그룹" : "타군안분"}
              </Badge>
            </div>
          ))}
        </div>
        {result.unusedLoss > 0 && (
          <div className="mt-3 pt-3 border-t flex justify-between text-sm">
            <span className="text-muted-foreground">소멸 차손 (이월 불인정 — §102② 단서)</span>
            <span className="text-destructive font-medium">-{formatKRW(result.unusedLoss)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 건별 breakdown 아코디언 ─────────────────────────────────

function PropertyBreakdownAccordion({
  breakdown,
}: {
  breakdown: PerPropertyBreakdown;
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
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              RATE_GROUP_COLORS[breakdown.rateGroup],
            )}
          >
            {RATE_GROUP_LABELS[breakdown.rateGroup]}
          </span>
          {breakdown.isExempt && (
            <Badge variant="secondary" className="text-xs">
              비과세
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">
            {breakdown.isExempt ? "0원" : formatKRW(breakdown.taxBaseShare)}
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
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

              {/* 산출세액 참고 — 자산별 과세표준 기여분 × 자산 세율 - 누진 차감 */}
              {!breakdown.isExempt && breakdown.taxBaseShare > 0 && (
                <DetailRow
                  label="산출세액 (참고)"
                  formula={
                    breakdown.progressiveDeduction > 0
                      ? `과세표준 기여분 ${formatKRW(breakdown.taxBaseShare)} × 세율 ${(effectiveRate * 100).toFixed(0)}%${breakdown.surchargeRate ? ` (기본 ${(breakdown.appliedRate * 100).toFixed(0)}% + 중과 ${(breakdown.surchargeRate * 100).toFixed(0)}%p)` : ""} - 누진차감 ${formatKRW(breakdown.progressiveDeduction)}`
                      : `과세표준 기여분 ${formatKRW(breakdown.taxBaseShare)} × 세율 ${(effectiveRate * 100).toFixed(0)}%`
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
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{legalBasis}</p>
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

// ─── 세율군 집계 카드 ──────────────────────────────────────────

function GroupTaxCards({ result }: { result: AggregateTransferResult }) {
  if (result.groupTaxes.length <= 1) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">세율군별 산출세액 (방법 B)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {result.groupTaxes.map((g) => (
            <div key={g.group} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  RATE_GROUP_COLORS[g.group],
                )}
              >
                {RATE_GROUP_LABELS[g.group]}
              </span>
              <span className="text-muted-foreground">과세표준 {formatKRW(g.groupTaxBase)}</span>
              <span className="ml-auto font-medium">{formatKRW(g.groupCalculatedTax)}</span>
              <span className="text-muted-foreground text-xs">
                ({(g.appliedRate * 100).toFixed(1)}%
                {g.surchargeRate ? ` +${(g.surchargeRate * 100).toFixed(0)}%p` : ""})
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between font-medium">
            <span>세율군별 합계</span>
            <span>{formatKRW(result.calculatedTaxByGroups)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 결과 행 공통 컴포넌트 ────────────────────────────────────

function ResultRow({
  label,
  value,
  highlight,
  compact,
  className,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between",
        compact ? "text-sm" : "",
        highlight ? "font-semibold" : "text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <span className={value < 0 ? "text-red-600" : ""}>{formatKRW(value)}</span>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────

export function MultiTransferTaxResultView({
  result,
  properties,
  taxYear,
  isLoggedIn,
  savedId,
  priorPaidTax,
  priorPaidLocalTax,
}: MultiTransferTaxResultViewProps) {
  const [showSteps, setShowSteps] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  async function handlePdfDownload() {
    if (!savedId) return;
    setIsPdfLoading(true);
    try {
      const res = await fetch(`/api/pdf/result/${savedId}`);
      if (!res.ok) throw new Error("PDF 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `양도소득세_다건_${savedId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsPdfLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* PDF / 인쇄 버튼 */}
      <div className="flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ 인쇄
        </button>
        {savedId && isLoggedIn && (
          <button
            type="button"
            onClick={handlePdfDownload}
            disabled={isPdfLoading}
            className="rounded-md border border-primary/60 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {isPdfLoading ? "생성 중..." : "📄 PDF 다운로드"}
          </button>
        )}
      </div>

      {/* 합산 결과 카드 */}
      <MultiTransferTaxSummaryCard
        result={result}
        properties={properties}
        taxYear={taxYear}
        priorPaidTax={priorPaidTax}
        priorPaidLocalTax={priorPaidLocalTax}
      />

      {/* 감면세액 합산 재계산 내역 (자경·공익수용 등) */}
      <ReductionRecalculationSection result={result} properties={properties} />

      {/* 세율군별 분리 산출 (2개 이상 그룹일 때) */}
      <GroupTaxCards result={result} />

      {/* 차손 통산 표 */}
      <LossOffsetTable result={result} properties={properties} />

      {/* 건별 breakdown */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm text-muted-foreground">건별 상세</h3>
        {result.properties.map((p) => (
          <PropertyBreakdownAccordion key={p.propertyId} breakdown={p} />
        ))}
      </div>

      {/* 합산 계산 과정 토글 */}
      <Card>
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setShowSteps((s) => !s)}
        >
          <span className="text-sm font-medium">합산 계산 과정 보기</span>
          {showSteps ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {showSteps && (
          <CardContent className="pt-0 border-t">
            <div className="divide-y divide-border/50 text-sm">
              {result.steps.map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.label}</p>
                    {s.formula && (
                      <p className="text-xs text-muted-foreground/70 mt-0.5 break-words">{s.formula}</p>
                    )}
                    {s.legalBasis && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{s.legalBasis}</p>
                    )}
                  </div>
                  <span className={cn("tabular-nums shrink-0 font-medium", s.amount < 0 ? "text-red-600" : "")}>
                    {formatKRW(s.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 이력 안내 */}
      {!isLoggedIn && (
        <Card className="border-dashed print:hidden">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            로그인하면 계산 이력이 자동 저장되고 PDF 다운로드가 가능합니다.{" "}
            <a href="/auth/login" className="text-primary underline">
              로그인
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
