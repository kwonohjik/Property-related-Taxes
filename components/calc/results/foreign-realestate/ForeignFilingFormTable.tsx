"use client";

/**
 * 국외자산 부동산 신고서 표 — 별지 제84호서식(양도소득과세표준 신고 및 납부계산서)을 국내 부동산과 같은 격자로 보인다.
 *
 * 값 매핑은 순수 함수 `buildForeignFilingForm`이 한다(엔진 값만 읽음). 이 컴포넌트는 머리글·주석과 공용 격자(`FilingFormGrid`)만 맡는다.
 * 선택 출력 leaf `form-table`의 본문 — 감싸기(`PrintSection`)는 결과 카드가 한다.
 */
import { FilingFormGrid } from "@/components/calc/results/transfer/FilingFormGrid";
import { TONE } from "@/components/calc/shared/tones";
import { cn } from "@/lib/utils";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { FOREIGN_FILING_SUBTITLE, buildForeignFilingForm, type ForeignFilingMeta } from "./foreign-filing-form";

export function ForeignFilingFormTable({
  result,
  meta,
}: {
  result: ForeignRealEstateResult;
  /** 자산별(입력 순서) 소재지국·소재지 표시값 — 없으면 해당 칸은 비운다 */
  meta?: ForeignFilingMeta;
}) {
  const form = buildForeignFilingForm(result, meta);
  return (
    <div
      data-testid="foreign-filing-form"
      data-print-section="foreign-form-table"
      className="rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black"
    >
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="px-4 py-3 border-b border-slate-300 bg-slate-100 dark:bg-slate-800 print:bg-white">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">신고서 양식 — 국외자산 부동산</h3>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-caption font-bold", TONE.sky.chip)}>
                별지 제84호서식
              </span>
            </div>
            <p className="text-caption text-slate-600 dark:text-slate-400 mt-0.5">
              {FOREIGN_FILING_SUBTITLE}
            </p>
          </div>
          <FilingFormGrid columns={form.columns} rows={form.rows} itemColPx={230} dataColPx={150} wrapText />
        </div>
      </div>
      <div
        data-testid="foreign-filing-notices"
        className="px-3 py-1.5 border-t border-slate-200 dark:border-slate-700 text-caption text-slate-600 dark:text-slate-400 leading-snug whitespace-normal"
      >
        {form.notices.map((n) => (
          <p key={n}>※ {n}</p>
        ))}
      </div>
    </div>
  );
}
