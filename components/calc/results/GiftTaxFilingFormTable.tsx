"use client";

/**
 * GiftTaxFilingFormTable — 증여세 신고서 양식 표
 * 별지 제10호서식 [2020.03.13. 개정]
 * "증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)"
 *
 * 좌측 컬럼: ⑰~㊱ (과세가액 → 과세표준 → 산출세액)
 * 우측 컬럼: ㊲~㊼ + 납부방법 헤더 + 신고납부 도출
 *
 * 출처: docs/02-design/features/gift-tax-filing-form-besshi-10.engine.design.md
 */

import { useState } from "react";
import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { BesshiColumn } from "@/components/calc/results/shared/BesshiRow";

interface Props {
  result: GiftTaxResult;
}

export function GiftTaxFilingFormTable({ result }: Props) {
  const [showLaw, setShowLaw] = useState(false);
  const rows = result.besshi10Rows;

  if (!rows || rows.length === 0) return null;

  const leftRows = rows.filter((r) => r.column === "left");
  const rightRows = rows.filter((r) => r.column === "right");

  return (
    <div className="rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-4 space-y-3 print:border-black">
      <header className="border-b-2 border-gray-400 dark:border-gray-600 pb-2 space-y-0.5 text-center relative">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
          증여세 신고서 양식 (별지 제10호서식 [2020.03.13. 개정])
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)
        </p>
        <button
          type="button"
          onClick={() => setShowLaw(!showLaw)}
          className="absolute top-0 right-0 text-xs text-violet-600 hover:text-violet-800 px-2 py-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 print:hidden"
        >
          {showLaw ? "조문 숨김" : "조문 표시"}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-gray-300 dark:border-gray-700">
        <BesshiColumn rows={leftRows} showLaw={showLaw} />
        <BesshiColumn rows={rightRows} showLaw={showLaw} />
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-md bg-rose-50/70 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-3 print:hidden">
          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">
            안내 사항
          </p>
          <ul className="text-xs text-rose-600 dark:text-rose-400 space-y-1 list-disc list-inside">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
