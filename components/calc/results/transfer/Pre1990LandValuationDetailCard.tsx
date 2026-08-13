"use client";

/**
 * 1990.8.30. 이전 취득 토지 기준시가 환산 상세 (소득령 §164④ 토지등급 환산).
 *
 * `TransferTaxResultView`의 인라인 블록에서 추출(R1-b) — 일괄(bundled) 자산별 카드에서도
 * 같은 산출근거를 보여주기 위해서다. 단건 뷰는 이 컴포넌트를 `<PrintSection>`으로 감싸 쓰고,
 * 일괄 뷰는 그대로 렌더한다.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";

type Detail = NonNullable<TransferTaxResult["pre1990LandValuationDetail"]>;

export function Pre1990LandValuationDetailCard({ detail }: { detail: Detail }) {
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  1990.8.30. 이전 취득 토지 기준시가 환산
                </p>
                <p className="text-xs text-muted-foreground">{detail.caseLabel}</p>
                <div className="text-xs space-y-1 mt-2">
                  <div>
                    <span className="text-muted-foreground">공식: </span>
                    <code className="text-caption"><FormulaText value={detail.breakdown.formula} /></code>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2">
                    <span className="text-muted-foreground">취득시 등급가액</span>
                    <span className="font-mono text-right">{detail.breakdown.gradeValueAtAcquisition.toLocaleString()}</span>
                    <span className="text-muted-foreground">90.8.30. 현재 등급가액</span>
                    <span className="font-mono text-right">{detail.breakdown.gradeValue_1990_0830.toLocaleString()}</span>
                    <span className="text-muted-foreground">90.8.30. 직전 등급가액</span>
                    <span className="font-mono text-right">{detail.breakdown.gradeValuePrev_1990_0830.toLocaleString()}</span>
                    <span className="text-muted-foreground">분모 (min(평균, 현재))</span>
                    <span className="font-mono text-right">{detail.breakdown.appliedDenominator.toLocaleString()}</span>
                    <span className="text-muted-foreground">적용 비율</span>
                    <span className="font-mono text-right">{(detail.breakdown.appliedRatio * 100).toFixed(2)}%</span>
                    <span className="text-muted-foreground">㎡당 가액</span>
                    <span className="font-mono text-right">{detail.pricePerSqmAtAcquisition.toLocaleString()}</span>
                    <span className="text-muted-foreground font-medium">취득시 기준시가</span>
                    <span className="font-mono text-right font-medium">{detail.standardPriceAtAcquisition.toLocaleString()}</span>
                    {/* 양도시 기준시가는 상위 폼 standardPriceAtTransfer 입력값으로 공급 — 서브엔진 미산출 */}
                  </div>
                  {detail.warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-destructive">
                      {detail.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  <p className="text-micro text-muted-foreground pt-1">{detail.breakdown.legalBasis}</p>
                </div>
              </div>
  );
}
