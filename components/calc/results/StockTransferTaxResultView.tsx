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
import { StockFilingFormTable } from "@/components/calc/stock-transfer/StockFilingFormTable";
import { StockTaxpayerHeaderCard } from "@/components/calc/stock-transfer/StockTaxpayerHeaderCard";
import { useEffect, useRef, useState } from "react";
import { useUserProfile } from "@/lib/storage/use-user-profile";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { clientRepository } from "@/lib/storage";
import { StockTransferPenaltySection } from "@/components/calc/results/StockTransferPenaltySection";
import { printScoped } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";
import { LotMatchingDetailCard } from "@/components/calc/results/LotMatchingDetailCard";
import { PostListingDetailCard } from "@/components/calc/results/PostListingDetailCard";
import { CaseFortyNineFormulaCard } from "@/components/calc/stock-transfer/CaseFortyNineFormulaCard";

interface StockTransferTaxResultViewProps {
  result: StockTransferResult;
  shareCount: number;
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
  /** [GAP-2] 비상장 §165④ 평가 모드 — full 시 결과 헤더에 행-수준 계산 배지 표시 */
  unlistedValuationMode?: "simple" | "full";
  /** [사례 49] 취득시 장부분실 액면가 활성 시 결과 헤더에 배지 표시 */
  acqFaceValueOnly?: boolean;
}

/** PDF 다운로드 버튼 — 브라우저 인쇄 다이얼로그에서 "PDF로 저장" 선택 */
function PdfActions() {
  return (
    <div className="print:hidden flex flex-wrap gap-2 justify-end">
      <button
        type="button"
        onClick={() => printScoped("full")}
        className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
        title="결과 화면 전체를 PDF로 저장 (브라우저 인쇄 다이얼로그 → PDF로 저장 선택)"
      >
        🧾 전체 PDF 다운로드
      </button>
      <button
        type="button"
        onClick={() => printScoped("form-table")}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        title="32행 신고서 양식만 PDF로 저장"
      >
        📄 신고서 양식만 PDF
      </button>
    </div>
  );
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
  out_of_scope_foreign: "§94①3 다목 — 해외주식 (별도 도메인)",
};

// appliedRules 배지 스타일
const RULE_BADGE: Record<string, string> = {
  "§94②우선": "bg-rose-100 text-rose-700 border-rose-200",
  "80%하한": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "80%하한미적용": "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200",
  "단기30%": "bg-rose-100 text-rose-700 border-rose-200",
  "거래정지우회": "bg-amber-100 text-amber-700 border-amber-200",
  "KOTC중소중견비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "KOTC벤처비과세": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "월할가산": "bg-sky-100 text-sky-700 border-sky-200",
  "의제취득일적용": "bg-amber-100 text-amber-700 border-amber-200",
  "장부분실액면가": "bg-amber-100 text-amber-700 border-amber-200",
  "기타자산우선§55누진": "bg-sky-100 text-sky-700 border-sky-200",
  "기본공제부동산그룹합산": "bg-sky-100 text-sky-700 border-sky-200",
  "로트개별법": "bg-violet-100 text-violet-700 border-violet-200",
  "로트선입선출": "bg-violet-100 text-violet-700 border-violet-200",
  "로트이동평균": "bg-violet-100 text-violet-700 border-violet-200",
};

function fmt(n: number): string {
  return n.toLocaleString();
}

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
  isFraudulent,
  isInternationalTransaction,
  transferActualInputMode = "per_share",
  perShareTransferPrice = 0,
  securityName = "",
  securityCode = "",
  brokerage = "",
  transferDate = "",
  accountNumberMasked = "",
  unlistedValuationMode = "simple",
  acqFaceValueOnly = false,
}: StockTransferTaxResultViewProps) {
  const categoryLabel = TAX_CATEGORY_LABEL[result.taxCategory] ?? result.taxCategory;

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
      <div data-print-section="full" className="space-y-6">
        {/* 양도인 + 종목 헤더 카드 */}
        <StockTaxpayerHeaderCard
          securityName={securityName}
          securityCode={securityCode}
          brokerage={brokerage}
          transferDate={transferDate}
        />

        {/* PDF 다운로드 버튼 */}
        <PdfActions />

        {/* 분류 배지 */}
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 rounded-full border text-sm bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">
            {categoryLabel}
          </span>
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
            <ResultRow label="취득가액" value={result.acquisitionPrice} />
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

        {/* 대주주 판정 카드 (상장 3시장만 — 비상장·기타자산 자동 미렌더) */}
        <MajorShareholderResultCard result={result} />

        {/* 취득 후 상장 환산 산식 카드 (정보용 — postListingDetail 있을 때) */}
        <PostListingDetailCard result={result} />

        {/* 신고서 양식 표 (32행 고정 — 비과세 시에도 렌더) */}
        <StockFilingFormTable result={result} onPrint={() => printScoped("form-table")} {...filingHeaderProps} />

        {/* appliedRules 배지 */}
        <RuleBadges appliedRules={result.appliedRules} />

        {/* 경고 */}
        <Warnings warnings={result.warnings} />
      </div>
    );
  }

  return (
    <div data-print-section="full" className="space-y-6">
      {/* 양도인 + 종목 헤더 카드 */}
      <StockTaxpayerHeaderCard
        securityName={securityName}
        securityCode={securityCode}
        brokerage={brokerage}
        transferDate={transferDate}
      />

      {/* PDF 다운로드 버튼 */}
      <PdfActions />

      {/* 분류 배지 */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1 rounded-full border text-sm bg-sky-100 text-sky-700 border-sky-200 font-medium">
          {categoryLabel}
        </span>
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
          <ResultRow label="취득가액" value={result.acquisitionPrice} />
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

      {/* 환산 취득가 분해 (사례 48) */}
      {result.usedEstimatedAcquisition && result.valuationDetail && (
        <EstimatedValuationBreakdown result={result} shareCount={shareCount} />
      )}

      {/* 누진세율 분해 */}
      {result.progressiveDeduction !== undefined && result.progressiveDeduction > 0 && (
        <ProgressiveTaxBreakdown result={result} />
      )}

      {/* 가산세·공제 상세 + 분기 안내 */}
      <StockTransferPenaltySection
        result={result}
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

      {/* 분할 매수·분할 양도 매칭 상세 (split 모드만) */}
      {result.lotMatchingDetail && <LotMatchingDetailCard detail={result.lotMatchingDetail} />}

      {/* 취득 후 상장 환산 상세 — Phase H ⑦ + P2 G-03 분리 */}
      <PostListingDetailCard result={result} />

      {/* [사례 49] 산식 풀어쓰기 카드 — valuationDetail.method === "acq_face_value_only" 시 노출 */}
      {acqFaceValueOnly && result.valuationDetail?.method === "acq_face_value_only" && (
        <CaseFortyNineFormulaCard
          transferPrice={result.transferPrice}
          // 액면가는 result에 별도 노출 안 됨 — 취득기준시가 / 주식수로 역산 (정수 안전)
          acqFaceValuePerShare={shareCount > 0 ? Math.floor((result.acquisitionPrice * result.valuationDetail.finalPerShareValue) / result.transferPrice) : 0}
          shareCount={shareCount}
          niPerShare={0 /* result 노출 누락 — GAP-D 후속 PR */}
          naPerShare={0}
          isHeavyRE={false}
          isNetAssetOnly={false}
          weighted={result.valuationDetail.weightedAvgPerShare ?? 0}
          transferStdPriceAfterFloor={result.valuationDetail.finalPerShareValue}
          floor80Applied={result.valuationDetail.netAssetFloorApplied}
          acquisitionStdPriceTotal={
            result.transferPrice > 0
              ? Math.floor((result.acquisitionPrice * result.valuationDetail.finalPerShareValue * shareCount) / result.transferPrice)
              : 0
          }
          acquisitionPrice={result.acquisitionPrice}
          expenses={result.expenses}
        />
      )}

      {/* 대주주 판정 카드 (상장 3시장만 — 비상장·기타자산 자동 미렌더) */}
      <MajorShareholderResultCard result={result} />

      {/* 신고서 양식 표 (32행 고정) */}
      <StockFilingFormTable result={result} onPrint={() => printScoped("form-table")} {...filingHeaderProps} />

      {/* PR 로드맵 카드 */}
      <PrRoadmapCard />

      {/* 경고 */}
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

function MajorShareholderResultCard({
  result,
}: {
  result: StockTransferResult;
}) {
  const t = result.appliedThreshold;
  if (!t) return null; // 기타자산(other_asset) 자동 가드

  // 비상장은 §167의8①2호, 상장은 §157④
  const lawRef = t.marketType === "unlisted" ? "§167의8①2호" : "§157④";
  const isUnlisted = t.marketType === "unlisted";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
      <h4 className="text-sm font-semibold text-violet-900">
        대주주 판정 ({lawRef})
      </h4>
      <dl className="text-sm text-violet-800 space-y-1">
        <div>· 시장: <strong>{MARKET_LABEL[t.marketType]}</strong></div>
        <div>· 판정 기준일: {t.priorYearEndDate}</div>
        <div>· 임계 적용 시작: {t.fromDate}</div>
        <div>· 지분율 임계: <strong>{(t.shareRatio * 100).toFixed(1)}%</strong></div>
        {t.marketCap < Infinity && (
          <div>· 시총 임계: <strong>{t.marketCap.toLocaleString()}</strong></div>
        )}
        <div className="pt-1 font-medium">
          판정:{" "}
          <strong>{isMajorTaxCategory(result.taxCategory) ? "대주주 해당" : "비대주주"}</strong>
        </div>
        {/* 비상장 벤처기업 시총 임계 안내 */}
        {isUnlisted && (
          <div className="text-xs text-violet-600 mt-1">
            ※ 벤처기업 주식의 시총 임계는 40억원 (§167의8①2나목 단서)
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

// ── 서브 컴포넌트 ──

function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-4 py-3 ${
        highlight ? "bg-white" : ""
      }`}
    >
      <span className={`text-sm ${highlight ? "font-medium text-slate-700" : "text-slate-500"}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight ? "font-semibold text-slate-900" : "text-slate-700"
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function EstimatedValuationBreakdown({
  result,
  shareCount,
}: {
  result: StockTransferResult;
  shareCount: number;
}) {
  const detail = result.valuationDetail;
  if (!detail) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-amber-800 text-sm">환산취득가 산식 분해 (소령 §165⑤)</p>
      <div className="space-y-1 text-xs text-amber-700 font-mono">
        {detail.method === "post_listing_conversion" && detail.weightedAvgPerShare !== undefined && (
          <>
            <p>1주당 취득기준시가 = {fmt(detail.finalPerShareValue)}</p>
            <p>
              취득가액 = {fmt(detail.finalPerShareValue)} × {shareCount.toLocaleString()}주 ={" "}
              <strong>{fmt(result.acquisitionPrice)}</strong>
            </p>
          </>
        )}
        {result.estimatedBase !== undefined && (
          <p>
            취득기준시가 합계 (개산공제 전) = {fmt(result.estimatedBase)}
          </p>
        )}
        {result.estimatedDeduction !== undefined && result.estimatedDeduction > 0 && (
          <p>
            개산공제 (취득기준시가 × 1%) = {fmt(result.estimatedDeduction)}
          </p>
        )}
        {detail.netAssetFloorApplied && detail.netAssetFloorValue !== undefined && (
          <p className="text-fuchsia-600 font-semibold">
            80% 하한 발동: 가중평균 &lt; 순자산 × 80% → max(가중평균, {fmt(detail.netAssetFloorValue)})
          </p>
        )}
      </div>
    </div>
  );
}

function ProgressiveTaxBreakdown({ result }: { result: StockTransferResult }) {
  const taxBase = result.taxBase;
  const THRESHOLD = 300_000_000; // 3억

  const lowerPart = Math.min(taxBase, THRESHOLD);
  const upperPart = Math.max(0, taxBase - THRESHOLD);

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-4 space-y-2">
      <p className="font-semibold text-sky-800 text-sm">누진세율 산식 분해 (§104①11 가목 2)</p>
      <div className="space-y-1 text-xs text-sky-700">
        {upperPart > 0 ? (
          <>
            <p>3억 이하 분: {fmt(lowerPart)} × 20% = {fmt(Math.floor(lowerPart * 0.2))}</p>
            <p>3억 초과 분: {fmt(upperPart)} × 25% = {fmt(Math.floor(upperPart * 0.25))}</p>
            <p>
              산출세액 (누진공제식): 과세표준 {fmt(taxBase)} × 25% − 누진공제 {fmt(result.progressiveDeduction!)} ={" "}
              <strong>{fmt(result.calculatedTax)}</strong>
            </p>
          </>
        ) : (
          <p>
            산출세액: 과세표준 {fmt(taxBase)} × {(result.appliedRate * 100).toFixed(0)}% ={" "}
            <strong>{fmt(result.calculatedTax)}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

function RuleBadges({ appliedRules }: { appliedRules: StockTransferResult["appliedRules"] }) {
  if (!appliedRules || appliedRules.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {appliedRules.map((rule) => (
        <span
          key={rule}
          className={`px-2 py-0.5 rounded border text-xs font-medium ${
            RULE_BADGE[rule] ?? "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {rule}
        </span>
      ))}
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1">
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-700">⚠ {w}</p>
      ))}
    </div>
  );
}

function PrRoadmapCard() {
  const stages = [
    { label: "PR-1", desc: "상장 대주주·취득 후 상장", current: true },
    { label: "PR-2", desc: "비상장·평가·시기별 연혁", current: false },
    { label: "PR-3", desc: "다자산·가산세·신고서", current: false },
    { label: "후속", desc: "§97의2·국외전출세·해외주식", current: false },
  ];

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-5 py-4">
      <p className="text-sm font-semibold text-sky-800 mb-3">구현 로드맵</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stages.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border px-3 py-2 text-center ${
              s.current
                ? "border-sky-400 bg-sky-100 text-sky-800"
                : "border-sky-200 bg-white text-sky-600 opacity-60"
            }`}
          >
            <p className="text-xs font-bold">{s.label}</p>
            <p className="text-xs mt-0.5">{s.desc}</p>
            {s.current && (
              <span className="mt-1 inline-block text-xs bg-sky-400 text-white px-1 rounded">현재</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
