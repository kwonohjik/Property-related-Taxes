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
  if (amount === 0) return "0";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("ko-KR");
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
      title="소득세법 §104⑤ 비교과세"
    >
      §104⑤ 비교과세 — {applied === "groups" ? "세율군별(방법 B)" : "전체 누진(방법 A)"} 적용
    </Badge>
  );
}

export function MultiTransferTaxSummaryCard({
  result,
  properties: _properties,
  taxYear,
}: {
  result: AggregateTransferResult;
  properties: PropertyItem[];
  taxYear: number;
}) {
  // 단순 합산 — 엔진이 이미 단건별 결정세액 등을 포함
  const sums = sumFromBreakdown(result.properties);

  // 확정신고 기납부세액 정산 (§111③) — 엔진 단일진실(approach A). UI 재계산 금지.
  // 기존 autoPriorPaid(앞 자산 결정세액 단순합)는 §107② 위반이라 제거, 엔진 settlement 필드 read.
  const effectivePriorPaid = result.priorPaidTax;
  const priorPaidLocalTax = result.priorPaidLocalTax;
  const currentTaxDue = result.settlementAdditionalPayable;
  const totalDue = result.settlementTotalDue;
  // 농특세는 정산(§111③) 축 밖에 있으므로 최종 합계에 따로 더한다 — 신고서 양식과 같은 축.
  const ruralSurtax = result.ruralSurtax ?? 0;
  const finalDue = totalDue + ruralSurtax;

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
        {result.settlementRefund > 0 ? (
          <ResultRow label="환급세액 (국세)" value={result.settlementRefund} highlight />
        ) : (
          <ResultRow label="이번에 납부할 세액" value={currentTaxDue} highlight />
        )}

        <Separator />

        {/* 15~16. 지방세 */}
        <ResultRow label="지방세 결정세액" value={result.localIncomeTax} />
        <ResultRow label="지방세 기납부 세액" value={-priorPaidLocalTax} />

        {/**
         * 농어촌특별세 — 「농어촌특별세법」 §5①1호(조특법 감면세액 × 20%).
         * 엔진 `settlementTotalDue`는 국세·지방세 정산분(§111③)만이라 농특세를 담지 않는다.
         * 종전에는 행도 없고 합계에도 안 들어가, 같은 화면 신고서 양식의 농특세 행과 어긋났다.
         */}
        {ruralSurtax > 0 && (
          <>
            <Separator />
            <ResultRow label="농어촌특별세" value={ruralSurtax} />
          </>
        )}

        <Separator />

        {/* 17. 최종 납부할 세액 */}
        <div className="flex justify-between items-center pt-1">
          <span className="text-lg font-bold">납부할 세액</span>
          <span className="text-2xl font-bold text-primary">{formatKRW(finalDue)}</span>
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
