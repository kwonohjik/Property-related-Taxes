"use client";

/**
 * InheritanceTaxResultView — 상속세 계산 결과 화면 (#36)
 * 상속공제 상세 내역 섹션 → DeductionBreakdownSection 위임 (U1 분리)
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { generateResultPdf } from "@/lib/pdf/generate-result-pdf";
import { formatIsoStamp } from "@/lib/utils/file-download";
import type { FarmingDeductionDetail } from "@/lib/tax-engine/types/inheritance-farming.types";
import { calcInheritanceFilingDeadline } from "@/lib/tax-engine/deductions/family-business-autoderive";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { SummaryRow } from "./SummaryRow";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { HeirAllocationSummaryTable } from "@/components/calc/results/HeirAllocationSummaryTable";
import { FilingForm9CoverSection } from "@/components/calc/inheritance/filing-form-9/FilingForm9CoverSection";
import { BesshiBuppyo2Section } from "@/components/calc/inheritance/besshi-buppyo-2";
import { DeductionBesshiFormsSection } from "@/components/calc/inheritance/deduction-besshi";
import { InheritanceFilingFormTable } from "@/components/calc/results/InheritanceFilingFormTable";
import { CorporateExemptionSection } from "@/components/calc/results/CorporateExemptionSection";
import { ExemptionSummaryCard } from "@/components/calc/exemption/ExemptionSummaryCard";
import { DebtAllocationResultCard } from "@/components/calc/results/DebtAllocationResultCard";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import { UnlistedStockSimpleValuationSection } from "@/components/calc/results/UnlistedStockSimpleValuationSection";
import { ListedStockBesshiResultSection } from "@/components/calc/results/ListedStockBesshiResultSection";
import { SourceDataSummarySection } from "@/components/calc/results/source-summary/SourceDataSummarySection";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { InstallmentScheduleCard } from "./installment/InstallmentScheduleCard";
import { PaymentInKindCard } from "./payment-in-kind/PaymentInKindCard";
import { SplitPaymentCard } from "./installment/SplitPaymentCard";
import { CulturalHeritageDeferralCard } from "./inheritance/CulturalHeritageDeferralCard";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { BuildingStdPriceReportSection } from "@/components/calc/results/BuildingStdPriceReportSection";
import { INHERITANCE_PRINT_SECTIONS } from "@/lib/print/inheritance-print-sections";
import { DeductionBreakdownSection } from "./deduction-breakdown/DeductionBreakdownSection";
import { AllocationBreakdownSection } from "./allocation-breakdown/AllocationBreakdownSection";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { expandToggleClass, expandToggleLabel } from "./shared/ExpandToggleButton";
import { type InheritanceTaxResultViewProps } from "./InheritanceTaxResultView.types";
import { useInheritanceResultDerived } from "./useInheritanceResultDerived";
import { STEPS as INHERITANCE_STEPS } from "@/components/calc/inheritance/shared";
// re-export 보존 — shared.tsx 에서 실제 구현
export { Row, formatBillion, LawBadge } from "./deduction-breakdown/shared";
// re-export 보존 — FarmingDeductionDetailRow (farming-section.test.tsx 사용)
export { FarmingDeductionDetailRow } from "./deduction-breakdown/FarmingDeductionDetailRowExport";

// ============================================================
// 과세 요약 Row
// ============================================================

// ============================================================
// 메인 컴포넌트
// ============================================================

export function InheritanceTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  onEditStep,
  showLoginPrompt = false,
  heirs,
  debtItems,
  estateItems,
  priorGifts,
  exemptions,
  deathDate,
  presumedItems,
  familyBusinessInput,
  decedentName,
  decedentResidentNumber,
  decedentAddress,
  installmentEnabled = false,
  installmentYears = "5",
  installmentFamilyBusiness = false,
  installmentFbMode = "straight20",
  installmentFutureRate = "3.1",
  splitPaymentEnabled = false,
  splitPaymentAmount = "",
  paymentInKindEnabled = false,
  paymentInKindIneligibleAmount = "",
  paymentInKindRequestedAmount = "",
  decedentType = "resident",
}: InheritanceTaxResultViewProps) {
  const [showValuation, setShowValuation] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // 선택 항목 PDF 다운로드 — 클라이언트 react-pdf 생성(로컬 result 기준, savedId 비의존).
  async function handlePrintPdf(pdfSections: string[]) {
    if (pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      await generateResultPdf({
        taxType: "inheritance",
        taxTypeLabel: "상속세",
        resultData: result as unknown as Record<string, unknown>,
        selectedSectionIds: pdfSections,
        filename: `상속세_계산결과_${formatIsoStamp()}.pdf`,
      });
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfBusy(false);
    }
  }

  // 선택 출력 — 기본 전체 미선택 (사용자가 필요한 항목만 추가). 제네릭 패널 정합 위해 string Set.
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  // 파생 계산 로직 (순수 props 의존) — 800줄 정책에 따라 훅으로 분리
  const {
    hasDebtOrCollateral,
    availablePrintIds,
    debtItemsWithCollateral,
    paymentInKindFilingAmount,
    splitDueDates,
    assetNameById,
  } = useInheritanceResultDerived({
    result,
    heirs,
    debtItems,
    estateItems,
    priorGifts,
    deathDate,
    installmentEnabled,
    paymentInKindEnabled,
    paymentInKindIneligibleAmount,
    paymentInKindRequestedAmount,
  });

  return (
    <div className="space-y-5">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={INHERITANCE_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={pdfBusy}
      />

      {/* 핵심 결과 카드 제거 (2026-06-13) — 아래 "상속세 과세 요약"이 결정세액·산출세액·
          세액공제를 더 상세히 제공하여 중복. PDF(ResultPdfDocument)는 결정세액 자체 보유. */}

      {/* 과세 요약 */}
      <PrintSection id="tax-summary" selectedIds={selectedPrintIds}>
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">상속세 과세 요약</h3>
        </div>
        <div className="divide-y divide-border">
          <SummaryRow label="상속재산 평가액" value={formatKRW(result.grossEstateValue)} />
          {result.exemptAmount > 0 &&
            (() => {
              // 과세가액 불산입(§16·§17)이 있으면 비과세/불산입 2행 분리 (작업1)
              const ni = result.exemptionDetail?.notIncludedTotal ?? 0;
              const nt = result.exemptionDetail?.nonTaxableTotal ?? 0;
              if (ni > 0) {
                return (
                  <>
                    {nt > 0 && (
                      <SummaryRow label="비과세 차감" value={`- ${formatKRW(nt)}`} sub deduction />
                    )}
                    <SummaryRow
                      label="과세가액 불산입 차감"
                      value={`- ${formatKRW(ni)}`}
                      sub
                      deduction
                    />
                  </>
                );
              }
              return (
                <SummaryRow label="비과세 차감" value={`- ${formatKRW(result.exemptAmount)}`} sub deduction />
              );
            })()}
          {result.deductedBeforeAggregation > 0 && (
            <SummaryRow
              label="장례비·채무 차감"
              value={`- ${formatKRW(result.deductedBeforeAggregation)}`}
              sub
              deduction
            />
          )}
          {result.priorGiftAggregated > 0 && (
            <SummaryRow
              label="사전증여재산 합산"
              value={`+ ${formatKRW(result.priorGiftAggregated)}`}
              sub
            />
          )}
          <SummaryRow label="상속세 과세가액" value={formatKRW(result.taxableEstateValue)} highlight />
          <SummaryRow label="상속공제 합계" value={`- ${formatKRW(result.totalDeduction)}`} sub deduction />
          {(result.appraisalFeeDeduction ?? 0) > 0 && (
            <SummaryRow
              label="감정평가수수료 공제"
              value={`- ${formatKRW(result.appraisalFeeDeduction ?? 0)}`}
              sub
              deduction
            />
          )}
          <SummaryRow label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <SummaryRow label="산출세액 (누진세율)" value={formatKRW(result.computedTax)} />
          {result.generationSkipSurcharge > 0 && (
            <SummaryRow
              label="세대생략 할증 (30% / 40%)"
              value={`+ ${formatKRW(result.generationSkipSurcharge)}`}
            />
          )}
          {result.corporateExemption && result.corporateExemption.amount > 0 && (
            <SummaryRow
              label="영리법인 면제 (§3의2②)"
              value={`- ${formatKRW(result.corporateExemption.amount)}`}
              deduction
            />
          )}
          {result.totalTaxCredit > 0 && (
            <SummaryRow
              label="세액공제"
              value={`- ${formatKRW(result.totalTaxCredit)}`}
              deduction
            />
          )}
          <SummaryRow label="결정세액" value={formatKRW(result.finalTax)} highlight />
          {(result.culturalHeritageDeferredTax ?? 0) > 0 && (
            <>
              <SummaryRow
                label="문화유산 등 징수유예 (§74)"
                value={`- ${formatKRW(result.culturalHeritageDeferredTax ?? 0)}`}
                sub
                deduction
              />
              <SummaryRow
                label="납부할세액 (징수유예 차감)"
                value={formatKRW(result.finalTax - (result.culturalHeritageDeferredTax ?? 0))}
                highlight
              />
            </>
          )}
        </div>
      </div>
      </PrintSection>

      {/* §74 지정문화유산 등 징수유예 */}
      {(result.culturalHeritageDeferredTax ?? 0) > 0 && (
        <PrintSection id="cultural-heritage-deferral" selectedIds={selectedPrintIds}>
          <CulturalHeritageDeferralCard result={result} />
        </PrintSection>
      )}

      {/* 세액공제 상세 — §29·§30·§69 산출근거 ▼펼침 (§28 증여세액공제는 AllocationBreakdownSection이 담당) */}
      {result.totalTaxCredit > 0 && (
        <PrintSection id="tax-credit" selectedIds={selectedPrintIds}>
          <TaxCreditBreakdownCard
            credit={result.creditDetail}
            taxBeforeCredit={
              result.creditDetail.totalComputedTaxWithSurcharge ?? result.computedTax
            }
            computedTax={result.computedTax}
            corporateExemption={result.corporateExemption?.amount ?? 0}
          />
        </PrintSection>
      )}

      {/* §27 세대생략 할증 산식: ⑧ 세대생략 가산액 펼침 내부로 통합 (AllocationBreakdownSection) */}

      {/* 상속개시자료 요약 — 4표 (Table A·B·C·D) — 사전증여재산 명세 바로 위 */}
      {heirs && heirs.length > 0 && (
        <PrintSection id="source-data" selectedIds={selectedPrintIds}>
          <SourceDataSummarySection
            deathDate={deathDate}
            heirs={heirs}
            estateItems={estateItems}
            presumedItems={presumedItems}
            presumedResultItems={result.presumedInheritanceDetail?.items}
            presumedTotal={result.presumedInheritanceDetail?.total}
            debtItems={debtItemsWithCollateral}
            priorGifts={priorGifts}
          />
        </PrintSection>
      )}

      {/* 사전증여재산 명세 */}
      {priorGifts && priorGifts.length > 0 && deathDate && (
        <PrintSection id="prior-gift-filing" selectedIds={selectedPrintIds}>
          <InheritanceFilingFormTable
            priorGifts={priorGifts}
            heirs={heirs}
            priorGiftAggregated={result.priorGiftAggregated}
            deathDate={deathDate}
          />
        </PrintSection>
      )}

      {/* 영리법인 상속세 면제 (§3의2②) — 면제 산출 요약 + 부표 5 명세서 단일 섹션 */}
      {result.corporateExemption && result.corporateExemption.amount > 0 && (
        <PrintSection id="corporate-exemption" selectedIds={selectedPrintIds}>
          <CorporateExemptionSection
            corporateExemption={result.corporateExemption}
            heirs={heirs}
          />
        </PrintSection>
      )}

      {/* 비과세 적용 내역 (금양임야·묘토 면적/금액 한도·족보 — 상증령 §8③) */}
      {result.exemptionDetail && result.exemptionDetail.itemResults.length > 0 && (
        <PrintSection id="exemption-detail" selectedIds={selectedPrintIds}>
          <ExemptionSummaryCard
            result={result.exemptionDetail}
            itemResults={result.exemptionDetail.itemResults}
          />
        </PrintSection>
      )}

      {/* 채무·공과·장례비 협의분할 결과 카드 — debtItems 없이 §14 담보채무만 있어도 표시 */}
      {result.heirAllocationResult &&
        hasDebtOrCollateral &&
        heirs &&
        heirs.length > 0 && (
          <PrintSection id="debt-allocation" selectedIds={selectedPrintIds}>
            <DebtAllocationResultCard
              debtItems={debtItems ?? []}
              heirAllocationResult={result.heirAllocationResult}
              heirs={heirs}
              collateralDebtDetail={result.collateralDebtDetail}
            />
          </PrintSection>
        )}

      {/* 상속인별 상속세부담액 집계 표 */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <PrintSection id="heir-allocation-summary" selectedIds={selectedPrintIds}>
          <HeirAllocationSummaryTable result={result} heirs={heirs} />
        </PrintSection>
      )}

      {/* 상속공제 상세 내역 (U1 분리 → DeductionBreakdownSection) */}
      <PrintSection id="deduction-breakdown" selectedIds={selectedPrintIds}>
        <DeductionBreakdownSection
          result={result}
          estateItems={estateItems}
          debtItems={debtItems}
          heirs={heirs}
          familyBusinessHeirId={familyBusinessInput?.heirId}
        />
      </PrintSection>

      {/* 상속세 산출세액·증여세액공제 계산 근거 (배부 6항목 펼침) */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <PrintSection id="allocation-breakdown" selectedIds={selectedPrintIds}>
          <AllocationBreakdownSection result={result} heirs={heirs} />
        </PrintSection>
      )}

      {/* 별지 제9호서식 상속세과세표준신고 및 자진납부계산서 (앞쪽) */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <PrintSection id="filing-form-9" selectedIds={selectedPrintIds}>
          <FilingForm9CoverSection
            result={result}
            heirs={heirs}
            deathDate={deathDate}
            decedentName={decedentName}
            decedentResidentNumber={decedentResidentNumber}
            decedentAddress={decedentAddress}
            splitPaymentAmount={
              !installmentEnabled && splitPaymentEnabled && splitPaymentAmount
                ? parseAmount(splitPaymentAmount)
                : undefined
            }
            paymentInKindAmount={paymentInKindFilingAmount}
          />
        </PrintSection>
      )}

      {/* 별지 제9호서식 부표 2 — 상속인별 상속재산 및 평가명세서 (A4 가로, 상속인별 N장) */}
      {result.heirAllocationResult &&
        heirs &&
        heirs.length > 0 &&
        (estateItems || priorGifts) && (
          <PrintSection id="besshi-buppyo-2" selectedIds={selectedPrintIds}>
            <BesshiBuppyo2Section
              result={result}
              heirs={heirs}
              estateItems={estateItems}
              priorGifts={priorGifts}
              exemptions={exemptions}
              deathDate={deathDate}
            />
          </PrintSection>
        )}

      {/* 채무·공과금·장례비·상속공제 명세 (부표3·별지5호·별지1호) */}
      {result.deductionDetail && (
        <PrintSection id="deduction-besshi" selectedIds={selectedPrintIds}>
          <DeductionBesshiFormsSection
            result={result}
            heirs={heirs}
            debtItems={debtItems}
            estateItems={estateItems}
            familyBusinessInput={familyBusinessInput}
            deathDate={deathDate}
            decedentName={decedentName}
            decedentResidentNumber={decedentResidentNumber}
          />
        </PrintSection>
      )}

      {/* 영농상속공제 사후관리 안내 */}
      {result.deductionDetail.farmingDeduction > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2 print:hidden">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            영농상속공제 사후관리 안내 (§18의3④ + §16⑦⑧)
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            상속개시일부터 5년 이내 영농상속재산을 처분하거나 영농 종사를 중단하면
            공제받은 금액 100%가 추징되고 이자상당액이 가산됩니다. 조세포탈·회계부정 형 확정 시 5년 무관 추징.
          </p>
          <a
            href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}${deathDate ? `&deathDate=${deathDate}&filingDeadline=${calcInheritanceFilingDeadline(deathDate)}` : ""}`}
            className="inline-block text-xs font-medium text-blue-700 dark:text-blue-300 underline hover:text-blue-900 dark:hover:text-blue-100"
          >
            → 사후관리 추징 시뮬레이터 진입
          </a>
        </div>
      )}

      {/* 가업상속공제 사후관리 안내 (§18의2⑤ + §15⑮⑯) */}
      {result.familyBusinessPostMgmtMeta && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2 print:hidden">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            가업상속공제 사후관리 안내 (§18의2⑤ + §15⑮⑯)
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            상속개시일부터 5년 이내 가업용 자산 40% 이상 처분·가업 미종사·지분 감소·고용 미달(정규직&총급여 각 목 모두 90% 미달) 시
            공제받은 금액이 추징되고 이자상당액이 가산됩니다. 위반일 말일부터 6개월 이내 신고·납부 의무.
          </p>
          <a
            href={`/calc/family-business-postmgmt?originalDeduction=${result.familyBusinessPostMgmtMeta.appliedDeduction}&deathDate=${result.familyBusinessPostMgmtMeta.deathDate}&filingDeadline=${result.familyBusinessPostMgmtMeta.filingDeadline}${result.familyBusinessPostMgmtMeta.ofzExemptionActive ? "&ofz=1" : ""}${result.familyBusinessPostMgmtMeta.usedDirectInput ? "&direct=1" : ""}`}
            className="inline-block text-xs font-medium text-blue-700 dark:text-blue-300 underline hover:text-blue-900 dark:hover:text-blue-100"
          >
            → 가업 사후관리 추징 시뮬레이터 진입
          </a>
        </div>
      )}

      {/* 재산 평가 내역 */}
      <PrintSection id="valuation-detail" selectedIds={selectedPrintIds}>
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowValuation((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>재산 평가 내역 ({result.valuationResults.length}건)</span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(showValuation)}</span>
        </button>
        {showValuation && (
          <div className="divide-y divide-border text-xs">
            {result.valuationResults.map((vr, i) => (
              <div key={i} className="px-4 py-2.5 space-y-0.5">
                <div className="flex justify-between font-medium text-sm">
                  <span>{assetNameById.get(vr.estateItemId) ?? "재산"}</span>
                  <span>{formatKRW(vr.valuatedAmount)}</span>
                </div>
                <p className="text-gray-400">
                  평가방법:{" "}
                  {{
                    market_value: "시가",
                    appraisal: "감정평가",
                    standard_price: "보충적 평가",
                    similar_sales: "유사매매사례",
                    acquisition_cost: "취득가액",
                    book_value: "장부가액",
                    deposit_statutory: "예금·적금 법정평가",
                  }[vr.method]}
                </p>
                {vr.method === "deposit_statutory" && vr.breakdown.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {vr.breakdown.map((bd, k) => (
                      <div key={k} className="flex justify-between text-gray-400">
                        <span>{bd.label}</span>
                        <span>{formatKRW(bd.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {vr.warnings.map((w, j) => (
                  <p key={j} className="text-amber-600 dark:text-amber-400">
                    {w}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      </PrintSection>

      {/* 건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더) */}
      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ estateItems }} />
      </PrintSection>

      {/* 비상장주식 별지 부표3 출력 (정식평가 V2 자산) */}
      {estateItems && (
        <PrintSection id="unlisted-stock-besshi" selectedIds={selectedPrintIds}>
          <UnlistedStockBesshiResultSection estateItems={estateItems} />
        </PrintSection>
      )}

      {/* 비상장주식 평가조서 (간편평가 — 보충적 평가 자산) */}
      {estateItems && (
        <PrintSection id="unlisted-stock-simple" selectedIds={selectedPrintIds}>
          <UnlistedStockSimpleValuationSection estateItems={estateItems} />
        </PrintSection>
      )}

      {/* 상장주식 평가조서(갑·을) 출력 */}
      {estateItems && (
        <PrintSection id="listed-stock-besshi" selectedIds={selectedPrintIds}>
          <ListedStockBesshiResultSection
            estateItems={estateItems}
            valuationDate={deathDate}
          />
        </PrintSection>
      )}

      {/* 연부연납 일정표 (§71·§72) */}
      <PrintSection id="installment-guide" selectedIds={selectedPrintIds}>
        <InstallmentScheduleCard
          result={result}
          deathDate={deathDate}
          enabled={installmentEnabled}
          years={installmentYears}
          familyBusiness={installmentFamilyBusiness}
          fbMode={installmentFbMode}
          futureRate={installmentFutureRate}
          decedentType={decedentType}
        />
      </PrintSection>

      {/* 분납 일정 (§70②) — 연부연납과 배타 */}
      {!installmentEnabled && (
        <PrintSection id="split-payment" selectedIds={selectedPrintIds}>
          <SplitPaymentCard
            finalTax={result.finalTax}
            filingDeadline={splitDueDates?.filing}
            installmentDueDate={splitDueDates?.installment}
            splitPaymentEnabled={splitPaymentEnabled}
            splitPaymentAmount={
              splitPaymentAmount ? parseAmount(splitPaymentAmount) : undefined
            }
          />
        </PrintSection>
      )}

      {/* 물납 안내 (§73) */}
      {paymentInKindEnabled && (
        <PrintSection id="payment-in-kind" selectedIds={selectedPrintIds}>
          <PaymentInKindCard
            result={result}
            estateItems={estateItems ?? []}
            decedentType={decedentType}
            enabled={paymentInKindEnabled}
            ineligibleAmount={parseAmount(paymentInKindIneligibleAmount)}
            requestedAmount={
              paymentInKindRequestedAmount
                ? parseAmount(paymentInKindRequestedAmount)
                : undefined
            }
          />
        </PrintSection>
      )}

      {/* 근거 조문 배지 모음 숨김 — 각 카드·산식에 조문 링크가 이미 노출됨 */}

      {/* 로그인 유도 */}
      {showLoginPrompt && <LoginPromptBanner />}

      {/* 면책고지 */}
      <DisclaimerBanner />

      {/* 입력 수정 — 결과에서 특정 입력 단계로 바로 이동(입력값 보존) */}
      {onEditStep && (
        <div
          className="rounded-md border border-border bg-muted/30 px-3 py-2 print:hidden"
          data-testid="result-edit-steps"
        >
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            입력 단계로 돌아가 수정
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INHERITANCE_STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => onEditStep(i)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted transition-colors"
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 버튼 — 입력 단계 네비게이션과 통일 (justify-between · 컴팩트 px/py) */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          aria-label="바로 앞 단계로 돌아가기"
        >
          <ChevronLeft className="w-4 h-4" />
          뒤로 가기
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGoToFirst ?? onBack}
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            다시 계산
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            처음으로
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 하위 호환 re-export (FarmingDeductionDetail 타입 노출)
// ============================================================
export type { FarmingDeductionDetail };
