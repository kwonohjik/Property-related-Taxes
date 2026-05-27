"use client";

/**
 * BesshiForm4Buppyo3PrintView — 별지 제4호 부표3 비상장주식 평가서 (5쪽 PDF 출력 orchestrator)
 *
 * 정책:
 *   - feedback_print_only_css_toggle: 인쇄 시 자동 펼침 (hidden print:block)
 *   - besshi-form-replica: testid 동결 (data-testid + data-besshi-cell 이중)
 *   - feedback_800line_split_export_preservation: 외부 default export 보존
 *
 * 별지 사례 6 5쪽 구성 (제3쪽 미사용 — N-5 후속):
 *   제1쪽 — 1.평가대상 + 2.순자산 단독 + 3.1주당 가액 (Page1CoverSection)
 *   제2쪽 — 4.순자산가액 (Page2NetAssetTable)
 *   제4쪽 — 5.평가차액 (Page4ValuationDeltaTable, evaluationDeltaRows 있을 때만)
 *   제5쪽 — 6.영업권 (Page5GoodwillTable)
 *   제6쪽 — 7.순손익액 (Page6NetIncomeBreakdown)
 *
 * Print page-break 4곳: 제1→2 / 제2→4(제3쪽 미사용) / 제4→5 / 제5→6
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-form-full-replica.plan.md
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md
 */

import { useState } from "react";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
} from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import dynamic from "next/dynamic";
import { Page1CoverSection } from "./besshi/Page1CoverSection";
import { Page2NetAssetTable } from "./besshi/Page2NetAssetTable";
import { Page4ValuationDeltaTable } from "./besshi/Page4ValuationDeltaTable";
import { Page5GoodwillTable } from "./besshi/Page5GoodwillTable";
import { Page6NetIncomeBreakdown } from "./besshi/Page6NetIncomeBreakdown";

// PDF 다운로드 버튼은 react-pdf web-only API (PDFDownloadLink)를 사용 — SSR/jsdom 차단
const UnlistedStockBesshiPdfDownloadButton = dynamic(
  () =>
    import("./UnlistedStockBesshiPdfDownloadButton").then(
      (m) => m.UnlistedStockBesshiPdfDownloadButton,
    ),
  { ssr: false },
);

// sibling re-export — 외부 import 사이트 변경 0건 보장
export { Page1CoverSection } from "./besshi/Page1CoverSection";
export { Page2NetAssetTable } from "./besshi/Page2NetAssetTable";
export { Page4ValuationDeltaTable } from "./besshi/Page4ValuationDeltaTable";
export { Page5GoodwillTable } from "./besshi/Page5GoodwillTable";
export { Page6NetIncomeBreakdown } from "./besshi/Page6NetIncomeBreakdown";

export interface BesshiForm4Buppyo3PrintViewProps {
  input: UnlistedStockValuationInput;
}

/**
 * Date 정규화 (R-3 / F-2·F-3·F-8) — sessionStorage(JSON) 복원 시 Date 필드가 ISO string으로
 * 도달하면 `evaluationDate.toISOString()`(Page1CoverSection·PDF 문서·파일명)이 TypeError로 깨진다.
 * `lib/api/date-coerce.ts`의 `toDate`로 string→Date 변환(이미 Date면 idempotent, `new Date()` 직접 호출 금지).
 * F-3: `fiscalYears`는 3-튜플이므로 map 결과를 튜플 타입으로 명시 캐스팅.
 */
function normalizeBesshiInput(input: UnlistedStockValuationInput): UnlistedStockValuationInput {
  return {
    ...input,
    evaluationDate: toDate(input.evaluationDate, "evaluationDate"),
    businessStartDate: toDate(input.businessStartDate, "businessStartDate"),
    fiscalYears: input.fiscalYears.map((fy) => ({
      ...fy,
      fiscalYearEndDate: toDate(fy.fiscalYearEndDate, "fiscalYearEndDate"),
    })) as UnlistedStockValuationInput["fiscalYears"],
    capitalChanges: input.capitalChanges.map((c) => ({
      ...c,
      // changeDate는 optional — 미입력 행은 undefined 보존 (validate가 차단하므로 여기선 강제 throw 금지)
      changeDate: toOptionalDate(c.changeDate),
    })),
    // PR-L (C1): preIpoListing 날짜 정규화 — sessionStorage(JSON) 복원 시 string 도달 방어.
    //   securitiesFilingDate·listingDate가 string이면 orchestrator 윈도우 비교가 silent-false.
    preIpoListing: input.preIpoListing
      ? {
          ...input.preIpoListing,
          securitiesFilingDate:
            toOptionalDate(input.preIpoListing.securitiesFilingDate) ??
            input.preIpoListing.securitiesFilingDate,
          listingDate: toOptionalDate(input.preIpoListing.listingDate),
        }
      : undefined,
  };
}

export function BesshiForm4Buppyo3PrintView({ input }: BesshiForm4Buppyo3PrintViewProps) {
  const [open, setOpen] = useState(false);

  // F-8: 미완성 입력(날짜 공란 등)은 toDate가 throw → 원본 fallback. 어차피 아래 가드·PDF 버튼이 막음.
  let safe = input;
  try {
    safe = normalizeBesshiInput(input);
  } catch {
    safe = input;
  }

  let result: UnlistedStockValuationResult | undefined;
  try {
    if (safe.totalShares > 0 && safe.ownedShares > 0) {
      result = evaluateUnlistedStockV2(safe);
    }
  } catch {
    result = undefined;
  }

  return (
    <div className="rounded-lg border border-gray-300 bg-white print:bg-white print:border-none">
      {/* 헤더 — 토글 + PR-J PDF 다운로드 (화면 전용) */}
      <div className="flex items-center justify-between p-3 print:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="besshi-form-toggle"
          className="flex-1 text-left text-[12px] font-semibold text-gray-700 hover:text-gray-900"
        >
          📄 별지 제4호 부표3 비상장주식 평가서 (인쇄 미리보기){" "}
          <span className="text-[10px] text-gray-500">{open ? "접기" : "펼치기"}</span>
        </button>
        <UnlistedStockBesshiPdfDownloadButton input={safe} />
      </div>

      {/* @page A4 portrait — 인쇄 시 5쪽 자동 분리 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          body {
            margin: 0;
          }
        }
      `}</style>

      {/* 양식 본문 — 화면 토글 + 인쇄 자동 펼침 */}
      <div
        className={open ? "block" : "hidden print:block"}
        aria-label="비상장주식 등 평가서 (별지 제4호 부표3)"
      >
        <div
          className="p-6 print:p-0 text-black bg-white dark:bg-white dark:text-black text-[11px] font-serif print:w-full print:max-w-none"
        >
          <h1 className="text-center text-base font-bold mb-4">비상장주식 등 평가서</h1>
          <p className="text-right text-[10px] mb-2">
            평가심의위원회 운영 규정 별지 제4호 서식 부표3 (2025.07.10. 개정)
          </p>

          {/* 제1쪽 */}
          <Page1CoverSection input={safe} result={result} />

          {/* PR-L/L2: §63② 기업공개·상장신청 준비 중 평가 적용 시 ⑥ 최종평가액 반영 안내 (preparationType 분기) */}
          {result?.preIpoListingResult?.applied && (
            <p
              className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 p-1.5 mt-1 print:bg-emerald-50"
              data-testid="besshi-pre-ipo-note"
            >
              ※ ⑥ 최종 1주당 평가액은{" "}
              {result.preIpoListingResult.preparationType === "association_registration"
                ? "§63②2호(거래소 상장신청·협회 등록 준비) + 상증령 §57②"
                : "§63②1호(기업공개 준비) + 상증령 §57①"}
              에 따라 MAX(공모가격 {result.preIpoListingResult.publicOfferingPrice.toLocaleString("ko-KR")}, 보충적평가)를 반영했습니다.
            </p>
          )}

          {/* 제1쪽 → 제2쪽 break */}
          <div className="print:break-before-page" aria-hidden="true" />

          {/* 제2쪽 — 4.순자산가액 */}
          {result && (
            <Page2NetAssetTable
              raw={safe.netAssetValueRaw}
              netAssetTotal={result.netAssetTotal}
              goodwillFinal={result.goodwillCalculation.goodwillFinal}
            />
          )}

          {/* 제2쪽 → 제4쪽 break (제3쪽 미사용 — N-5 후속) */}
          <div className="print:break-before-page" aria-hidden="true" />

          {/* 제4쪽 — 5.평가차액 (조건부) */}
          <Page4ValuationDeltaTable raw={safe.netAssetValueRaw} />

          {/* 제4쪽 → 제5쪽 break */}
          <div className="print:break-before-page" aria-hidden="true" />

          {/* 제5쪽 — 6.영업권 */}
          {result && (
            <Page5GoodwillTable
              goodwill={result.goodwillCalculation}
              fiscalYearBreakdowns={result.fiscalYearBreakdowns}
              estimatedProfitApplied={result.estimatedProfitResult?.applied}
              estimatedProfitAverage={result.estimatedProfitResult?.estimatedProfitAverage}
            />
          )}

          {/* 제5쪽 → 제6쪽 break */}
          <div className="print:break-before-page" aria-hidden="true" />

          {/* 제6쪽 — 7.순손익액 */}
          {result && <Page6NetIncomeBreakdown result={result} />}

          {/* 푸터 */}
          <p className="text-center text-[9px] text-gray-600 mt-6 print:mt-12">
            ※ 본 양식은 평가심의위원회 운영규정 별지 제4호 서식 부표3을 기준으로 작성되었습니다.
            <br />
            KoreanLaw MCP 검증: 상증법 §63·시행령 §54·§55·§56·§59 + 시행규칙 §17·§17의2·§17의3·§19 (2026-05-22)
          </p>
        </div>
      </div>
    </div>
  );
}
