"use client";

/**
 * 양도소득세 계산 결과 화면
 * ResultView + Row 헬퍼 컴포넌트
 */

import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2.5",
        highlight && "bg-muted/50 font-semibold",
        sub && "pl-7 text-muted-foreground",
      )}
    >
      <span className={sub ? "text-xs" : ""}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

interface Props {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onLoginPrompt?: boolean;
}

export function TransferTaxResultView({ result, onReset, onBack, onLoginPrompt = false }: Props) {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div className="space-y-5">
      {/* PDF 인쇄 버튼 */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ PDF / 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      {result.isExempt ? (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
          <div className="text-4xl mb-2">🎉</div>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {result.exemptReason ?? "비과세"}
          </p>
          <p className="text-2xl font-bold mt-1">납부세액 0원</p>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
          <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
          <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(() => {
              const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
              return (
                <>
                  <span>결정세액 {formatKRW(result.determinedTax)}</span>
                  {totalAllPenalty > 0 && (
                    <>
                      <span>+</span>
                      <span>가산세 {formatKRW(totalAllPenalty)}</span>
                    </>
                  )}
                  <span>+</span>
                  <span>지방소득세 {formatKRW(result.localIncomeTax)}</span>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 필지별 계산 내역 (다필지 모드) */}
      {result.parcelDetails && result.parcelDetails.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">필지별 계산 내역</h3>
          {result.parcelDetails.map((pr, i) => (
            <details key={pr.id} className="rounded-lg border border-border overflow-hidden">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer bg-muted/20 hover:bg-muted/40 text-sm font-medium list-none">
                <span>필지 {i + 1} ({pr.id})</span>
                <span className="font-mono text-xs text-muted-foreground">
                  양도차익 {formatKRW(pr.transferGain)}
                </span>
              </summary>
              <div className="divide-y divide-border text-sm">
                <Row label="안분 양도가액" value={formatKRW(pr.allocatedTransferPrice)} sub />
                <Row label="취득가액" value={formatKRW(pr.acquisitionPrice)} sub />
                {pr.estimatedDeduction > 0 && (
                  <Row label="개산공제" value={`- ${formatKRW(pr.estimatedDeduction)}`} sub />
                )}
                {pr.expenses > 0 && pr.estimatedDeduction === 0 && (
                  <Row label="필요경비" value={`- ${formatKRW(pr.expenses)}`} sub />
                )}
                <Row label="양도차익" value={formatKRW(pr.transferGain)} />
                <Row
                  label={`장기보유특별공제 (${(pr.longTermHoldingRate * 100).toFixed(0)}%)`}
                  value={pr.longTermHoldingDeduction > 0 ? `- ${formatKRW(pr.longTermHoldingDeduction)}` : "해당없음"}
                  sub
                />
                <Row label="양도소득금액" value={formatKRW(pr.transferIncome)} highlight />
              </div>
            </details>
          ))}
        </div>
      )}

      {/* 상세 내역 */}
      {!result.isExempt && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          <Row label="양도차익" value={formatKRW(result.transferGain)} />
          {result.taxableGain !== result.transferGain && (
            <Row label="과세 양도차익 (12억 초과분)" value={formatKRW(result.taxableGain)} sub />
          )}
          <Row
            label={`장기보유특별공제 (${formatRate(result.longTermHoldingRate)})`}
            value={
              result.longTermHoldingDeduction > 0
                ? `- ${formatKRW(result.longTermHoldingDeduction)}`
                : "해당없음"
            }
          />
          <Row
            label="양도소득금액"
            value={formatKRW(result.taxableGain - result.longTermHoldingDeduction)}
            sub
          />
          <Row
            label="기본공제"
            value={result.basicDeduction > 0 ? `- ${formatKRW(result.basicDeduction)}` : "0원"}
          />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row
            label={`산출세액 (${formatRate(result.appliedRate)}${result.surchargeRate ? ` + 중과 ${formatRate(result.surchargeRate)}` : ""})`}
            value={formatKRW(result.calculatedTax)}
          />
          {result.reductionAmount > 0 && (
            <Row
              label={`감면 (${result.reductionType ?? ""})`}
              value={`- ${formatKRW(result.reductionAmount)}`}
            />
          )}
          {result.publicExpropriationDetail?.isEligible && (() => {
            const d = result.publicExpropriationDetail;
            const bd = d.breakdown;
            return (
              <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
                <p className="font-medium text-primary">공익사업 수용 감면 상세 (조특법 §77)</p>

                <div className="space-y-0.5">
                  <p className="text-muted-foreground">① 보상 구성</p>
                  <p>
                    현금보상 {formatKRW(bd.cashAmount)} · 채권보상 {formatKRW(bd.bondAmount)}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <p className="text-muted-foreground">② 양도소득금액 안분 (보상액 비율)</p>
                  <p>
                    현금분 소득 {formatKRW(bd.cashIncome)} · 채권분 소득 {formatKRW(bd.bondIncome)}
                  </p>
                </div>

                {(bd.basicDeductionOnCash > 0 || bd.basicDeductionOnBond > 0) && (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">③ 기본공제 배정 (§103② — 감면율 낮은 자산 우선)</p>
                    <p>
                      {bd.basicDeductionOnCash > 0 && <>현금분 −{formatKRW(bd.basicDeductionOnCash)}</>}
                      {bd.basicDeductionOnCash > 0 && bd.basicDeductionOnBond > 0 && " · "}
                      {bd.basicDeductionOnBond > 0 && <>채권분 −{formatKRW(bd.basicDeductionOnBond)}</>}
                    </p>
                  </div>
                )}

                <div className="space-y-0.5">
                  <p className="text-muted-foreground">④ 자산별 감면금액</p>
                  <p>
                    현금 {formatKRW(bd.cashReduction)} ({(bd.cashRate * 100).toFixed(0)}%)
                    {" · "}
                    채권 {formatKRW(bd.bondReduction)} ({(bd.bondRate * 100).toFixed(0)}%)
                  </p>
                  <p>감면대상소득금액 = {formatKRW(bd.reducibleIncome)}</p>
                </div>

                <div className="space-y-0.5 border-t border-primary/20 pt-1.5">
                  <p className="text-muted-foreground">⑤ 감면세액 = 산출세액 × 감면대상소득금액 / 과세표준</p>
                  <p className="font-medium">
                    {formatKRW(result.calculatedTax)} × {formatKRW(bd.reducibleIncome)} / {formatKRW(result.taxBase)}
                    {" = "}{formatKRW(d.rawReductionAmount)}
                  </p>
                </div>

                {d.cappedByAnnualLimit && (
                  <p className="text-red-600">
                    ※ 연간 한도 {formatKRW(d.appliedAnnualLimit)} 초과 → capping
                  </p>
                )}
                {d.useLegacyRates && (
                  <p className="text-amber-700">
                    ※ 조특법 부칙 §53 종전 감면율 적용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도)
                  </p>
                )}
              </div>
            );
          })()}
          <Row
            label="결정세액"
            value={formatKRW(result.determinedTax)}
            highlight={result.penaltyTax === 0 && !result.penaltyDetail?.totalPenalty}
          />
          {(() => {
            const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
            if (totalAllPenalty === 0) return null;
            const totalWithPenalty = result.determinedTax + totalAllPenalty;
            return (
              <>
                <Row
                  label="가산세 합계"
                  value={`+ ${formatKRW(totalAllPenalty)}`}
                />
                {result.penaltyTax > 0 && (
                  <Row
                    label="환산가액적용가산세 (§114조의2)"
                    value={formatKRW(result.penaltyTax)}
                    sub
                  />
                )}
                {result.penaltyDetail?.filingPenalty && result.penaltyDetail.filingPenalty.filingPenalty > 0 && (
                  <Row
                    label={`신고불성실가산세 (${(result.penaltyDetail.filingPenalty.penaltyRate * 100).toFixed(0)}%)`}
                    value={formatKRW(result.penaltyDetail.filingPenalty.filingPenalty)}
                    sub
                  />
                )}
                {result.penaltyDetail?.delayedPaymentPenalty && result.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty > 0 && (
                  <Row
                    label={`납부지연가산세 (${result.penaltyDetail.delayedPaymentPenalty.elapsedDays}일 × ${(result.penaltyDetail.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%)`}
                    value={formatKRW(result.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty)}
                    sub
                  />
                )}
                <Row
                  label="총결정세액"
                  value={formatKRW(totalWithPenalty)}
                  highlight
                />
              </>
            );
          })()}
          <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} />
        </div>
      )}

      {/* 중과세 정보 */}
      {result.surchargeType && !result.isSurchargeSuspended && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠️ 중과세 적용 —{" "}
            {result.surchargeType === "multi_house_2"
              ? "2주택"
              : result.surchargeType === "multi_house_3plus"
                ? "3주택+"
                : "비사업용토지"}{" "}
            (+{formatRate(result.surchargeRate ?? 0)})
          </p>
        </div>
      )}
      {result.isSurchargeSuspended && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-blue-800 dark:text-blue-400">
            ℹ️ 다주택 중과세 유예 기간 적용 — 일반세율로 계산됩니다.
          </p>
        </div>
      )}

      {/* 다주택 중과세 상세 결과 */}
      {result.multiHouseSurchargeDetail && (
        <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
      )}

      {/* 비사업용토지 판정 상세 결과 */}
      {result.nonBusinessLandJudgmentDetail && (
        <div>
          <p className="text-sm font-medium mb-2">비사업용토지 판정 결과</p>
          <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} />
        </div>
      )}

      {/* 1990.8.30. 이전 취득 토지 기준시가 환산 상세 */}
      {result.pre1990LandValuationDetail && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            1990.8.30. 이전 취득 토지 기준시가 환산
          </p>
          <p className="text-xs text-muted-foreground">{result.pre1990LandValuationDetail.caseLabel}</p>
          <div className="text-xs space-y-1 mt-2">
            <div>
              <span className="text-muted-foreground">공식: </span>
              <code className="text-[11px]">{result.pre1990LandValuationDetail.breakdown.formula}</code>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2">
              <span className="text-muted-foreground">취득시 등급가액</span>
              <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValueAtAcquisition.toLocaleString()}</span>
              <span className="text-muted-foreground">90.8.30. 현재 등급가액</span>
              <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValue_1990_0830.toLocaleString()}</span>
              <span className="text-muted-foreground">90.8.30. 직전 등급가액</span>
              <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValuePrev_1990_0830.toLocaleString()}</span>
              <span className="text-muted-foreground">분모 (min(평균, 현재))</span>
              <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.appliedDenominator.toLocaleString()}</span>
              <span className="text-muted-foreground">적용 비율</span>
              <span className="font-mono text-right">{(result.pre1990LandValuationDetail.breakdown.appliedRatio * 100).toFixed(2)}%</span>
              <span className="text-muted-foreground">㎡당 가액</span>
              <span className="font-mono text-right">{result.pre1990LandValuationDetail.pricePerSqmAtAcquisition.toLocaleString()}원</span>
              <span className="text-muted-foreground font-medium">취득시 기준시가</span>
              <span className="font-mono text-right font-medium">{result.pre1990LandValuationDetail.standardPriceAtAcquisition.toLocaleString()}원</span>
              <span className="text-muted-foreground font-medium">양도시 기준시가</span>
              <span className="font-mono text-right font-medium">{result.pre1990LandValuationDetail.standardPriceAtTransfer.toLocaleString()}원</span>
            </div>
            {result.pre1990LandValuationDetail.warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-destructive">
                {result.pre1990LandValuationDetail.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground pt-1">{result.pre1990LandValuationDetail.breakdown.legalBasis}</p>
          </div>
        </div>
      )}

      {/* 계산 과정 토글 */}
      <button
        type="button"
        onClick={() => setShowSteps((v) => !v)}
        className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <span>계산 과정 상세 보기</span>
        <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
      </button>

      {showSteps && (
        <div className="rounded-lg border border-border divide-y divide-border text-sm">
          {result.steps.map((step, i) => (
            <div key={i} className={cn(
              "py-2.5 flex justify-between gap-4",
              step.sub ? "pl-8 pr-4 bg-muted/30" : "px-4",
            )}>
              <div className="min-w-0">
                <p className={cn("font-medium", step.sub && "text-muted-foreground text-xs")}>{step.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.formula}</p>
                {step.legalBasis && !step.sub && (
                  <LawArticleModal legalBasis={step.legalBasis} />
                )}
              </div>
              <p className={cn("font-mono shrink-0", step.sub ? "text-xs text-muted-foreground" : "font-medium")}>{formatKRW(step.amount)}</p>
            </div>
          ))}
        </div>
      )}

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* 비로그인 안내 — 인쇄 시 숨김 */}
      {onLoginPrompt && (
        <div className="print:hidden">
          <LoginPromptBanner hasPendingResult />
        </div>
      )}

      {/* 하단 버튼 — 인쇄 시 숨김 */}
      <div className="flex gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          다시 계산하기
        </button>
      </div>
    </div>
  );
}
