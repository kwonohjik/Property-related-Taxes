"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp, ArrowRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AggregateTransferResult,
  PerPropertyBreakdown,
  RateGroup,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

interface MultiTransferTaxResultViewProps {
  result: AggregateTransferResult;
  properties: PropertyItem[];
  taxYear: number;
  isLoggedIn?: boolean;
  savedId?: string | null;
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

// ─── 합산 결과 카드 ──────────────────────────────────────────

function SummaryCard({ result, taxYear }: { result: AggregateTransferResult; taxYear: number }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{taxYear}년 양도소득세 합산 결과</CardTitle>
          <ComparativeTaxBadge applied={result.comparedTaxApplied} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <ResultRow label="총 양도차익" value={result.totalTransferGain} />
          <ResultRow label="장기보유특별공제" value={-result.totalLongTermHoldingDeduction} />
          <ResultRow label="양도차손 통산 후 소득금액" value={result.totalIncomeAfterOffset} />
          {result.unusedLoss > 0 && (
            <ResultRow
              label="소멸 차손 (이월 불인정)"
              value={-result.unusedLoss}
              className="text-muted-foreground"
            />
          )}
          <ResultRow label="기본공제" value={-result.basicDeduction} />
          <ResultRow label="과세표준" value={result.taxBase} highlight />
        </div>

        <Separator />

        {result.comparedTaxApplied !== "none" && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>방법 A (전체 누진)</span>
              <span>{formatKRW(result.calculatedTaxByGeneral)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>방법 B (세율군별 분리)</span>
              <span>{formatKRW(result.calculatedTaxByGroups)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <ResultRow label="산출세액" value={result.calculatedTax} />
          {result.reductionAmount > 0 && (
            <ResultRow label="감면세액" value={-result.reductionAmount} />
          )}
          <ResultRow label="결정세액" value={result.determinedTax} highlight />
          {result.penaltyTax > 0 && (
            <ResultRow label="가산세" value={result.penaltyTax} />
          )}
          <ResultRow label="지방소득세" value={result.localIncomeTax} />
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <span className="text-lg font-bold">총 납부세액</span>
          <span className="text-2xl font-bold text-primary">{formatKRW(result.totalTax)}</span>
        </div>

        {result.warnings.length > 0 && (
          <div className="space-y-1">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex gap-2 text-sm text-amber-700 bg-amber-50 rounded p-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 비교과세 배지 ────────────────────────────────────────────

function ComparativeTaxBadge({ applied }: { applied: "groups" | "general" | "none" }) {
  if (applied === "none") return null;
  return (
    <Badge
      variant={applied === "groups" ? "destructive" : "default"}
      className="text-xs"
      title="소득세법 §104의2 비교과세"
    >
      §104의2 비교과세 — {applied === "groups" ? "세율군별(방법 B)" : "전체 누진(방법 A)"} 적용
    </Badge>
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
          <div className="grid grid-cols-2 gap-3 py-3 text-sm">
            <ResultRow label="양도차익" value={breakdown.transferGain} compact />
            {breakdown.longTermHoldingDeduction > 0 && (
              <ResultRow label="장기보유특별공제" value={-breakdown.longTermHoldingDeduction} compact />
            )}
            <ResultRow label="양도소득금액" value={breakdown.income} compact />
            {breakdown.lossOffsetFromSameGroup > 0 && (
              <ResultRow label="차손 통산 (동일그룹)" value={-breakdown.lossOffsetFromSameGroup} compact />
            )}
            {breakdown.lossOffsetFromOtherGroup > 0 && (
              <ResultRow label="차손 통산 (타군안분)" value={-breakdown.lossOffsetFromOtherGroup} compact />
            )}
            <ResultRow label="통산 후 소득금액" value={breakdown.incomeAfterOffset} compact />
            {breakdown.allocatedBasicDeduction > 0 && (
              <ResultRow label="기본공제 배분액" value={-breakdown.allocatedBasicDeduction} compact />
            )}
            <ResultRow label="과세표준 기여분" value={breakdown.taxBaseShare} compact highlight />
            {breakdown.reductionAmount > 0 && (
              <ResultRow label="감면세액" value={-breakdown.reductionAmount} compact />
            )}
            {breakdown.penaltyTax > 0 && (
              <ResultRow label="건별 가산세 (§114조의2)" value={breakdown.penaltyTax} compact />
            )}
          </div>
        </CardContent>
      )}
    </Card>
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
}: MultiTransferTaxResultViewProps) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="space-y-4">
      {/* 합산 결과 카드 */}
      <SummaryCard result={result} taxYear={taxYear} />

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

      {/* 전체 계산 과정 토글 */}
      <Card>
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setShowSteps((s) => !s)}
        >
          <span className="text-sm font-medium">전체 계산 과정 보기</span>
          {showSteps ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {showSteps && (
          <CardContent className="pt-0 border-t">
            <div className="space-y-2 text-sm">
              {result.steps.map((s, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-border/50 last:border-0">
                  <div>
                    <p className="font-medium">{s.label}</p>
                    {s.legalBasis && (
                      <p className="text-xs text-muted-foreground">{s.legalBasis}</p>
                    )}
                    {s.formula && (
                      <p className="text-xs text-muted-foreground">{s.formula}</p>
                    )}
                  </div>
                  <span className="font-medium tabular-nums">{formatKRW(s.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 이력 안내 */}
      {!isLoggedIn && (
        <Card className="border-dashed">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            로그인하면 계산 이력이 자동 저장됩니다.{" "}
            <a href="/auth/login" className="text-primary underline">
              로그인
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
