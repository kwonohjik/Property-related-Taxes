"use client";

/**
 * GiftTaxResultView — 증여세 계산 결과 화면 (#37)
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { GiftTaxResult, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { GIFT_DONOR_LABELS } from "@/components/calc/prior-gift/meta";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { GenerationSkipSurchargeBreakdownCard } from "@/components/calc/results/GenerationSkipSurchargeBreakdownCard";
import { GiftTaxFilingFormTable } from "@/components/calc/results/GiftTaxFilingFormTable";
import { GiftTaxValuationFormTable } from "@/components/calc/results/GiftTaxValuationFormTable";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import { UnlistedStockSimpleValuationSection } from "@/components/calc/results/UnlistedStockSimpleValuationSection";
import { isSimpleModeUnlisted } from "@/lib/calc/unlisted-valuation-mode";
import { ListedStockBesshiResultSection } from "@/components/calc/results/ListedStockBesshiResultSection";
import { HorizontalScrollContainer } from "@/components/calc/shared/HorizontalScrollContainer";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";
import { isInstallmentSplitEligible } from "@/lib/tax-engine/credits/installment-split";
import { SplitPaymentCard } from "@/components/calc/results/installment/SplitPaymentCard";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { addMonths, format } from "date-fns";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { formatGiftSaveMessage } from "@/components/calc/gift-tax-save-handler";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { parseLawRefsForModal } from "@/lib/utils/law-url";
import {
  GIFT_PRINT_SECTIONS,
  type GiftPrintSectionId,
} from "@/lib/print/gift-print-sections";

// ============================================================
// 헬퍼 컴포넌트
// ============================================================

function Row({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={`font-mono text-sm ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function LawBadge({ law }: { law: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mr-1 mb-1">
      {law}
    </span>
  );
}

// ============================================================
// 연부연납 안내 (증여세는 5년, 일반)
// ============================================================

function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax, isFamilyBusiness: false });
  if (!result.eligible) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          연부연납 안내 (상증법 §71)
        </h4>
        <div className="flex flex-wrap gap-1 mt-1">
          <LawArticleModal legalBasis="상증법 §71" label="§71 연부연납" />
          <LawArticleModal legalBasis="상증법 §70" label="§70 분납" />
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          결정세액 2천만원 초과 시 최대 5년 분할납부 가능
        </p>
      </div>
      <div className="p-3 text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>허가 즉시 납부</span>
          <span className="font-medium">{formatKRW(result.initialPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span>연간 납부 원금 ({result.appliedYears}회)</span>
          <span className="font-medium">{formatKRW(result.annualPrincipal)}</span>
        </div>
        <p className="text-amber-600 dark:text-amber-400 mt-1">
          ※ 이자 상당액(연 1.8% 기준) 별도 납부 — 세무사 확인 권장
        </p>
        {/* 납세담보 */}
        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
          <p className="font-medium text-gray-700 dark:text-gray-200">납세담보 제공 (상증법 §71 ②)</p>
          <div className="flex justify-between">
            <span>현금·예금·보증보험</span>
            <span className="font-medium">세액의 110%</span>
          </div>
          <div className="flex justify-between">
            <span>기타 재산 (부동산·유가증권 등)</span>
            <span className="font-medium">세액의 120%</span>
          </div>
          <p className="text-amber-600 dark:text-amber-400">
            ※ 연부연납 허가 신청 시 납세담보를 함께 제공해야 함
          </p>
        </div>
      </div>
    </div>
  );
}

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
  savedId,
  splitPaymentEnabled = false,
  splitPaymentAmount = "",
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

  // 선택 항목 서버 PDF 다운로드 (PR-B1). savedId(로그인+저장) 있을 때만 활성.
  async function handlePrintPdf(pdfSections: string[]) {
    if (!savedId || pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/pdf/result/${savedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: pdfSections }),
      });
      if (!res.ok) throw new Error("PDF 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `증여세_계산결과_${savedId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
    if (result.valuationResults.length > 0) s.add("valuation-form");
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
    if (result.warnings.length > 0) s.add("warnings");
    return s;
  }, [result, estateItems, priorGifts]);

  // 분납기한 (§70② — 증여 신고기한 §68① 증여일+3개월 + 2개월). giftDate 없으면 undefined.
  const giftDueDates = useMemo(() => {
    if (!giftDate) return undefined;
    const base = new Date(giftDate);
    if (isNaN(base.getTime())) return undefined;
    const filing = addMonths(base, 3);
    const installment = addMonths(filing, 2);
    return {
      filing: format(filing, "yyyy-MM-dd"),
      installment: format(installment, "yyyy-MM-dd"),
    };
  }, [giftDate]);

  return (
    <div className="space-y-5">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={GIFT_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={!!savedId}
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
          <GiftTaxFilingFormTable result={result} />
        </PrintSection>
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
                      className="inline-flex items-center gap-0.5 text-[10px] bg-violet-100 text-violet-800 rounded px-1.5 py-0.5"
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

      {/* 과세 요약 */}
      <PrintSection id="tax-summary" selectedIds={selectedPrintIds}>
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">증여세 과세 요약</h3>
        </div>
        <div className="divide-y divide-border">
          <Row label="증여재산가액" value={formatKRW(result.grossGiftValue)} />
          {result.exemptAmount > 0 && (
            <Row
              label="비과세 차감"
              value={`- ${formatKRW(result.exemptAmount)}`}
              sub
              deduction
            />
          )}
          {(result.debtAssumed ?? 0) > 0 && (
            <Row
              label="부담부증여 채무인수 차감 (§47①)"
              value={`- ${formatKRW(result.debtAssumed ?? 0)}`}
              sub
              deduction
            />
          )}
          {result.aggregatedGiftValue > result.grossGiftValue && (
            <Row
              label="10년 합산 증여가액"
              value={formatKRW(result.aggregatedGiftValue)}
              highlight
            />
          )}
          <Row
            label="증여재산공제"
            value={`- ${formatKRW(result.totalDeduction)}`}
            sub
            deduction
          />
          {result.deductionDetail?.apportionment && (
            <div className="px-4 pb-1 text-xs text-sky-700 dark:text-sky-300">
              동시증여 안분 (상증령 §46①2호): {formatKRW(result.deductionDetail.apportionment.remainingLimit)} × {formatKRW(result.deductionDetail.apportionment.currentTaxableValue)} ÷ {formatKRW(result.deductionDetail.apportionment.denominator)} = {formatKRW(result.deductionDetail.apportionment.apportionedAmount)}
              {result.deductionDetail.apportionment.apportionedAmount !== result.deductionDetail.relationDeduction &&
                ` → 과세가액 한도 적용 ${formatKRW(result.deductionDetail.relationDeduction)}`}
              {!result.deductionDetail.apportionment.binding && " · 동시증여 합산이 한도 미만 → 각자 전액 공제"}
              {result.deductionDetail.apportionment.marriageBirthSkipped && " · 혼인·출산공제는 동시증여 안분 미지원(별도 신고)"}
            </div>
          )}
          {(result.appraisalFeeDeduction ?? 0) > 0 && (
            <Row
              label="감정평가수수료 공제"
              value={`- ${formatKRW(result.appraisalFeeDeduction ?? 0)}`}
              sub
              deduction
            />
          )}
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row label="산출세액 (누진세율)" value={formatKRW(result.computedTax)} />
          {result.generationSkipSurcharge > 0 && (
            <Row
              label="세대생략 할증 (30% / 40%)"
              value={`+ ${formatKRW(result.generationSkipSurcharge)}`}
            />
          )}
          {result.totalTaxCredit > 0 && (
            <Row
              label="세액공제"
              value={`- ${formatKRW(result.totalTaxCredit)}`}
              deduction
            />
          )}
          <Row label="결정세액" value={formatKRW(result.finalTax)} highlight />
        </div>
      </div>
      </PrintSection>

      {/* 2-스트림 분리과세 상세 — specialStreamTax 있을 때만 표시 */}
      {(result.specialStreamTax != null && result.specialStreamTax > 0) && (
        <div className="space-y-2">
          {/* 일반 스트림 */}
          {(result.ordinaryStreamTax != null && result.ordinaryStreamTax > 0) && (
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-muted/30 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  일반 증여 스트림 (§47·§53·§56)
                </h3>
                <div className="flex flex-wrap gap-1 mt-1">
                  <LawArticleModal legalBasis="상증법 §47" label="§47 과세가액" />
                  <LawArticleModal legalBasis="상증법 §53" label="§53 증여재산공제" />
                  <LawArticleModal legalBasis="상증법 §56" label="§56 세율" />
                </div>
              </div>
              <div className="divide-y divide-border">
                <Row label="일반 증여 산출세액" value={formatKRW(result.ordinaryStreamTax)} highlight />
              </div>
            </div>
          )}
          {(result.ordinaryStreamTax == null || result.ordinaryStreamTax === 0) && (
            <div className="border rounded-xl px-4 py-3 bg-muted/10">
              <p className="text-xs text-muted-foreground">일반 스트림 없음 (일반 증여재산 없음 또는 산출세액 0)</p>
            </div>
          )}

          {/* 특례 스트림 */}
          <div className="border border-emerald-200 rounded-xl overflow-hidden">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                조특법 과세특례 스트림 (§30의5·§30의6)
              </h3>
              <div className="flex flex-wrap gap-1 mt-1">
                <LawArticleModal legalBasis="조특법 §30의5" label="조특법 §30의5 창업자금" />
                <LawArticleModal legalBasis="조특법 §30의6" label="조특법 §30의6 가업승계" />
              </div>
            </div>
            <div className="divide-y divide-border">
              {(result.specialStreamDebt ?? 0) > 0 && (
                <Row
                  label="특례 자산 채무인수 차감 (§47①)"
                  value={`- ${formatKRW(result.specialStreamDebt ?? 0)}`}
                  sub
                  deduction
                />
              )}
              {(result.specialStreamAggregatedValue ?? 0) > 0 && (
                <Row
                  label="특례 스트림 합산 과세가액 (신규 + 기간무관 prior)"
                  value={formatKRW(result.specialStreamAggregatedValue ?? 0)}
                />
              )}
              <Row
                label="특례 스트림 세액 (10% 또는 20%)"
                value={formatKRW(result.specialStreamTax)}
                highlight
              />
              {/* §30의5⑫ §69 신고세액공제 배제 안내 */}
              {result.creditDetail?.specialTreatmentCredit === 0 && (
                <div className="px-4 py-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                  신고세액공제(§69) 배제 — §30의5⑫(§30의6⑤ 준용): 조특법 과세특례 선택 시 신고세액공제 미적용
                </div>
              )}
            </div>
          </div>

          {/* 최종 납부세액 합산 */}
          {(result.ordinaryStreamTax ?? 0) > 0 && (
            <div className="border border-gray-300 rounded-xl overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5">
                <h3 className="text-sm font-semibold">최종 납부세액 (일반 + 특례)</h3>
              </div>
              <div className="divide-y divide-border">
                <Row
                  label={`= 일반 ${formatKRW(result.ordinaryStreamTax ?? 0)} + 특례 ${formatKRW(result.specialStreamTax)}`}
                  value={formatKRW(result.finalTax)}
                  highlight
                />
              </div>
            </div>
          )}
        </div>
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
          <span>{showValuation ? "▲" : "▼"}</span>
        </button>
        {showValuation ? (
          <HorizontalScrollContainer hint="← → 좌우 스크롤 또는 thumb 드래그로 모든 컬럼 보기">
            <GiftTaxValuationFormTable
              valuationResults={result.valuationResults}
              estateItems={estateItems}
              grossGiftValue={result.grossGiftValue}
              exemptAmount={result.exemptAmount}
              aggregatedGiftValue={result.aggregatedGiftValue}
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
        <InstallmentGuide finalTax={result.finalTax} />
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
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1 rounded-md border border-border py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors"
          aria-label="바로 앞 단계로 돌아가기"
        >
          <ChevronLeft className="w-4 h-4" />
          뒤로 가기
        </button>
        <button
          type="button"
          onClick={onGoToFirst ?? onBack}
          className="flex-1 min-w-[120px] rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          다시 계산
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 min-w-[120px] rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          처음으로
        </button>
        {onSave && <SaveButton variant="primary" onSave={handleSaveClick} />}
      </div>
    </div>
  );
}
