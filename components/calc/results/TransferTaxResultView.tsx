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
  showMultiTransferButton?: boolean;
  /** "동일연도 다른 양도건 계산하기" 클릭 시 호출. 단건 데이터를 다건 store로 이전하고 라우팅하는 역할은 호출자가 담당. */
  onContinueToMulti?: () => void;
}

export function TransferTaxResultView({ result, onReset, onBack, onLoginPrompt = false, showMultiTransferButton = false, onContinueToMulti }: Props) {
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
                <span>필지 {i + 1}</span>
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

      {/* 개별주택가격 미공시 취득 환산 상세 (§164⑤) */}
      {result.preHousingDisclosureDetail && (() => {
        const phd = result.preHousingDisclosureDetail;
        const i = phd.inputs;
        if (!i) return null;
        const fmt = (n: number) => n.toLocaleString();
        const Row = ({ label, value, formula, highlight }: {
          label: string; value: number; formula: string; highlight?: boolean;
        }) => (
          <div className="border-b border-blue-200/50 dark:border-blue-900/40 last:border-0 py-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className={highlight ? "text-sm font-medium text-blue-900 dark:text-blue-200" : "text-sm text-muted-foreground"}>
                {label}
              </span>
              <span className={highlight
                ? "font-mono text-right font-bold text-blue-800 dark:text-blue-200 tabular-nums"
                : "font-mono text-right tabular-nums"}>
                {fmt(value)}원
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{formula}</p>
          </div>
        );
        return (
          <div className="rounded-lg border border-blue-500/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-1">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
              개별주택가격 미공시 취득 환산 (소득세법 시행령 §164 ⑤)
            </p>

            {/* ─── 1. 시점별 기준시가 합계 ─── */}
            <Row
              label="취득시 기준시가 합계"
              value={phd.sumAtAcquisition}
              formula={`토지기준시가(${fmt(i.landPricePerSqmAtAcquisition)}원/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtAcquisition)}원)`}
            />
            <Row
              label="최초공시일 기준시가 합계"
              value={phd.sumAtFirstDisclosure}
              formula={`토지기준시가(${fmt(i.landPricePerSqmAtFirstDisclosure)}원/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtFirstDisclosure)}원)`}
            />
            <Row
              label="양도시 기준시가 합계"
              value={phd.sumAtTransfer}
              formula={`토지기준시가(${fmt(i.landPricePerSqmAtTransfer)}원/㎡ × ${fmt(i.landArea)}㎡) + 건물기준시가(${fmt(i.buildingStdPriceAtTransfer)}원)`}
            />

            {/* ─── 2. 추정 취득시 주택가격 ─── */}
            <Row
              label="취득시 환산 주택공시가격"
              value={phd.estimatedHousingPriceAtAcquisition}
              highlight
              formula={`최초 고시 주택가격(${fmt(i.firstDisclosureHousingPrice)}원) × 취득시 합계(${fmt(phd.sumAtAcquisition)}원) ÷ 최초공시일 합계(${fmt(phd.sumAtFirstDisclosure)}원)`}
            />

            {/* ─── 3. 총 환산취득가 ─── */}
            <Row
              label="총 환산취득가"
              value={phd.totalEstimatedAcquisitionPrice}
              formula={`양도가액(${fmt(i.totalTransferPrice)}원) × 추정 취득시 주택가격(${fmt(phd.estimatedHousingPriceAtAcquisition)}원) ÷ 양도시 주택가격(${fmt(i.transferHousingPrice)}원)`}
            />

            {/* ─── 4. 양도가액 분리 ─── */}
            <div className="pt-2 mt-2 border-t border-border">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                양도가액 분리 (양도시 기준시가 비율 적용)
              </p>
              <Row
                label="양도시 토지 주택가격 성분"
                value={phd.landHousingAtTransfer}
                formula={`양도시 주택가격(${fmt(i.transferHousingPrice)}원) × 양도시 토지기준시가(${fmt(phd.landStdAtTransfer)}원) ÷ 양도시 합계(${fmt(phd.sumAtTransfer)}원)`}
              />
              <Row
                label="토지 양도가액"
                value={phd.landTransferPrice}
                highlight
                formula={`양도가액(${fmt(i.totalTransferPrice)}원) × 양도시 토지 성분(${fmt(phd.landHousingAtTransfer)}원) ÷ 양도시 주택가격(${fmt(i.transferHousingPrice)}원)`}
              />
              <Row
                label="건물 양도가액"
                value={phd.buildingTransferPrice}
                highlight
                formula={`양도가액(${fmt(i.totalTransferPrice)}원) - 토지 양도가액(${fmt(phd.landTransferPrice)}원)`}
              />
            </div>

            {/* ─── 5. 환산취득가 분리 ─── */}
            <div className="pt-2 mt-2 border-t border-border">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                환산취득가 분리 (취득시 추정 기준시가 비율 적용)
              </p>
              <Row
                label="취득시 토지 주택가격 성분"
                value={phd.landHousingAtAcquisition}
                formula={`추정 취득시 주택가격(${fmt(phd.estimatedHousingPriceAtAcquisition)}원) × 취득시 토지기준시가(${fmt(phd.landStdAtAcquisition)}원) ÷ 취득시 합계(${fmt(phd.sumAtAcquisition)}원)`}
              />
              <Row
                label="취득시 건물 주택가격 성분"
                value={phd.buildingHousingAtAcquisition}
                formula={`추정 취득시 주택가격(${fmt(phd.estimatedHousingPriceAtAcquisition)}원) - 취득시 토지 성분(${fmt(phd.landHousingAtAcquisition)}원)`}
              />
              <Row
                label="토지 환산취득가"
                value={phd.landAcquisitionPrice}
                highlight
                formula={`총 환산취득가(${fmt(phd.totalEstimatedAcquisitionPrice)}원) × 취득시 토지 성분(${fmt(phd.landHousingAtAcquisition)}원) ÷ 추정 취득시 주택가격(${fmt(phd.estimatedHousingPriceAtAcquisition)}원)`}
              />
              <Row
                label="건물 환산취득가"
                value={phd.buildingAcquisitionPrice}
                highlight
                formula={`총 환산취득가(${fmt(phd.totalEstimatedAcquisitionPrice)}원) - 토지 환산취득가(${fmt(phd.landAcquisitionPrice)}원)`}
              />
            </div>

            {/* ─── 6. 개산공제 ─── */}
            <div className="pt-2 mt-2 border-t border-border">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                개산공제 (소득세법 시행령 §163 ⑥)
              </p>
              <Row
                label="토지 개산공제"
                value={phd.landLumpDeduction}
                highlight
                formula={`취득시 토지 성분(${fmt(phd.landHousingAtAcquisition)}원) × 3%`}
              />
              <Row
                label="건물 개산공제"
                value={phd.buildingLumpDeduction}
                highlight
                formula={`취득시 건물 성분(${fmt(phd.buildingHousingAtAcquisition)}원) × 3%`}
              />
            </div>
          </div>
        );
      })()}

      {/* 토지/건물 분리 양도차익 상세 (§164⑤ 포함) */}
      {result.splitDetail && (() => {
        const selfOwns = result.splitDetail.selfOwns ?? "both";
        const landIsOwned = selfOwns !== "building_only";
        const buildingIsOwned = selfOwns !== "land_only";
        const ownerLabel = selfOwns === "building_only" ? "건물" : selfOwns === "land_only" ? "토지" : null;
        const colCls = (owned: boolean) =>
          owned ? "font-mono text-right" : "font-mono text-right text-muted-foreground/50 line-through";
        const headerCls = (owned: boolean) =>
          owned ? "font-medium text-center" : "font-medium text-center text-muted-foreground/50";
        return (
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">토지/건물 분리 양도차익</p>
              {ownerLabel && (
                <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                  본인 신고분: {ownerLabel} (소령 §166⑥·§168②)
                </span>
              )}
            </div>
            <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
              <span />
              <span className={headerCls(landIsOwned)}>토지{!landIsOwned && " (타인 소유)"}</span>
              <span className={headerCls(buildingIsOwned)}>건물{!buildingIsOwned && " (타인 소유)"}</span>
              <span className="text-muted-foreground">양도가액</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.transferPrice.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.transferPrice.toLocaleString()}</span>
              <span className="text-muted-foreground">환산취득가</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.acquisitionPrice.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.acquisitionPrice.toLocaleString()}</span>
              <span className="text-muted-foreground">개산공제</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.appraisalDeduction.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.appraisalDeduction.toLocaleString()}</span>
              <span className="text-muted-foreground">양도차익</span>
              <span className={cn(colCls(landIsOwned), landIsOwned && "font-semibold")}>{result.splitDetail.land.gain.toLocaleString()}</span>
              <span className={cn(colCls(buildingIsOwned), buildingIsOwned && "font-semibold")}>{result.splitDetail.building.gain.toLocaleString()}</span>
              <span className="text-muted-foreground">보유연수</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.holdingYears}년</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.holdingYears}년</span>
              <span className="text-muted-foreground">장특공제율</span>
              <span className={colCls(landIsOwned)}>{(result.splitDetail.land.longTermRate * 100).toFixed(0)}%</span>
              <span className={colCls(buildingIsOwned)}>{(result.splitDetail.building.longTermRate * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground">장특공제액</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.longTermDeduction.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.longTermDeduction.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}

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
      {showMultiTransferButton && onContinueToMulti && (
        <button
          type="button"
          onClick={onContinueToMulti}
          className="block w-full text-center rounded-lg bg-black py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors print:hidden"
        >
          동일연도 다른 양도건 계산하기
        </button>
      )}
    </div>
  );
}
