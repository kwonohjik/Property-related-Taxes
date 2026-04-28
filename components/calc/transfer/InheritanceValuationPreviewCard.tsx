"use client";

/**
 * 상속 취득가액 의제 결과 미리보기 카드
 *
 * - case A (pre-deemed): 환산취득가 vs 실가×물가상승률 비교 + 적용 금액 강조
 * - case B (post-deemed): 신고가액 + 평가방법 표시
 *
 * 결과 뷰 산식 원칙:
 *   - 한국어 풀어쓰기 (변수 약어·floor 금지)
 *   - 최종 적용 금액 강조, 후보는 회색
 *   - 중간 산술 결과 미표시
 */

import type { InheritanceAcquisitionResult } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";

interface Props {
  result: InheritanceAcquisitionResult;
  houseValuationResult?: InheritanceHouseValuationResult;
}

const METHOD_LABELS: Record<string, string> = {
  market_value:        "매매사례가액 (시가)",
  appraisal:           "감정평가액",
  auction_public_sale: "수용·경매·공매가액",
  similar_sale:        "유사매매사례가액",
  supplementary:       "보충적평가액",
  pre_deemed_max:      "의제취득일 이전 환산",
};

export function InheritanceValuationPreviewCard({ result, houseValuationResult }: Props) {
  const { acquisitionPrice, method, legalBasis, warnings, preDeemedBreakdown } = result;
  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary">상속 취득가액 산정 결과</p>

      {/* case A: 환산 vs 실가×CPI 비교 */}
      {preDeemedBreakdown && (
        <div className="space-y-1.5 text-sm">
          {/* 환산취득가 후보 */}
          <div className={`flex items-center justify-between ${
            preDeemedBreakdown.selectedMethod === "converted"
              ? "font-semibold text-foreground"
              : "text-muted-foreground"
          }`}>
            <span>환산취득가</span>
            <span>{preDeemedBreakdown.convertedAmount.toLocaleString()}원</span>
          </div>

          {/* 실가×물가상승률 후보 */}
          {preDeemedBreakdown.inflationAdjustedAmount !== null && (
            <div className={`flex items-center justify-between ${
              preDeemedBreakdown.selectedMethod === "inflation_adjusted"
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }`}>
              <span>
                취득실가 × 물가상승률{" "}
                <span className="text-[11px]">
                  ({preDeemedBreakdown.cpiRatio.toFixed(3)}배)
                </span>
              </span>
              <span>{preDeemedBreakdown.inflationAdjustedAmount.toLocaleString()}원</span>
            </div>
          )}

          <div className="border-t border-border pt-1.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              적용 ({preDeemedBreakdown.selectedMethod === "converted" ? "환산취득가" : "취득실가×물가상승률"} 기준)
            </span>
            <span className="font-bold text-primary text-base">
              {acquisitionPrice.toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      {/* case B: 신고가액 */}
      {!preDeemedBreakdown && (
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>평가방법</span>
            <span>{METHOD_LABELS[method] ?? method}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">상속세 신고가액</span>
            <span className="font-bold text-primary text-base">
              {acquisitionPrice.toLocaleString()}원
            </span>
          </div>
        </div>
      )}

      {/* 상속 주택 3-시점 기준시가 환산 상세 */}
      {houseValuationResult && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20 p-2.5 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            3-시점 기준시가 환산 상세
          </p>

          {/* 양도시 */}
          <div className="flex justify-between text-muted-foreground">
            <span>양도시 합계 기준시가</span>
            <span>{fmt(houseValuationResult.totalStdPriceAtTransfer)}원</span>
          </div>
          <div className="pl-3 space-y-0.5 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>토지</span>
              <span>{fmt(houseValuationResult.landStdAtTransfer)}원</span>
            </div>
            <div className="flex justify-between">
              <span>주택</span>
              <span>{fmt(houseValuationResult.totalStdPriceAtTransfer - houseValuationResult.landStdAtTransfer)}원</span>
            </div>
          </div>

          {/* 상속개시일 */}
          <div className="flex justify-between">
            <span className="font-medium">상속개시일 합계 기준시가</span>
            <span className="font-medium">{fmt(houseValuationResult.totalStdPriceAtInheritance)}원</span>
          </div>
          <div className="pl-3 space-y-0.5 text-[11px] text-muted-foreground">
            {houseValuationResult.pre1990Result && (
              <div className="flex justify-between">
                <span>토지 ({houseValuationResult.pre1990Result.caseLabel})</span>
                <span>{fmt(houseValuationResult.landStdAtInheritance)}원</span>
              </div>
            )}
            {!houseValuationResult.pre1990Result && (
              <div className="flex justify-between">
                <span>토지</span>
                <span>{fmt(houseValuationResult.landStdAtInheritance)}원</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>
                주택 ({houseValuationResult.estimationMethod === "user_override" ? "직접 입력" : "§164⑤ 자동 추정"})
              </span>
              <span>{fmt(houseValuationResult.housePriceAtInheritanceUsed)}원</span>
            </div>
          </div>
        </div>
      )}

      {/* 법령 근거 */}
      <p className="text-[10px] text-muted-foreground">{legalBasis}</p>

      {/* 경고 */}
      {warnings && warnings.length > 0 && (
        <div className="rounded bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 p-2 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-yellow-700 dark:text-yellow-300">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
