"use client";

/**
 * StockTransferTaxResultView — 주식 양도소득세 결과 화면 (Step 4 / ⑦ 동기화 지점)
 *
 * 결과 산식 한국어 풀어쓰기 (feedback_result_view_korean_formula):
 *   - 변수 약어·floor() 금지
 *   - 법정 용어 우선 (산출세액·과세표준·양도소득금액)
 *   - 숫자 끝 "원" 단위 표기 금지 (feedback_no_won_suffix)
 *
 * appliedRules 배지 12종 tone 매핑 (디자인 §결과):
 *   rose: §94②우선, 단기30%
 *   fuchsia: 80%하한
 *   amber: 거래정지우회, 의제취득일적용
 *   emerald: KOTC비과세 2종
 *   sky: 기타자산우선§55누진, 기본공제부동산그룹합산
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { StockFilingFormTable } from "@/components/calc/stock-transfer/StockFilingFormTable";
import type { StockAggregateMeta } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import { StockTaxpayerHeaderCard } from "@/components/calc/stock-transfer/StockTaxpayerHeaderCard";
import { KiwoomFetchSourceBadge } from "@/components/calc/KiwoomFetchSourceBadge";
import { useEffect, useRef, useState, useMemo } from "react";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { clientRepository } from "@/lib/storage";
import { StockTransferPenaltySection } from "@/components/calc/results/StockTransferPenaltySection";
import { MarketSampleDetailCard } from "@/components/calc/results/MarketSampleDetailCard";
import { CapitalAdjustmentsTimelineCard } from "@/components/calc/results/CapitalAdjustmentsTimelineCard";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  STOCK_TRANSFER_PRINT_SECTIONS,
  type StockTransferPrintSectionId,
} from "@/lib/print/stock-transfer-print-sections";
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";
import { LotMatchingDetailCard } from "@/components/calc/results/LotMatchingDetailCard";
import { StockCarryoverComparisonCard } from "@/components/calc/results/StockCarryoverComparisonCard";
import { LotCapitalAdjustmentsCard } from "@/components/calc/results/LotCapitalAdjustmentsCard";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";
import { CaseFortyNineFormulaCard } from "@/components/calc/stock-transfer/CaseFortyNineFormulaCard";
import { SecuritiesTransactionTaxCard } from "@/components/calc/stock-transfer/SecuritiesTransactionTaxCard";
import { CrossEngine1045Notice } from "@/components/calc/shared/CrossEngine1045Notice";
import { Cross1045AdjustmentCard } from "@/components/calc/stock-transfer/Cross1045AdjustmentCard";
import {
  fmt,
  ResultRow,
  EstimatedValuationBreakdown,
  ProgressiveTaxBreakdown,
  RuleBadges,
  Warnings,
  UnsupportedItemsCard,
} from "@/components/calc/results/StockTransferTaxResultViewHelpers";

interface StockTransferTaxResultViewProps {
  result: StockTransferResult;
  shareCount: number;
  /** 신고 위반 여부 (가산세 게이트 — none이면 가산세 0) */
  filingViolation?: "none" | "under_report" | "non_report";
  /** 부정행위 여부 (가산세 라벨용 — result에 없어서 form에서 별도 전달) */
  isFraudulent?: boolean;
  /** 국제거래 여부 (부정행위와 결합 시 60% 분기) */
  isInternationalTransaction?: boolean;
  /** 양도가액 실가 입력 방식 (산식 카드용, default "per_share") */
  transferActualInputMode?: "per_share" | "total";
  /** 1주당 양도가액 (per_share 모드 산식 표시용, 원) */
  perShareTransferPrice?: number;
  /** 종목명 (TaxpayerHeaderCard + 신고서 헤더 표시용) */
  securityName?: string;
  /** 종목코드 (TaxpayerHeaderCard 표시용) */
  securityCode?: string;
  /** 증권사 (TaxpayerHeaderCard 표시용) */
  brokerage?: string;
  /** 대표 양도일 (TaxpayerHeaderCard 표시용) */
  transferDate?: string;
  /** 계좌번호 마스킹 (신고서 헤더 표시용, 디자인 §4.2) */
  accountNumberMasked?: string;
  /** F-12 키움 자동조회 출처 라벨 (마지막 자동조회 시각 ISO 8601) */
  kiwoomLastFetchedAt?: string;
  /** [GAP-2] 비상장 §165④ 평가 모드 — full 시 결과 헤더에 행-수준 계산 배지 표시 */
  unlistedValuationMode?: "simple" | "full";
  /** [사례 49] 취득시 장부분실 액면가 활성 시 결과 헤더에 배지 표시 */
  acqFaceValueOnly?: boolean;
  /**
   * 다종목 합산 결과 — 별지 제84호서식에 **종목별 열 + 합계 열**을 만든다.
   *
   * 없으면 서식이 단건(합계 열 1개)으로 렌더된다. 종목이 2건 이상인데 이걸 넘기지 않으면
   * 서식이 마지막 종목만 보여주어 **신고서가 실제 신고 내용과 달라진다**.
   */
  aggregate?: StockAggregateMeta;
}

// 분류 배지 라벨
const TAX_CATEGORY_LABEL: Record<StockTransferResult["taxCategory"], string> = {
  listed_major: "§94①3 가목 — 상장 대주주",
  listed_non_major_in_market: "§94①3 가목1) — 장내 비과세",
  listed_otc_non_major: "§94①3 가목2) — K-OTC 비대주주",
  listed_off_market_non_major: "§94①3 가목1) 본문 — 상장 비대주주 장외 과세",
  unlisted_major: "§94①3 나목 — 비상장 대주주",
  unlisted_non_major: "§94①3 나목 — 비상장 소액",
  kotc_sme_mid_exempt: "§94①3 나목 단서 — K-OTC 중소·중견 비과세",
  kotc_venture_exempt: "조특법 §14①7호 — K-OTC 벤처 비과세",
  other_asset_block_shareholder: "§94①4 다목 — 과점주주",
  other_asset_heavy_re: "§94①4 라목 — 부동산과다보유",
  other_asset_block_shareholder_nbl: "§94①4 다목 — 과점주주 (§104①9호 비사업용토지 과다소유법인)",
  other_asset_heavy_re_nbl: "§94①4 라목 — 부동산과다보유 (§104①9호 비사업용토지 과다소유법인)",
  out_of_scope_foreign: "§94①3 다목 — 해외주식 (별도 도메인)",
  foreign_stock: "§94①3 다목 — 해외주식 (§118② 준용 · 세율 §104①12호나목)",
  exit_tax: "국외전출세 (§118의9~§118의16)",
};

// 분류 배지 → legalBasis 매핑 (TAX_CATEGORY_LABEL은 법령명 없는 §라 별도 매핑). 13종 전수(Record 강제).
const CATEGORY_LAW_MAP: Record<StockTransferResult["taxCategory"], string> = {
  listed_major: "소득세법 §94①3 가목",
  listed_non_major_in_market: "소득세법 §94①3 가목",
  listed_otc_non_major: "소득세법 §94①3 가목",
  listed_off_market_non_major: "소득세법 §94①3 가목",
  unlisted_major: "소득세법 §94①3 나목",
  unlisted_non_major: "소득세법 §94①3 나목",
  kotc_sme_mid_exempt: "소득세법 §94①3 나목 단서",
  kotc_venture_exempt: "조세특례제한법 §14①7호",
  other_asset_block_shareholder: "소득세법 §94①4 다목",
  other_asset_heavy_re: "소득세법 §94①4 라목",
  // 세율 근거가 §104①9호로 갈리므로 법령근거도 그쪽을 가리킨다(분류 자체는 다목·라목 그대로).
  other_asset_block_shareholder_nbl: "소득세법 §104①9호",
  other_asset_heavy_re_nbl: "소득세법 §104①9호",
  out_of_scope_foreign: "소득세법 §94①3 다목",
  foreign_stock: "소득세법 §94①3 다목",
  exit_tax: "소득세법 §118의9",
};

/**
 * 양도가액 산식 카드 — per_share / total 분기 표시.
 * exchange 모드(transferPriceBreakdown 존재) 또는 split 모드는 표시 안 함.
 */
function TransferPriceFormulaCard({
  result,
  shareCount,
  transferActualInputMode,
  perShareTransferPrice,
}: {
  result: StockTransferResult;
  shareCount: number;
  transferActualInputMode: "per_share" | "total";
  perShareTransferPrice: number;
}) {
  // 교환·분할 모드는 별도 표시 — 본 카드 미렌더
  if (result.transferPriceBreakdown) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3 text-sm">
      <p className="font-semibold text-emerald-800 mb-1">양도가액 산식 (§96① 실지거래가액)</p>
      {transferActualInputMode === "total" ? (
        <>
          <p className="text-emerald-900">
            양도가액 합계 직접 입력 = <strong>{fmt(result.transferPrice)}</strong>
          </p>
          {shareCount > 0 && (() => {
            const exact = result.transferPrice % shareCount === 0;
            const reverse = result.transferPrice / shareCount;
            return (
              <p className="text-xs text-emerald-700 mt-1">
                참고: 역산 1주당 단가 = {exact ? reverse.toLocaleString() : reverse.toFixed(4)}
                {!exact && " (정확히 떨어지지 않음 — 계산에 미사용)"}
              </p>
            );
          })()}
        </>
      ) : (
        <p className="text-emerald-900">
          1주당 양도가액 {perShareTransferPrice.toLocaleString()} × {shareCount.toLocaleString()}주
          = <strong>{fmt(result.transferPrice)}</strong>
        </p>
      )}
    </div>
  );
}

export function StockTransferTaxResultView({
  result,
  shareCount,
  filingViolation,
  isFraudulent,
  isInternationalTransaction,
  transferActualInputMode = "per_share",
  perShareTransferPrice = 0,
  securityName = "",
  securityCode = "",
  brokerage = "",
  transferDate = "",
  accountNumberMasked = "",
  kiwoomLastFetchedAt,
  unlistedValuationMode = "simple",
  acqFaceValueOnly = false,
  aggregate,
}: StockTransferTaxResultViewProps) {
  const categoryLabel = TAX_CATEGORY_LABEL[result.taxCategory] ?? result.taxCategory;
  const categoryLegalBasis = CATEGORY_LAW_MAP[result.taxCategory] ?? "";

  // 신고서 양식 헤더용 양도인·과세연도 메타 (디자인 §4.2)
  // — StockTaxpayerHeaderCard와 동일한 데이터 소스를 사용하되 PDF 인쇄용 표 헤더에도 전달
  const { profile, mode } = useUserProfile();
  const { activeClientId } = useProfessionalStore();
  const [loadedClientName, setLoadedClientName] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    if (mode === "professional" && activeClientId) {
      clientRepository.get(activeClientId).then((c) => {
        if (mountedRef.current) setLoadedClientName(c?.name ?? null);
      });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [mode, activeClientId]);
  const clientNameResolved = (mode === "professional" && activeClientId) ? loadedClientName : null;
  const taxpayerName = clientNameResolved ?? profile?.displayName ?? "";
  const filingYear = (() => {
    if (!transferDate) return undefined;
    const d = new Date(transferDate);
    return isNaN(d.getTime()) ? undefined : d.getFullYear();
  })();
  const filingHeaderProps = {
    taxpayerName,
    stockName: securityName,
    stockCode: securityCode,
    brokerName: brokerage,
    accountNumber: accountNumberMasked,
    filingYear,
  };

  // 출력 항목 선택 (PR-F3) — 기존 printScoped("full"/"form-table") → PrintSelectionPanel 통일.
  // ⚠️ pdf 채널 0(ResultPdfDocument에 stock 섹션 부재) → onPrintPdf 미전달.
  //    "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)만 노출. 설계 §2.7.
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  // 현재 결과뷰에 실제 렌더되는 leaf id
  // 증권거래세 섹션은 stx 존재 시 가용 (totalTax > 0 || warning 게이트는 렌더 조건)
  const stx = result.securitiesTransactionTax;
  const hasStx = stx !== undefined && (stx.totalTax > 0 || Boolean(stx.warning));
  const availablePrintIds = useMemo<Set<StockTransferPrintSectionId>>(
    () => {
      const ids: StockTransferPrintSectionId[] = ["calculation", "detail-cards", "filing-form"];
      if (hasStx) ids.push("securities-transaction-tax");
      return new Set(ids);
    },
    [hasStx],
  );

  // 비과세 화면
  if (result.isExempt) {
    const exemptReasonLabel =
      result.exemptReason === "kotc_sme_mid"
        ? "K-OTC 중소·중견 소액주주 비과세 (§94①3 나목 단서)"
        : result.exemptReason === "kotc_venture"
          ? "K-OTC 벤처기업 소액주주 비과세 (조특법 §14①7호)"
          : result.exemptReason === "non_major_in_market"
            ? "상장주식 장내거래 비대주주 비과세 (§94①3 가목1))"
            : "비과세";

    return (
      <div className="space-y-6">
        {/* 출력 항목 선택 패널 (선택 항목만 인쇄 — 브라우저 PDF 저장) */}
        <PrintSelectionPanel
          allGroups={STOCK_TRANSFER_PRINT_SECTIONS}
          selectedIds={selectedPrintIds}
          availableIds={availablePrintIds}
          onChange={setSelectedPrintIds}
        />

        {/* ── 핵심 결과 (헤더·분류·산식·비과세 안내·정보용표) ── */}
        <PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-6">
        {/* 양도인 + 종목 헤더 카드 */}
        <StockTaxpayerHeaderCard
          securityName={securityName}
          securityCode={securityCode}
          brokerage={brokerage}
          transferDate={transferDate}
        />

        {/* 분류 배지 */}
        <div className="flex flex-wrap gap-2">
          {categoryLegalBasis ? (
            <LawArticleModal
              legalBasis={categoryLegalBasis}
              label={categoryLabel}
              className="px-3 py-1 rounded-full border text-sm bg-emerald-100 text-emerald-700 border-emerald-200 font-medium"
            />
          ) : (
            <span className="px-3 py-1 rounded-full border text-sm bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">
              {categoryLabel}
            </span>
          )}
        </div>

        {/* 양도가액 산식 (per_share / total 분기) */}
        <TransferPriceFormulaCard
          result={result}
          shareCount={shareCount}
          transferActualInputMode={transferActualInputMode}
          perShareTransferPrice={perShareTransferPrice}
        />

        {/* 비과세 안내 카드 */}
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-6 py-5">
          <p className="text-lg font-semibold text-emerald-800">비과세 (양도소득세 없음)</p>
          <p className="text-sm text-emerald-700 mt-2">{exemptReasonLabel}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-emerald-600">양도가액</span>
              <p className="font-semibold text-emerald-900">{fmt(result.transferPrice)}</p>
            </div>
            <div>
              <span className="text-emerald-600">최종 납부세액</span>
              <p className="font-semibold text-emerald-900">0</p>
            </div>
          </div>
        </div>

        {/* 정보용 전체 계산 결과 표 — 사용자가 입력한 데이터로 산출세액까지 모두 산정 */}
        <div className="rounded-xl border border-emerald-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            정보용 계산 결과 (비과세 적용 전 산식) — 입력 데이터 기반
          </div>
          <div className="divide-y divide-emerald-100">
            <ResultRow label="양도가액" value={result.transferPrice} />
            <ResultRow label={result.swapApplied ? "취득가액 (환산 — 차감 제외)" : "취득가액"} value={result.acquisitionPrice} />
            <ResultRow label="필요경비" value={result.expenses} />
            <ResultRow label="양도소득금액" value={result.transferIncome} highlight />
            <ResultRow label="기본공제" value={result.basicDeduction} />
            <ResultRow label="과세표준" value={result.taxBase} highlight />
            <ResultRow label="산출세액 (가상)" value={result.calculatedTax} highlight />
            <ResultRow label="지방소득세 (10%) — 비과세 미적용" value={result.localIncomeTax} />
          </div>
          <div className="bg-emerald-100 px-4 py-3 text-xs text-emerald-800">
            ※ §94①3 가목 1) 단서에 따라 위 산출세액은 면제 — 최종 납부세액 <strong>0</strong>.
            {" "}장외 거래·대주주 양도분이라면 산출세액 <strong>{fmt(result.calculatedTax)}</strong>이 그대로 부과됩니다.
          </div>
        </div>
        </PrintSection>

        {/* ── 상세 분해·판정 (대주주·취득후상장) ── */}
        <PrintSection id="detail-cards" selectedIds={selectedPrintIds} className="space-y-6">
        {/* 대주주 판정 카드 (상장 3시장만 — 비상장·기타자산 자동 미렌더) */}
        <MajorShareholderResultCard result={result} />

        {/* 취득 후 상장 환산 산식 카드 (정보용 — postListingDetail 있을 때) */}
        <PostListingDetailCard result={result} />
        </PrintSection>

        {/* ── 증권거래세 (정보용) — 양도소득세와 별도 납부 ── */}
        {hasStx && stx && (
          <PrintSection id="securities-transaction-tax" selectedIds={selectedPrintIds}>
            <SecuritiesTransactionTaxCard
              variant="result"
              stx={stx}
              transferPrice={result.transferPrice}
            />
          </PrintSection>
        )}

        {/* ── 신고서 양식 표 (32행 고정 — 비과세 시에도 렌더) ── */}
        <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
        <StockFilingFormTable result={result} aggregate={aggregate} {...filingHeaderProps} />
        </PrintSection>

        {/* appliedRules 배지 (항상 인쇄) */}
        <RuleBadges appliedRules={result.appliedRules} />

        {/* 경고 (항상 인쇄) */}
        <Warnings warnings={result.warnings} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄 — 브라우저 PDF 저장) */}
      <PrintSelectionPanel
        allGroups={STOCK_TRANSFER_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
      />

      {/* ── 핵심 결과 (헤더·키움배지·분류·결과표·양도가액 산식) ── */}
      <PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-6">
      {/* 양도인 + 종목 헤더 카드 */}
      <StockTaxpayerHeaderCard
        securityName={securityName}
        securityCode={securityCode}
        brokerage={brokerage}
        transferDate={transferDate}
      />

      {/* F-12 키움 자동조회 출처 라벨 */}
      <KiwoomFetchSourceBadge fetchedAt={kiwoomLastFetchedAt} />

      {/* 분류 배지 */}
      <div className="flex flex-wrap gap-2">
        {categoryLegalBasis ? (
          <LawArticleModal
            legalBasis={categoryLegalBasis}
            label={categoryLabel}
            className="px-3 py-1 rounded-full border text-sm bg-sky-100 text-sky-700 border-sky-200 font-medium"
          />
        ) : (
          <span className="px-3 py-1 rounded-full border text-sm bg-sky-100 text-sky-700 border-sky-200 font-medium">
            {categoryLabel}
          </span>
        )}
        <span className="px-3 py-1 rounded-full border text-sm bg-slate-100 text-slate-600 border-slate-200">
          적용 조문: {result.appliedSection94}
        </span>
        {/* [GAP-2] 비상장 §165④ full 모드 — 행-수준 계산 적용 배지 */}
        {unlistedValuationMode === "full" && (
          <span className="px-3 py-1 rounded-full border text-sm bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200">
            행-수준 계산 적용 (상증령 §54·§55)
          </span>
        )}
        {/* [사례 49] 취득시 장부분실 액면가 배지 */}
        {acqFaceValueOnly && (
          <span
            data-testid="acq-face-value-badge"
            className="px-3 py-1 rounded-full border text-sm bg-amber-50 text-amber-700 border-amber-200"
          >
            취득 액면가 적용 (§99①4 후단)
          </span>
        )}
      </div>

      {/* 8항목 결과 표 */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">계산 결과</div>
        <div className="divide-y divide-slate-100">
          <ResultRow label="양도가액" value={result.transferPrice} />
          <ResultRow label={result.swapApplied ? "취득가액 (환산 — 차감 제외)" : "취득가액"} value={result.acquisitionPrice} />
          <ResultRow label="필요경비" value={result.expenses} />
          <ResultRow label="양도소득금액" value={result.transferIncome} highlight />
          <ResultRow label="기본공제" value={result.basicDeduction} />
          <ResultRow label="과세표준" value={result.taxBase} highlight />
          <ResultRow label="산출세액" value={result.calculatedTax} highlight />
          <ResultRow label="지방소득세 (10%)" value={result.localIncomeTax} />
        </div>
        <div className="bg-sky-50 px-4 py-3 border-t border-sky-200">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-sky-800">총 납부세액 (양도세 + 지방세)</span>
            <span className="text-base font-bold text-sky-900">
              {fmt(result.finalTax + result.localIncomeTax)}
            </span>
          </div>
        </div>
      </div>

      {/* 양도가액 산식 (per_share / total 분기) */}
      <TransferPriceFormulaCard
        result={result}
        shareCount={shareCount}
        transferActualInputMode={transferActualInputMode}
        perShareTransferPrice={perShareTransferPrice}
      />
      </PrintSection>

      {/* ── 상세 분해·판정 (환산·누진·매매·자본·가산세·보유기간·로트·취득후상장·사례49·대주주) ── */}
      <PrintSection id="detail-cards" selectedIds={selectedPrintIds} className="space-y-6">
      {/* 환산 취득가 분해 (사례 48) */}
      {result.usedEstimatedAcquisition && result.valuationDetail && (
        <EstimatedValuationBreakdown result={result} shareCount={shareCount} />
      )}

      {/* 누진세율 분해 */}
      {result.progressiveDeduction !== undefined && result.progressiveDeduction > 0 && (
        <ProgressiveTaxBreakdown result={result} />
      )}

      {/* R-1' 매매사례가액 detail */}
      {result.marketSampleDetail && (
        <MarketSampleDetailCard detail={result.marketSampleDetail} shareCount={shareCount} />
      )}

      {/* R-2 자본조정 시계열 */}
      {result.capitalAdjustmentsDetail && (
        <CapitalAdjustmentsTimelineCard detail={result.capitalAdjustmentsDetail} />
      )}

      {/* 가산세·공제 상세 + 분기 안내 */}
      <StockTransferPenaltySection
        result={result}
        filingViolation={filingViolation}
        isFraudulent={isFraudulent}
        isInternationalTransaction={isInternationalTransaction}
      />

      {/* appliedRules 배지 */}
      <RuleBadges appliedRules={result.appliedRules} />

      {/* 보유기간 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        <span>보유기간: </span>
        <strong>
          {Math.floor(result.holdingPeriodMonths / 12)}년{" "}
          {result.holdingPeriodMonths % 12}개월 ({result.holdingPeriodDays}일)
        </strong>
        {result.isShortTermHolding && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 text-xs">단기보유</span>
        )}
        {result.lotMatchingDetail && (
          <p className="text-xs text-slate-500 mt-1">
            ※ 분할 매수 시 sub-lot별 보유기간 상세는 아래 로트별 매칭 카드 참조
          </p>
        )}
      </div>

      {/* §97의2① 이월과세 적용/미적용 비교 (carryover_gift 종목 또는 이월과세 lot 보유 시) */}
      {result.carryoverDetail && (
        <StockCarryoverComparisonCard detail={result.carryoverDetail} />
      )}

      {/* 분할 매수·분할 양도 매칭 상세 (split 모드만) */}
      {result.lotMatchingDetail && <LotMatchingDetailCard detail={result.lotMatchingDetail} />}

      {/* [A-2] lot별 자본조정 희석 상세 (split/다건 + capitalAdjustments) */}
      {result.lotCapitalAdjustmentsDetail && (
        <LotCapitalAdjustmentsCard detail={result.lotCapitalAdjustmentsDetail} />
      )}

      {/* 취득 후 상장 환산 상세 — Phase H ⑦ + P2 G-03 분리 */}
      <PostListingDetailCard result={result} />

      {/* [사례 49] 산식 풀어쓰기 카드 — valuationDetail.method === "acq_face_value_only" 시 노출
       *  [GAP-D] valuationDetail에 부가 필드 직접 노출되어 역산 불필요 */}
      {acqFaceValueOnly && result.valuationDetail?.method === "acq_face_value_only" && (
        <CaseFortyNineFormulaCard
          transferPrice={result.transferPrice}
          acqFaceValuePerShare={result.valuationDetail.acqFaceValuePerShare ?? 0}
          shareCount={shareCount}
          niPerShare={result.valuationDetail.niPerShare ?? 0}
          naPerShare={result.valuationDetail.naPerShare ?? 0}
          isHeavyRE={result.valuationDetail.isHeavyRE === true}
          isNetAssetOnly={Boolean(result.valuationDetail.netAssetOnlyReason)}
          weighted={result.valuationDetail.weightedAvgPerShare ?? 0}
          transferStdPriceAfterFloor={result.valuationDetail.finalPerShareValue}
          floor80Applied={result.valuationDetail.netAssetFloorApplied}
          acquisitionStdPriceTotal={result.valuationDetail.acquisitionStdPriceTotal ?? 0}
          acquisitionPrice={result.acquisitionPrice}
          expenses={result.expenses}
        />
      )}

      {/* 대주주 판정 카드 (상장 3시장만 — 비상장·기타자산 자동 미렌더) */}
      <MajorShareholderResultCard result={result} />
      </PrintSection>

      {/* ── 증권거래세 (정보용) — 양도소득세와 별도 납부 ── */}
      {hasStx && stx && (
        <PrintSection id="securities-transaction-tax" selectedIds={selectedPrintIds}>
          <SecuritiesTransactionTaxCard
            variant="result"
            stx={stx}
            transferPrice={result.transferPrice}
          />
        </PrintSection>
      )}

      {/* ── 신고서 양식 표 (32행 고정) ── */}
      <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
      <StockFilingFormTable result={result} aggregate={aggregate} {...filingHeaderProps} />
      </PrintSection>

      {/* 현재 미지원 항목 고지 — 종전 개발용 PR 로드맵 카드를 대체한다 */}
      <UnsupportedItemsCard />

      {/* §104⑤ 8호·9호 의제 조정액 — 부동산 8호 과세표준이 입력된 9호 종목에서만 (C-2 / 2-3′) */}
      {result.cross1045Adjustment && (
        <Cross1045AdjustmentCard detail={result.cross1045Adjustment} />
      )}

      {/* §104⑤ 크로스 엔진 고지 — 기타자산(§94①4호)일 때만 (계획서 C-1).
          조정액 카드가 뜨면 그쪽이 더 구체적이므로 일반 고지는 접는다. */}
      {result.basicDeductionGroup === "real_estate_and_other_asset" &&
        !result.cross1045Adjustment && <CrossEngine1045Notice from="other_asset" />}

      {/* 경고 (항상 인쇄) */}
      <Warnings warnings={result.warnings} />
    </div>
  );
}

// ── 대주주 판정 카드 ──

/**
 * 대주주 판정 여부 — exact 비교 필수.
 * substring 매칭 `includes("major")` 절대 금지:
 * "listed_non_major_in_market"·"listed_otc_non_major"·"unlisted_non_major" 가 모두 "major" 포함.
 */
function isMajorTaxCategory(c: StockTransferResult["taxCategory"]): boolean {
  return c === "listed_major" || c === "unlisted_major";
}

// Phase B 신설 (2026-05-19) — appliedThreshold.ruleSource 라벨 매핑
const RULE_SOURCE_LABEL: Record<NonNullable<NonNullable<StockTransferResult["appliedThreshold"]>["ruleSource"]>, string> = {
  "§157": "소득세법 시행령 §157 (상장)",
  "§167의8①2호": "소득세법 시행령 §167의8①2호 (비상장)",
  "§167의8①2호_벤처": "소득세법 시행령 §167의8①2호 나목 단서 (비상장 벤처)",
};

// F-09/F-10/F-14/F-23 신설 (2026-05-19) — judgmentBasis 라벨 매핑
const JUDGMENT_BASIS_LABEL: Record<NonNullable<NonNullable<StockTransferResult["appliedThreshold"]>["judgmentBasis"]>, string> = {
  default: "직전사업연도 종료일 (통상)",
  merger: "합병등기일 기준 (피합병법인 — 2010 소령 157⑧)",
  split: "분할등기일 기준 (분할 전 법인)",
  split_new_entity: "분할 전 직전사업연도 종료일 (분할신설법인)",
  incorporation: "설립등기일 기준 (신설법인 — 소령 157④)",
};

function MajorShareholderResultCard({
  result,
}: {
  result: StockTransferResult;
}) {
  const t = result.appliedThreshold;
  if (!t) return null; // 기타자산(other_asset) 자동 가드

  // 비상장은 §167의8①2호, 상장은 §157④. Phase B — 벤처 분기 시 §167의8①2호 나목 단서
  const lawRef = t.isVentureRule
    ? "§167의8①2호 나목 단서"
    : t.marketType === "unlisted"
      ? "§167의8①2호"
      : "§157④";
  const isUnlisted = t.marketType === "unlisted";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
      <h4 className="text-sm font-semibold text-violet-900 flex flex-wrap items-center gap-2">
        대주주 판정 ({lawRef})
        {/* Phase B (2026-05-19) — 비상장 벤처기업 임계 적용 배지 */}
        {t.isVentureRule && (
          <span className="inline-flex items-center rounded-full bg-violet-200 px-2 py-0.5 text-micro font-bold text-violet-900">
            비상장 벤처기업 임계 적용 (시총 40억)
          </span>
        )}
        {/* F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 적용 배지 */}
        {t.shareAugmentationApplied && (
          <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-micro font-bold text-amber-900">
            대차·사모펀드 자동 가산 ({t.augmentedShares?.toLocaleString() ?? 0}주)
          </span>
        )}
        {/* F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 배지 */}
        {t.judgmentBasis && t.judgmentBasis !== "default" && (
          <span className="inline-flex items-center rounded-full bg-rose-200 px-2 py-0.5 text-micro font-bold text-rose-900">
            특수 판정 기준일 적용
          </span>
        )}
        {/* F-24 (2026-05-19) — 본인 미보유 강제 합산 배지 */}
        {t.forcedCombinedJudgment && (
          <span className="inline-flex items-center rounded-full bg-sky-200 px-2 py-0.5 text-micro font-bold text-sky-900">
            본인 미보유 → 특수관계인 합산 강제
          </span>
        )}
      </h4>
      <dl className="text-sm text-violet-800 space-y-1">
        <div>· 시장: <strong>{MARKET_LABEL[t.marketType]}</strong></div>
        <div>· 판정 기준일: {t.priorYearEndDate}</div>
        <div>· 임계 적용 시작: {t.fromDate}</div>
        <div>· 지분율 기준: <strong>{(t.shareRatio * 100).toFixed(1)}%</strong></div>
        {t.marketCap < Infinity && (
          <div>· 시총 기준: <strong>{t.marketCap.toLocaleString()}</strong></div>
        )}
        {/* Phase B (2026-05-19) — 적용 규칙 출처 명시 */}
        {t.ruleSource && (
          <div className="text-xs text-violet-600">
            · 적용 규칙: {RULE_SOURCE_LABEL[t.ruleSource]}
          </div>
        )}
        {/* F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 사유 명시 */}
        {t.judgmentBasis && t.judgmentBasis !== "default" && (
          <div className="text-xs text-rose-700 font-medium">
            · 판정 기준일 사유: {JUDGMENT_BASIS_LABEL[t.judgmentBasis]}
          </div>
        )}
        {/* F-24 (2026-05-19) — 본인 미보유 강제 합산 안내 */}
        {t.forcedCombinedJudgment && (
          <div className="text-xs text-sky-700 font-medium">
            · 직전사업연도 종료일 본인 미보유 → 특수관계 기타주주 합산하여 판정 (기획재정부 금융세제-327, 2020.12.10.)
          </div>
        )}
        <div className="pt-1 font-medium">
          판정:{" "}
          <strong>{isMajorTaxCategory(result.taxCategory) ? "대주주 해당" : "비대주주"}</strong>
        </div>
        {/* 비상장 벤처 미적용 시 안내 */}
        {isUnlisted && !t.isVentureRule && (
          <div className="text-xs text-violet-600 mt-1">
            ※ 벤처기업 주식의 시총 기준은 40억원 (§167의8①2호 나목 단서). 회사 분류에서 &quot;벤처기업&quot; 선택 시 자동 적용
          </div>
        )}
        {/* 상장 비과세 사유 표시 */}
        {result.isExempt && !isUnlisted && (
          <div className="text-xs text-violet-600 mt-1">→ 비과세 (§94①3 가목 단서)</div>
        )}
      </dl>
    </div>
  );
}

// 서브 컴포넌트는 StockTransferTaxResultViewHelpers.tsx 로 분리됨 (800줄 정책)
