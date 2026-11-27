"use client";

/**
 * ForeignRealEstateResultCard — 국외자산 부동산 양도소득세 결과 카드 (소득세법 §118의2~§118의8) · ⑦ 동기화 지점.
 *
 * 구성(선택 출력 leaf): form-table(별지 제84호서식 신고서 표) · summary(총 납부세액) · asset-gain(자산별 환산·양도차익) · tax-calc(과세표준·세액·외국납부세액·지방소득세) · notices(확인 필요·적용 법령).
 * `selectedIds`를 주면 미선택 leaf가 인쇄에서만 빠진다(화면 표시 불변). 안 주면 전부 선택으로 본다.
 * 거주 5년 미만(`isLiable: false`)은 세액 0 + «납세의무 없음» 카드, 환산·양도차익은 참고로 보인다.
 */
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { flattenTransferForeignPrintIds } from "@/lib/print/transfer-foreign-print-sections";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { ForeignAssetGainSection, transferOrderOf } from "./ForeignAssetGainSection";
import { ForeignFilingFormTable } from "./ForeignFilingFormTable";
import { hasForeignFilingForm, type ForeignFilingMeta } from "./foreign-filing-form";
import { ForeignNotLiableCard, ForeignResultNotices } from "./ForeignResultNotices";
import { ForeignTaxCalcSection } from "./ForeignTaxCalcSection";
import { fmt } from "./foreign-result-parts";

const ALL_SELECTED: ReadonlySet<string> = new Set(flattenTransferForeignPrintIds());

export function ForeignRealEstateResultCard({
  result,
  selectedIds = ALL_SELECTED,
  filingMeta,
}: {
  result: ForeignRealEstateResult;
  selectedIds?: ReadonlySet<string>;
  /** 신고서 표의 소재지국·소재지 표시값(입력 쪽 값) — 없으면 그 칸은 비운다 */
  filingMeta?: ForeignFilingMeta;
}) {
  const order = transferOrderOf(result.rows);
  return (
    <div className="space-y-4" data-testid="foreign-result-card">
      {/* 납세의무 없음(거주 5년 미만)은 신고 대상이 아니라 신고서 표를 만들지 않는다 */}
      {hasForeignFilingForm(result) && (
        <PrintSection id="form-table" selectedIds={selectedIds}>
          <ForeignFilingFormTable result={result} meta={filingMeta} />
        </PrintSection>
      )}

      <PrintSection id="summary" selectedIds={selectedIds}>
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/40">
          <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">국외자산 부동산 양도소득세 결과</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-300" data-testid="foreign-result-total">
              {fmt(result.totalTax)}
            </span>
            <span className="text-sm text-sky-700 dark:text-sky-300">총 납부세액 (소득세 + 지방소득세)</span>
          </div>
          {result.isLiable && (
            <p className="mt-1 text-xs text-muted-foreground">
              결정세액 {fmt(result.determinedTax)} + 지방소득세 {fmt(result.localIncomeTax)} · 세율 적용 시점(가장 늦은 양도일) {result.appliedLawDate}
            </p>
          )}
        </div>
        {!result.isLiable && (
          <div className="mt-3">
            <ForeignNotLiableCard result={result} />
          </div>
        )}
      </PrintSection>

      <PrintSection id="asset-gain" selectedIds={selectedIds} className="space-y-3">
        {result.rows.map((row, i) => (
          <ForeignAssetGainSection
            key={row.id}
            row={row}
            index={i}
            total={result.rows.length}
            order={order[i]}
            liable={result.isLiable}
            defaultOpen={i === 0 || result.rows.length <= 3}
          />
        ))}
      </PrintSection>

      {result.isLiable && (
        <PrintSection id="tax-calc" selectedIds={selectedIds}>
          <ForeignTaxCalcSection result={result} />
        </PrintSection>
      )}

      <PrintSection id="notices" selectedIds={selectedIds}>
        <ForeignResultNotices result={result} />
      </PrintSection>
    </div>
  );
}
