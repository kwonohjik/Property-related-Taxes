"use client";

/**
 * 다건 양도소득세 합산 결과 카드
 *
 * 표시 항목 순서 (사용자 지정):
 *  1~3. 전체 양도가액·취득가액·필요경비 (properties에서 합산)
 *  4~8. 양도차익 → 장기보유특별공제 → 양도소득금액 → 기본공제 → 과세표준
 *  9~14. 산출세액 → 공제 감면세액 → 결정세액 → 가산세 → 기납부세액 → 이번에 납부할 세액
 *  15~17. 지방세 결정세액 → 지방세 기납부 세액 → 납부할 세액
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";

/**
 * 자산별 다건 컨텍스트 결정세액 — 엔진이 채운 refDeterminedTax 우선,
 * 누락 시(옛 데이터·HMR 부분 적용 등) 다른 필드로부터 인라인 재계산.
 * NaN 차단 안전망.
 */
export function getRefDeterminedTax(p: PerPropertyBreakdown): number {
  if (typeof p.refDeterminedTax === "number") return p.refDeterminedTax;
  if (p.isExempt) return 0;
  const rate = (p.appliedRate ?? 0) + (p.surchargeRate ?? 0);
  const refCalc = Math.max(
    0,
    Math.floor((p.taxBaseShare ?? 0) * rate) - (p.progressiveDeduction ?? 0),
  );
  return Math.max(0, refCalc - (p.reductionAmount ?? 0));
}

export function formatKRW(amount: number): string {
  if (amount === 0) return "0원";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ko-KR") + "원";
  return amount < 0 ? `-${formatted}` : formatted;
}

/** 엔진의 properties[] 에서 단순 합산 */
function sumFromBreakdown(properties: AggregateTransferResult["properties"]) {
  return properties.reduce(
    (acc, p) => ({
      transferPrice: acc.transferPrice + p.transferPrice,
      acquisitionPrice: acc.acquisitionPrice + p.acquisitionPrice,
      necessaryExpense: acc.necessaryExpense + p.necessaryExpense,
      determinedTaxAll: acc.determinedTaxAll + p.determinedTax,
    }),
    { transferPrice: 0, acquisitionPrice: 0, necessaryExpense: 0, determinedTaxAll: 0 },
  );
}

function ResultRow({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between",
        highlight ? "font-semibold" : "text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <span className={value < 0 ? "text-red-600" : ""}>{formatKRW(value)}</span>
    </div>
  );
}

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

export function MultiTransferTaxSummaryCard({
  result,
  properties: _properties,
  taxYear,
  priorPaidTax,
  priorPaidLocalTax = 0,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
  taxYear: number;
  /** 명시적 기납부세액 (override). 미지정 시 앞 자산들의 결정세액 합으로 자동 계산 */
  priorPaidTax?: number;
  priorPaidLocalTax?: number;
}) {
  // 단순 합산 — 엔진이 이미 단건별 결정세액 등을 포함
  const sums = sumFromBreakdown(result.properties);

  // 기납부세액 자동 계산: 마지막 물건 직전까지의 결정세액 합 (다건 컨텍스트 기준).
  // p.determinedTax는 단건 엔진이 skipBasicDeduction=true로 산출한 부정확한 값이므로,
  // 엔진이 다건 컨텍스트로 미리 계산한 refDeterminedTax(과세표준 기여분 기준)를 사용한다.
  // getRefDeterminedTax는 누락 시 인라인 재계산 fallback이 있어 NaN 차단.
  const autoPriorPaid = result.properties
    .slice(0, -1)
    .reduce((s, p) => s + getRefDeterminedTax(p), 0);
  const effectivePriorPaid = priorPaidTax ?? autoPriorPaid;

  // 이번에 납부할 국세 = 결정세액 + 가산세 - 기납부세액
  const currentTaxDue = Math.max(
    0,
    result.determinedTax + result.penaltyTax - effectivePriorPaid,
  );
  // 지방세 납부할 세액 = 지방세 결정세액 - 지방세 기납부 세액
  const currentLocalTaxDue = Math.max(0, result.localIncomeTax - priorPaidLocalTax);
  // 최종 납부할 세액
  const totalDue = currentTaxDue + currentLocalTaxDue;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{taxYear}년 양도소득세 합산 결과</CardTitle>
          <ComparativeTaxBadge applied={result.comparedTaxApplied} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* 1~3. 가액 구성 */}
        <ResultRow label="전체 양도가액" value={sums.transferPrice} />
        <ResultRow label="전체 취득가액" value={-sums.acquisitionPrice} />
        <ResultRow label="전체 필요경비" value={-sums.necessaryExpense} />

        <Separator />

        {/* 4~8. 소득·과세표준 */}
        <ResultRow label="양도차익" value={result.totalTransferGain} />
        <ResultRow label="장기보유특별공제" value={-result.totalLongTermHoldingDeduction} />
        <ResultRow label="양도소득금액" value={result.totalIncomeAfterOffset} />
        {result.unusedLoss > 0 && (
          <ResultRow
            label="소멸 차손 (이월 불인정)"
            value={-result.unusedLoss}
            className="text-muted-foreground"
          />
        )}
        <ResultRow label="양도소득 기본공제" value={-result.basicDeduction} />
        <ResultRow label="양도소득 과세표준" value={result.taxBase} highlight />

        <Separator />

        {/* 비교과세 참고 */}
        {result.comparedTaxApplied !== "none" && (
          <div className="space-y-1 text-xs">
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

        {/* 9~14. 국세 계산 */}
        <ResultRow label="산출세액" value={result.calculatedTax} />
        <ResultRow label="공제 감면세액" value={-result.reductionAmount} />
        <ResultRow label="결정세액" value={result.determinedTax} highlight />
        <ResultRow label="가산세" value={result.penaltyTax} />
        <ResultRow label="기납부세액" value={-effectivePriorPaid} />
        <ResultRow label="이번에 납부할 세액" value={currentTaxDue} highlight />

        <Separator />

        {/* 15~16. 지방세 */}
        <ResultRow label="지방세 결정세액" value={result.localIncomeTax} />
        <ResultRow label="지방세 기납부 세액" value={-priorPaidLocalTax} />

        <Separator />

        {/* 17. 최종 납부할 세액 */}
        <div className="flex justify-between items-center pt-1">
          <span className="text-lg font-bold">납부할 세액</span>
          <span className="text-2xl font-bold text-primary">{formatKRW(totalDue)}</span>
        </div>

        {result.warnings.length > 0 && (
          <div className="space-y-1 pt-2">
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
