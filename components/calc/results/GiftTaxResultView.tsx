"use client";

/**
 * GiftTaxResultView — 증여세 계산 결과 화면 (#37)
 */

import { useEffect, useMemo, useState } from "react";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";
import type { GiftTaxResult, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import { BurdenedStockTransferTaxResultCard } from "@/components/calc/results/BurdenedStockTransferTaxResultCard";
import { BurdenedGiftComparisonCard } from "@/components/calc/results/BurdenedGiftComparisonCard";
import { GIFT_DONOR_LABELS } from "@/components/calc/prior-gift/meta";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { GenerationSkipSurchargeBreakdownCard } from "@/components/calc/results/GenerationSkipSurchargeBreakdownCard";
import { GiftTaxFilingFormTable } from "@/components/calc/results/GiftTaxFilingFormTable";
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";
import { GiftValuationBasisCard } from "@/components/calc/results/GiftValuationBasisCard";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import { UnlistedStockSimpleValuationSection } from "@/components/calc/results/UnlistedStockSimpleValuationSection";
import { isSimpleModeUnlisted } from "@/lib/calc/unlisted-valuation-mode";
import { ListedStockBesshiResultSection } from "@/components/calc/results/ListedStockBesshiResultSection";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";
import {
  LawBadge,
  InstallmentGuide,
  AggregationExcludedCard,
} from "@/components/calc/results/GiftTaxResultViewHelpers";
import { isInstallmentSplitEligible } from "@/lib/tax-engine/credits/installment-split";
import { SplitPaymentCard } from "@/components/calc/results/installment/SplitPaymentCard";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { getGiftFilingDueDates } from "@/lib/calc/inheritance-gift-filing-deadline";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { formatGiftSaveMessage } from "@/components/calc/gift-tax-save-handler";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import { GiftDonorPaidGrossUpSection } from "@/components/calc/results/GiftDonorPaidGrossUpSection";
import { FarmlandReductionCard } from "@/components/calc/results/FarmlandReductionCard";
import { GiftTwoStreamDetailSection } from "@/components/calc/results/GiftTwoStreamDetailSection";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { parseLawRefsForModal } from "@/lib/utils/law-url";
import { generateResultPdf } from "@/lib/pdf/generate-result-pdf";
import { formatIsoStamp } from "@/lib/utils/file-download";
import {
  GIFT_PRINT_SECTIONS,
  type GiftPrintSectionId,
} from "@/lib/print/gift-print-sections";

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: GiftTaxResult;
  onReset: () => void;
  onBack: () => void;
  /** 1단계로 이동 (입력값 보존) */
  onGoToFirst?: () => void;
  /** 수동 저장 — v4: {id, created, isDraft} 반환. 실패 시 throw */
  onSave?: () => Promise<{ id: string; created: boolean; isDraft: boolean }>;
  /** 자동저장 토스트 표시용 (결과 화면 마운트 시 1회) */
  autoSaveToast?: SaveToastMessage | null;
  showLoginPrompt?: boolean;
  /** 증여재산 원본 목록 — 평가내역에서 ID 대신 자산명 표시용 */
  estateItems?: EstateItem[];
  /** 증여일 — 상장주식 평가조서(갑) ④ 평가기준일 표시용 */
  giftDate?: string;
  /** 사전증여 입력 원본 — 출처(📋 이력 기반) 배지 + 부표 1 ②/③ 컬럼 표시 */
  priorGifts?: Array<{
    giftDate: string;
    giftAmount: number;
    sourceCalculationId?: string;
    donor?: GiftDonorRelation;
    // PR 3 (2026-05-22): 부표 1 양식 정합 — 04 개별주택·06 오피스텔·08 부동산 권리 신규
    propertyCategory?:
      | "cash"
      | "real_estate_land"
      | "real_estate_individual_house"
      | "real_estate_apartment"
      | "real_estate_officetel"
      | "real_estate_building"
      | "real_estate_acquisition_right"
      | "listed_stock"
      | "unlisted_stock"
      | "financial"
      | "deposit"
      | "other";
    propertyName?: string;
    propertyLocation?: string;
  }>;
  /** 저장된 계산 id — 서버 PDF 선택 출력(PR-B1)용. 미저장/비로그인 시 undefined */
  savedId?: string;
  /** 분납 입력 (Step3, §70②) — 결정세액 미영향 투영 */
  splitPaymentEnabled?: boolean;
  splitPaymentAmount?: string;
  /** 부담부증여 양도소득세 결과 목록 — burdenedGiftTransferTax ON 자산 순서대로 */
  transferTaxResults?: TransferTaxResult[];
  /** 부담부증여 양도소득세 계산 실패 시 경고 메시지 (증여세 결과 표시는 계속) */
  transferTaxError?: string;
  /** 주식 부담부증여 양도소득세 결과 목록 — burdenedGiftStockTransferTax ON 자산 순서대로 */
  stockTransferTaxResults?: StockTransferResult[];
  /** 단순증여(채무 0) baseline 증여세 결과 — 부담부 자산 있을 때만 산출, 없으면 undefined */
  simpleGiftResult?: GiftTaxResult;
  /**
   * 동시증여 추가 건 결과 배열 (건 1..)
   * 없으면 단건 모드 (하위 호환)
   */
  simultaneousResults?: GiftTaxResult[];
  /**
   * 추가 건별 증여자 관계 레이블 — 결과 헤더 표시용
   * 예: ["조부모로부터 — 70,000,000원 증여"]
   */
  simultaneousResultLabels?: string[];
  /** 건 0의 donor — 합계 카드 레이블용 */
  mainDonor?: GiftDonorRelation;
}

export function GiftTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  onSave,
  autoSaveToast = null,
  showLoginPrompt = false,
  estateItems = [],
  priorGifts = [],
  giftDate,
  splitPaymentEnabled = false,
  splitPaymentAmount = "",
  transferTaxResults = [],
  transferTaxError,
  stockTransferTaxResults = [],
  simpleGiftResult,
  simultaneousResults,
  simultaneousResultLabels,
  mainDonor,
}: Props) {
  const [showValuation, setShowValuation] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(autoSaveToast);

  // autoSaveToast가 props로 새로 들어오면 표시 — props↔internal state 동기화 (의도된 패턴)
  useEffect(() => {
     
    if (autoSaveToast) setSaveMessage(autoSaveToast);
  }, [autoSaveToast]);

  const handleSaveClick = async () => {
    if (!onSave) return;
    setSaveMessage(null);
    try {
      const outcome = await onSave();
      setSaveMessage(formatGiftSaveMessage(outcome));
    } catch (e) {
      setSaveMessage(formatGiftSaveMessage(e instanceof Error ? e : new Error(String(e))));
    }
  };

  const taxBeforeCredit = result.computedTax + result.generationSkipSurcharge;
  const hasFilingFormTable =
    result.filingFormRows && result.filingFormRows.length > 0;

  // 선택 항목 PDF 다운로드 — 클라이언트 react-pdf 생성 (로컬 데이터 기반).
  async function handlePrintPdf(pdfSections: string[]) {
    if (pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      await generateResultPdf({
        taxType: "gift",
        taxTypeLabel: "증여세",
        resultData: result as unknown as Record<string, unknown>,
        selectedSectionIds: pdfSections,
        filename: `증여세_계산결과_${formatIsoStamp()}.pdf`,
      });
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfBusy(false);
    }
  }

  // 현재 결과뷰에 실제 렌더되는 leaf id (각 섹션 렌더 가드와 1:1 — 설계 §2.1)
  const availablePrintIds = useMemo<Set<GiftPrintSectionId>>(() => {
    const s = new Set<GiftPrintSectionId>();
    const items = estateItems ?? [];
    s.add("core-result");
    s.add("tax-summary");
    if (result.generationSkipSurchargeDetail || result.generationSkipProvisoApplied)
      s.add("gen-skip-surcharge");
    if (result.totalTaxCredit > 0) s.add("tax-credit");
    if (priorGifts.length > 0) s.add("prior-gift");
    if (result.filingFormRows && result.filingFormRows.length > 0)
      s.add("filing-form-10");
    if (result.aggregationExcludedDetail) s.add("aggregation-excluded");
    if (result.valuationResults.length > 0) s.add("valuation-form");
    if (hasBuildingStdReport({ estateItems: items })) s.add("building-std-report");
    if (items.some((it) => it.unlistedStockValuationV2)) s.add("unlisted-stock-besshi");
    if (items.some(isSimpleModeUnlisted)) s.add("unlisted-stock-simple");
    if (
      items.some(
        (it) =>
          it.category === "listed_stock" &&
          (it.listedStockAvgPrice ?? 0) > 0 &&
          (it.listedStockShares ?? 0) > 0
      )
    )
      s.add("listed-stock-besshi");
    if (
      calcInstallmentPayment({ finalTax: result.finalTax, isFamilyBusiness: false })
        .eligible
    )
      s.add("installment");
    if (isInstallmentSplitEligible(result.finalTax)) s.add("split-payment");
    if (result.donorPaidTaxGrossUp?.applied) s.add("donor-paid-grossup");
    if (result.farmlandReductionDetail) s.add("farmland-reduction");
    if (result.warnings.length > 0) s.add("warnings");
    if (transferTaxResults.length > 0) s.add("burdened-transfer-tax");
    if (stockTransferTaxResults.length > 0) s.add("burdened-stock-transfer-tax");
    // 세부담 비교 카드 — 부동산 또는 주식 양도세가 1건 이상 있어야 노출
    if (
      simpleGiftResult != null &&
      (transferTaxResults.length > 0 || stockTransferTaxResults.length > 0) &&
      !transferTaxError
    )
      s.add("burdened-gift-comparison");
    // 동시증여 추가 건 별지 제10호서식 (⑦-c 지점)
    if (simultaneousResults && simultaneousResults.length > 0) {
      s.add("simultaneous-filing-10");
    }
    return s;
  }, [result, estateItems, priorGifts, transferTaxResults, transferTaxError, stockTransferTaxResults, simpleGiftResult, simultaneousResults]);

  // 신고기한 §68①(증여일 속하는 달의 말일 + 3개월) · 분납기한 §70②(+2개월). giftDate 없으면 undefined.
  const giftDueDates = useMemo(() => getGiftFilingDueDates(giftDate), [giftDate]);

  return (
    <div className="space-y-5">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={GIFT_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={pdfBusy}
      />

      {/* 저장 버튼 */}
      <div className="flex justify-end gap-2 print:hidden">
        {onSave && <SaveButton onSave={handleSaveClick} />}
      </div>

      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />

      {/* 핵심 결과 카드 */}
      <PrintSection id="core-result" selectedIds={selectedPrintIds}>
      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-5">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">
          증여세 결정세액
        </p>
        <p className="text-4xl font-bold tracking-tight">{formatKRW(result.finalTax)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span>산출세액</span>
            <p className="font-semibold text-foreground text-base mt-0.5">
              {formatKRW(result.computedTax)}
            </p>
          </div>
          {result.generationSkipSurcharge > 0 && (
            <div>
              <span>세대생략 할증</span>
              <p className="font-semibold text-amber-600 dark:text-amber-400 text-base mt-0.5">
                + {formatKRW(result.generationSkipSurcharge)}
              </p>
            </div>
          )}
          {result.totalTaxCredit > 0 && (
            <div>
              <span>세액공제</span>
              <p className="font-semibold text-blue-600 dark:text-blue-400 text-base mt-0.5">
                - {formatKRW(result.totalTaxCredit)}
              </p>
            </div>
          )}
        </div>
      </div>
      </PrintSection>

      {/* Phase B: 신고서 양식 표 (12행 / 18행) */}
      {hasFilingFormTable && (
        <PrintSection id="filing-form-10" selectedIds={selectedPrintIds}>
          <GiftTaxFilingFormTable
            rows={result.besshi10Rows}
            warnings={result.warnings}
            testIdPrefix="besshi10-0-"
          />
        </PrintSection>
      )}

      {/* 합산배제증여재산(§41의3·§41의5) 별도 스트림 — §47① 개별 건별 과세 (A1.5).
          별지 서식(위)은 일반 증여재산 기준. 합산배제분은 별도 과세표준(§55①3호)이라 분리 카드로 표시. */}
      {result.aggregationExcludedDetail && (
        <PrintSection id="aggregation-excluded" selectedIds={selectedPrintIds}>
          <AggregationExcludedCard detail={result.aggregationExcludedDetail} />
        </PrintSection>
      )}

      {/* 동시증여 추가 건 별지 제10호서식 (⑦-b 지점) */}
      {simultaneousResults && simultaneousResults.length > 0 && (
        <PrintSection id="simultaneous-filing-10" selectedIds={selectedPrintIds}>
          <div className="space-y-4">
            {simultaneousResults.map((sr, i) => (
              <div key={i} className="space-y-2">
                {/* 건 헤더 */}
                <div className="flex items-center gap-2 px-1" data-testid={`sim-result-header-${i}`}>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    건 {i + 1}
                  </span>
                  {simultaneousResultLabels?.[i] && (
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {simultaneousResultLabels[i]}
                    </span>
                  )}
                </div>
                <GiftTaxFilingFormTable
                  rows={sr.besshi10Rows}
                  warnings={sr.warnings}
                  testIdPrefix={`besshi10-${i + 1}-`}
                />
              </div>
            ))}
          </div>
        </PrintSection>
      )}

      {/* 동시증여 수증자 총 납부세액 합계 카드 (⑦-b 지점) */}
      {simultaneousResults && simultaneousResults.length > 0 && (
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4 space-y-2 dark:border-sky-700 dark:bg-sky-900/20">
          <h3 className="text-sm font-bold text-sky-900 dark:text-sky-100">
            수증자 총 납부세액 합계 (상증법 §4의2①)
          </h3>
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-0.5 text-sky-700 dark:text-sky-300">
                  건 0 결정세액 {mainDonor ? `(${GIFT_DONOR_LABELS[mainDonor] ?? mainDonor})` : ""}
                </td>
                <td className="py-0.5 text-right font-mono tabular-nums">
                  {formatKRW(result.finalTax)}
                </td>
              </tr>
              {simultaneousResults.map((sr, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-sky-700 dark:text-sky-300">
                    건 {i + 1} 결정세액{" "}
                    {simultaneousResultLabels?.[i]
                      ? `(${simultaneousResultLabels[i]})`
                      : ""}
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {formatKRW(sr.finalTax)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-sky-300 dark:border-sky-700 font-bold">
                <td className="pt-2 text-sky-900 dark:text-sky-100">합계</td>
                <td className="pt-2 text-right font-mono tabular-nums text-sky-900 dark:text-sky-100">
                  {formatKRW(
                    result.finalTax +
                      simultaneousResults.reduce((s, r) => s + r.finalTax, 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-micro text-sky-600 dark:text-sky-400">
            수증자 총 납부세액 합계 = 건 0 결정세액 + 건 1 결정세액 + … + 건 N 결정세액
          </p>
        </div>
      )}

      {/* 사전증여 합산 — 이력 출처 배지 (Phase 2) */}
      {priorGifts.length > 0 && (
        <PrintSection id="prior-gift" selectedIds={selectedPrintIds}>
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-violet-50 dark:bg-violet-900/20 px-4 py-3">
            <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
              사전증여 합산 내역 (§47)
            </h3>
            <div className="flex flex-wrap gap-1 mt-1">
              <LawArticleModal legalBasis="상증법 §47" label="§47 증여세 과세가액" />
            </div>
          </div>
          <ul className="divide-y divide-border">
            {priorGifts.map((pg, i) => (
              <li
                key={`${pg.giftDate}-${i}`}
                className="px-4 py-2 flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {pg.giftDate} {pg.donor && `· ${GIFT_DONOR_LABELS[pg.donor]}`}
                  </span>
                  {pg.sourceCalculationId && (
                    <span
                      className="inline-flex items-center gap-0.5 text-micro bg-violet-100 text-violet-800 rounded px-1.5 py-0.5"
                      title="저장된 증여세 이력에서 자동 입력된 회차"
                    >
                      📋 이력
                    </span>
                  )}
                </div>
                <span className="font-medium">{formatKRW(pg.giftAmount)}</span>
              </li>
            ))}
          </ul>
        </div>
        </PrintSection>
      )}

      {/* 과세 요약(증여세) 화면 카드 제거 — 신고서 양식 표(filing-form-10)와 중복(사족).
          PDF 채널의 tax-summary 계산표는 ResultPdfDocument가 독립 렌더하므로 유지된다. */}

      {/* 2-스트림 분리과세 상세 (§30의5·§30의6) — 800줄 분할로 GiftTwoStreamDetailSection 추출 */}
      <GiftTwoStreamDetailSection result={result} />

      {/* 부담부증여 양도소득세 (소득세법 §88 · 소령 §159) */}
      {transferTaxError && (
        <div className="border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line">
          ⚠ {transferTaxError}
        </div>
      )}
      {transferTaxResults.length > 0 && (
        <PrintSection id="burdened-transfer-tax" selectedIds={selectedPrintIds}>
          <BurdenedTransferTaxResultCard transferTaxResults={transferTaxResults} />
        </PrintSection>
      )}

      {/* 주식 부담부증여 양도소득세 (소득세법 §88 · 소령 §159) */}
      {stockTransferTaxResults.length > 0 && (
        <PrintSection id="burdened-stock-transfer-tax" selectedIds={selectedPrintIds}>
          <BurdenedStockTransferTaxResultCard
            stockTransferTaxResults={stockTransferTaxResults}
          />
        </PrintSection>
      )}

      {/* 세부담 비교 — 단순증여 vs 부담부증여 (증여세 + 양도세). 양도세 성공 시에만 */}
      {simpleGiftResult != null &&
        (transferTaxResults.length > 0 || stockTransferTaxResults.length > 0) &&
        !transferTaxError && (
          <PrintSection id="burdened-gift-comparison" selectedIds={selectedPrintIds}>
            <BurdenedGiftComparisonCard
              simpleGiftResult={simpleGiftResult}
              giftResult={result}
              transferTaxResults={transferTaxResults}
              stockTransferTaxResults={stockTransferTaxResults}
              hasUncoveredDebtAsset={
                estateItems.filter((it) => (it.assumedDebtForGift ?? 0) > 0)
                  .length > transferTaxResults.length + stockTransferTaxResults.length
              }
            />
          </PrintSection>
        )}

      {/* §57① 단서 적용 — 세대생략 할증 배제 안내 (donorGroup=B이지만 단서로 할증 0인 경우)
          선택 출력: 할증 산출근거와 같은 gen-skip-surcharge 섹션으로 편입 (availablePrintIds 가드 동기화) */}
      {result.generationSkipProvisoApplied === true && (
        <PrintSection id="gen-skip-surcharge" selectedIds={selectedPrintIds}>
          <div className="border border-rose-200 rounded-xl bg-rose-50/30 px-4 py-3 text-sm text-rose-700">
            세대생략 할증과세 배제 (상증법 §57① 단서) — 증여자의 최근친 직계비속(부·모) 사망으로 인해
            세대생략 할증(30%·40%)이 적용되지 않습니다.
          </div>
        </PrintSection>
      )}

      {/* §57 세대생략 할증과세 산출근거 — 그룹 B 조부모→손자녀 시만 활성 */}
      {result.generationSkipSurchargeDetail && (
        <PrintSection id="gen-skip-surcharge" selectedIds={selectedPrintIds}>
        <GenerationSkipSurchargeBreakdownCard
          detail={result.generationSkipSurchargeDetail}
          computedTax={result.computedTax}
          priorAddedTaxBase={result.priorGiftCreditDetail?.priorAddedTaxBase}
          aggregatedTaxBase={result.priorGiftCreditDetail?.aggregatedTaxBase}
        />
        </PrintSection>
      )}

      {/* 세액공제 상세 — §28·§69 산출근거 펼침 (priorGiftCreditDetail + computedTax 전달) */}
      {result.totalTaxCredit > 0 && (
        <PrintSection id="tax-credit" selectedIds={selectedPrintIds}>
        <TaxCreditBreakdownCard
          credit={result.creditDetail}
          taxBeforeCredit={taxBeforeCredit}
          priorGiftCreditDetail={result.priorGiftCreditDetail}
          computedTax={result.computedTax}
        />
        </PrintSection>
      )}

      {/* 대납(代納) gross-up 상세 (§36) — applied 시에만 노출 */}
      {result.donorPaidTaxGrossUp?.applied && (
        <PrintSection id="donor-paid-grossup" selectedIds={selectedPrintIds}>
          <GiftDonorPaidGrossUpSection grossUp={result.donorPaidTaxGrossUp} />
        </PrintSection>
      )}

      {/* 조특법 §71 영농자녀 농지 감면 상세 — farmlandReductionDetail 있을 때만 */}
      {result.farmlandReductionDetail && (
        <PrintSection id="farmland-reduction" selectedIds={selectedPrintIds}>
          <FarmlandReductionCard
            detail={result.farmlandReductionDetail}
            computedTax={result.computedTax}
            priorTaxCredit={result.creditDetail.giftTaxCredit}
          />
        </PrintSection>
      )}

      {/* 연대납세의무 → gross-up 미적용 안내 */}
      {result.donorPaidTaxGrossUp?.reasonNotApplied === "joint_liability" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            증여자가 해당 증여의 연대납세의무자(§4의2⑥)이므로, 대납세액은 채무면제이익 증여로 보지 않아
            gross-up 계산이 적용되지 않았습니다.
          </p>
        </div>
      )}

{/* 증여재산 평가 산출근거 — 자산별 breakdown 펼침 (엔진 valuationResults.breakdown 렌더) */}
      {result.valuationResults.length > 0 && (
        <GiftValuationBasisCard
          valuationResults={result.valuationResults}
          estateItems={estateItems}
        />
      )}

      {/* 증여재산 및 평가명세서 (별지 제10호서식 부표 1) — A4 가로 양식, 카드 내부에서 가로 스크롤 */}
      <PrintSection id="valuation-form" selectedIds={selectedPrintIds}>
      <div className="border rounded-xl">
        <button
          type="button"
          onClick={() => setShowValuation((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium print:hidden"
        >
          <span>
            증여재산 및 평가명세서 (별지 제10호서식 부표 1) — {result.valuationResults.length}건
          </span>
          <span className={expandToggleClass("slate")} aria-hidden>{expandToggleLabel(showValuation)}</span>
        </button>
        {showValuation ? (
          <HorizontalScrollContainer hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기">
            <GiftTaxValuationFormTable
              valuationResults={result.valuationResults}
              estateItems={estateItems}
              grossGiftValue={result.grossGiftValue}
              exemptAmount={result.exemptAmount}
              aggregatedGiftValue={result.aggregatedGiftValue}
              debtAssumed={result.debtAssumed}
              donorPaidTax={result.donorPaidTaxGrossUp?.donorPaidTax}
              publicInterestExclusion={result.publicInterestExclusion}
              publicTrustExclusion={result.publicTrustExclusion}
              disabledTrustExclusion={result.disabledTrustExclusion}
              priorGifts={priorGifts.map((pg) => ({
                giftDate: pg.giftDate,
                giftAmount: pg.giftAmount,
                isHeir: false,
                giftTaxPaid: 0,
                propertyCategory: pg.propertyCategory,
                propertyName: pg.propertyName,
                propertyLocation: pg.propertyLocation,
              }))}
            />
          </HorizontalScrollContainer>
        ) : (
          <div className="hidden print:block print:p-0 print:overflow-visible">
            <GiftTaxValuationFormTable
              valuationResults={result.valuationResults}
              estateItems={estateItems}
              grossGiftValue={result.grossGiftValue}
              exemptAmount={result.exemptAmount}
              aggregatedGiftValue={result.aggregatedGiftValue}
              debtAssumed={result.debtAssumed}
              donorPaidTax={result.donorPaidTaxGrossUp?.donorPaidTax}
              publicInterestExclusion={result.publicInterestExclusion}
              publicTrustExclusion={result.publicTrustExclusion}
              disabledTrustExclusion={result.disabledTrustExclusion}
              priorGifts={priorGifts.map((pg) => ({
                giftDate: pg.giftDate,
                giftAmount: pg.giftAmount,
                isHeir: false,
                giftTaxPaid: 0,
                propertyCategory: pg.propertyCategory,
                propertyName: pg.propertyName,
                propertyLocation: pg.propertyLocation,
              }))}
            />
          </div>
        )}
      </div>
      </PrintSection>

      {/* 건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더) */}
      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ estateItems }} />
      </PrintSection>

      {/* 비상장주식 별지 부표3 출력 (정식평가 V2 자산, R-6) */}
      <PrintSection id="unlisted-stock-besshi" selectedIds={selectedPrintIds}>
        <UnlistedStockBesshiResultSection estateItems={estateItems} />
      </PrintSection>

      {/* 비상장주식 평가조서 (간편평가 — 보충적 평가 자산) */}
      <PrintSection id="unlisted-stock-simple" selectedIds={selectedPrintIds}>
        <UnlistedStockSimpleValuationSection estateItems={estateItems} />
      </PrintSection>

      {/* 상장주식 평가조서(갑·을) 출력 — §63①1가·§63②3호·§63③ */}
      <PrintSection id="listed-stock-besshi" selectedIds={selectedPrintIds}>
        <ListedStockBesshiResultSection
          estateItems={estateItems}
          valuationDate={giftDate}
        />
      </PrintSection>

      {/* 연부연납 안내 */}
      <PrintSection id="installment" selectedIds={selectedPrintIds}>
        <InstallmentGuide
          finalTax={result.finalTax}
          specialTreatmentSuccession={result.specialTreatmentType === "family_business"}
        />
      </PrintSection>

      {/* 분납 일정 (§70②) — 증여는 연부연납 입력 없음 (applyLongTermInstallment 생략) */}
      <PrintSection id="split-payment" selectedIds={selectedPrintIds}>
        <SplitPaymentCard
          finalTax={result.finalTax}
          filingDeadline={giftDueDates?.filing}
          installmentDueDate={giftDueDates?.installment}
          splitPaymentEnabled={splitPaymentEnabled}
          splitPaymentAmount={
            splitPaymentAmount ? parseAmount(splitPaymentAmount) : undefined
          }
        />
      </PrintSection>

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <PrintSection id="warnings" selectedIds={selectedPrintIds}>
        <div className="border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            주의 사항
          </h4>
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                ⚠️ {w}
              </li>
            ))}
          </ul>
        </div>
        </PrintSection>
      )}

      {/* 근거 조문 — 클릭 시 해당 조문 팝업 (파싱 실패 시 텍스트 배지 fallback) */}
      {result.appliedLaws.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.appliedLaws.map((law) => {
            const refs = parseLawRefsForModal(law);
            return refs.length > 0
              ? refs.map((r, i) => (
                  <LawArticleModal
                    key={`${law}-${i}`}
                    legalBasis={`${r.lawName} §${r.articleNum}`}
                    label={refs.length > 1 ? `§${r.articleNum}` : law}
                  />
                ))
              : <LawBadge key={law} law={law} />;
          })}
        </div>
      )}

      {/* 로그인 유도 */}
      {showLoginPrompt && <LoginPromptBanner />}

      {/* 면책고지 */}
      <DisclaimerBanner />

      {/* 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <NavButton
          direction="prev"
          label="뒤로 가기"
          onClick={onBack}
          aria-label="바로 앞 단계로 돌아가기"
        />
        <div className="flex items-center gap-2">
          <CtaButton tone="outline" onClick={onGoToFirst ?? onBack}>다시 계산</CtaButton>
          <CtaButton onClick={onReset}>처음으로</CtaButton>
          {onSave && <SaveButton variant="primary" onSave={handleSaveClick} />}
        </div>
      </div>
    </div>
  );
}
