"use client";

/**
 * 양도소득세 계산 결과 화면
 * ResultView + Row 헬퍼 컴포넌트
 */

import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { CarryoverScenarioBFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioBFilingCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { GeneralBuildingValuationDetailCard } from "@/components/calc/results/GeneralBuildingValuationDetailCard";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

// ── 유틸 ──────────────────────────────────────────────────────

/**
 * 분리 인쇄 트리거.
 */
function printScoped(scope: "form-table" | "full" | "calculation" | "phd" | "split-detail" | "steps") {
  if (typeof document === "undefined") return;
  document.body.dataset.printScope = scope;
  const cleanup = () => {
    delete document.body.dataset.printScope;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => window.print(), 0);
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

// ── Row 헬퍼 ──────────────────────────────────────────────────

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
    <tr className={cn(highlight && "bg-muted/50 font-semibold")}>
      <td className={cn(
        "px-4 py-2.5 whitespace-nowrap",
        sub && "pl-7 text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {label}
      </td>
      <td className={cn(
        "px-4 py-2.5 text-right font-mono whitespace-nowrap",
        sub && "text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {value}
      </td>
    </tr>
  );
}

// ── Props ──────────────────────────────────────────────────────

interface Props {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onGoToFirst?: () => void;
  onLoginPrompt?: boolean;
  showMultiTransferButton?: boolean;
  onContinueToMulti?: () => void;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export function TransferTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  onLoginPrompt = false,
  showMultiTransferButton = false,
  onContinueToMulti,
  formData,
  asset,
  transferPriceOverride,
}: Props) {
  const [showSteps, setShowSteps] = useState(false);

  // asset prop 미전달 시 formData.assets[0] 자동 fallback
  // (호출부에서 asset 안 넘기는 경우 carryover 정보 표시 위해 필수)
  const resolvedAsset = asset ?? formData?.assets[0];

  // 이월과세(§97조의2) 모드 판정
  const carryoverDetail = result.carryoverTaxationDetail;
  const isCarryoverMode = !!carryoverDetail?.isEligible;
  const adoptedA = carryoverDetail?.adoptedScenario === "A";

  return (
    <div className="space-y-5" data-print-section="full">

      {/* PDF 인쇄 버튼 */}
      <div className="flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => printScoped("form-table")}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🧾 신고서 양식 PDF
        </button>
        <button
          type="button"
          onClick={() => printScoped("full")}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ 전체 PDF / 인쇄
        </button>
      </div>

      {/* ── 신고서 양식 표 ── */}
      {isCarryoverMode && carryoverDetail ? (
        /* 이월과세 비교과세 모드: Scenario A(채택) + Scenario B(미적용) 나란히 */
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">
            신고서 양식 — 이월과세 비교과세 (소득세법 §97조의2)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilingFormTable
              result={result}
              formData={formData}
              asset={resolvedAsset}
              transferPriceOverride={transferPriceOverride}
              acquisitionDateLabel="(증여자 취득일)"
              acquisitionDateOverride={resolvedAsset?.carryover?.donorAcquisitionDate ?? ""}
              title="[A] 이월과세 적용"
              subtitle={`보유기간 ${carryoverDetail.scenarioA.holdingPeriodYears}년 (증여자 취득일 기산) · 취득가액 ${formatKRW(carryoverDetail.scenarioA.acquisitionPrice)}`}
              adopted={adoptedA}
              onPrint={() => printScoped("form-table")}
            />
            <CarryoverScenarioBFilingCard
              scenarioB={carryoverDetail.scenarioB}
              adopted={!adoptedA}
              transferPrice={transferPriceOverride ?? Number(formData?.contractTotalPrice ?? 0)}
              transferDate={formData?.transferDate}
              giftRegistryDate={resolvedAsset?.carryover?.giftRegistryDate}
              onPrint={() => printScoped("form-table")}
            />
          </div>
        </div>
      ) : (
        /* 일반 모드: 단일 신고서 양식 */
        <FilingFormTable
          result={result}
          formData={formData}
          asset={asset}
          transferPriceOverride={transferPriceOverride}
          onPrint={() => printScoped("form-table")}
        />
      )}

      {/* ── 핵심 결과 카드 + 계산 내역 ── */}
      <div data-print-section="calculation" className="space-y-5">
        <div className="flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => printScoped("calculation")}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            🖨️ 계산 내역 PDF
          </button>
        </div>

        {/* 비과세 / 납부세액 요약 */}
        {result.isExempt ? (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {result.exemptReason ?? "비과세"}
            </p>
            <p className="text-2xl font-bold mt-1">납부세액 0</p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
            <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
            <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(() => {
                const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
                const ruralSurtax = result.new993Detail?.ruralSurtax ?? 0;
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
                    {ruralSurtax > 0 && (
                      <>
                        <span>+</span>
                        <span>농어촌특별세 {formatKRW(ruralSurtax)}</span>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* 필지별 계산 내역 */}
        {result.parcelDetails && result.parcelDetails.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">필지별 계산 내역</h3>
            {result.parcelDetails.map((pr, idx) => (
              <details key={pr.id} className="rounded-lg border border-border overflow-hidden">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer bg-muted/20 hover:bg-muted/40 text-sm font-medium list-none">
                  <span>필지 {idx + 1}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    양도차익 {formatKRW(pr.transferGain)}
                  </span>
                </summary>
                <table className="w-full text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
                  <tbody>
                  <Row label="안분 양도가액" value={formatKRW(pr.allocatedTransferPrice)} sub />
                  <Row label="취득가액" value={formatKRW(pr.acquisitionPrice)} sub />
                  {pr.estimatedDeduction > 0 && (
                    <Row label="필요경비 (개산공제 §163⑥)" value={`- ${formatKRW(pr.estimatedDeduction)}`} sub />
                  )}
                  {pr.expenses > 0 && (
                    <Row label={pr.estimatedDeduction > 0 ? "필요경비 (자본·양도비)" : "필요경비"} value={`- ${formatKRW(pr.expenses)}`} sub />
                  )}
                  <Row label="양도차익" value={formatKRW(pr.transferGain)} />
                  <Row
                    label={`장기보유특별공제 (${(pr.longTermHoldingRate * 100).toFixed(0)}%)`}
                    value={pr.longTermHoldingDeduction > 0 ? `- ${formatKRW(pr.longTermHoldingDeduction)}` : "해당없음"}
                    sub
                  />
                  <Row label="양도소득금액" value={formatKRW(pr.transferIncome)} highlight />
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        )}

        {/* 이월과세 비교과세 결과 카드 */}
        {result.carryoverTaxationDetail && (
          <CarryoverComparisonCard detail={result.carryoverTaxationDetail} />
        )}

        {/* §97② 단서 swap 발동 표시 */}
        {!result.isExempt && result.swapApplied && result.swapComparison && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1">
            <p className="font-semibold text-amber-900">
              필요경비 swap 적용 — 소득세법 §97② 2호 단서
            </p>
            <p className="text-xs text-amber-800">
              환산취득가(또는 감정가액) + 개산공제 {formatKRW(result.swapComparison.estimatedSide)}
              {" < "}자본적지출 + 양도비 {formatKRW(result.swapComparison.directSide)}
            </p>
            <p className="text-xs text-amber-800">
              → 자본적지출 + 양도비 {formatKRW(result.swapComparison.directSide)}을 필요경비로 적용
            </p>
          </div>
        )}
        {!result.isExempt && !result.swapApplied && result.swapComparison && (
          <div className="rounded-lg border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            §97② 본문 적용 — 환산+개산공제 {formatKRW(result.swapComparison.estimatedSide)} ≥ 자본+양도비 {formatKRW(result.swapComparison.directSide)} (swap 미발동)
          </div>
        )}

        {/* 상세 내역 */}
        {!result.isExempt && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-auto text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
              <tbody>
              <Row label="양도차익" value={formatKRW(result.transferGain)} />
              {/* §161 적용 시: 12억 초과분 안분 행 숨김 (양도차익 단계에서 분리하지 않음) */}
              {!result.rentalHousingExceptionDetail?.applied && result.taxableGain !== result.transferGain && (
                <Row label="과세 양도차익 (12억 초과분)" value={formatKRW(result.taxableGain)} sub />
              )}
              <Row
                label={`장기보유특별공제 (${formatRate(result.longTermHoldingRate)})`}
                value={result.longTermHoldingDeduction > 0 ? `- ${formatKRW(result.longTermHoldingDeduction)}` : "해당없음"}
              />
              {/* 양도소득금액 — §161 적용 시 양도차익 − 장기보유공제 (§95①), 일반 시 과세대상 양도차익 − 장기보유공제 */}
              <Row
                label="양도소득금액"
                value={formatKRW(
                  result.rentalHousingExceptionDetail?.applied
                    ? result.transferGain - result.longTermHoldingDeduction
                    : result.taxableGain - result.longTermHoldingDeduction,
                )}
                sub
              />
              {/* §161 적용 시: 비과세 양도소득금액 차감 행 + 과세대상 양도소득금액 행 추가 */}
              {result.rentalHousingExceptionDetail?.applied && (result.nontaxableGainAmount ?? 0) > 0 && (
                <>
                  <Row
                    label="비과세 양도소득금액 (소령 §161①)"
                    value={`- ${formatKRW(result.nontaxableGainAmount ?? 0)}`}
                    sub
                  />
                  <Row label="과세대상 양도소득금액" value={formatKRW(result.taxableGain)} sub />
                </>
              )}
              {/* Round 11 (2026-05-06): §99의3 소득금액 감면대상 차감 — 결과 요약 카드 */}
              {result.new993Detail?.isEligible && result.new993Detail.reducibleTransferIncome > 0 && (() => {
                const incomeBefore = result.rentalHousingExceptionDetail?.applied
                  ? result.transferGain - result.longTermHoldingDeduction
                  : result.taxableGain - result.longTermHoldingDeduction;
                const reducible = result.new993Detail.reducibleTransferIncome;
                const incomeAfter = Math.max(0, incomeBefore - reducible);
                return (
                  <>
                    <Row
                      label="소득금액 감면대상 (§99의3)"
                      value={`- ${formatKRW(reducible)}`}
                      sub
                    />
                    <Row label="감면후 소득금액" value={formatKRW(incomeAfter)} sub />
                  </>
                );
              })()}
              <Row
                label="기본공제"
                value={result.basicDeduction > 0 ? `- ${formatKRW(result.basicDeduction)}` : "0"}
              />
              <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
              <Row
                label={`산출세액 (${formatRate(result.appliedRate)}${result.surchargeRate ? ` + 중과 ${formatRate(result.surchargeRate)}` : ""})`}
                value={formatKRW(result.calculatedTax)}
              />
              {result.shortTermNote && (
                <tr>
                  <td colSpan={2} className="pb-1 pt-0">
                    <div className="mx-4 rounded-sm bg-slate-50 dark:bg-slate-800/50 px-2 py-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {result.shortTermNote}
                    </div>
                  </td>
                </tr>
              )}
              {result.reductionAmount > 0 && (
                <Row label={`감면 (${result.reductionType ?? ""})`} value={`- ${formatKRW(result.reductionAmount)}`} />
              )}
              {/* Phase 2 (2026-05-06): §99의3 신축주택 과세특례 상세 */}
              {result.new993Detail && (() => {
                const d = result.new993Detail;
                if (!d.isEligible) {
                  return (
                    <tr><td colSpan={2} className="p-0">
                    <div className="mx-2 my-2 rounded-md border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                      <p className="font-medium">조특법 §99의3 신축주택 과세특례 — 적용 불가</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {d.ineligibleReasons.map((r, i) => (
                          <li key={i}>{r.message}</li>
                        ))}
                      </ul>
                    </div>
                    </td></tr>
                  );
                }
                return (
                  <tr><td colSpan={2} className="p-0">
                  <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
                    <p className="font-medium text-primary">조특법 §99의3 신축주택 과세특례 (양도소득금액 차감 방식)</p>
                    <p className="text-muted-foreground">
                      {d.isWithin5Years
                        ? "5년 이내 양도 — 양도소득금액 전액 차감"
                        : `5년 후 양도 — 5년 안분 산식 (부호 케이스: ${d.signCase})`}
                    </p>
                    <div className="space-y-0.5">
                      {d.formulaSteps.map((s, i) => (
                        <p key={i}>
                          <span className="text-muted-foreground">{s.label}: </span>
                          {s.formula ?? formatKRW(typeof s.value === "number" ? s.value : 0)}
                        </p>
                      ))}
                    </div>
                    <div className="border-t border-primary/20 pt-1.5 space-y-0.5">
                      <p>감면 양도소득금액 = {formatKRW(d.reducibleTransferIncome)}</p>
                      <p>양도세 감면세액 = {formatKRW(d.taxReductionForRuralSurtax)}</p>
                      <p className="font-medium">농어촌특별세 (20%) = {formatKRW(d.ruralSurtax)}</p>
                    </div>
                  </div>
                  </td></tr>
                );
              })()}
              {result.publicExpropriationDetail?.isEligible && (() => {
                const d = result.publicExpropriationDetail;
                const bd = d.breakdown;
                return (
                  <tr><td colSpan={2} className="p-0">
                  <div className="mx-2 my-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1.5">
                    <p className="font-medium text-primary">공익사업 수용 감면 상세 (조특법 §77)</p>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">① 보상 구성</p>
                      <p>현금보상 {formatKRW(bd.cashAmount)} · 채권보상 {formatKRW(bd.bondAmount)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-muted-foreground">② 양도소득금액 안분 (보상액 비율)</p>
                      <p>현금분 소득 {formatKRW(bd.cashIncome)} · 채권분 소득 {formatKRW(bd.bondIncome)}</p>
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
                        {" · "}채권 {formatKRW(bd.bondReduction)} ({(bd.bondRate * 100).toFixed(0)}%)
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
                      <p className="text-red-600">※ 연간 한도 {formatKRW(d.appliedAnnualLimit)} 초과 → capping</p>
                    )}
                    {d.useLegacyRates && (
                      <p className="text-amber-700">※ 조특법 부칙 §53 종전 감면율 적용 (2015-12-31 이전 고시 + 2017-12-31 이전 양도)</p>
                    )}
                  </div>
                  </td></tr>
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
                    <Row label="가산세 합계" value={`+ ${formatKRW(totalAllPenalty)}`} />
                    {result.penaltyTax > 0 && (
                      <Row label="환산가액적용가산세 (§114조의2)" value={formatKRW(result.penaltyTax)} sub />
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
                    <Row label="총결정세액" value={formatKRW(totalWithPenalty)} highlight />
                  </>
                );
              })()}
              <Row label="지방소득세 (10%)" value={formatKRW(result.localIncomeTax)} />
              </tbody>
            </table>
          </div>
        )}

        {/* 중과세 정보 */}
        {result.surchargeType && !result.isSurchargeSuspended && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-400">
              ⚠️ 중과세 적용 —{" "}
              {result.surchargeType === "multi_house_2" ? "2주택" : result.surchargeType === "multi_house_3plus" ? "3주택+" : "비사업용토지"}{" "}
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

        {/* 다주택 중과세 상세 */}
        {result.multiHouseSurchargeDetail && (
          <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
        )}

        {/* 비사업용토지 판정 상세 */}
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
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.pricePerSqmAtAcquisition.toLocaleString()}</span>
                <span className="text-muted-foreground font-medium">취득시 기준시가</span>
                <span className="font-mono text-right font-medium">{result.pre1990LandValuationDetail.standardPriceAtAcquisition.toLocaleString()}</span>
                <span className="text-muted-foreground font-medium">양도시 기준시가</span>
                <span className="font-mono text-right font-medium">{result.pre1990LandValuationDetail.standardPriceAtTransfer.toLocaleString()}</span>
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
      </div>{/* /data-print-section="calculation" */}

      {/* 개별주택가격 미공시 취득 환산 상세 */}
      {result.preHousingDisclosureDetail && (
        <PreHousingDisclosureDetailSection
          result={result}
          onPrint={() => printScoped("phd")}
        />
      )}

      {/* 토지/건물 분리 양도차익 상세 */}
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
          <div data-print-section="split-detail" className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">토지/건물 분리 양도차익</p>
                {ownerLabel && (
                  <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                    본인 신고분: {ownerLabel} (소령 §166⑥·§168②)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => printScoped("split-detail")}
                className="print:hidden shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
              >
                🖨️ PDF
              </button>
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
              <span className="text-muted-foreground">필요경비 (개산공제)</span>
              <span className={colCls(landIsOwned)}>
                {result.splitDetail.land.appraisalDeduction.toLocaleString()}
                {result.splitDetail.land.stdPriceAtAcq != null && (
                  <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {result.splitDetail.land.stdPriceAtAcq.toLocaleString()} × 3%</span>
                )}
              </span>
              <span className={colCls(buildingIsOwned)}>
                {result.splitDetail.building.appraisalDeduction.toLocaleString()}
                {result.splitDetail.building.stdPriceAtAcq != null && (
                  <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {result.splitDetail.building.stdPriceAtAcq.toLocaleString()} × 3%</span>
                )}
              </span>
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
      <div data-print-section="steps" className="space-y-0">
        <div className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm font-medium">
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            className="flex-1 flex items-center justify-between hover:opacity-70 transition-opacity"
          >
            <span>계산 과정 상세 보기</span>
            <span className="text-muted-foreground">{showSteps ? "▲" : "▼"}</span>
          </button>
          {showSteps && (
            <button
              type="button"
              onClick={() => printScoped("steps")}
              className="print:hidden ml-3 shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              🖨️ PDF
            </button>
          )}
        </div>
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
                <p className={cn("font-mono shrink-0", step.sub ? "text-xs text-muted-foreground" : "font-medium")}>
                  {formatKRW(step.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* ⑦ 상업용건물·오피스텔 환산취득가 산정 근거 상세 (소령 §164⑧, §176조의2②2호) */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(result as any).commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          detail={(result as any).commercialBuildingValuationDetail}
          transferPrice={formData ? (parseAmount(formData.contractTotalPrice) || 0) : 0}
          acquisitionGain={result.transferGain ?? undefined}
          longTermDeduction={result.longTermHoldingDeduction ?? undefined}
          taxableIncome={
            typeof (result as unknown as Record<string, unknown>).taxableIncome === "number"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (result as any).taxableIncome
              : undefined
          }
          taxBase={result.taxBase ?? undefined}
          taxAmount={result.calculatedTax ?? undefined}
          localTax={result.localIncomeTax ?? undefined}
          totalTax={result.totalTax ?? undefined}
        />
      )}

      {/* ⑦ 일반건물(토지+건물 일괄) 환산취득가 산정 근거 상세 (소령 §176의2④, §163⑥, §102②) */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(result as any).generalBuildingValuationDetail && (
        <GeneralBuildingValuationDetailCard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          detail={(result as any).generalBuildingValuationDetail}
          totalTransferPrice={formData ? (parseAmount(formData.contractTotalPrice) || 0) : 0}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          holdingYears={(result as any).holdingYears ?? undefined}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          holdingMonths={(result as any).holdingMonths ?? undefined}
        />
      )}

      {/* ⑦ 장기임대주택 보유자 거주주택 비과세 특례 상세 (소령 §155⑳) — applied=false 시 미적용 사유도 표시 */}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}

      {/* 비로그인 안내 */}
      {onLoginPrompt && (
        <div className="print:hidden">
          <LoginPromptBanner hasPendingResult />
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="flex gap-2 print:hidden">
        {onGoToFirst && (
          <button
            type="button"
            onClick={onGoToFirst}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            ← 자산 목록
          </button>
        )}
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
        {showMultiTransferButton && onContinueToMulti && (
          <button
            type="button"
            onClick={onContinueToMulti}
            className="flex-1 rounded-lg bg-black py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            동일연도 다른 양도건
          </button>
        )}
      </div>
    </div>
  );
}
